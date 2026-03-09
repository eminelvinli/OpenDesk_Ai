# Database Selection (AppDataCo)

> **PROJECT CONTEXT:** This project uses MongoDB + ClickHouse dual-database architecture.

## Data Residency Rules

```
What type of data?
│
├── State Data (CRUD, dynamic)
│   └── MongoDB (Mongoose)
│   │
│   Examples:
│   ├── User accounts, settings
│   ├── App metadata, credentials
│   └── TrackedKeyword status
│
└── Historical/Analytics (append-only)
    └── ClickHouse
    │
    Examples:
    ├── Historical rankings
    ├── SERP history
    └── Error logs (Flight Recorder)
```

## Comparison

| Database | Use Case | Access Pattern |
|----------|----------|----------------|
| **MongoDB** | State, CRUD | Mongoose ODM |
| **ClickHouse** | Analytics, time-series | Raw SQL via `@clickhouse/client` |

## Decision Checklist

1. Is this data updated frequently? → MongoDB
2. Is this historical/append-only? → ClickHouse
3. Need transactions? → MongoDB
4. Need aggregations over time? → ClickHouse
5. Web scraper results? → ClickHouse (with state in MongoDB)
