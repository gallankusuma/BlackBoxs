import 'dotenv/config';
/**
 * Penjaga skema untuk SELURUH berkas rute (SKEMA-RUTE-01).
 *
 * Nama tabel atau kolom yang salah **tidak menghasilkan error apa pun** saat
 * `tsc` maupun `npm run build` — ia baru meledak saat query-nya dijalankan, dan
 * seringnya errornya ditelan `catch` lalu muncul sebagai layar kosong. Repo ini
 * sudah tiga kali kena kelas itu:
 *
 *   - FIN-01      : `projects` / `proj.name` di finance → 4 endpoint selalu 500
 *   - PROC-INBOX  : `po.order_date`, `pr.requester_id` → rincian inbox tak pernah tampil
 *   - CABUT-STOCK : tabel `inventory`, `stock_transfers`, `stock_adjustments`
 *                   tidak pernah ada — fiturnya tidak pernah bisa bekerja
 *
 * Penjaga yang ada sebelumnya hanya sepotong: `test:finance-apar` memeriksa
 * nama tabel di finance saja, `test:gl-auto` memeriksa daftar kolom yang
 * ditulis tangan. Tes ini memindai semuanya.
 *
 * Prasyarat: database terhubung. Jalankan: npm run test:skema-rute
 */

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

/**
 * Mengambil isi template literal dari sumber TypeScript.
 *
 * Membuang komentar dengan filter baris TIDAK aman: beberapa komentar di repo
 * ini memuat backtick (mis. penjelasan tentang query lama), dan menghapus
 * barisnya menggeser batas seluruh literal sesudahnya — prosa lalu terbaca
 * sebagai SQL. Terukur: filter baris menghasilkan 7 tabel hantu palsu
 * (`the`, `visible`, `drawing`, ...). Karena itu di sini dipakai pemindai
 * keadaan yang benar-benar mengikuti string, komentar, dan interpolasi.
 */
function ambilLiteral(src: string): string[] {
  const out: string[] = [];
  let i = 0; const n = src.length;
  let buf = '';
  let mode: 'kode' | 'baris' | 'blok' | 'satu' | 'dua' | 'templ' = 'kode';
  let depth = 0;

  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (mode === 'kode') {
      if (c === '/' && c2 === '/') { mode = 'baris'; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'blok'; i += 2; continue; }
      if (c === "'") { mode = 'satu'; i++; continue; }
      if (c === '"') { mode = 'dua'; i++; continue; }
      if (c === '`') { mode = 'templ'; buf = ''; depth = 0; i++; continue; }
      i++; continue;
    }
    if (mode === 'baris') { if (c === '\n') mode = 'kode'; i++; continue; }
    if (mode === 'blok') { if (c === '*' && c2 === '/') { mode = 'kode'; i += 2; } else i++; continue; }
    if (mode === 'satu') { if (c === '\\') i += 2; else { if (c === "'") mode = 'kode'; i++; } continue; }
    if (mode === 'dua') { if (c === '\\') i += 2; else { if (c === '"') mode = 'kode'; i++; } continue; }
    if (c === '\\') { buf += src.slice(i, i + 2); i += 2; continue; }
    if (c === '$' && c2 === '{') { depth++; buf += '${'; i += 2; continue; }
    if (depth > 0) { if (c === '}') depth--; buf += c; i++; continue; }
    if (c === '`') { out.push(buf); mode = 'kode'; i++; continue; }
    buf += c; i++;
  }
  return out;
}

/** Membersihkan satu literal supaya yang tersisa benar-benar SQL. */
const bersihkan = (q: string) => q
  .split('\n').map(l => l.replace(/--.*$/, ' ')).join('\n')   // komentar SQL
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/FOR UPDATE( OF \w+)?/gi, ' ')
  // `ON DUPLICATE KEY UPDATE quantity = ...` membuat `quantity` terbaca
  // sebagai nama tabel. Terukur: 3 hantu palsu tanpa baris ini.
  .replace(/ON DUPLICATE KEY UPDATE[\s\S]*/i, ' ');

