import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Analisis margin per pekerjaan.
 *
 * Sebelum ini satu-satunya angka margin yang ada adalah "±10% tertanam di AHSP"
 * untuk seluruh penawaran. Padahal tiap baris punya komposisinya sendiri, dan
 * baris yang harganya pernah disunting bisa dijual **di bawah biaya langsungnya**
 * tanpa satu pun tanda.
 *
 * Yang dijaga di sini: tiga tingkat keandalan basis biaya dibedakan tegas.
 * Menyamakannya membuat baris yang basisnya TIDAK DIKETAHUI terlihat seperti
 * baris bermargin nol — dua hal yang sangat berbeda saat memutuskan harga.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:margin
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  // AHSP dengan komposisi yang bisa dihitung tangan: biaya 1jt + overhead 10%.
  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `MG.${stamp}`, name: `Beton margin ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: `Bahan ${stamp}`,
      resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id;
  const h: any = await dbGet('SELECT harga_langsung, overhead_profit, harga_satuan FROM ahsp_headers WHERE id = ?', [ahspId]);
  const langsung = Number(h?.harga_langsung), satuan = Number(h?.harga_satuan);
  chk('AHSP punya biaya langsung', langsung > 0, true);
  chk('dan harga jualnya lebih tinggi', satuan > langsung, true);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji margin ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  const it = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 10 }, master);
  const itemId = it.json?.id;

  try {
    console.log('\n1. Margin per baris dihitung dari basis yang TERPOTRET');
    const m1 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    chk('terbaca', m1.status, 200);
    const b1 = (m1.json?.lines || [])[0];
    chk('basisnya terpotret saat baris dibuat', b1?.basis, 'terpotret');
    chk('biaya satuan = harga langsung AHSP', Number(b1?.biaya_satuan), langsung);
    chk('total biaya = 10 x biaya satuan', Number(b1?.total_biaya), Math.round(langsung * 10 * 100) / 100);
    chk('marginnya selisih jual dan biaya',
      Number(b1?.margin), Math.round((satuan - langsung) * 10 * 100) / 100);
    // Margin dihitung terhadap HARGA JUAL, bukan terhadap biaya — overhead 10%
    // dari biaya berarti ~9,09% dari harga jual.
    chk('margin % terhadap harga jual, bukan biaya',
      Number(b1?.margin_pct), Math.round((satuan - langsung) / satuan * 10000) / 100);
    chk('cakupannya 100%', Number(m1.json?.ringkasan?.cakupan_pct), 100);
    chk('tidak ada yang merugi', m1.json?.ringkasan?.jml_merugi, 0);

    console.log('\n2. INI YANG SEBELUMNYA TIDAK TERLIHAT — baris dijual di bawah biaya');
    // Harga jual disunting jauh di bawah biaya langsungnya.
    await dbRun('UPDATE proposal_items SET unit_price_snapshot = ?, total_price = ? * qty WHERE id = ?',
      [langsung * 0.5, langsung * 0.5, itemId]);
    const m2 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    chk('baris merugi terdeteksi', m2.json?.ringkasan?.jml_merugi, 1);
    const rugi = (m2.json?.merugi || [])[0];
    chk('nilai ruginya disebut', Number(rugi?.margin) < 0, true);
    chk('dan baris mana yang rugi bisa dikenali', Number(rugi?.item_id), Number(itemId));
    // Basisnya tetap 'terpotret' — potretnya tidak ikut disunting.
    chk('basis biayanya tidak ikut berubah',
      Number((m2.json?.lines || [])[0]?.biaya_satuan), langsung);

    console.log('\n3. Baris TANPA basis tidak dianggap bermargin nol');
    // Baris manual tanpa AHSP: basisnya memang tidak diketahui.
    await dbRun(
      `INSERT INTO proposal_items (proposal_id, ahsp_code_snapshot, ahsp_name_snapshot,
        unit_snapshot, unit_price_snapshot, qty, total_price, order_no, is_section)
       VALUES (?, ?, ?, 'ls', 50000000, 1, 50000000, 99, 0)`,
      [pid, `MAN-${stamp}`, `Mobilisasi ${stamp}`]);
    const m3 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    const manual = (m3.json?.lines || []).find((x: any) => x.kode === `MAN-${stamp}`);
    chk('basisnya dinyatakan tidak ada', manual?.basis, 'tidak_ada');
    // Ini bedanya: null, bukan 0. Nol berarti "sudah dihitung, marginnya nol".
    chk('marginnya null, BUKAN nol', manual?.margin, null);
    chk('dan tidak ikut dihitung sebagai rugi', m3.json?.ringkasan?.jml_merugi, 1);
    chk('nilainya dilaporkan terpisah', Number(m3.json?.ringkasan?.nilai_tanpa_basis), 50000000);
    chk('cakupan turun di bawah 100%', Number(m3.json?.ringkasan?.cakupan_pct) < 100, true);
    chk('dan sebabnya dikatakan',
      String(m3.json?.catatan || '').includes('tidak punya basis biaya'), true);

    console.log('\n4. Basis dari master dipakai kalau harganya masih cocok');
    const it2 = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 5 }, master);
    // Kosongkan potretnya untuk memaksa jalur 'master'.
    await dbRun('UPDATE proposal_items SET direct_cost_snapshot = NULL, ovh_profit_snapshot = NULL WHERE id = ?',
      [it2.json?.id]);
    const m4 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    const dariMaster = (m4.json?.lines || []).find((x: any) => Number(x.item_id) === Number(it2.json?.id));
    chk('basisnya dari master', dariMaster?.basis, 'master');
    chk('biayanya tetap benar', Number(dariMaster?.biaya_satuan), langsung);
    // Begitu harga jualnya menyimpang dari master, basisnya berhenti bisa
    // dipercaya — dan itu dikatakan, bukan ditebak.
    await dbRun('UPDATE proposal_items SET unit_price_snapshot = 12345 WHERE id = ?', [it2.json?.id]);
    const m5 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    const menyimpang = (m5.json?.lines || []).find((x: any) => Number(x.item_id) === Number(it2.json?.id));
    chk('harga menyimpang → basis tidak ada', menyimpang?.basis, 'tidak_ada');

    console.log('\n5. Margin total = yang tertanam + yang ditambahkan');
    await call('PUT', `/estimator/proposals/${pid}/komersial`,
      { overhead_mode: 'nominal', overhead: 20000000,
        contingency_mode: 'nominal', risk_contingency: 10000000 }, master);
    const m6 = await call('GET', `/estimator/proposals/${pid}/margin`, undefined, master);
    const r = m6.json?.ringkasan;
    chk('overhead terbaca', Number(r?.overhead), 20000000);
    chk('cadangan terbaca', Number(r?.risk_contingency), 10000000);
    chk('margin total = margin baris + 30 juta',
      Number(r?.margin_total), Math.round((Number(r?.margin_baris) + 30000000) * 100) / 100);

    console.log('\n6. Terjaga auth & proposal tak dikenal');
    chk('tanpa token 401', (await call('GET', `/estimator/proposals/${pid}/margin`)).status, 401);
    chk('proposal tidak ada 404',
      (await call('GET', '/estimator/proposals/99999999/margin', undefined, master)).status, 404);

    console.log('\n7. Layar membedakan ketiga basis, bukan meratakannya');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'EstimatorProposalEditor.vue'), 'utf8');
    chk('layar memanggil endpoint margin', layar.includes('/margin`'), true);
    chk('baris merugi ditonjolkan', layar.includes('margin.merugi'), true);
    // Yang basisnya tidak diketahui HARUS terbaca berbeda dari margin nol.
    chk('yang tanpa basis ditulis "belum diketahui", bukan angka',
      layar.includes('belum diketahui'), true);
    chk('ketiga basis dibedakan di layar',
      layar.includes("'terpotret'") && layar.includes("'master'"), true);
    chk('cakupan ditampilkan', layar.includes('cakupan_pct'), true);

  } finally {
    console.log('\n8. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`MG.${stamp}`]);
    chk('fixture tersapu', disapu.proposal >= 1, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
