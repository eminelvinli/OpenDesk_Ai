---
description: Create new application command. Triggers App Builder skill and starts interactive dialogue with user.
---

# /create - Create New Service Component (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Scaffold a new module, feature, or component within one of the 4 OpenDesk AI services.

---

## Usage

```
/create [component] in [service]
```

## Examples

```
/create new API endpoint in backend
/create screen capture module in desktop_client
/create device list page in frontend
/create redis pubsub handler in gateway
```

---

## Flow

1. **Identify service** → Which of the 4 services?
2. **Clarify scope** → Ask 2-3 questions about requirements
3. **Create plan** → Generate `{task-slug}.md` with task breakdown
4. **Route** → Hand off to the correct specialist agent
5. **Implement** → Build with tests and documentation

## Service Routing

| Target | Agent |
|---|---|
| `/desktop_client` | `rust-specialist` |
| `/gateway` | `go-specialist` |
| `/backend` | `backend-specialist` |
| `/frontend` | `frontend-specialist` |

> 🔴 **Always create a plan file before writing code for complex components.**
