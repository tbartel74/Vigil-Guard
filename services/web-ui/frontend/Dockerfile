# Multi-stage build for production

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Accept build arg for Grafana origin
ARG VITE_GRAFANA_ORIGIN=http://localhost:3001
ENV VITE_GRAFANA_ORIGIN=$VITE_GRAFANA_ORIGIN

# Copy package files (from root context)
COPY services/web-ui/frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy source files (from root context)
COPY services/web-ui/frontend/ .

# Documentation is synced separately via prepare-docs script during build
# The docs are already in public/docs from the source copy

# Build for production
RUN npm run build

# Stage 2: Production server
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (from root context)
COPY services/web-ui/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Healthcheck disabled - nginx starts instantly and responds on port 80
# Docker metadata caching issues prevent reliable healthcheck updates
# Service is verified working via external endpoint tests

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
