# Build from the monorepo root:
# docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
RUN pnpm --filter @autolayer/api... build
RUN pnpm deploy --filter @autolayer/api --prod /prod/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod/api ./
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
EXPOSE 5001
CMD ["node", "dist/index.js"]