/**
 * Literal dianggap SQL hanya kalau memuat bentuk pernyataan yang nyata.
 *
 * Tanpa syarat ini, prosa ikut terbaca: prompt AI ("...infer from drawing
 * context...") dan teks seperti "Auto-generated from proposal X" menghasilkan
 * 7 tabel hantu palsu.
 */
const tampakSql = (q: string) =>
  /\b(SELECT\b[\s\S]*\bFROM|INSERT\s+INTO|UPDATE\s+`?[a-z_][a-z0-9_]*`?\s+SET|DELETE\s+FROM)\b/i.test(q);

/**
 * Tabel yang disebut kode tapi memang TIDAK ADA — utang yang sudah diketahui,
 * bukan izin untuk menambah yang baru.
 *
 * Diverifikasi 3 September 2026: kedua puluhnya tidak ada di database lokal
 * MAUPUN produksi, dan 18 endpoint GET yang menyentuhnya semuanya membalas 500.
 * Ini kelas yang sama dengan Stock Transfer (CABUT-STOCK-01): fitur yang tidak
 * pernah bisa bekerja. Keputusan mau dicabut, dibangun, atau dibiarkan ada di
 * pemilik — yang dijaga tes ini adalah daftarnya TIDAK BERTAMBAH.
 */
const HANTU_DIKETAHUI: Record<string, string> = {
  cogs: 'reports — laporan finance',
  delivery_orders: 'reports — laporan sales',
  event_shared_users: 'clients — berbagi event',
  inventory: 'reports — laporan inventory (tabel yang benar: inventory_stocks)',
  mps_details: 'ppic — Master Production Schedule',
  mps_headers: 'ppic — Master Production Schedule',
  mps_week_data: 'ppic — Master Production Schedule',
  mrp_week_data: 'ppic — Material Requirement Planning',
  profitability: 'reports — laporan finance (tabel yang benar: profitability_tracking)',
  projects: 'documents — daftar dokumen (tabel yang benar: client_projects)',
  qc_analysis_requests: 'qc — Final Product Analysis',
  qc_analysis_results: 'qc — Final Product Analysis',
  qc_batch_release: 'reports — laporan QC',
  qc_instruments: 'qc — Final Product Analysis',
  qc_methods: 'qc — spesifikasi QC',
  qc_parameters: 'qc — spesifikasi QC',
  qc_sampling_areas: 'qc — Final Product Analysis',
  qc_specifications: 'qc — spesifikasi QC',
  qc_test_definitions: 'quality — definisi uji',
  sales_order_items: 'sales — approval & riwayat',
};

/**
 * Kolom yang disebut kode tapi TIDAK ADA di tabelnya — utang yang sudah
 * diketahui, dengan nama kolom yang benar dicatat di sebelahnya.
 *
 * Sama seperti daftar tabel di atas: ini bukan izin menambah yang baru.
 * Diverifikasi 3 September 2026 terhadap skema nyata.
 */
const KOLOM_HANTU_DIKETAHUI: Record<string, string> = {
  'approval_actions.acted_at': 'yang ada: created_at',
  'batches.exp_date': 'yang ada: expiry_date',
  'batches.location_id': 'tidak ada padanannya',
  'client_events.visibility': 'tidak ada padanannya',
  'client_projects.product_id': 'tidak ada padanannya (ppic)',
  'client_projects.quantity': 'tidak ada padanannya (ppic)',
  'inventory_stocks.batch_id': 'tidak ada padanannya',
  'inventory_stocks.location_id': 'tidak ada padanannya',
  'products.minimum_stock': 'yang ada: reorder_point',
  'products.selling_price': 'tidak ada padanannya',
  'products.unit': 'yang ada: unit_of_measure_id',
  'proposal_items.ahsp_code': 'yang ada: ahsp_code_snapshot',
  'proposal_items.uraian': 'yang ada: description',
  'qc_results.result': 'yang ada: result_value',
  'qc_results.status': 'yang ada: result_status',
  'qc_results.test_id': 'yang ada: qc_test_id',
  'qc_results.tested_at': 'yang ada: test_date',
  'qc_results.tester_id': 'yang ada: tested_by',
  'stock_movements.location_id': 'tidak ada padanannya',
  'stock_movements.moved_at': 'yang ada: created_at',
  'stock_movements.uom': 'tidak ada padanannya',
};

