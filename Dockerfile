# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts ./
COPY src ./src
COPY server.js ./
COPY public ./public
# Dummy env vars so Supabase client doesn't throw during static page collection
ENV SUPABASE_URL=http://placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache ffmpeg postgresql-client

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./

# Copy migrations and entrypoint
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create data directory for media
RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
