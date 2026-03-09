---
description: Debugging command for OpenDesk AI. Activates systematic 4-phase debugging across Rust, Go, Node.js, and Next.js services.
---

# /debug - Systematic Debugging (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Activate systematic debugging mode for the OpenDesk AI monorepo.

---

## Usage

```
/debug [description]    - Start debugging with issue description
/debug [service]        - Debug a specific service (backend, frontend, gateway, client)
```

---

## 4-Phase Methodology

### Phase 1: REPRODUCE
- Which service is the issue in?
- Can it be reproduced consistently?
- Capture relevant logs

### Phase 2: ISOLATE
- Is it a single-service or cross-service issue?
- Trace the data flow: Rust → Go → Node.js → Next.js
- Check inter-service communication (WebSocket, Redis Pub/Sub, REST API)

### Phase 3: FIX
- Apply fix in the CORRECT service directory only
- Respect microservice boundaries
- Add a regression test

### Phase 4: VERIFY
- Run service tests to confirm fix
- Verify cross-service communication if applicable
- Confirm original issue is resolved

---

## Common Debug Targets

| Issue | Service | Diagnostic Command |
|---|---|---|
| Screenshot not streaming | Rust / Go | Check WebSocket logs, screen capture thread |
| AI stuck in loop | Node.js Backend | Check `actionHistory`, LLM responses |
| Dashboard not updating | Next.js Frontend | Check SSE/WebSocket connection to backend |
| Device offline | Go Gateway | Check connection pool, Redis Pub/Sub |
| Scheduled task not firing | Node.js Backend | Check BullMQ worker, Redis connection |

---

## Diagnostic Commands

```bash
# Backend logs
docker compose logs backend -f

# Gateway logs
docker compose logs gateway -f

# Redis Pub/Sub monitor
redis-cli monitor

# MongoDB query inspection
mongosh --eval "db.TaskLogs.find().sort({timestamp: -1}).limit(5)"
```
