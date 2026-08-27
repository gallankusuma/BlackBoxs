import 'dotenv/config';
import { sapuFixture } from './_bersih';
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
      kode: `TEST-QTO-${stamp}`, name: `AHSP QTO ${stamp}`, satuan: 'm3', status: 'active',
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

    // ── 8. Nilai kontrak project tidak bisa digeser dari layar Project ─────
    //
    // `budget` diisi dari `proposals.total_project` saat Deal, dalam satu
    // transaction. Tapi form Edit Project menampilkan Budget dan Client sebagai
    // input biasa dan selalu mengirim keduanya, sementara handler update
    // menulisnya apa adanya tanpa melihat `proposal_id` — nilai kontrak yang
    // baru dibentuk kehilangan otoritasnya begitu handoff selesai.
    //
    // Akibatnya dua layar memakai sumber berbeda: RAB project membaca
    // `proposals.total_project`, cost summary membaca `client_projects.budget`.
    // Sudah terjadi di produksi: PRJ-2026-0001 budget 73.582.827 sementara
    // proposal kontraknya 217.056.077,72 — selisih 143 juta tanpa penjelasan.
    console.log('\n8. Nilai kontrak & client project terikat proposalnya');

    const detail = await call('GET', `/projects/${projId}`, undefined, master);
    const dp = detail.json?.data ?? detail.json;
    chk('detail project terbaca', detail.status, 200);
    chk('selisih kontrak dinyatakan di respons', !!dp?.kontrak, true);
    chk('awalnya sepadan dengan kontrak', dp?.kontrak?.sepadan, true);
    const nilaiKontrak = Number(dp?.kontrak?.nilai_kontrak || 0);
    chk('nilai kontraknya > 0', nilaiKontrak > 0, true);

    const geser = await call('PUT', `/projects/${projId}`,
      { budget: nilaiKontrak + 50000000 }, master);
    chk('menggeser budget ditolak 409', geser.status, 409);
    chk('kodenya BUDGET_TERIKAT_KONTRAK', geser.json?.code, 'BUDGET_TERIKAT_KONTRAK');
    chk('responsnya menyebut nilai kontraknya', Number(geser.json?.nilai_kontrak), nilaiKontrak);

    const klienLain = await call('POST', '/clients',
      { name: `PT Selundupan ${stamp}`, client_type: 'buyer' }, master);
    const klienLainId = klienLain.json?.id;
    bersihkan.push(() => call('DELETE', `/clients/${klienLainId}`, undefined, master));
    const gantiKlien = await call('PUT', `/projects/${projId}`, { client_id: klienLainId }, master);
    chk('mengganti client ditolak 409', gantiKlien.status, 409);
    chk('kodenya CLIENT_TERIKAT_KONTRAK', gantiKlien.json?.code, 'CLIENT_TERIKAT_KONTRAK');

    // Datanya benar-benar tidak bergeser.
    const sesudahTolak = await call('GET', `/projects/${projId}`, undefined, master);
    const sp = sesudahTolak.json?.data ?? sesudahTolak.json;
    chk('budget tidak berubah', Math.round(Number(sp?.budget) * 100), Math.round(nilaiKontrak * 100));
    chk('masih sepadan dengan kontrak', sp?.kontrak?.sepadan, true);

    // Menyamakan kembali dengan kontrak tetap boleh — itu jalan perbaikan.
    chk('menyamakan dengan nilai kontrak diizinkan',
      (await call('PUT', `/projects/${projId}`, { budget: nilaiKontrak }, master)).status, 200);

    // Metadata lain tetap bisa diubah — gemboknya tidak kebablasan.
    chk('mengubah deskripsi tetap boleh',
      (await call('PUT', `/projects/${projId}`, { description: `Catatan ${stamp}` }, master)).status, 200);

    // Project manual (tanpa proposal) tidak ikut terkunci.
    chk('project manual boleh diubah budgetnya',
      (await call('PUT', `/projects/${manualId}`, { budget: 12345678 }, master)).status, 200);

    // Dua cacat lama yang tersingkap saat menguji ini — keduanya 500 yang
    // seharusnya 400/200:
    chk('update parsial (tanpa status) tidak lagi 500',
      (await call('PUT', `/projects/${manualId}`, { description: 'parsial' }, master)).status, 200);
    const tanpaKlien = await call('POST', '/projects', { title: `Tanpa klien ${stamp}` }, master);
    chk('buat project tanpa client → 400, bukan 500', tanpaKlien.status, 400);
    chk('kodenya CLIENT_WAJIB', tanpaKlien.json?.code, 'CLIENT_WAJIB');

    // Layar ikut mengunci kolomnya.
    const { readFileSync: bacaPd } = await import('node:fs');
    const vuePd = bacaPd(
      new URL('../../frontend/src/views/ProjectDetail.vue', import.meta.url), 'utf8');
    chk('layar mengunci kolom kontrak', vuePd.includes('terikatKontrak'), true);
    chk('layar menyebut alasannya', vuePd.includes('adalah change order'), true);

  } finally {
    console.log('\n9. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
  }

  // Sisa fixture disapu langsung di database — termasuk yang API-nya memang
  // menolak menghapus (proposal submitted/deal). Tanpa ini database dev
  // bertumbuh monoton tiap run; lihat `tests/_bersih.ts`.
  const disapu = await sapuFixture(stamp);
  if (disapu.proposal || disapu.elemen || disapu.ahsp) {
    console.log(`  ––   sisa fixture disapu: ${disapu.proposal} proposal, `
      + `${disapu.elemen} elemen MTO, ${disapu.baris} baris, ${disapu.ahsp} AHSP`);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
