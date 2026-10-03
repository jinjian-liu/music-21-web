FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENV HOST=0.0.0.0
EXPOSE 3001
CMD ["npm","run","server"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
