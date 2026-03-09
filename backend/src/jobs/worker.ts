/**
 * OpenDesk AI — BullMQ Task Worker
 *
 * Processes jobs from the `agent-tasks` queue. Each job:
 * 1. Looks up the Device in MongoDB to verify it exists and is online.
 * 2. Updates the TaskLog status to 'running'.
 * 3. Runs the agentic loop (observe → think → act cycle).
 * 4. Updates the TaskLog with final status and action history.
 *
 * On failure, the TaskLog status is set to 'failed' with the error message.
 */

import { Worker, Job } from 'bullmq';
import { AgentTaskJobData } from './queue';
import { publishCommand } from './redis';
import { Device, TaskLog } from '../db';
import { runAgenticLoop } from '../agent/loop';
import {
    AgentActionCommand,
    DeviceObservationPayload,
    TaskState,
} from '../types';
import { createTaskLogger, generateTraceId, logger } from '../utils/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

/** Connection config for BullMQ worker (avoids ioredis version mismatch). */
const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
};

/**
 * Process a single agent task job.
 *
 * @param job - The BullMQ job containing task data.
 */
async function processAgentTask(job: Job<AgentTaskJobData>): Promise<void> {
    const { taskLogId, userId, deviceId, goal } = job.data;

    // Create a stable traceId for this entire job execution.
    const traceId = generateTraceId();
    const log = createTaskLogger(traceId, deviceId);

    log.info(`[Worker] Processing job ${job.id}`, { goal, deviceId, taskLogId, jobId: job.id });

    // 1. Verify the device exists and is online.
    const device = await Device.findOne({ deviceId });
    if (!device) {
        log.error('[Worker] Device not found', { deviceId });
        throw new Error(`Device not found: ${deviceId}`);
    }
    if (!device.isOnline) {
        log.warn('[Worker] Device is offline', { deviceId });
        throw new Error(`Device is offline: ${deviceId}`);
    }

    // 2. Update TaskLog to 'running' and persist traceId.
    const taskLog = await TaskLog.findById(taskLogId);
    if (!taskLog) {
        log.error('[Worker] TaskLog not found', { taskLogId });
        throw new Error(`TaskLog not found: ${taskLogId}`);
    }

    taskLog.status = 'running';
    taskLog.traceId = traceId;
    await taskLog.save();

    // 3. Build the TaskState for the agentic loop.
    const taskState: TaskState & { traceId: string } = {
        userId,
        deviceId,
        goal,
        status: 'running',
        actionHistory: [],
        createdAt: taskLog.createdAt,
        updatedAt: new Date(),
        scheduledAt: taskLog.scheduledAt,
        errorMessage: null,
        iterationCount: 0,
        maxIterations: taskLog.maxIterations,
        traceId,
    };

    // 4. Run the agentic loop with the bound logger.
    const finalState = await runAgenticLoop(
        taskState,
        createObservationGetter(deviceId),
        createActionDispatcher(deviceId),
        log
    );

    // 5. Update TaskLog with final state + token usage.
    taskLog.status = finalState.status;
    taskLog.actionHistory = finalState.actionHistory;
    taskLog.iterationCount = finalState.iterationCount;
    taskLog.errorMessage = finalState.errorMessage;

    log.info(`[Worker] Task completed`, {
        status: finalState.status,
        iterations: finalState.iterationCount,
        taskLogId,
    });

    await taskLog.save();
}

/**
 * Create an observation getter for a specific device.
 *
 * In production, this would listen to a Redis Pub/Sub channel where
 * the Go Gateway publishes observations from the Rust client.
 * For now, returns a mock observation after a short delay.
 */
function createObservationGetter(
    deviceId: string
): () => Promise<DeviceObservationPayload> {
    return async (): Promise<DeviceObservationPayload> => {
        // TODO: Subscribe to Redis channel `observations:${deviceId}`
        // and resolve when the next observation arrives.
        // For now, simulate waiting for a screenshot.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        return {
            deviceId,
            timestamp: Math.floor(Date.now() / 1000),
            screenBase64: 'data:image/jpeg;base64,/9j/mock-screenshot-data',
            screenBounds: { width: 1920, height: 1080 },
        };
    };
}

/**
 * Create an action dispatcher for a specific device.
 *
 * Publishes the AgentActionCommand to Redis, where the Go Gateway
 * picks it up and forwards it to the correct Rust client.
 */
function createActionDispatcher(
    deviceId: string
): (command: AgentActionCommand) => Promise<void> {
    return async (command: AgentActionCommand): Promise<void> => {
        await publishCommand({
            deviceId,
            command: {
                action: command.action,
                coordinates: command.coordinates,
                text: command.text,
                key: command.key,
            },
        });
    };
}

/** The BullMQ worker instance. */
export const agentTaskWorker = new Worker<AgentTaskJobData>(
    'agent-tasks',
    processAgentTask,
    {
        connection,
        concurrency: 3,
        limiter: {
            max: 10,
            duration: 60000,
        },
    }
);

// ---------------------------------------------------------------------------
// Worker Event Handlers
// ---------------------------------------------------------------------------

agentTaskWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, '✅ Job completed');
});

agentTaskWorker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, error: err.message, stack: err.stack }, '❌ Job failed');

    if (job) {
        try {
            const { taskLogId } = job.data;
            await TaskLog.findByIdAndUpdate(taskLogId, {
                status: 'failed',
                errorMessage: err.message,
            });
            logger.info({ taskLogId }, '📋 TaskLog marked as failed');
        } catch (dbErr) {
            const msg = dbErr instanceof Error ? dbErr.message : 'Unknown DB error';
            logger.error({ error: msg }, '❌ Failed to update TaskLog on failure');
        }
    }
});

agentTaskWorker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, '❌ Worker error');
});

/** Gracefully close the worker. */
export async function closeWorker(): Promise<void> {
    await agentTaskWorker.close();
}
