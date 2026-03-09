"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opendesk';
/** Global middleware */
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
/** Health check endpoint */
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'opendesk-backend',
        timestamp: Date.now(),
        mongodb: mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
});
/**
 * Connect to MongoDB and start the Express server.
 * Exits gracefully on connection failure.
 */
async function start() {
    try {
        await mongoose_1.default.connect(MONGODB_URI);
        console.log(`✅ MongoDB connected: ${MONGODB_URI}`);
        app.listen(PORT, () => {
            console.log(`🧠 OpenDesk AI Backend running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
/** Graceful shutdown */
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down...');
    await mongoose_1.default.disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down...');
    await mongoose_1.default.disconnect();
    process.exit(0);
});
start();
exports.default = app;
//# sourceMappingURL=index.js.map