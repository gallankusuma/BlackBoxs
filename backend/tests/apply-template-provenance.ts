import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-TPL-R43 — basis desain header harus cocok dengan RAB/MTO yang dihasilkan.
 *
 * Wizard sudah menghasilkan `design_params` — dimensi yang dipakai menghitung
 * geometry dan MTO. Jalur create mengirimnya; jalur editor `applyWizardTemplate`
 * tidak, dan handler `apply-template` juga hanya mendestruktur tiga field lalu
 * hanya menulis `proposal_type`. Akibatnya `proposals.design_params` tetap
 * berisi geometry template SEBELUMNYA (atau null) sementara RAB dan MTO sudah
 * berasal dari dimensi baru.
 *
 * Kontradiksi kedua: mode `append` mempertahankan seluruh item lama tapi tetap
 * menimpa `proposal_type`. Proposal Civil yang ditambahi Electrical berisi scope
 * dua disiplin sambil mengaku satu — dan parameter Civil lamanya masih berada di
 * satu-satunya JSON `design_params`.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:template-prov
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

const seksi = (nama: string) => ([{ code: 'A', name: nama, children: [{ name: `${nama} anak`, volume: 2 }] }]);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbRun } = await import('../src/config/database');
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const paramsA = { luas: 120, tinggi: 4, bentang: 8, _catatan: `A-${stamp}` };
  const paramsB = { luas: 400, tinggi: 9, bentang: 20, _catatan: `B-${stamp}` };

  const bacaHeader = async (pid: any) => {
    const r: any = await dbGet('SELECT proposal_type, design_params FROM proposals WHERE id = ?', [pid]);
    let dp: any = {};
    try { dp = typeof r?.design_params === 'string' ? JSON.parse(r.design_params || '{}') : (r?.design_params || {}); } catch {}
    return { tipe: r?.proposal_type, params: dp };
  };

  try {
    console.log('\n1. Proposal dibuat dari Civil Building dengan parameter A');
    const p = await call('POST', '/estimator/proposals', {
      project_name: `Uji template ${stamp}`, status: 'draft',
      proposal_type: 'civil_building', design_params: paramsA,
    }, master);
    const pid = p.json?.id ?? p.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
    const h0 = await bacaHeader(pid);
    chk('tipe awal tersimpan', h0.tipe, 'civil_building');
    chk('parameter A tersimpan', h0.params?._catatan, `A-${stamp}`);

    console.log('\n2. Replace dengan parameter B — basis header ikut berpindah');
    const replace = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', template_sections: seksi('Struktur'),
      mode: 'replace', design_params: paramsB,
    }, master);
    chk('replace berhasil', replace.status < 300, true);
    const h1 = await bacaHeader(pid);
    chk('tipe berpindah ke civil_structure', h1.tipe, 'civil_structure');
    chk('parameter aktif kini B', h1.params?._catatan, `B-${stamp}`);
    chk('parameter A tidak lagi menjadi basis aktif', h1.params?.luas, 400);
    chk('riwayat penerapan tercatat', Array.isArray(h1.params?._penerapan), true);
    chk('entri terakhir bermode replace',
      h1.params?._penerapan?.[h1.params._penerapan.length - 1]?.mode, 'replace');
    chk('entri terakhir membawa parameternya',
      h1.params?._penerapan?.[h1.params._penerapan.length - 1]?.parameter?._catatan, `B-${stamp}`);

    console.log('\n3. Append tipe BERBEDA ditolak — header tidak boleh mengaku satu tipe untuk isi dua');
    const itemSebelum: any = await dbGet(
      'SELECT COUNT(*) AS n FROM proposal_items WHERE proposal_id = ?', [pid]);
    const appendBeda = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'electrical', template_sections: seksi('Panel'),
      mode: 'append', design_params: { daya: 1200 },
    }, master);
    chk('ditolak 409', appendBeda.status, 409);
    chk('kodenya TIPE_TEMPLATE_BERBEDA', appendBeda.json?.code, 'TIPE_TEMPLATE_BERBEDA');
    chk('pesannya menyebut kedua tipe',
      String(appendBeda.json?.error || '').includes('civil_structure')
      && String(appendBeda.json?.error || '').includes('electrical'), true);
    const h2 = await bacaHeader(pid);
    chk('tipe header TIDAK berubah', h2.tipe, 'civil_structure');
    chk('parameter header TIDAK berubah', h2.params?._catatan, `B-${stamp}`);
    const itemSesudah: any = await dbGet(
      'SELECT COUNT(*) AS n FROM proposal_items WHERE proposal_id = ?', [pid]);
    chk('tidak ada item yang tersisip sebelum penolakan', Number(itemSesudah?.n), Number(itemSebelum?.n));

    console.log('\n4. Append tipe SAMA menambah riwayat, bukan menghapus jejak sebelumnya');
    const jumlahRiwayat = h2.params?._penerapan?.length || 0;
    const appendSama = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', template_sections: seksi('Struktur Tambahan'),
      mode: 'append', design_params: { ...paramsB, bentang: 30, _catatan: `C-${stamp}` },
    }, master);
    chk('append tipe sama diterima', appendSama.status < 300, true);
    const h3 = await bacaHeader(pid);
    chk('riwayat bertambah satu', h3.params?._penerapan?.length, jumlahRiwayat + 1);
    chk('penerapan B masih bisa ditelusuri',
      JSON.stringify(h3.params?._penerapan || []).includes(`B-${stamp}`), true);
    chk('entri baru bermode append',
      h3.params?._penerapan?.[h3.params._penerapan.length - 1]?.mode, 'append');
    chk('tiap entri mencatat pelakunya',
      (h3.params?._penerapan || []).every((e: any) => 'oleh' in e && 'pada' in e), true);

    console.log('\n5. Payload tidak valid ditolak 422 tanpa menyentuh apa pun');
    const h4Sebelum = await bacaHeader(pid);
    const tipeAneh = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'tipe_karangan', template_sections: seksi('X'), mode: 'replace',
    }, master);
    chk('tipe tak dikenal ditolak 422', tipeAneh.status, 422);
    chk('kodenya TIPE_PROPOSAL_TIDAK_DIKENAL', tipeAneh.json?.code, 'TIPE_PROPOSAL_TIDAK_DIKENAL');
    chk('daftar tipe yang dikenal disebutkan', Array.isArray(tipeAneh.json?.tipe_dikenal), true);

    const paramsAneh = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', template_sections: seksi('X'),
      mode: 'replace', design_params: 'bukan objek',
    }, master);
    chk('design_params non-objek ditolak 422', paramsAneh.status, 422);
    chk('kodenya DESIGN_PARAMS_TIDAK_VALID', paramsAneh.json?.code, 'DESIGN_PARAMS_TIDAK_VALID');
    chk('field yang salah disebutkan', paramsAneh.json?.field, 'design_params');

    const h4 = await bacaHeader(pid);
    chk('tipe tetap utuh setelah dua penolakan', h4.tipe, h4Sebelum.tipe);
    chk('parameter tetap utuh', h4.params?._catatan, h4Sebelum.params?._catatan);

    console.log('\n6. Proposal terkunci menolak apply-template');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    const ahsp = await call('POST', '/estimator/ahsp', {
      kode: `TPL.${stamp}`, name: `AHSP Template ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 900000 }],
    }, master);
    await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: ahsp.json?.id ?? ahsp.json?.data?.id, qty: 2 }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const terkunci = await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', template_sections: seksi('Y'),
      mode: 'replace', design_params: { luas: 1 },
    }, master);
    chk('apply-template pada proposal submitted ditolak 409', terkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', terkunci.json?.code, 'PROPOSAL_LOCKED');
    const h5 = await bacaHeader(pid);
    chk('basis desain proposal terkunci tidak berubah', h5.params?._catatan, `C-${stamp}`);

    await dbRun('DELETE FROM proposals WHERE id = ?', [pid]).catch(() => {});
    await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`TPL.${stamp}`]).catch(() => {});

    console.log('\n7. Layar editor benar-benar mengirim design_params');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/views/EstimatorProposalEditor.vue', import.meta.url), 'utf8');
    chk('apply-template dari editor membawa design_params',
      vue.includes('design_params:     wizardData.design_params'), true);

  } finally {
    console.log('\n8. Bersih-bersih');
    for (const h of bersihkan.reverse()) { try { await h(); } catch { /* sudah dihapus langsung */ } }
    const sisa: any = await dbGet('SELECT COUNT(*) AS n FROM proposals WHERE project_name LIKE ?', [`%${stamp}%`]);
    chk('tidak ada proposal fixture tertinggal', Number(sisa?.n), 0);
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
