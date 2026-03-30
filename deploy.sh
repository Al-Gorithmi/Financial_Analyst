#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🚀 Deploying finance-analyzer..."
cd ~/apps/finance-analyzer

echo "📥 Pulling latest from GitHub..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔨 Rebuilding native modules..."
npm rebuild better-sqlite3

echo "🏗️ Building Next.js..."
npm run build

echo "♻️ Restarting PM2..."
pm2 restart finance

echo "✅ Deploy complete!"
pm2 status
