/**
 * Eval runner — thin wrapper around evaluateNextStep for use in tests.
 *
 * Constructs a minimal DeviceObservationPayload from a base64 screenshot
 * string and passes it through evaluateNextStep, returning the command,
 * reasoning, and token usage.
 *
 * Design decision: we test evaluateNextStep directly rather than the full
 * agenticLoop to keep evals fast and focused on the LLM decision layer.
 * Full E2E loop tests belong in integration tests (not evals).
 */

import { evaluateNextStep } from '../../../src/agent/loop';
import type {
    AgentActionCommand,
    DeviceObservationPayload,
} from '../../../src/types';

export interface EvalScenario {
    /** Human-readable name shown in test output. */
    name: string;
    /** Pre-loaded base64 screenshot (data URI format). */
    screenshotBase64: string;
    /** The natural language task goal. */
    goal: string;
    /** Optional persona/preference rules injected into the system prompt. */
    personaRules?: string;
    /** Previous actions in this task session (empty for first step). */
    history?: Array<{
        action: AgentActionCommand;
        reasoning: string;
        timestamp: number;
    }>;
    /** Screen dimensions the agent sees. */
    screenBounds?: { width: number; height: number };
}

export interface EvalResult {
    command: AgentActionCommand;
    reasoning: string;
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
    durationMs: number;
}

/**
 * Run a single eval scenario through evaluateNextStep.
 *
 * @returns The LLM's AgentActionCommand + metadata.
 */
export async function runEvalScenario(scenario: EvalScenario): Promise<EvalResult> {
    const observation: DeviceObservationPayload = {
        deviceId: 'eval-device-001',
        timestamp: Math.floor(Date.now() / 1000),
        screenBase64: scenario.screenshotBase64,
        screenBounds: scenario.screenBounds ?? { width: 1920, height: 1080 },
        monitorCount: 1,
        activeMonitorId: 0,
    };

    const t0 = Date.now();

    const result = await evaluateNextStep(
        observation,
        (scenario.history ?? []) as Parameters<typeof evaluateNextStep>[1],
        scenario.goal,
        scenario.personaRules,
        undefined // no structured logger in eval suite
    );

    return {
        command: result.command,
        reasoning: result.reasoning,
        tokenUsage: result.tokenUsage,
        durationMs: Date.now() - t0,
    };
}
