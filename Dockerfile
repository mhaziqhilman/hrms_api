FROM node:22-slim

# Install LibreOffice for Excel-to-PDF conversion (EA Form LHDN template)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libreoffice-calc fonts-liberation && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]
