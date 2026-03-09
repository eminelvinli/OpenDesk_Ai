/**
 * OpenDesk AI — Redis Publisher
 *
 * Publishes agent action commands to the `agent_commands` Redis channel.
 * The Go Gateway subscribes to this channel and routes commands to the
 * correct Rust desktop client via WebSocket.
 */

import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

/** Shared Redis publisher instance. */
const publisher = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

publisher.on('connect', () => {
    console.log('✅ Redis publisher connected');
});

publisher.on('error', (err) => {
    console.error('❌ Redis publisher error:', err.message);
});

/**
 * Envelope shape published to the `agent_commands` channel.
 * The Go Gateway parses this and routes by deviceId.
 */
export interface AgentCommandEnvelope {
    deviceId: string;
    command: {
        action: string;
        coordinates: { x: number; y: number } | null;
        text: string | null;
        key: string | null;
    };
}

/**
 * Publish an agent command to Redis for the Go Gateway to route.
 *
 * @param envelope - The command envelope with deviceId and action payload.
 * @returns The number of subscribers that received the message.
 */
export async function publishCommand(envelope: AgentCommandEnvelope): Promise<number> {
    await publisher.connect().catch(() => {
        // Already connected or reconnecting — ioredis handles this.
    });

    const payload = JSON.stringify(envelope);
    const result = await publisher.publish('agent_commands', payload);

    console.log(`📤 Command published for device ${envelope.deviceId} (${result} subscribers)`);
    return result;
}

/** Connect the Redis publisher (call during server startup). */
export async function connectRedis(): Promise<void> {
    await publisher.connect();
}

/** Disconnect the Redis publisher (call during graceful shutdown). */
export async function disconnectRedis(): Promise<void> {
    await publisher.disconnect();
}

export default publisher;
