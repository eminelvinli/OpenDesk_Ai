/**
 * OpenDesk AI — Device Pairing & Auth Routes
 *
 * Handles the secure AnyDesk-style pairing flow:
 * 1. Rust client generates a 6-digit code and registers it with the backend.
 * 2. User enters the code in the web dashboard.
 * 3. Backend links the device to the user's account.
 * 4. Paired status is cached in Redis for the Go Gateway to check.
 */

import { Router, Request, Response } from 'express';
import Redis from 'ioredis';
import { Device } from '../db';

const router = Router();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,
});

redis.on('error', (err) => {
    console.error('❌ Auth Redis error:', err.message);
});

/** Pairing code TTL: 10 minutes. */
const PAIRING_TTL_SECONDS = 600;

/**
 * POST /api/device/register
 *
 * Called by the Rust desktop client on startup to register its pairing code.
 * Stores the code → deviceId mapping in Redis with a 10-minute TTL.
 *
 * Body: { deviceId: string, pairingCode: string, osType: string, screenBounds: {...} }
 */
router.post('/device/register', async (req: Request, res: Response): Promise<void> => {
    const { deviceId, pairingCode, osType, screenBounds } = req.body;

    if (!deviceId || !pairingCode || !osType) {
        res.status(400).json({ error: 'Missing deviceId, pairingCode, or osType' });
        return;
    }

    if (!/^\d{6}$/.test(pairingCode)) {
        res.status(400).json({ error: 'Pairing code must be exactly 6 digits' });
        return;
    }

    try {
        await redis.connect().catch(() => { /* already connected */ });

        // Store: pairingCode → device info (expires in 10 min).
        const deviceInfo = JSON.stringify({
            deviceId,
            osType,
            screenBounds: screenBounds || { width: 1920, height: 1080 },
        });
        await redis.set(`pairing:${pairingCode}`, deviceInfo, 'EX', PAIRING_TTL_SECONDS);

        console.log(`🔑 Pairing code registered: ${pairingCode} → ${deviceId}`);

        res.json({ status: 'ok', expiresIn: PAIRING_TTL_SECONDS });
    } catch (err) {
        console.error('❌ Pairing registration failed:', err);
        res.status(500).json({ error: 'Failed to register pairing code' });
    }
});

/**
 * POST /api/device/pair
 *
 * Called by the Next.js frontend when the user submits a pairing code.
 * Links the device to the user's account in MongoDB and caches the pairing
 * status in Redis for the Go Gateway to check.
 *
 * Body: { userId: string, pairingCode: string }
 */
router.post('/device/pair', async (req: Request, res: Response): Promise<void> => {
    const { userId, pairingCode } = req.body;

    if (!userId || typeof userId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid userId' });
        return;
    }

    if (!pairingCode || !/^\d{6}$/.test(pairingCode)) {
        res.status(400).json({ error: 'Pairing code must be exactly 6 digits' });
        return;
    }

    try {
        await redis.connect().catch(() => { /* already connected */ });

        // Look up the pairing code in Redis.
        const deviceInfoRaw = await redis.get(`pairing:${pairingCode}`);
        if (!deviceInfoRaw) {
            res.status(404).json({ error: 'Invalid or expired pairing code' });
            return;
        }

        const deviceInfo = JSON.parse(deviceInfoRaw) as {
            deviceId: string;
            osType: string;
            screenBounds: { width: number; height: number };
        };

        // Upsert the Device document in MongoDB.
        const device = await Device.findOneAndUpdate(
            { deviceId: deviceInfo.deviceId },
            {
                userId,
                deviceId: deviceInfo.deviceId,
                name: `${deviceInfo.osType} Desktop`,
                osType: deviceInfo.osType,
                screenBounds: deviceInfo.screenBounds,
                isOnline: true,
                pairingCode: null, // Clear after successful pairing.
            },
            { upsert: true, new: true }
        );

        // Cache the paired status in Redis for the Go Gateway.
        await redis.set(`paired:${deviceInfo.deviceId}`, userId, 'EX', 86400); // 24h TTL

        // Delete the used pairing code.
        await redis.del(`pairing:${pairingCode}`);

        console.log(`✅ Device ${deviceInfo.deviceId} paired with user ${userId}`);

        res.json({
            status: 'ok',
            deviceId: device.deviceId,
            name: device.name,
            osType: device.osType,
        });
    } catch (err) {
        console.error('❌ Pairing failed:', err);
        res.status(500).json({ error: 'Pairing failed' });
    }
});

/**
 * GET /api/device/check/:deviceId
 *
 * Called by the Go Gateway to verify if a device is paired.
 * Returns { paired: true, userId } or { paired: false }.
 */
router.get('/device/check/:deviceId', async (req: Request<{ deviceId: string }>, res: Response): Promise<void> => {
    const deviceId = req.params.deviceId;

    try {
        await redis.connect().catch(() => { /* already connected */ });

        // Check Redis cache first (fast path).
        const cachedUserId = await redis.get(`paired:${deviceId}`);
        if (cachedUserId) {
            res.json({ paired: true, userId: cachedUserId });
            return;
        }

        // Fall back to MongoDB.
        const device = await Device.findOne({ deviceId });
        if (device && device.userId) {
            // Re-cache for future checks.
            await redis.set(`paired:${deviceId}`, device.userId.toString(), 'EX', 86400);
            res.json({ paired: true, userId: device.userId.toString() });
            return;
        }

        res.json({ paired: false });
    } catch (err) {
        console.error('❌ Pairing check failed:', err);
        res.json({ paired: false });
    }
});

export default router;
