import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Opportunity register — menyambung CRM ke penawaran dan menang/kalah.
 *
 * `proposals` tidak punya satu pun tautan ke prospect/opportunity, sehingga
 * nilai pipeline tidak bisa direkonsiliasi ke penawaran yang benar-benar
 * dikirim, dan **win rate tidak punya penyebut yang sah**.
 *
 * Tiga hal yang diuji paling keras:
 *
 *   1. Penyebut win rate hanya yang SUDAH DIPUTUSKAN. Kalau yang terbuka ikut,
 *      angkanya selalu terlihat bagus di awal.
 *   2. Nilai berasal dari revisi penawaran yang terbit — bukan taksiran — dan
 *      sumbernya dinyatakan.
 *   3. Menang tanpa penawaran terbit ditolak; kalah tanpa alasan ditolak.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:opportunity
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
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
  const { dbGet, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  const ids: number[] = [];
  const buat = async (judul: string, taksiran: number, prob: number) => {
    const r = await call('POST', '/opportunities',
      { title: `${judul} ${stamp}`, estimated_value: taksiran, probability: prob }, master);
    if (r.json?.id) ids.push(r.json.id);
    return r;
  };

  try {
    console.log('\n1. Register dibuat, nomornya berurutan, riwayat tercatat');
    const o1 = await buat('Gudang A', 1000000000, 50);
    chk('dibuat', o1.status, 201);
    chk('nomornya berpola OPP/tahun/urut', /^OPP\/\d{4}\/\d{4}$/.test(o1.json?.code || ''), true);
    chk('mulai dari lead', o1.json?.stage, 'lead');
    const detail = await call('GET', `/opportunities/${o1.json.id}`, undefined, master);
    chk('riwayat pembuatan tercatat', (detail.json?.riwayat || []).length, 1);
    chk('transisi sah disebutkan', (detail.json?.transisi_sah || []).includes('qualified'), true);

    console.log('\n2. Transisi divalidasi — tidak bisa melompat ke menang');
    // Lompat dari lead ke won berarti ada yang menang tanpa pernah menawar.
    const lompat = await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: 'won' }, master);
    chk('ditolak 409', lompat.status, 409);
    chk('kodenya jelas', lompat.json?.code, 'TRANSISI_TIDAK_SAH');
    chk('menyebutkan transisi yang sah', (lompat.json?.sah || []).includes('qualified'), true);
    chk('tahap ngawur ditolak',
      (await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: 'entah' }, master)).json?.code,
      'STAGE_TIDAK_DIKENAL');

    console.log('\n3. Nilai masih TAKSIRAN selama belum ada penawaran — dan dikatakan');
    const daftar1 = await call('GET', '/opportunities', undefined, master);
    const d1 = (daftar1.json?.data || []).find((x: any) => x.id === o1.json.id);
    chk('nilainya dari taksiran', d1?.nilai_sumber, 'taksiran');
    chk('nilai tertimbang = nilai x probability', Number(d1?.nilai_tertimbang), 500000000);

    console.log('\n4. Menang WAJIB punya penawaran terbit');
    for (const t of ['qualified', 'bidding', 'submitted']) {
      await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: t }, master);
    }
    const tanpaPenawaran = await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: 'won' }, master);
    chk('ditolak 409', tanpaPenawaran.status, 409);
    chk('kodenya jelas', tanpaPenawaran.json?.code, 'BELUM_ADA_PENAWARAN_TERBIT');

    console.log('\n5. Ditautkan ke proposal, lalu nilainya berasal dari revisi terbit');
    const ahspId = (await call('POST', '/estimator/ahsp', {
      kode: `OP.${stamp}`, name: `Beton ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: `B ${stamp}`,
        resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
    }, master)).json?.id;
    const pid = (await call('POST', '/estimator/proposals',
      { project_name: `Penawaran opp ${stamp}`, status: 'draft' }, master)).json?.id;
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 200 }, master);
    chk('proposal ditautkan',
      (await call('PUT', `/opportunities/${o1.json.id}/proposal/${pid}`, {}, master)).status, 200);
    // Menautkan proposal yang sama ke opportunity lain memindahkan nilainya —
    // dan itu menggeser dua pipeline sekaligus.
    const o2 = await buat('Gudang B', 500000000, 30);
    chk('tautan ganda ditolak 409',
      (await call('PUT', `/opportunities/${o2.json.id}/proposal/${pid}`, {}, master)).json?.code,
      'PROPOSAL_SUDAH_TERTAUT');

    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const iid = (inc.json?.items || []).map((x: any) => x.id);
    if (iid.length) await call('PUT', `/estimator/proposals/${pid}/items/scope`,
      { item_ids: iid, scope_status: 'excluded', scope_note: 'fixture' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);

    const prop: any = await dbGet('SELECT total_project FROM proposals WHERE id = ?', [pid]);
    const daftar2 = await call('GET', '/opportunities', undefined, master);
    const d2 = (daftar2.json?.data || []).find((x: any) => x.id === o1.json.id);
    chk('sumber nilainya kini revisi penawaran', d2?.nilai_sumber, 'revisi_penawaran');
    chk('nilainya = total revisi, bukan taksiran',
      Number(d2?.nilai), Math.round(Number(prop?.total_project) * 100) / 100);
    chk('bukan lagi 1 miliar taksiran', Number(d2?.nilai) === 1000000000, false);

    console.log('\n6. Sekarang menang diterima');
    chk('menang berhasil',
      (await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: 'won' }, master)).status, 200);
    const won: any = await dbGet('SELECT stage, won_at FROM opportunities WHERE id = ?', [o1.json.id]);
    chk('tahapnya won', won?.stage, 'won');
    chk('waktunya tercatat', !!won?.won_at, true);
    chk('yang sudah won tidak bisa diubah lagi',
      (await call('PUT', `/opportunities/${o1.json.id}/stage`, { stage: 'lost', lost_reason_code: 'X' }, master)).status, 409);

    console.log('\n7. Kalah WAJIB beralasan');
    for (const t of ['qualified', 'bidding', 'submitted']) {
      await call('PUT', `/opportunities/${o2.json.id}/stage`, { stage: t }, master);
    }
    const tanpaAlasan = await call('PUT', `/opportunities/${o2.json.id}/stage`, { stage: 'lost' }, master);
    chk('ditolak 400', tanpaAlasan.status, 400);
    chk('kodenya jelas', tanpaAlasan.json?.code, 'ALASAN_KALAH_WAJIB');
    chk('dengan alasan diterima',
      (await call('PUT', `/opportunities/${o2.json.id}/stage`,
        { stage: 'lost', lost_reason_code: 'HARGA', lost_reason_note: `kalah harga ${stamp}` }, master)).status, 200);
    const lost: any = await dbGet('SELECT lost_reason_code, lost_at FROM opportunities WHERE id = ?', [o2.json.id]);
    chk('alasannya tersimpan', lost?.lost_reason_code, 'HARGA');

    console.log('\n8. INI YANG MENENTUKAN — penyebut win rate hanya yang diputuskan');
    // Dua opportunity terbuka ditambahkan. Kalau ikut penyebut, win rate akan
    // terlihat jauh lebih rendah dari yang sebenarnya.
    await buat('Gudang C', 200000000, 20);
    await buat('Gudang D', 300000000, 40);
    const ring = await call('GET', '/opportunities/ringkasan/pipeline', undefined, master);
    chk('terbaca', ring.status, 200);
    chk('penyebutnya hanya menang + kalah',
      ring.json?.win_rate?.penyebut,
      Number(ring.json?.menang?.jml) + Number(ring.json?.kalah?.jml));
    // 1 menang : 1 kalah dari fixture ini = 50% (angka global bisa lebih besar
    // kalau ada sisa data lain, jadi yang diperiksa relasinya).
    chk('win rate = menang / (menang + kalah)',
      ring.json?.win_rate?.pct,
      Math.round(Number(ring.json?.menang?.jml) / Number(ring.json?.win_rate?.penyebut) * 10000) / 100);
    chk('yang terbuka dilaporkan terpisah', ring.json?.terbuka?.nilai > 0, true);
    chk('alasan kalah direkap', Object.keys(ring.json?.kalah?.per_alasan || {}).includes('HARGA'), true);
    chk('keterandalan nilai dinyatakan',
      String(ring.json?.keterandalan?.catatan || '').length > 20, true);

    console.log('\n9. Rute literal tidak tertelan /:id');
    chk('/ringkasan/pipeline bukan dibaca sebagai id',
      (await call('GET', '/opportunities/ringkasan/pipeline', undefined, master)).json?.win_rate !== undefined, true);

    console.log('\n10. Validasi & auth');
    chk('judul kosong ditolak',
      (await call('POST', '/opportunities', { title: '  ' }, master)).json?.code, 'JUDUL_WAJIB');
    chk('probability di luar rentang ditolak',
      (await call('POST', '/opportunities', { title: 'x', probability: 150 }, master)).json?.code,
      'PROBABILITY_DI_LUAR_RENTANG');
    chk('filter stage ngawur ditolak',
      (await call('GET', '/opportunities?stage=entah', undefined, master)).json?.code, 'STAGE_TIDAK_DIKENAL');
    chk('tanpa token 401', (await call('GET', '/opportunities')).status, 401);
    chk('opportunity tidak ada 404',
      (await call('GET', '/opportunities/99999999', undefined, master)).status, 404);

    console.log('\n11. Layar ada, dan tidak menyamakan taksiran dengan penawaran');
    const { readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const fe = join(__dirname, '..', '..', 'frontend', 'src');
    chk('layar register ada', existsSync(join(fe, 'views', 'OpportunityRegister.vue')), true);
    const layar = readFileSync(join(fe, 'views', 'OpportunityRegister.vue'), 'utf8');
    chk('memanggil ringkasan pipeline', layar.includes('/opportunities/ringkasan/pipeline'), true);
    // Dua hal yang paling mudah membuat angkanya menyesatkan kalau disamakan.
    chk('taksiran dibedakan dari nilai penawaran', layar.includes('nilai_sumber'), true);
    chk('penyebut win rate dijelaskan di layar', layar.includes('win_rate.catatan'), true);
    chk('win rate null tidak ditulis 0%', layar.includes("win_rate.pct === null ? '—'"), true);
    // Kalah wajib beralasan — ditanyakan di layar, bukan dibiarkan server tolak.
    chk('alasan kalah ditanyakan di layar', layar.includes('lost_reason_code'), true);
    const router = readFileSync(join(fe, 'router', 'index.ts'), 'utf8');
    chk('route terdaftar', router.includes("path: '/opportunities'"), true);
    const menu = readFileSync(join(fe, 'components', 'Layout.vue'), 'utf8');
    chk('menu terdaftar', menu.includes("route: '/opportunities'"), true);
    // permKey harus nama yang SUDAH ada, bukan karangan baru.
    chk('permKey memakai nama yang sudah ada',
      /id: 'opportunities'[^}]*permKey: 'projects\.leads'/.test(menu), true);

  } finally {
    console.log('\n12. Bersih-bersih');
    for (const id of ids) await dbRun('DELETE FROM opportunities WHERE id = ?', [id]);
    const disapu = await sapuFixture(stamp, [`OP.${stamp}`]);
    chk('fixture proposal tersapu', disapu.proposal >= 1, true);
    const sisa: any = await dbGet('SELECT COUNT(*) n FROM opportunities WHERE title LIKE ?', [`%${stamp}%`]);
    chk('opportunity fixture tersapu', Number(sisa?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM opportunity_stage_history h
       LEFT JOIN opportunities o ON o.id = h.opportunity_id WHERE o.id IS NULL`);
    chk('nol riwayat tanpa opportunity (FK cascade)', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
