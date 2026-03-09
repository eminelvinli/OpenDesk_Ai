---
trigger: always_on
---

# GEMINI.md - OpenDesk AI Workspace Rules

> This file defines how the AI coding agent behaves in the OpenDesk AI monorepo.

---

## CRITICAL: READ PROJECT DOCS FIRST

> **MANDATORY:** At session start, read `AI_CONTEXT.md`, `ARCHITECTURE.md`, and `TECH_STACK_SUMMARY.md` in `.agent/` to understand the full system.

### Rule Priority
P0 (GEMINI.md) > P1 (Agent .md) > P2 (SKILL.md)

### Enforcement Protocol
1. **When agent is activated:** Read Rules → Check Frontmatter → Load Skills → Apply.
2. **Forbidden:** Never skip agent rules or skill instructions.

---

## 📥 REQUEST CLASSIFIER (STEP 1)

**Before ANY action, classify the request:**

| Request Type     | Trigger Keywords                           | Active Tiers                   | Result                      |
| ---------------- | ------------------------------------------ | ------------------------------ | --------------------------- |
| **QUESTION**     | "what is", "how does", "explain"           | TIER 0 only                    | Text Response               |
| **SURVEY/INTEL** | "analyze", "list files", "overview"        | TIER 0 + Explorer              | Session Intel (No File)     |
| **SIMPLE CODE**  | "fix", "add", "change" (single file)       | TIER 0 + TIER 1 (lite)         | Inline Edit                 |
| **COMPLEX CODE** | "build", "create", "implement", "refactor" | TIER 0 + TIER 1 (full) + Agent | **{task-slug}.md Required** |
| **DESIGN/UI**    | "design", "UI", "page", "dashboard"        | TIER 0 + TIER 1 + Agent        | **{task-slug}.md Required** |
| **SLASH CMD**    | /create, /orchestrate, /debug              | Command-specific flow          | Variable                    |

---

## 🤖 INTELLIGENT AGENT ROUTING (STEP 2 - AUTO)

**ALWAYS ACTIVE: Automatically select best agent(s) for each request.**

### Auto-Selection Protocol

1. **Analyze**: Detect which microservice the request targets.
2. **Select**: Choose the correct specialist for that service.
3. **Inform**: State which expertise is applied.
4. **Apply**: Use selected agent's persona and rules.

### Response Format (MANDATORY)

```markdown
🤖 **Applying knowledge of `@[agent-name]`...**

[Continue with specialized response]
```

### Microservice Routing Table

| Directory / Domain | Primary Agent | Secondary Agents |
|---|---|---|
| `/desktop_client` (Rust + Tauri) | `rust-specialist` | `debugger`, `test-engineer` |
| `/gateway` (Go) | `go-specialist` | `debugger`, `test-engineer` |
| `/backend` (Node.js + TypeScript) | `backend-specialist` | `database-architect`, `security-auditor` |
| `/frontend` (Next.js + TypeScript) | `frontend-specialist` | `test-engineer` |
| Cross-service / Architecture | `orchestrator` | All relevant specialists |
| Database / Schema | `database-architect` | `backend-specialist` |
| Security / Auth | `security-auditor` | `backend-specialist`, `rust-specialist` |

---

## TIER 0: UNIVERSAL RULES (Always Active)

### 🔴 MICROSERVICE BOUNDARY ENFORCEMENT (CRITICAL)

**This is the #1 rule of the OpenDesk AI codebase. NEVER cross microservice boundaries.**

| Service | Language | Role | STRICTLY FORBIDDEN |
|---|---|---|---|
| `/desktop_client` | Rust + Tauri | Eyes & Hands (screen capture, input simulation) | ❌ NO AI logic, NO database access, NO task scheduling |
| `/gateway` | Go | Nervous System (WebSocket router) | ❌ NO business logic, NO database access, NO AI logic |
| `/backend` | Node.js + TS | Brain (agentic loop, LLM, DB, scheduling) | ❌ NO screen capture, NO input simulation, NO direct client comms |
| `/frontend` | Next.js + TS | Face (web dashboard for humans) | ❌ NO direct Gateway/Client access, ALL via backend API |

> 🔴 **If a user request violates these boundaries, REFUSE and suggest the correct service placement.**

### 🌐 Language Handling

When user's prompt is NOT in English:
1. **Internally translate** for comprehension
2. **Respond in user's language**
3. **Code comments/variables** in English

### 🧹 Clean Code (Global Mandatory)

**ALL code MUST follow `@[skills/clean-code]` rules. No exceptions.**

- **Code**: Concise, direct, no over-engineering. Self-documenting.
- **Testing**: Mandatory across all services.
- **Security**: Zero-trust for all inter-service communication.

### 🔴 MANDATORY: Testing Requirements (OpenDesk AI)

**Every code change MUST include tests. NO EXCEPTIONS.**

| Service | Test Framework | Minimum Coverage | Required |
|---|---|---|---|
| `/backend` (Node.js) | Jest + Supertest | 80% | ✅ MANDATORY |
| `/frontend` (Next.js) | React Testing Library + Playwright | 80% | ✅ MANDATORY |
| `/desktop_client` (Rust) | `cargo test` + `#[cfg(test)]` | 80% | ✅ MANDATORY |
| `/gateway` (Go) | `go test` (table-driven) | 80% | ✅ MANDATORY |

