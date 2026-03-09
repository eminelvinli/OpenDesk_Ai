/**
 * OpenDesk AI — Vision LLM Provider
 *
 * Handles all communication with the OpenAI Vision API (or compatible).
 * Uses zod to enforce structured JSON output — the LLM MUST return a
 * valid AgentActionCommand and nothing else.
 *
 * Supports:
 * - GPT-4o / GPT-4o-mini with vision (image + text input)
 * - Strict structured outputs via response_format + zod schema
 * - Retry with exponential backoff on rate limits / transient errors
 *
 * See AI_CONTEXT.md §3.C: "You MUST force the Vision LLM to return
 * strictly typed JSON (Structured Outputs)."
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { AgentActionCommand } from '../types';
import { AGENT_SYSTEM_PROMPT, buildUserMessage, formatActionHistory } from './prompts';
import { ActionHistoryEntry, ScreenBounds } from '../types';
import { TaskLogger, logger as rootLogger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Zod Schema for Structured Outputs
// ---------------------------------------------------------------------------

/**
 * Zod schema matching AgentActionCommand exactly.
 * Used with OpenAI's response_format to enforce JSON structure.
 */
const CoordinatesSchema = z.object({
    x: z.number().int().describe('Horizontal pixel coordinate'),
    y: z.number().int().describe('Vertical pixel coordinate'),
});

const AgentActionCommandSchema = z.object({
    action: z
        .enum([
            'mouse_move',
            'mouse_click',
            'mouse_double_click',
            'keyboard_type',
            'keyboard_press',
            'done',
            // OS-level skill tools
            'read_clipboard',
            'write_clipboard',
            'scroll_window',
            'get_active_window_title',
        ])
        .describe('The single next action to perform'),
    coordinates: CoordinatesSchema.nullable().describe(
        'Required for mouse actions (x, y pixel position). Null for keyboard/tool actions.'
    ),
    text: z
        .string()
        .nullable()
        .describe('Required for keyboard_type or write_clipboard. Null for other actions.'),
    key: z
        .string()
        .nullable()
        .describe(
            'Required for keyboard_press. The key name (e.g. "Enter", "Tab", "Escape"). Null for other actions.'
        ),
    params: z
        .record(z.string(), z.string())
        .nullable()
        .optional()
        .describe(
            'Additional parameters for skill tools. E.g. { direction: "down", amount: "3" } for scroll_window.'
        ),
});

/** Exported type derived from zod schema for convenience. */
export type ZodAgentActionCommand = z.infer<typeof AgentActionCommandSchema>;

// ---------------------------------------------------------------------------
// OpenAI Client
// ---------------------------------------------------------------------------

/** Lazy-initialized OpenAI client. Created on first use. */
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error(
                'OPENAI_API_KEY is not set. Add it to your .env file.'
            );
        }

        openaiClient = new OpenAI({
            apiKey,
            maxRetries: 0, // We handle retries ourselves for better control.
        });
    }
    return openaiClient;
}

// ---------------------------------------------------------------------------
// Vision LLM Call
// ---------------------------------------------------------------------------

