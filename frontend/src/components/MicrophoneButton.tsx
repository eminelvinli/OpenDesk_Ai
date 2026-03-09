'use client';

/**
 * MicrophoneButton — Voice command recorder component.
 *
 * Uses the browser's MediaRecorder API to record audio, then POSTs
 * the audio blob to POST /api/tasks/voice for Whisper transcription.
 *
 * States:
 *  idle       → shows microphone icon, click to start recording
 *  recording  → pulsing red ring, click to stop and submit
 *  processing → spinner while waiting for transcription
 *  error      → brief error flash, resets to idle
 */

import { useCallback, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_RECORDING_MS = 30_000; // hard limit: 30 seconds

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

interface MicrophoneButtonProps {
    deviceId: string;
    userId: string;
    onTranscribed?: (text: string, taskLogId: string) => void;
    onError?: (message: string) => void;
}

export default function MicrophoneButton({
    deviceId,
    userId,
    onTranscribed,
    onError,
}: MicrophoneButtonProps) {
    const [state, setState] = useState<RecordingState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<BlobPart[]>([]);
    const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Start recording ─────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks.current = [];

            // Prefer webm/opus (Chromium), fall back to whatever the browser supports.
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mediaRecorder.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.current.push(e.data);
            };

            recorder.onstop = async () => {
                // Stop all tracks to release the microphone indicator.
                stream.getTracks().forEach((t) => t.stop());

                const blob = new Blob(audioChunks.current, {
                    type: mimeType || 'audio/webm',
                });
                await submitAudio(blob, mimeType);
            };

            recorder.start(250); // collect chunks every 250ms
            setState('recording');

            // Auto-stop after max duration.
            autoStopTimer.current = setTimeout(stopRecording, MAX_RECORDING_MS);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Microphone access denied';
            showError(msg);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stop recording ───────────────────────────────────────────────────────
    const stopRecording = useCallback(() => {
        if (autoStopTimer.current) {
            clearTimeout(autoStopTimer.current);
            autoStopTimer.current = null;
        }
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.stop();
            setState('processing');
        }
    }, []);

    // ── Submit audio to backend ──────────────────────────────────────────────
    const submitAudio = async (blob: Blob, mimeType: string) => {
        try {
            const ext = mimeType.includes('webm') ? 'webm' : 'wav';
            const formData = new FormData();
            formData.append('audio', blob, `voice-command.${ext}`);
            formData.append('deviceId', deviceId);
            formData.append('userId', userId);

            const res = await fetch(`${API_URL}/api/tasks/voice`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                showError(data.error || 'Transcription failed');
                return;
            }

            setState('idle');
            onTranscribed?.(data.transcription, data.taskLogId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Network error';
            showError(msg);
        }
    };

    const showError = (msg: string) => {
        setErrorMsg(msg);
        setState('error');
        onError?.(msg);
        setTimeout(() => setState('idle'), 3000);
    };

    const handleClick = () => {
        if (state === 'idle') startRecording();
        else if (state === 'recording') stopRecording();
    };

    // ── Render ───────────────────────────────────────────────────────────────
    const isDisabled = state === 'processing' || state === 'error';

    return (
        <div className="flex flex-col items-center gap-1">
            <button
                onClick={handleClick}
                disabled={isDisabled}
                title={
                    state === 'idle' ? 'Click to record voice command'
                        : state === 'recording' ? 'Click to stop and submit'
                            : state === 'processing' ? 'Transcribing…'
                                : errorMsg
                }
                className={`
                    relative w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                    ${state === 'recording'
                        ? 'bg-rose-500 hover:bg-rose-600 focus-visible:ring-rose-400 shadow-lg shadow-rose-500/30'
                        : state === 'processing'
                            ? 'bg-slate-700 cursor-wait'
                            : state === 'error'
                                ? 'bg-amber-600 cursor-not-allowed'
                                : 'bg-slate-700 hover:bg-slate-600 focus-visible:ring-slate-500'
                    }
                `}
            >
                {/* Pulsing ring during recording */}
                {state === 'recording' && (
                    <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-40" />
                )}

                {/* Icon */}
                {state === 'processing' ? (
                    /* Spinner */
                    <svg className="w-4 h-4 animate-spin text-slate-300" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                ) : state === 'error' ? (
                    /* Warning */
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                ) : (
                    /* Microphone */
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                    </svg>
                )}
            </button>

            {/* Label */}
            <span className="text-[10px] text-slate-600 select-none">
                {state === 'recording' ? 'Stop' : state === 'processing' ? '…' : state === 'error' ? 'Error' : 'Voice'}
            </span>
        </div>
    );
}
