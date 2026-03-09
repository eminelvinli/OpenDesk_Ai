---
description: Deployment command for production releases. Pre-flight checks and multi-service deployment.
---

# /deploy - Production Deployment (OpenDesk AI)

$ARGUMENTS

---

## Purpose

Deploy the OpenDesk AI multi-service system with pre-flight checks, Docker builds, and verification.

---

## Sub-commands

```
/deploy            - Interactive deployment wizard
/deploy check      - Run pre-deployment checks only
/deploy staging    - Deploy to staging environment
/deploy production - Deploy to production
/deploy rollback   - Rollback to previous version
```

---

## Pre-Deployment Checklist

```markdown
## 🚀 Pre-Deploy Checklist (All Services)

### /desktop_client (Rust)
- [ ] `cargo clippy` — no warnings
- [ ] `cargo test` — all tests pass
- [ ] `cargo build --release` — binary compiles

### /gateway (Go)
- [ ] `go vet ./...` — no issues
- [ ] `go test ./...` — all tests pass
- [ ] `go build` — binary compiles

### /backend (Node.js)
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run lint` — ESLint passing
- [ ] `npm test` — all tests pass

### /frontend (Next.js)
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run lint` — ESLint passing
- [ ] `npm test` — all tests pass
- [ ] `npm run build` — Next.js builds successfully

### Security
- [ ] No hardcoded secrets in any service
- [ ] Environment variables documented
- [ ] `npm audit` clean (backend + frontend)

### Ready to deploy? (y/n)
```

---

## Deployment Flow

```
docker compose build
docker compose up -d
```

Services start in order: MongoDB → Redis → Backend → Gateway → Frontend

> Note: `desktop_client` is distributed as a standalone binary, not deployed via Docker.

---

## Platform Support

| Platform | Command | Notes |
|---|---|---|
| Docker Compose | `docker compose up -d` | Primary method |
| Kubernetes | Helm chart | For production scaling |
| Cloud VMs | SSH + Docker | For staging |
