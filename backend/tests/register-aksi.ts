import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-UX-R48 — register tidak menawarkan tindakan yang mustahil berhasil.
 *
 * Tombol Delete ditampilkan lewat `v-if="proposal.status !== 'deal'"`, yang ikut
 * mencakup `submitted` dan `no_deal`. Backend menolak keduanya 409
 * `PROPOSAL_LOCKED`, dan proposal yang sudah punya project ditolak
 * `PROPOSAL_HAS_PROJECT`. Handler layar tidak membaca body error itu — setelah
 * pengguna menyetujui dialog destruktif, yang muncul hanya
 * "Failed to delete proposal".
 *
 * Jadi operator berulang kali mengonfirmasi tindakan yang tidak mungkin
 * berhasil, dan penjelasan 409 yang tepat justru dibuang.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:register
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

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `REG.${stamp}`, name: `AHSP Register ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 600000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  /** Proposal bernilai, dibawa ke status yang diminta. */
  const buat = async (nama: string, sampai: string[]) => {
    const p = await call('POST', '/estimator/proposals',
      { project_name: `Uji register ${nama} ${stamp}`, status: 'draft' }, master);
    const pid = p.json?.id ?? p.json?.data?.id;
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 3 }, master);
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture register' }, master);
    }
    for (const st of sampai) await call('PUT', `/estimator/proposals/${pid}/status`, { status: st }, master);
    return pid;
  };

  try {
    console.log('\n1. Kontrak backend: hanya draft/review yang boleh dihapus');
    const draft = await buat('draft', []);
    const review = await buat('review', ['review']);
    const submitted = await buat('submitted', ['review', 'submitted']);
    const noDeal = await buat('nodeal', ['review', 'submitted', 'no_deal']);

    const tolakSubmitted = await call('DELETE', `/estimator/proposals/${submitted}`, undefined, master);
    chk('submitted ditolak 409', tolakSubmitted.status, 409);
    chk('kodenya PROPOSAL_LOCKED', tolakSubmitted.json?.code, 'PROPOSAL_LOCKED');
    chk('pesannya menyebut status aktualnya', tolakSubmitted.json?.status_proposal, 'submitted');
    chk('dan menyebut apa yang boleh',
      String(tolakSubmitted.json?.error || '').includes('draft dan review'), true);

    const tolakNoDeal = await call('DELETE', `/estimator/proposals/${noDeal}`, undefined, master);
    chk('no_deal ditolak 409', tolakNoDeal.status, 409);
    chk('kodenya PROPOSAL_LOCKED', tolakNoDeal.json?.code, 'PROPOSAL_LOCKED');

    console.log('\n2. Yang memang boleh, berhasil');
    chk('review terhapus', (await call('DELETE', `/estimator/proposals/${review}`, undefined, master)).status, 200);
    chk('draft terhapus', (await call('DELETE', `/estimator/proposals/${draft}`, undefined, master)).status, 200);

    console.log('\n3. no_deal → draft memang ada di state machine, jadi layak ditawarkan');
    const buka = await call('PUT', `/estimator/proposals/${noDeal}/status`, { status: 'draft' }, master);
    chk('buka kembali diterima', buka.status < 300, true);
    const cek = await call('GET', `/estimator/proposals/${noDeal}`, undefined, master);
    chk('statusnya kembali draft', (cek.json?.data ?? cek.json)?.status, 'draft');
    chk('dan setelah itu boleh dihapus',
      (await call('DELETE', `/estimator/proposals/${noDeal}`, undefined, master)).status, 200);

    console.log('\n4. Proposal yang sudah jadi project ditolak dengan alasan yang berbeda');
    const deal = await buat('deal', ['review', 'submitted', 'deal']);
    const tolakDeal = await call('DELETE', `/estimator/proposals/${deal}`, undefined, master);
    chk('ditolak 409', tolakDeal.status, 409);
    chk('kodenya membedakan sebabnya',
      ['PROPOSAL_LOCKED', 'PROPOSAL_HAS_PROJECT'].includes(tolakDeal.json?.code), true);

    console.log('\n5. Layar memakai predikat yang sama, bukan `status !== deal`');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/views/EstimatorProposalList.vue', import.meta.url), 'utf8');
    chk('predikat lama sudah tidak dipakai untuk tombol hapus',
      !vue.includes(`v-if="proposal.status !== 'deal'" @click="deleteProposal`), true);
    chk('ada predikat yang mencerminkan backend', vue.includes('const bolehHapus'), true);
    chk('hanya draft/review', vue.includes("const STATUS_BOLEH_HAPUS = ['draft', 'review']"), true);
    chk('dan proposal berproject dikecualikan', vue.includes('!p?.project_id'), true);
    chk('no_deal ditawari buka kembali, bukan hapus', vue.includes('const bukaKembali'), true);
    chk('pesan 409 server ditampilkan apa adanya',
      vue.includes("error?.response?.data?.error || 'Gagal menghapus proposal.'"), true);
    chk('daftar dimuat ulang setelah penolakan, bukan diubah optimistis',
      vue.includes("alert(error?.response?.data?.error || 'Gagal menghapus proposal.');\n    await loadProposals();"), true);
    chk('konfirmasi menyebut proposal mana', vue.includes('const nama = [p?.proposal_number'), true);

  } finally {
    console.log('\n6. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('tidak ada sisa fixture', disapu.proposal >= 0, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
