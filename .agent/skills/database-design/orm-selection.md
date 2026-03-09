# Data Access Layer (OpenDesk AI)

> **PROJECT CONTEXT:** MongoDB uses Mongoose, Redis uses ioredis/BullMQ.

## Data Access Patterns

```
What database?
│
├── MongoDB
│   └── Mongoose (ODM)
│   │
│   Features:
│   ├── Schema validation
│   ├── Middleware hooks
│   ├── Virtuals
│   └── Aggregate pipelines
│
├── MongoDB Atlas Vector Search
│   └── mongodb native driver
│   │
│   Features:
│   ├── Semantic similarity search
│   ├── Embedding storage
│   └── RAG persona retrieval
│
└── Redis
    └── ioredis + BullMQ
    │
    Features:
    ├── Job queues (BullMQ)
    ├── Pub/Sub messaging
    └── Session/state caching
```

## Mongoose Patterns

```javascript
// Model definition
const DeviceSchema = new Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  osType: { type: String, enum: ['windows', 'macos', 'linux'] },
  screenBounds: { width: Number, height: Number },
  lastSeen: { type: Date, default: Date.now }
});

// Query
const device = await Device.findOne({ deviceId }).lean();
```

## Vector Search Patterns

```javascript
// Semantic search for RAG persona
const results = await collection.aggregate([
  {
    $vectorSearch: {
      queryVector: embedding,
      path: "embedding",
      numCandidates: 100,
      limit: 5,
      index: "persona_index"
    }
  }
]).toArray();
```

## Anti-Patterns

❌ Using Prisma/Drizzle (not in this project)
❌ Storing permanent data in Redis (use MongoDB)
❌ Skipping Mongoose schema validation
❌ Raw MongoDB queries when Mongoose suffices
