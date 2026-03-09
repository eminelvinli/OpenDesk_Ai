---
description: Test generation and test running for all OpenDesk AI services (Rust, Go, Node.js, Next.js).
---

# /test - Multi-Service Testing (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Generate or run tests across all 4 OpenDesk AI microservices.

---

## Sub-commands

```
/test                   - Run all tests across all services
/test [service]         - Run tests for a specific service (backend, frontend, gateway, client)
/test [file/feature]    - Generate tests for specific target
/test coverage          - Show coverage report per service
```

---

## Service Test Commands

| Service | Command | Framework |
|---|---|---|
| `/backend` | `cd backend && npm test` | Jest + Supertest |
| `/frontend` | `cd frontend && npm test` | React Testing Library |
| `/frontend` (E2E) | `cd frontend && npx playwright test` | Playwright |
| `/gateway` | `cd gateway && go test ./...` | Go testing (table-driven) |
| `/desktop_client` | `cd desktop_client && cargo test` | Rust #[cfg(test)] |

---

## Run All Tests

```bash
# Backend
(cd backend && npm test) &&
# Frontend
(cd frontend && npm test) &&
# Gateway
(cd gateway && go test ./...) &&
# Desktop Client
(cd desktop_client/src-tauri && cargo test)
```

---

## Key Principles

- **Test behavior, not implementation**
- **AAA Pattern** (Arrange, Act, Assert)
- **Mock external dependencies** (LLM APIs, OS APIs, databases)
- **Minimum 80% coverage** per service
- **Race detection** for Go: `go test -race ./...`
