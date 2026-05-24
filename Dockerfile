FROM node:20-slim AS base

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Install Playwright browsers to shared path accessible by appuser
ENV PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright
RUN npx playwright install chromium

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the app
RUN npm run build

# Create volume directory for SQLite and non-root user
RUN mkdir -p /app/data && \
    groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /sbin/nologin appuser && \
    chown -R appuser:appuser /app/data && \
    chmod -R o+rx /app

ENV DATABASE_URL="file:/app/data/dev.db"
ENV NODE_ENV=production
ENV NEXTAUTH_URL="https://clone.webyverse.com"
ENV PORT=3000

EXPOSE 3000

USER appuser

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