/**
 * Call the OpenAI Vision API with the current screenshot and conversation
 * context. Returns a validated AgentActionCommand.
 *
 * @param screenshotBase64 - The current screen as a data URI (data:image/jpeg;base64,...).
 * @param goal - The user's natural language task description.
 * @param history - Previous action entries for context.
 * @param screenBounds - The device's screen dimensions for coordinate hints.
 * @param personaRules - Optional RAG-retrieved user preferences.
 * @returns A validated AgentActionCommand parsed from the LLM's structured output.
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
}

export async function callVisionLLM(
    screenshotBase64: string,
    goal: string,
    history: ActionHistoryEntry[],
    screenBounds: ScreenBounds,
    personaRules?: string,
    log?: TaskLogger,
    toolResult?: { toolName: string; data: string; success: boolean; error?: string }
): Promise<{ command: AgentActionCommand; rawOutput: string; tokenUsage: TokenUsage }> {
    const client = getOpenAIClient();
    const model = OPENAI_MODEL;

    const formattedHistory = formatActionHistory(
        history.map((e) => ({
            action: e.action.action,
            coordinates: e.action.coordinates,
            text: e.action.text,
            key: e.action.key,
            reasoning: e.reasoning,
        }))
    );
    const userTextContent = buildUserMessage(goal, formattedHistory, personaRules, toolResult);
    const boundsHint = `\n\n## SCREEN BOUNDS\nThe screen is ${screenBounds.width}x${screenBounds.height} pixels. All coordinates must be within (0,0) to (${screenBounds.width},${screenBounds.height}).`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        {
            role: 'user',
            content: [
                { type: 'text', text: userTextContent + boundsHint },
                { type: 'image_url', image_url: { url: screenshotBase64, detail: 'high' } },
            ],
        },
    ];

    log?.info('[AI] Calling Vision LLM — analyzing screen...', { model, historyLength: history.length });

    const completion = await client.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 256,
        temperature: 0.1,
    });

    const choice = completion.choices[0];
    const rawContent = choice.message.content || '';

    // Extract and log token usage.
    const usage = completion.usage;
    const tokenUsage: TokenUsage = {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        model,
    };

    log?.info('[AI] LLM call complete — tokens used', {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        model,
    });

    // Parse and validate with zod.
    let parsed: ZodAgentActionCommand;
    try {
        parsed = AgentActionCommandSchema.parse(JSON.parse(rawContent));
    } catch {
        const errorMsg = `LLM returned unparseable output: ${rawContent.substring(0, 200)}`;
        log?.error('[AI] Failed to parse LLM output', { rawContent: rawContent.substring(0, 200) });
        throw new Error(errorMsg);
    }

    log?.info(`[AI] Decided action: ${parsed.action}`, {
        action: parsed.action,
        coordinates: parsed.coordinates,
        text: parsed.text,
        key: parsed.key,
    });

    const command: AgentActionCommand = {
        action: parsed.action,
        coordinates: parsed.coordinates,
        text: parsed.text,
        key: parsed.key,
    };

    return { command, rawOutput: JSON.stringify(parsed), tokenUsage };
}

// ---------------------------------------------------------------------------
// Retry Wrapper
// ---------------------------------------------------------------------------

/**
 * Call the Vision LLM with automatic retry on transient errors.
 *
 * Retries on:
 * - 429 (rate limit) — waits longer
 * - 500/502/503 (server errors) — exponential backoff
 * - Network errors
 *
 * Does NOT retry on:
 * - 400 (bad request) — our prompt is wrong
 * - 401/403 (auth) — API key issue
 *
 * @returns The validated command and raw output string.
 */
export async function callVisionLLMWithRetry(
    screenshotBase64: string,
    goal: string,
    history: ActionHistoryEntry[],
    screenBounds: ScreenBounds,
    personaRules?: string,
    log?: TaskLogger,
    toolResult?: { toolName: string; data: string; success: boolean; error?: string }
): Promise<{ command: AgentActionCommand; rawOutput: string; tokenUsage: TokenUsage }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await callVisionLLM(
                screenshotBase64,
                goal,
                history,
                screenBounds,
                personaRules,
                log,
                toolResult
            );
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            const isRetryable = isRetryableError(lastError);
            if (!isRetryable) {
                throw lastError;
            }

            const isRateLimit = isRateLimitError(lastError);
            const baseDelay = isRateLimit ? RETRY_BASE_DELAY_MS * 2 : RETRY_BASE_DELAY_MS;
            const delay = baseDelay * Math.pow(2, attempt - 1);

            const msg = `[AI] LLM call failed (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s`;
            if (log) {
                log.warn(msg, { error: lastError.message, attempt, delay });
            } else {
                rootLogger.warn({ attempt, delay, error: lastError.message }, msg);
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw new Error(
        `LLM call failed after ${MAX_RETRIES} retries: ${lastError?.message || 'Unknown error'}`
    );
}

/**
 * Check if an error is retryable (transient server/network issue).
 */
function isRetryableError(err: Error): boolean {
    const message = err.message.toLowerCase();

    // Rate limiting.
    if (message.includes('429') || message.includes('rate limit')) return true;

    // Server errors.
    if (message.includes('500') || message.includes('502') || message.includes('503')) return true;

    // Network errors.
    if (message.includes('econnreset') || message.includes('etimedout') || message.includes('econnrefused')) return true;
    if (message.includes('network') || message.includes('timeout')) return true;

    return false;
}

/**
 * Check if an error is specifically a rate limit error.
 */
function isRateLimitError(err: Error): boolean {
    const message = err.message.toLowerCase();
    return message.includes('429') || message.includes('rate limit');
}
