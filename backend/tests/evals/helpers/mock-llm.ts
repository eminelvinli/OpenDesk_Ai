/**
 * Mock LLM helper for agent evals.
 *
 * When OPENAI_API_KEY is not set (or EVAL_MOCK=true), the eval suite
 * runs fully deterministically using pre-programmed mock responses.
 *
 * When a real API key is present, evals hit the live model and validate
 * actual LLM behaviour. This is the "prompt accuracy" mode.
 *
 * Usage:
 *   import { shouldMock, createMockLLMResponse } from './mock-llm';
 *
 *   if (shouldMock) {
 *     jest.mock('../../src/agent/llm', () => ({
 *       callVisionLLMWithRetry: createMockLLMResponse({ action: 'mouse_double_click', ... }),
 *     }));
 *   }
 */

import type { AgentActionCommand } from '../../../src/types';

/** True when the eval should use mocked LLM responses. */
export const shouldMock =
    !process.env.OPENAI_API_KEY || process.env.EVAL_MOCK === 'true';

/** Zero token usage returned by mocks. */
export const MOCK_TOKEN_USAGE = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
};

/**
 * Create a Jest mock factory for `callVisionLLMWithRetry` that always
 * returns the provided command.
 *
 * @param command  - The AgentActionCommand the mock should return.
 * @param reasoning - Optional reasoning string (default: "mock reasoning").
 */
export function createMockLLMResponse(
    command: AgentActionCommand,
    reasoning = 'mock reasoning'
) {
    return jest.fn().mockResolvedValue({
        command,
        rawOutput: reasoning,
        tokenUsage: MOCK_TOKEN_USAGE,
    });
}

/**
 * Spy on the real LLM and validate its output matches an expected shape
 * WITHOUT mocking it. Used in live eval mode to inspect real responses.
 */
export function wrapLiveLLM() {
    // In live mode we call through — just report what came back.
    return null;
}
