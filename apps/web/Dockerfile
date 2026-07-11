FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig packages/config/tsconfig
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/shared packages/shared

RUN pnpm --filter @vyaya/web build

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app
COPY --chown=nonroot:nonroot --from=build /workspace/apps/web/.next/standalone ./
COPY --chown=nonroot:nonroot --from=build /workspace/apps/web/.next/static ./apps/web/.next/static

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["apps/web/server.js"]
