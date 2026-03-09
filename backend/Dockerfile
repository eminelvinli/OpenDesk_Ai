# ──────────────────────────────────────────────────────────────────────────────
# OpenDesk AI — Node.js Backend Production Dockerfile
# Strategy: Multi-stage for clean separation of build and runtime deps.
#   Stage 1 (deps)    Install production-only node_modules
#   Stage 2 (builder) Compile TypeScript → dist/
#   Stage 3 (runner)  Minimal node:alpine with only compiled JS + prod deps
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: production deps ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# ── Stage 2: TypeScript compile ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 3: minimal runner ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 backend

# Copy compiled JS and production node_modules only.
COPY --from=builder  --chown=backend:nodejs /app/dist ./dist
COPY --from=deps     --chown=backend:nodejs /app/node_modules ./node_modules
COPY --chown=backend:nodejs package.json ./

USER backend

EXPOSE 3001

CMD ["node", "dist/index.js"]
