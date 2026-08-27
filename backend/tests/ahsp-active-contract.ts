import 'dotenv/config';
/**
 * EST-AHSP-R40 — jalur tulis tidak boleh lebih longgar daripada katalognya.
 *
 * Katalog `GET /ahsp` hanya menyajikan `status='active'`, "delete" AHSP
 * sebenarnya menonaktifkan, dan jalur assign sudah mensyaratkan aktif. Tapi
 * `POST /proposals/:id/items` membaca `WHERE id = ?` tanpa predikat status —
 * jadi id lama dari tab, cache, retry, atau permintaan langsung bisa membekukan
 * harga yang sudah ditarik sebagai lingkup baru proposal.
 *
 * Yang membuatnya sulit terlihat: snapshot memang HARUS immutable setelah sah
 * dipilih. Baris hasil AHSP inactive karena itu tidak bisa dibedakan dari
 * snapshot historis yang sah — ia masuk RAB, margin, Deal, dan baseline project
 * tanpa satu pun penanda.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:ahsp-active
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

  const buatAhsp = async (suffix: string) => {
    const r = await call('POST', '/estimator/ahsp', {
      kode: `ACT.${stamp}.${suffix}`, name: `AHSP Aktif ${stamp}${suffix}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 750000 }],
    }, master);
    return r.json?.id ?? r.json?.data?.id;
  };

  const ahspAktif = await buatAhsp('A');
  const ahspDitarik = await buatAhsp('B');
  chk('dua AHSP aktif dibuat', !!ahspAktif && !!ahspDitarik, true);

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji AHSP aktif ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
  chk('proposal dibuat', !!pid, true);

  try {
    console.log('\n1. AHSP aktif tetap bisa dipakai — perbaikan ini tidak boleh menghalangi kerja normal');
    const sah = await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: ahspAktif, qty: 3 }, master);
    chk('item dengan AHSP aktif diterima', sah.status, 201);
    const itemSah = sah.json?.id;

    console.log('\n2. AHSP yang ditarik ditolak pada tambah item');
    const hapus = await call('DELETE', `/estimator/ahsp/${ahspDitarik}`, undefined, master);
    chk('operasi hapus AHSP berhasil', hapus.status < 300, true);
    const statusDitarik: any = await dbGet('SELECT status FROM ahsp_headers WHERE id = ?', [ahspDitarik]);
    chk('"hapus" ternyata menonaktifkan, bukan menghapus', statusDitarik?.status, 'inactive');

    const sebelum: any[] = await dbAll('SELECT id FROM proposal_items WHERE proposal_id = ?', [pid]);
    const ditolak = await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: ahspDitarik, qty: 5 }, master);
    chk('tambah item dengan AHSP inactive ditolak 409', ditolak.status, 409);
    chk('kodenya AHSP_TIDAK_AKTIF', ditolak.json?.code, 'AHSP_TIDAK_AKTIF');
    chk('pesannya menyebut kode AHSP-nya', String(ditolak.json?.error || '').includes(`ACT.${stamp}.B`), true);

    const sesudah: any[] = await dbAll('SELECT id FROM proposal_items WHERE proposal_id = ?', [pid]);
    chk('tidak ada item yang tercipta', sesudah.length, sebelum.length);

    console.log('\n3. 404 dan 409 dibedakan — "tidak ada" bukan hal yang sama dengan "sudah ditarik"');
    const hilang = await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: 999999999, qty: 1 }, master);
    chk('AHSP tidak ada tetap 404', hilang.status, 404);
    chk('kodenya AHSP_TIDAK_DITEMUKAN', hilang.json?.code, 'AHSP_TIDAK_DITEMUKAN');

    console.log('\n4. Assign AHSP inactive ke item yang sudah ada juga ditolak');
    const assign = await call('PUT', `/estimator/proposals/${pid}/items/${itemSah}`,
      { ahsp_id: ahspDitarik }, master);
    chk('assign ditolak 409', assign.status, 409);
    chk('kodenya AHSP_TIDAK_AKTIF', assign.json?.code, 'AHSP_TIDAK_AKTIF');
    const itemMasih: any = await dbGet(
      'SELECT ahsp_id, ahsp_code_snapshot FROM proposal_items WHERE id = ?', [itemSah]);
    chk('item tetap memakai AHSP aktif yang lama', Number(itemMasih?.ahsp_id), Number(ahspAktif));

    console.log('\n5. Header proposal tidak bergeser oleh penolakan');
    const h: any = await dbGet('SELECT direct_cost, total_project FROM proposals WHERE id = ?', [pid]);
    const dugaan: any = await dbGet(
      'SELECT COALESCE(SUM(total_price),0) AS jml FROM proposal_items WHERE proposal_id = ? AND is_section = 0', [pid]);
    chk('direct_cost cocok dengan jumlah baris', Number(h?.direct_cost), Number(dugaan?.jml));

    console.log('\n6. Snapshot lama TIDAK ikut dibatalkan saat AHSP-nya kemudian ditarik');
    // Ini justru harus tetap berlaku: snapshot yang sah dipilih itu immutable.
    // Perbaikan hanya menjaga pintu masuk, bukan menulis ulang sejarah.
    await call('DELETE', `/estimator/ahsp/${ahspAktif}`, undefined, master);
    const itemLama: any = await dbGet(
      'SELECT unit_price_snapshot, ahsp_code_snapshot FROM proposal_items WHERE id = ?', [itemSah]);
    chk('snapshot harga item lama tetap ada', Number(itemLama?.unit_price_snapshot) > 0, true);
    const baca = await call('GET', `/estimator/proposals/${pid}/items`, undefined, master);
    chk('proposal tetap terbaca normal', baca.status, 200);

    console.log('\n7. Pembacaan AHSP terjadi di dalam transaction, bukan sebelum');
    const { readFileSync } = await import('node:fs');
    const rute = readFileSync(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    const iPost = rute.indexOf("router.post('/proposals/:proposalId/items'");
    const iTx = rute.indexOf('withTransaction', iPost);
    const iAhsp = rute.indexOf('FROM ahsp_headers', iPost);
    chk('snapshot dibaca setelah transaction dibuka', iAhsp > iTx, true);
    chk('barisnya ditahan FOR SHARE',
      rute.slice(iAhsp, iAhsp + 200).includes('FOR SHARE'), true);

  } finally {
    console.log('\n8. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('proposal uji terhapus', sisa, 0);
    for (const suffix of ['A', 'B']) {
      await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`ACT.${stamp}.${suffix}`]).catch(() => {});
    }
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
