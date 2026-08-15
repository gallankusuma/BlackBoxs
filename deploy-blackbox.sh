#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - BLACKBOX EPC
# Domain: blackboxs.io
# Target VPS: root@76.13.22.155 → /var/www/blackboxs/
# NOTE: TS compiled locally (tsc not in VPS PATH)
# ============================================================

set -e

VPS="root@76.13.22.155"
REMOTE_FRONTEND="/var/www/blackboxs/frontend"
REMOTE_BACKEND="/var/www/blackboxs/backend"
LOCAL_FRONTEND="/Users/gallankusuma/Webapps/EPC/frontend"
LOCAL_BACKEND="/Users/gallankusuma/Webapps/EPC/backend"
LOCAL_ROOT="/Users/gallankusuma/Webapps/EPC"
PM2_NAME="blackboxs-backend"

echo "🚀 BLACKBOX EPC Deploy → blackboxs.io"
echo "VPS: $VPS | Path: $REMOTE_FRONTEND"
echo ""

# Safety check — NEVER deploy to rheologi
if [[ "$REMOTE_FRONTEND" == *"rheologi"* ]]; then
  echo "❌ ABORT: Path contains 'rheologi' — this is forbidden!"
  exit 1
fi

# ── Pemeriksaan pra-deploy ───────────────────────────────────────────────────
# Dijalankan SEBELUM apa pun diunggah.
#
# Pada 11 Agustus 2026 password MySQL produksi tidak lagi cocok dengan `.env`,
# tapi aplikasi tetap terlihat sehat karena masih memakai koneksi pool lama.
# Deploy me-restart proses, koneksi itu hilang, dan produksi mati — padahal
# kesalahannya sudah ada berjam-jam sebelumnya dan bisa dideteksi lebih dulu.
#
# Urutan langkahnya juga penting: frontend dilayani nginx langsung, jadi begitu
# ter-rsync ia LANGSUNG live. Kalau backend ternyata tidak bisa naik, penggunanya
# sudah terlanjur memakai frontend baru terhadap backend lama.
echo "🔎 Pemeriksaan pra-deploy..."
scp -q "$LOCAL_ROOT/scripts/preflight-check.py" "$VPS:/tmp/preflight-check.py"
if ! ssh "$VPS" "python3 /tmp/preflight-check.py $REMOTE_BACKEND $PM2_NAME; rc=\$?; rm -f /tmp/preflight-check.py; exit \$rc"; then
  echo ""
  echo "❌ ABORT: pemeriksaan pra-deploy gagal. Tidak ada yang diunggah."
  exit 1
fi
echo ""

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
ssh "$VPS" "cd $REMOTE_BACKEND && npm install --omit=dev 2>/dev/null; pm2 restart $PM2_NAME"
echo "✅ Backend restarted"

# ── Verifikasi setelah restart ───────────────────────────────────────────────
# Proses "online" menurut pm2 tidak berarti aplikasinya melayani. Yang diuji di
# sini permintaan HTTP sungguhan.
echo "🔎 Verifikasi setelah restart..."
sleep 8

# Health check dasar dulu — cepat, dan kalau ini saja gagal tidak perlu lanjut.
HEALTH=$(ssh "$VPS" "curl -s -o /dev/null -w '%{http_code}' -m 15 http://localhost:3005/api/health || true")
if [ "$HEALTH" != "200" ]; then
  echo "❌ Backend TIDAK sehat setelah restart (health: $HEALTH)"
  echo "   Log terakhir:"
  ssh "$VPS" "pm2 logs $PM2_NAME --lines 15 --nostream --err 2>/dev/null | tail -15"
  exit 1
fi
echo "✅ Health check 200"

# Smoke test: health 200 saja TIDAK membuktikan aplikasi bekerja. Pada 12 Agustus
# 2026 proses terlihat online dan health menjawab, sementara backend sama sekali
# tidak bisa membuat koneksi database baru. Yang membedakan adalah permintaan
# yang benar-benar menyentuh database dan memeriksa otorisasi.
echo "🔎 Smoke test..."
if ! node "$LOCAL_ROOT/scripts/smoke-test.js"; then
  echo ""
  echo "❌ Smoke test GAGAL setelah deploy. Log terakhir:"
  ssh "$VPS" "pm2 logs $PM2_NAME --lines 20 --nostream --err 2>/dev/null | tail -20"
  exit 1
fi

echo ""
echo "✅ DONE — blackboxs.io updated"
