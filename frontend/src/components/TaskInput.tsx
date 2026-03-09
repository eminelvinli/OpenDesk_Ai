'use client';

import { useState, FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Dummy user/device IDs for development. */
const DEV_USER_ID = '000000000000000000000001';
const DEV_DEVICE_ID = 'dev-rust-001';

interface TaskInputProps {
    onTaskStarted?: (taskLogId: string) => void;
}

/**
 * Task input component: text area for the goal + "Run Now" / "Schedule" buttons.
 * Calls POST /api/tasks/schedule on the Node.js backend.
 */
export default function TaskInput({ onTaskStarted }: TaskInputProps) {
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    async function handleSubmit(e: FormEvent, delay?: number) {
        e.preventDefault();
        if (!goal.trim()) return;

        setLoading(true);
        setStatus(null);

        try {
            const res = await fetch(`${API_URL}/api/tasks/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: DEV_USER_ID,
                    deviceId: DEV_DEVICE_ID,
                    goal: goal.trim(),
                    delay,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to schedule task');
            }

            setStatus({
                type: 'success',
                message: delay
                    ? `Task scheduled (${delay / 1000}s delay) — Job: ${data.jobId}`
                    : `Task queued — Job: ${data.jobId}`,
            });
            setGoal('');
            onTaskStarted?.(data.taskLogId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setStatus({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                New Task
            </h3>

            <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
                <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Describe what the AI should do, e.g. &quot;Open Chrome and search for the weather in New York&quot;"
                    className="w-full h-28 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                    disabled={loading}
                />

                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={loading || !goal.trim()}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>▶ Run Now</>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={(e) => handleSubmit(e, 30000)}
                        disabled={loading || !goal.trim()}
                        className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-all duration-200"
                    >
                        ⏰ Schedule (30s)
                    </button>
                </div>
            </form>

            {status && (
                <div
                    className={`mt-4 px-4 py-3 rounded-lg text-sm ${status.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/30 text-red-400'
                        }`}
                >
                    {status.message}
                </div>
            )}
        </div>
    );
}
