/**
 * OpenDesk AI — Backend API Client
 *
 * Centralized utility for making requests to the Node.js backend
 * running on http://localhost:3001.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Generic fetch wrapper with error handling and JSON parsing.
 * All dashboard API calls should go through this function.
 */
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`API Error [${response.status}]: ${errorBody}`);
    }

    return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Backend health check response shape. */
export interface HealthStatus {
    status: string;
    service: string;
    timestamp: number;
    mongodb: string;
}

/** Check if the backend is healthy and connected to MongoDB. */
export async function getHealthStatus(): Promise<HealthStatus> {
    return request<HealthStatus>('/health');
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** Device as returned by the backend API. */
export interface Device {
    _id: string;
    deviceId: string;
    userId: string;
    name: string;
    osType: 'windows' | 'macos' | 'linux';
    screenBounds: { width: number; height: number };
    lastSeen: string;
    isOnline: boolean;
}

/** Fetch all devices for the current user. */
export async function getDevices(): Promise<Device[]> {
    return request<Device[]>('/api/devices');
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Task as returned by the backend API. */
export interface Task {
    _id: string;
    userId: string;
    deviceId: string;
    goal: string;
    status: 'pending' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'stuck';
    createdAt: string;
    updatedAt: string;
    scheduledAt: string | null;
    iterationCount: number;
}

/** Fetch all tasks for the current user. */
export async function getTasks(): Promise<Task[]> {
    return request<Task[]>('/api/tasks');
}

/** Create a new immediate or scheduled task. */
export async function createTask(data: {
    deviceId: string;
    goal: string;
    scheduledAt?: string;
}): Promise<Task> {
    return request<Task>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export default {
    getHealthStatus,
    getDevices,
    getTasks,
    createTask,
};
