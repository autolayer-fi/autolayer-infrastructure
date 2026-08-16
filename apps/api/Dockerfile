# Build from the monorepo root:
# docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api ./apps/api
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
COPY apps/api/package.json ./
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
RUN pnpm install --prod --no-frozen-lockfile
EXPOSE 5001
CMD ["node", "dist/index.js"]
