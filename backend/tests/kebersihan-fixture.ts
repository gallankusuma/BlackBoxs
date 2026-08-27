import 'dotenv/config';
import { sapuFixture, sisaFixture } from './_bersih';
/**
 * TEST-HYG-R46 — suite yang menyebut dirinya idempoten harus benar-benar bersih.
 *
 * Tiap suite sudah punya `finally` yang memanggil `DELETE /estimator/proposals/:id`.
 * Dua hal membuatnya tidak cukup:
 *
 *   1. Endpoint itu **menolak** proposal `submitted`/`deal` — dan itu memang
 *      benar. Tapi hampir setiap suite membuat fixture submitted untuk menguji
 *      penguncian, lalu menelan 409-nya dengan `catch {}`. Fixture itu menetap.
 *   2. Suite memanggil `process.exit()` saat asersi gagal, sehingga jalur
 *      pembersihan tidak selalu tercapai.
 *
 * Terukur 27 Agustus 2026 di database dev: **8.959 proposal, 5.238 item RAB,
 * 3.564 elemen MTO (152 di antaranya yatim), dan 2.354 AHSP fixture**. Itu bukan
 * sekadar boros — ia mengaburkan audit yatim, dan membuat tes rekonsiliasi
 * berikutnya bisa memberi hasil palsu karena membaca sisa run sebelumnya.
 *
 * Tes ini adalah penjaganya: ia membuat fixture yang paling sulit dibersihkan
 * (proposal submitted, yang API-nya menolak dihapus) lalu membuktikan tidak ada
 * satu baris pun tersisa.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:kebersihan
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
  const stamp = `HYG${Date.now().toString().slice(-7)}`;
  const { dbGet } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  console.log('\n1. Fixture yang paling sulit dibersihkan: proposal submitted + MTO + AHSP');
  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `HYG.${stamp}`, name: `AHSP Kebersihan ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 500000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP fixture dibuat', !!ahspId, true);

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji kebersihan ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  chk('proposal fixture dibuat', !!pid, true);

  await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'foundation', element_name: 'P1',
    parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
  }, master);
  await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 4 }, master);

  const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
  const ids = (inc.json?.items || []).map((x: any) => x.id);
  if (ids.length) {
    await call('PUT', `/estimator/proposals/${pid}/items/scope`,
      { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture kebersihan' }, master);
  }
  await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
  const submit = await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
  chk('proposal berhasil di-submit', submit.status < 300, true);

  const elemen: any = await dbGet(
    `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
  const baris: any = await dbGet(
    `SELECT COUNT(*) n FROM mto_lines ml JOIN engineering_inputs ei ON ei.id=ml.element_id
     WHERE ei.scope_type='proposal' AND ei.scope_id=?`, [pid]);
  chk('elemen MTO memang ada sebelum disapu', Number(elemen?.n) > 0, true);
  chk('baris MTO memang ada sebelum disapu', Number(baris?.n) > 0, true);

  console.log('\n2. Jalur API memang menolak menghapusnya — itulah sebabnya `finally` lama tidak cukup');
  const lewatApi = await call('DELETE', `/estimator/proposals/${pid}`, undefined, master);
  chk('DELETE lewat API ditolak 409', lewatApi.status, 409);
  chk('proposalnya karena itu masih ada',
    !!(await dbGet('SELECT id FROM proposals WHERE id = ?', [pid])), true);

  console.log('\n3. `sapuFixture` membersihkannya sampai habis');
  const disapu = await sapuFixture(stamp);
  chk('proposal tersapu', disapu.proposal, 1);
  chk('elemen MTO tersapu', disapu.elemen, Number(elemen?.n));
  chk('baris MTO tersapu', disapu.baris, Number(baris?.n));
  chk('AHSP fixture tersapu', disapu.ahsp >= 1, true);

  console.log('\n4. Nol sisa — diperiksa per tabel, bukan disimpulkan');
  chk('proposals', Number((await dbGet('SELECT COUNT(*) n FROM proposals WHERE id = ?', [pid]) as any)?.n), 0);
  chk('proposal_items', Number((await dbGet('SELECT COUNT(*) n FROM proposal_items WHERE proposal_id = ?', [pid]) as any)?.n), 0);
  chk('engineering_inputs', Number((await dbGet(
    `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]) as any)?.n), 0);
  chk('ahsp_headers', Number((await dbGet('SELECT COUNT(*) n FROM ahsp_headers WHERE kode LIKE ?', [`%${stamp}%`]) as any)?.n), 0);
  chk('tidak ada sisa apa pun bernama stamp ini', await sisaFixture(stamp), 0);

  console.log('\n5. Menyapu dua kali aman — jalur `finally` bisa terpanggil berulang');
  const lagi = await sapuFixture(stamp);
  chk('sapuan kedua tidak menghapus apa-apa', lagi.proposal + lagi.elemen + lagi.baris + lagi.ahsp, 0);

  console.log('\n6. Tidak ada elemen MTO yatim tersisa di seluruh database');
  const yatim: any = await dbGet(
    `SELECT COUNT(*) n FROM engineering_inputs ei WHERE ei.scope_type='proposal'
       AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.id = ei.scope_id)`);
  chk('nol elemen yatim ber-scope proposal', Number(yatim?.n), 0);

  // MTO project punya jalur sendiri dan tidak ikut terhapus bersama proposal.
  // Terukur 637 elemen project yatim di dev sebelum ini dijaga.
  const yatimProyek: any = await dbGet(
    `SELECT COUNT(*) n FROM engineering_inputs ei WHERE ei.scope_type='project'
       AND NOT EXISTS (SELECT 1 FROM client_projects c WHERE c.id = ei.scope_id)`);
  chk('nol elemen yatim ber-scope project', Number(yatimProyek?.n), 0);

  const barisTanpaElemen: any = await dbGet(
    `SELECT COUNT(*) n FROM mto_lines ml
     WHERE NOT EXISTS (SELECT 1 FROM engineering_inputs ei WHERE ei.id = ml.element_id)`);
  chk('nol baris MTO tanpa elemen', Number(barisTanpaElemen?.n), 0);

  console.log('\n7. Seluruh suite yang membuat proposal memanggil penyapu ini');
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('.', import.meta.url);
  const belum: string[] = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ts') && f !== '_bersih.ts' && f !== 'kebersihan-fixture.ts')) {
    const isi = readFileSync(new URL(f, dir), 'utf8');
    const buatProposal = isi.includes("estimator/proposals'") || isi.includes('estimator/proposals`');
    if (buatProposal && !isi.includes('sapuFixture')) belum.push(f);
  }
  chk('tidak ada suite yang membuat proposal tanpa menyapunya', belum.join(', '), '');

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
