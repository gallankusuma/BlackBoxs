#!/bin/bash
# ============================================================================
# Tes gerbang rollback pada deploy-blackbox.sh
#
# Gerbang ini memutuskan apakah rilis yang baru diunggah dikembalikan atau
# dibiarkan live. Sebelum ada tes ini, keputusannya diambil dari MENGHITUNG
# baris "  - " tanpa pernah memeriksa isinya — jadi begitu password master
# diganti, satu kegagalan lain apa pun akan dibaca sebagai "temuan lama" dan
# rilis rusak dibiarkan melayani pengguna.
#
# Logikanya diuji terisolasi: skrip deploy tidak dijalankan (ia menyentuh
# produksi). Yang diuji adalah blok keputusan yang disalin apa adanya di bawah,
# dan tes ini MEMBANDINGKANNYA dengan sumber aslinya supaya tidak bisa
# menyimpang diam-diam.
#
# Jalankan: bash scripts/test-deploy-gate.sh
# ============================================================================

set -u
AKAR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$AKAR/deploy-blackbox.sh"

lulus=0; gagal=0
chk() { # chk <label> <dapat> <harusnya>
  if [ "$2" = "$3" ]; then lulus=$((lulus+1)); echo "  ok   $1 → $2"
  else gagal=$((gagal+1)); echo "  FAIL $1 → dapat '$2', harusnya '$3'"; fi
}

PENGECUALIAN_DIKENAL='kredensial master publik ditolak'

# Replika blok keputusan. Mengembalikan: ROLLBACK | BIARKAN
putuskan() {
  local SMOKE_OUT="$1" SMOKE_RC="$2"
  [ "$SMOKE_RC" -eq 0 ] && { echo "LULUS"; return; }

  local DAFTAR_GAGAL JML_GAGAL LAIN
  DAFTAR_GAGAL=$(printf '%s\n' "$SMOKE_OUT" | sed -n '/^Yang gagal:/,$p' | grep '^  - ' || true)
  JML_GAGAL=$(printf '%s' "$DAFTAR_GAGAL" | grep -c '^  - ' || true)

  if [ -z "$DAFTAR_GAGAL" ]; then echo "ROLLBACK"; return; fi

  LAIN=$(printf '%s\n' "$DAFTAR_GAGAL" | grep -v "$PENGECUALIAN_DIKENAL" || true)
  if [ "$JML_GAGAL" -eq 1 ] && [ -z "$LAIN" ]; then echo "BIARKAN"; else echo "ROLLBACK"; fi
}

echo "1. Keputusan gerbang"

chk 'smoke lulus → tidak ada rollback' \
  "$(putuskan "$(printf '30 lulus, 0 gagal\n')" 0)" 'LULUS'

# Kasus wajib #1 — hanya kredensial master: rilis TIDAK dikembalikan.
chk 'hanya kredensial master → biarkan live' \
  "$(putuskan "$(printf '29 lulus, 1 gagal\n\nYang gagal:\n  - kredensial master publik ditolak — HTTP 200\n')" 1)" 'BIARKAN'

# Kasus wajib #2 — TEPAT SATU kegagalan non-master: WAJIB rollback.
# Inilah yang lolos pada versi lama, karena jumlah bulletnya juga 1.
chk 'satu kegagalan non-master → rollback' \
  "$(putuskan "$(printf '29 lulus, 1 gagal\n\nYang gagal:\n  - query ke tabel users berhasil — HTTP 500\n')" 1)" 'ROLLBACK'

# Kasus wajib #3 — smoke crash sebelum mencetak daftar: WAJIB rollback.
chk 'smoke crash tanpa daftar → rollback' \
  "$(putuskan "$(printf 'TypeError: fetch failed\n    at main\n')" 1)" 'ROLLBACK'

chk 'exit non-nol dengan keluaran kosong → rollback' \
  "$(putuskan '' 1)" 'ROLLBACK'

chk 'master + satu lainnya → rollback' \
  "$(putuskan "$(printf '28 lulus, 2 gagal\n\nYang gagal:\n  - kredensial master publik ditolak — HTTP 200\n  - dokumen aset tertutup — HTTP 200\n')" 1)" 'ROLLBACK'

chk 'dua kegagalan non-master → rollback' \
  "$(putuskan "$(printf 'Yang gagal:\n  - a — HTTP 500\n  - b — HTTP 500\n')" 1)" 'ROLLBACK'

# Label mirip tapi bukan pengecualian yang dikenal — tidak boleh lolos.
chk 'label mirip tapi beda → rollback' \
  "$(putuskan "$(printf 'Yang gagal:\n  - kredensial admin publik ditolak — HTTP 200\n')" 1)" 'ROLLBACK'

echo ""
echo "2. Replika tidak menyimpang dari skrip aslinya"
# Kalau logika di deploy diubah tanpa memperbarui tes ini, tes kehilangan
# gunanya tanpa ada yang sadar. Penanda kuncinya diperiksa masih ada.
for penanda in \
  'PENGECUALIAN_DIKENAL=' \
  'SMOKE_OUT=$(node' \
  'sed -n '"'"'/^Yang gagal:/,$p'"'"'' \
  'if [ -z "$DAFTAR_GAGAL" ]; then' \
  '[ "$JML_GAGAL" -eq 1 ] && [ -z "$LAIN" ]'
do
  if grep -qF -- "$penanda" "$DEPLOY"; then
    lulus=$((lulus+1)); echo "  ok   penanda ada di deploy: ${penanda:0:44}"
  else
    gagal=$((gagal+1)); echo "  FAIL penanda HILANG dari deploy: ${penanda:0:44}"
  fi
done

# Smoke test hanya boleh dipanggil SEKALI di skrip deploy.
PANGGILAN=$(grep -c 'scripts/smoke-test.js' "$DEPLOY" || true)
chk 'smoke test dipanggil sekali saja' "$PANGGILAN" '1'

echo ""
echo "3. Skrip deploy sehat secara sintaks"
if bash -n "$DEPLOY" 2>/dev/null; then
  lulus=$((lulus+1)); echo "  ok   bash -n bersih"
else
  gagal=$((gagal+1)); echo "  FAIL bash -n menemukan error sintaks"
fi

echo ""
echo "=== $lulus lulus, $gagal gagal ==="
[ "$gagal" -eq 0 ] || exit 1
