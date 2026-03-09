/**
 * OpenDesk AI — Live Stream API Routes
 *
 * Server-Sent Events (SSE) endpoint for streaming real-time device
 * observations to the Next.js frontend. The frontend connects via
 * EventSource and receives base64 screenshots as they arrive.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * In-memory store of the latest observation per device.
 * Updated by the observation ingestion pipeline.
 * In production, this would be backed by Redis Pub/Sub.
 */
interface LatestObservation {
    deviceId: string;
    timestamp: number;
    screenBase64: string;
    screenBounds: { width: number; height: number };
}

const latestObservations = new Map<string, LatestObservation>();
const sseClients = new Map<string, Set<Response>>();

/**
 * Update the latest observation for a device and notify all SSE clients.
 * Called by the observation ingestion pipeline.
 */
export function pushObservation(observation: LatestObservation): void {
    latestObservations.set(observation.deviceId, observation);

    const clients = sseClients.get(observation.deviceId);
    if (clients) {
        const data = JSON.stringify({
            type: 'observation',
            deviceId: observation.deviceId,
            timestamp: observation.timestamp,
            screenBase64: observation.screenBase64,
            screenBounds: observation.screenBounds,
        });

        for (const res of clients) {
            res.write(`data: ${data}\n\n`);
        }
    }
}

/**
 * Push an agent status update to SSE clients watching a device.
 */
export function pushAgentStatus(
    deviceId: string,
    status: { state: string; action?: string; iteration?: number }
): void {
    const clients = sseClients.get(deviceId);
    if (clients) {
        const data = JSON.stringify({ type: 'agent_status', deviceId, ...status });
        for (const res of clients) {
            res.write(`data: ${data}\n\n`);
        }
    }
}

/**
 * GET /api/stream/:deviceId
 *
 * Server-Sent Events stream for real-time device observations.
 * The frontend connects via EventSource and receives:
 * - `observation` events with base64 screenshots
 * - `agent_status` events with loop state updates
 */
router.get('/stream/:deviceId', (req: Request<{ deviceId: string }>, res: Response) => {
    const deviceId = req.params.deviceId;

    // SSE headers.
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    // Send initial connection event.
    res.write(`data: ${JSON.stringify({ type: 'connected', deviceId })}\n\n`);

    // Send the latest cached observation if available.
    const cached = latestObservations.get(deviceId);
    if (cached) {
        res.write(`data: ${JSON.stringify({ type: 'observation', ...cached })}\n\n`);
    }

    // Register this client.
    if (!sseClients.has(deviceId)) {
        sseClients.set(deviceId, new Set());
    }
    sseClients.get(deviceId)!.add(res);

    console.log(`📺 SSE client connected for device ${deviceId} (total: ${sseClients.get(deviceId)!.size})`);

    // Clean up when the client disconnects.
    req.on('close', () => {
        const clients = sseClients.get(deviceId);
        if (clients) {
            clients.delete(res);
            if (clients.size === 0) {
                sseClients.delete(deviceId);
            }
        }
        console.log(`📺 SSE client disconnected for device ${deviceId}`);
    });
});

export default router;
