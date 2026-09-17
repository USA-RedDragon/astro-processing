FROM node:24.21.0-alpine@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2 AS builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY frontend/. .
COPY graph /app/graph

ENV NODE_ENV=production

RUN npm run generate:graphql
RUN npm run build

FROM nginx:1.29.5-alpine@sha256:1d13701a5f9f3fb01aaa88cef2344d65b6b5bf6b7d9fa4cf0dca557a8d7702ba

COPY --chown=root:root docker/frontend/rootfs /
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
ENTRYPOINT ["nginx","-g","daemon off;"]
