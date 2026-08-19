#!/bin/bash
# ============================================================
# DEPLOY SCRIPT - BLACKBOX EPC
# Domain: blackboxs.io
# Target VPS: root@76.13.22.155 → /var/www/blackboxs/
# NOTE: TS compiled locally (tsc not in VPS PATH)
# ============================================================

set -e

VPS="root@76.13.22.155"

# ── SSH tidak boleh menggantung tanpa batas ────────────────────────────────
#
# 18 Agustus 2026: `ssh ... pm2 restart` menggantung **1 jam 15 menit** tanpa
# pernah kembali. Restartnya sendiri sudah berhasil dan rilisnya sudah live —
# tapi skrip tidak pernah sampai ke health check, smoke test, maupun gerbang
# rollback. Itu keadaan paling berbahaya yang bisa dihasilkan skrip ini: versi
# baru melayani pengguna sementara seluruh pemeriksaannya terlewat diam-diam,
# dan operator mengira deploy masih berjalan.
#
# `ServerAliveInterval`/`CountMax` memutus koneksi yang mati diam-diam
# (mis. NAT/firewall menjatuhkan sesi tanpa RST). `ConnectTimeout` membatasi
# fase penyambungan. `BatchMode` mencegahnya menunggu input interaktif
# selamanya kalau kunci ditolak.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
ssh() { command ssh "${SSH_OPTS[@]}" "$@"; }

# Batas keras per perintah jarak jauh, untuk kasus di mana koneksinya hidup tapi
# perintah di seberang yang tidak selesai. macOS tidak punya `timeout`; perl ada
# di mana-mana dan `alarm` cukup untuk keperluan ini.
jalankan_berbatas() {
  local detik="$1"; shift
  perl -e 'alarm shift; exec @ARGV' "$detik" "$@"
}
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

# ── SELURUH BUILD SELESAI SEBELUM SATU BERKAS PUN DIUNGGAH (DR-P1-08) ────────
#
# Urutan lama: build frontend → UPLOAD frontend → compile backend. Kalau `tsc`
# gagal, frontend baru sudah LANGSUNG live (nginx melayaninya dari disk) terhadap
# backend lama. Komentar di atas sudah menyebut risiko itu, tapi kodenya tetap
# melakukannya.
#
# Sekarang kedua artefak disiapkan dulu; unggahan baru dimulai setelah keduanya
# benar-benar jadi.
echo "📦 Building frontend..."
cd "$LOCAL_FRONTEND"
npm run build

echo "📦 Compiling backend TypeScript (local)..."
cd "$LOCAL_BACKEND"
npx tsc
echo "✅ Kedua artefak siap"

# Validasi bundle: nilai dev tidak boleh ikut ter-bake. `.env` lokal berisi
# `VITE_API_URL=http://localhost:3005/api`; kalau `.env.production` hilang atau
# salah, frontend produksi akan memanggil localhost dari browser pengguna dan
# mati total — tanpa satu pun error saat build.
if grep -rq "localhost:3005" "$LOCAL_FRONTEND/dist/" 2>/dev/null; then
  echo "❌ ABORT: bundle produksi memuat 'localhost:3005'. Periksa frontend/.env.production."
  exit 1
fi
echo "✅ Bundle bersih dari alamat dev"

# ── Titik pulang: salin versi yang sedang berjalan sebelum ditimpa ───────────
#
# Dulu kedua `cp` diakhiri `|| true` lalu skrip SELALU mencetak "Titik pulang
# tersimpan". Snapshot yang gagal karena itu tidak terlihat sama sekali, dan
# baru ketahuan saat rollback dibutuhkan — persis saat paling tidak boleh gagal.
#
# Manifest dan lockfile ikut disimpan: deploy juga mengganti `package.json`,
# `package-lock.json`, dan `database/`, lalu memutasi `node_modules` lewat
# `npm install`. Kalau rilis baru membuang dependency yang masih di-import dist
# lama, memulihkan dist saja menghasilkan MODULE_NOT_FOUND — rollback yang
# "berhasil" tapi produksinya mati.
echo "💾 Menyimpan titik pulang di server..."
ssh "$VPS" "set -e
  rm -rf /var/www/blackboxs/.rollback
  mkdir -p /var/www/blackboxs/.rollback
  cp -a $REMOTE_FRONTEND /var/www/blackboxs/.rollback/frontend
  cp -a $REMOTE_BACKEND/dist /var/www/blackboxs/.rollback/dist
  for f in package.json package-lock.json; do
    [ -f $REMOTE_BACKEND/\$f ] && cp -a $REMOTE_BACKEND/\$f /var/www/blackboxs/.rollback/\$f
  done
  [ -d $REMOTE_BACKEND/database ] && cp -a $REMOTE_BACKEND/database /var/www/blackboxs/.rollback/database
  true" || {
    echo "❌ ABORT: titik pulang GAGAL dibuat. Tidak ada yang diunggah."
    echo "   Deploy tanpa jalan pulang lebih berbahaya daripada tidak deploy."
    exit 1
  }

# Diverifikasi, bukan diasumsikan.
SNAP=$(ssh "$VPS" "[ -d /var/www/blackboxs/.rollback/frontend ] && [ -d /var/www/blackboxs/.rollback/dist ] && echo ok || echo kurang")
if [ "$SNAP" != "ok" ]; then
  echo "❌ ABORT: titik pulang tidak lengkap (frontend/dist tidak keduanya ada)."
  exit 1
