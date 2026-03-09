# Data Access Layer (AppDataCo)

> **PROJECT CONTEXT:** MongoDB uses Mongoose, ClickHouse uses raw client.

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
└── ClickHouse
    └── @clickhouse/client (raw queries)
    │
    Features:
    ├── Raw SQL queries
    ├── Parameterized queries
    └── Defensive result parsing
```

## Mongoose Patterns

```javascript
// Model definition
const AppSchema = new Schema({
  app_id: { type: String, required: true, index: true },
  store: { type: String, enum: ['google', 'apple'] },
  metadata: { type: Object }
});

// Query
const app = await App.findOne({ app_id }).lean();
```

## ClickHouse Patterns

```javascript
// Defensive parsing (CRITICAL)
const result = await clickhouse.query({
  query: 'SELECT * FROM rankings WHERE app_id = {appId:String}',
  query_params: { appId }
});
const data = await result.json();
const rows = Array.isArray(data) ? data : data.data; // Defensive!

// Mutations (must wait for completion)
await clickhouse.command({
  query: `ALTER TABLE rankings DELETE WHERE job_id = '${jobId}'`
});
// Wait for mutation to complete before proceeding
```

## Anti-Patterns

❌ Using Prisma/Drizzle (not installed)
❌ Skipping defensive parsing for ClickHouse
❌ Mixing state data into ClickHouse
❌ Storing time-series in MongoDB
