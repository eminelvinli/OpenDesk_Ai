# 🌐 OpenDesk AI: The Autonomous AI Operator

## 🎯 1. Project Vision & Executive Summary
**OpenDesk AI** is an enterprise-grade, open-source autonomous agent system. The core concept is **"AnyDesk, but operated by an AI."** Instead of a human remotely connecting to a computer to perform tasks, a Vision-Language Model (Vision LLM like Qwen 3.5, Claude 3.5 Sonnet) acts as the operator. Users install a lightweight desktop client and use a central Web Dashboard to assign natural language tasks (e.g., *"At 5 PM, open Facebook, reply to my messages in my usual formal tone, then at 9 PM generate an AI image and post it"*). The system observes the screen, reasons about the UI, and executes native OS-level mouse and keyboard actions autonomously to achieve the goal.

---

## 🏗️ 2. Global System Architecture & Tech Stack
To ensure maximum performance, isolation, and scalability, OpenDesk AI is built as a **Monorepo Microservices Architecture**. 



### A. Desktop Client (`/desktop_client`)
* **Tech Stack:** **Rust** (Core OS Logic) + **Tauri** (Minimal Cross-Platform UI).
* **Role:** Acts as the physical "eyes and hands" of the AI.
* **Responsibilities:** * Take ultra-fast, low-resource screen captures (using libraries like `scrap` or `xcap`).
  * Execute coordinate-based mouse movements, clicks, and keystrokes securely at the OS level (using `enigo` or `mouce`).
  * Maintain a persistent, real-time WebSocket/gRPC connection to the Gateway Server.
  * Provide a minimal UI for the user to "Pair Device" or "Login".

### B. Real-time Gateway Server (`/gateway`)
* **Tech Stack:** **Go (Golang)**.
* **Role:** The high-throughput traffic controller.
* **Responsibilities:**
  * Handle thousands of concurrent, long-lived WebSocket/gRPC connections from Rust clients.
  * Act as a pass-through router: Receive continuous base64 image streams from Rust and forward them to the Node.js backend without blocking the event loop.
  * Route execution commands (JSON actions) from the Node.js backend back to the specific Rust client.

### C. The AI Brain & Core Backend (`/backend`)
* **Tech Stack:** **Node.js, TypeScript**.
* **Role:** The central intelligence, task orchestrator, and memory manager.
* **Responsibilities:**
  * Manage the **Agentic Loop** (Reasoning + Acting) via LangGraph.js or custom state machines.
  * Integrate with Vision LLM APIs.
  * Schedule and execute deferred tasks using **BullMQ** (Redis).
  * Manage Long-Term Memory via **Retrieval-Augmented Generation (RAG)**.

### D. Web Dashboard & User Portal (`/frontend`)
* **Tech Stack:** **Next.js (App Router), TypeScript, TailwindCSS**.
* **Role:** The control center for the human user.
* **Responsibilities:**
  * User authentication and device management.
  * Prompt input interface for creating immediate or scheduled multi-step tasks.
  * Live-view dashboard (VNC-like) to watch the AI operate the desktop in real-time.

### E. Database Layer
* **Primary DB:** **MongoDB** (Users, Devices, Task Logs, Agent State).
* **Vector DB:** **MongoDB Vector Search** (Storing user personas, preferences, and historical context for RAG).
* **Queue DB:** **Redis** (For BullMQ task scheduling and ephemeral state caching).

---

## 🔄 3. Core Mechanics & Workflows

### 3.1. The Agentic Loop (ReAct Pattern)
The AI does not execute tasks in one single API call. It operates in a continuous, multi-step loop until the goal is achieved.

1. **Observe:** The Rust client captures the screen and sends it to the Node.js Backend via Go.
2. **Contextualize (Memory):** The backend fetches previous actions (History) and user preferences (RAG) to prevent infinite loops.
3. **Thought (Vision LLM):** The LLM analyzes the current screen state against the final goal. (e.g., *"I need to post on Facebook, but Chrome is closed. I must open Chrome first."*)
4. **Action:** The LLM outputs a highly structured JSON defining the *single next step* (e.g., `{"tool": "mouse_double_click", "x": 120, "y": 45}`).
5. **Execute:** The backend sends this JSON to the Rust client. Rust executes the click, takes a new screenshot, and the loop restarts.

