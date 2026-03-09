'use client';

/** Placeholder device data — will be replaced with API calls. */
const dummyDevices = [
    { id: 'dev-001', name: 'Work Laptop', os: 'macOS', status: 'online' as const },
    { id: 'dev-002', name: 'Home Desktop', os: 'Windows', status: 'offline' as const },
    { id: 'dev-003', name: 'Office PC', os: 'Linux', status: 'online' as const },
];

type DeviceStatus = 'online' | 'offline';

interface Device {
    id: string;
    name: string;
    os: string;
    status: DeviceStatus;
}

/**
 * Device list component showing paired devices with online/offline status.
 * Placeholder — will fetch from backend API in production.
 */
export default function DeviceList() {
    return (
        <div className="space-y-3">
            {dummyDevices.map((device: Device) => (
                <div
                    key={device.id}
                    className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">
                            {device.os === 'macOS' ? '🍎' : device.os === 'Windows' ? '🪟' : '🐧'}
                        </span>
                        <div>
                            <p className="text-sm font-medium text-white">{device.name}</p>
                            <p className="text-xs text-slate-500">{device.os} · {device.id}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-block w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-emerald-500' : 'bg-slate-600'
                                }`}
                        />
                        <span
                            className={`text-xs ${device.status === 'online' ? 'text-emerald-400' : 'text-slate-500'
                                }`}
                        >
                            {device.status}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}
