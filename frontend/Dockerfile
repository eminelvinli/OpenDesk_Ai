# ──────────────────────────────────────────────────────────────────────────────
# OpenDesk AI — Next.js Production Dockerfile
# Strategy: Multi-stage with standalone output for minimal image size.
#   Stage 1 (deps)    Install all npm deps with cache layer
#   Stage 2 (builder) Build Next.js app → produces .next/standalone/
#   Stage 3 (runner)  Copy only the standalone bundle (~50 MB total)
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependency installation ────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# ── Stage 2: Next.js build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all deps (including devDeps needed for the build)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .

# Required: next.config.js must set output: 'standalone'
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── Stage 3: minimal runner ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy the standalone build output (includes server.js + bundled node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone output creates server.js at the root.
CMD ["node", "server.js"]
