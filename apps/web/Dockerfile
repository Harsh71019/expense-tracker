# syntax=docker/dockerfile:1.7
FROM node:24.18.0-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /workspace

ARG INTERNAL_API_URL=http://api:4000/api
ENV INTERNAL_API_URL=$INTERNAL_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=vyaya-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/shared packages/shared

RUN pnpm --filter @vyaya/web build

FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app
COPY --chown=nonroot:nonroot --from=build /workspace/apps/web/.next/standalone ./
COPY --chown=nonroot:nonroot --from=build /workspace/apps/web/.next/static ./apps/web/.next/static

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["apps/web/server.js"]
