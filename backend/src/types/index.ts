/**
 * OpenDesk AI — Shared Type Definitions & Inter-Service Contracts
 *
 * These interfaces define the strict payload schemas exchanged between
 * the Node.js backend, Go gateway, and Rust desktop client.
 * See AI_CONTEXT.md §4 for the canonical contract specification.
 */

// ---------------------------------------------------------------------------
// Screen Coordinate Types
// ---------------------------------------------------------------------------

/** Pixel coordinates on the user's screen. */
export interface ScreenCoordinates {
    x: number;
    y: number;
}

/** Screen dimensions reported by the Rust client. */
export interface ScreenBounds {
    width: number;
    height: number;
}

// ---------------------------------------------------------------------------
// Agent Action Types (Backend → Rust via Gateway)
// ---------------------------------------------------------------------------

/**
 * All possible actions the Vision LLM can instruct the Rust client to perform.
 * The `done` action signals the agentic loop to terminate.
 */
export type AgentActionType =
    | 'mouse_move'
    | 'mouse_click'
    | 'mouse_double_click'
    | 'keyboard_type'
    | 'keyboard_press'
    | 'done';

/**
 * Command payload sent from the Node.js backend to the Rust desktop client.
 * Routed through the Go gateway without modification.
 *
 * - `coordinates` is required for mouse actions, null otherwise.
 * - `text` is required for `keyboard_type`, null otherwise.
 * - `key` is required for `keyboard_press`, null otherwise.
 */
export interface AgentActionCommand {
    action: AgentActionType;
    coordinates: ScreenCoordinates | null;
    text: string | null;
    key: string | null;
}

// ---------------------------------------------------------------------------
// Device Observation (Rust → Backend via Gateway)
// ---------------------------------------------------------------------------

/**
 * Observation payload streamed from the Rust desktop client to the backend.
 * Contains a screenshot and device metadata for the agentic loop.
 */
export interface DeviceObservationPayload {
    /** Unique identifier for the paired device. */
    deviceId: string;

    /** Unix timestamp (seconds) when the screenshot was captured. */
    timestamp: number;

    /** Base64-encoded JPEG/WebP screenshot (data URI format). */
    screenBase64: string;

    /** Current screen resolution of the device. */
    screenBounds: ScreenBounds;
}

// ---------------------------------------------------------------------------
// Task State (MongoDB — Agentic Loop Tracking)
// ---------------------------------------------------------------------------

/** Possible states of a task during its lifecycle. */
export type TaskStatus =
    | 'pending'
    | 'scheduled'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'stuck';

/** A single entry in the action history, logged at each loop iteration. */
export interface ActionHistoryEntry {
    /** The action that was executed. */
    action: AgentActionCommand;

    /** Base64 screenshot that triggered this action (for auditing). */
    screenshotBase64: string;

    /** Timestamp when this action was dispatched. */
    timestamp: number;

    /** Raw LLM reasoning text (the "Thought" step of ReAct). */
    reasoning: string;
}

/**
 * Tracks the full state of a user's task throughout its lifecycle.
 * Stored in the MongoDB `TaskLogs` collection.
 *
 * The `actionHistory` array is critical for infinite-loop prevention:
 * if the same coordinates are attempted 3 times without a screen change,
 * the task must be paused with status `stuck`.
 */
export interface TaskState {
    /** MongoDB document ID (assigned by Mongoose). */
    _id?: string;

    /** Reference to the user who created this task. */
    userId: string;

    /** The paired device executing this task. */
    deviceId: string;

    /** The original natural-language goal from the user. */
    goal: string;

    /** Current lifecycle status of the task. */
    status: TaskStatus;

    /** Ordered log of every action the AI has taken. */
    actionHistory: ActionHistoryEntry[];

    /** ISO timestamp when the task was created. */
    createdAt: Date;

    /** ISO timestamp of the last update. */
    updatedAt: Date;

    /** Scheduled execution time (null for immediate tasks). */
    scheduledAt: Date | null;

    /** Error message if task failed or got stuck. */
    errorMessage: string | null;

    /** Total number of agentic loop iterations completed. */
    iterationCount: number;

    /** Maximum allowed iterations before forced termination. */
    maxIterations: number;
}
