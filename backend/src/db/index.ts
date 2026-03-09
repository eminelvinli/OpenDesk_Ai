/**
 * OpenDesk AI — Mongoose Schemas & Models
 *
 * Defines the MongoDB document interfaces and Mongoose schemas for:
 * - User: authenticated user accounts
 * - Device: paired desktop clients linked to users
 * - TaskLog: task lifecycle tracking with full action history
 * - Persona: user preference rules with vector embeddings for RAG
 *
 * All documents use strict TypeScript interfaces. No `any` types.
 */

import mongoose, { Schema, Document, Types } from 'mongoose';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/** User document interface. */
export interface IUser extends Document {
    _id: Types.ObjectId;
    email: string;
    displayName: string;
    passwordHash: string;
    apiKeys: Array<{
        provider: 'openai' | 'anthropic' | 'google';
        encryptedKey: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        apiKeys: [
            {
                provider: {
                    type: String,
                    enum: ['openai', 'anthropic', 'google'],
                    required: true,
                },
                encryptedKey: {
                    type: String,
                    required: true,
                },
            },
        ],
    },
    { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

/** Operating system types for paired devices. */
export type OsType = 'windows' | 'macos' | 'linux';

/** Device document interface. */
export interface IDevice extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    deviceId: string;
    name: string;
    osType: OsType;
    screenBounds: {
        width: number;
        height: number;
    };
    lastSeen: Date;
    isOnline: boolean;
    pairingCode: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        deviceId: {
            type: String,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        osType: {
            type: String,
            enum: ['windows', 'macos', 'linux'],
            required: true,
        },
        screenBounds: {
            width: { type: Number, required: true },
            height: { type: Number, required: true },
        },
        lastSeen: {
            type: Date,
            default: Date.now,
        },
        isOnline: {
            type: Boolean,
            default: false,
        },
        pairingCode: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

/** Index for quick lookup by userId + online status. */
DeviceSchema.index({ userId: 1, isOnline: 1 });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);

// ---------------------------------------------------------------------------
// TaskLog
// ---------------------------------------------------------------------------

/** Action history entry stored in MongoDB. */
const ActionHistoryEntrySchema = new Schema(
    {
        action: {
            action: {
                type: String,
                enum: [
                    'mouse_move',
                    'mouse_click',
                    'mouse_double_click',
                    'keyboard_type',
                    'keyboard_press',
                    'done',
                ],
                required: true,
            },
            coordinates: {
                x: { type: Number },
                y: { type: Number },
            },
            text: { type: String, default: null },
            key: { type: String, default: null },
        },
        screenshotBase64: { type: String, required: true },
        timestamp: { type: Number, required: true },
        reasoning: { type: String, required: true },
    },
    { _id: false }
);

/** Task lifecycle states. */
export type TaskStatus =
    | 'pending'
    | 'scheduled'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'stuck';

/** TaskLog document interface. */
export interface ITaskLog extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    deviceId: string;
    goal: string;
    status: TaskStatus;
    actionHistory: Array<{
        action: {
            action: string;
            coordinates: { x: number; y: number } | null;
            text: string | null;
            key: string | null;
        };
        screenshotBase64: string;
        timestamp: number;
        reasoning: string;
    }>;
    scheduledAt: Date | null;
    errorMessage: string | null;
    iterationCount: number;
    maxIterations: number;
    createdAt: Date;
    updatedAt: Date;
}

const TaskLogSchema = new Schema<ITaskLog>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        deviceId: {
            type: String,
            required: true,
            index: true,
        },
        goal: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'scheduled', 'running', 'paused', 'completed', 'failed', 'stuck'],
            default: 'pending',
            index: true,
        },
        actionHistory: [ActionHistoryEntrySchema],
        scheduledAt: {
            type: Date,
            default: null,
        },
        errorMessage: {
            type: String,
            default: null,
        },
        iterationCount: {
            type: Number,
            default: 0,
        },
        maxIterations: {
            type: Number,
            default: 50,
        },
    },
    { timestamps: true }
);

/** Compound index for querying tasks by user + status. */
TaskLogSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const TaskLog = mongoose.model<ITaskLog>('TaskLog', TaskLogSchema);

// ---------------------------------------------------------------------------
// Persona (RAG-enabled user preferences)
// ---------------------------------------------------------------------------

/** Persona document interface with vector embedding for semantic search. */
export interface IPersona extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    label: string;
    content: string;
    category: 'communication' | 'workflow' | 'application' | 'general';
    embedding: number[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PersonaSchema = new Schema<IPersona>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
        content: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            enum: ['communication', 'workflow', 'application', 'general'],
            default: 'general',
        },
        embedding: {
            type: [Number],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

/**
 * MongoDB Atlas Vector Search index definition (create manually in Atlas):
 *
 * {
 *   "type": "vectorSearch",
 *   "name": "persona_vector_index",
 *   "fields": [{
 *     "type": "vector",
 *     "path": "embedding",
 *     "numDimensions": 1536,
 *     "similarity": "cosine"
 *   }]
 * }
 */
PersonaSchema.index({ userId: 1, isActive: 1 });

export const Persona = mongoose.model<IPersona>('Persona', PersonaSchema);
