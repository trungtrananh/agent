# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config template to handle SPA routing and use $PORT
RUN echo 'server { \
    listen 8080; \
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.d/default.conf

# Use a shell script to replace the port in nginx config and start nginx
CMD ["/bin/sh", "-c", "sed -i \"s/listen 8080;/listen ${PORT:-8080};/\" /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
