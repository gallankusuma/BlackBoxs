import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-MTO-R38 — satu scope, satu kuantitas resmi.
 *
 * Sebelum perbaikan ini tiga jalur memakai sumber berbeda untuk angka yang sama:
 * `mto-link` dan `syncLinkedRabItems` menghitung ulang dengan kalkulator yang
 * sedang ter-deploy, sementara Deal menyalin `mto_lines` tersimpan apa adanya.
 * Selama formulanya tidak pernah berubah keduanya identik — itu sebabnya
 * masalahnya tidak pernah terlihat. Begitu formula diperbaiki, satu kontrak
 * berdiri di atas dua angka: RAB dan nilai penawaran memakai formula baru,
 * baseline MTO dan jejak procurement memakai formula lama.
 *
 * Perubahan formula sungguhan tidak bisa dilakukan di dalam tes — kalkulatornya
 * kode, bukan data. Yang diubah di sini adalah BARIS TERSIMPANNYA, sehingga
 * kondisi yang dihadapi sistem identik: baris tersimpan tidak lagi sama dengan
 * hasil kalkulator. Itu persis keadaan "stored V1, kalkulator V2".
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:drift
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
  const { dbAll, dbRun } = await import('../src/config/database');
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `DRF.${stamp}`, name: `Galian Drift ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 500000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP uji dibuat', !!ahspId, true);

  const nyatakanSisaScope = async (pid: any) => {
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (!ids.length) return;
    await call('PUT', `/estimator/proposals/${pid}/items/scope`,
      { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture uji drift' }, master);
  };

  /** Bikin proposal + elemen MTO + item RAB tertaut. */
  const siapkan = async (nama: string) => {
    const p = await call('POST', '/estimator/proposals', { project_name: `${nama} ${stamp}`, status: 'draft' }, master);
    const pid = p.json?.id ?? p.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
    const el = await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
    }, master);
    const it = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 1 }, master);
    const iid = it.json?.id ?? it.json?.data?.id;
    return { pid, eid: el.json?.id, iid };
  };

  try {
    console.log('\n1. Baris tersimpan lahir bersama elemennya, membawa versi formula');
    const a = await siapkan('Drift A');
    const baris: any[] = await dbAll(
      'SELECT line_code, net_quantity, formula_version FROM mto_lines WHERE element_id = ?', [a.eid]);
    chk('mto_lines tertulis saat elemen disimpan', baris.length > 0, true);
    chk('setiap baris membawa formula_version', baris.every(b => !!b.formula_version), true);

    console.log('\n2. Tautan berdiri di atas baris TERSIMPAN, bukan hasil kalkulator');
    // Label tidak ikut dibandingkan saat mendeteksi drift, jadi ia bisa dipakai
    // membuktikan baris mana yang benar-benar dibaca tanpa memicu penolakan.
    const penanda = `PENANDA-TERSIMPAN-${stamp}`;
    await dbRun('UPDATE mto_lines SET label = ? WHERE element_id = ? AND line_code = ?',
      [penanda, a.eid, 'FND-EXCV']);
    const tautA = await call('PUT', `/estimator/proposals/${a.pid}/items/${a.iid}/mto-link`,
      { element_id: a.eid, line_code: 'FND-EXCV' }, master);
    chk('tautan tersimpan', tautA.status, 200);
    chk('label datang dari baris tersimpan, bukan kalkulator', tautA.json?.line?.label, penanda);
    chk('provenance mencatat versi formula', !!tautA.json?.mto_link?.formula_version, true);
    chk('qty RAB sama dengan net tersimpan', tautA.json?.mto_link?.value, 36.864);

    console.log('\n3. Drift memblokir penautan baru — bukan diam-diam memakai angka baru');
    const b = await siapkan('Drift B');
    // Baris tersimpan digeser: inilah "stored V1 vs kalkulator V2".
    await dbRun('UPDATE mto_lines SET net_quantity = net_quantity * 1.1 WHERE element_id = ?', [b.eid]);
    const tautB = await call('PUT', `/estimator/proposals/${b.pid}/items/${b.iid}/mto-link`,
      { element_id: b.eid, line_code: 'FND-EXCV' }, master);
    chk('penautan pada elemen drift ditolak 409', tautB.status, 409);
    chk('kodenya FORMULA_DRIFT', tautB.json?.code, 'FORMULA_DRIFT');
    chk('pesannya menyebut elemen mana', String(tautB.json?.error || '').includes('P1'), true);
    chk('kedua versi disebutkan', !!tautB.json?.formula_version_current, true);

    console.log('\n4. Submit menolak proposal yang RAB-nya tidak lagi sama dengan baseline MTO');
    const c = await siapkan('Drift C');
    const tautC = await call('PUT', `/estimator/proposals/${c.pid}/items/${c.iid}/mto-link`,
      { element_id: c.eid, line_code: 'FND-EXCV' }, master);
    chk('tautan awal berhasil', tautC.status, 200);
    await nyatakanSisaScope(c.pid);
    // Baseline bergeser SETELAH tautan dibuat — persis yang dulu lolos diam-diam.
    await dbRun('UPDATE mto_lines SET net_quantity = 99.5 WHERE element_id = ? AND line_code = ?',
      [c.eid, 'FND-EXCV']);
    await call('PUT', `/estimator/proposals/${c.pid}/status`, { status: 'review' }, master);
    const submitC = await call('PUT', `/estimator/proposals/${c.pid}/status`, { status: 'submitted' }, master);
    chk('submit ditolak', submitC.status, 400);
    const sebab = JSON.stringify(submitC.json?.pelanggaran || []);
    chk('alasannya menyebut angka baseline (99.5)', sebab.includes('99.5'), true);
    chk('alasannya menyebut elemennya', sebab.includes('P1'), true);
    chk('proposal TIDAK berpindah status',
      (await call('GET', `/estimator/proposals/${c.pid}`, undefined, master)).json?.status, 'review');

    console.log('\n5. Simpan ulang elemen menyelesaikan drift dan menyelaraskan RAB');
    const simpanUlang = await call('POST', `/estimator/proposals/${c.pid}/mto`, {
      element_type: 'foundation', element_name: 'P1',
      parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
    }, master);
    chk('simpan ulang berhasil', simpanUlang.status < 300, true);
    const barisC: any[] = await dbAll(
      'SELECT net_quantity FROM mto_lines WHERE element_id = ? AND line_code = ?', [c.eid, 'FND-EXCV']);
    chk('baris tersimpan kembali ke nilai kalkulator', Number(barisC[0]?.net_quantity), 36.864);
    const submitC2 = await call('PUT', `/estimator/proposals/${c.pid}/status`, { status: 'submitted' }, master);
    chk('submit kini lolos', submitC2.status < 300, true);

    console.log('\n6. Tautan ke elemen yang sudah hilang tidak boleh menjadi kontrak');
    const d = await siapkan('Drift D');
    await call('PUT', `/estimator/proposals/${d.pid}/items/${d.iid}/mto-link`,
      { element_id: d.eid, line_code: 'FND-EXCV' }, master);
    await nyatakanSisaScope(d.pid);
    // Dihapus langsung di database: jalur DELETE endpoint memang menolak elemen
    // yang masih tertaut, dan yang diuji di sini adalah gerbangnya, bukan itu.
    await dbRun('DELETE FROM mto_lines WHERE element_id = ?', [d.eid]);
    await dbRun('DELETE FROM engineering_inputs WHERE id = ?', [d.eid]);
    await call('PUT', `/estimator/proposals/${d.pid}/status`, { status: 'review' }, master);
    const submitD = await call('PUT', `/estimator/proposals/${d.pid}/status`, { status: 'submitted' }, master);
    chk('submit ditolak saat elemen tautan hilang', submitD.status, 400);
    chk('alasannya menyebut elemen yang hilang',
      JSON.stringify(submitD.json?.pelanggaran || []).includes('sudah tidak ada'), true);

    console.log('\n7. Versi formula yang berbeda ditolak walau angkanya kebetulan sama');
    const e = await siapkan('Drift E');
    await call('PUT', `/estimator/proposals/${e.pid}/items/${e.iid}/mto-link`,
      { element_id: e.eid, line_code: 'FND-EXCV' }, master);
    await nyatakanSisaScope(e.pid);
    await dbRun('UPDATE mto_lines SET formula_version = ? WHERE element_id = ?', ['v0-purba', e.eid]);
    await call('PUT', `/estimator/proposals/${e.pid}/status`, { status: 'review' }, master);
    const submitE = await call('PUT', `/estimator/proposals/${e.pid}/status`, { status: 'submitted' }, master);
    chk('submit ditolak karena versi berbeda', submitE.status, 400);
    chk('alasannya menyebut versinya',
      JSON.stringify(submitE.json?.pelanggaran || []).includes('v0-purba'), true);

    console.log('\n8. Proposal terkunci tetap immutable terhadap perubahan baseline');
    // c sudah submitted di bagian 5.
    const tautTerkunci = await call('PUT', `/estimator/proposals/${c.pid}/items/${c.iid}/mto-link`,
      { element_id: c.eid, line_code: 'FND-LEAN' }, master);
    chk('menautkan ulang proposal submitted ditolak 409', tautTerkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', tautTerkunci.json?.code, 'PROPOSAL_LOCKED');

    console.log('\n9. Elemen lama tanpa baris tersimpan ikut diversikan saat ditautkan');
    const f = await siapkan('Drift F');
    await dbRun('DELETE FROM mto_lines WHERE element_id = ?', [f.eid]);
    await dbRun('UPDATE engineering_inputs SET formula_version = NULL WHERE id = ?', [f.eid]);
    const tautF = await call('PUT', `/estimator/proposals/${f.pid}/items/${f.iid}/mto-link`,
      { element_id: f.eid, line_code: 'FND-EXCV' }, master);
    chk('elemen tanpa baris tersimpan tetap bisa ditautkan', tautF.status, 200);
    const barisF: any[] = await dbAll(
      'SELECT formula_version FROM mto_lines WHERE element_id = ?', [f.eid]);
    chk('barisnya dimaterialkan saat itu juga', barisF.length > 0, true);
    chk('dan diberi versi', !!barisF[0]?.formula_version, true);

  } finally {
    console.log('\n10. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    console.log(`  ––   ${sisa} proposal uji tidak terhapus lewat API (submitted/deal memang tidak boleh dihapus)`);
    await dbRun(`DELETE FROM ahsp_headers WHERE kode = ?`, [`DRF.${stamp}`]).catch(() => {});
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
