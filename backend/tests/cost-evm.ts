import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * PROJ-CTRL — biaya menempel work package, lalu EVM.
 *
 * Sebelum ini "actual cost" proyek adalah satu angka gelondongan: earned
 * progress dihitung per work package, biaya tidak. CPI dari keduanya akan
 * terlihat presisi dan salah. Produksi punya 134 AP dan 91 PO yang bahkan
 * belum punya `project_id`.
 *
 * Yang diuji: pemetaan tidak pernah menyentuh nilai dokumen, yang belum
 * dipetakan dilaporkan apa adanya, commitment tidak dilebur ke actual, dan
 * EVM menyatakan keterandalannya sendiri.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:evm
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

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const namaClient = `Client EVM ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;
  const pr = await call('POST', '/projects',
    { client_id: clientId, title: `Project EVM ${stamp}`, status: 'open', price: 1000000000 }, master);
  const projectId = pr.json?.id ?? pr.json?.data?.id;

  const kon: any = await dbRun(
    `INSERT INTO contracts (contract_number, project_id, original_value, currency, status, created_by)
     VALUES (?, ?, 1000000000, 'IDR', 'active', NULL)`, [`CTR-EVM-${stamp}`, projectId]);
  for (const [ln, sec, nama, unit, qty, amt] of [
    [1, 1, `Struktur ${stamp}`, '', 0, 0],
    [2, 0, `Beton ${stamp}`, 'm3', 300, 900000000],
    [3, 0, `Galian ${stamp}`, 'm3', 500, 100000000],
  ] as any[]) {
    await dbRun(
      `INSERT INTO contract_baseline_lines
        (contract_id, line_no, section_label, is_section, description, unit, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [kon.insertId, ln, sec ? nama : null, sec, sec ? null : nama, unit || null, qty, amt]);
  }
  for (const [ln, nama] of [[2, `Beton ${stamp}`], [3, `Galian ${stamp}`]] as any[]) {
    await dbRun(
      `INSERT INTO project_schedule_baseline
        (project_id, line_no, row_type, name, start_day, duration_days, start_date, end_date)
       VALUES (?, ?, 'item', ?, 0, 100, '2026-05-01', '2026-08-09')`, [projectId, ln, nama]);
  }
  await call('POST', `/projects/${projectId}/wbs/generate`, {}, master);
  const wBeton: any = await dbGet('SELECT id FROM project_wbs WHERE project_id = ? AND wbs_code = ?', [projectId, '1.1']);
  chk('fixture siap', !!wBeton?.id, true);

  try {
    console.log('\n1. EVM sebelum ada cut-off: null, BUKAN nol');
    const e0 = await call('GET', `/projects/${projectId}/evm`, undefined, master);
    chk('terbaca', e0.status, 200);
    chk('BAC dari ledger kontrak', Number(e0.json?.bac), 1000000000);
    chk('sumber BAC dinyatakan', e0.json?.bac_source, 'contract_ledger');
    chk('EV null, bukan 0', e0.json?.ev, null);
    chk('SPI null', e0.json?.spi, null);
    chk('dan sebabnya dikatakan',
      String(e0.json?.keterandalan?.catatan || '').includes('Belum ada periode cut-off'), true);

    console.log('\n2. Biaya dicatat, tapi belum dipetakan');
    const exp: any = await dbRun(
      `INSERT INTO project_expenses (expense_number, project_id, description, amount, expense_date)
       VALUES (?, ?, ?, 40000000, CURDATE())`, [`EXP-EVM-${stamp}`, projectId, `Semen ${stamp}`]);
    const ap: any = await dbRun(
      `INSERT INTO accounts_payable (vendor_invoice_number, project_id, invoice_date, due_date,
        amount, paid_amount, status, description)
       VALUES (?, ?, CURDATE(), CURDATE(), 60000000, 0, 'open', ?)`,
      [`INV-EVM-${stamp}`, projectId, `fixture ${stamp}`]);

    const alok1 = await call('GET', `/projects/${projectId}/cost-allocation`, undefined, master);
    chk('total biaya 100 juta', Number(alok1.json?.ringkasan?.total_biaya), 100000000);
    chk('seluruhnya belum teralokasi', Number(alok1.json?.belum_teralokasi?.biaya), 100000000);
    chk('dua dokumen', Number(alok1.json?.belum_teralokasi?.jml_dokumen_biaya), 2);
    chk('cakupannya 0%', Number(alok1.json?.ringkasan?.cakupan_pct), 0);

    console.log('\n3. Pemetaan TIDAK menyentuh nilai dokumen');
    const sebelumAp: any = await dbGet('SELECT amount, status, invoice_date FROM accounts_payable WHERE id = ?', [ap.insertId]);
    const petakan = await call('PUT', `/projects/${projectId}/cost-allocation/ap/${ap.insertId}`,
      { wbs_id: wBeton.id }, master);
    chk('pemetaan berhasil', petakan.status, 200);
    const sesudahAp: any = await dbGet('SELECT amount, status, invoice_date FROM accounts_payable WHERE id = ?', [ap.insertId]);
    chk('nilainya tidak berubah', Number(sesudahAp?.amount), Number(sebelumAp?.amount));
    chk('statusnya tidak berubah', sesudahAp?.status, sebelumAp?.status);
    chk('tanggalnya tidak berubah', String(sesudahAp?.invoice_date), String(sebelumAp?.invoice_date));

    console.log('\n4. Yang belum dipetakan tetap dilaporkan apa adanya');
    const alok2 = await call('GET', `/projects/${projectId}/cost-allocation`, undefined, master);
    chk('teralokasi 60 juta', Number(alok2.json?.ringkasan?.biaya_teralokasi), 60000000);
    chk('sisa 40 juta masih terbuka', Number(alok2.json?.belum_teralokasi?.biaya), 40000000);
    chk('cakupannya 60%', Number(alok2.json?.ringkasan?.cakupan_pct), 60);
    const wp = (alok2.json?.per_wbs || []).find((x: any) => x.wbs_code === '1.1');
    chk('menempel di work package yang benar', Number(wp?.actual), 60000000);

    console.log('\n5. Commitment TIDAK dilebur ke actual');
    const po: any = await dbRun(
      `INSERT INTO purchase_orders (po_number, po_date, project_id, wbs_id, total_amount, status)
       VALUES (?, CURDATE(), ?, ?, 200000000, 'approved')`, [`PO-EVM-${stamp}`, projectId, wBeton.id]);
    const alok3 = await call('GET', `/projects/${projectId}/cost-allocation`, undefined, master);
    const wp2 = (alok3.json?.per_wbs || []).find((x: any) => x.wbs_code === '1.1');
    chk('commitment 200 juta', Number(wp2?.committed), 200000000);
    chk('actual tetap 60 juta', Number(wp2?.actual), 60000000);
    // PO tidak boleh ikut menambal cakupan BIAYA — itu dua hal berbeda.
    chk('cakupan biaya tetap 60%, tidak tertutupi PO', Number(alok3.json?.ringkasan?.cakupan_pct), 60);
    chk('komitmen punya cakupannya sendiri', Number(alok3.json?.ringkasan?.cakupan_komitmen_pct), 100);
    const tree = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    const tw = (tree.json?.lines || []).find((x: any) => x.wbs_code === '1.1');
    chk('pohon WBS pun memisahkannya', `${tw?.actual_cost}/${tw?.committed_cost}`, '60000000/200000000');

    console.log('\n6. Cut-off disetujui → EVM hidup');
    await call('POST', `/projects/${projectId}/progress/periods`, { cutoff_date: '2026-06-20' }, master);
    const prog = await call('GET', `/projects/${projectId}/progress`, undefined, master);
    const pid = prog.json?.current?.id;
    for (const l of prog.json?.current?.lines || []) {
      await call('PUT', `/projects/${projectId}/progress/periods/${pid}/lines/${l.id}`,
        { claimed_pct: 10, evidence_note: `opname ${stamp}` }, master);
    }
    await call('POST', `/projects/${projectId}/progress/periods/${pid}/submit`, {}, master);
    await call('POST', `/projects/${projectId}/progress/periods/${pid}/approve`, {}, master);

    const e1 = await call('GET', `/projects/${projectId}/evm`, undefined, master);
    // earned 10% dari BAC 1 miliar = 100 juta.
    chk('EV 100 juta', Number(e1.json?.ev), 100000000);
    chk('AC 60 juta (hanya yang dipetakan)', Number(e1.json?.ac), 60000000);
    // CPI = 100jt / 60jt = 1,667
    chk('CPI 1.667', Number(e1.json?.cpi), 1.667);
    chk('CV 40 juta', Number(e1.json?.cv), 40000000);
    chk('commitment dilaporkan terpisah', Number(e1.json?.committed), 200000000);

    console.log('\n7. EVM menyatakan keterandalannya sendiri');
    chk('cakupan biaya 60%', Number(e1.json?.keterandalan?.cakupan_biaya_pct), 60);
    chk('biaya belum dipetakan disebut', Number(e1.json?.keterandalan?.biaya_belum_dipetakan), 40000000);
    chk('catatannya memperingatkan',
      String(e1.json?.keterandalan?.catatan || '').includes('60% biaya yang menempel'), true);
    chk('EAC dihitung dari CPI itu', Number(e1.json?.eac), 599880024);

    console.log('\n8. Tidak bisa menyeberang project');
    const pr2 = await call('POST', '/projects',
      { client_id: clientId, title: `Project EVM lain ${stamp}`, status: 'open' }, master);
    const proj2 = pr2.json?.id ?? pr2.json?.data?.id;
    // Dari project lain, work packagenya memang bukan miliknya — itu yang
    // dilaporkan lebih dulu, dan itu jawaban yang lebih tepat.
    const dariSeberang = await call('PUT', `/projects/${proj2}/cost-allocation/ap/${ap.insertId}`,
      { wbs_id: wBeton.id }, master);
    chk('memetakan dari project seberang ditolak 400', dariSeberang.status, 400);
    chk('sebabnya WBS beda project', dariSeberang.json?.code, 'WBS_BEDA_PROJECT');
    // Tanpa wbs_id pun, dokumennya tetap bukan milik project itu → 404.
    const dokSeberang = await call('PUT', `/projects/${proj2}/cost-allocation/ap/${ap.insertId}`,
      { wbs_id: null }, master);
    chk('dokumen milik project lain ditolak 404', dokSeberang.status, 404);
    chk('kodenya jelas', dokSeberang.json?.code, 'DOKUMEN_BUKAN_MILIK_PROJECT');
    const silang = await call('PUT', `/projects/${projectId}/cost-allocation/ap/${ap.insertId}`,
      { wbs_id: 99999999 }, master);
    chk('WBS ngawur ditolak 400', silang.status, 400);
    chk('kodenya jelas', silang.json?.code, 'WBS_BEDA_PROJECT');
    chk('jenis dokumen ngawur ditolak 400',
      (await call('PUT', `/projects/${projectId}/cost-allocation/kambing/1`, { wbs_id: wBeton.id }, master)).status, 400);
    await dbRun('DELETE FROM client_projects WHERE id = ?', [proj2]);

    console.log('\n9. Pemetaan bisa dilepas kembali');
    chk('dilepas', (await call('PUT', `/projects/${projectId}/cost-allocation/ap/${ap.insertId}`,
      { wbs_id: null }, master)).status, 200);
    const alok4 = await call('GET', `/projects/${projectId}/cost-allocation`, undefined, master);
    chk('cakupan biaya kembali 0%', Number(alok4.json?.ringkasan?.cakupan_pct), 0);
    chk('tapi komitmennya masih terpetakan', Number(alok4.json?.ringkasan?.cakupan_komitmen_pct), 100);
    const apAkhir: any = await dbGet('SELECT amount FROM accounts_payable WHERE id = ?', [ap.insertId]);
    chk('nilainya tetap utuh sepanjang bolak-balik', Number(apAkhir?.amount), 60000000);

    console.log('\n10. Terjaga auth');
    chk('EVM tanpa token 401', (await call('GET', `/projects/${projectId}/evm`)).status, 401);
    chk('alokasi tanpa token 401', (await call('GET', `/projects/${projectId}/cost-allocation`)).status, 401);
    chk('project tidak ada 404', (await call('GET', '/projects/99999999/evm', undefined, master)).status, 404);

    await dbRun('DELETE FROM purchase_orders WHERE id = ?', [po.insertId]);
    await dbRun('DELETE FROM project_expenses WHERE id = ?', [exp.insertId]);
    await dbRun('DELETE FROM accounts_payable WHERE id = ?', [ap.insertId]);

  } finally {
    console.log('\n11. Bersih-bersih');
    await dbRun('DELETE FROM purchase_orders WHERE po_number = ?', [`PO-EVM-${stamp}`]);
    await dbRun('DELETE FROM accounts_payable WHERE vendor_invoice_number = ?', [`INV-EVM-${stamp}`]);
    await dbRun('DELETE FROM project_expenses WHERE expense_number = ?', [`EXP-EVM-${stamp}`]);
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);
    await dbRun('DELETE FROM contracts WHERE contract_number = ?', [`CTR-EVM-${stamp}`]);
    await sapuFixture(stamp);
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    const sisa: any = await dbGet(
      'SELECT COUNT(*) n FROM accounts_payable WHERE vendor_invoice_number = ?', [`INV-EVM-${stamp}`]);
    chk('fixture biaya tersapu', Number(sisa?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
