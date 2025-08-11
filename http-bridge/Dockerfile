FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code and public files
COPY src/ ./src/
COPY public/ ./public/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
  const options = { host: 'localhost', port: 3001, path: '/health', timeout: 2000 }; \
  const request = http.request(options, (res) => { \
    console.log('STATUS:', res.statusCode); \
    process.exitCode = res.statusCode === 200 ? 0 : 1; \
  }); \
  request.on('error', (err) => { console.log('ERROR', err); process.exitCode = 1; }); \
  request.end();"

# Start the application
CMD ["npm", "start"]