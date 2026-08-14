#!/usr/bin/env node
/**
 * Isi tabel `mto_lines` untuk elemen MTO yang belum punya baris tersimpan
 * (EST-MTO-019). Dijalankan DI SERVER.
 *
 * Kenapa perlu: baris MTO hanya ditulis saat sebuah elemen disimpan lewat
 * aplikasi. Elemen yang sudah ada sebelum fitur ini naik tidak ikut terisi, jadi
 * deteksi `formula_drift` belum aktif untuk mereka sampai elemennya disentuh
 * satu per satu.
 *
 * Dipakai sekali pada 14 Agustus 2026 di produksi: 38 elemen → 278 baris,
 * 3 dilewati (satu bertipe `manpower` yang bukan elemen konstruksi, dua pondasi
 * `precast_pile` yang formulanya memang belum ada — lihat EST-MTO-R01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENTING — batas yang harus disadari sebelum memakainya lagi:
 *
 * Baris yang dihasilkan memakai formula HARI INI, bukan formula saat elemen itu
 * dulu dibuat. Jadi ini titik awal yang sah untuk ke depan, BUKAN rekonstruksi
 * historis. Jangan memakainya untuk membuktikan "berapa yang dulu ditawarkan".
 *
 * Kalkulatornya diambil dari `dist/` yang sedang berjalan di server — bukan
 * implementasi terpisah — supaya barisnya identik dengan yang dihasilkan
 * aplikasi.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cara pakai:
 *
 *   scp scripts/backfill-mto-lines.js root@<server>:/root/
 *   ssh root@<server> "node /root/backfill-mto-lines.js"           # simulasi
 *   ssh root@<server> "node /root/backfill-mto-lines.js --apply"   # menulis
 *   ssh root@<server> "rm -f /root/backfill-mto-lines.js"
 *
 * Idempoten: elemen yang sudah punya baris dilewati, jadi aman dijalankan ulang.
 * Tiap elemen ditulis dalam transaction sendiri — kegagalan pada satu elemen
 * tidak meninggalkan baris separuh.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_DIR || '/var/www/blackboxs/backend';
const APPLY = process.argv.includes('--apply');

const mysql = require(path.join(BASE, 'node_modules/mysql2/promise'));
const { calculateMto } = require(path.join(BASE, 'dist/modules/estimator/mto/calculator'));
const { FORMULA_VERSION } = require(path.join(BASE, 'dist/modules/estimator/mto/types'));

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(BASE, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

(async () => {
  const env = readEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  });

  const [elements] = await conn.query(`
    SELECT e.id, e.element_type, e.element_name, e.parameters
    FROM engineering_inputs e
    LEFT JOIN mto_lines l ON l.element_id = e.id
    WHERE l.id IS NULL
    GROUP BY e.id
    ORDER BY e.id
  `);

  console.log(`Mode         : ${APPLY ? 'APPLY (menulis)' : 'DRY-RUN (simulasi)'}`);
  console.log(`Versi formula: ${FORMULA_VERSION}`);
  console.log(`Elemen tanpa baris: ${elements.length}\n`);

  let ok = 0;
  let skipped = 0;
  let totalLines = 0;
  const problems = [];

  for (const el of elements) {
    let params = el.parameters;
    if (typeof params === 'string') {
      try { params = JSON.parse(params || '{}'); } catch { params = {}; }
    }

    const mto = calculateMto(el.element_type, params || {});

    // Elemen yang parameternya tidak valid, tipenya tidak dikenali, atau memang
    // belum punya formula (mis. precast_pile) TIDAK diisi. Menuliskan nol baris
    // sebagai "sudah di-backfill" akan menyembunyikan bahwa kuantitasnya belum
    // pernah dihitung.
    if (mto.variant === 'invalid' || mto.lines.length === 0) {
      skipped++;
      problems.push(
        `  #${el.id} ${el.element_type}/${el.element_name} → DILEWATI (${mto.variant}): `
        + `${(mto.notes[0] || 'tidak menghasilkan baris').slice(0, 90)}`
      );
      continue;
    }

    if (APPLY) {
      await conn.beginTransaction();
      try {
        for (const l of mto.lines) {
          await conn.execute(
            `INSERT INTO mto_lines
              (element_id, line_code, label, category, net_quantity, waste_percent,
               gross_quantity, unit, formula_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [el.id, l.code, l.label, mto.element_type, l.net_quantity, l.waste_percent,
              l.gross_quantity, l.unit, FORMULA_VERSION]
          );
        }
        await conn.execute(
          'UPDATE engineering_inputs SET formula_version = ? WHERE id = ?',
          [FORMULA_VERSION, el.id]
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        problems.push(`  #${el.id} GAGAL: ${String(e.message).slice(0, 90)}`);
        skipped++;
        continue;
      }
    }

    ok++;
    totalLines += mto.lines.length;
  }

  console.log(`Berhasil     : ${ok} elemen, ${totalLines} baris`);
  console.log(`Dilewati     : ${skipped}`);
  if (problems.length) {
    console.log('\nRincian yang dilewati:');
    problems.forEach(p => console.log(p));
  }
  if (!APPLY) console.log('\n(simulasi — belum ada yang ditulis)');

  await conn.end();
})().catch(err => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
