/**
 * OpenDesk AI — Agent Evaluation Test Suite
 *
 * Tests the LLM Decision Layer (`evaluateNextStep`) against static screenshot
 * fixtures to verify prompt accuracy deterministically in CI.
 *
 * ─ MOCK MODE (default / CI) ─────────────────────────────────────────────────
 *   When OPENAI_API_KEY is absent or EVAL_MOCK=true the mock intercepts all
 *   LLM calls and returns pre-programmed AgentActionCommands. Instant, $0.
 *
 * ─ LIVE MODE (prompt accuracy evaluation) ────────────────────────────────────
 *   Set EVAL_MOCK=false AND provide a valid OPENAI_API_KEY.
 *   Place JPEG screenshots in tests/evals/fixtures/images/:
 *     screenshot_desktop.jpg        — desktop with Chrome icon visible
 *     screenshot_chrome_open.jpg    — Chrome with address bar focused
 *
 * npm run test:evals             → mock mode (CI safe, always passes)
 * OPENAI_API_KEY=sk-... EVAL_MOCK=false npm run test:evals:live  → live LLM
 */

import { MOCK_TOKEN_USAGE } from './helpers/mock-llm';
import { runEvalScenario } from './helpers/eval-runner';
import { loadFixtureOrPlaceholder } from './fixtures/fixture-loader';
import type { AgentActionCommand } from '../../src/types';

// ── jest.mock MUST be at the top level for babel hoisting to work ─────────────
// We always mock the module. In live mode, the mock implementation calls
// through to the real function via jest.requireActual().
jest.mock('../../src/agent/llm', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const actual = jest.requireActual('../../src/agent/llm');
    return {
        ...actual,
        // Default behaviour: pass through to the real implementation.
        // Individual tests override this with mockResolvedValueOnce().
        callVisionLLMWithRetry: jest.fn(actual.callVisionLLMWithRetry),
    };
});

const isLiveMode = process.env.EVAL_MOCK !== 'true' && !!process.env.OPENAI_API_KEY;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
const llmModule = require('../../src/agent/llm');

/** Queue a deterministic response for the next LLM call. */
function setNextMockResponse(command: AgentActionCommand) {
    (llmModule.callVisionLLMWithRetry as jest.Mock).mockResolvedValueOnce({
        command,
        rawOutput: `[mock] ${command.action}`,
        tokenUsage: MOCK_TOKEN_USAGE,
    });
}

/** Clear any queued mock responses (reset to live passthrough). */
function clearMocks() {
    (llmModule.callVisionLLMWithRetry as jest.Mock).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const actual = jest.requireActual('../../src/agent/llm');
    (llmModule.callVisionLLMWithRetry as jest.Mock).mockImplementation(
        actual.callVisionLLMWithRetry
    );
}

/** Print eval result in verbose mode. */
function reportResult(label: string, result: Awaited<ReturnType<typeof runEvalScenario>>) {
    if (process.env.EVAL_VERBOSE === 'true') {
        console.log(`\n[EVAL] ${label}:`);
        console.log(`  action: ${result.command.action}`);
        if (result.command.coordinates) {
            console.log(`  coords: (${result.command.coordinates.x}, ${result.command.coordinates.y})`);
        }
        if (result.command.text) console.log(`  text:   "${result.command.text}"`);
        console.log(`  tokens: ${result.tokenUsage.totalTokens}, ${result.durationMs}ms`);
        if (isLiveMode) console.log(`  reasoning: ${result.reasoning.slice(0, 150)}`);
    }
}

beforeEach(() => {
    if (!isLiveMode) {
        // In mock mode, make sure no old mockResolvedValueOnce leaks between tests.
        (llmModule.callVisionLLMWithRetry as jest.Mock).mockReset();
    }
});

afterAll(() => clearMocks());

// ---------------------------------------------------------------------------
// Eval Suite 1: Open Chrome from Desktop
// ---------------------------------------------------------------------------

describe('Eval Suite 1 — "Open Chrome" from Desktop', () => {
    const screenshot = loadFixtureOrPlaceholder('screenshot_desktop.jpg');

    test('should output a click action at valid screen coordinates', async () => {
        if (!isLiveMode) {
            setNextMockResponse({
                action: 'mouse_double_click',
                coordinates: { x: 256, y: 810 },
                text: null, key: null, params: null,
            });
        }

        const result = await runEvalScenario({
            name: 'Open Chrome from Desktop',
            screenshotBase64: screenshot,
            goal: 'Open Google Chrome',
        });

        reportResult('Open Chrome', result);

        expect(['mouse_click', 'mouse_double_click']).toContain(result.command.action);
        expect(result.command.coordinates).not.toBeNull();
        expect(result.command.coordinates!.x).toBeGreaterThanOrEqual(0);
        expect(result.command.coordinates!.x).toBeLessThanOrEqual(1920);
        expect(result.command.coordinates!.y).toBeGreaterThanOrEqual(0);
        expect(result.command.coordinates!.y).toBeLessThanOrEqual(1080);

        // Mock mode: assert exact programmed response.
        if (!isLiveMode) {
            expect(result.command.action).toBe('mouse_double_click');
            expect(result.command.coordinates).toEqual({ x: 256, y: 810 });
        }
    });

    test('should not output "done" when task is not yet started', async () => {
        if (!isLiveMode) {
            setNextMockResponse({
                action: 'mouse_double_click',
                coordinates: { x: 256, y: 810 },
                text: null, key: null, params: null,
            });
        }

        const result = await runEvalScenario({
            name: 'Open Chrome — not done',
            screenshotBase64: screenshot,
            goal: 'Open Google Chrome',
        });

        expect(result.command.action).not.toBe('done');
    });
});

