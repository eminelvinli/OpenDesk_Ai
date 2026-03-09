---
description: Structured brainstorming for projects and features. Explores multiple options before implementation.
---

# /brainstorm - Structured Brainstorming (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Explore multiple approaches before committing to implementation. Think broadly across the 4 OpenDesk AI services.

---

## Usage

```
/brainstorm [topic or feature]
```

## Examples

```
/brainstorm How should we handle multi-monitor screen capture?
/brainstorm What's the best approach for streaming screenshots to the dashboard?
/brainstorm How to implement user persona embedding for RAG?
```

---

## Brainstorm Process

### Step 1: Frame the Problem
- What are we trying to solve?
- Which service(s) are affected?
- What are the constraints?

### Step 2: Generate Options (Minimum 3)
For each option:
- **Approach**: Describe the solution
- **Pros**: Benefits
- **Cons**: Drawbacks
- **Service Impact**: Which services need changes?
- **Effort**: Low / Medium / High

### Step 3: Evaluate
- Compare against OpenDesk AI architecture constraints
- Check microservice boundary compliance
- Assess performance impact on the agentic loop

### Step 4: Recommend
- Present the recommended approach with rationale
- Identify risks and mitigation strategies

---

## Output Format

```markdown
## 🧠 Brainstorm: [Topic]

### Option A: [Name]
- **Approach**: ...
- **Pros**: ...
- **Cons**: ...
- **Services**: /backend, /desktop_client
- **Effort**: Medium

### Option B: [Name]
...

### Option C: [Name]
...

### ✅ Recommendation: Option [X]
**Reason**: [Why this option best fits OpenDesk AI architecture]
```
