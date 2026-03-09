---
trigger: always_on
---

# GEMINI.md - Antigravity Kit

> This file defines how the AI behaves in this workspace.

---

## CRITICAL: AGENT & SKILL PROTOCOL (START HERE)

> **MANDATORY:** Read agent file and skills BEFORE implementation.

### 1. Modular Skill Loading Protocol

Agent activated → Check frontmatter "skills:" → Read SKILL.md (INDEX) → Read specific sections.

- **Selective Reading:** Read `SKILL.md` first, then only sections matching the request.
- **Rule Priority:** P0 (GEMINI.md) > P1 (Agent .md) > P2 (SKILL.md).

### 2. Enforcement Protocol

1. **When agent is activated:** Read Rules → Check Frontmatter → Load SKILL.md → Apply.
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

> 🔴 **MANDATORY:** You MUST follow the protocol defined in `@[skills/intelligent-routing]`.

### Auto-Selection Protocol

1. **Analyze**: Detect domains from request.
2. **Select**: Choose appropriate specialist(s).
3. **Inform**: State which expertise is applied.
4. **Apply**: Use selected agent's persona and rules.

### Response Format (MANDATORY)

When auto-applying an agent, inform the user:

```markdown
🤖 **Applying knowledge of `@[agent-name]`...**

[Continue with specialized response]
```

**Rules:**

1. **Silent Analysis**: No verbose commentary.
2. **Respect Overrides**: If user mentions `@agent`, use it.
3. **Complex Tasks**: Use `orchestrator` and ask questions first.

---

## TIER 0: UNIVERSAL RULES (Always Active)

### 🌐 Language Handling

When user's prompt is NOT in English:

1. **Internally translate** for comprehension
2. **Respond in user's language**
3. **Code comments/variables** in English

### 🧹 Clean Code (Global Mandatory)

**ALL code MUST follow `@[skills/clean-code]` rules. No exceptions.**

- **Code**: Concise, direct, no over-engineering. Self-documenting.
- **Testing**: Mandatory. Pyramid (Unit > Int > E2E) + AAA Pattern.
- **Performance**: Measure first. Adhere to 2025 standards (Core Web Vitals).
- **Infra/Safety**: 5-Phase Deployment. Verify secrets security.

### 🔴 MANDATORY: Testing Requirements (AppDataCo)

**Every code change MUST include tests. NO EXCEPTIONS.**

| Code Type | Test Framework | Minimum Coverage | Required |
|-----------|----------------|------------------|----------|
| Backend Logic | Jest | 80% | ✅ MANDATORY |
| API Endpoints | Jest + Supertest | 100% critical paths | ✅ MANDATORY |
| React Components | React Testing Library | 80% | ✅ MANDATORY |
| Critical User Flows | Playwright (E2E) | All flows | ✅ MANDATORY |

**Test must include:**
- AAA Pattern (Arrange, Act, Assert)
- Edge cases coverage
- Error handling scenarios
- Integration with dependencies

### 🔴 MANDATORY: Documentation Requirements (AppDataCo)

**Every code change MUST include documentation. NO EXCEPTIONS.**

| Documentation Type | Format | When | Required |
|-------------------|--------|------|----------|
| Function Documentation | JSDoc | Every exported function | ✅ MANDATORY |
| API Endpoints | Swagger/OpenAPI | Every endpoint | ✅ MANDATORY |
| Feature Documentation | README.md | New features/modules | ✅ MANDATORY |
| Database Changes | Migration comments + Schema docs | Schema changes | ✅ MANDATORY |
| Complex Logic | Inline comments | Non-obvious code | ✅ MANDATORY |

**Documentation must include:**
- Purpose and usage examples
- Parameter descriptions and types
- Return values and error cases
- Dependencies and side effects

### 📁 File Dependency Awareness

**Before modifying ANY file:**

1. Check `CODEBASE.md` → File Dependencies
2. Identify dependent files
3. Update ALL affected files together

### 🗺️ System Map Read

> 🔴 **MANDATORY:** Read `ARCHITECTURE.md` at session start to understand Agents, Skills, and Scripts.

**Path Awareness:**

- Agents: `.agent/` (Project)
- Skills: `.agent/skills/` (Project)
- Runtime Scripts: `.agent/skills/<skill>/scripts/`

### 🧠 Read → Understand → Apply

```
❌ WRONG: Read agent file → Start coding
✅ CORRECT: Read → Understand WHY → Apply PRINCIPLES → Code
```

**Before coding, answer:**

1. What is the GOAL of this agent/skill?
2. What PRINCIPLES must I apply?
3. How does this DIFFER from generic output?

---

## TIER 1: CODE RULES (When Writing Code)

### 📱 Project Type Routing (AppDataCo)

> 🎯 **This is a WEB + BACKEND project ONLY.**

| Project Type | Primary Agent | Skills | Status |
|--------------|---------------|--------|--------|
| **WEB** (Next.js 16 + React) | `frontend-specialist` | frontend-design, react-patterns, tailwind-patterns | ✅ THIS PROJECT |
| **BACKEND** (Express 5.x + Node.js) | `backend-specialist` | api-patterns, nodejs-best-practices, database-design | ✅ THIS PROJECT |

**Project Stack:**
- Frontend: Next.js 16, React 19, Tailwind v4, Ant Design 6.x (Port: 7001)
- Backend: Node.js + Express 5.x, MongoDB, ClickHouse, BullMQ (Port: 6001)
- Testing: Jest, Supertest, React Testing Library, Playwright

### 🛑 Socratic Gate

**For complex requests, STOP and ASK first:**

### 🛑 GLOBAL SOCRATIC GATE (TIER 0)

**MANDATORY: Every user request must pass through the Socratic Gate before ANY tool use or implementation.**