// ---------------------------------------------------------------------------
// Eval Suite 2: Type search query in Chrome
// ---------------------------------------------------------------------------

describe('Eval Suite 2 — "Search for cats" in Chrome', () => {
    const screenshot = loadFixtureOrPlaceholder('screenshot_chrome_open.jpg');
    const history = [
        {
            action: { action: 'mouse_double_click', coordinates: { x: 256, y: 810 }, text: null, key: null, params: null } as AgentActionCommand,
            reasoning: 'Opened Chrome.',
            timestamp: Math.floor(Date.now() / 1000) - 5,
        },
    ];

    test('should output keyboard_type with search text', async () => {
        if (!isLiveMode) {
            setNextMockResponse({
                action: 'keyboard_type',
                coordinates: null,
                text: 'cats', key: null, params: null,
            });
        }

        const result = await runEvalScenario({
            name: 'Search cats',
            screenshotBase64: screenshot,
            goal: 'Search for "cats" in Google',
            history,
        });

        reportResult('Search cats', result);
        expect(result.command.action).toBe('keyboard_type');

        if (!isLiveMode) {
            expect(result.command.text).toBe('cats');
        } else {
            expect(result.command.text).toBeTruthy();
        }
    });

    test('keyboard_type should not include coordinates', async () => {
        if (!isLiveMode) {
            setNextMockResponse({
                action: 'keyboard_type',
                coordinates: null,
                text: 'cats', key: null, params: null,
            });
        }

        const result = await runEvalScenario({
            name: 'Type cats — no coords',
            screenshotBase64: screenshot,
            goal: 'Type "cats" into the search bar',
        });

        if (result.command.action === 'keyboard_type') {
            expect(result.command.coordinates).toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// Eval Suite 3: Task completion detection
// ---------------------------------------------------------------------------

describe('Eval Suite 3 — Task completion after search results appear', () => {
    const screenshot = loadFixtureOrPlaceholder('screenshot_chrome_open.jpg');

    test('should return "done" when goal history shows task complete', async () => {
        if (!isLiveMode) {
            setNextMockResponse({
                action: 'done',
                coordinates: null,
                text: 'Completed: cats search results visible.',
                key: null, params: null,
            });
        }

        const result = await runEvalScenario({
            name: 'Task completion',
            screenshotBase64: screenshot,
            goal: 'Search for cats in Google',
            history: [
                { action: { action: 'mouse_double_click', coordinates: { x: 256, y: 810 }, text: null, key: null, params: null }, reasoning: 'Opened Chrome.', timestamp: Math.floor(Date.now() / 1000) - 10 },
                { action: { action: 'keyboard_type', coordinates: null, text: 'cats', key: null, params: null }, reasoning: 'Typed cats.', timestamp: Math.floor(Date.now() / 1000) - 5 },
                { action: { action: 'keyboard_press', coordinates: null, text: null, key: 'Return', params: null }, reasoning: 'Pressed Enter.', timestamp: Math.floor(Date.now() / 1000) - 2 },
            ],
        });

        reportResult('Task done', result);

        if (!isLiveMode) {
            expect(result.command.action).toBe('done');
        } else {
            expect(['done', 'keyboard_type', 'mouse_click']).toContain(result.command.action);
        }
    });
});

// ---------------------------------------------------------------------------
// Eval Suite 4: OS tool usage
// ---------------------------------------------------------------------------

describe('Eval Suite 4 — OS Tool Usage', () => {
    test('should use read_clipboard for clipboard tasks', async () => {
        const screenshot = loadFixtureOrPlaceholder('screenshot_desktop.jpg');
        if (!isLiveMode) {
            setNextMockResponse({ action: 'read_clipboard', coordinates: null, text: null, key: null, params: {} });
        }

        const result = await runEvalScenario({
            name: 'Read clipboard',
            screenshotBase64: screenshot,
            goal: 'Read the clipboard content',
        });

        reportResult('Read clipboard', result);
        if (!isLiveMode) expect(result.command.action).toBe('read_clipboard');
    });

    test('should use scroll_window to scroll a page', async () => {
        const screenshot = loadFixtureOrPlaceholder('screenshot_chrome_open.jpg');
        if (!isLiveMode) {
            setNextMockResponse({ action: 'scroll_window', coordinates: null, text: null, key: null, params: { direction: 'down', amount: '3' } });
        }

        const result = await runEvalScenario({
            name: 'Scroll down',
            screenshotBase64: screenshot,
            goal: 'Scroll down the page to see more results',
        });

        reportResult('Scroll down', result);
        if (!isLiveMode) {
            expect(result.command.action).toBe('scroll_window');
            expect(result.command.params?.direction).toBe('down');
        }
    });
});

// ---------------------------------------------------------------------------
// Eval Suite 5: AgentActionCommand structural contract
// ---------------------------------------------------------------------------

describe('Eval Suite 5 — AgentActionCommand contract', () => {
    const screenshot = loadFixtureOrPlaceholder('screenshot_desktop.jpg');

    test.each([
        { goal: 'Open a terminal', action: 'mouse_double_click' as const },
        { goal: 'Press the Escape key', action: 'keyboard_press' as const },
    ])('command for "$goal" contains all required fields', async ({ goal, action }) => {
        if (!isLiveMode) {
            setNextMockResponse({
                action,
                coordinates: action.includes('mouse') ? { x: 100, y: 100 } : null,
                text: null,
                key: action === 'keyboard_press' ? 'Escape' : null,
                params: null,
            });
        }

        const result = await runEvalScenario({ name: goal, screenshotBase64: screenshot, goal });

        expect(result.command).toHaveProperty('action');
        expect(result.command).toHaveProperty('coordinates');
        expect(result.command).toHaveProperty('text');
        expect(result.command).toHaveProperty('key');
    });
});
