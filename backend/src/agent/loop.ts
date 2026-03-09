/**
 * OpenDesk AI — ReAct Agentic Loop
 *
 * Implements the core Observe → Think → Act cycle that drives the
 * autonomous desktop agent. The loop receives screenshots from the Rust
 * client, sends them to a Vision LLM, parses the structured JSON action,
 * and dispatches it back through the pipeline.
 *
 * Key safety mechanisms:
 * - actionHistory tracks every step for auditing and context injection
 * - Stuck detection: 3 consecutive identical coordinates → StuckExecutionError
 * - Max iteration limit prevents runaway loops
 * - Coordinate validation against screenBounds before dispatching
 *
 * See AI_CONTEXT.md §3.C for the strict rules this module follows.
 */

import {
    AgentActionCommand,
    AgentActionType,
    DeviceObservationPayload,
    ActionHistoryEntry,
    TaskState,
    ScreenBounds,
} from '../types';
import {
    AGENT_SYSTEM_PROMPT,
    buildUserMessage,
    formatActionHistory,
} from './prompts';
import { injectPersonaContext } from '../memory/rag';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the agent repeats the same coordinates 3 times. */
export class StuckExecutionError extends Error {
    constructor(
        public readonly deviceId: string,
        public readonly coordinates: { x: number; y: number },
        public readonly iterationCount: number
    ) {
        super(
            `Stuck execution on device ${deviceId}: ` +
            `coordinates (${coordinates.x}, ${coordinates.y}) ` +
            `repeated 3 times at iteration ${iterationCount}`
        );
        this.name = 'StuckExecutionError';
    }
}

/** Thrown when the max iteration limit is reached. */
export class MaxIterationsError extends Error {
    constructor(
        public readonly deviceId: string,
        public readonly maxIterations: number
    ) {
        super(
            `Max iterations (${maxIterations}) reached on device ${deviceId}`
        );
        this.name = 'MaxIterationsError';
    }
}

/** Thrown when the LLM returns invalid output that cannot be parsed. */
export class InvalidLLMOutputError extends Error {
    constructor(
        public readonly rawOutput: string,
        public readonly parseError: string
    ) {
        super(`Invalid LLM output: ${parseError}. Raw: "${rawOutput.substring(0, 200)}"`);
        this.name = 'InvalidLLMOutputError';
    }
}

// ---------------------------------------------------------------------------
// LLM Provider (Mock)
// ---------------------------------------------------------------------------

/**
 * Simulate a Vision LLM call. In production, this will call OpenAI, Anthropic,
 * or a local model with the screenshot + system prompt.
 *
 * @param _systemPrompt - The system instruction (unused in mock).
 * @param _userMessage - The user message with goal and history (unused in mock).
 * @param _screenshotBase64 - The current screenshot (unused in mock).
 * @returns A mock AgentActionCommand JSON string.
 */
async function callVisionLLM(
    _systemPrompt: string,
    _userMessage: string,
    _screenshotBase64: string
): Promise<string> {
    // TODO: Replace with real LLM provider integration.
    // Simulate some processing time.
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return a dummy action for testing the loop mechanics.
    const mockResponse: AgentActionCommand = {
        action: 'mouse_click',
        coordinates: { x: 500, y: 300 },
        text: null,
        key: null,
    };

    return JSON.stringify(mockResponse);
}

// ---------------------------------------------------------------------------
// Output Parsing
// ---------------------------------------------------------------------------

/** Valid action strings for validation. */
const VALID_ACTIONS: AgentActionType[] = [
    'mouse_move',
    'mouse_click',
    'mouse_double_click',
    'keyboard_type',
    'keyboard_press',
    'done',
];

/**
 * Parse and validate raw LLM output into an AgentActionCommand.
 *
 * Strips markdown fences if the LLM disobeys the prompt, then validates
 * the action type and required fields.
 *
 * @param rawOutput - The raw string returned by the LLM.
 * @returns A validated AgentActionCommand.
 * @throws InvalidLLMOutputError if parsing or validation fails.
 */
