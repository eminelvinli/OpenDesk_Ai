/**
 * Top header bar for the OpenDesk AI dashboard.
 * Displays page title and user actions.
 */
export default function Header({ title }: { title: string }) {
    return (
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">
            <h2 className="text-lg font-semibold text-white">{title}</h2>

            <div className="flex items-center gap-4">
                {/* Placeholder: will be replaced with real user profile */}
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="inline-block w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs">
                        U
                    </span>
                    <span>User</span>
                </div>
            </div>
        </header>
    );
}
