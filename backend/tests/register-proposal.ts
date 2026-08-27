import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-REG-R49 — register proposal yang bisa dicari, disaring, dan angkanya
 * rekonsiliasi.
 *
 * `GET /estimator/proposals` dulu `SELECT p.*` seluruh baris tanpa satu pun
 * parameter, dan layar menghitung KPI-nya di browser dari array itu. Tiga
 * akibat, dan yang ketiga paling halus:
 *
 *   1. Tidak ada cara mencari nomor, project, client, atau lokasi.
 *   2. `p.*` mengirim `design_params` dan seluruh kolom komersial ke layar
 *      daftar yang hanya merender sebagian.
 *   3. `no_deal` tidak punya kartu KPI sama sekali, jadi **Total tidak harus
 *      sama dengan jumlah kartu status**. Angka yang tidak rekonsiliasi lebih
 *      buruk daripada tidak ada angka, karena tidak ada yang tampak salah.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:register-list
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
    kode: `RGL.${stamp}`, name: `AHSP Register List ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 400000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  const buat = async (nama: string, sampai: string[], lokasi?: string) => {
    const p = await call('POST', '/estimator/proposals',
      { project_name: `Uji reglist ${nama} ${stamp}`, status: 'draft', lokasi: lokasi || null }, master);
    const pid = p.json?.id ?? p.json?.data?.id;
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 2 }, master);
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    for (const st of sampai) await call('PUT', `/estimator/proposals/${pid}/status`, { status: st }, master);
    return pid;
  };

  try {
    console.log('\n1. Fixture: satu proposal per status, termasuk no_deal');
    await buat('draft', [], `Cilegon ${stamp}`);
    await buat('review', ['review']);
    await buat('submitted', ['review', 'submitted']);
    await buat('nodeal', ['review', 'submitted', 'no_deal']);
    pass++; console.log('  ok   empat proposal uji dibuat');

    console.log('\n2. Pencarian menyaring di server, bukan di browser');
    const cari = await call('GET', `/estimator/proposals?q=${stamp}`, undefined, master);
    chk('respons berbentuk amplop, bukan array polos', Array.isArray(cari.json), false);
    chk('membawa items', Array.isArray(cari.json?.items), true);
    chk('menemukan tepat empat', cari.json?.total, 4);
    chk('semua hasilnya memang cocok',
      (cari.json?.items || []).every((x: any) => String(x.project_name).includes(stamp)), true);

    const cariLokasi = await call('GET', `/estimator/proposals?q=Cilegon%20${stamp}`, undefined, master);
    chk('lokasi ikut dicari', cariLokasi.json?.total, 1);

    console.log('\n3. Faset dihitung server dan REKONSILIASI ke total');
    const f = cari.json?.faset || {};
    chk('draft', f.draft, 1);
    chk('review', f.review, 1);
    chk('submitted', f.submitted, 1);
    chk('no_deal punya kartunya sendiri', f.no_deal, 1);
    const jumlahFaset = Object.values(f).reduce((a: number, b: any) => a + Number(b || 0), 0);
    chk('jumlah seluruh faset = total scope', jumlahFaset, cari.json?.total_scope);
    chk('dan cocok dengan jumlah fixture', jumlahFaset, 4);

    console.log('\n4. Filter status');
    const hanyaNoDeal = await call('GET', `/estimator/proposals?q=${stamp}&status=no_deal`, undefined, master);
    chk('hanya satu hasil', hanyaNoDeal.json?.total, 1);
    chk('dan statusnya benar', hanyaNoDeal.json?.items?.[0]?.status, 'no_deal');
    chk('faset TETAP memperlihatkan seluruh sebaran saat satu status dipilih',
      hanyaNoDeal.json?.faset?.draft, 1);

    const dua = await call('GET', `/estimator/proposals?q=${stamp}&status=draft,review`, undefined, master);
    chk('multi-status', dua.json?.total, 2);

    console.log('\n5. Status karangan ditolak, tidak diam-diam menghasilkan daftar kosong');
    const aneh = await call('GET', `/estimator/proposals?status=status_karangan`, undefined, master);
    chk('ditolak 400', aneh.status, 400);
    chk('kodenya STATUS_TIDAK_DIKENAL', aneh.json?.code, 'STATUS_TIDAK_DIKENAL');
    chk('menyebut status yang sah', Array.isArray(aneh.json?.status_dikenal), true);

    console.log('\n6. Pengurutan hanya dari daftar yang diizinkan');
    const sortAneh = await call('GET', `/estimator/proposals?sort=total_project);DROP`, undefined, master);
    chk('ditolak 400', sortAneh.status, 400);
    chk('kodenya SORT_TIDAK_DIDUKUNG', sortAneh.json?.code, 'SORT_TIDAK_DIDUKUNG');
    const sortSah = await call('GET', `/estimator/proposals?q=${stamp}&sort=proposal_number&dir=asc`, undefined, master);
    chk('pengurutan yang sah diterima', sortSah.status, 200);
    const nomor = (sortSah.json?.items || []).map((x: any) => x.proposal_number);
    chk('hasilnya benar-benar urut naik',
      JSON.stringify(nomor), JSON.stringify([...nomor].sort()));

    console.log('\n7. Halaman');
    const h1 = await call('GET', `/estimator/proposals?q=${stamp}&limit=2&offset=0&sort=proposal_number&dir=asc`, undefined, master);
    const h2 = await call('GET', `/estimator/proposals?q=${stamp}&limit=2&offset=2&sort=proposal_number&dir=asc`, undefined, master);
    chk('halaman 1 berisi dua', h1.json?.items?.length, 2);
    chk('halaman 1 menyatakan masih ada lagi', h1.json?.has_more, true);
    chk('halaman 2 berisi dua', h2.json?.items?.length, 2);
    chk('halaman 2 menyatakan habis', h2.json?.has_more, false);
    const semua = [...h1.json.items, ...h2.json.items].map((x: any) => x.id);
    chk('tidak ada baris yang terlewat atau tergandakan', new Set(semua).size, 4);

    console.log('\n8. limit dibatasi supaya satu permintaan tidak bisa menarik seluruh tabel');
    const besar = await call('GET', `/estimator/proposals?limit=99999`, undefined, master);
    chk('limit dipangkas ke batas atas', besar.json?.limit, 200);

    console.log('\n9. DTO daftar tidak lagi membawa design_params');
    const satu = cari.json?.items?.[0];
    chk('design_params tidak dikirim ke daftar', 'design_params' in (satu || {}), false);
    chk('tapi kolom yang dirender tetap ada',
      ['id', 'proposal_number', 'project_name', 'status', 'total_project'].every(k => k in (satu || {})), true);
    const detail = await call('GET', `/estimator/proposals/${satu?.id}`, undefined, master);
    chk('dan detail tetap membawanya', 'design_params' in ((detail.json?.data ?? detail.json) || {}), true);

    console.log('\n10. Layar membedakan gagal-muat dari register kosong');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/views/EstimatorProposalList.vue', import.meta.url), 'utf8');
    chk('kegagalan tidak lagi hanya masuk console', vue.includes('const galatMuat'), true);
    chk('dan dinyatakan tidak menggambarkan isi sebenarnya',
      vue.includes('tidak menggambarkan isi sebenarnya'), true);
    chk('KPI memakai faset server, bukan proposals.filter',
      !vue.includes("proposals.filter(p => p.status === 'draft').length"), true);
    chk('no_deal punya kartu', vue.includes("id: 'no_deal'"), true);
    chk('pencarian di-debounce', vue.includes('timerCari'), true);
    chk('respons usang tidak menimpa yang baru', vue.includes('if (seq !== permintaanKe) return;'), true);

  } finally {
    console.log('\n11. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('fixture tersapu', disapu.proposal, 4);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
