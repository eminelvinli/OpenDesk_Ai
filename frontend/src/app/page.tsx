'use client';

import { useState } from 'react';
import LiveView from '@/components/LiveView';
import TaskInput from '@/components/TaskInput';

const DEVICE_ID = 'dev-rust-001';

export default function DashboardPage() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#0a0e1a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm font-bold">
              O
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">
              OpenDesk <span className="text-blue-400">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-400">System Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Command Center</h1>
          <p className="text-sm text-slate-500">
            Issue natural language tasks and watch your AI operator execute them in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column — Live View (takes 2/3) */}
          <div className="lg:col-span-2 space-y-6">
            <LiveView deviceId={DEVICE_ID} />

            {/* Active Task Info */}
            {activeTaskId && (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-block w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  <div>
                    <p className="text-sm text-white font-medium">Task Running</p>
                    <p className="text-xs text-slate-500 mt-0.5">ID: {activeTaskId}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Controls (takes 1/3) */}
          <div className="space-y-6">
            <TaskInput onTaskStarted={setActiveTaskId} />

            {/* Device Info */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Active Device
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Device ID</span>
                  <span className="text-slate-300 font-mono text-xs">{DEVICE_ID}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Online
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">OS</span>
                  <span className="text-slate-300 text-xs">macOS</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Quick Actions
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Open browser', goal: 'Open the default web browser' },
                  { label: 'Check email', goal: 'Open the email client and check for new emails' },
                  { label: 'Take screenshot', goal: 'Take a screenshot of the current screen and save it to the desktop' },
                ].map((action) => (
                  <button
                    key={action.label}
                    className="w-full text-left px-4 py-2.5 bg-slate-900/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 rounded-lg text-sm text-slate-400 hover:text-white transition-all duration-200"
                    onClick={async () => {
                      try {
                        const res = await fetch(
                          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/tasks/schedule`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              userId: '000000000000000000000001',
                              deviceId: DEVICE_ID,
                              goal: action.goal,
                            }),
                          }
                        );
                        const data = await res.json();
                        if (res.ok) setActiveTaskId(data.taskLogId);
                      } catch {
                        // Silently fail for quick actions.
                      }
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
