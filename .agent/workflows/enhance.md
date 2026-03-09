---
description: Add or update features in existing application. Used for iterative development.
---

# /enhance - Feature Enhancement (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Add new features or update existing ones within the OpenDesk AI monorepo.

---

## Usage

```
/enhance [description]
```

## Examples

```
/enhance Add retry logic to the agentic loop
/enhance Improve WebSocket reconnection in desktop_client
/enhance Add task filtering to the dashboard
/enhance Add scroll_down action to the payload contract
```

---

## Flow

1. **Analyze** → Which service(s) does this affect?
2. **Check boundaries** → Verify the feature belongs in the correct service
3. **Plan** → If multi-service, create `{task-slug}.md`
4. **Implement** → Route to specialist agent(s)
5. **Test** → Write tests for the enhancement
6. **Verify** → Run service tests

## Routing

- Single-service change → Route directly to specialist
- Multi-service change → Use `orchestrator` agent
- Cross-service contract change → Update interfaces in ALL affected services
