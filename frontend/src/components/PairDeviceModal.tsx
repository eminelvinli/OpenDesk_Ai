'use client';

import { useState, FormEvent } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DEV_USER_ID = '000000000000000000000001';

interface PairDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaired?: (device: { deviceId: string; name: string; osType: string }) => void;
}

/**
 * Modal for pairing a new device via 6-digit code.
 * The user enters the code displayed on their desktop client.
 */
export default function PairDeviceModal({ isOpen, onClose, onPaired }: PairDeviceModalProps) {
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    function handleDigitChange(index: number, value: string) {
        if (!/^\d?$/.test(value)) return;

        const next = [...digits];
        next[index] = value;
        setDigits(next);
        setError(null);

        // Auto-focus next input.
        if (value && index < 5) {
            const nextInput = document.getElementById(`pair-digit-${index + 1}`);
            nextInput?.focus();
        }
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            const prev = document.getElementById(`pair-digit-${index - 1}`);
            prev?.focus();
        }
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const code = digits.join('');
        if (code.length !== 6) {
            setError('Enter all 6 digits');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/api/device/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: DEV_USER_ID, pairingCode: code }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Pairing failed');
            }

            setSuccess(`Paired: ${data.name} (${data.osType})`);
            onPaired?.(data);

            // Auto-close after 2 seconds.
            setTimeout(() => {
                onClose();
                setDigits(['', '', '', '', '', '']);
                setSuccess(null);
            }, 2000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors text-xl"
                >
                    ×
                </button>

                <div className="text-center mb-6">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xl">
                        🔗
                    </div>
                    <h2 className="text-xl font-bold text-white">Pair New Device</h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Enter the 6-digit code shown on your desktop client
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* 6-digit input */}
                    <div className="flex justify-center gap-2 mb-6">
                        {digits.map((digit, i) => (
                            <input
                                key={i}
                                id={`pair-digit-${i}`}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={(e) => handleDigitChange(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                                className="w-12 h-14 bg-slate-900 border border-slate-600 rounded-lg text-center text-2xl font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                disabled={loading}
                                autoFocus={i === 0}
                            />
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 text-center">
                            {error}
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400 text-center">
                            ✅ {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || digits.some((d) => !d)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Pairing...
                            </>
                        ) : (
                            'Pair Device'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
