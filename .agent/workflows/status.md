---
description: Display agent and project status. Progress tracking and status board.
---

# /status - Project Status (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Display the current status of the OpenDesk AI monorepo — agents, services, and task progress.

---

## Usage

```
/status           - Full status board
/status agents    - List available agents
/status services  - Service health check
```

---

## Status Board Format

```markdown
## 🌐 OpenDesk AI Status

### Services
| Service | Directory | Language | Status |
|---|---|---|---|
| Desktop Client | `/desktop_client` | Rust + Tauri | ⚪ Development |
| Gateway | `/gateway` | Go | ⚪ Development |
| Backend | `/backend` | Node.js + TS | ⚪ Development |
| Frontend | `/frontend` | Next.js + TS | ⚪ Development |

### Infrastructure
| Component | Status |
|---|---|
| MongoDB | ⚪ Not configured |
| Redis | ⚪ Not configured |
| Docker Compose | ⚪ Not configured |

### Active Agents (13)
orchestrator, project-planner, rust-specialist, go-specialist,
backend-specialist, frontend-specialist, database-architect,
security-auditor, devops-engineer, test-engineer, debugger,
explorer-agent, performance-optimizer
```
