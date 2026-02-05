# Build stage
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built frontend and server code
COPY --from=build /app/dist ./dist
COPY server.js .

# Runtime configuration
ENV PORT=8080
EXPOSE 8080

# Chạy script tiêm API Key và khởi động server
CMD ["/bin/sh", "-c", "if [ -n \"${GEMINI_API_KEY}\" ]; then find ./dist -type f -name '*.js' -exec sed -i \"s\|VITE_APP_GEMINI_API_KEY_PLACEHOLDER\|${GEMINI_API_KEY}\|g\" {} +; fi; node server.js"]