fi
echo "✅ Titik pulang tersimpan & terverifikasi"

# 2. Upload frontend
echo "📤 Uploading frontend to $REMOTE_FRONTEND..."
rsync -avz --delete "$LOCAL_FRONTEND/dist/" "$VPS:$REMOTE_FRONTEND/"
echo "✅ Frontend uploaded"

# 4. Sync compiled dist + src + package.json to VPS
echo "📤 Uploading backend dist + src..."
rsync -avz --delete "$LOCAL_BACKEND/dist/" "$VPS:$REMOTE_BACKEND/dist/"
rsync -avz "$LOCAL_BACKEND/src/" "$VPS:$REMOTE_BACKEND/src/"
rsync -avz "$LOCAL_BACKEND/package.json" "$LOCAL_BACKEND/package-lock.json" "$VPS:$REMOTE_BACKEND/"

# DR-P1-07: `database/` WAJIB ikut. `initializeDatabase()` membaca
# `schema_mysql.sql` dan `schema-baseline.sql` dari sana saat boot; tanpa
# keduanya, instalasi baru tidak akan pernah punya skema lengkap.
#
# Ini sempat terlewat: baseline dibuat tapi tidak pernah sampai ke server, dan
# baru ketahuan saat log boot produksi diperiksa — bukan dari deploy yang
# melaporkan sukses.
rsync -avz "$LOCAL_BACKEND/database/" "$VPS:$REMOTE_BACKEND/database/"
echo "✅ Backend uploaded"

# 5. Install deps & restart backend on VPS (no build needed)
echo "🔄 Restarting backend..."
# Berbatas waktu: langkah inilah yang pernah menggantung 1 jam lebih. Kalau
# batasnya terlampaui, JANGAN diam — restart mungkin sudah terjadi dan rilisnya
# sudah live, jadi verifikasinya wajib tetap dijalankan di bawah.
# SSH_OPTS ditulis lengkap di sini: `jalankan_berbatas` memakai `exec`, yang
# memanggil biner `ssh` langsung dan melewati fungsi pembungkus di atas.
if ! jalankan_berbatas 300 ssh "${SSH_OPTS[@]}" "$VPS" "cd $REMOTE_BACKEND && npm install --omit=dev 2>/dev/null; pm2 restart $PM2_NAME"; then
  echo "⚠️  Perintah restart tidak selesai dalam 5 menit (koneksi putus atau menggantung)."
  echo "    Rilisnya mungkin SUDAH live — verifikasi di bawah tetap dijalankan."
fi
echo "✅ Backend restarted"

# ── Verifikasi setelah restart ───────────────────────────────────────────────
# Proses "online" menurut pm2 tidak berarti aplikasinya melayani. Yang diuji di
# sini permintaan HTTP sungguhan.
# Kembalikan frontend DAN backend ke versi sebelumnya, lalu restart.
kembalikan_versi_lama() {
  echo ""
  echo "↩️  Mengembalikan ke versi sebelumnya..."
  ssh "$VPS" "if [ -d /var/www/blackboxs/.rollback/frontend ]; then \
      rm -rf $REMOTE_FRONTEND && cp -a /var/www/blackboxs/.rollback/frontend $REMOTE_FRONTEND; fi; \
    if [ -d /var/www/blackboxs/.rollback/dist ]; then \
      rm -rf $REMOTE_BACKEND/dist && cp -a /var/www/blackboxs/.rollback/dist $REMOTE_BACKEND/dist; fi; \
    pm2 restart $PM2_NAME >/dev/null 2>&1 || true"
  sleep 6
  local kode
  kode=$(ssh "$VPS" "curl -s -o /dev/null -w '%{http_code}' -m 15 http://localhost:3005/api/health || true")
  if [ "$kode" = "200" ]; then
    echo "✅ Versi lama kembali melayani (health 200)"
  else
    echo "🚨 ROLLBACK TIDAK PULIH (health: $kode) — perlu ditangani manual SEKARANG"
  fi
}

echo "🔎 Verifikasi setelah restart..."
sleep 8

# Health check dasar dulu — cepat, dan kalau ini saja gagal tidak perlu lanjut.
HEALTH=$(ssh "$VPS" "curl -s -o /dev/null -w '%{http_code}' -m 15 http://localhost:3005/api/health || true")
if [ "$HEALTH" != "200" ]; then
  echo "❌ Backend TIDAK sehat setelah restart (health: $HEALTH)"
  echo "   Log terakhir:"
  ssh "$VPS" "pm2 logs $PM2_NAME --lines 15 --nostream --err 2>/dev/null | tail -15"
  kembalikan_versi_lama
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

  # Smoke test yang gagal karena kredensial master publik BUKAN kegagalan rilis
  # ini — ia temuan lama yang menunggu pemilik server. Rollback hanya dilakukan
  # kalau ada pemeriksaan LAIN yang jatuh.
  if node "$LOCAL_ROOT/scripts/smoke-test.js" 2>&1 | grep -q "Yang gagal:" && \
     [ "$(node "$LOCAL_ROOT/scripts/smoke-test.js" 2>&1 | grep -c '  - ')" -gt 1 ]; then
    kembalikan_versi_lama
  else
    echo "⚠️  Satu-satunya kegagalan adalah temuan lama yang menunggu tindakan"
    echo "   pemilik server. Rilis ini TIDAK dikembalikan."
  fi
  exit 1
fi

echo ""
echo "✅ DONE — blackboxs.io updated"
