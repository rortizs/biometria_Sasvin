## Stage 1 — Build Angular app
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --prefer-offline --legacy-peer-deps

ARG CACHEBUST=2
COPY . .
RUN npm run build -- --configuration production

## Stage 2 — Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
