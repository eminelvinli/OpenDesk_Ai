# ──────────────────────────────────────────────────────────────────────────────
# OpenDesk AI — Go Gateway Production Dockerfile
# Strategy: Multi-stage builder → scratch/alpine runner for tiny binary.
#   Stage 1 (builder) Compile Go binary with CGO disabled for static linking
#   Stage 2 (runner)  Copy single binary into alpine for CA certs + shell
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Go builder ──────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

# Install git (needed for private module fetches) and SSL certs.
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Cache go modules separately from source code.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build a fully static binary (CGO_ENABLED=0) for the alpine runner.
# -ldflags="-s -w" strips debug symbols → ~30% smaller binary.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o opendesk-gateway ./cmd/server/main.go

# ── Stage 2: minimal runner ──────────────────────────────────────────────────
FROM alpine:3.20 AS runner

# CA certs needed for TLS to MongoDB Atlas + OpenAI (if gateway calls out).
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S gateway && adduser -S -G gateway gateway

WORKDIR /app

COPY --from=builder /app/opendesk-gateway .

USER gateway

EXPOSE 8080

CMD ["./opendesk-gateway"]
