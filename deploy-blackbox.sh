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
# Menunggu backend BENAR-BENAR melayani, bukan menebaknya dengan satu `sleep`.
#
# Boot backend menjalankan baseline schema + puluhan fungsi ensure* terhadap
# MySQL, dan lamanya berubah-ubah tergantung beban VPS (ada sepuluh proses pm2
# di mesin ini). 2 September 2026 sebuah rilis yang sehat digulung balik karena
# health diperiksa SEKALI pada detik ke-8 dan backend masih di tengah
# `ensure*Schema` — pm2 melaporkan "online", dan log saat itu memang hanya
# berisi peringatan skema, bukan satu pun error. Pada percobaan yang sama,
# rollback justru sehat setelah 6 detik: ambangnya memang di sekitar situ.
#
# Ini TIDAK melonggarkan gerbang. Kalau sampai batas waktu tidak pernah 200,
# hasilnya tetap gagal dan rilis tetap dikembalikan — yang berubah hanya
# berhenti memvonis mati sesuatu yang masih menyalakan diri.
HEALTH_KODE=""
HEALTH_DETIK=0
tunggu_sehat() {
  local batas="${1:-90}"
  local mulai=$SECONDS
  while true; do
    HEALTH_KODE=$(ssh "$VPS" "curl -s -o /dev/null -w '%{http_code}' -m 10 http://localhost:3005/api/health || true")
    HEALTH_DETIK=$((SECONDS - mulai))
    [ "$HEALTH_KODE" = "200" ] && return 0
    [ "$HEALTH_DETIK" -ge "$batas" ] && return 1
    sleep 2
  done
}

# Kembalikan frontend DAN backend ke versi sebelumnya, lalu restart.
kembalikan_versi_lama() {
  echo ""
  echo "↩️  Mengembalikan ke versi sebelumnya..."
  # Manifest dan lockfile ikut DIPULIHKAN, bukan hanya disimpan.
  #
  # Sebelumnya `package.json`/`package-lock.json`/`database/` memang disnapshot,
  # tapi rollback hanya mengembalikan frontend dan `dist` — jadi dist lama
  # berjalan di atas `node_modules` hasil `npm install` rilis BARU. Kalau rilis
  # baru membuang sebuah dependency yang masih di-import dist lama, pemulihannya
  # jatuh sebagai MODULE_NOT_FOUND: rollback "berhasil" tapi produksinya mati.
  #
  # `npm install` dijalankan lagi sesudah manifest dipulihkan supaya
  # `node_modules` benar-benar kembali menyesuaikan rilis lama.
  ssh "$VPS" "R=/var/www/blackboxs/.rollback
    if [ -d \$R/frontend ]; then rm -rf $REMOTE_FRONTEND && cp -a \$R/frontend $REMOTE_FRONTEND; fi
    if [ -d \$R/dist ]; then rm -rf $REMOTE_BACKEND/dist && cp -a \$R/dist $REMOTE_BACKEND/dist; fi
    if [ -d \$R/database ]; then rm -rf $REMOTE_BACKEND/database && cp -a \$R/database $REMOTE_BACKEND/database; fi
    PULIH_MANIFEST=0
    for f in package.json package-lock.json; do
      if [ -f \$R/\$f ]; then cp -a \$R/\$f $REMOTE_BACKEND/\$f; PULIH_MANIFEST=1; fi
    done
    if [ \$PULIH_MANIFEST -eq 1 ]; then
      echo '   memulihkan node_modules sesuai manifest lama...'
      (cd $REMOTE_BACKEND && npm install --omit=dev >/dev/null 2>&1) || echo '   ⚠️ npm install saat rollback gagal'
    fi
    pm2 restart $PM2_NAME >/dev/null 2>&1 || true"
  if tunggu_sehat 90; then
    echo "✅ Versi lama kembali melayani (health 200, siap setelah ${HEALTH_DETIK}s)"
  else
    echo "🚨 ROLLBACK TIDAK PULIH (health: $HEALTH_KODE setelah ${HEALTH_DETIK}s) — perlu ditangani manual SEKARANG"
  fi
}

echo "🔎 Verifikasi setelah restart..."

