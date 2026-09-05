/**
 * SKEMA-FALLBACK-01 — jalur `ADD COLUMN IF NOT EXISTS` di MySQL 8.
 *
 * MySQL 8 tidak mengenal `ADD COLUMN IF NOT EXISTS` sama sekali, jadi SETIAP
 * statement bentuk itu di `config/database.ts` mendarat di
 * `tryFallbackAddColumn`. Versi pertama helper itu hanya mengambil klausa
 * PERTAMA lalu menyapu sisanya ke dalam definisi kolom, sehingga fallback-nya
 * menjalankan
 *
 *   ALTER TABLE qc_results ADD COLUMN `approved_by` INT NULL,
 *       ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL
 *
 * — syntax error lagi, dan TIDAK SATU KOLOM PUN dibuat. Terukur di produksi
 * 5 September 2026: `qc_results.approved_by`/`approved_at` tidak ada meski
 * ensure-nya berjalan tiap boot. Satu-satunya jejaknya satu baris
 * `console.warn` di tengah ratusan baris log boot, jadi jalur approve/reject
 * QC yang "dilengkapi" CABUT-QC-PPIC-01 sebenarnya tetap mati.
 *
 * ⚠️ **Tes ini sengaja TIDAK memeriksa "kolomnya ada di database".** Di mesin
 * dev kolom-kolom itu ada — dibuat tangan saat verifikasi dulu — jadi asersi
 * semacam itu lulus tanpa membuktikan apa pun, persis kesalahan yang membuat
 * cacat ini lolos ke produksi. Yang diuji di sini adalah HELPER-nya, terhadap
 * tabel gores yang dibuat tes ini sendiri.
 */
import 'dotenv/config';
import { dbQuery, dbRun, execSchemaEnsure, tryFallbackAddColumn, pecahKlausaAddColumn } from '../src/config/database';
import * as fs from 'fs';
import * as path from 'path';

let lulus = 0, gagal = 0;
const ok = (nama: string, syarat: boolean, dapat?: any) => {
  if (syarat) { lulus++; console.log(`  ok   ${nama}`); }
  else { gagal++; console.log(`  FAIL ${nama}${dapat !== undefined ? ` → dapat ${JSON.stringify(dapat)}` : ''}`); }
};

const TABEL = 'zz_uji_skema_fallback';

/** `tryFallbackAddColumn` menerima objek ber-`.execute()` yang membalas [rows, fields]. */
const conn = { execute: async (sql: string, params: any[] = []) => [await dbQuery(sql, params), []] };

const kolomAda = async (kolom: string): Promise<boolean> => {
  const r: any = await dbQuery(
    `SELECT COUNT(*) c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [TABEL, kolom]);
  return Number(r?.[0]?.c || 0) > 0;
};

const tipeKolom = async (kolom: string): Promise<string> => {
  const r: any = await dbQuery(
    `SELECT COLUMN_TYPE t FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [TABEL, kolom]);
  return String(r?.[0]?.t || '');
};