export function parseLLMOutput(rawOutput: string): AgentActionCommand {
    // Strip markdown code fences if the LLM disobeyed the prompt.
    let cleaned = rawOutput.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        throw new InvalidLLMOutputError(rawOutput, 'Failed to parse JSON');
    }

    // Validate action field.
    const action = parsed.action as string;
    if (!action || !VALID_ACTIONS.includes(action as AgentActionType)) {
        throw new InvalidLLMOutputError(rawOutput, `Invalid action: "${action}"`);
    }

    // Build the validated command.
    const command: AgentActionCommand = {
        action: action as AgentActionType,
        coordinates: null,
        text: null,
        key: null,
    };

    // Validate coordinates for mouse actions.
    if (action.startsWith('mouse_')) {
        const coords = parsed.coordinates as { x: unknown; y: unknown } | null;
        if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
            throw new InvalidLLMOutputError(rawOutput, `Mouse action "${action}" requires valid coordinates`);
        }
        command.coordinates = { x: Math.round(coords.x), y: Math.round(coords.y) };
    }

    // Validate text for keyboard_type.
    if (action === 'keyboard_type') {
        if (typeof parsed.text !== 'string' || parsed.text.length === 0) {
            throw new InvalidLLMOutputError(rawOutput, 'keyboard_type requires non-empty "text"');
        }
        command.text = parsed.text;
    }

    // Validate key for keyboard_press.
    if (action === 'keyboard_press') {
        if (typeof parsed.key !== 'string' || parsed.key.length === 0) {
            throw new InvalidLLMOutputError(rawOutput, 'keyboard_press requires non-empty "key"');
        }
        command.key = parsed.key;
    }

    return command;
}

// ---------------------------------------------------------------------------
// Coordinate Validation
// ---------------------------------------------------------------------------

/**
 * Validate that coordinates are within the device's screen bounds.
 * Zero-trust: never trust LLM-generated coordinates blindly.
 *
 * @param command - The action command to validate.
 * @param bounds - The screen dimensions of the target device.
 * @returns true if valid or no coordinates to check.
 * @throws Error if coordinates are out of bounds.
 */
export function validateCoordinates(
    command: AgentActionCommand,
    bounds: ScreenBounds
): boolean {
    if (!command.coordinates) return true;

    const { x, y } = command.coordinates;
    if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
        throw new Error(
            `Coordinate out of bounds: (${x}, ${y}) exceeds ${bounds.width}x${bounds.height}`
        );
    }
    return true;
}

// ---------------------------------------------------------------------------
// Stuck Detection
// ---------------------------------------------------------------------------

/** Number of consecutive identical coordinate actions before declaring stuck. */
const STUCK_THRESHOLD = 3;

/**
 * Check if the last N actions targeted the exact same coordinates.
 *
 * @param history - The action history array.
 * @returns The repeated coordinates if stuck, null otherwise.
 */
export function detectStuck(
    history: ActionHistoryEntry[]
): { x: number; y: number } | null {
    if (history.length < STUCK_THRESHOLD) return null;

    const recent = history.slice(-STUCK_THRESHOLD);

    // All recent actions must have coordinates.
    const allHaveCoords = recent.every((e) => e.action.coordinates !== null);
    if (!allHaveCoords) return null;

    const first = recent[0].action.coordinates;
    if (!first) return null;

    const allSame = recent.every(
        (e) =>
            e.action.coordinates !== null &&
            e.action.coordinates.x === first.x &&
            e.action.coordinates.y === first.y
    );

    return allSame ? { x: first.x, y: first.y } : null;
}

// ---------------------------------------------------------------------------
// The ReAct Loop
// ---------------------------------------------------------------------------

/** Default maximum iterations before forced termination. */
const DEFAULT_MAX_ITERATIONS = 50;

/**
 * Evaluate the next action to take based on the current observation.
 *
 * This is the core Think step of the ReAct loop:
 * 1. Build the LLM prompt with goal, history, and persona context.
 * 2. Call the Vision LLM with the current screenshot.
 * 3. Parse and validate the structured JSON output.
 * 4. Validate coordinates against screen bounds.
 *
 * @param observation - The current screenshot and device metadata.
 * @param history - Array of all previous actions in this session.
 * @param goal - The user's natural language task description.
 * @param personaRules - Optional RAG-retrieved user behavior rules.
 * @returns The validated next action command and LLM reasoning.
 */
