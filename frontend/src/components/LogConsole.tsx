'use client';

/**
 * LogConsole — Real-time agent log stream component.
 *
 * Connects to the SSE stream for the active device and renders
 * structured log events as they arrive. Log lines are colour-coded
 * by severity and auto-scroll to the bottom.
 *
 * Events consumed: type === 'agent_log' | 'agent_status'
 */

import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogLine {
    id: number;
    timestamp: number;
    level: LogLevel;
    msg: string;
    traceId?: string;
    data?: Record<string, unknown>;
    isStatus?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<LogLevel, string> = {
    trace: 'text-slate-500',
    debug: 'text-slate-400',
    info: 'text-sky-300',
    warn: 'text-amber-400',
    error: 'text-rose-400',
    fatal: 'text-rose-600',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
    trace: 'TRC',
    debug: 'DBG',
    info: 'INF',
    warn: 'WRN',
    error: 'ERR',
    fatal: 'FTL',
};

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 2,
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogConsoleProps {
    deviceId: string;
}

let lineId = 0;

export default function LogConsole({ deviceId }: LogConsoleProps) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const [connected, setConnected] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new lines.
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    // SSE connection.
    useEffect(() => {
        const source = new EventSource(`${API_URL}/api/stream/${deviceId}`);

        source.addEventListener('open', () => setConnected(true));

        source.addEventListener('message', (e) => {
            try {
                const data = JSON.parse(e.data);

                if (data.type === 'agent_log') {
                    setLines((prev) => [
                        ...prev.slice(-500), // Keep last 500 lines to avoid memory issues.
                        {
                            id: lineId++,
                            timestamp: data.timestamp ?? Date.now(),
                            level: (data.level || 'info') as LogLevel,
                            msg: data.msg,
                            traceId: data.traceId,
                            data: data.data,
                        },
                    ]);
                } else if (data.type === 'agent_status') {
                    setLines((prev) => [
                        ...prev.slice(-500),
                        {
                            id: lineId++,
                            timestamp: Date.now(),
                            level: data.state === 'error' || data.state === 'interrupted' ? 'warn' : 'info',
                            msg: `[Status] ${data.state}${data.action ? `: ${data.action}` : ''}${data.iteration ? ` (iter ${data.iteration})` : ''}`,
                            isStatus: true,
                        },
                    ]);
                }
            } catch {
                // Ignore malformed SSE frames.
            }
        });

        source.addEventListener('error', () => {
            setConnected(false);
        });

        return () => source.close();
    }, [deviceId]);

    function clearLogs() {
        setLines([]);
    }

    return (
        <div className="flex flex-col h-full bg-[#0b0e1a] border border-slate-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span
                        className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}
                    />
                    <span className="text-xs font-mono font-semibold text-slate-300 tracking-wider uppercase">
                        Console Output
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 font-mono">{lines.length} lines</span>
                    <button
                        onClick={clearLogs}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-0.5 rounded border border-slate-700/50 hover:border-slate-600"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Log lines */}
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-xs">
                {lines.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-600 italic">Waiting for agent logs...</p>
                    </div>
                ) : (
                    lines.map((line) => (
                        <div
                            key={line.id}
                            className={`flex gap-2 leading-5 ${line.isStatus ? 'border-l-2 border-slate-700 pl-2 my-1' : ''}`}
                        >
                            {/* Timestamp */}
                            <span className="text-slate-600 flex-shrink-0 select-none">
                                {formatTime(line.timestamp)}
                            </span>

                            {/* Level badge */}
                            <span
                                className={`flex-shrink-0 font-bold select-none ${LEVEL_COLORS[line.level]}`}
                            >
                                {LEVEL_LABELS[line.level]}
                            </span>

                            {/* Message */}
                            <span className={`${line.isStatus ? 'text-slate-400' : 'text-slate-200'} break-all`}>
                                {line.msg}
                            </span>

                            {/* Inline data preview (compact) */}
                            {line.data && Object.keys(line.data).length > 0 && (
                                <span className="text-slate-600 break-all ml-1">
                                    {Object.entries(line.data)
                                        .filter(([, v]) => v !== undefined && v !== null)
                                        .slice(0, 3)
                                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                                        .join(' ')}
                                </span>
                            )}
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
