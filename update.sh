#!/bin/bash

# =========================================================
#             WHALE BOT UPDATE SCRIPT (MACOS & LINUX)
# =========================================================

# Exit immediately if a command exits with a non-zero status
set -e

# --- CONFIGURATION ---
APP_NAME="whale"

# Color codes for formatting
WHITE='\033[1;37m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${WHITE}------------------------------------------------${NC}"
echo -e "${YELLOW}>>> RUNNING UPDATE WHALE BOT (MACOS) <<<${NC}"
echo -e "${WHITE}------------------------------------------------${NC}"

# 1. Stop old bot process under PM2
echo -e "${CYAN}[1/6] Stopping existing PM2 process for app: $APP_NAME...${NC}"
pm2 stop $APP_NAME 2>/dev/null || true
pm2 delete $APP_NAME 2>/dev/null || true

# 2. Reset and Pull code from GitHub
echo -e "${CYAN}[2/6] Pulling latest code from GitHub...${NC}"
git reset --hard HEAD || echo -e "${YELLOW}[WARNING] git reset failed.${NC}"
git pull origin main || echo -e "${YELLOW}[WARNING] git pull failed. If you downloaded manual ZIP, please ignore this warn.${NC}"

# 3. Install packages (both standard and devDependencies)
echo -e "${CYAN}[3/6] Installing dependencies (npm install)...${NC}"
npm install --include=dev

# 4. Build the application (runs Vite build and bundles server.ts)
echo -e "${CYAN}[4/6] Building project (npm run build)...${NC}"
npm run build

# 5. Verify build file exists
if [ ! -f "dist/server.cjs" ]; then
    echo -e "${RED}[ERROR] Target output file dist/server.cjs was not found!${NC}"
    exit 1
fi

# 6. Start the bot via PM2
echo -e "${CYAN}[5/6] Starting bot via PM2...${NC}"
pm2 flush
pm2 start dist/server.cjs --name "$APP_NAME" || {
    echo -e "${YELLOW}[WARNING] Direct PM2 start failed, trying node wrapper...${NC}"
    pm2 start node --name "$APP_NAME" -- dist/server.cjs
}

# 7. Save PM2 state
pm2 save

echo -e "${WHITE}------------------------------------------------${NC}"
echo -e "${GREEN}>>> UPDATE COMPLETED SUCCESSFULLY! <<<${NC}"
echo -e "${WHITE}------------------------------------------------${NC}"
echo -e "${YELLOW}To view real-time logs, run: pm2 logs $APP_NAME${NC}"
echo -e "${WHITE}------------------------------------------------${NC}"