### 🔴 MANDATORY: Documentation Requirements

| Documentation Type | Format | When | Required |
|---|---|---|---|
| Function Documentation | JSDoc / Rustdoc / GoDoc | Every exported function | ✅ MANDATORY |
| API Contracts | TypeScript interfaces | Inter-service payloads | ✅ MANDATORY |
| Feature Documentation | README.md per service | New features/modules | ✅ MANDATORY |
| Database Changes | Migration comments + Schema docs | Schema changes | ✅ MANDATORY |

### 🗺️ System Map Read

> 🔴 **MANDATORY:** Read `ARCHITECTURE.md` and `AI_CONTEXT.md` at session start.

**Path Awareness:**
- Agents: `.agent/agents/`
- Skills: `.agent/skills/`
- Workflows: `.agent/workflows/`
- Scripts: `.agent/scripts/`
- Docs: `.agent/AI_CONTEXT.md`, `.agent/ARCHITECTURE.md`, `.agent/TECH_STACK_SUMMARY.md`

---

## TIER 1: CODE RULES (When Writing Code)

### 📱 Project Architecture (OpenDesk AI)

> 🎯 **This is a 4-service monorepo: Rust Desktop Client, Go Gateway, Node.js Backend, Next.js Frontend.**

**Full Stack:**
- Desktop Client: Rust + Tauri (screen capture, input simulation)
- Gateway: Go (WebSocket/gRPC router, Redis Pub/Sub)
- Backend: Node.js + TypeScript strict, MongoDB, Redis, BullMQ, Vision LLM integration
- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Primary DB: MongoDB (Users, Devices, TaskLogs, Personas)
- Vector DB: MongoDB Atlas Vector Search (RAG)
- Queue/Cache: Redis (BullMQ + session cache)

### 🔄 Agent Payload Contract (CRITICAL)

All inter-service JSON payloads MUST follow these exact schemas:

**Backend → Rust (Action Command):**
```json
{
  "action": "mouse_move" | "mouse_click" | "mouse_double_click" | "keyboard_type" | "keyboard_press",
  "coordinates": { "x": 1024, "y": 768 },
  "text": "Hello world",
  "key": "Enter"
}
```

**Rust → Backend (Observation Stream):**
```json
{
  "deviceId": "string",
  "timestamp": 1715623000,
  "screenBase64": "data:image/jpeg;base64,...",
  "screenBounds": { "width": 1920, "height": 1080 }
}
```

### 🛑 Socratic Gate

**For complex requests, STOP and ASK first:**

| Request Type | Strategy | Required Action |
|---|---|---|
| **New Feature / Build** | Deep Discovery | ASK minimum 3 strategic questions |
| **Code Edit / Bug Fix** | Context Check | Confirm understanding + ask impact questions |
| **Vague / Simple** | Clarification | Ask Purpose, Service, and Scope |
| **Full Orchestration** | Gatekeeper | STOP subagents until user confirms plan |

### 🏁 Final Checklist Protocol

**Trigger:** When the user says "final checks", "run all tests", or similar.

**Priority Execution Order:**
1. **Security** → 2. **Lint/Format** → 3. **Schema** → 4. **Tests** → 5. **Build**

### 🎭 Mode Mapping

| Mode | Agent | Behavior |
|---|---|---|
| **plan** | `project-planner` | 4-phase methodology. NO CODE before Phase 4. |
| **ask** | - | Focus on understanding. Ask questions. |
| **edit** | `orchestrator` | Execute. Check `{task-slug}.md` first. |

---

## TIER 2: DESIGN RULES (OpenDesk AI Dashboard)

> **Design rules are in the `frontend-specialist` agent.**

**Read:** `.agent/agents/frontend-specialist.md`

> 🔴 **For UI/design work on the Web Dashboard:** Open and READ the agent file.

---

## 📁 QUICK REFERENCE

### Active Agents (OpenDesk AI)

| Agent | Domain |
|---|---|
| `orchestrator` | Multi-agent coordination |
| `project-planner` | Task planning and breakdown |
| `rust-specialist` | Rust + Tauri Desktop Client |
| `go-specialist` | Go Gateway |
| `backend-specialist` | Node.js + TS Backend (AI Brain) |
| `frontend-specialist` | Next.js Frontend (Dashboard) |
| `database-architect` | MongoDB + Redis schemas |
| `security-auditor` | Zero-trust, device pairing, encryption |
| `devops-engineer` | Docker, CI/CD, deployment |
| `test-engineer` | Testing across all 4 services |
| `debugger` | Systematic debugging |
| `explorer-agent` | Codebase discovery |
| `performance-optimizer` | Performance profiling |

### Key Skills
- `clean-code`, `api-patterns`, `database-design`
- `react-patterns`, `nextjs-best-practices`, `tailwind-patterns`
- `nodejs-best-practices`, `testing-patterns`
- `systematic-debugging`

### Key Scripts
- **Verify**: `.agent/scripts/verify_all.py`, `.agent/scripts/checklist.py`

---
