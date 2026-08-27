import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * CONTRACT-R51 — ledger kontrak & change order (fase 1 + 2).
 *
 * Sebelum ini, satu-satunya jejak nilai kontrak adalah `client_projects.budget`:
 * SATU ANGKA yang bisa ditimpa siapa saja, kapan saja. Tidak ada yang memisahkan
 * nilai yang disepakati di awal dari perubahan yang disetujui sesudahnya — jadi
 * begitu budget bergeser, tidak ada cara membuktikan berapa nilai aslinya, apa
 * yang mengubahnya, atau siapa yang menyetujuinya. Menu Contracts sendiri masih
 * "coming soon", dan tidak ada satu pun model change order di source.
 *
 * Yang dijaga tes ini adalah invarian yang membuat ledger ini ada gunanya:
 *
 *   - Deal membuat TEPAT SATU kontrak, dan mengulanginya tidak menggandakan.
 *   - Baseline IMMUTABLE: mengedit proposal setelah award tidak menggeser
 *     kontrak, BOQ, maupun checksumnya.
 *   - HANYA change order approved yang mengubah nilai berjalan.
 *   - Setiap perpindahan status punya jejak siapa dan kapan.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:kontrak
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

  const klien = await call('POST', '/clients',
    { name: `PT Kontrak Uji ${stamp}`, client_type: 'buyer' }, master);
  const clientId = klien.json?.id ?? klien.json?.data?.id;

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `KTR.${stamp}`, name: `Beton Kontrak ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('fixture dasar dibuat', !!clientId && !!ahspId, true);

  let contractId: any, projectId: any, pid: any;
  try {
    console.log('\n1. Deal membuat TEPAT SATU kontrak beserta baseline');
    const p = await call('POST', '/estimator/proposals', {
      project_name: `Uji kontrak ${stamp}`, client_id: clientId,
      client: `PT Kontrak Uji ${stamp}`, status: 'draft',
    }, master);
    pid = p.json?.id;
    await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', mode: 'replace', design_params: { luas: 100 },
      template_sections: [
        { code: 'A', name: 'PEKERJAAN STRUKTUR', children: [{ name: 'Beton', ahsp_id: ahspId, volume: 10 }] },
      ],
    }, master);
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    for (const st of ['review', 'submitted', 'deal']) {
      await call('PUT', `/estimator/proposals/${pid}/status`, { status: st }, master);
    }

    const prop: any = await dbGet('SELECT project_id, total_project FROM proposals WHERE id = ?', [pid]);
    projectId = prop?.project_id;
    chk('project terbentuk dari deal', !!projectId, true);

    const kontrak: any = await dbGet('SELECT * FROM contracts WHERE project_id = ?', [projectId]);
    chk('kontrak terbentuk', !!kontrak?.id, true);
    contractId = kontrak?.id;
    chk('nomornya berformat CTR/TAHUN/NNNN',
      /^CTR\/\d{4}\/\d{4,}$/.test(String(kontrak?.contract_number)), true);
    chk('nilai aslinya sama dengan total proposal',
      Number(kontrak?.original_value), Number(prop?.total_project));
    chk('membawa checksum baseline', String(kontrak?.baseline_checksum || '').length, 64);

    const baseline: any[] = await dbAll(
      'SELECT * FROM contract_baseline_lines WHERE contract_id = ? ORDER BY line_no', [contractId]);
    chk('baseline berisi baris', baseline.length > 0, true);
    const barisProposal: any[] = await dbAll(
      'SELECT COUNT(*) n FROM proposal_items WHERE proposal_id = ?', [pid]);
    chk('memotret SELURUH baris proposal, termasuk seksi',
      baseline.length, Number(barisProposal[0]?.n));
    const jumlahBaseline = baseline.filter(b => !Number(b.is_section))
      .reduce((a, b) => a + Number(b.amount), 0);
    chk('jumlah baris baseline = nilai kontrak',
      Math.round(jumlahBaseline * 100) / 100, Number(kontrak?.original_value));

    console.log('\n2. Mengulang Deal tidak menggandakan kontrak');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'deal' }, master);
    const jml: any = await dbGet('SELECT COUNT(*) n FROM contracts WHERE project_id = ?', [projectId]);
    chk('tetap satu kontrak', Number(jml?.n), 1);

    console.log('\n3. BASELINE IMMUTABLE — inti dari seluruh ledger ini');
    // Proposal `deal` memang terkunci lewat API. Yang diuji di sini lebih keras:
    // bahkan kalau barisnya berubah di database, kontraknya tidak ikut bergeser.
    const sebelum = { checksum: kontrak.baseline_checksum, nilai: Number(kontrak.original_value) };
    await dbRun(
      `UPDATE proposal_items SET qty = qty * 3, total_price = total_price * 3
       WHERE proposal_id = ? AND is_section = 0`, [pid]);
    const kontrakSesudah: any = await dbGet('SELECT * FROM contracts WHERE id = ?', [contractId]);
    chk('nilai kontrak TIDAK berubah', Number(kontrakSesudah?.original_value), sebelum.nilai);
    chk('checksum baseline TIDAK berubah', kontrakSesudah?.baseline_checksum, sebelum.checksum);
    const detail = await call('GET', `/contracts/${contractId}`, undefined, master);
    chk('checksum yang dihitung ulang tetap cocok',
      detail.json?.baseline_checksum_sekarang, sebelum.checksum);

    console.log('\n4. Tidak ada satu pun jalur tulis ke baseline');
    const { readFileSync } = await import('node:fs');
    const rute = readFileSync(new URL('../src/routes/contract.routes.ts', import.meta.url), 'utf8');
    const tulis = (rute.match(/UPDATE contract_baseline_lines|DELETE FROM contract_baseline_lines/g) || []);
    chk('nol UPDATE/DELETE terhadap baseline', tulis.length, 0);

    console.log('\n5. Change order: nilai header DITURUNKAN dari barisnya');
    const co1 = await call('POST', `/contracts/${contractId}/change-orders`, {
      title: 'Tambah pile cap P3', source: 'client', schedule_days_delta: 7,
      // `value_delta` sengaja TIDAK dikirim — kalau klien bisa menentukannya,
      // header dan baris bisa menyatakan angka berbeda dan yang disetujui
      // menjadi ambigu.
      lines: [
        { description: 'Beton tambahan', unit: 'm3', qty: 5, unit_price: 1100000, cost_amount: 4500000 },
        { description: 'Bekisting tambahan', unit: 'm2', qty: 12, unit_price: 150000, cost_amount: 1500000 },
      ],
    }, master);
    chk('CO dibuat', co1.status, 201);
    chk('nomornya berformat CO/TAHUN/NNNN', /^CO\/\d{4}\/\d{4,}$/.test(String(co1.json?.nomor)), true);
    chk('nilainya dihitung dari baris (5×1.1jt + 12×150rb)',
      Number(co1.json?.value_delta), 5 * 1100000 + 12 * 150000);
    chk('biayanya juga', Number(co1.json?.cost_delta), 4500000 + 1500000);

    console.log('\n6. CO draft BELUM mengubah nilai kontrak');
    const n1 = (await call('GET', `/contracts/${contractId}`, undefined, master)).json?.nilai;
    chk('nilai berjalan masih sama dengan aslinya', n1?.revised_value, n1?.original_value);
    chk('dan CO-nya belum terhitung tertunda', n1?.pending_co_value, 0);

    console.log('\n7. Submitted dilaporkan sebagai eksposur — terpisah dari nilai kontrak');
    await call('PUT', `/contracts/change-orders/${co1.json?.id}/status`, { status: 'submitted' }, master);
    const n2 = (await call('GET', `/contracts/${contractId}`, undefined, master)).json?.nilai;
    chk('nilai kontrak TETAP', n2?.revised_value, n1?.original_value);
    chk('tapi eksposurnya terlihat', n2?.pending_co_value, Number(co1.json?.value_delta));

    console.log('\n8. HANYA approved yang mengubah nilai berjalan');
    const setuju = await call('PUT', `/contracts/change-orders/${co1.json?.id}/status`,
      { status: 'approved', note: 'Disetujui owner' }, master);
    chk('disetujui', setuju.status, 200);
    const n3 = setuju.json?.nilai;
    chk('nilai berjalan = asli + CO disetujui',
      n3?.revised_value, Math.round((n3.original_value + Number(co1.json?.value_delta)) * 100) / 100);
    chk('nilai ASLI tetap tidak tersentuh', n3?.original_value, n1?.original_value);
    chk('tidak ada lagi yang tertunda', n3?.pending_co_value, 0);
    chk('dampak jadwal ikut terekam', n3?.approved_schedule_days, 7);

    console.log('\n9. CO yang ditolak tidak mengubah apa pun');
    const co2 = await call('POST', `/contracts/${contractId}/change-orders`, {
      title: 'Permintaan yang ditolak', source: 'site',
      lines: [{ description: 'Pekerjaan tambah', unit: 'ls', qty: 1, unit_price: 50000000 }],
    }, master);
    await call('PUT', `/contracts/change-orders/${co2.json?.id}/status`, { status: 'submitted' }, master);
    await call('PUT', `/contracts/change-orders/${co2.json?.id}/status`,
      { status: 'rejected', note: 'Di luar lingkup' }, master);
    const n4 = (await call('GET', `/contracts/${contractId}`, undefined, master)).json?.nilai;
    chk('nilai berjalan tidak bergerak', n4?.revised_value, n3?.revised_value);
    chk('dan tidak dihitung sebagai eksposur', n4?.pending_co_value, 0);

    console.log('\n10. Status final tidak bisa diubah — koreksi lewat CO baru');
    const paksa = await call('PUT', `/contracts/change-orders/${co1.json?.id}/status`,
      { status: 'draft' }, master);
    chk('approved → draft ditolak 409', paksa.status, 409);
    chk('kodenya TRANSISI_TIDAK_SAH', paksa.json?.code, 'TRANSISI_TIDAK_SAH');
    chk('pesannya menyuruh membuat CO baru',
      String(paksa.json?.error || '').includes('change order baru'), true);
    const lompat = await call('PUT', `/contracts/change-orders/${co2.json?.id}/status`,
      { status: 'approved' }, master);
    chk('rejected → approved juga ditolak', lompat.status, 409);

    console.log('\n11. Setiap perpindahan status punya jejak siapa dan kapan');
    const detailCo = await call('GET', `/contracts/change-orders/${co1.json?.id}`, undefined, master);
    const events = detailCo.json?.events || [];
    chk('jejaknya lengkap: dibuat, submitted, approved', events.length, 3);
    chk('urutannya benar',
      events.map((e: any) => e.to_status).join('→'), 'draft→submitted→approved');
    chk('setiap jejak punya aktor', events.every((e: any) => e.actor_id !== null), true);
    chk('keputusan menyimpan catatannya',
      events[2]?.note, 'Disetujui owner');

    console.log('\n12. Validasi masukan');
    chk('tanpa judul ditolak 400',
      (await call('POST', `/contracts/${contractId}/change-orders`,
        { lines: [{ description: 'x', qty: 1, unit_price: 1 }] }, master)).status, 400);
    const tanpaBaris = await call('POST', `/contracts/${contractId}/change-orders`,
      { title: 'Tanpa baris' }, master);
    chk('tanpa baris ditolak 400', tanpaBaris.status, 400);
    chk('kodenya BARIS_WAJIB', tanpaBaris.json?.code, 'BARIS_WAJIB');
    const sumberAneh = await call('POST', `/contracts/${contractId}/change-orders`,
      { title: 'Sumber karangan', source: 'entah', lines: [{ description: 'x', qty: 1, unit_price: 1 }] }, master);
    chk('sumber tak dikenal ditolak 400', sumberAneh.status, 400);
    chk('menyebut sumber yang sah', Array.isArray(sumberAneh.json?.sumber_dikenal), true);
    chk('kontrak tidak ada memberi 404',
      (await call('POST', `/contracts/999999999/change-orders`,
        { title: 'x', lines: [{ description: 'x', qty: 1, unit_price: 1 }] }, master)).status, 404);

    console.log('\n13. Terjaga auth');
    chk('daftar kontrak tanpa token 401', (await call('GET', '/contracts')).status, 401);
    chk('buat CO tanpa token 401',
      (await call('POST', `/contracts/${contractId}/change-orders`, { title: 'x' })).status, 401);

    console.log('\n14. Rekonsiliasi: asli + CO disetujui = nilai berjalan');
    const akhir = (await call('GET', `/contracts/${contractId}`, undefined, master)).json;
    const disetujuiDb: any = await dbGet(
      `SELECT COALESCE(SUM(value_delta),0) s FROM change_orders WHERE contract_id = ? AND status = 'approved'`,
      [contractId]);
    chk('cocok dengan jumlah di database',
      akhir?.nilai?.revised_value,
      Math.round((Number(akhir?.original_value) + Number(disetujuiDb?.s)) * 100) / 100);
    chk('daftar kontrak juga membawa nilainya',
      typeof (await call('GET', '/contracts', undefined, master)).json?.items?.[0]?.nilai?.revised_value,
      'number');

    console.log('\n15. Layar Contracts bukan lagi placeholder');
    const vue = readFileSync(
      new URL('../../frontend/src/views/SalesContracts.vue', import.meta.url), 'utf8');
    chk('tidak lagi "coming soon"', vue.toLowerCase().includes('coming soon'), false);
    chk('memuat dari endpoint kontrak', vue.includes("api.get('/contracts')"), true);
    chk('menampilkan nilai asli, CO disetujui, dan nilai berlaku',
      vue.includes('original_value') && vue.includes('approved_co_value')
      && vue.includes('revised_value'), true);
    chk('eksposur tertunda ditampilkan terpisah', vue.includes('pending_co_value'), true);
    chk('baseline yang berbeda dari potret award ditandai',
      vue.includes('baseline_checksum_sekarang'), true);
    chk('gagal muat dibedakan dari "belum ada kontrak"',
      vue.includes('tidak menggambarkan isi sebenarnya'), true);
    // Diperiksa PEMAKAIANNYA (`.toLocaleString(`), bukan katanya: versi pertama
    // asersi ini gagal karena menemukan kata itu di komentar yang justru
    // menjelaskan mengapa ia tidak dipakai.
    chk('format rupiah tidak bergantung locale runtime',
      vue.includes('.toLocaleString('), false);

    // Layar yang tidak punya route adalah layar yang tidak ada. `SalesContracts.vue`
    // sebelumnya YATIM: file-nya ada, tapi tidak ada route, tidak ada menu, dan
    // tidak satu pun yang meng-import — itu sebabnya ia tidak pernah muncul.
    const router = readFileSync(
      new URL('../../frontend/src/router/index.ts', import.meta.url), 'utf8');
    chk('layarnya punya route', router.includes("import('../views/SalesContracts.vue')"), true);
    const layout = readFileSync(
      new URL('../../frontend/src/components/Layout.vue', import.meta.url), 'utf8');
    chk('dan bisa dicapai dari menu', layout.includes("route: '/contracts'"), true);
    // permKey wajib sudah ada di tabel `permissions` — dijaga juga oleh test:rbac.
    const m = layout.match(/route: '\/contracts'[^}]*permKey: '([^']+)'/);
    chk('memakai permKey yang sudah ada, bukan karangan', m?.[1], 'projects.projects');

  } finally {
    console.log('\n16. Bersih-bersih');
    if (contractId) await dbRun('DELETE FROM contracts WHERE id = ?', [contractId]).catch(() => {});
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]).catch(() => {});
    if (clientId) await dbRun('DELETE FROM clients WHERE id = ?', [clientId]).catch(() => {});
    await sapuFixture(stamp);
    const sisaKontrak: any = await dbGet(
      'SELECT COUNT(*) n FROM contracts WHERE contract_number LIKE ? OR project_id = ?', ['%TIDAKADA%', projectId || -1]);
    chk('tidak ada kontrak fixture tertinggal', Number(sisaKontrak?.n), 0);
    const sisaCo: any = await dbGet(
      'SELECT COUNT(*) n FROM change_orders WHERE contract_id = ?', [contractId || -1]);
    chk('change order ikut terhapus (cascade)', Number(sisaCo?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
