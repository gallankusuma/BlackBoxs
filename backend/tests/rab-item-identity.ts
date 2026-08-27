import 'dotenv/config';
/**
 * EST-RAB-R44 — satu analisa boleh dipakai berkali-kali, dan tiap baris punya
 * identitasnya sendiri.
 *
 * Backend mengidentifikasi item lewat `proposal_items.id` dan sengaja TIDAK
 * punya unique `(proposal_id, ahsp_id)` — satu AHSP memang sah dipakai berulang
 * untuk lokasi, area, atau work package berbeda. Tapi picker frontend
 * memperlakukan `ahsp_id` sebagai checkbox global: kalau sudah dipakai, klik
 * berikutnya menjalankan `items.find(i => i.ahsp_id === id)` lalu langsung
 * DELETE instance PERTAMA — tanpa memilih baris, tanpa konfirmasi.
 *
 * Estimator yang bermaksud menambah scope ketiga untuk Beton K-250 karena itu
 * menghapus Pedestal P-01. Dan karena Tie Beam TB-02 masih ada, checkbox-nya
 * tetap terlihat tercentang setelah reload — jadi tidak ada satu pun tanda
 * bahwa ada scope yang hilang, selain total yang diam-diam turun.
 *
 * Yang diuji di sini: kontrak backend soal identitas per baris, dan bahwa layar
 * tidak lagi menyimpulkan target penghapusan dari `ahsp_id`.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:item-identity
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
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
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `IDN.${stamp}`, name: `Beton K-250 ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP uji dibuat', !!ahspId, true);

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji identitas baris ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
  chk('proposal dibuat', !!pid, true);

  try {
    console.log('\n1. Satu AHSP dipakai tiga kali — tiga baris terpisah, bukan satu');
    const a = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 10 }, master);
    const b = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 20 }, master);
    const c = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 30 }, master);
    const idA = a.json?.id, idB = b.json?.id, idC = c.json?.id;
    chk('ketiganya dibuat', !!idA && !!idB && !!idC, true);
    chk('id-nya berbeda semua', new Set([idA, idB, idC]).size, 3);

    await call('PUT', `/estimator/proposals/${pid}/items/${idA}`, { description: 'Pedestal P-01' }, master);
    await call('PUT', `/estimator/proposals/${pid}/items/${idB}`, { description: 'Tie Beam TB-02' }, master);
    await call('PUT', `/estimator/proposals/${pid}/items/${idC}`, { description: 'Kolom K-03' }, master);

    const baris: any[] = await dbAll(
      'SELECT id, description, qty FROM proposal_items WHERE proposal_id = ? AND is_section = 0 ORDER BY id', [pid]);
    chk('tiga baris bertahan di database', baris.length, 3);
    chk('deskripsinya masing-masing', baris.map(r => r.description).join('|'),
      'Pedestal P-01|Tie Beam TB-02|Kolom K-03');
    chk('qty-nya masing-masing', baris.map(r => Number(r.qty)).join('|'), '10|20|30');

    console.log('\n2. Menambah lagi analisa yang sama membuat instance BARU, tidak menghapus apa pun');
    const d = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 40 }, master);
    chk('instance keempat dibuat', d.status, 201);
    const setelahTambah: any[] = await dbAll(
      'SELECT id FROM proposal_items WHERE proposal_id = ? AND is_section = 0', [pid]);
    chk('sekarang empat baris', setelahTambah.length, 4);
    chk('Pedestal P-01 masih ada',
      !!(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idA])), true);

    console.log('\n3. Hapus baris B hanya menghapus B');
    const totalSebelum: any = await dbGet('SELECT direct_cost FROM proposals WHERE id = ?', [pid]);
    const nilaiB: any = await dbGet('SELECT total_price FROM proposal_items WHERE id = ?', [idB]);
    const hapusB = await call('DELETE', `/estimator/proposals/${pid}/items/${idB}`, undefined, master);
    chk('penghapusan B berhasil', hapusB.status, 200);
    chk('B hilang', !(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idB])), true);
    chk('A tetap ada', !!(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idA])), true);
    chk('C tetap ada', !!(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idC])), true);

    console.log('\n4. Total merekonsiliasi tepat ke baris yang berubah');
    const totalSesudah: any = await dbGet('SELECT direct_cost FROM proposals WHERE id = ?', [pid]);
    chk('direct_cost turun persis sebesar nilai B',
      Number(totalSebelum?.direct_cost) - Number(totalSesudah?.direct_cost), Number(nilaiB?.total_price));

    console.log('\n5. Menghapus baris milik proposal lain ditolak');
    const lain = await call('POST', '/estimator/proposals',
      { project_name: `Tetangga identitas ${stamp}`, status: 'draft' }, master);
    const pidLain = lain.json?.id ?? lain.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pidLain}`, undefined, master));
    const silang = await call('DELETE', `/estimator/proposals/${pidLain}/items/${idA}`, undefined, master);
    chk('ditolak 404', silang.status, 404);
    chk('A tetap utuh', !!(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idA])), true);

    console.log('\n6. Layar tidak lagi menyimpulkan target hapus dari ahsp_id');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/views/EstimatorProposalEditor.vue', import.meta.url), 'utf8');
    chk('tidak ada lagi toggle checkbox global', !vue.includes('toggleAHSP'), true);
    chk('tidak ada lagi find(item.ahsp_id === ahsp.id) untuk menghapus',
      !vue.includes('items.value.find(item => item.ahsp_id === ahsp.id)'), true);
    chk('katalog hanya menambah', vue.includes('const tambahAhsp = async'), true);
    chk('jumlah pemakaian ditampilkan, bukan keadaan biner',
      vue.includes('const jumlahDipakai'), true);
    chk('penambahan menampilkan pesan server saat ditolak',
      vue.includes("error?.response?.data?.error || 'Gagal menambahkan pekerjaan ke RAB.'"), true);
    chk('konfirmasi hapus menyebut nilai barisnya',
      vue.includes('Tindakan ini tidak bisa dibatalkan.') && vue.includes('const namaBaris'), true);

    console.log('\n7. Proposal terkunci tetap read-only');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const tambahTerkunci = await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: ahspId, qty: 5 }, master);
    chk('tambah pada proposal submitted ditolak 409', tambahTerkunci.status, 409);
    const hapusTerkunci = await call('DELETE', `/estimator/proposals/${pid}/items/${idA}`, undefined, master);
    chk('hapus pada proposal submitted ditolak 409', hapusTerkunci.status, 409);
    chk('A masih utuh', !!(await dbGet('SELECT id FROM proposal_items WHERE id = ?', [idA])), true);

    await dbRun('DELETE FROM proposals WHERE id = ?', [pid]).catch(() => {});
    await dbRun('DELETE FROM proposal_items WHERE proposal_id = ?', [pid]).catch(() => {});

  } finally {
    console.log('\n8. Bersih-bersih');
    for (const h of bersihkan.reverse()) { try { await h(); } catch { /* sudah dihapus */ } }
    await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`IDN.${stamp}`]).catch(() => {});
    const sisa: any = await dbGet('SELECT COUNT(*) AS n FROM proposals WHERE project_name LIKE ?', [`%${stamp}%`]);
    chk('tidak ada proposal fixture tertinggal', Number(sisa?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