# Health check dasar dulu — kalau ini saja gagal tidak perlu lanjut. Ditunggu
# sampai 90 detik, bukan diperiksa sekali setelah `sleep 8`; lihat tunggu_sehat.
if ! tunggu_sehat 90; then
  echo "❌ Backend TIDAK sehat setelah restart (health: $HEALTH_KODE, ditunggu ${HEALTH_DETIK}s)"
  echo "   Log terakhir:"
  ssh "$VPS" "pm2 logs $PM2_NAME --lines 15 --nostream --err 2>/dev/null | tail -15"
  kembalikan_versi_lama
  exit 1
fi
echo "✅ Health check 200 (siap setelah ${HEALTH_DETIK}s)"

# Smoke test: health 200 saja TIDAK membuktikan aplikasi bekerja. Pada 12 Agustus
# 2026 proses terlihat online dan health menjawab, sementara backend sama sekali
# tidak bisa membuat koneksi database baru. Yang membedakan adalah permintaan
# yang benar-benar menyentuh database dan memeriksa otorisasi.
echo "🔎 Smoke test..."

# ── Gerbang rollback ────────────────────────────────────────────────────────
#
# Versi sebelumnya menjalankan smoke test sampai TIGA kali — sekali sebagai
# gerbang, dua kali lagi di dalam kondisinya — lalu memutuskan hanya dari
# JUMLAH baris "  - ". Ia tidak pernah memeriksa bahwa satu kegagalan itu
# benar-benar kredensial master. Akibatnya, begitu password master diganti,
# satu kegagalan LAIN apa pun (query DB, otorisasi, proteksi upload) menghasilkan
# tepat satu bullet, masuk ke cabang "temuan lama", dan **rilis rusak dibiarkan
# live** dengan pesan yang menenangkan tapi keliru. Kalau smoke test crash
# sebelum sempat mencetak "Yang gagal:", cabang yang sama juga dilewati tanpa
# rollback. Menjalankannya berulang juga membuat keputusan diambil dari
# snapshot waktu yang berbeda dari kegagalan aslinya.
#
# Sekarang: DIJALANKAN SEKALI, keluaran dan exit code ditangkap, lalu identitas
# kegagalannya diperiksa satu per satu. Pengecualian hanya berlaku bila daftar
# kegagalannya persis satu baris DAN labelnya kredensial master yang dikenal.
# Apa pun selain itu — termasuk keluaran yang tidak terbaca — memicu rollback.
PENGECUALIAN_DIKENAL='kredensial master publik ditolak'

set +e
SMOKE_OUT=$(node "$LOCAL_ROOT/scripts/smoke-test.js" 2>&1)
SMOKE_RC=$?
set -e
echo "$SMOKE_OUT"

if [ "$SMOKE_RC" -ne 0 ]; then
  echo ""
  echo "❌ Smoke test GAGAL setelah deploy. Log terakhir:"
  ssh "$VPS" "pm2 logs $PM2_NAME --lines 20 --nostream --err 2>/dev/null | tail -20"

  # Daftar kegagalan diambil dari keluaran yang SAMA dengan yang barusan gagal.
  DAFTAR_GAGAL=$(printf '%s\n' "$SMOKE_OUT" | sed -n '/^Yang gagal:/,$p' | grep '^  - ' || true)
  JML_GAGAL=$(printf '%s' "$DAFTAR_GAGAL" | grep -c '^  - ' || true)

  if [ -z "$DAFTAR_GAGAL" ]; then
    # Smoke test jatuh tanpa sempat mencetak daftarnya — crash, timeout, atau
    # keluaran tak terbaca. Ini TIDAK boleh diperlakukan sebagai pengecualian.
    echo "🚨 Smoke test gagal tanpa daftar kegagalan yang terbaca (exit $SMOKE_RC)."
    echo "   Diperlakukan sebagai regresi — rilis dikembalikan."
    kembalikan_versi_lama
    exit 1
  fi

  LAIN=$(printf '%s\n' "$DAFTAR_GAGAL" | grep -v "$PENGECUALIAN_DIKENAL" || true)
  if [ "$JML_GAGAL" -eq 1 ] && [ -z "$LAIN" ]; then
    echo "⚠️  Satu-satunya kegagalan adalah temuan lama yang menunggu tindakan"
    echo "   pemilik server ($PENGECUALIAN_DIKENAL)."
    echo "   Rilis ini TIDAK dikembalikan."
  else
    echo "🚨 Ada kegagalan di luar temuan lama — rilis dikembalikan:"
    printf '%s\n' "${LAIN:-$DAFTAR_GAGAL}"
    kembalikan_versi_lama
  fi
  exit 1
fi

echo ""
echo "✅ DONE — blackboxs.io updated"
