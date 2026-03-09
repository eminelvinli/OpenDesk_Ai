# Database Selection (OpenDesk AI)

> **PROJECT CONTEXT:** This project uses MongoDB (primary) + MongoDB Atlas Vector Search (RAG) + Redis (cache/queues).

## Data Residency Rules

```
What type of data?
│
├── State Data (CRUD, dynamic)
│   └── MongoDB (Mongoose)
│   │
│   Examples:
│   ├── Users (credentials, API keys, subscriptions)
│   ├── Devices (DeviceID → UserID, OS, screen resolution)
│   └── TaskLogs (every step the AI takes)
│
├── Persona / RAG Data (semantic search)
│   └── MongoDB Atlas Vector Search
│   │
│   Examples:
│   ├── User behavior rules ("I never use emojis")
│   └── Preference embeddings for context injection
│
└── Ephemeral Data (cache, queues, pub/sub)
    └── Redis
    │
    Examples:
    ├── BullMQ job queues (scheduled_tasks, immediate_tasks)
    ├── Active device session cache
    └── Go Gateway ↔ Node.js Pub/Sub messages
```

## Comparison

| Database | Use Case | Access Pattern |
|----------|----------|----------------|
| **MongoDB** | Users, Devices, TaskLogs | Mongoose ODM |
| **MongoDB Vector Search** | Persona embeddings (RAG) | Native driver `$vectorSearch` |
| **Redis** | Queues, cache, Pub/Sub | ioredis + BullMQ |

## Decision Checklist

1. Is this persistent user/device/task data? → MongoDB
2. Is this text that needs semantic search? → MongoDB Vector Search
3. Is this a scheduled or queued job? → Redis (BullMQ)
4. Is this temporary session state? → Redis
5. Is this inter-service messaging? → Redis Pub/Sub
