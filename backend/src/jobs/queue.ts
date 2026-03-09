/**
 * OpenDesk AI — BullMQ Task Queue
 *
 * Initializes the `agent-tasks` queue for scheduling immediate and
 * delayed agentic loop executions. Jobs are processed by the worker
 * in `worker.ts`.
 *
 * Uses ioredis for the Redis connection, shared with the Redis publisher.
 */

import { Queue } from 'bullmq';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

/** Connection config for BullMQ (avoids ioredis version mismatch). */
const connection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
};

/** Job data shape for agent-tasks queue. */
export interface AgentTaskJobData {
    taskLogId: string;
    userId: string;
    deviceId: string;
    goal: string;
}

/** The main BullMQ queue for scheduling agentic loop tasks. */
export const agentTaskQueue = new Queue<AgentTaskJobData>('agent-tasks', {
    connection,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            count: 100,
        },
        removeOnFail: {
            count: 500,
        },
    },
});

/**
 * Add an immediate or delayed task to the queue.
 *
 * @param data - The task data (userId, deviceId, goal, taskLogId).
 * @param delay - Optional delay in milliseconds before processing.
 * @returns The BullMQ Job instance with its assigned ID.
 */
export async function enqueueTask(
    data: AgentTaskJobData,
    delay?: number
): Promise<{ jobId: string }> {
    const job = await agentTaskQueue.add('execute-agent-loop' as never, data, {
        delay: delay || 0,
        jobId: `task-${data.taskLogId}`,
    });

    const status = delay ? `scheduled (${delay}ms delay)` : 'immediate';
    console.log(`📋 Task queued [${status}]: "${data.goal}" → device ${data.deviceId} (job: ${job.id})`);

    return { jobId: job.id ?? data.taskLogId };
}

/** Gracefully close the queue connection. */
export async function closeQueue(): Promise<void> {
    await agentTaskQueue.close();
}
