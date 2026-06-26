# Stage 1: Build the TypeScript application
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Copy package configurations
COPY package*.json tsconfig.json ./

# Install dependencies (including devDependencies)
RUN npm ci

# Copy application source files
COPY src/ ./src/

# Build the TypeScript project (outputs to ./dist)
RUN npm run build

# Stage 2: Create the production image
FROM node:20-slim

WORKDIR /usr/src/app

# Copy package configuration
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled JavaScript from builder stage
COPY --from=builder /usr/src/app/dist/ ./dist/

# Copy the sample cases file for caching
COPY SUST_Preli_Sample_Cases.json ./

# Set default environment variables
ENV PORT=8000
ENV NODE_ENV=production

# Expose port
EXPOSE 8000

# Run the server
CMD ["node", "dist/src/index.js"]
