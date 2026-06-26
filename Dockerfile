# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared ./shared
COPY src ./src
RUN npm run build

COPY dashboard/package.json dashboard/package-lock.json* dashboard/
WORKDIR /app/dashboard
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Production stage
FROM node:22-alpine

RUN apk add --no-cache fontconfig ttf-dejavu wget

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/src/index.js"]
