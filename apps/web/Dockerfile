# Build Vite client, serve via nginx with API/WS reverse proxy
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=@rcic/web --workspace=@rcic/shared --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build -w @rcic/web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
