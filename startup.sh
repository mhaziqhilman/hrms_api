#!/bin/bash
# Azure App Service startup script
# Installs LibreOffice for Excel-to-PDF conversion (EA Form LHDN template)

echo "=== Installing LibreOffice ==="
apt-get update -qq
apt-get install -y --no-install-recommends libreoffice-calc fonts-liberation 2>&1 | tail -5
echo "=== LibreOffice installed ==="
which soffice && soffice --version

# Start the application using PM2 (Azure default process manager)
cd /home/site/wwwroot
pm2 start src/server.js --no-daemon
