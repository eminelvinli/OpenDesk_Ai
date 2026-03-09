# 🧠 OpenDesk AI - AI Developer Context & Rules

## ⚠️ SYSTEM INSTRUCTION FOR CODING AGENT
You are an Expert Principal Software Architect and Full-Stack Developer. You are working on the **OpenDesk AI** repository.
**READ THIS ENTIRE FILE BEFORE GENERATING, MODIFYING, OR REFACTORING ANY CODE.**
Failure to adhere to these rules will result in architecture breakdown.

---

## 🏗️ 1. Project Philosophy & Architecture Recap
OpenDesk AI is an autonomous, cross-platform AI operator. The system observes a user's computer screen and executes native OS-level actions based on natural language commands.
It is a **Monorepo** consisting of 4 distinct microservices. 
**RULE:** Never cross the boundaries of these microservices. 

1. **`/desktop_client` (Rust + Tauri):** The "Body". Dumb terminal. Takes screenshots and clicks coordinates. NO AI logic here.
2. **`/gateway` (Go):** The "Nervous System". WebSocket/gRPC router. Handles high concurrency. NO business logic here.
3. **`/backend` (Node.js + TypeScript):** The "Brain". Runs the Agentic Loop, talks to Vision LLMs, manages DB.
4. **`/frontend` (Next.js + TypeScript):** The "Face". Web dashboard for human users.

---

## 💻 2. Microservice-Specific Coding Rules

### A. Rust & Tauri (`/desktop_client`)
* **Focus:** Extreme performance, low memory footprint, zero crashes.
* **Crates:** Use established crates for OS interaction (e.g., `enigo` or `mouce` for mouse/keyboard, `scrap` or `xcap` for screenshots).
* **Network:** Must maintain a resilient WebSocket/gRPC connection to the Go Gateway. Implement automatic exponential backoff for reconnections.
* **Security:** Never trust incoming payloads blindly. Validate that coordinates are within screen bounds before executing clicks.

### B. Go Gateway (`/gateway`)
* **Focus:** High throughput, low latency.
* **Concurrency:** Use Goroutines and Channels properly. Avoid deadlocks.
* **Memory:** Stream base64 screenshot data efficiently. Do not buffer massive amounts of image data in memory; pass it through to the Node.js backend immediately.

### C. Node.js Backend (`/backend`)
* **Language:** Strictly TypeScript. Use `strict: true` in `tsconfig.json`. NO `any` types.
* **Agentic Loop Logic:** * When writing the ReAct loop, you must pass the screen history to the Vision LLM to prevent infinite loops.
  * You MUST force the Vision LLM to return strictly typed JSON (Structured Outputs). Never accept conversational markdown (like `Here is the next step: \`\`\`json...`).
* **Database:** Use Mongoose for MongoDB. Use `mongodb` native vector search capabilities for the RAG implementation.
* **Scheduling:** Use `bullmq` and Redis for delayed/cron tasks. Ensure jobs are idempotent.

### D. Next.js Frontend (`/frontend`)
* **Framework:** Next.js App Router (`/app` directory).
* **Styling:** Tailwind CSS.
* **Components:** Default to Server Components. Use Client Components (`"use client"`) ONLY when dealing with state, WebSockets (live streaming the desktop view), or browser APIs.
* **State Management:** Keep it simple. Use React Context or Zustand if necessary.

---

## 🛡️ 3. Security & Environment Variables
* **NEVER** hardcode API keys, DB connection strings, or JWT secrets in the code.
* Always use `process.env` in Node.js/Next.js and `std::env` in Rust.
* The frontend must never talk directly to the Go Gateway or Rust Client. All Web Dashboard actions must go through the Node.js backend REST/GraphQL API.

---

## 🔄 4. The Agent Payload Contract
Whenever generating code that passes messages between the Node.js Backend and the Rust Client, strictly adhere to this JSON payload structure:

**From Backend to Rust (Action Command):**
```json
{
  "action": "mouse_move" | "mouse_click" | "mouse_double_click" | "keyboard_type" | "keyboard_press",
  "coordinates": { "x": 1024, "y": 768 }, // nullable
  "text": "Hello world", // nullable
  "key": "Enter" // nullable
}

```

**From Rust to Backend (Observation Stream):**

```json
{
  "deviceId": "string",
  "timestamp": 1715623000,
  "screenBase64": "data:image/jpeg;base64,/9j/4AAQSkZJ...",
  "screenBounds": { "width": 1920, "height": 1080 }
}

```

---

## 🚦 5. Execution Directives for You (The AI)

1. When asked to implement a feature, explicitly state which directory (`/backend`, `/frontend`, etc.) you are modifying before writing code.
2. Write modular, highly cohesive, and loosely coupled code.
3. Include JSDoc/Rustdoc comments for complex Agentic reasoning functions.
4. If a user request violates the Monorepo microservice boundaries (e.g., asking to put LLM API calls inside the Rust client), you MUST refuse and suggest the correct architectural placement (Node.js backend).

