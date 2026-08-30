import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Template zona MTO + penerimaan usulan gambar secara massal.
 *
 * Dua keluhan yang sama akarnya: pekerjaan EPC berulang, tapi sistemnya
 * memaksa mengetik ulang. Tiap proposal mengisi belasan parameter dari nol,
 * dan delapan zona hasil bacaan PDF harus disetujui satu per satu.
 *
 * Yang dijaga di sini: template menyimpan PARAMETER (bukan kuantitas jadi),
 * gerbang dimensi wajib tetap berlaku saat template dipakai, dan penerimaan
 * massal melewati zona yang bermasalah alih-alih menggagalkan semuanya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-template
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
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const p1 = await call('POST', '/estimator/proposals',
    { project_name: `Uji template A ${stamp}`, status: 'draft' }, master);
  const pid1 = p1.json?.id;
  const zona = await call('POST', `/estimator/proposals/${pid1}/mto`, {
    element_type: 'foundation', element_name: `Pondasi F1 ${stamp}`,
    parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 24, depth: 1.5, lean_t: 0.05 },
  }, master);
  const elementId = zona.json?.id;
  chk('zona sumber siap', !!elementId, true);

  let tplId: number | null = null;
  let tplKosongId: number | null = null;
  try {
    console.log('\n1. Template disimpan DARI zona yang sudah ada');
    const simpan = await call('POST', '/estimator/mto/templates', {
      code: `TPL-A-${stamp}`, name: `Pondasi F1 tipikal ${stamp}`,
      from_element_id: elementId, category: 'Struktur',
      description: 'Footplate 2x2x0.4, lantai kerja 5cm',
    }, master);
    chk('tersimpan', simpan.status, 201);
    tplId = simpan.json?.id;
    chk('tipenya terbaca dari zona', simpan.json?.element_type, 'foundation');
    chk('varian terhitung', simpan.json?.variant, 'footplate');
    chk('tidak ada field tertunda (zona sumber sudah lengkap)', (simpan.json?.pending_fields || []).length, 0);

    const row: any = await dbGet('SELECT parameters FROM mto_zone_templates WHERE id = ?', [tplId]);
    const par = typeof row?.parameters === 'string' ? JSON.parse(row.parameters) : row?.parameters;
    chk('yang disimpan PARAMETER, bukan kuantitas', Number(par?.L), 2);
    chk('dan tidak memuat kuantitas jadi', par?.quantities === undefined && par?.lines === undefined, true);

    console.log('\n2. Kode ganda ditolak');
    chk('ditolak 409', (await call('POST', '/estimator/mto/templates', {
      code: `TPL-A-${stamp}`, name: 'apa saja', element_type: 'foundation',
      parameters: { foundation_type: 'footplate', L: 1, W: 1, H: 0.3, qty: 1, depth: 1 },
    }, master)).json?.code, 'KODE_SUDAH_ADA');

    console.log('\n3. Template BOLEH tidak lengkap — itu justru gunanya');
    // Jumlah titik berbeda tiap proyek; memaksanya diisi membuat template
    // kehilangan guna. Yang kurang dicatat sebagai pending_fields.
    const kosong = await call('POST', '/estimator/mto/templates', {
      code: `TPL-B-${stamp}`, name: `Kolom K300 tipikal ${stamp}`,
      element_type: 'column', parameters: { col_type: 'concrete', B: 0.4, H: 0.4 },
    }, master);
    chk('tersimpan meski belum lengkap', kosong.status, 201);
    tplKosongId = kosong.json?.id;
    chk('yang kurang dicatat', (kosong.json?.pending_fields || []).length > 0, true);

    console.log('\n4. Parameter yang TIDAK VALID tetap ditolak');
    chk('ditolak 422', (await call('POST', '/estimator/mto/templates', {
      name: 'ngawur', element_type: 'foundation',
      parameters: { foundation_type: 'entah-apa', L: 2, W: 2 },
    }, master)).status, 422);

    console.log('\n5. Template dipakai di PROPOSAL LAIN — inilah gunanya');
    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Uji template B ${stamp}`, status: 'draft' }, master);
    const pid2 = p2.json?.id;
    const pakai = await call('POST', `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplId, element_name: `Pondasi F1 proyek B ${stamp}` }] }, master);
    chk('berhasil', pakai.status, 201);
    chk('satu zona dibuat', (pakai.json?.dibuat || []).length, 1);
    chk('barisnya ikut terhitung', Number(pakai.json?.dibuat?.[0]?.lines) > 0, true);

    // Kuantitas DIHITUNG ULANG, bukan disalin.
    const el: any = await dbGet(
      `SELECT quantities, parameters FROM engineering_inputs WHERE id = ?`,
      [pakai.json?.dibuat?.[0]?.element_id]);
    const q = typeof el?.quantities === 'string' ? JSON.parse(el.quantities) : el?.quantities;
    chk('kuantitasnya ada dan terhitung', Object.keys(q || {}).length > 0, true);
    const baris: any[] = await dbAll('SELECT COUNT(*) n FROM mto_lines WHERE element_id = ?',
      [pakai.json?.dibuat?.[0]?.element_id]);
    chk('baris MTO tersimpan', Number((baris as any)[0]?.n) > 0, true);

    console.log('\n6. Override menimpa yang memang berbeda tiap proyek');
    const pakai2 = await call('POST', `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplId, element_name: `Pondasi F2 ${stamp}`, overrides: { qty: 8 } }] },
      master);
    chk('berhasil', pakai2.status, 201);
    const el2: any = await dbGet('SELECT parameters FROM engineering_inputs WHERE id = ?',
      [pakai2.json?.dibuat?.[0]?.element_id]);
    const par2 = typeof el2?.parameters === 'string' ? JSON.parse(el2.parameters) : el2?.parameters;
    chk('qty tertimpa jadi 8', Number(par2?.qty), 8);
    chk('sisanya tetap dari template', Number(par2?.L), 2);

    console.log('\n7. Template tak lengkap DITOLAK saat dipakai — zona harus utuh');
    const gagal = await call('POST', `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplKosongId }] }, master);
    chk('ditolak 422', gagal.status, 422);
    chk('kodenya jelas', gagal.json?.code, 'MISSING_REQUIRED_PARAMETERS');
    chk('menyebut template mana', Number(gagal.json?.template_id), Number(tplKosongId));
    // Dilengkapi lewat override → boleh.
    const lengkap = await call('POST', `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplKosongId, element_name: `Kolom lengkap ${stamp}`,
        overrides: { qty_per_floor: 12, height_per_floor: 3.5, floors: 3 } }] }, master);
    chk('setelah dilengkapi override, diterima', lengkap.status, 201);

    console.log('\n8. Pemakaian dihitung, dan nama zona ganda ditolak');
    const tpl: any = await dbGet('SELECT times_used FROM mto_zone_templates WHERE id = ?', [tplId]);
    chk('times_used naik 2', Number(tpl?.times_used), 2);
    chk('nama zona ganda ditolak 409', (await call('POST',
      `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplId, element_name: `Pondasi F2 ${stamp}` }] }, master)).json?.code,
      'ZONA_SUDAH_ADA');

    console.log('\n9. Terima usulan gambar SEKALIGUS — yang bermasalah dilewati, bukan menggagalkan');
    const p3 = await call('POST', '/estimator/proposals',
      { project_name: `Uji terima usulan ${stamp}`, status: 'draft' }, master);
    const pid3 = p3.json?.id;
    const terima = await call('POST', `/estimator/proposals/${pid3}/mto/terima-usulan`, {
      zones: [
        { element_type: 'foundation', element_name: `Zona baik 1 ${stamp}`,
          parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 10, depth: 1.5 } },
        { element_type: 'foundation', element_name: `Zona baik 2 ${stamp}`,
          parameters: { foundation_type: 'footplate', L: 1.5, W: 1.5, H: 0.35, qty: 6, depth: 1.2 } },
        // Sengaja kurang: satu zona bermasalah tidak boleh membatalkan dua yang benar.
        { element_type: 'column', element_name: `Zona kurang ${stamp}`,
          parameters: { col_type: 'concrete', B: 0.4 } },
        { element_type: 'foundation', element_name: `Zona ngawur ${stamp}`,
          parameters: { foundation_type: 'entah', L: 1 } },
      ],
    }, master);
    chk('berhasil sebagian, bukan gagal total', terima.status, 201);
    chk('dua zona masuk', (terima.json?.diterima || []).length, 2);
    chk('dua dilewati', (terima.json?.dilewati || []).length, 2);
    chk('sebab tiap yang dilewati disebut',
      (terima.json?.dilewati || []).every((x: any) => !!x.sebab), true);
    const tersimpan: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid3]);
    chk('yang benar-benar tersimpan hanya dua', Number(tersimpan?.n), 2);
    const barisAda: any = await dbGet(
      `SELECT COUNT(*) n FROM mto_lines l JOIN engineering_inputs e ON e.id = l.element_id
       WHERE e.scope_id = ? AND e.scope_type='proposal'`, [pid3]);
    chk('barisnya ikut tersimpan', Number(barisAda?.n) > 0, true);

    console.log('\n10. Proposal terkunci menolak keduanya');
    // Status diset langsung: yang diuji di sini KUNCINYA, bukan gerbang
    // transisi status (itu punya tesnya sendiri). Melewati gerbang komersial
    // hanya untuk sampai ke kunci membuat tes ini bergantung pada hal lain.
    await dbRun("UPDATE proposals SET status = 'submitted' WHERE id = ?", [pid3]);
    const cek: any = await dbGet('SELECT status FROM proposals WHERE id = ?', [pid3]);
    chk('proposal benar-benar terkunci', cek?.status, 'submitted');
    chk('from-template ditolak 409', (await call('POST',
      `/estimator/proposals/${pid3}/mto/from-template`,
      { templates: [{ template_id: tplId }] }, master)).status, 409);
    chk('terima-usulan ditolak 409', (await call('POST',
      `/estimator/proposals/${pid3}/mto/terima-usulan`,
      { zones: [{ element_type: 'foundation', element_name: 'x',
        parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 1, depth: 1 } }] }, master)).status, 409);

    console.log('\n11. Daftar, nonaktifkan, dan auth');
    const daftar = await call('GET', '/estimator/mto/templates?element_type=foundation', undefined, master);
    chk('daftar terbaca', daftar.status, 200);
    chk('template kita ada di daftar',
      (daftar.json?.data || []).some((t: any) => Number(t.id) === Number(tplId)), true);
    chk('hanya tipe yang diminta',
      (daftar.json?.data || []).every((t: any) => t.element_type === 'foundation'), true);
    chk('nonaktifkan berhasil', (await call('DELETE', `/estimator/mto/templates/${tplId}`, undefined, master)).status, 200);
    chk('nonaktif dua kali 404', (await call('DELETE', `/estimator/mto/templates/${tplId}`, undefined, master)).status, 404);
    chk('template nonaktif tidak bisa dipakai', (await call('POST',
      `/estimator/proposals/${pid2}/mto/from-template`,
      { templates: [{ template_id: tplId }] }, master)).json?.code, 'TEMPLATE_TIDAK_ADA');
    chk('daftar tanpa token 401', (await call('GET', '/estimator/mto/templates')).status, 401);
    chk('simpan tanpa token 401', (await call('POST', '/estimator/mto/templates', { name: 'x' })).status, 401);

    console.log('\n12. Layar benar-benar tersambung ke endpointnya');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'components', 'projects', 'ProjectMTO.vue'), 'utf8');
    chk('layar memanggil daftar template', layar.includes("'/estimator/mto/templates'"), true);
    chk('layar memanggil pemakaian template', layar.includes('/mto/from-template'), true);
    chk('tombol simpan template ada', layar.includes('simpanTemplate'), true);
    // Zona harus dimuat ulang dari server sesudah dipakai — bukan disisipkan
    // ke layar, supaya yang tampil adalah kuantitas hasil hitung server.
    chk('memuat ulang dari server sesudah dipakai',
      /pakaiTemplate[\s\S]{0,1200}fetchAll\(\)/.test(layar), true);

  } finally {
    console.log('\n13. Bersih-bersih');
    await dbRun('DELETE FROM mto_zone_templates WHERE code LIKE ?', [`TPL-%${stamp}`]);
    const disapu = await sapuFixture(stamp);
    chk('proposal fixture tersapu', disapu.proposal >= 3, true);
    const sisa: any = await dbGet('SELECT COUNT(*) n FROM mto_zone_templates WHERE code LIKE ?', [`TPL-%${stamp}`]);
    chk('template fixture tersapu', Number(sisa?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM mto_lines l LEFT JOIN engineering_inputs e ON e.id = l.element_id WHERE e.id IS NULL`);
    chk('nol mto_lines yatim', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
