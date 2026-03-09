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
import { callVisionLLMWithRetry } from './llm';
import { injectPersonaContext } from '../memory/rag';
import { TaskLogger, createTaskLogger, generateTraceId } from '../utils/logger';
import { pushAgentStatus } from '../api/stream';

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
// LLM Provider — Real Vision LLM via OpenAI (see agent/llm.ts)
// ---------------------------------------------------------------------------

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
 * 1. Call the Vision LLM with screenshot, goal, history, persona.
 * 2. LLM returns zod-validated structured JSON (AgentActionCommand).
 * 3. Validate coordinates against screen bounds.
 * 4. Automatic retry with exponential backoff on transient errors.
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
    personaRules?: string,
    log?: TaskLogger
): Promise<{ command: AgentActionCommand; reasoning: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const { command, rawOutput, tokenUsage } = await callVisionLLMWithRetry(
        observation.screenBase64,
        goal,
        history,
        observation.screenBounds,
        personaRules,
        log
    );

    // Double-check coordinates are within screen bounds (zero-trust).
    validateCoordinates(command, observation.screenBounds);

    return {
        command,
        reasoning: rawOutput,
        tokenUsage: {
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
        },
    };
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
    dispatchAction: (command: AgentActionCommand) => Promise<void>,
    existingLog?: TaskLogger
): Promise<TaskState> {
    const maxIterations = task.maxIterations || DEFAULT_MAX_ITERATIONS;
    const history: ActionHistoryEntry[] = [...task.actionHistory];
    let iteration = task.iterationCount;

    // Create or reuse a task-scoped logger with a stable traceId.
    const traceId = (task as TaskState & { traceId?: string }).traceId || generateTraceId();
    const log = existingLog ?? createTaskLogger(traceId, task.deviceId);

    // Accumulate token usage across all iterations.
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    log.info(`[Agent] Starting agentic loop`, {
        goal: task.goal,
        deviceId: task.deviceId,
        traceId,
        maxIterations,
    });

    // RAG: Fetch persona context once before the loop starts.
    const personaRules = await injectPersonaContext(task.userId, task.goal);
    if (personaRules) {
        log.info(`[Agent] Persona context loaded`, { userId: task.userId });
    }

    while (iteration < maxIterations) {
        iteration++;
        log.info(`[Agent] --- Iteration ${iteration}/${maxIterations} ---`, { iteration });

        pushAgentStatus(task.deviceId, { state: 'running', iteration });

        // OBSERVE: Get current screenshot from the Rust client.
        let observation: DeviceObservationPayload;
        try {
            observation = await getObservation();
            log.info(`[Agent] Observation received`, {
                deviceId: observation.deviceId,
                bounds: `${observation.screenBounds.width}x${observation.screenBounds.height}`,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown observation error';
            log.error('[Agent] Failed to receive observation — device likely disconnected', {
                error: errorMsg,
                stack: err instanceof Error ? err.stack : undefined,
            });
            pushAgentStatus(task.deviceId, { state: 'error', action: `Error: ${errorMsg}` });
            return {
                ...task,
                status: 'failed',
                actionHistory: history,
                iterationCount: iteration,
                errorMessage: `Failed to receive observation: ${errorMsg}`,
                updatedAt: new Date(),
            };
        }

        // THINK: Ask the Vision LLM what to do next.
        let command: AgentActionCommand;
        let reasoning: string;
        try {
            const result = await evaluateNextStep(
                observation,
                history,
                task.goal,
                personaRules,
                log
            );
            command = result.command;
            reasoning = result.reasoning;

            // Accumulate token usage.
            totalPromptTokens += result.tokenUsage.promptTokens;
            totalCompletionTokens += result.tokenUsage.completionTokens;
            totalTokens += result.tokenUsage.totalTokens;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown LLM error';
            log.error('[Agent] LLM evaluation failed — terminating loop', {
                error: errorMsg,
                stack: err instanceof Error ? err.stack : undefined,
                iteration,
            });
            pushAgentStatus(task.deviceId, { state: 'error', action: `Error: ${errorMsg}` });
            return {
                ...task,
                status: 'failed',
                actionHistory: history,
                iterationCount: iteration,
                errorMessage: `LLM error: ${errorMsg}`,
                updatedAt: new Date(),
            };
        }

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
            log.error(`[Agent] Stuck execution detected`, {
                coordinates: stuckCoords,
                iteration,
                error: error.message,
            });
            pushAgentStatus(task.deviceId, { state: 'error', action: 'Stuck: same coordinates 3x' });
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
            log.info(`[Agent] Task completed!`, { iteration, totalTokens, totalPromptTokens, totalCompletionTokens });
            pushAgentStatus(task.deviceId, { state: 'completed', iteration });
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
            log.info(`[Agent] Action dispatched: ${command.action}`, {
                action: command.action,
                coordinates: command.coordinates,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown dispatch error';
            log.error('[Agent] Failed to dispatch action — device may have disconnected', {
                error: errorMsg,
                stack: err instanceof Error ? err.stack : undefined,
                action: command.action,
            });
            pushAgentStatus(task.deviceId, { state: 'error', action: `Dispatch error: ${errorMsg}` });
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
    log.error(`[Agent] Max iterations reached`, {
        maxIterations,
        iteration,
        totalTokens,
    });
    pushAgentStatus(task.deviceId, { state: 'error', action: `Max iterations (${maxIterations}) reached` });
    return {
        ...task,
        status: 'failed',
        actionHistory: history,
        iterationCount: iteration,
        errorMessage: error.message,
        updatedAt: new Date(),
    };
}