| Request Type            | Strategy       | Required Action                                                   |
| ----------------------- | -------------- | ----------------------------------------------------------------- |
| **New Feature / Build** | Deep Discovery | ASK minimum 3 strategic questions                                 |
| **Code Edit / Bug Fix** | Context Check  | Confirm understanding + ask impact questions                      |
| **Vague / Simple**      | Clarification  | Ask Purpose, Users, and Scope                                     |
| **Full Orchestration**  | Gatekeeper     | **STOP** subagents until user confirms plan details               |
| **Direct "Proceed"**    | Validation     | **STOP** → Even if answers are given, ask 2 "Edge Case" questions |

**Protocol:**

1. **Never Assume:** If even 1% is unclear, ASK.
2. **Handle Spec-heavy Requests:** When user gives a list (Answers 1, 2, 3...), do NOT skip the gate. Instead, ask about **Trade-offs** or **Edge Cases** (e.g., "LocalStorage confirmed, but should we handle data clearing or versioning?") before starting.
3. **Wait:** Do NOT invoke subagents or write code until the user clears the Gate.
4. **Reference:** Full protocol in `@[skills/brainstorming]`.

### 🏁 Final Checklist Protocol

**Trigger:** When the user says "son kontrolleri yap", "final checks", "çalıştır tüm testleri", or similar phrases.

| Task Stage       | Command                                            | Purpose                        |
| ---------------- | -------------------------------------------------- | ------------------------------ |
| **Manual Audit** | `python .agent/scripts/checklist.py .`             | Priority-based project audit   |
| **Pre-Deploy**   | `python .agent/scripts/checklist.py . --url <URL>` | Full Suite + Performance + E2E |

**Priority Execution Order:**

1. **Security** → 2. **Lint** → 3. **Schema** → 4. **Tests** → 5. **UX** → 6. **Seo** → 7. **Lighthouse/E2E**

**Rules:**

- **Completion:** A task is NOT finished until `checklist.py` returns success.
- **Reporting:** If it fails, fix the **Critical** blockers first (Security/Lint).

**Available Scripts (AppDataCo):**

| Script | Skill | When to Use | Status |
|--------|-------|-------------|--------|
| `security_scan.py` | vulnerability-scanner | Always on deploy | ✅ |
| `dependency_analyzer.py` | vulnerability-scanner | Weekly / Deploy | ✅ |
| `lint_runner.py` | lint-and-validate | Every code change | ✅ |
| `test_runner.py` | testing-patterns | After logic change | ✅ |
| `schema_validator.py` | database-design | After DB change | ✅ |
| `ux_audit.py` | frontend-design | After UI change | ✅ |
| `accessibility_checker.py` | frontend-design | After UI change | ✅ |
| `seo_checker.py` | seo-fundamentals | After page change | ✅ |
| `bundle_analyzer.py` | performance-profiling | Before deploy | ✅ |
| `lighthouse_audit.py` | performance-profiling | Before deploy | ✅ |
| `playwright_runner.py` | webapp-testing | Before deploy | ✅ |

> 🔴 **Agents & Skills can invoke ANY script** via `python .agent/skills/<skill>/scripts/<script>.py`

### 🎭 Gemini Mode Mapping

| Mode     | Agent             | Behavior                                     |
| -------- | ----------------- | -------------------------------------------- |
| **plan** | `project-planner` | 4-phase methodology. NO CODE before Phase 4. |
| **ask**  | -                 | Focus on understanding. Ask questions.       |
| **edit** | `orchestrator`    | Execute. Check `{task-slug}.md` first.       |

**Plan Mode (4-Phase):**

1. ANALYSIS → Research, questions
2. PLANNING → `{task-slug}.md`, task breakdown
3. SOLUTIONING → Architecture, design (NO CODE!)
4. IMPLEMENTATION → Code + tests

> 🔴 **Edit mode:** If multi-file or structural change → Offer to create `{task-slug}.md`. For single-file fixes → Proceed directly.

---

## TIER 2: DESIGN RULES (AppDataCo)

> **Design rules are in the frontend-specialist agent.**

**Read:** `.agent/agents/frontend-specialist.md`

**This agent contains:**
- Purple Ban (no violet/purple colors)
- Template Ban (no standard layouts)
- Anti-cliché rules
- Deep Design Thinking protocol
- Ant Design 6.x component library standards

> 🔴 **For design work:** Open and READ the agent file. Rules are there.

---

## 📁 QUICK REFERENCE

### Agents & Skills (AppDataCo)

**Active Agents:**
- `orchestrator` - Multi-agent coordination
- `project-planner` - Task planning and breakdown
- `backend-specialist` - Node.js/Express + MongoDB/ClickHouse
- `frontend-specialist` - Next.js 16 + React 19 + Ant Design
- `database-architect` - MongoDB + ClickHouse schemas
- `test-engineer` - Jest + Supertest + RTL + Playwright
- `security-auditor` - OWASP + vulnerability scanning
- `debugger` - Systematic debugging
- `performance-optimizer` - Web performance optimization

**Key Skills:**
- `clean-code`, `brainstorming`, `app-builder`
- `frontend-design`, `react-patterns`, `tailwind-patterns`, `nextjs-best-practices`
- `nodejs-best-practices`, `api-patterns`, `database-design`
- `testing-patterns`, `tdd-workflow`, `webapp-testing`
- `vulnerability-scanner`, `systematic-debugging`

### Key Scripts

- **Verify**: `.agent/scripts/verify_all.py`, `.agent/scripts/checklist.py`
- **Scanners**: `security_scan.py`, `dependency_analyzer.py`
- **Audits**: `ux_audit.py`, `mobile_audit.py`, `lighthouse_audit.py`, `seo_checker.py`
- **Test**: `playwright_runner.py`, `test_runner.py`

---
