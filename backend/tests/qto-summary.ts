import 'dotenv/config';
/**
 * Tes QTO summary project.
 *
 * Tiga cacat yang dibuktikan:
 *
 * 1. `WHERE project_id = ? OR proposal_id = ?` menggandakan seluruh kuantitas
 *    begitu baseline kontrak terbentuk: baris proposal asli cocok lewat
 *    `proposal_id`, salinan baseline cocok lewat `project_id`, dan elemen yang
 *    sama terhitung dua kali. QTO detail dan QTO summary karena itu menjawab
 *    berbeda untuk project yang sama.
 * 2. Ringkasannya hanya mengenal kunci generik (`vol_concrete`), sedangkan
 *    seluruh baseline dari Estimator memakai kode barisnya sendiri
 *    (`fnd_conc`). Semua project hasil deal dijumlahkan sebagai NOL.
 * 3. `POST /projects/:id/mto` tidak tunduk pada kunci proposal, jadi elemen
 *    baru bisa disisipkan ke project yang kontraknya sudah disepakati — dan
 *    barisnya ditulis sebagai hibrida project+proposal yang bukan keduanya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:qto-summary
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

const bulat = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbAll } = await import('../src/config/database');

  try {
    const kl = await call('POST', '/clients', { name: `PT Uji QTO ${stamp}`, client_type: 'buyer' }, master);
    const clientId = kl.json?.id;
    bersihkan.push(() => call('DELETE', `/clients/${clientId}`, undefined, master));

    const ah = await call('POST', '/estimator/ahsp', {
      kode: `TEST-QTO-${stamp}`, name: `AHSP QTO ${stamp}`, satuan: 'm3',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 1500000 }],
    }, master);

    const pr = await call('POST', '/estimator/proposals',
      { project_name: `Uji QTO ${stamp}`, client_id: clientId, client: `PT Uji QTO ${stamp}` }, master);
    const pid = pr.json?.id ?? pr.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));

    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ah.json?.id, qty: 10 }, master);
    const mto = await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 2, W: 2, H: 0.4, depth: 1.5, qty: 6, waste_pct: 5 },
    }, master);
    chk('elemen MTO proposal dibuat', mto.status, 200);
    // Beton pondasi versi kalkulator: dipakai sebagai pembanding kebenaran.
    const betonSatuElemen = bulat((mto.json?.quantities || {}).fnd_conc);
    chk('kalkulator memberi beton > 0', betonSatuElemen > 0, true);

    for (const st of ['review', 'submitted', 'deal']) {
      await call('PUT', `/estimator/proposals/${pid}/status`, { status: st }, master);
    }
    const cek = await call('GET', `/estimator/proposals/${pid}`, undefined, master);
    const projId = (cek.json?.data ?? cek.json)?.project_id;
    chk('project terbentuk dari deal', !!projId, true);

    // ── 1. Baseline benar-benar ada dua salinan di tabel ───────────────────
    console.log('\n1. Setelah deal ada dua salinan baris — inilah sumber penggandaan');
    const semua = await dbAll(
      `SELECT scope_type FROM engineering_inputs WHERE project_id = ? OR proposal_id = ?`, [projId, pid]);
    chk('query lama memilih 2 baris untuk 1 elemen', semua.length, 2);

    // ── 2. Summary tidak menggandakan ──────────────────────────────────────
    console.log('\n2. Summary memakai satu sumber, tidak menjumlahkan keduanya');
    const s = await call('GET', `/projects/${projId}/mto/summary`, undefined, master);
    chk('summary terbaca', s.status, 200);
    const ringkas = s.json?.summary ?? s.json;
    chk('menghitung 1 elemen, bukan 2', s.json?.count, 1);
    chk('sumbernya dinyatakan baseline', s.json?.mto_source, 'project_baseline');

    // ── 3. Baseline Estimator tidak lagi terbaca nol ───────────────────────
    console.log('\n3. Kunci kode-baris Estimator ikut terbaca');
    chk('beton baseline > 0 (dulu selalu 0)', Number(ringkas?.total_vol_concrete) > 0, true);
    chk('galian baseline > 0', Number(ringkas?.total_vol_excavation) > 0, true);
    chk('besi baseline > 0', Number(ringkas?.total_rebar_weight_kg) > 0, true);
    chk('bekisting baseline > 0', Number(ringkas?.total_formwork_area) > 0, true);

    // ── 4. Summary rekonsiliasi dengan detail ──────────────────────────────
    console.log('\n4. Summary dan detail menjawab hal yang sama');
    const d = await call('GET', `/projects/${projId}/mto`, undefined, master);
    chk('detail memakai baseline', d.json?.mto_source, 'project_baseline');
    chk('detail juga 1 elemen', (d.json?.elements || []).length, 1);
    const betonDetail = bulat((d.json?.elements || []).reduce(
      (a: number, e: any) => a + Number(e.quantities?.fnd_conc || 0) + Number(e.quantities?.fnd_lean || 0), 0));
    chk('beton summary = beton detail', bulat(ringkas?.total_vol_concrete), betonDetail);

    // ── 5. POST ditolak pada project berkontrak ────────────────────────────
    console.log('\n5. POST tidak bisa menyisipkan elemen ke kontrak yang sudah disepakati');
    const post = await call('POST', `/projects/${projId}/mto`, {
      element_type: 'slab', element_name: `Sisipan ${stamp}`,
      parameters: { area: 100, thickness: 0.12 },
    }, master);
    chk('POST ditolak', post.status, 409);
    chk('kodenya jelas', ['PROPOSAL_LOCKED', 'BASELINE_TERKUNCI'].includes(post.json?.code), true);

    const sesudah = await call('GET', `/projects/${projId}/mto/summary`, undefined, master);
    chk('summary tidak bertambah', sesudah.json?.count, 1);
    const hibrida = await dbAll(
      `SELECT id FROM engineering_inputs WHERE project_id = ? AND proposal_id IS NOT NULL`, [projId]);
    chk('tidak ada baris hibrida project+proposal', hibrida.length, 0);

    // ── 6. Project tanpa baseline tetap bisa diisi ─────────────────────────
    console.log('\n6. Project tanpa kontrak tetap bisa diisi MTO-nya');
    const pmanual = await call('POST', '/projects', { title: `Project manual ${stamp}`, client_id: clientId }, master);
    const manualId = pmanual.json?.data?.id ?? pmanual.json?.id;
    bersihkan.push(() => call('DELETE', `/projects/${manualId}`, undefined, master));
    const postManual = await call('POST', `/projects/${manualId}/mto`, {
      element_type: 'slab', element_name: 'Pelat', parameters: { area: 100, thickness: 0.12 },
    }, master);
    chk('POST pada project tanpa baseline diterima', postManual.status, 200);
    const sManual = await call('GET', `/projects/${manualId}/mto/summary`, undefined, master);
    chk('summary project manual terbaca', sManual.status, 200);
    chk('betonnya terhitung', Number((sManual.json?.summary ?? {}).total_vol_concrete) > 0, true);

  } finally {
    console.log('\n7. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
