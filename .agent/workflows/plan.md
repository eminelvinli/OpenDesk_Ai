---
description: Create project plan using project-planner agent. No code writing - only plan file generation.
---

# /plan - Project Planning (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Create a structured plan for a feature or task. Generates a `{task-slug}.md` file with task breakdown across all affected services. **No code is written in this command.**

---

## Usage

```
/plan [feature or task description]
```

## Examples

```
/plan Implement device pairing with secure handshake
/plan Add scroll action to the agentic loop
/plan Build the task scheduling UI
```

---

## Plan Methodology

### Phase 1: ANALYSIS
- Understand the feature requirements
- Identify affected services
- Research existing code patterns

### Phase 2: PLANNING
- Create `{task-slug}.md` with task breakdown
- Group tasks by service: `/desktop_client`, `/gateway`, `/backend`, `/frontend`
- Define cross-service dependencies and payload contracts

### Phase 3: SOLUTIONING
- Architecture design for the feature
- Data models, API endpoints, component hierarchy
- **NO CODE in this phase**

### Phase 4: HANDOVER
- Present plan for user review
- After approval, hand off to specialist agents for implementation

---

## Output

A `{task-slug}.md` file with:
- Feature description
- Affected services
- Task checklist per service
- Cross-service contract changes
- Testing plan
