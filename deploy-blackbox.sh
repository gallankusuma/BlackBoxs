#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - BLACKBOX EPC
# Domain: blackboxs.io
# Target VPS: root@76.13.22.155 → /var/www/erp-genjaya/
# NOTE: TS compiled locally (tsc not in VPS PATH)
# ============================================================

set -e

VPS="root@76.13.22.155"
REMOTE_FRONTEND="/var/www/erp-genjaya/frontend"
REMOTE_BACKEND="/var/www/erp-genjaya/backend"
LOCAL_FRONTEND="/Users/gallankusuma/Webapps/EPC/frontend"
LOCAL_BACKEND="/Users/gallankusuma/Webapps/EPC/backend"

echo "🚀 BLACKBOX EPC Deploy → blackboxs.io"
echo "VPS: $VPS | Path: $REMOTE_FRONTEND"
echo ""

# Safety check — NEVER deploy to rheologi
if [[ "$REMOTE_FRONTEND" == *"rheologi"* ]]; then
  echo "❌ ABORT: Path contains 'rheologi' — this is forbidden!"
  exit 1
fi

# 1. Build frontend
echo "📦 Building frontend..."
cd "$LOCAL_FRONTEND"
npm run build

# 2. Upload frontend
echo "📤 Uploading frontend to $REMOTE_FRONTEND..."
rsync -avz --delete "$LOCAL_FRONTEND/dist/" "$VPS:$REMOTE_FRONTEND/"
echo "✅ Frontend uploaded"

# 3. Compile backend TypeScript LOCALLY (VPS has no tsc)
echo "📦 Compiling backend TypeScript (local)..."
cd "$LOCAL_BACKEND"
npx tsc
echo "✅ Backend compiled"

# 4. Sync compiled dist + src + package.json to VPS
echo "📤 Uploading backend dist + src..."
rsync -avz --delete "$LOCAL_BACKEND/dist/" "$VPS:$REMOTE_BACKEND/dist/"
rsync -avz "$LOCAL_BACKEND/src/" "$VPS:$REMOTE_BACKEND/src/"
rsync -avz "$LOCAL_BACKEND/package.json" "$LOCAL_BACKEND/package-lock.json" "$VPS:$REMOTE_BACKEND/"
echo "✅ Backend uploaded"

# 5. Install deps & restart backend on VPS (no build needed)
echo "🔄 Restarting backend..."
ssh "$VPS" "cd $REMOTE_BACKEND && npm install --omit=dev 2>/dev/null; pm2 restart erp-genjaya-backend"
echo "✅ Backend restarted"

echo ""
echo "✅ DONE — blackboxs.io updated"
