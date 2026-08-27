#!/usr/bin/env node
/**
 * Impor AHSP katalog resmi 2026 dari hasil analisis tim reviewer.
 *
 * Sumbernya `AHSP_Gap_Official_2026_vs_EPC_DB.xlsx` sheet `Dry Run Headers` dan
 * `Dry Run Items` — BUKAN sheet `Gap Import` yang jauh lebih besar. Alasannya
 * menentukan, dan bukan kehati-hatian umum:
 *
 *   Katalog resmi memuat 5.760 baris dan 3.332 di antaranya ditandai "safe
 *   missing candidate". Tapi tim reviewer hanya menjalankan dry-run struktural
 *   pada 159 header, dan hanya 121 yang lolos SELURUH gerbangnya. Sisanya
 *   tertahan oleh satu sebab yang sama: sumber dayanya belum ada di master kita.
 *   Dari 2.096 celah resource yang dianalisis, 1.854 berstatus
 *   NEW_MASTER_CANDIDATE — mengimpor semuanya berarti membuat 1.854 master
 *   sumber daya baru yang belum pernah diperiksa manusia, ditambah 208 lagi yang
 *   reviewer sendiri tandai perlu review (konflik kode, varian spesifikasi,
 *   konversi satuan).
 *
 *   AHSP adalah katalog yang dipakai estimator menetapkan harga penawaran.
 *   Memasukkan 3.200 analisa yang harganya berdiri di atas master karangan bukan
 *   memperkaya katalog — itu mencemarinya, dan cemarannya tidak bisa dibedakan
 *   dari data yang sah begitu tersimpan.
 *
 * Yang diimpor skrip ini: hanya header ber-`Result = PASS_DRY_RUN`, yang setiap
 * itemnya menunjuk `resource_id` yang SUDAH ADA di master — diperiksa ulang
 * terhadap database saat skrip dijalankan, bukan terhadap snapshot analisis.
 *
 * Pemakaian:
 *   node scripts/import-ahsp-katalog.js            # simulasi
 *   node scripts/import-ahsp-katalog.js --apply    # menulis
 *
 * Idempoten: kode yang sudah ada dilewati, tidak pernah ditimpa. AHSP yang sudah
 * dipakai proposal membekukan harganya lewat snapshot, jadi menimpa katalog
 * tidak mengubah penawaran lama — tapi mengubah katalog di bawah kaki estimator
 * yang sedang bekerja.
 *
 * Status yang ditulis sengaja `draft`: katalog baru TIDAK otomatis muncul di
 * picker estimator (`GET /ahsp` hanya menyajikan `active`) sampai seseorang
 * meninjau dan mengaktifkannya.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_DIR || path.join(__dirname, '../backend');
const REPO = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const XLSX_PATH = process.env.AHSP_XLSX
  || path.join(REPO, 'outputs/ahsp-enrichment-20260820/AHSP_Gap_Official_2026_vs_EPC_DB.xlsx');

/**
 * Simulasi terhadap keadaan database LAIN, tanpa menyentuhnya.
 *
 * `--snapshot <berkas.json>` memakai daftar kode AHSP dan id sumber daya yang
 * diekspor read-only dari server, sehingga rencana impor bisa diperiksa dengan
 * angka sebenarnya tanpa perlu memindahkan workbook 3,8 MB ke server maupun
 * memasang paket apa pun di sana. Hanya berlaku untuk simulasi — penulisan
 * selalu memakai koneksi database yang nyata.
 */
const iSnap = process.argv.indexOf('--snapshot');
const SNAPSHOT = iSnap >= 0 ? process.argv[iSnap + 1] : null;

