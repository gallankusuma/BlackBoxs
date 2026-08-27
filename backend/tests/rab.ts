import 'dotenv/config';
/**
 * Tes rekonsiliasi angka RAB.
 *
 * Bug yang dibuktikan: subtotal sub-disiplin, total disiplin, dan grand total
 * pada `GET /estimator/proposals/:id/rab` dihitung dengan `+=` langsung atas
 * `total_price`. Pool MySQL tidak mengaktifkan `decimalNumbers`, jadi kolom
 * DECIMAL kembali sebagai **string** dan `+=` menggabungkan teks, bukan
 * menjumlahkan uang: 100 + 200 menghasilkan `"0100.00200.00"`.
 *
 * Tidak ada yang error. Angkanya hanya menjadi salah dan sangat besar, dan
 * ringkasan di header tetap terlihat benar karena membaca `total_project` —
 * sehingga selisihnya mudah lolos saat review penawaran.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:rab
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

/** Uang dibandingkan dalam sen supaya beda 0.001 tidak lolos sebagai "sama". */
const sen = (v: unknown) => Math.round(Number(v) * 100);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  try {
    // Butuh dua disiplin, dan salah satunya dua sub-disiplin, supaya kasus
    // "lebih dari satu item dalam satu kelompok" benar-benar terjadi.
    //
    // Disiplin dibuat langsung ke database: tidak ada endpoint untuk membuatnya
    // (hanya sub-disiplin yang punya POST), dan tes tidak boleh bergantung pada
    // isi master data mesin yang menjalankannya — database dev di sini memang
    // kosong sama sekali.
    const { dbRun, dbAll } = await import('../src/config/database');
    const buatDisiplin = async (kode: string, nama: string) => {
      const r: any = await dbRun(
        `INSERT INTO master_disciplines (code, name, order_no, is_active) VALUES (?, ?, ?, 1)`,
        [kode, nama, 900]
      );
      bersihkan.push(() => dbRun('DELETE FROM master_disciplines WHERE id = ?', [r.insertId]));
      return r.insertId as number;
    };
    const buatSub = async (disciplineId: number, kode: string, nama: string) => {
      const r: any = await dbRun(
        `INSERT INTO master_sub_disciplines (discipline_id, code, name, order_no, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [disciplineId, kode, nama, 900]
      );
      bersihkan.push(() => dbRun('DELETE FROM master_sub_disciplines WHERE id = ?', [r.insertId]));
      return r.insertId as number;
    };

    const d1 = { id: await buatDisiplin(`TD1-${stamp}`, `Disiplin Uji 1 ${stamp}`) };
    const d2 = { id: await buatDisiplin(`TD2-${stamp}`, `Disiplin Uji 2 ${stamp}`) };
    const sub1 = [
      { id: await buatSub(d1.id, `TS11-${stamp}`, `Sub 1.1 ${stamp}`) },
      { id: await buatSub(d1.id, `TS12-${stamp}`, `Sub 1.2 ${stamp}`) },
    ];
    const sub2 = [{ id: await buatSub(d2.id, `TS21-${stamp}`, `Sub 2.1 ${stamp}`) }];
    chk('fixture disiplin & sub-disiplin siap',
      (await dbAll('SELECT id FROM master_disciplines WHERE code LIKE ?', [`TD%-${stamp}`])).length, 2);

    // AHSP dengan harga yang sengaja menghasilkan pecahan dan angka besar.
    // harga_satuan = harga_langsung * 1.1 (overhead 10%), jadi nilainya dibaca
    // kembali dari server, bukan ditebak di sini.
    const buatAhsp = async (nama: string, harga: number) => {
      const r = await call('POST', '/estimator/ahsp', {
        kode: `TEST-RAB-${stamp}-${nama}`, name: `AHSP Uji ${nama} ${stamp}`, satuan: 'm3', status: 'active',
        items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan Uji',
                  resource_satuan: 'm3', koefisien: 1, resource_harga: harga }],
      }, master);
      chk(`AHSP ${nama} dibuat`, r.status, 201);
      return r.json?.id;
    };

    const ahspA = await buatAhsp('A', 1234.56);
    const ahspB = await buatAhsp('B', 99.99);
    const ahspC = await buatAhsp('C', 12345678.9);   // nilai besar

    const prop = await call('POST', '/estimator/proposals',
      { project_name: `Uji RAB ${stamp}`, status: 'draft' }, master);
    const propId = prop.json?.id ?? prop.json?.data?.id;
    chk('proposal dibuat', !!propId, true);
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${propId}`, undefined, master));

    // Dua item dalam SATU sub-disiplin — inilah bentuk yang memicu penggabungan
    // teks; satu item saja tidak akan memperlihatkan bugnya.
    const tambah = (ahsp_id: number, qty: number, discipline_id: number, sub_discipline_id: number) =>
      call('POST', `/estimator/proposals/${propId}/items`,
        { ahsp_id, qty, discipline_id, sub_discipline_id }, master);

    chk('item 1 (D1/S1) masuk', (await tambah(ahspA, 3, d1.id, sub1[0].id)).status, 201);
    chk('item 2 (D1/S1) masuk', (await tambah(ahspB, 7, d1.id, sub1[0].id)).status, 201);
    chk('item 3 (D1/S2) masuk', (await tambah(ahspA, 2, d1.id, sub1[1].id)).status, 201);
    chk('item 4 (D2/S1) masuk', (await tambah(ahspC, 9, d2.id, sub2[0].id)).status, 201);

    // ── Rekonsiliasi ────────────────────────────────────────────────────────
    console.log('\n1. Angka RAB berupa bilangan, bukan teks');
    const rab = await call('GET', `/estimator/proposals/${propId}/rab`, undefined, master);
    chk('RAB terbaca', rab.status, 200);
    const sections: any[] = rab.json?.sections ?? [];
    chk('ada 2 disiplin', sections.length, 2);

    const semuaSub = sections.flatMap((s: any) => s.subDisciplines || []);
    const semuaItem = semuaSub.flatMap((s: any) => s.items || []);
    chk('ada 4 item', semuaItem.length, 4);

    // Penggabungan teks menghasilkan string; ini penjaga paling langsung.
    chk('semua subtotal bertipe number',
      semuaSub.every((s: any) => typeof s.subtotal === 'number'), true);
    chk('semua total disiplin bertipe number',
      sections.every((s: any) => typeof s.totalAmount === 'number'), true);
    chk('grand total bertipe number', typeof rab.json?.grandTotal, 'number');

    console.log('\n2. Subtotal = jumlah itemnya');
    for (const s of semuaSub) {
      const jml = (s.items || []).reduce((a: number, i: any) => a + sen(i.totalPrice), 0);
      chk(`subtotal sub-disiplin (${(s.items || []).length} item)`, sen(s.subtotal), jml);
    }

    console.log('\n3. Total disiplin = jumlah sub-disiplinnya');
    for (const s of sections) {
      const jml = (s.subDisciplines || []).reduce((a: number, x: any) => a + sen(x.subtotal), 0);
      chk(`total disiplin "${s.name}"`, sen(s.totalAmount), jml);
    }

    console.log('\n4. Grand total = jumlah disiplin = total_project');
    const jmlDisiplin = sections.reduce((a: number, s: any) => a + sen(s.totalAmount), 0);
    chk('grand total = jumlah disiplin', sen(rab.json?.grandTotal), jmlDisiplin);
    chk('grand total = jumlah seluruh item',
      sen(rab.json?.grandTotal), semuaItem.reduce((a: number, i: any) => a + sen(i.totalPrice), 0));

    const cek = await call('GET', `/estimator/proposals/${propId}`, undefined, master);
    const totalProject = (cek.json?.data ?? cek.json)?.total_project;
    chk('grand total = total_project di header', sen(rab.json?.grandTotal), sen(totalProject));
    chk('summary.totalProject = grand total', sen(rab.json?.summary?.totalProject), sen(rab.json?.grandTotal));
    chk('summary bertipe number, bukan string DECIMAL',
      ['directCost', 'overhead', 'riskContingency', 'totalProject']
        .every(k => typeof rab.json?.summary?.[k] === 'number'), true);

    console.log('\n5. Nilai besar tidak meleset dan pembulatannya 2 desimal');
    // Kalau penggabungan teks terjadi, angkanya melonjak beberapa kali lipat.
    // Batas ini longgar tapi cukup: total wajar di bawah 10^12.
    chk('grand total masih dalam rentang wajar', Number(rab.json?.grandTotal) < 1e12, true);
    chk('grand total tepat 2 desimal',
      Math.abs(Number(rab.json?.grandTotal) * 100 - Math.round(Number(rab.json?.grandTotal) * 100)) < 1e-6, true);
    for (const s of semuaSub) {
      chk(`subtotal "${s.name}" tepat 2 desimal`,
        Math.abs(Number(s.subtotal) * 100 - Math.round(Number(s.subtotal) * 100)) < 1e-6, true);
    }

    // ── 6. Overhead & kontinjensi bukan nol ────────────────────────────────
    //
    // Fixture di atas semuanya overhead nol, jadi `grandTotal == total_project`
    // lolos tanpa pernah menguji apa pun. Dengan overhead terisi, keduanya
    // memang HARUS berbeda — dan dokumen wajib mengeja perbedaannya, bukan
    // mencetak dua total tanpa keterangan.
    console.log('\n6. Overhead & kontinjensi bukan nol');
    await dbRun(
      'UPDATE proposals SET overhead = ?, risk_contingency = ? WHERE id = ?',
      [10000000, 5000000, propId]
    );
    // Recalculate dipicu lewat perubahan qty pada item pertama.
    const daftarItem = await call('GET', `/estimator/proposals/${propId}/items`, undefined, master);
    const item0 = (daftarItem.json?.data ?? daftarItem.json ?? [])[0];
    chk('item untuk memicu recalculate ada', !!item0?.id, true);
    await call('PUT', `/estimator/proposals/${propId}/items/${item0.id}`, { qty: 4 }, master);

    const rab2 = await call('GET', `/estimator/proposals/${propId}/rab`, undefined, master);
    const s2 = rab2.json?.summary;
    chk('overhead bertahan sesudah recalculate', sen(s2?.overhead), sen(10000000));
    chk('kontinjensi bertahan', sen(s2?.riskContingency), sen(5000000));

    const rincian2 = (rab2.json?.sections || [])
      .reduce((a: number, x: any) => a + sen(x.totalAmount), 0);
    chk('grandTotal = jumlah rincian (biaya langsung)', sen(rab2.json?.grandTotal), rincian2);
    chk('grandTotal = direct cost di header', sen(rab2.json?.grandTotal), sen(s2?.directCost));
    // Inilah yang dulu tidak pernah diuji: dengan overhead, keduanya berbeda.
    chk('total proyek = langsung + overhead + kontinjensi',
      sen(s2?.totalProject), sen(s2?.directCost) + sen(10000000) + sen(5000000));
    chk('total proyek memang > grandTotal',
      Number(s2?.totalProject) > Number(rab2.json?.grandTotal), true);

    // Layar harus mengeja penutupnya, bukan mencetak satu "GRAND TOTAL" ambigu.
    const { readFileSync } = await import('node:fs');
    const vueRab = readFileSync(
      new URL('../../frontend/src/views/EstimatorRAB.vue', import.meta.url), 'utf8');
    chk('layar mengeja JUMLAH BIAYA LANGSUNG', vueRab.includes('JUMLAH BIAYA LANGSUNG'), true);
    chk('layar menutup dengan TOTAL PROYEK', vueRab.includes('>TOTAL PROYEK<'), true);
    chk('tidak ada lagi label GRAND TOTAL yang ambigu', vueRab.includes('>GRAND TOTAL<'), false);

    // ── 7. Layar RAB tidak boleh menampilkan dokumen kosong yang tampak sah ─
    //
    // Kegagalan apa pun dulu hanya masuk `console.error`, sementara halaman
    // tetap merender judul, tabel, ringkasan, dan tombol **Print** dengan
    // seluruh angka Rp0. Dokumen semacam itu bisa dicetak dan diedarkan sebagai
    // penawaran.
    console.log('\n7. Layar RAB menyatakan gagal, bukan mencetak nol');

    // Backend memang menjawab 404 untuk proposal yang tidak ada — itu yang
    // dulu berakhir sebagai dokumen kosong di layar.
    const rabHilang = await call('GET', '/estimator/proposals/99999999/rab', undefined, master);
    chk('RAB proposal tak dikenal → 404', rabHilang.status, 404);

    const { readFileSync: bacaRab } = await import('node:fs');
    const vueRab2 = bacaRab(
      new URL('../../frontend/src/views/EstimatorRAB.vue', import.meta.url), 'utf8');
    chk('layar punya keadaan memuat', vueRab2.includes('Memuat dokumen RAB'), true);
    chk('layar punya keadaan gagal', vueRab2.includes('Dokumen RAB tidak bisa dimuat'), true);
    chk('layar punya keadaan tanpa baris', vueRab2.includes('belum punya baris RAB'), true);
    chk('tombol Print dinonaktifkan saat belum siap',
      vueRab2.includes(':disabled="!dokumenSiap"'), true);
    chk('printRAB menolak dokumen belum siap',
      vueRab2.includes('if (!dokumenSiap.value)'), true);
    // Respons parsial tidak boleh meninggalkan campuran data lama dan baru.
    chk('respons divalidasi sebelum ditulis',
      vueRab2.includes('Respons RAB tidak lengkap'), true);
    chk('sisa data dibersihkan saat gagal',
      vueRab2.includes('proposal.value = null;'), true);

    // ── 8. Deskripsi lingkup masuk dokumen, kolom tidak tertukar ───────────
    //
    // Editor menyediakan "Tambah deskripsi..." per item dan backend memang
    // menulisnya ke `proposal_items.description` — tapi query RAB tidak pernah
    // memilih kolom itu. Keterangan lingkup yang sengaja diketik pengguna hilang
    // total dari dokumen, sementara kolom PEKERJAAN menampilkan nama AHSP dan
    // kolom AHSP + KODE menampilkan kode yang sama dua kali.
    console.log('\n8. Deskripsi lingkup ikut ke dokumen RAB');

    const daftarUntukDeskripsi = await call('GET', `/estimator/proposals/${propId}/items`, undefined, master);
    const itemPertama = (daftarUntukDeskripsi.json?.data ?? daftarUntukDeskripsi.json ?? [])[0];
    chk('item untuk diberi deskripsi ada', !!itemPertama?.id, true);

    const teksLingkup = `Galian tanah zona utara, kedalaman 1,5 m ${stamp}`;
    chk('deskripsi tersimpan lewat PUT',
      (await call('PUT', `/estimator/proposals/${propId}/items/${itemPertama.id}`,
        { description: teksLingkup }, master)).status, 200);

    const rab3 = await call('GET', `/estimator/proposals/${propId}/rab`, undefined, master);
    const semuaBaris = (rab3.json?.sections || [])
      .flatMap((s: any) => s.subDisciplines || [])
      .flatMap((s: any) => s.items || []);
    const barisBerdeskripsi = semuaBaris.find((b: any) => b.description === teksLingkup);
    // Inti temuannya: dulu field ini tidak pernah ada di respons RAB.
    chk('deskripsi ikut dikembalikan RAB', !!barisBerdeskripsi, true);
    chk('nama AHSP tetap dikirim terpisah',
      typeof barisBerdeskripsi?.ahspName === 'string' && barisBerdeskripsi.ahspName.length > 0, true);
    chk('kode AHSP tetap dikirim terpisah',
      typeof barisBerdeskripsi?.ahspCode === 'string' && barisBerdeskripsi.ahspCode.length > 0, true);
    chk('nama dan kode memang berbeda',
      barisBerdeskripsi?.ahspName !== barisBerdeskripsi?.ahspCode, true);

    // Baris tanpa deskripsi tetap terbaca — layar jatuh ke nama AHSP.
    const tanpaDeskripsi = semuaBaris.find((b: any) => !b.description);
    chk('baris tanpa deskripsi tetap ada', !!tanpaDeskripsi, true);

    const { readFileSync: bacaRab3 } = await import('node:fs');
    const vRab = bacaRab3(
      new URL('../../frontend/src/views/EstimatorRAB.vue', import.meta.url), 'utf8');
    chk('kolom PEKERJAAN memakai deskripsi', vRab.includes('item.description || item.ahspName'), true);
    chk('kode tidak lagi dicetak dua kali',
      (vRab.match(/\{\{ item\.ahspCode \}\}/g) || []).length, 1);

  } finally {
    console.log('\n9. Bersih-bersih');
    let sisa = 0;
    for (const hapus of bersihkan.reverse()) {
      try { await hapus(); } catch { sisa++; }
    }
    chk('data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