const main = async () => {
  console.log('\n=== SKEMA-FALLBACK-01: ADD COLUMN IF NOT EXISTS di MySQL 8 ===\n');

  await dbRun(`DROP TABLE IF EXISTS ${TABEL}`);
  await dbRun(`CREATE TABLE ${TABEL} (id INT PRIMARY KEY AUTO_INCREMENT) ENGINE=InnoDB`);

  // `finally`, bukan baris terakhir: kalau asersi di tengah melempar, tabel
  // goresnya tetap harus hilang — tes yang gagal sambil meninggalkan sampah di
  // database dev membuat orang enggan menjalankannya lagi.
  try {

  console.log('1. Pemecah klausa');
  const dua = pecahKlausaAddColumn(
    'ALTER TABLE qc_results ADD COLUMN IF NOT EXISTS approved_by INT NULL, ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL');
  ok('ALTER dua kolom menghasilkan DUA klausa', dua?.kolom?.length === 2, dua?.kolom?.length);
  ok('tabelnya terbaca', dua?.table === 'qc_results', dua?.table);
  ok('kolom pertama benar', dua?.kolom?.[0]?.column === 'approved_by', dua?.kolom?.[0]?.column);
  ok('kolom kedua benar', dua?.kolom?.[1]?.column === 'approved_at', dua?.kolom?.[1]?.column);
  ok('definisi kolom pertama tidak kebawa sisa statement',
    dua?.kolom?.[0]?.definition === 'INT NULL', dua?.kolom?.[0]?.definition);

  const koma = pecahKlausaAddColumn(
    'ALTER TABLE t ADD COLUMN IF NOT EXISTS harga DECIMAL(15,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS nama VARCHAR(50) NULL');
  ok('koma DI DALAM definisi tidak memecah klausa', koma?.kolom?.length === 2, koma?.kolom?.length);
  ok('DECIMAL(15,2) utuh', koma?.kolom?.[0]?.definition === 'DECIMAL(15,2) NOT NULL DEFAULT 0', koma?.kolom?.[0]?.definition);

  const satu = pecahKlausaAddColumn('ALTER TABLE t ADD COLUMN IF NOT EXISTS a INT NULL');
  ok('satu kolom tetap terbaca (perilaku lama utuh)', satu?.kolom?.length === 1, satu?.kolom?.length);

  ok('statement yang bukan ADD COLUMN IF NOT EXISTS ditolak',
    pecahKlausaAddColumn('ALTER TABLE t ADD INDEX idx_x (x)') === null);
  ok('CREATE TABLE ditolak', pecahKlausaAddColumn('CREATE TABLE t (id INT)') === null);

  console.log('\n2. Dua kolom sekaligus — bentuk yang gagal di produksi');
  await execSchemaEnsure(conn, `
    ALTER TABLE ${TABEL}
    ADD COLUMN IF NOT EXISTS approved_by INT NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL
  `);
  ok('kolom PERTAMA terbuat', await kolomAda('approved_by'));
  ok('kolom KEDUA terbuat', await kolomAda('approved_at'));

  console.log('\n3. Idempoten — boot berulang tidak menggagalkan apa pun');
  await execSchemaEnsure(conn, `
    ALTER TABLE ${TABEL}
    ADD COLUMN IF NOT EXISTS approved_by INT NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL
  `);
  ok('kedua kolom masih ada setelah dijalankan ulang',
    (await kolomAda('approved_by')) && (await kolomAda('approved_at')));

  console.log('\n4. Campuran — satu sudah ada, satu belum');
  await execSchemaEnsure(conn, `
    ALTER TABLE ${TABEL}
    ADD COLUMN IF NOT EXISTS approved_by INT NULL,
    ADD COLUMN IF NOT EXISTS catatan_uji VARCHAR(50) NULL
  `);
  ok('kolom baru tetap mendarat meski kolom lain sudah ada', await kolomAda('catatan_uji'));

  console.log('\n5. Definisi bermuatan koma');
  await execSchemaEnsure(conn, `
    ALTER TABLE ${TABEL}
    ADD COLUMN IF NOT EXISTS nilai_uji DECIMAL(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS label_uji VARCHAR(30) NULL
  `);
  ok('DECIMAL(15,2) terpasang dengan presisi utuh', (await tipeKolom('nilai_uji')).includes('decimal(15,2)'),
    await tipeKolom('nilai_uji'));
  ok('kolom sesudah definisi berkoma ikut terbuat', await kolomAda('label_uji'));

  console.log('\n6. Statement bukan ADD COLUMN diteruskan ke pemanggil');
  ok('tryFallbackAddColumn menolak ADD INDEX (false = tidak ditangani)',
    (await tryFallbackAddColumn(conn, `ALTER TABLE ${TABEL} ADD INDEX idx_zz (approved_by)`)) === false);

  console.log('\n7. Setiap ALTER multi-kolom di database.ts benar-benar terpecah');
  const src = fs.readFileSync(path.join(__dirname, '../src/config/database.ts'), 'utf-8');
  const literal = src.match(/`[^`]*`/g) || [];
  let multi = 0, terpecah = 0;
  for (const L of literal) {
    const isi = L.slice(1, -1);
    const jml = (isi.match(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi) || []).length;
    if (jml < 2 || !/ALTER\s+TABLE/i.test(isi)) continue;
    multi++;
    const p = pecahKlausaAddColumn(isi);
    if (p && p.kolom.length === jml) terpecah++;
    else console.log(`     >>> tidak terpecah utuh: ${isi.trim().substring(0, 70)}`);
  }
  ok(`semua ${multi} ALTER multi-kolom terpecah utuh`, multi > 0 && terpecah === multi, [terpecah, multi]);

  } finally {
    await dbRun(`DROP TABLE IF EXISTS ${TABEL}`);
  }

  console.log('\n8. Bersih-bersih');
  const sisa: any = await dbQuery(
    `SELECT COUNT(*) c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [TABEL]);
  ok('tabel gores terhapus', Number(sisa?.[0]?.c || 0) === 0);

  console.log(`\n=== ${lulus} lulus, ${gagal} gagal ===\n`);
  process.exit(gagal ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
