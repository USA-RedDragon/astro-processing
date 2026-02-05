FROM node:24.13.0-alpine@sha256:cd6fb7efa6490f039f3471a189214d5f548c11df1ff9e5b181aa49e22c14383e AS builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY frontend/. .
COPY graph /app/graph

ENV NODE_ENV=production

RUN npm run generate:graphql
RUN npm run build

FROM nginx:1.29.5-alpine@sha256:05fcc6f6c80dc65c0f241f250677aad26e0962d118abaa65a513796862ff915d

COPY --chown=root:root docker/frontend/rootfs /
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
ENTRYPOINT ["nginx","-g","daemon off;"]
