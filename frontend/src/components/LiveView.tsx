'use client';

import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AgentStatus {
    state: string;
    action?: string;
    iteration?: number;
}

interface LiveViewProps {
    deviceId: string;
}

/**
 * Live View component: displays the real-time screen of the active device.
 *
 * Connects to the backend SSE endpoint at /api/stream/:deviceId.
 * Renders the base64 screenshot inside an <img> tag and shows
 * agent status overlay (thinking, acting, etc.).
 */
export default function LiveView({ deviceId }: LiveViewProps) {
    const [screenSrc, setScreenSrc] = useState<string | null>(null);
    const [screenBounds, setScreenBounds] = useState({ width: 0, height: 0 });
    const [connected, setConnected] = useState(false);
    const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
    const [lastUpdate, setLastUpdate] = useState<number>(0);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const url = `${API_URL}/api/stream/${deviceId}`;
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
            setConnected(true);
        };

        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'connected') {
                    setConnected(true);
                } else if (data.type === 'observation') {
                    setScreenSrc(data.screenBase64);
                    setScreenBounds(data.screenBounds);
                    setLastUpdate(data.timestamp);
                } else if (data.type === 'agent_status') {
                    setAgentStatus({
                        state: data.state,
                        action: data.action,
                        iteration: data.iteration,
                    });
                }
            } catch {
                // Ignore parse errors.
            }
        };

        es.onerror = () => {
            setConnected(false);
        };

        return () => {
            es.close();
        };
    }, [deviceId]);

    return (
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                        Live View
                    </h3>
                    <span className="text-xs text-slate-500">{deviceId}</span>
                </div>

                <div className="flex items-center gap-2">
                    <span
                        className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                            }`}
                    />
                    <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                        {connected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>

            {/* Screen display */}
            <div className="relative bg-black aspect-video flex items-center justify-center">
                {screenSrc ? (
                    <img
                        src={screenSrc}
                        alt={`Live screen of device ${deviceId}`}
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="text-center text-slate-500">
                        <div className="text-4xl mb-3">🖥️</div>
                        <p className="text-sm">Waiting for device stream...</p>
                        <p className="text-xs mt-1 text-slate-600">
                            Make sure the desktop client is running
                        </p>
                    </div>
                )}

                {/* Agent status overlay */}
                {agentStatus && (
                    <div className="absolute bottom-4 left-4 right-4">
                        <div className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg px-4 py-3 flex items-center gap-3">
                            {agentStatus.state === 'thinking' && (
                                <>
                                    <span className="inline-block w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                    <span className="text-sm text-blue-400 font-medium">
                                        Agent is thinking...
                                    </span>
                                </>
                            )}
                            {agentStatus.state === 'acting' && (
                                <>
                                    <span className="text-yellow-400">⚡</span>
                                    <span className="text-sm text-yellow-400 font-medium">
                                        Executing: {agentStatus.action}
                                    </span>
                                </>
                            )}
                            {agentStatus.state === 'done' && (
                                <>
                                    <span className="text-emerald-400">✅</span>
                                    <span className="text-sm text-emerald-400 font-medium">
                                        Task completed
                                    </span>
                                </>
                            )}
                            {agentStatus.state === 'stuck' && (
                                <>
                                    <span className="text-red-400">🔴</span>
                                    <span className="text-sm text-red-400 font-medium">
                                        Agent stuck — same action repeated
                                    </span>
                                </>
                            )}
                            {agentStatus.iteration && (
                                <span className="ml-auto text-xs text-slate-500">
                                    Step {agentStatus.iteration}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-2 border-t border-slate-700">
                <span className="text-xs text-slate-500">
                    {screenBounds.width > 0
                        ? `${screenBounds.width}×${screenBounds.height}`
                        : 'No signal'}
                </span>
                <span className="text-xs text-slate-600">
                    {lastUpdate > 0
                        ? `Last frame: ${new Date(lastUpdate * 1000).toLocaleTimeString()}`
                        : ''}
                </span>
            </div>
        </div>
    );
}
