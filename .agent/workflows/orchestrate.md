---
description: Coordinate multiple agents for complex tasks. Use for multi-perspective analysis, comprehensive reviews, or tasks requiring different domain expertise.
---

# /orchestrate - Multi-Agent Orchestration (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Coordinate multiple specialist agents for tasks that span the OpenDesk AI monorepo.

---

## Usage

```
/orchestrate [task description]
```

---

## How It Works

1. **Activate** the `orchestrator` agent
2. **Analyze** which services are affected
3. **Route** to the correct specialist agents
4. **Synthesize** results into a unified report

## Available Agents

| Agent | Service |
|---|---|
| `rust-specialist` | `/desktop_client` |
| `go-specialist` | `/gateway` |
| `backend-specialist` | `/backend` |
| `frontend-specialist` | `/frontend` |
| `database-architect` | MongoDB + Redis |
| `security-auditor` | Cross-service security |
| `test-engineer` | All services |
| `devops-engineer` | Docker, CI/CD |
| `debugger` | Any service |

## Example

```
/orchestrate Add a new "scroll_down" action type to the system

→ Orchestrator detects: backend (payload contract) + rust (input simulation) + go (routing)
→ Routes to backend-specialist, rust-specialist, go-specialist
→ test-engineer generates tests for each
→ Synthesizes unified report
```
