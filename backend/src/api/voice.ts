/**
 * OpenDesk AI — Voice Command Transcription Endpoint
 *
 * Accepts audio uploads (webm/wav/mp3) from the Next.js frontend,
 * transcribes them via the OpenAI Whisper API, then automatically
 * enqueues the transcribed text as a new agent task via BullMQ.
 *
 * Route: POST /api/tasks/voice
 * Content-Type: multipart/form-data
 *   fields: audio (file), deviceId (string), userId (string)
 */

import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import os from 'os';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import { agentTaskQueue } from '../jobs/queue';
import { TaskLog } from '../db';

const router = Router();

// ---------------------------------------------------------------------------
// Multer — store audio in OS temp dir, max 25 MB (OpenAI Whisper limit)
// ---------------------------------------------------------------------------

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback
    ) => {
        const allowed = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'];
        if (
            allowed.includes(file.mimetype) ||
            /\.(webm|wav|mp3|mp4|ogg|m4a)$/i.test(file.originalname)
        ) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported audio format: ${file.mimetype}`));
        }
    },
});

// ---------------------------------------------------------------------------
// POST /api/tasks/voice
// ---------------------------------------------------------------------------

router.post('/', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
    const multerFile = (req as Request & { file?: Express.Multer.File }).file;

    if (!multerFile) {
        res.status(400).json({ error: 'No audio file provided. Send field name "audio".' });
        return;
    }

    const { deviceId, userId } = req.body as { deviceId?: string; userId?: string };

    if (!deviceId || !userId) {
        fs.unlinkSync(multerFile.path);
        res.status(400).json({ error: 'deviceId and userId are required fields.' });
        return;
    }

    const tmpPath = multerFile.path;
    const ext = multerFile.originalname.split('.').pop() ?? 'webm';
    const namedPath = `${tmpPath}.${ext}`;

    try {
        fs.renameSync(tmpPath, namedPath);

        console.log(`[Voice] Received audio ${multerFile.size} bytes, device=${deviceId}`);

        // ── Whisper transcription ──────────────────────────────────────────
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const transcriptionResponse = await client.audio.transcriptions.create({
            file: fs.createReadStream(namedPath),
            model: 'whisper-1',
            language: 'en',
            response_format: 'text',
        });

        // Whisper returns a plain string when response_format is 'text'.
        const goal = (transcriptionResponse as unknown as string).trim();

        if (!goal) {
            res.status(422).json({
                error: 'Whisper returned empty transcription. Please speak clearly and try again.',
            });
            return;
        }

        console.log(`[Voice] Transcribed: "${goal}" (device=${deviceId})`);

        // ── Create TaskLog + enqueue ──────────────────────────────────────
        const taskLog = await TaskLog.create({
            userId: new mongoose.Types.ObjectId(userId),
            deviceId,
            goal,
            status: 'queued',
        });

        const taskLogId = (taskLog._id as mongoose.Types.ObjectId).toString();

        await agentTaskQueue.add(
            'execute-agent-loop',
            { taskLogId, userId, deviceId, goal },
            { jobId: `task-${taskLogId}` }
        );

        console.log(`[Voice] Task queued: taskLogId=${taskLogId}, goal="${goal}"`);

        res.status(202).json({
            message: 'Voice command received and task enqueued.',
            transcription: goal,
            taskLogId,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown transcription error';
        console.error(`[Voice] Failed: ${message}`);
        res.status(500).json({ error: `Voice processing failed: ${message}` });
    } finally {
        try { fs.unlinkSync(namedPath); } catch { /* already removed */ }
    }
});

export default router;
