FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY migrations migrations
COPY migrate-mongo-config.cjs migrate-mongo-config.cjs
COPY packages/shared packages/shared

RUN pnpm --filter @vyaya/api build \
  && pnpm --filter @vyaya/api deploy --prod /app \
  && cp -R apps/api/dist /app/dist \
  && cp migrate-mongo-config.cjs /app/migrate-mongo-config.cjs \
  && cp -R migrations /app/migrations

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app
COPY --chown=nonroot:nonroot --from=build /app /app

CMD ["dist/main.js"]
