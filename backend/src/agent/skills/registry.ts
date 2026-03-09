/**
 * OpenDesk AI — Agent Skills Registry
 *
 * Defines the 4 OS-level tool capabilities the Vision LLM can invoke
 * beyond basic mouse/keyboard actions. These are described in JSON Schema
 * format, compatible with OpenAI's function/tool calling API.
 *
 * Each skill describes:
 *  - What the tool does (for LLM prompting and tool selection)
 *  - What parameters it accepts
 *  - What data it returns to the loop (via ClipboardObservationPayload)
 *
 * The Rust client implements the actual OS-level execution.
 * Results are returned to the backend as a `tool_result` observation.
 */

// ---------------------------------------------------------------------------
// Tool Action Types (extend AgentActionType)
// ---------------------------------------------------------------------------

export const SKILL_ACTIONS = [
    'read_clipboard',
    'write_clipboard',
    'scroll_window',
    'get_active_window_title',
] as const;

export type SkillActionType = typeof SKILL_ACTIONS[number];

// ---------------------------------------------------------------------------
// JSON Schema Tool Definitions (OpenAI function calling format)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
    name: SkillActionType;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, { type: string; description: string; enum?: string[] }>;
        required: string[];
    };
}

export const SKILL_REGISTRY: ToolDefinition[] = [
    {
        name: 'read_clipboard',
        description:
            'Read the current contents of the OS clipboard. Use this after selecting and copying text ' +
            'to retrieve long text that cannot be read from the screenshot alone. ' +
            'The result will appear as a tool_result in the next observation.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'write_clipboard',
        description:
            'Write a string of text directly to the OS clipboard. ' +
            'Use this to prepare text for pasting (Ctrl+V / Cmd+V) without typing it character by character. ' +
            'Faster and more reliable than keyboard_type for long text.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to write to the clipboard.',
                },
            },
            required: ['text'],
        },
    },
    {
        name: 'scroll_window',
        description:
            'Scroll the window at the current mouse position up or down. ' +
            'Use this to reveal content below or above the visible viewport, ' +
            'or to navigate lists, dropdowns, and long documents.',
        parameters: {
            type: 'object',
            properties: {
                direction: {
                    type: 'string',
                    description: 'Direction to scroll.',
                    enum: ['up', 'down'],
                },
                amount: {
                    type: 'string',
                    description: 'Number of scroll ticks (1–10). Use 1 for precise scrolling, 5+ for fast navigation.',
                },
            },
            required: ['direction', 'amount'],
        },
    },
    {
        name: 'get_active_window_title',
        description:
            'Get the title of the currently focused window (e.g., "Google Chrome - OpenAI"). ' +
            'Use this to confirm that the correct application is in focus before typing, ' +
            'or to verify navigation has succeeded. ' +
            'The result will appear as a tool_result in the next observation.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];

// ---------------------------------------------------------------------------
// Skill Prompt Block (injected into AGENT_SYSTEM_PROMPT)
// ---------------------------------------------------------------------------

/**
 * Generate the TOOLS section of the system prompt describing all skills.
 * This is appended to AGENT_SYSTEM_PROMPT so the LLM knows what tools exist.
 */
export function buildSkillsPromptSection(): string {
    const lines: string[] = ['## ADDITIONAL OS TOOLS'];

    lines.push(
        'You also have access to these advanced OS-level tools. ' +
        'Use them when mouse/keyboard alone are inefficient or unreliable.\n'
    );

    for (const tool of SKILL_REGISTRY) {
        const paramList = Object.keys(tool.parameters.properties);
        const paramDesc = paramList.length > 0
            ? paramList.map((p) => {
                const def = tool.parameters.properties[p];
                const enumStr = def.enum ? ` (${def.enum.join('|')})` : '';
                return `"${p}"${enumStr}`;
            }).join(', ')
            : 'no parameters';

        lines.push(`### ${tool.name}`);
        lines.push(tool.description);
        lines.push(`Parameters: { ${paramDesc} }\n`);
    }

    lines.push(
        '### Tool Usage in JSON\n' +
        'Use the same JSON format, adding a "params" field:\n' +
        '{"action":"write_clipboard","coordinates":null,"text":null,"key":null,"params":{"text":"Hello world"}}\n' +
        '{"action":"scroll_window","coordinates":null,"text":null,"key":null,"params":{"direction":"down","amount":"3"}}\n' +
        '{"action":"read_clipboard","coordinates":null,"text":null,"key":null,"params":{}}\n' +
        '{"action":"get_active_window_title","coordinates":null,"text":null,"key":null,"params":{}}\n\n' +
        'IMPORTANT: Tools that query data (read_clipboard, get_active_window_title) will return their\n' +
        'result in the NEXT observation as a "tool_result" field. Read it before deciding your next action.'
    );

    return lines.join('\n');
}
