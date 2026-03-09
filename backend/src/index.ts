import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opendesk';

/** Global middleware */
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/** Health check endpoint */
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'opendesk-backend',
        timestamp: Date.now(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
});

/**
 * Connect to MongoDB and start the Express server.
 * Exits gracefully on connection failure.
 */
async function start(): Promise<void> {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log(`✅ MongoDB connected: ${MONGODB_URI}`);

        app.listen(PORT, () => {
            console.log(`🧠 OpenDesk AI Backend running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

/** Graceful shutdown */
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down...');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down...');
    await mongoose.disconnect();
    process.exit(0);
});

start();

export default app;