const mysql = require(path.join(BASE, 'node_modules/mysql2/promise'));
const XLSX = require(path.join(BASE, 'node_modules/xlsx'));

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(BASE, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const num = v => (v == null || v === '' ? 0 : Number(v));

/**
 * Baca staging penuh, bukan hanya sampel dry-run.
 *
 * Sheet `Dry Run Headers`/`Dry Run Items` hanya memuat 159 header yang sempat
 * disimulasikan reviewer. Sheet `AHSP Header Stage` (3.336) dan
 * `AHSP Item Stage` (18.743) memuat seluruhnya — jadi skrip ini otomatis ikut
 * mengambil kandidat baru begitu master sumber dayanya dilengkapi, tanpa perlu
 * workbook baru.
 *
 * Harga header DITURUNKAN dari itemnya di sini, bukan dibaca dari kolom hasil.
 * Dengan begitu header dan item tidak mungkin berbeda angka. Untuk 159 header
 * yang reviewer juga hitung, hasilnya DIBANDINGKAN — selisih berarti salah satu
 * dari kami keliru, dan itu alasan sah untuk berhenti, bukan untuk memilih.
 */
const SEKSI_KE_FIELD = { A: 'harga_tenaga', B: 'harga_bahan', C: 'harga_alat' };
const OP_RATE = 0.10;
/**
 * Pembulatan 2 desimal yang tahan galat representasi float.
 *
 * `Math.round(v * 100) / 100` saja SALAH untuk nilai seperti
 * `0.237 × 125685 = 29787.345`: dikali 100 ia menjadi `2978734.4999999996`
 * dalam biner, lalu membulat ke bawah menjadi 29787.34 — sementara nilai
 * desimalnya jelas 29787.35. Selisih satu sen per baris, pada 18.743 baris
 * katalog harga.
 *
 * `toPrecision(12)` membuang galat representasi itu lebih dulu, baru
 * dibulatkan.
 */
const bulat2 = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const tanda = n < 0 ? -1 : 1;
  const skala = Number((Math.abs(n) * 100).toPrecision(12));
  return tanda * Math.round(skala) / 100;
};
const desimal = v => { const t = String(v); const i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };

function bacaWorkbook() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ambil = (nama) => {
    const ws = wb.Sheets[nama];
    if (!ws) throw new Error(`Sheet "${nama}" tidak ada di ${XLSX_PATH}`);
    const semua = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let hi = 0;
    for (let i = 0; i < 8; i++) if ((semua[i] || []).filter(Boolean).length > 4) { hi = i; break; }
    const kol = semua[hi].map(x => (x == null ? '' : String(x).trim()));
    return semua.slice(hi + 1)
      .filter(r => r.some(c => c != null && c !== ''))
      .map(r => Object.fromEntries(kol.map((k, i) => [k, r[i]])));
  };

  const headers = ambil('AHSP Header Stage').map(r => ({
    source: r['Source'],
    kode: r['Proposed DB Code'],
    name: r['Description'],
    satuan: r['Unit'],
    version: r['Version'] == null ? '2026' : String(r['Version']),
    kategori: r['Category'],
  })).filter(h => h.kode && h.name && h.satuan);

  const items = ambil('AHSP Item Stage').map(r => ({
    kode: r['Proposed DB Code'],
    section: r['Section'],
    resource_type: r['Resource Type'],
    resource_id: Number(r['Master ID']),
    resource_name: r['Master Name'] || r['Resource Name'],
    resource_name_asli: r['Resource Name'],
    resource_satuan: r['Resource Unit'],
    koefisien: num(r['Coefficient']),
    resource_harga: num(r['Resource Price']),
    match: String(r['Master Match'] || ''),
  })).filter(i => i.kode);

  // Alias aman: `AHSP Item Stage` dibuat SEBELUM tahap resolusi sumber daya,
  // jadi sebagian item di sana masih `UNMATCHED` berharga 0 padahal reviewer
  // sudah memetakannya ke master yang ada. Tanpa menerapkannya, kandidat yang
  // sebenarnya siap akan tertahan — dan lebih buruk, kalau harga 0-nya lolos,
  // AHSP-nya masuk dengan harga yang salah.
  //
  // Hanya `SAFE_ALIAS_TO_MASTER` yang dipakai. Kelas lain
  // (CODE_CONFLICT_REVIEW, SEMANTIC_ALIAS_REVIEW, SPEC_VARIANT_REVIEW,
  // UNIT_CONVERSION_REVIEW) memang bertanda "review" — reviewer sendiri belum
  // memutuskannya.
  const alias = new Map();
  try {
    for (const r of ambil('Resource Resolution')) {
      if (String(r['Classification']) !== 'SAFE_ALIAS_TO_MASTER') continue;
      const id = Number(r['Candidate Master ID']);
      if (!Number.isFinite(id)) continue;
      alias.set(`${r['Resource Type']}|${String(r['Resource Name']).trim().toLowerCase()}|${String(r['Resource Unit']).trim().toLowerCase()}`, {
        id, name: r['Candidate Master Name'], satuan: r['Candidate Master Unit'],
        harga: num(r['Candidate Price']),
      });
    }
  } catch { /* sheet resolusi boleh tidak ada */ }

  let dialias = 0;
  for (const i of items) {
    if (i.match === 'EXACT_NAME_UNIT' || i.match === 'EXACT_CODE_CONFIRMED') continue;
    const k = `${i.resource_type}|${String(i.resource_name_asli || i.resource_name).trim().toLowerCase()}|${String(i.resource_satuan).trim().toLowerCase()}`;
    const a = alias.get(k);
    if (!a) continue;
    i.resource_id = a.id;
    i.resource_name = a.name;
    i.resource_satuan = a.satuan;
    i.resource_harga = a.harga;
    i.match = 'EXACT_NAME_UNIT';   // setara: dipetakan manusia, bukan ditebak
    dialias++;
  }
  if (dialias) console.log(`Alias aman diterapkan pada ${dialias} item.`);

  // Hitungan pembanding dari sampel reviewer.
  const banding = {};
  try {
    for (const r of ambil('Dry Run Headers')) {
      if (r['Proposed DB Code']) banding[r['Proposed DB Code']] = num(r['Harga Satuan']);
    }
  } catch { /* sheet dry-run boleh tidak ada */ }

  return { headers, items, banding };
}

