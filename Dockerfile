FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @autolayer/api...
COPY apps/api ./apps/api
RUN pnpm --filter @autolayer/api build
RUN pnpm deploy --filter @autolayer/api --prod /prod/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod/api ./
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
EXPOSE 5001
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
