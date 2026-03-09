/**
 * OpenDesk AI — API Routes
 *
 * REST endpoints consumed by the Next.js frontend.
 * All routes are prefixed with /api when mounted in index.ts.
 */

import { Router, Request, Response } from 'express';
import { publishCommand, AgentCommandEnvelope } from '../jobs/redis';
import { enqueueTask, cancelTaskForDevice } from '../jobs/queue';
import { TaskLog, Device } from '../db';
import { AgentActionType, DeviceObservationPayload } from '../types';
import { pushObservation, pushAgentStatus } from './stream';

const router = Router();

/** Valid action types for command validation. */
const VALID_ACTIONS: AgentActionType[] = [
    'mouse_move',
    'mouse_click',
    'mouse_double_click',
    'keyboard_type',
    'keyboard_press',
    'done',
];

/**
 * POST /api/command
 *
 * Send an agent action command to a specific device.
 * The command is published to Redis and routed by the Go Gateway.
 *
 * Body: { deviceId: string, command: AgentActionCommand }
 */
router.post('/command', async (req: Request, res: Response): Promise<void> => {
    const { deviceId, command } = req.body as AgentCommandEnvelope;

    if (!deviceId || typeof deviceId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid deviceId' });
        return;
    }

    if (!command || !command.action) {
        res.status(400).json({ error: 'Missing command or command.action' });
        return;
    }

    if (!VALID_ACTIONS.includes(command.action as AgentActionType)) {
        res.status(400).json({
            error: `Invalid action: ${command.action}`,
            validActions: VALID_ACTIONS,
        });
        return;
    }

    try {
        const subscribers = await publishCommand({ deviceId, command });

        res.json({
            status: 'ok',
            deviceId,
            action: command.action,
            subscribers,
        });
    } catch (err) {
        console.error('❌ Failed to publish command:', err);
        res.status(500).json({ error: 'Failed to publish command to Redis' });
    }
});

/** Request body shape for task scheduling. */
interface ScheduleTaskBody {
    userId: string;
    deviceId: string;
    goal: string;
    delay?: number;
    maxIterations?: number;
}

/**
 * POST /api/tasks/schedule
 *
 * Schedule a new agentic task for a device. Creates a TaskLog in MongoDB
 * and enqueues the job in BullMQ.
 *
 * Body: { userId, deviceId, goal, delay?, maxIterations? }
 * Returns: { taskLogId, jobId, status }
 */
router.post('/tasks/schedule', async (req: Request, res: Response): Promise<void> => {
    const { userId, deviceId, goal, delay, maxIterations } = req.body as ScheduleTaskBody;

    // Validate required fields.
    if (!userId || typeof userId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid userId' });
        return;
    }
    if (!deviceId || typeof deviceId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid deviceId' });
        return;
    }
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
        res.status(400).json({ error: 'Missing or empty goal' });
        return;
    }

    // Verify device exists.
    const device = await Device.findOne({ deviceId });
    if (!device) {
        res.status(404).json({ error: `Device not found: ${deviceId}` });
        return;
    }

    try {
        // Create TaskLog in MongoDB.
        const taskLog = new TaskLog({
            userId,
            deviceId,
            goal: goal.trim(),
            status: delay ? 'scheduled' : 'pending',
            actionHistory: [],
            scheduledAt: delay ? new Date(Date.now() + delay) : null,
            maxIterations: maxIterations || 50,
        });
        await taskLog.save();

        // Enqueue in BullMQ.
        const { jobId } = await enqueueTask(
            {
                taskLogId: taskLog._id.toString(),
                userId,
                deviceId,
                goal: goal.trim(),
            },
            delay
        );

        res.status(201).json({
            status: 'ok',
            taskLogId: taskLog._id.toString(),
            jobId,
            scheduledAt: taskLog.scheduledAt,
            message: delay
                ? `Task scheduled with ${delay}ms delay`
                : 'Task queued for immediate execution',
        });
    } catch (err) {
        console.error('❌ Failed to schedule task:', err);
        res.status(500).json({ error: 'Failed to schedule task' });
    }
});

/**
 * POST /api/observations/:deviceId
 *
 * Receives DeviceObservationPayload from the Rust desktop client.
 * Handles both normal observations (forwarded to SSE stream) and
 * "interrupted" status payloads (kill switch or mouse override).
 *
 * On interrupt: cancels the active BullMQ job, marks TaskLog as paused,
 * and pushes an agent_status SSE event so the frontend UI updates immediately.
 *
 * Body: DeviceObservationPayload (with optional `status` field)
 */
router.post(
    '/observations/:deviceId',
    async (req: Request<{ deviceId: string }>, res: Response): Promise<void> => {
        const deviceId = req.params.deviceId;
        const body = req.body as DeviceObservationPayload & { status?: string };

        if (!deviceId) {
            res.status(400).json({ error: 'Missing deviceId' });
            return;
        }

        try {
            // Check if this is an interrupted signal from the kill switch or mouse override.
            if (body.status && body.status.startsWith('interrupted:')) {
                const reason = body.status.replace('interrupted:', '');
                console.log(`🔴 Interrupted signal from ${deviceId}: ${reason}`);

                // Cancel the active job and mark TaskLog as paused.
                const cancelled = await cancelTaskForDevice(deviceId);

                // Push SSE status update so the frontend reacts immediately.
                pushAgentStatus(deviceId, {
                    state: 'interrupted',
                    action: reason,
                    iteration: 0,
                });

                res.json({
                    status: 'ok',
                    interrupted: true,
                    reason,
                    jobCancelled: cancelled,
                });
                return;
            }

            // Normal observation — forward to SSE stream for live view.
            if (body.screenBase64) {
                pushObservation({
                    deviceId,
                    timestamp: body.timestamp,
                    screenBase64: body.screenBase64,
                    screenBounds: body.screenBounds,
                });
            }

            res.json({ status: 'ok' });
        } catch (err) {
            console.error(`❌ Failed to process observation from ${deviceId}:`, err);
            res.status(500).json({ error: 'Failed to process observation' });
        }
    }
);

export default router;
