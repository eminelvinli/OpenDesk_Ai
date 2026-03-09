'use client';

import Link from 'next/link';

/** Navigation links for the dashboard sidebar. */
const navItems = [
    { label: 'Dashboard', href: '/', icon: '📊' },
    { label: 'Devices', href: '/devices', icon: '🖥️' },
    { label: 'Tasks', href: '/tasks', icon: '📋' },
    { label: 'History', href: '/history', icon: '📜' },
    { label: 'Settings', href: '/settings', icon: '⚙️' },
];

/**
 * Sidebar navigation component for the OpenDesk AI dashboard.
 * Displays the logo, navigation links, and connection status.
 */
export default function Sidebar() {
    return (
        <aside className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>🌐</span> OpenDesk AI
                </h1>
                <p className="text-xs text-slate-500 mt-1">Autonomous Desktop Agent</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
                    >
                        <span>{item.icon}</span>
                        {item.label}
                    </Link>
                ))}
            </nav>

            {/* Status footer */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    Backend connected
                </div>
            </div>
        </aside>
    );
}