const KATA_KUNCI = new Set(['select', 'set', 'values', 'duplicate', 'key', 'update', 'into', 'from', 'join']);
const ALIAS_BUKAN = new Set(['on', 'where', 'set', 'group', 'order', 'left', 'inner', 'join',
  'using', 'limit', 'having', 'values', 'as', 'and', 'or']);

async function main() {
  const fs = await import('fs');
  const { dbAll } = await import('../src/config/database');

  const kolom = new Map<string, Set<string>>();
  for (const r of await dbAll(
    'SELECT LOWER(TABLE_NAME) t, LOWER(COLUMN_NAME) c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()') as any[]) {
    if (!kolom.has(r.t)) kolom.set(r.t, new Set());
    kolom.get(r.t)!.add(r.c);
  }
  chk('skema database terbaca', kolom.size > 100, true);

  const berkas = fs.readdirSync('src/routes')
    .filter(f => f.endsWith('.ts') && !f.includes('.bak') && !f.includes('.old'));
  chk('berkas rute ditemukan', berkas.length >= 40, true);

  const hantuBaru = new Map<string, Set<string>>();
  const kolomHilang = new Map<string, Set<string>>();
  const kolomDipakai = new Set<string>();
  // Berapa acuan kolom yang BENAR-BENAR diperiksa. Tanpa angka ini, pemindai
  // yang berhenti bekerja membuat asersi "tidak ada kolom hantu" lulus dengan
  // sendirinya — persis kelas "verifikasi yang tidak memverifikasi apa pun".
  let kolomDiperiksa = 0;
  let tabelDiperiksa = 0;
  let literalSql = 0;

  for (const f of berkas) {
    for (const mentah of ambilLiteral(fs.readFileSync(`src/routes/${f}`, 'utf8'))) {
      const q = bersihkan(mentah);
      if (!tampakSql(q)) continue;
      literalSql++;

      const alias = new Map<string, string>();
      const tabelDipakai: string[] = [];
      for (const m of q.matchAll(/\b(FROM|JOIN|INTO|UPDATE)\s+`?([a-z_][a-z0-9_]*)`?(?:\s+(?:AS\s+)?([a-z][a-z0-9_]*))?/gi)) {
        const t = m[2].toLowerCase();
        if (KATA_KUNCI.has(t)) continue;
        if (!kolom.has(t)) {
          if (!HANTU_DIKETAHUI[t]) {
            if (!hantuBaru.has(t)) hantuBaru.set(t, new Set());
            hantuBaru.get(t)!.add(f);
          }
          continue;
        }
        tabelDiperiksa++;
        tabelDipakai.push(t);
        const a = (m[3] || '').toLowerCase();
        if (a && !ALIAS_BUKAN.has(a)) alias.set(a, t);
      }

      // Kolom BERALIAS.
      for (const m of q.matchAll(/\b([a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi)) {
        const t = alias.get(m[1].toLowerCase());
        if (!t) continue;
        kolomDiperiksa++;
        const c = m[2].toLowerCase();
        if (!kolom.get(t)!.has(c)) {
          const k = `${t}.${c}`;
          if (KOLOM_HANTU_DIKETAHUI[k]) { kolomDipakai.add(k); continue; }
          if (!kolomHilang.has(k)) kolomHilang.set(k, new Set());
          kolomHilang.get(k)!.add(f);
        }
      }

      // Kolom TANPA alias — hanya bisa dinilai kalau query menyentuh SATU tabel.
      //
      // Titik buta ini nyata: audit procurement melewatkan
      // `material_vendor_prices ... WHERE product_id = ?` justru karena
      // query-nya tidak memakai alias, jadi kolomnya tidak pernah dipetakan ke
      // tabel mana pun.
      //
      // Dan HANYA kalau tidak ada subquery. Terukur: `(SELECT COUNT(*) FROM
      // mps_details WHERE mps_header_id = m.id)` di dalam query yang tabel
      // luarnya `users` membuat `mps_header_id` ditempelkan ke `users` —
      // hantu palsu. Pemindai yang melaporkan hantu sama tidak bergunanya
      // dengan pemindai yang diam.
      const unik = [...new Set(tabelDipakai)];
      if (unik.length === 1 && !/\(\s*SELECT\b/i.test(q)) {
        const t = unik[0];
        for (const m of q.matchAll(/\bWHERE\s+([a-z_][a-z0-9_]*)\s*(=|<|>|IN\b|LIKE\b|IS\b)/gi)) {
          const c = m[1].toLowerCase();
          if (ALIAS_BUKAN.has(c) || c === 'not' || c === 'exists') continue;
          if (!kolom.get(t)!.has(c)) {
            const k = `${t}.${c}`;
            if (KOLOM_HANTU_DIKETAHUI[k]) { kolomDipakai.add(k); continue; }
            if (!kolomHilang.has(k)) kolomHilang.set(k, new Set());
            kolomHilang.get(k)!.add(f);
          }
        }
      }
    }
  }

  chk('literal SQL yang diperiksa', literalSql > 500, true);
  // Angka lantai ini yang membuat pemindai tidak bisa diam-diam dimatikan.
  chk('pemindai benar-benar bekerja (acuan tabel & kolom terperiksa)',
    [tabelDiperiksa > 800, kolomDiperiksa > 2000], [true, true]);

  console.log('\n1. Tidak ada tabel hantu BARU');
  const daftarBaru = [...hantuBaru.entries()].map(([t, f]) => `${t} (${[...f].join(', ')})`).sort();
  chk('tidak ada tabel yang disebut SQL tapi tidak ada di database', daftarBaru, []);

  console.log('\n2. Tidak ada kolom yang disebut SQL tapi tidak ada');
  const daftarKolom = [...kolomHilang.entries()].map(([k, f]) => `${k} (${[...f].join(', ')})`).sort();
  chk('tidak ada kolom hantu', daftarKolom, []);

  console.log('\n3. Utang yang sudah diketahui tidak bertambah dan tidak lupa dicatat');
  // Hantu yang SUDAH DIPERBAIKI harus dikeluarkan dari daftar — allowlist yang
  // menyimpan nama yang sudah tidak dipakai lagi lama-lama jadi hiasan, dan
  // orang berhenti membacanya.
  const masihDisebut = new Set<string>();
  for (const f of berkas) {
    for (const mentah of ambilLiteral(fs.readFileSync(`src/routes/${f}`, 'utf8'))) {
      const q = bersihkan(mentah);
      if (!tampakSql(q)) continue;
      for (const m of q.matchAll(/\b(FROM|JOIN|INTO|UPDATE)\s+`?([a-z_][a-z0-9_]*)`?/gi)) {
        if (HANTU_DIKETAHUI[m[2].toLowerCase()]) masihDisebut.add(m[2].toLowerCase());
      }
    }
  }
  const basi = Object.keys(HANTU_DIKETAHUI).filter(t => !masihDisebut.has(t)).sort();
  chk('tidak ada entri allowlist yang sudah tidak dipakai', basi, []);
  const sudahAda = Object.keys(HANTU_DIKETAHUI).filter(t => kolom.has(t)).sort();
  chk('tidak ada entri allowlist yang ternyata tabelnya sudah dibuat', sudahAda, []);

  const kolomBasi = Object.keys(KOLOM_HANTU_DIKETAHUI).filter(k => !kolomDipakai.has(k)).sort();
  chk('tidak ada entri kolom allowlist yang sudah tidak dipakai', kolomBasi, []);
  const kolomSudahAda = Object.keys(KOLOM_HANTU_DIKETAHUI)
    .filter(k => { const [t, c] = k.split('.'); return kolom.get(t)?.has(c); }).sort();
  chk('tidak ada entri kolom allowlist yang ternyata kolomnya sudah ada', kolomSudahAda, []);

  console.log(`\n  Utang yang masih berdiri: ${Object.keys(HANTU_DIKETAHUI).length} tabel, ${Object.keys(KOLOM_HANTU_DIKETAHUI).length} kolom`);
  console.log('  (29 dari 304 endpoint GET membalas 5xx karenanya — diukur 3 September 2026)');
  for (const [t, ket] of Object.entries(HANTU_DIKETAHUI).sort()) {
    console.log(`    ${t.padEnd(22)} ${ket}`);
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
