/**
 * OpenDesk AI — Structured Logger
 *
 * A pino-based logger that supports:
 * - Per-task trace IDs for correlating all log lines in a single agent run
 * - Structured JSON output (machine-readable in production)
 * - Pretty-printed output in development
 * - All log lines are also pushed to SSE clients via pushLog()
 *   so the frontend Console Output tab can display them live
 *
 * Usage:
 *   import { createTaskLogger } from '../utils/logger';
 *   const log = createTaskLogger(traceId, deviceId);
 *   log.info({ iteration: 1 }, 'Evaluating next step');
 */

import pino from 'pino';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Base Logger Configuration
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== 'production';

/** Root pino logger — used for server-level events (startup, shutdown, etc). */
export const logger = pino({
    name: 'opendesk-backend',
    level: process.env.LOG_LEVEL || 'info',
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
                messageFormat: '[{service}] {msg}',
            },
        },
    }),
    base: { service: 'backend' },
});

// ---------------------------------------------------------------------------
// Task-scoped Logger with TraceId
// ---------------------------------------------------------------------------

/** Log level for structured output. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Structure of a log event pushed to SSE clients. */
export interface LogEvent {
    traceId: string;
    deviceId: string;
    level: LogLevel;
    msg: string;
    timestamp: number;
    data?: Record<string, unknown>;
}

/** Import pushLog lazily to avoid circular dependency with stream.ts. */
let _pushLog: ((deviceId: string, event: LogEvent) => void) | null = null;

export function setPushLogFn(fn: (deviceId: string, event: LogEvent) => void): void {
    _pushLog = fn;
}

/**
 * Create a task-scoped child logger bound to a specific traceId and deviceId.
 *
 * All messages logged through this logger are:
 * 1. Written to stdout via pino (structured JSON / pretty-printed)
 * 2. Pushed to frontend SSE clients via pushLog() for real-time console display
 *
 * @param traceId - Unique identifier for this task execution run.
 * @param deviceId - The device this task is running on.
 * @returns A bound logger with helper methods matching the LogLevel type.
 */
export function createTaskLogger(traceId: string, deviceId: string) {
    const child = logger.child({ traceId, deviceId });

    function emit(level: LogLevel, msg: string, data?: Record<string, unknown>) {
        // 1. Pino structured log.
        child[level]({ ...data }, msg);

        // 2. Push to SSE stream for frontend console.
        if (_pushLog) {
            _pushLog(deviceId, {
                traceId,
                deviceId,
                level,
                msg,
                timestamp: Date.now(),
                data,
            });
        }
    }

    return {
        traceId,
        deviceId,
        trace: (msg: string, data?: Record<string, unknown>) => emit('trace', msg, data),
        debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
        info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
        warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
        error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
        fatal: (msg: string, data?: Record<string, unknown>) => emit('fatal', msg, data),
    };
}

/** Type alias for the task logger returned by createTaskLogger(). */
export type TaskLogger = ReturnType<typeof createTaskLogger>;

// ---------------------------------------------------------------------------
// TraceId Generation
// ---------------------------------------------------------------------------

/**
 * Generate a short, readable trace ID for a task execution.
 * Format: first 8 chars of a UUID, e.g. "a1b2c3d4"
 */
export function generateTraceId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 12);
}