/**
 * Turunkan angka header dari itemnya, dengan O&P 10% seperti katalog resmi.
 *
 * Urutan pembulatannya menentukan, dan versi pertama saya salah: saya
 * menjumlahkan hasil kali mentah lalu membulatkan per seksi, yang menghasilkan
 * selisih satu sen terhadap hitungan reviewer maupun angka yang sudah tersimpan
 * di produksi. Yang benar adalah membulatkan **tiap item** ke 2 desimal dulu,
 * baru dijumlahkan — karena `ahsp_items.jumlah_harga` memang bertipe
 * decimal(15,2). Kalau tidak, header tidak akan sama dengan jumlah baris-baris
 * yang benar-benar tersimpan di bawahnya, dan selisih itu tidak akan bisa
 * dijelaskan siapa pun yang membukanya nanti.
 */
function hitungHeader(its) {
  const h = { harga_tenaga: 0, harga_bahan: 0, harga_alat: 0 };
  for (const i of its) {
    const f = SEKSI_KE_FIELD[i.section];
    // Nilai yang sama dengan yang akan ditulis ke `jumlah_harga`.
    i.jumlah_harga = bulat2(Number(i.koefisien) * Number(i.resource_harga));
    if (f) h[f] += i.jumlah_harga;
  }
  h.harga_tenaga = bulat2(h.harga_tenaga);
  h.harga_bahan = bulat2(h.harga_bahan);
  h.harga_alat = bulat2(h.harga_alat);
  h.harga_langsung = bulat2(h.harga_tenaga + h.harga_bahan + h.harga_alat);
  h.overhead_profit = bulat2(h.harga_langsung * OP_RATE);
  h.harga_satuan = bulat2(h.harga_langsung + h.overhead_profit);
  return h;
}

