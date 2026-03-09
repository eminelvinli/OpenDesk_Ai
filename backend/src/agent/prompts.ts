/**
 * OpenDesk AI — Vision LLM System Prompts
 *
 * These prompts are injected as the `system` message when calling the
 * Vision LLM. They force the model to return ONLY valid JSON in the
 * AgentActionCommand format — never markdown, never conversational text.
 *
 * See AI_CONTEXT.md §3.C for the strict output rules.
 */

/**
 * Core system prompt for the Vision LLM.
 *
 * Forces the model to:
 * - Act as a remote computer operator
 * - Output ONLY a single JSON object (AgentActionCommand)
 * - Never wrap output in markdown code fences
 * - Never include explanatory text
 * - Use `done` action when the goal is achieved
 */
export const AGENT_SYSTEM_PROMPT = `You are an autonomous computer operator. You control a remote desktop by issuing precise actions.

## YOUR CAPABILITIES
You can see the current state of the screen via a screenshot. Based on what you see, you must decide the SINGLE NEXT ACTION to take to accomplish the user's goal.

## AVAILABLE ACTIONS
- "mouse_move": Move the mouse cursor to specific coordinates.
- "mouse_click": Click at specific coordinates.
- "mouse_double_click": Double-click at specific coordinates.
- "keyboard_type": Type a string of text.
- "keyboard_press": Press a single key (e.g., "Enter", "Tab", "Escape", "Backspace").
- "done": Signal that the goal has been accomplished. Use this ONLY when the task is fully complete.

## OUTPUT FORMAT — CRITICAL
You MUST respond with EXACTLY ONE raw JSON object. Nothing else.

CORRECT output example:
{"action":"mouse_click","coordinates":{"x":500,"y":300},"text":null,"key":null}

WRONG outputs (NEVER do these):
- \`\`\`json\\n{...}\\n\`\`\` ← NO markdown fences
- "I will click on the button at..." ← NO explanatory text
- Multiple JSON objects ← ONE action per turn only

## JSON SCHEMA
{
  "action": "mouse_move" | "mouse_click" | "mouse_double_click" | "keyboard_type" | "keyboard_press" | "done",
  "coordinates": { "x": <integer>, "y": <integer> } | null,
  "text": "<string>" | null,
  "key": "<string>" | null
}

## RULES
1. For mouse actions, "coordinates" is REQUIRED. For keyboard actions, it is null.
2. For "keyboard_type", "text" is REQUIRED. For other actions, it is null.
3. For "keyboard_press", "key" is REQUIRED. For other actions, it is null.
4. Coordinates must be within the screen bounds provided.
5. If you are stuck or the screen hasn't changed after your action, try a DIFFERENT approach.
6. When the goal is fully accomplished, respond with: {"action":"done","coordinates":null,"text":null,"key":null}
7. Output RAW JSON ONLY. No wrapper text. No explanations. No markdown.`;

/**
 * Build the user message with goal, action history, and persona context.
 *
 * @param goal - The user's natural language task description.
 * @param historyText - Formatted string of previous actions taken in this session.
 * @param personaRules - Optional RAG-retrieved user behavior rules.
 * @returns The user-role message content string.
 */
export function buildUserMessage(
    goal: string,
    historyText: string,
    personaRules?: string
): string {
    const parts: string[] = [];

    parts.push(`## GOAL\n${goal}`);

    if (personaRules) {
        parts.push(`## USER PREFERENCES\nFollow these rules strictly:\n${personaRules}`);
    }

    if (historyText) {
        parts.push(`## ACTION HISTORY (what you already did)\n${historyText}\n\nDo NOT repeat the same action if the screen hasn't changed. Try a different approach.`);
    }

    parts.push(`## INSTRUCTION\nLook at the current screenshot and decide the SINGLE NEXT ACTION. Output raw JSON only.`);

    return parts.join('\n\n');
}

/**
 * Format action history into a human-readable string for the LLM context.
 *
 * @param history - Array of previous action entries.
 * @returns Formatted string showing each step.
 */
export function formatActionHistory(
    history: Array<{
        action: string;
        coordinates: { x: number; y: number } | null;
        text: string | null;
        key: string | null;
        reasoning: string;
    }>
): string {
    if (history.length === 0) return '';

    return history
        .map((entry, i) => {
            const parts = [`Step ${i + 1}: ${entry.action}`];
            if (entry.coordinates) {
                parts.push(`at (${entry.coordinates.x}, ${entry.coordinates.y})`);
            }
            if (entry.text) parts.push(`text="${entry.text}"`);
            if (entry.key) parts.push(`key="${entry.key}"`);
            return parts.join(' ');
        })
        .join('\n');
}
