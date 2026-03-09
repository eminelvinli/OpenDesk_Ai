/**
 * OpenDesk AI — RAG (Retrieval-Augmented Generation) Memory
 *
 * Fetches relevant Persona documents for a user to inject as context
 * into the Vision LLM prompt. Uses MongoDB Atlas Vector Search for
 * semantic matching in production; falls back to simple text matching.
 *
 * The persona context tells the LLM how the user prefers their tasks done
 * (e.g., "always use keyboard shortcuts", "reply formally in emails").
 */

import mongoose from 'mongoose';
import { Persona, IPersona } from '../db';

// ---------------------------------------------------------------------------
// Embedding (Mock)
// ---------------------------------------------------------------------------

/**
 * Generate a vector embedding for a given text.
 *
 * In production, this calls OpenAI's `text-embedding-3-small` (1536 dims)
 * or a local embedding model. Currently returns a deterministic mock vector.
 *
 * @param _text - The text to embed (unused in mock).
 * @returns A 1536-dimensional mock vector.
 */
async function generateEmbedding(_text: string): Promise<number[]> {
    // TODO: Replace with real embedding API call.
    // const response = await openai.embeddings.create({
    //   model: 'text-embedding-3-small',
    //   input: text,
    // });
    // return response.data[0].embedding;

    // Mock: return a deterministic vector seeded from text length.
    const dims = 1536;
    const seed = _text.length % 100;
    return Array.from({ length: dims }, (_, i) => Math.sin(seed + i) * 0.01);
}

// ---------------------------------------------------------------------------
// Vector Search
// ---------------------------------------------------------------------------

/**
 * Search for relevant Persona documents using MongoDB Atlas Vector Search.
 *
 * Uses the `$vectorSearch` aggregation stage to find semantically similar
 * persona rules based on the task goal embedding.
 *
 * @param userId - The user whose personas to search.
 * @param queryEmbedding - The embedding of the task goal.
 * @param limit - Maximum number of results.
 * @returns Array of matching Persona documents sorted by relevance.
 */
async function vectorSearchPersonas(
    userId: string,
    queryEmbedding: number[],
    limit: number = 3
): Promise<IPersona[]> {
    try {
        const results = await Persona.aggregate([
            {
                $vectorSearch: {
                    index: 'persona_vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: limit * 10,
                    limit,
                    filter: {
                        userId: new mongoose.Types.ObjectId(userId),
                        isActive: true,
                    },
                },
            },
        ]);
        return results as IPersona[];
    } catch {
        // Vector search index may not exist yet — fall back to simple query.
        return fallbackPersonaSearch(userId, limit);
    }
}

/**
 * Fallback: fetch active personas without vector search.
 * Used when the Atlas Vector Search index is not configured.
 */
async function fallbackPersonaSearch(
    userId: string,
    limit: number
): Promise<IPersona[]> {
    return Persona.find({
        userId: new mongoose.Types.ObjectId(userId),
        isActive: true,
    })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean<IPersona[]>();
}

// ---------------------------------------------------------------------------
// Context Injection
// ---------------------------------------------------------------------------

/**
 * Fetch relevant persona context for the current task and format it
 * for injection into the Vision LLM prompt.
 *
 * This is the main entry point used by the agentic loop.
 *
 * Pipeline:
 * 1. Generate embedding from taskGoal.
 * 2. Vector search matching Persona documents.
 * 3. Format into a rules string for the LLM.
 *
 * @param userId - The user running the task.
 * @param taskGoal - The natural language task description.
 * @returns Formatted persona rules string, or undefined if no matches.
 */
export async function injectPersonaContext(
    userId: string,
    taskGoal: string
): Promise<string | undefined> {
    try {
        const queryEmbedding = await generateEmbedding(taskGoal);
        const personas = await vectorSearchPersonas(userId, queryEmbedding);

        if (personas.length === 0) {
            return undefined;
        }

        // Format persona rules as numbered instructions.
        const rules = personas
            .map((p, i) => `${i + 1}. [${p.category.toUpperCase()}] ${p.content}`)
            .join('\n');

        console.log(`🧠 Injected ${personas.length} persona rules for user ${userId}`);
        return rules;
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown RAG error';
        console.warn(`⚠️  Persona context injection failed: ${errorMsg}`);
        return undefined;
    }
}

/**
 * Store a new persona rule with its embedding.
 *
 * @param userId - The user to associate the persona with.
 * @param label - Short label (e.g., "Email tone").
 * @param content - Full rule text (e.g., "Always reply formally in emails").
 * @param category - Category for filtering.
 * @returns The created Persona document.
 */
export async function createPersona(
    userId: string,
    label: string,
    content: string,
    category: 'communication' | 'workflow' | 'application' | 'general' = 'general'
): Promise<IPersona> {
    const embedding = await generateEmbedding(content);

    const persona = new Persona({
        userId: new mongoose.Types.ObjectId(userId),
        label,
        content,
        category,
        embedding,
        isActive: true,
    });

    await persona.save();
    console.log(`📝 Persona created: "${label}" for user ${userId}`);
    return persona;
}