async function main() {
  const env = readEnv();
  const { headers, items, banding } = bacaWorkbook();

  console.log('AHSP katalog resmi 2026 — impor yang lolos seluruh gerbang');
  console.log('─'.repeat(72));
  console.log(`Sumber           : ${path.basename(XLSX_PATH)}`);
  console.log(`Header staged    : ${headers.length}  (item ${items.length})`);

  const conn = SNAPSHOT ? null : await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    const snap = SNAPSHOT ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : null;
    const adaRows = snap ? snap.kode.map(k => ({ kode: k }))
      : (await conn.query('SELECT kode FROM ahsp_headers'))[0];
    const sudahAda = new Set(adaRows.map(r => String(r.kode)));
    // Sumber daya TIDAK berada di satu tabel. `ahsp_items.resource_id` adalah
    // acuan longgar tanpa FK yang artinya bergantung pada `resource_type`:
    // labor → master_labor, material → master_materials, equipment →
    // master_equipment. Memeriksanya ke satu tabel saja akan meloloskan item
    // yang menunjuk id yang kebetulan ada di tabel lain.
    const TABEL_MASTER = {
      labor: 'master_labor',
      material: 'master_materials',
      equipment: 'master_equipment',
    };
    const masterAda = {};
    for (const [tipe, tabel] of Object.entries(TABEL_MASTER)) {
      const rows = snap ? (snap.master[tipe] || []).map(id => ({ id }))
        : (await conn.query(`SELECT id FROM ${tabel}`))[0];
      masterAda[tipe] = new Set(rows.map(r => Number(r.id)));
    }
    if (snap) console.log(`Sumber keadaan   : snapshot ${path.basename(SNAPSHOT)} (simulasi, tidak menyentuh database itu)`);
    const totalMaster = Object.values(masterAda).reduce((a, s) => a + s.size, 0);
    console.log(`Database         : ${sudahAda.size} AHSP, ${totalMaster} sumber daya `
      + `(${Object.entries(masterAda).map(([k, v]) => `${k} ${v.size}`).join(', ')})`);

    const AMAN = new Set(['EXACT_NAME_UNIT', 'EXACT_CODE_CONFIRMED']);
    const perKode = {};
    for (const i of items) (perKode[i.kode] = perKode[i.kode] || []).push(i);

    const rencana = [], dilewati = [], tertahan = {};
    const tahan = (sebab) => { tertahan[sebab] = (tertahan[sebab] || 0) + 1; };

    for (const h of headers) {
      const its = perKode[h.kode] || [];
      if (sudahAda.has(h.kode)) { dilewati.push(h.kode); continue; }
      if (!its.length) { tahan('tidak punya item'); continue; }

      // Gerbang 1: setiap sumber daya harus cocok PASTI ke master. Cocok samar
      // (`FUZZY_NAME_UNIT`) dan konflik kode tidak cukup — harga penawaran
      // berdiri di atasnya.
      if (its.some(i => !AMAN.has(i.match))) { tahan('sumber daya belum tentu cocok'); continue; }

      // Gerbang 2: masternya harus benar-benar ada DI DATABASE SEKARANG, dan
      // tipenya menentukan tabel mana yang diperiksa.
      if (its.some(i => !(i.resource_type in masterAda))) { tahan('resource_type tidak dikenal'); continue; }
      if (its.some(i => !Number.isFinite(i.resource_id) || !masterAda[i.resource_type].has(i.resource_id))) {
        tahan('sumber daya tidak ada di master'); continue;
      }

      // Gerbang 3: harga master Rp 1 adalah penanda "belum diisi". AHSP yang
      // dibangun di atasnya akan tampak berharga padahal tidak.
      if (its.some(i => !(Number(i.resource_harga) > 1))) { tahan('harga master masih placeholder (Rp 1)'); continue; }

      // Gerbang 4: `koefisien` bertipe decimal(10,4). Koefisien yang lebih
      // presisi akan DIPOTONG diam-diam saat disimpan, dan angka yang tersimpan
      // tidak lagi sama dengan katalog resminya.
      if (its.some(i => desimal(i.koefisien) > 4)) { tahan('koefisien lebih dari 4 desimal'); continue; }

      if (its.some(i => !['A', 'B', 'C'].includes(i.section))) { tahan('section di luar A/B/C'); continue; }

      const angka = hitungHeader(its);

      // Gerbang 5: untuk header yang reviewer juga hitung, hasil saya harus
      // sama. Selisih berarti salah satu dari kami keliru — dan memilih salah
      // satunya tanpa tahu sebabnya justru cara memasukkan angka salah.
      if (banding[h.kode] != null && Math.abs(banding[h.kode] - angka.harga_satuan) > 0.01) {
        tahan(`hitungan berbeda dari reviewer (${banding[h.kode]} vs ${angka.harga_satuan})`);
        continue;
      }

      rencana.push({ header: { ...h, ...angka }, items: its });
    }

    console.log('\nRencana terhadap database SEKARANG');
    console.log('─'.repeat(72));
    console.log(`Akan ditambahkan : ${rencana.length} AHSP (${rencana.reduce((a, r) => a + r.items.length, 0)} item)`);
    console.log(`Dilewati         : ${dilewati.length} (kodenya sudah ada)`);
    const totalTahan = Object.values(tertahan).reduce((a, b) => a + b, 0);
    console.log(`Tertahan gerbang : ${totalTahan}`);
    for (const [k, n] of Object.entries(tertahan).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(5)}  ${k}`);
    }

    if (rencana.length) {
      console.log('\nContoh yang akan masuk:');
      for (const r of rencana.slice(0, 6)) {
        console.log(`   ${String(r.header.kode).padEnd(24)} ${String(r.header.name).slice(0, 38).padEnd(40)} ${String(r.items.length).padStart(2)} item   Rp ${Number(r.header.harga_satuan).toLocaleString('id-ID')}`);
      }
    }

    if (!APPLY) {
      console.log('\n(simulasi — tidak ada yang ditulis. Tambahkan --apply untuk menyimpan)');
      return;
    }

    console.log('\nMenulis…');
    let masuk = 0, itemMasuk = 0, gagal = 0;
    for (const r of rencana) {
      await conn.beginTransaction();
      try {
        const [cek] = await conn.query('SELECT id FROM ahsp_headers WHERE kode = ? FOR UPDATE', [r.header.kode]);
        if (cek.length) { await conn.rollback(); continue; }
        const [res] = await conn.query(
          `INSERT INTO ahsp_headers
             (kode, name, satuan, version, status, work_category,
              harga_tenaga, harga_bahan, harga_alat, harga_langsung, overhead_profit, harga_satuan)
           VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
          [r.header.kode, r.header.name, r.header.satuan, r.header.version,
           r.header.source || null,
           r.header.harga_tenaga, r.header.harga_bahan, r.header.harga_alat,
           r.header.harga_langsung, r.header.overhead_profit, r.header.harga_satuan]
        );
        for (const i of r.items) {
          await conn.query(
            `INSERT INTO ahsp_items
               (ahsp_id, section, resource_type, resource_id, koefisien,
                resource_name, resource_satuan, resource_harga, jumlah_harga)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [res.insertId, i.section, i.resource_type, i.resource_id, i.koefisien,
             i.resource_name, i.resource_satuan, i.resource_harga, i.jumlah_harga]
          );
          itemMasuk++;
        }
        await conn.commit();
        masuk++;
      } catch (e) {
        await conn.rollback();
        gagal++;
        console.log(`   GAGAL ${r.header.kode}: ${e.message}`);
      }
    }
    console.log(`\nSelesai: ${masuk} AHSP, ${itemMasuk} item tersimpan${gagal ? `, ${gagal} gagal` : ''}.`);
    console.log('Status `draft` — belum muncul di picker estimator sampai ditinjau dan diaktifkan.');
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(e => { console.error('Gagal:', e.message); process.exit(1); });
