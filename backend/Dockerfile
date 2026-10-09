# Build stage
FROM node:22-alpine AS builder

# OpenSSL pour Prisma, pnpm via corepack (version figée par "packageManager")
RUN apk add --no-cache openssl && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

COPY . .

# Client Prisma généré puis dépendances de dev retirées : le client généré est conservé.
RUN pnpm exec prisma generate && pnpm build && pnpm prune --prod

# Production stage
FROM node:22-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Le worker utilise la même image : `node dist/worker`.
CMD ["node", "dist/main"]