export async function evaluateNextStep(
    observation: DeviceObservationPayload,
    history: ActionHistoryEntry[],
    goal: string,
    personaRules?: string
): Promise<{ command: AgentActionCommand; reasoning: string }> {
    // Build the prompt context with persona rules.
    const formattedHistory = formatActionHistory(
        history.map((e) => ({
            action: e.action.action,
            coordinates: e.action.coordinates,
            text: e.action.text,
            key: e.action.key,
            reasoning: e.reasoning,
        }))
    );
    const userMessage = buildUserMessage(goal, formattedHistory, personaRules);

    // Call the Vision LLM.
    const rawOutput = await callVisionLLM(
        AGENT_SYSTEM_PROMPT,
        userMessage,
        observation.screenBase64
    );

    // Parse and validate the response.
    const command = parseLLMOutput(rawOutput);
    validateCoordinates(command, observation.screenBounds);

    return { command, reasoning: rawOutput };
}

/**
 * Run the full ReAct agentic loop for a task.
 *
 * Lifecycle:
 * 1. Receive observation (screenshot) from Rust client via WebSocket/Gateway.
 * 2. Call evaluateNextStep() → Vision LLM returns next action.
 * 3. Check for stuck execution (same coords 3 times → throw).
 * 4. Dispatch action to Rust client via Redis → Gateway → WebSocket.
 * 5. Wait for next observation.
 * 6. Repeat until LLM returns `done` or max iterations.
 *
 * @param task - The task state from MongoDB.
 * @param getObservation - Async function that waits for the next screenshot.
 * @param dispatchAction - Async function that sends a command to the device.
 * @returns The final task state with status and full action history.
 */
export async function runAgenticLoop(
    task: TaskState,
    getObservation: () => Promise<DeviceObservationPayload>,
    dispatchAction: (command: AgentActionCommand) => Promise<void>
): Promise<TaskState> {
    const maxIterations = task.maxIterations || DEFAULT_MAX_ITERATIONS;
    const history: ActionHistoryEntry[] = [...task.actionHistory];
    let iteration = task.iterationCount;

    console.log(`🤖 Starting agentic loop for task: "${task.goal}" (device: ${task.deviceId})`);

    // RAG: Fetch persona context once before the loop starts.
    const personaRules = await injectPersonaContext(task.userId, task.goal);
    if (personaRules) {
        console.log(`🧠 Persona context loaded for user ${task.userId}`);
    }

    while (iteration < maxIterations) {
        iteration++;
        console.log(`\n--- Iteration ${iteration}/${maxIterations} ---`);

        // OBSERVE: Get current screenshot from the Rust client.
        const observation = await getObservation();
        console.log(`📸 Observation received from ${observation.deviceId}`);

        // THINK: Ask the Vision LLM what to do next (with persona context).
        const { command, reasoning } = await evaluateNextStep(
            observation,
            history,
            task.goal,
            personaRules
        );
        console.log(`🧠 LLM decided: ${command.action}`, command.coordinates || '');

        // Record in history.
        const entry: ActionHistoryEntry = {
            action: command,
            screenshotBase64: observation.screenBase64,
            timestamp: observation.timestamp,
            reasoning,
        };
        history.push(entry);

        // CHECK: Is the agent stuck?
        const stuckCoords = detectStuck(history);
        if (stuckCoords) {
            const error = new StuckExecutionError(task.deviceId, stuckCoords, iteration);
            console.error(`🔴 ${error.message}`);
            return {
                ...task,
                status: 'stuck',
                actionHistory: history,
                iterationCount: iteration,
                errorMessage: error.message,
                updatedAt: new Date(),
            };
        }

        // DONE: Did the LLM signal task completion?
        if (command.action === 'done') {
            console.log(`✅ Task completed at iteration ${iteration}`);
            return {
                ...task,
                status: 'completed',
                actionHistory: history,
                iterationCount: iteration,
                errorMessage: null,
                updatedAt: new Date(),
            };
        }

        // ACT: Dispatch the command to the Rust client.
        try {
            await dispatchAction(command);
            console.log(`📤 Action dispatched: ${command.action}`);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown dispatch error';
            console.error(`❌ Dispatch failed: ${errorMsg}`);
            return {
                ...task,
                status: 'failed',
                actionHistory: history,
                iterationCount: iteration,
                errorMessage: `Dispatch failed: ${errorMsg}`,
                updatedAt: new Date(),
            };
        }
    }

    // Max iterations reached.
    const error = new MaxIterationsError(task.deviceId, maxIterations);
    console.error(`🔴 ${error.message}`);
    return {
        ...task,
        status: 'failed',
        actionHistory: history,
        iterationCount: iteration,
        errorMessage: error.message,
        updatedAt: new Date(),
    };
}