### 3.2. Task Scheduling & Multi-stage Execution
Users can assign time-delayed, multi-platform workflows.
* **Flow:** User says *"Post an image on Facebook at 9 PM."* -> Next.js sends this to Node.js -> Node.js creates a BullMQ delayed job for 21:00.
* At 21:00, the BullMQ worker wakes up, locates the user's active Device ID, signals the Go Gateway to wake up the Rust client, and initiates the Agentic Loop.

### 3.3. Long-Term Memory & Persona (RAG)
To make the AI act like the user:
* Users can input rules (e.g., *"I never use emojis, and I write in lowercase."*).
* Node.js converts this text into embeddings and stores it in MongoDB Vector Search.
* During the Agentic Loop, the backend queries MongoDB for relevant behavioral rules and injects them as strict instructions into the Vision LLM's System Prompt.

---

## 📁 4. Monorepo Directory Structure
```text
opendesk-ai/
├── desktop_client/       # RUST + TAURI
│   ├── src-tauri/        # Core OS interactions, screenshot logic, WebSocket client
│   └── src/              # Frontend for the Desktop App (Device pairing UI)
│
├── gateway/              # GO
│   ├── main.go           # WebSocket/gRPC listener
│   ├── pubsub/           # Redis Pub/Sub for communicating with Node.js
│   └── clients/          # Connection pool manager
│
├── backend/              # NODE.JS + TYPESCRIPT
│   ├── src/
│   │   ├── ai/           # LLM Providers (OpenAI, Anthropic, Custom), System Prompts
│   │   ├── agent/        # The ReAct Loop, State Machine, Tool definitions
│   │   ├── memory/       # RAG logic, MongoDB Vector Search integration
│   │   ├── jobs/         # BullMQ queues, workers, schedulers
│   │   ├── db/           # MongoDB Mongoose schemas (Users, Devices, TaskLogs)
│   │   └── api/          # REST/GraphQL endpoints for the Next.js frontend
│   └── package.json
│
└── frontend/             # NEXT.JS + TYPESCRIPT
    ├── src/
    │   ├── app/          # Next.js App Router (Dashboard, Login, Device List)
    │   ├── components/   # UI elements (Live Stream Viewer, Task Input)
    │   └── hooks/        # Custom React hooks for API and WebSocket connections
    └── package.json

```

---

## ⚠️ 5. STRICT RULES FOR AI AGENTS (ANTIGRAVITY / COPILOT)

*Read this carefully before generating any code for this repository.*

1. **Tech Stack Boundaries:** * NEVER write OS-level screen capture or mouse movement code in Node.js. That is STRICTLY the job of the `desktop_client` (Rust).
* NEVER write AI LLM reasoning logic in the Rust client. Rust is purely a "dumb terminal" executing commands. The "Brain" is STRICTLY `backend` (Node.js).


2. **TypeScript Strictness:** Use `strict: true` in `tsconfig.json` for both Node.js and Next.js. Define exact Types/Interfaces for the JSON payload passed between Node.js and Rust (e.g., `CoordinatePayload`, `KeyboardEventPayload`). NO `any` types.
3. **Infinite Loop Prevention:** In `/backend/src/agent`, you MUST implement an `actionHistory` array. If the LLM attempts the exact same coordinates 3 times in a row without the screen changing, the loop MUST pause and throw a "Stuck Execution" error to the dashboard.
4. **LLM Output Formatting:** The Vision LLM must be tightly constrained using Structured Outputs (JSON Schema). Do not allow markdown blocks or conversational text in the action output. It must return raw JSON that the Rust client can immediately parse.
5. **Security:** Device pairing must use a secure handshake (JWT or secure tokens). Never trust coordinate data without verifying it belongs to the authenticated user's session.
