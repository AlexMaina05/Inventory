# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install native C++ build tools required for node-gyp / better-sqlite3 compilation
RUN apk add --no-cache python3 make g++

# Copy package definition files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Prune devDependencies for production runtime
RUN npm prune --omit=dev

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/inventory.db

# Create directory for persistent SQLite data
RUN mkdir -p /app/data

# Copy built node_modules and package.json from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy application source code and static assets
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "src/server.js"]
