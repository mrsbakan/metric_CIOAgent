FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/redis/package.json ./packages/redis/
COPY packages/vault/package.json ./packages/vault/
COPY packages/observability/package.json ./packages/observability/
RUN npm ci --ignore-scripts

# Type-check and build all packages
FROM deps AS builder
COPY turbo.json ./
COPY packages/ ./packages/
RUN npm run type-check

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
