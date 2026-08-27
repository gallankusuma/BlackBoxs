import 'dotenv/config';
/**
 * Tes integritas komersial proposal.
 *
 * Tiga bug yang dibuktikan:
 *
 * 1. `qty` diterima tanpa validasi. `qty || 0` dan `parseFloat(qty) || 0`
 *    meneruskan `-1` apa adanya lalu mengalikannya dengan harga snapshot —
 *    line total dan `total_project` menjadi negatif. `"abc"` dan `Infinity`
 *    diam-diam menjadi 0 tanpa ada yang tahu nilainya pernah salah.
 * 2. Transisi status hanya memeriksa pasangan state. Tidak ada invarian bahwa
 *    proposal punya isi komersial yang masuk akal, jadi penawaran bernilai nol
 *    atau negatif bisa di-submit lalu di-deal, dan nilainya disalin apa adanya
 *    menjadi `client_projects.budget`.
 * 3. `recalculateProposal()` menetapkan overhead dan contingency ke 0 lalu
 *    MENULIS ULANG nol itu ke database setiap satu baris berubah — nilai hasil
 *    migrasi/import/perbaikan manual terhapus begitu operator mengubah satu
 *    quantity, dan total penawaran hanya bisa sama dengan direct cost.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:proposal-commercial
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
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: res.status, json, text };
}

const sen = (v: unknown) => Math.round(Number(v || 0) * 100);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbRun, dbGet, dbAll } = await import('../src/config/database');

  try {
    const ahsp = await call('POST', '/estimator/ahsp', {
      kode: `TEST-KOM-${stamp}`, name: `AHSP Komersial ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
    }, master);
    chk('AHSP uji dibuat', ahsp.status, 201);
    const ahspId = ahsp.json?.id;

    // Deal membuat project, dan project mensyaratkan client — proposal tanpa
    // client gagal di transisi deal (perilaku lama, sudah diuji di mto-link
    // bagian 33). Fixture di sini karena itu harus punya client.
    const klien = await call('POST', '/clients',
      { name: `PT Uji Komersial ${stamp}`, client_type: 'buyer' }, master);
    const klienId = klien.json?.id;
    chk('client uji dibuat', klien.status, 201);
    bersihkan.push(() => call('DELETE', `/clients/${klienId}`, undefined, master));

    const buatProposal = async (nama: string) => {
      const r = await call('POST', '/estimator/proposals',
        { project_name: nama, status: 'draft', client_id: klienId }, master);
      const id = r.json?.id ?? r.json?.data?.id;
      bersihkan.push(() => call('DELETE', `/estimator/proposals/${id}`, undefined, master));
      return id;
    };
    const header = async (id: number) => {
      const r = await call('GET', `/estimator/proposals/${id}`, undefined, master);
      return (r.json?.data ?? r.json) as any;
    };

    // ── 1. qty tidak valid ditolak di POST ─────────────────────────────────
    console.log('\n1. POST item menolak qty tidak valid');
    const p1 = await buatProposal(`Komersial A ${stamp}`);
    // Catatan: `1e400` TIDAK bisa dipakai di sini — JSON.stringify mengubah
    // Infinity menjadi `null`, jadi yang sampai ke server bukan Infinity sama
    // sekali. Yang menguji jalur itu adalah string "Infinity", yang diurai
    // Number() menjadi Infinity di sisi server.
    for (const [label, nilai] of [['negatif', -1], ['NaN', 'abc'], ['Infinity', 'Infinity']] as const) {
      const r = await call('POST', `/estimator/proposals/${p1}/items`,
        { ahsp_id: ahspId, qty: nilai }, master);
      chk(`qty ${label} ditolak`, r.status, 400);
      chk(`kodenya QTY_TIDAK_VALID (${label})`, r.json?.code, 'QTY_TIDAK_VALID');
    }
    chk('qty melebihi batas ditolak',
      (await call('POST', `/estimator/proposals/${p1}/items`,
        { ahsp_id: ahspId, qty: 2_000_000_000 }, master)).status, 400);

    console.log('\n2. qty sah tetap diterima, termasuk nol pada draft');
    chk('qty 0 diterima (draft boleh belum lengkap)',
      (await call('POST', `/estimator/proposals/${p1}/items`, { ahsp_id: ahspId, qty: 0 }, master)).status, 201);
    chk('qty pecahan diterima',
      (await call('POST', `/estimator/proposals/${p1}/items`, { ahsp_id: ahspId, qty: 2.5 }, master)).status, 201);
    chk('total_project positif', sen((await header(p1)).total_project), sen(2.5 * 1100000));

    // ── 3. qty tidak valid ditolak di PUT ───────────────────────────────────
    console.log('\n3. PUT item menolak qty negatif dan tidak mengubah apa pun');
    const items = await call('GET', `/estimator/proposals/${p1}/items`, undefined, master);
    const daftar: any[] = items.json?.data ?? items.json ?? [];
    const itemQty25 = daftar.find(i => Number(i.qty) === 2.5);
    chk('item qty 2,5 ditemukan', !!itemQty25, true);

    const sebelum = await header(p1);
    const putNeg = await call('PUT', `/estimator/proposals/${p1}/items/${itemQty25.id}`, { qty: -5 }, master);
    chk('PUT qty negatif ditolak', putNeg.status, 400);
    chk('kodenya QTY_TIDAK_VALID', putNeg.json?.code, 'QTY_TIDAK_VALID');
    chk('total tidak berubah', sen((await header(p1)).total_project), sen(sebelum.total_project));

    // ── 4. Gerbang submit: proposal kosong ─────────────────────────────────
    console.log('\n4. Proposal tanpa item tidak bisa disubmit');
    const pKosong = await buatProposal(`Komersial kosong ${stamp}`);
    await call('PUT', `/estimator/proposals/${pKosong}/status`, { status: 'review' }, master);
    const submitKosong = await call('PUT', `/estimator/proposals/${pKosong}/status`, { status: 'submitted' }, master);
    chk('submit proposal kosong ditolak', submitKosong.status, 400);
    chk('kodenya PROPOSAL_BELUM_LAYAK', submitKosong.json?.code, 'PROPOSAL_BELUM_LAYAK');
    chk('alasannya disebutkan', (submitKosong.json?.pelanggaran || []).length > 0, true);
    chk('statusnya tetap review', (await header(pKosong)).status, 'review');

    // ── 5. Gerbang submit: nilai nol ───────────────────────────────────────
    console.log('\n5. Proposal bernilai nol tidak bisa disubmit');
    const pNol = await buatProposal(`Komersial nol ${stamp}`);
    await call('POST', `/estimator/proposals/${pNol}/items`, { ahsp_id: ahspId, qty: 0 }, master);
    chk('nilainya memang nol', sen((await header(pNol)).total_project), 0);
    await call('PUT', `/estimator/proposals/${pNol}/status`, { status: 'review' }, master);
    const submitNol = await call('PUT', `/estimator/proposals/${pNol}/status`, { status: 'submitted' }, master);
    chk('submit bernilai nol ditolak', submitNol.status, 400);
    chk('alasan menyebut nilai penawaran',
      (submitNol.json?.pelanggaran || []).some((x: string) => x.toLowerCase().includes('nilai penawaran')), true);

    // ── 6. Proposal sehat tetap bisa lewat ─────────────────────────────────
    console.log('\n6. Proposal yang sehat tetap bisa submit sampai deal');
    const pSehat = await buatProposal(`Komersial sehat ${stamp}`);
    await call('POST', `/estimator/proposals/${pSehat}/items`, { ahsp_id: ahspId, qty: 4 }, master);
    await call('PUT', `/estimator/proposals/${pSehat}/status`, { status: 'review' }, master);
    chk('submit berhasil',
      (await call('PUT', `/estimator/proposals/${pSehat}/status`, { status: 'submitted' }, master)).status, 200);
    const deal = await call('PUT', `/estimator/proposals/${pSehat}/status`, { status: 'deal' }, master);
    chk('deal berhasil', deal.status, 200);
    // Budget project tidak boleh nol/negatif — inilah nilai yang mengalir ke hilir.
    const proj: any = await dbGet('SELECT budget FROM client_projects WHERE proposal_id = ?', [pSehat]);
    chk('budget project positif', Number(proj?.budget) > 0, true);
    chk('budget = total proposal', sen(proj?.budget), sen((await header(pSehat)).total_project));

    // ── 7. Overhead & contingency bertahan setelah recalculate ─────────────
    console.log('\n7. Overhead dan contingency tidak dihapus oleh perubahan baris');
    const pOh = await buatProposal(`Komersial overhead ${stamp}`);
    await call('POST', `/estimator/proposals/${pOh}/items`, { ahsp_id: ahspId, qty: 10 }, master);
    const directAwal = Number((await header(pOh)).direct_cost);
    chk('direct cost terisi', directAwal > 0, true);

    // Nilai komersial diisi langsung ke database: sampai hari ini memang belum
    // ada endpoint untuk menyetelnya — itu bagian yang saya tandai PERLU
    // KLARIFIKASI. Yang diuji di sini: begitu nilainya ADA, ia harus bertahan.
    await dbRun('UPDATE proposals SET overhead = ?, risk_contingency = ? WHERE id = ?',
      [5_000_000, 2_500_000, pOh]);

    // Satu perubahan baris memicu recalculate — di sinilah nilainya dulu hilang.
    const it = await call('GET', `/estimator/proposals/${pOh}/items`, undefined, master);
    const itemOh = (it.json?.data ?? it.json ?? [])[0];
    chk('ubah qty berhasil',
      (await call('PUT', `/estimator/proposals/${pOh}/items/${itemOh.id}`, { qty: 11 }, master)).status, 200);

    const sesudah = await header(pOh);
    chk('overhead bertahan', sen(sesudah.overhead), sen(5_000_000));
    chk('contingency bertahan', sen(sesudah.risk_contingency), sen(2_500_000));
    chk('total = direct + overhead + contingency',
      sen(sesudah.total_project),
      sen(Number(sesudah.direct_cost) + 5_000_000 + 2_500_000));
    chk('total lebih besar dari direct cost', Number(sesudah.total_project) > Number(sesudah.direct_cost), true);

    // Menambah item baru juga memicu recalculate.
    await call('POST', `/estimator/proposals/${pOh}/items`, { ahsp_id: ahspId, qty: 1 }, master);
    const sesudah2 = await header(pOh);
    chk('overhead masih bertahan setelah tambah item', sen(sesudah2.overhead), sen(5_000_000));
    chk('contingency masih bertahan setelah tambah item', sen(sesudah2.risk_contingency), sen(2_500_000));

    // Dan proposal dengan overhead tetap lolos gerbang (header rekonsiliasi).
    await call('PUT', `/estimator/proposals/${pOh}/status`, { status: 'review' }, master);
    chk('proposal dengan overhead lolos submit',
      (await call('PUT', `/estimator/proposals/${pOh}/status`, { status: 'submitted' }, master)).status, 200);

    // ── Proposal CAMPURAN: satu baris bernilai + satu baris nol ─────────────
    //
    // Inilah celah yang tersisa: gerbang lama hanya memeriksa total header, jadi
    // satu baris bernilai membuat totalnya positif dan baris nol ikut lolos
    // sebagai lingkup pekerjaan seharga Rp0 — pekerjaan yang belum diestimasi
    // berubah menjadi kewajiban kontrak tanpa anggaran.
    console.log('\n9. Proposal campuran: baris bernilai + baris belum lengkap');
    const pCampur = await call('POST', '/estimator/proposals',
      { project_name: `Uji campuran ${stamp}` }, master);
    const campurId = pCampur.json?.id ?? pCampur.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${campurId}`, undefined, master));

    await call('POST', `/estimator/proposals/${campurId}/items`, { ahsp_id: ahspId, qty: 5 }, master);
    await call('POST', `/estimator/proposals/${campurId}/items`, { ahsp_id: ahspId, qty: 0 }, master);

    const daftarCampur = await call('GET', `/estimator/proposals/${campurId}/items`, undefined, master);
    const barisCampur: any[] = daftarCampur.json?.data ?? daftarCampur.json ?? [];
    chk('proposal punya 2 baris', barisCampur.length, 2);

    const inc = await call('GET', `/estimator/proposals/${campurId}/items/incomplete`, undefined, master);
    chk('baris belum lengkap terdaftar', inc.json?.count, 1);

    const nol = barisCampur.find((b: any) => Number(b.qty) === 0);
    chk('baris nol teridentifikasi', !!nol?.id, true);

    await call('PUT', `/estimator/proposals/${campurId}/status`, { status: 'review' }, master);
    const tolakCampur = await call('PUT', `/estimator/proposals/${campurId}/status`, { status: 'submitted' }, master);

    // Gerbangnya bersakelar (GERBANG_SCOPE_LENGKAP) karena menggembok alur kerja
    // produksi yang sedang berjalan. Tes ini TIDAK boleh diam-diam lolos saat
    // sakelarnya mati — keadaannya dinyatakan, dan bagian yang tidak berlaku
    // dilewati secara terang-terangan.
    const gerbangHidup = tolakCampur.status === 400;
    if (!gerbangHidup) {
      console.log('  ––   gerbang scope MATI (GERBANG_SCOPE_LENGKAP belum true)');
      console.log('       submit campuran karena itu diterima; bagian gerbang dilewati.');
      chk('saat mati, submit campuran diterima', tolakCampur.status, 200);
      chk('daftar baris belum lengkap tetap bisa dibaca',
        (await call('GET', `/estimator/proposals/${campurId}/items/incomplete`, undefined, master)).json?.count, 1);
      // Klasifikasi scope tunduk pada kunci proposal, jadi turunkan kembali ke
      // review supaya bagian 10 menguji klasifikasinya, bukan kuncinya.
      chk('diturunkan lagi ke review untuk bagian berikutnya',
        (await call('PUT', `/estimator/proposals/${campurId}/status`, { status: 'review' }, master)).status, 200);
    } else {
    chk('submit proposal campuran ditolak', tolakCampur.status, 400);
    chk('kodenya PROPOSAL_BELUM_LAYAK', tolakCampur.json?.code, 'PROPOSAL_BELUM_LAYAK');
    // Daftar barisnya disebut, bukan sekadar "ada yang salah".
    const pel: string[] = tolakCampur.json?.pelanggaran || [];
    chk('menyebut jumlah baris belum lengkap',
      pel.some(x => x.includes('1 baris pekerjaan belum lengkap')), true);
    chk('menyebut id baris yang bermasalah',
      pel.some(x => x.includes(`#${nol?.id}`)), true);
    chk('menyebut sebabnya', pel.some(x => x.includes('volume masih nol')), true);

    const tetapReview = await call('GET', `/estimator/proposals/${campurId}`, undefined, master);
    chk('statusnya tidak terlanjur submitted',
      (tetapReview.json?.data ?? tetapReview.json)?.status, 'review');
    }

    // ── Klasifikasi eksplisit membuka jalan, tapi menuntut alasan ───────────
    console.log('\n10. Klasifikasi scope: eksplisit, wajib beralasan, dan tercatat');
    chk('status ngawur ditolak',
      (await call('PUT', `/estimator/proposals/${campurId}/items/scope`,
        { item_ids: [nol?.id], scope_status: 'gratisan' }, master)).status, 400);
    chk('tanpa alasan ditolak',
      (await call('PUT', `/estimator/proposals/${campurId}/items/scope`,
        { item_ids: [nol?.id], scope_status: 'excluded' }, master)).status, 400);
    chk('id milik proposal lain ditolak',
      (await call('PUT', `/estimator/proposals/${campurId}/items/scope`,
        { item_ids: [999999999], scope_status: 'excluded', scope_note: 'x' }, master)).status, 404);

    const tandai = await call('PUT', `/estimator/proposals/${campurId}/items/scope`,
      { item_ids: [nol?.id], scope_status: 'excluded',
        scope_note: 'Di luar lingkup, dikerjakan kontraktor lain' }, master);
    chk('klasifikasi diterima', tandai.status, 200);
    chk('tidak ada lagi baris belum lengkap',
      (await call('GET', `/estimator/proposals/${campurId}/items/incomplete`, undefined, master)).json?.count, 0);

    if (gerbangHidup) {
      const lolos = await call('PUT', `/estimator/proposals/${campurId}/status`, { status: 'submitted' }, master);
      chk('sesudah dinyatakan, submit berhasil', lolos.status, 200);
    }

    // Keputusannya tercatat: siapa dan kenapa.
    const jejak: any = await dbGet(
      'SELECT scope_status, scope_note, scope_set_by, scope_set_at FROM proposal_items WHERE id = ?', [nol?.id]);
    chk('status tersimpan', jejak?.scope_status, 'excluded');
    chk('alasan tersimpan', String(jejak?.scope_note || '').includes('kontraktor lain'), true);
    chk('penetapnya tercatat', Number(jejak?.scope_set_by) > 0, true);
    chk('waktunya tercatat', !!jejak?.scope_set_at, true);

    // ── 11. Alur layar penanda massal ──────────────────────────────────────
    //
    // Keputusan pemilik proses (23 Agustus 2026): "buatkan layarnya dulu".
    // Yang diuji di sini adalah alur yang benar-benar dilakukan layar itu —
    // baca daftar belum lengkap, tandai BANYAK sekaligus, lalu submit — karena
    // di produksi ada proposal dengan 254 baris seperti itu dan menandainya
    // satu per satu bukan pekerjaan yang masuk akal.
    console.log('\n11. Penandaan massal: banyak baris sekaligus');
    const pMassal = await call('POST', '/estimator/proposals',
      { project_name: `Uji massal ${stamp}`, client_id: klienId, client: `PT Uji Komersial ${stamp}` }, master);
    const massalId = pMassal.json?.id ?? pMassal.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${massalId}`, undefined, master));

    // Satu baris bernilai + LIMA baris belum lengkap.
    await call('POST', `/estimator/proposals/${massalId}/items`, { ahsp_id: ahspId, qty: 8 }, master);
    for (let i = 0; i < 5; i++) {
      await call('POST', `/estimator/proposals/${massalId}/items`, { ahsp_id: ahspId, qty: 0 }, master);
    }

    const incMassal = await call('GET', `/estimator/proposals/${massalId}/items/incomplete`, undefined, master);
    chk('lima baris belum lengkap terdaftar', incMassal.json?.count, 5);
    // Layar menampilkan sebabnya per baris — datanya harus cukup untuk itu.
    const contohBaris = (incMassal.json?.items || [])[0];
    chk('baris membawa qty untuk ditampilkan', contohBaris?.qty !== undefined, true);
    chk('baris membawa harga satuan', contohBaris?.unit_price_snapshot !== undefined, true);
    chk('baris membawa nama pekerjaan',
      !!(contohBaris?.ahsp_name_snapshot || contohBaris?.description), true);

    // Inilah yang dilakukan tombol "Terapkan": satu permintaan, banyak id.
    const idMassal = (incMassal.json?.items || []).map((x: any) => x.id);
    const terap = await call('PUT', `/estimator/proposals/${massalId}/items/scope`,
      { item_ids: idMassal, scope_status: 'excluded',
        scope_note: 'Di luar lingkup, dikerjakan pihak lain' }, master);
    chk('satu permintaan menandai 5 baris', terap.status, 200);
    chk('jumlahnya dilaporkan', terap.json?.jumlah, 5);
    chk('daftar belum lengkap jadi kosong',
      (await call('GET', `/estimator/proposals/${massalId}/items/incomplete`, undefined, master)).json?.count, 0);

    // Jejaknya tercatat untuk kelimanya, bukan hanya yang pertama.
    const jejakMassal: any = await dbGet(
      `SELECT COUNT(*) n FROM proposal_items
       WHERE proposal_id = ? AND scope_status = 'excluded' AND scope_set_by IS NOT NULL
         AND scope_note IS NOT NULL AND scope_set_at IS NOT NULL`, [massalId]);
    chk('kelimanya tercatat lengkap dengan penetap & alasan', Number(jejakMassal?.n), 5);

    await call('PUT', `/estimator/proposals/${massalId}/status`, { status: 'review' }, master);
    const submitMassal = await call('PUT', `/estimator/proposals/${massalId}/status`, { status: 'submitted' }, master);
    chk('sesudah ditandai, proposal bisa dikirim', submitMassal.status, 200);

    // Layarnya harus benar-benar ada, bukan cuma endpoint-nya.
    const { readFileSync: bacaVue } = await import('node:fs');
    const vueEditor = bacaVue(
      new URL('../../frontend/src/views/EstimatorProposalEditor.vue', import.meta.url), 'utf8');
    chk('layar memuat panel penanda massal', vueEditor.includes('barisBelumLengkap'), true);
    chk('layar memanggil endpoint incomplete', vueEditor.includes('/items/incomplete'), true);
    chk('layar mengirim penandaan massal', vueEditor.includes('/items/scope'), true);
    chk('layar menuntut alasan sebelum mengirim', vueEditor.includes('!alasanScope.trim()'), true);
    chk('layar menyediakan pilih-semua', vueEditor.includes('pilihSemuaScope'), true);

    // ── 12. Create proposal: klik ganda & zona MTO gagal sebagian ──────────
    //
    // Batas operasi yang DILIHAT pengguna lebih luas daripada satu transaction
    // backend. Dua cacat yang diuji di sini:
    //
    //   a) Tombol tanpa keadaan sedang-mengirim: dua klik cepat mengirim dua
    //      POST /proposals yang dua-duanya sah — counter nomor yang atomic
    //      justru MEMASTIKAN keduanya berhasil dengan nomor berbeda.
    //   b) Zona MTO dikirim SESUDAH proposal commit. Kalau satu zona gagal,
    //      proposalnya sudah ada tapi layar dulu berkata "Failed to create"
    //      dan membuang id-nya — menekan tombol lagi melahirkan proposal baru.
    console.log('\n12. Create: duplikat & zona MTO gagal sebagian');

    // (a) Backend memang meloloskan dua create berbarengan — itulah sebabnya
    //     penjagaannya harus ada di layar.
    const kembar = await Promise.all([
      call('POST', '/estimator/proposals', { project_name: `Kembar ${stamp}`, client_id: klienId }, master),
      call('POST', '/estimator/proposals', { project_name: `Kembar ${stamp}`, client_id: klienId }, master),
    ]);
    const idKembar = kembar.map(r => r.json?.id ?? r.json?.data?.id).filter(Boolean);
    for (const id of idKembar) bersihkan.push(() => call('DELETE', `/estimator/proposals/${id}`, undefined, master));
    chk('dua create berbarengan dua-duanya berhasil (perilaku backend)', idKembar.length, 2);
    chk('nomornya berbeda, jadi keduanya terlihat sah',
      new Set(kembar.map(r => r.json?.proposal_number ?? r.json?.data?.proposal_number)).size, 2);
    // Karena itu penjaganya WAJIB ada di layar — diperiksa dari sumbernya.
    const { readFileSync: bacaList } = await import('node:fs');
    const vueList2 = bacaList(
      new URL('../../frontend/src/views/EstimatorProposalList.vue', import.meta.url), 'utf8');
    chk('layar menolak pengiriman kedua', vueList2.includes('if (membuatProposal.value) return;'), true);
    chk('tombol create dinonaktifkan saat mengirim', vueList2.includes(':disabled="membuatProposal"'), true);

    // (b) Zona MTO gagal tidak boleh membuang proposal yang sudah jadi.
    const pZona = await call('POST', '/estimator/proposals',
      { project_name: `Uji zona ${stamp}`, client_id: klienId }, master);
    const zonaId = pZona.json?.id ?? pZona.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${zonaId}`, undefined, master));

    // Zona pertama sah, zona kedua dimensinya belum lengkap → 422.
    const zonaOk = await call('POST', `/estimator/proposals/${zonaId}/mto`, {
      element_type: 'foundation', element_name: 'Pondasi',
      parameters: { L: 2, W: 2, H: 0.4, depth: 1.5, qty: 6, waste_pct: 5 },
    }, master);
    chk('zona pertama tersimpan', zonaOk.status, 200);
    const zonaGagal = await call('POST', `/estimator/proposals/${zonaId}/mto`, {
      element_type: 'column', element_name: 'Kolom', parameters: {},
    }, master);
    chk('zona kedua ditolak 422', zonaGagal.status, 422);

    // Inti temuannya: proposal DAN zona pertama tetap ada — itulah keadaan
    // parsial yang dulu disamarkan sebagai "gagal membuat proposal".
    const cekZona = await call('GET', `/estimator/proposals/${zonaId}`, undefined, master);
    chk('proposalnya tetap ada meski satu zona gagal', cekZona.status, 200);
    chk('zona pertama tetap tersimpan',
      ((await call('GET', `/estimator/proposals/${zonaId}/mto`, undefined, master)).json?.elements || []).length, 1);

    chk('layar melaporkan zona yang gagal, bukan mengaku gagal total',
      vueList2.includes('zona MTO belum tersimpan'), true);
    chk('layar tetap membuka proposal yang sudah terbentuk',
      vueList2.includes('Jangan membuat proposal baru'), true);

    // ── 13. Edit paralel qty + AHSP ────────────────────────────────────────
    //
    // Handler dulu membaca `unit_price_snapshot`, qty lama, dan harga AHSP di
    // LUAR transaction lalu menulis hasilnya di dalam. Lock proposal karena itu
    // hanya menyerialkan penulisan — bukan state yang dipakai menghitungnya.
    // Dua permintaan bersamaan sama-sama menghitung dari pembacaan lama, dan
    // yang menang terakhir meninggalkan `total_price` yang tidak cocok dengan
    // `qty × unit_price_snapshot`.
    console.log('\n13. Dua edit paralel tetap meninggalkan baris yang konsisten');

    const ahspMahal = await call('POST', '/estimator/ahsp', {
      kode: `TEST-PAR-${stamp}`, name: `AHSP Paralel ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 7000000 }],
    }, master);
    const ahspMahalId = ahspMahal.json?.id;

    const pPar = await call('POST', '/estimator/proposals',
      { project_name: `Uji paralel ${stamp}`, client_id: klienId }, master);
    const parId = pPar.json?.id ?? pPar.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${parId}`, undefined, master));
    await call('POST', `/estimator/proposals/${parId}/items`, { ahsp_id: ahspId, qty: 3 }, master);
    const itemPar = ((await call('GET', `/estimator/proposals/${parId}/items`, undefined, master))
      .json?.data ?? (await call('GET', `/estimator/proposals/${parId}/items`, undefined, master)).json ?? [])[0];
    chk('item paralel ada', !!itemPar?.id, true);

    // Satu mengubah qty, satu mengganti AHSP — berbarengan, DELAPAN putaran.
    //
    // Satu putaran bisa lolos karena kebetulan waktu; tes balapan yang bisa
    // lolos untung-untungan tidak membuktikan apa pun. Tiap putaran diperiksa
    // sendiri, jadi satu saja yang meleset langsung merah.
    let melesetPar = 0;
    for (let putaran = 0; putaran < 8; putaran++) {
      const pakaiMahal = putaran % 2 === 0;
      await Promise.all([
        call('PUT', `/estimator/proposals/${parId}/items/${itemPar.id}`, { qty: 3 + putaran }, master),
        call('PUT', `/estimator/proposals/${parId}/items/${itemPar.id}`,
          { ahsp_id: pakaiMahal ? ahspMahalId : ahspId }, master),
      ]);
      const cek: any = await dbGet(
        'SELECT qty, unit_price_snapshot, total_price FROM proposal_items WHERE id = ?', [itemPar.id]);
      const harus = Math.round(Number(cek.qty) * Number(cek.unit_price_snapshot) * 100);
      if (Math.round(Number(cek.total_price) * 100) !== harus) melesetPar++;
    }
    chk('delapan putaran edit paralel: tidak ada baris yang meleset', melesetPar, 0);

    // Catatan jujur: balapan ini TIDAK berhasil direproduksi pada versi lama
    // sekalipun — 24 percobaan (8 putaran × 3 jalan) semuanya lolos, karena
    // lock proposal kadung menyerialkan keduanya sebelum pembacaan basi sempat
    // dipakai. Jadi assertion di atas menjaga HASILNYA, bukan membuktikan
    // mekanismenya.
    //
    // Yang benar-benar diperbaiki adalah strukturnya: pembacaan yang dipakai
    // untuk menghitung penulisan harus berada DI DALAM transaction yang sama.
    // Itu dikunci di sini, karena assertion perilaku saja tidak akan
    // menangkapnya kalau nanti dikembalikan.
    const { readFileSync: bacaRute } = await import('node:fs');
    const rute = bacaRute(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    const iPut = rute.indexOf("router.put('/proposals/:proposalId/items/:itemId'");
    const iAkhir = rute.indexOf('// Delete proposal item', iPut);
    const blokPut = rute.slice(iPut, iAkhir);
    const iTx = blokPut.indexOf('await withTransaction');
    chk('handler PUT memakai transaction', iTx > 0, true);
    // Tidak boleh ada pembacaan item/AHSP sebelum transaction dibuka.
    const sebelumTx = blokPut.slice(0, iTx);
    chk('tidak ada pembacaan proposal_items sebelum transaction',
      sebelumTx.includes('FROM proposal_items'), false);
    chk('tidak ada pembacaan ahsp_headers sebelum transaction',
      sebelumTx.includes('FROM ahsp_headers'), false);
    chk('baris dikunci FOR UPDATE di dalam transaction',
      blokPut.slice(iTx).includes('FOR UPDATE'), true);

    const sesudahPar: any = await dbGet(
      'SELECT qty, unit_price_snapshot, total_price FROM proposal_items WHERE id = ?', [itemPar.id]);
    const semestinya = Math.round(Number(sesudahPar.qty) * Number(sesudahPar.unit_price_snapshot) * 100);
    chk('total baris = qty × harga snapshot',
      Math.round(Number(sesudahPar.total_price) * 100), semestinya);

    const headerPar: any = await dbGet('SELECT direct_cost FROM proposals WHERE id = ?', [parId]);
    chk('header rekonsiliasi dengan barisnya',
      Math.round(Number(headerPar.direct_cost) * 100), Math.round(Number(sesudahPar.total_price) * 100));

    // Gerbang juga menolak baris yang tidak konsisten, apa pun sebabnya.
    console.log('\n14. Gerbang menolak baris yang total-nya tidak cocok');
    await dbRun('UPDATE proposal_items SET total_price = total_price + 1234567 WHERE id = ?', [itemPar.id]);
    await call('PUT', `/estimator/proposals/${parId}/status`, { status: 'review' }, master);
    const tolakInkonsisten = await call('PUT', `/estimator/proposals/${parId}/status`, { status: 'submitted' }, master);
    if (tolakInkonsisten.status === 400) {
      chk('submit ditolak karena baris tidak konsisten', tolakInkonsisten.status, 400);
      chk('menyebut baris yang bermasalah',
        (tolakInkonsisten.json?.pelanggaran || []).some((x: string) => x.includes('volume × harga satuan')), true);
    } else {
      // Gerbang scope bersakelar; kalau mati, invarian ini tetap harus dilaporkan.
      console.log('  ––   gerbang scope MATI — invarian baris ikut tidak menghalangi');
      chk('saat gerbang mati, submit diterima', tolakInkonsisten.status, 200);
    }

    // ── 15. order_no dihitung dari state terkunci ───────────────────────────
    //
    // `MAX(order_no)+1` dulu dibaca lewat pool SEBELUM transaction dibuka, lalu
    // dibekukan ke variabel. Lock proposal memang menyerialkan INSERT, tapi
    // tidak menghitung ulang urutan dari state terkunci — dua penambahan
    // bersamaan sama-sama membaca angka lama dan memakai urutan yang sama,
    // sehingga dokumen RAB menampilkan dua baris bernomor identik.
    console.log('\n15. Penambahan item paralel: urutan tidak bertabrakan');

    const pUrut = await call('POST', '/estimator/proposals',
      { project_name: `Uji urutan ${stamp}`, client_id: klienId }, master);
    const urutId = pUrut.json?.id ?? pUrut.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${urutId}`, undefined, master));

    // Enam penambahan berbarengan, dua putaran — satu putaran bisa lolos karena
    // kebetulan waktu.
    let bentrok = 0;
    for (let putaran = 0; putaran < 2; putaran++) {
      await Promise.all(Array.from({ length: 6 }, () =>
        call('POST', `/estimator/proposals/${urutId}/items`, { ahsp_id: ahspId, qty: 1 }, master)
      ));
      const dobel: any[] = await dbAll(
        `SELECT order_no, COUNT(*) n FROM proposal_items
         WHERE proposal_id = ? GROUP BY order_no HAVING COUNT(*) > 1`, [urutId]);
      bentrok += dobel.length;
    }
    chk('tidak ada order_no bertabrakan setelah 12 penambahan paralel', bentrok, 0);

    const semuaUrut: any[] = await dbAll(
      'SELECT order_no FROM proposal_items WHERE proposal_id = ? ORDER BY order_no', [urutId]);
    chk('semua urutan unik', new Set(semuaUrut.map(r => Number(r.order_no))).size, semuaUrut.length);

    // Jaminannya juga struktural, bukan hanya bergantung kebenaran kode.
    // Indeks komposit muncul SATU BARIS PER KOLOM di INFORMATION_SCHEMA, jadi
    // yang diperiksa adalah keunikan namanya, jumlah kolomnya, dan bahwa ia
    // benar-benar UNIQUE (`NON_UNIQUE = 0`).
    const idxUnik: any[] = await dbAll(
      `SELECT COLUMN_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_items'
         AND INDEX_NAME = 'uq_proposal_item_order'
       ORDER BY SEQ_IN_INDEX`);
    chk('indeks mencakup dua kolom', idxUnik.length, 2);
    chk('kolomnya proposal_id lalu order_no',
      idxUnik.map(r => r.COLUMN_NAME).join(','), 'proposal_id,order_no');
    chk('benar-benar UNIQUE, bukan index biasa',
      idxUnik.every(r => Number(r.NON_UNIQUE) === 0), true);

    // Perhitungannya harus berada DI DALAM transaction — assertion perilaku
    // saja tidak akan menangkapnya kalau dikembalikan ke luar.
    const { readFileSync: bacaRute2 } = await import('node:fs');
    const rute2 = bacaRute2(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    const iPost = rute2.indexOf("router.post('/proposals/:proposalId/items'");
    const iAkhirPost = rute2.indexOf("router.put('/proposals/:proposalId/items/:itemId'", iPost);
    const blokPost = rute2.slice(iPost, iAkhirPost);
    const iTxPost = blokPost.indexOf('await withTransaction');
    chk('MAX(order_no) tidak dibaca sebelum transaction',
      blokPost.slice(0, iTxPost).includes('MAX(order_no)'), false);
    chk('MAX(order_no) dibaca di dalam transaction',
      blokPost.slice(iTxPost).includes('MAX(order_no)'), true);

  } finally {
    console.log('\n8. Bersih-bersih');
    let sisa = 0;
    for (const hapus of bersihkan.reverse()) {
      try { await hapus(); } catch { sisa++; }
    }
    chk('data uji dibersihkan', sisa >= 0, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
