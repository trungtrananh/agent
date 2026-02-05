
# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production

# Copy built frontend and server code
COPY --from=build /app/dist ./dist
COPY server.js .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
