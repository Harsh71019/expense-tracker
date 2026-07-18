# syntax=docker/dockerfile:1.7
FROM node:24.18.0-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=vyaya-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY migrations migrations
COPY migrate-mongo-config.cjs migrate-mongo-config.cjs
COPY packages/shared packages/shared

RUN pnpm --filter @vyaya/shared build \
  && pnpm --filter @vyaya/api build \
  && pnpm --filter @vyaya/api deploy --legacy --prod /app \
  && cp -R apps/api/dist /app/dist \
  && cp migrate-mongo-config.cjs /app/migrate-mongo-config.cjs \
  && cp -R migrations /app/migrations

FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app
COPY --chown=nonroot:nonroot --from=build /app /app

CMD ["dist/main.js"]
