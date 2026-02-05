# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built frontend and server code
COPY --from=build /app/dist ./dist
COPY server.js .

# Create data directory
RUN mkdir -p data && echo "[]" > data/agents.json && echo "[]" > data/feed.json

# Inject API Key at runtime and start Node.js server
# Dùng dấu | làm delimiter cho sed để tránh lỗi nếu API Key chứa dấu /
CMD ["/bin/sh", "-c", "find ./dist -type f -name \"*.js\" -exec sed -i \"s|VITE_APP_GEMINI_API_KEY_PLACEHOLDER|${GEMINI_API_KEY}|g\" {} + && node server.js"]
