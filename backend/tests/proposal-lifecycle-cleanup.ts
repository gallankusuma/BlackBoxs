import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-LIFE-R42 — menghapus proposal harus menghapus seluruh turunannya.
 *
 * `proposal_items` dan `proposal_audit_logs` punya FK CASCADE ke `proposals`,
 * jadi ikut hilang sendiri. `engineering_inputs` TIDAK — ia polymorphic
 * (`scope_type` proposal/project) dan hanya ber-index, tanpa FK. Menghapus
 * proposal draft yang sudah punya MTO karena itu meninggalkan seluruh elemen dan
 * `mto_lines`-nya utuh, menunjuk id proposal yang sudah tidak ada.
 *
 * Yang membuatnya tidak pernah ketahuan: semua pembacaan MTO menyaring lewat
 * proposal yang masih hidup, jadi data itu tidak bisa dilihat MAUPUN dibersihkan
 * lewat layar atau API mana pun. Ia hanya muncul di query langsung.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:lifecycle
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

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `LIF.${stamp}`, name: `AHSP Lifecycle ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 800000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  const hitungTurunan = async (pid: any) => {
    const el: any = await dbGet(
      `SELECT COUNT(*) AS n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    const ln: any = await dbGet(
      `SELECT COUNT(*) AS n FROM mto_lines ml JOIN engineering_inputs ei ON ei.id=ml.element_id
       WHERE ei.scope_type='proposal' AND ei.scope_id=?`, [pid]);
    const it: any = await dbGet('SELECT COUNT(*) AS n FROM proposal_items WHERE proposal_id=?', [pid]);
    return { elemen: Number(el?.n), baris: Number(ln?.n), item: Number(it?.n) };
  };

  let pid: any;
  try {
    console.log('\n1. Proposal dengan MTO dan item RAB');
    const prop = await call('POST', '/estimator/proposals',
      { project_name: `Uji lifecycle ${stamp}`, status: 'draft' }, master);
    pid = prop.json?.id ?? prop.json?.data?.id;
    chk('proposal dibuat', !!pid, true);

    await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
    }, master);
    await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'column', element_name: 'K1',
      parameters: { B: 0.4, H: 0.4, qty_per_floor: 5, height_per_floor: 3.5, floors: 2 },
    }, master);
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 3 }, master);

    const sebelum = await hitungTurunan(pid);
    chk('ada elemen MTO tersimpan', sebelum.elemen >= 2, true);
    chk('ada baris MTO tersimpan', sebelum.baris > 0, true);
    chk('ada item RAB', sebelum.item > 0, true);

    console.log('\n2. Hapus proposal — turunannya harus ikut habis');
    const hapus = await call('DELETE', `/estimator/proposals/${pid}`, undefined, master);
    chk('penghapusan berhasil', hapus.status, 200);
    chk('respons melaporkan berapa elemen yang ikut dihapus',
      Number(hapus.json?.elemen_mto_terhapus), sebelum.elemen);

    const sesudah = await hitungTurunan(pid);
    chk('tidak ada engineering_inputs yatim', sesudah.elemen, 0);
    chk('tidak ada mto_lines yatim', sesudah.baris, 0);
    chk('proposal_items ikut hilang (FK cascade)', sesudah.item, 0);
    const masihAda: any = await dbGet('SELECT id FROM proposals WHERE id = ?', [pid]);
    chk('proposalnya sendiri terhapus', !masihAda, true);
    chk('tidak ada job outbox yatim',
      Number((await dbGet('SELECT COUNT(*) AS n FROM deal_pr_jobs WHERE proposal_id = ?', [pid]) as any)?.n), 0);

    console.log('\n3. Penolakan penghapusan TIDAK boleh menyentuh turunan');
    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Uji lifecycle terkunci ${stamp}`, status: 'draft' }, master);
    const pid2 = p2.json?.id ?? p2.json?.data?.id;
    await call('POST', `/estimator/proposals/${pid2}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
    }, master);
    await call('POST', `/estimator/proposals/${pid2}/items`, { ahsp_id: ahspId, qty: 2 }, master);
    const inc = await call('GET', `/estimator/proposals/${pid2}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid2}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid2}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid2}/status`, { status: 'submitted' }, master);

    const sebelumTolak = await hitungTurunan(pid2);
    const ditolak = await call('DELETE', `/estimator/proposals/${pid2}`, undefined, master);
    chk('hapus proposal submitted ditolak 409', ditolak.status, 409);
    const sesudahTolak = await hitungTurunan(pid2);
    chk('elemen MTO tetap utuh', sesudahTolak.elemen, sebelumTolak.elemen);
    chk('baris MTO tetap utuh', sesudahTolak.baris, sebelumTolak.baris);
    chk('item RAB tetap utuh', sesudahTolak.item, sebelumTolak.item);

    console.log('\n4. Elemen milik proposal LAIN tidak ikut terbawa');
    const p3 = await call('POST', '/estimator/proposals',
      { project_name: `Tetangga ${stamp}`, status: 'draft' }, master);
    const pid3 = p3.json?.id ?? p3.json?.data?.id;
    await call('POST', `/estimator/proposals/${pid3}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
    }, master);
    const p4 = await call('POST', '/estimator/proposals',
      { project_name: `Yang dihapus ${stamp}`, status: 'draft' }, master);
    const pid4 = p4.json?.id ?? p4.json?.data?.id;
    await call('POST', `/estimator/proposals/${pid4}/mto`, {
      element_type: 'foundation', element_name: 'P2',
      parameters: { L: 2, W: 2, H: 0.4, depth: 1.5, qty: 6, waste_pct: 5 },
    }, master);
    const tetanggaSebelum = await hitungTurunan(pid3);
    await call('DELETE', `/estimator/proposals/${pid4}`, undefined, master);
    const tetanggaSesudah = await hitungTurunan(pid3);
    chk('elemen tetangga tidak berkurang', tetanggaSesudah.elemen, tetanggaSebelum.elemen);
    chk('baris tetangga tidak berkurang', tetanggaSesudah.baris, tetanggaSebelum.baris);
    await call('DELETE', `/estimator/proposals/${pid3}`, undefined, master);

    console.log('\n5. Tidak ada satu pun yatim yang tersisa dari seluruh proposal uji ini');
    const yatim: any = await dbGet(
      `SELECT COUNT(*) AS n FROM engineering_inputs ei
       WHERE ei.scope_type='proposal' AND ei.scope_id IN (?, ?, ?)
         AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.id = ei.scope_id)`,
      [pid, pid3, pid4]);
    chk('nol elemen yatim', Number(yatim?.n), 0);

    // Bersihkan sisa fixture yang memang tidak boleh dihapus lewat API.
    await dbRun('DELETE FROM proposals WHERE id = ?', [pid2]).catch(() => {});
    await dbRun(`DELETE FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid2]).catch(() => {});

  } finally {
    console.log('\n6. Bersih-bersih');
    await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`LIF.${stamp}`]).catch(() => {});
    const sisa: any[] = await dbAll(
      `SELECT id FROM proposals WHERE project_name LIKE ?`, [`%${stamp}%`]);
    chk('tidak ada proposal fixture tertinggal', sisa.length, 0);
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
