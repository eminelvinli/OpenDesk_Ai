---
description: Preview server start, stop, and status check for OpenDesk AI multi-service development.
---

# /preview - Multi-Service Preview (OpenDesk AI)

$ARGUMENTS

---

## Task

Manage development servers across all OpenDesk AI services.

### Commands

```
/preview           - Show status of all services
/preview start     - Start all services (Docker Compose)
/preview stop      - Stop all services
/preview restart   - Restart all services
/preview [service] - Start/check a specific service (backend, frontend, gateway)
```

---

## Usage Examples

### Start All Services
```
/preview start

Response:
🚀 Starting OpenDesk AI services...
   📦 MongoDB: localhost:27017
   📦 Redis: localhost:6379
   🧠 Backend: http://localhost:3001
   🌐 Gateway: ws://localhost:8080
   🎨 Frontend: http://localhost:3000

✅ All services running!
```

### Status Check
```
/preview

Response:
=== OpenDesk AI Service Status ===

📦 MongoDB:  💚 Running (localhost:27017)
📦 Redis:    💚 Running (localhost:6379)
🧠 Backend:  💚 Running (localhost:3001)
🌐 Gateway:  💚 Running (ws://localhost:8080)
🎨 Frontend: 💚 Running (localhost:3000)
🖥️ Client:   ⚪ Local (not in Docker)
```

---

## Technical

Start services via Docker Compose:

```bash
docker compose up -d          # All services
docker compose up backend -d  # Single service
docker compose logs -f        # View logs
docker compose down           # Stop all
```

For local development without Docker:
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Gateway
cd gateway && go run main.go

# Desktop Client
cd desktop_client && cargo run
```
