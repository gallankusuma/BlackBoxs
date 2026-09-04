import 'dotenv/config';
/**
 * Approval harga vendor (PROC-VPL-01).
 *
 * Sebelum fitur ini, `POST/PUT /vendor-prices` menulis langsung ke tabel dan
 * angkanya SAAT ITU JUGA dipakai auto-fill PR, price-search, dan pemilihan
 * vendor. Tidak ada pemeriksaan di antaranya.
 *
 * Yang paling keras dijaga di berkas ini bukan tombolnya, melainkan
 * **kebocorannya**: harga yang belum disetujui tidak boleh terlihat oleh modul
 * mana pun yang memakainya. Gerbang approval yang hanya ada di layar daftar
 * harga sementara angkanya tetap mengalir ke PR adalah hiasan, bukan kendali —
 * karena itu setiap tahap di bawah diperiksa dua kali: statusnya di layar
 * daftar, DAN apa yang dilihat konsumennya.
 *
 * Dua keputusan pemilik (1 September 2026) yang diuji di sini:
 *
 *   1. **Dua tingkat, seperti PR.** 0 → 1 (supervisor) → 2 (manager).
 *      Status 1 BELUM membuat harganya berlaku — itu yang paling mudah salah.
 *   2. **Mengubah harga yang sudah berlaku melahirkan revisi**, dan harga lama
 *      TETAP melayani PR/PO sampai revisi itu disetujui. Tidak ada jeda produk
 *      tanpa harga.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:vendor-price
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

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');
  const fs = await import('fs');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  // ---------- fixture ----------
  const mkProduct = async (suffix: string) => {
    const r = await call('POST', '/products',
      { sku: `TEST-VPL-${suffix}-${stamp}`, name: `Produk Uji Harga ${suffix} ${stamp}`, is_active: true }, master);
    return r.json?.data?.id ?? r.json?.id;
  };
  const produkA = await mkProduct('A');
  const produkB = await mkProduct('B');
  chk('dua produk uji dibuat', !!produkA && !!produkB, true);

  const vendorRes = await call('POST', '/procurement/vendors',
    { name: `Vendor Uji Harga ${stamp}`, code: `VP${stamp}` }, master);
  const vendorId = vendorRes.json?.data?.id ?? vendorRes.json?.id;
  chk('vendor uji dibuat', !!vendorId, true);

  const mkUser = async (nama: string, level: number) => {
    const email = `vpl.${nama}.${stamp}@test.local`;
    const r = await call('POST', '/users',
      { name: `VPL ${nama}`, email, password: 'secret123', user_level: level }, master);
    const token = (await call('POST', '/auth/login', { email, password: 'secret123' })).json?.token;
    return { id: r.json?.data?.id ?? r.json?.id, email, token };
  };
  const supervisor = await mkUser('supervisor', 2);
  const manager = await mkUser('manager', 3);
  chk('user supervisor & manager uji bisa login', !!supervisor.token && !!manager.token, true);

  // Keduanya diberi SELURUH permission vendor-price-list. Tanpa ini
  // requirePermission menolak lebih dulu dengan PERMISSION_DENIED, dan
  // pemeriksaan level di dalam handler — yang justru ingin diuji — tidak pernah
  // sempat jalan. Yang membedakan keduanya hanya user_level.
  const roleId = (await dbRun(
    'INSERT INTO roles (name, description, level, active) VALUES (?, ?, ?, 1)',
    [`VPL Uji ${stamp}`, 'role sementara tes approval harga vendor', 2]
  )).insertId;
  for (const perm of await dbAll("SELECT id FROM permissions WHERE resource = 'procurement.vendor-price-list'") as any[]) {
    await dbRun('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, perm.id]);
  }
  await dbRun('UPDATE users SET role_id = ? WHERE id IN (?, ?)', [roleId, supervisor.id, manager.id]);
  chk('role uji terpasang ke keduanya', !!roleId, true);

  const buatHarga = async (productId: number, harga: number) => {
    const r = await call('POST', '/procurement/vendor-prices',
      { vendor_id: vendorId, product_id: productId, price: harga, currency: 'IDR', effective_date: today() }, master);
    return { status: r.status, id: r.json?.data?.id, body: r.json };
  };

  // Apa yang DILIHAT modul lain — bukan apa yang tampil di layar daftar harga.
  const hargaDipakai = async (productId: number): Promise<number | null> => {
    const r = await call('GET', `/procurement/vendor-price-details/${vendorId}/${productId}`, undefined, master);
    const p = r.json?.data?.price;
    return p == null ? null : Number(p);
  };
  const vendorTerdaftar = async (productId: number): Promise<boolean> => {
    const r = await call('GET', `/procurement/vendors-for-product/${productId}`, undefined, master);
    return ((r.json?.data || []) as any[]).some(v => Number(v.id) === Number(vendorId));
  };
  const baris = async (id: number) => await dbGet('SELECT * FROM vendor_prices WHERE id = ?', [id]) as any;

  // ================================================================
  console.log('\n1. Harga baru lahir menunggu persetujuan — dan belum dipakai siapa pun');
  const a1 = await buatHarga(produkA, 100000);
  chk('POST harga → 201', a1.status, 201);
  chk('status awal 0 (menunggu)', a1.body?.approval_status, 0);
  chk('konsumen belum melihat harganya', await hargaDipakai(produkA), null);
  chk('vendor belum muncul sebagai pemasok produk', await vendorTerdaftar(produkA), false);

  // ================================================================
  console.log('\n2. Tangga dua tingkat ditegakkan');
  const mgrDuluan = await call('POST', `/procurement/vendor-prices/${a1.id}/approve`, {}, manager.token);
  chk('manager tidak bisa mendahului supervisor', mgrDuluan.status, 400);

  const sup = await call('POST', `/procurement/vendor-prices/${a1.id}/approve`, {}, supervisor.token);
  chk('supervisor menyetujui → 1/2', [sup.status, sup.json?.approval_status], [200, 1]);
  chk('supervisor tercatat namanya', !!(await baris(a1.id)).approved_by_supervisor_id, true);

  // Titik paling mudah salah: 1/2 terlihat "sudah disetujui" di layar, tapi
  // belum boleh dipakai. Kalau konsumen sudah melihatnya di sini, tingkat
  // kedua tidak ada gunanya sama sekali.
  chk('1/2 BELUM membuat harga berlaku', await hargaDipakai(produkA), null);

  const supLagi = await call('POST', `/procurement/vendor-prices/${a1.id}/approve`, {}, supervisor.token);
  chk('supervisor tidak bisa menyetujui tahap kedua', supLagi.status, 400);

  const mgr = await call('POST', `/procurement/vendor-prices/${a1.id}/approve`, {}, manager.token);
  chk('manager menyetujui → 2/2', [mgr.status, mgr.json?.approval_status], [200, 2]);
  chk('harga mulai dipakai konsumen', await hargaDipakai(produkA), 100000);
  chk('vendor muncul sebagai pemasok produk', await vendorTerdaftar(produkA), true);

  // ================================================================
  console.log('\n3. Mengubah harga yang berlaku → revisi, harga lama TETAP jalan');
  const rev = await call('PUT', `/procurement/vendor-prices/${a1.id}`,
    { price: 125000, currency: 'IDR', effective_date: today() }, master);
  chk('PUT harga berlaku → revisi baru (201)', [rev.status, rev.json?.revision], [201, true]);
  const revId = rev.json?.data?.id;
  chk('revisi menunjuk induknya', Number((await baris(revId)).revision_of), Number(a1.id));
  chk('harga induk tidak tersentuh', Number((await baris(a1.id)).price), 100000);

  // Inti keputusan pemilik: tidak ada jeda produk tanpa harga.
  chk('konsumen MASIH memakai harga lama', await hargaDipakai(produkA), 100000);

  const rev2 = await call('PUT', `/procurement/vendor-prices/${a1.id}`,
    { price: 130000, currency: 'IDR', effective_date: today() }, master);
  chk('revisi kedua ditolak selama yang pertama terbuka', [rev2.status, rev2.json?.code], [409, 'REVISI_MASIH_TERBUKA']);

  const revOk = await call('POST', `/procurement/vendor-prices/${revId}/approve`, {}, master);
  chk('revisi disetujui (master langsung 2/2)', [revOk.status, revOk.json?.approval_status], [200, 2]);
  chk('revisi menyebut induk yang digantikannya', Number(revOk.json?.menggantikan), Number(a1.id));
  chk('BARU SEKARANG konsumen memakai harga baru', await hargaDipakai(produkA), 125000);
  chk('induk ditandai digantikan', !!(await baris(a1.id)).superseded_at, true);

  const editIndukMati = await call('PUT', `/procurement/vendor-prices/${a1.id}`,
    { price: 1, currency: 'IDR', effective_date: today() }, master);
  chk('induk yang sudah digantikan tidak bisa diubah', [editIndukMati.status, editIndukMati.json?.code], [409, 'SUDAH_DIGANTIKAN']);

  // ================================================================
  console.log('\n4. Menghapus revisi memulihkan harga sebelumnya');
  const hapusRev = await call('DELETE', `/procurement/vendor-prices/${revId}`, undefined, master);
  chk('revisi terhapus', hapusRev.status, 200);
  chk('induk dipulihkan, bukan ditinggal digantikan', !!(await baris(a1.id)).superseded_at, false);
  // Tanpa pemulihan ini produknya kehilangan harga sama sekali padahal harga
  // lamanya masih ada — hanya tersembunyi di balik penanda yang tidak dicabut.
  chk('konsumen kembali memakai harga lama', await hargaDipakai(produkA), 100000);

  // ================================================================
  console.log('\n5. Menyunting mencabut persetujuan yang sudah terkumpul');
  const b1 = await buatHarga(produkB, 50000);
  const supB = await call('POST', `/procurement/vendor-prices/${b1.id}/approve`, {}, supervisor.token);
  chk('supervisor menyetujui produk B → 1/2', supB.json?.approval_status, 1);

  const suntingB = await call('PUT', `/procurement/vendor-prices/${b1.id}`,
    { price: 55000, currency: 'IDR', effective_date: today() }, master);
  chk('sunting baris 1/2 → diubah di tempat (200)', suntingB.status, 200);
  const barisB = await baris(b1.id);
  // Supervisor menyetujui ANGKA TERTENTU. Begitu angkanya berubah,
  // persetujuan itu tidak lagi berlaku atas apa pun.
  chk('status kembali ke 0', Number(barisB.approval_status), 0);
  chk('jejak persetujuan supervisor dicabut', barisB.approved_by_supervisor_id, null);
  chk('harga tersunting belum dipakai konsumen', await hargaDipakai(produkB), null);

  // ================================================================
  console.log('\n6. Penolakan — wajib beralasan, dan tidak berlaku untuk harga yang sudah jalan');
  const tanpaAlasan = await call('POST', `/procurement/vendor-prices/${b1.id}/reject`, {}, supervisor.token);
  chk('tolak tanpa alasan ditolak', [tanpaAlasan.status, tanpaAlasan.json?.code], [400, 'ALASAN_WAJIB']);

  const tolakBerlaku = await call('POST', `/procurement/vendor-prices/${a1.id}/reject`,
    { reason: 'coba tolak yang sudah jalan' }, manager.token);
  chk('harga yang sudah berlaku tidak bisa ditolak', [tolakBerlaku.status, tolakBerlaku.json?.code], [409, 'SUDAH_BERLAKU']);
  chk('harga yang berlaku tidak tergeser oleh percobaan tadi', await hargaDipakai(produkA), 100000);

  const tolakOk = await call('POST', `/procurement/vendor-prices/${b1.id}/reject`,
    { reason: 'harga di atas penawaran terakhir vendor' }, supervisor.token);
  chk('tolak beralasan → 200', tolakOk.status, 200);
  chk('alasannya tersimpan', (await baris(b1.id)).rejection_reason, 'harga di atas penawaran terakhir vendor');

  const setujuiYangDitolak = await call('POST', `/procurement/vendor-prices/${b1.id}/approve`, {}, manager.token);
  chk('yang sudah ditolak tidak bisa langsung disetujui', [setujuiYangDitolak.status, setujuiYangDitolak.json?.code], [409, 'SUDAH_DITOLAK']);

  const perbaiki = await call('PUT', `/procurement/vendor-prices/${b1.id}`,
    { price: 48000, currency: 'IDR', effective_date: today() }, master);
  chk('menyunting membersihkan penolakan', [perbaiki.status, (await baris(b1.id)).rejected_at], [200, null]);

  // ================================================================
  console.log('\n7. Wewenang');
  const tanpaToken = await call('POST', `/procurement/vendor-prices/${b1.id}/approve`, {});
  chk('approve tanpa token → 401', tanpaToken.status, 401);
  const tolakTanpaToken = await call('POST', `/procurement/vendor-prices/${b1.id}/reject`, { reason: 'x' });
  chk('reject tanpa token → 401', tolakTanpaToken.status, 401);

  const biasa = await mkUser('biasa', 1);
  const biasaApprove = await call('POST', `/procurement/vendor-prices/${b1.id}/approve`, {}, biasa.token);
  chk('level 1 tidak boleh menyetujui', [biasaApprove.status, biasaApprove.json?.code], [403, 'LEVEL_KURANG']);
  const biasaReject = await call('POST', `/procurement/vendor-prices/${b1.id}/reject`, { reason: 'x' }, biasa.token);
  chk('level 1 tidak boleh menolak', biasaReject.status, 403);

  // Menghapus harga yang sedang berlaku = mencabutnya dari PR/PO, jadi
  // wewenangnya disamakan dengan menyetujuinya. Supervisor dan manager di sini
  // memegang permission delete yang SAMA — yang membedakan hanya levelnya,
  // jadi yang benar-benar diuji adalah penjaga level di dalam handler.
  const hapusOlehSupervisor = await call('DELETE', `/procurement/vendor-prices/${a1.id}`, undefined, supervisor.token);
  chk('supervisor tidak boleh menghapus harga yang berlaku', [hapusOlehSupervisor.status, hapusOlehSupervisor.json?.code], [403, 'BUTUH_LEVEL_MANAGER']);
  chk('harganya masih berlaku setelah percobaan hapus', await hargaDipakai(produkA), 100000);

  const hapusOlehManager = await call('DELETE', `/procurement/vendor-prices/${a1.id}`, undefined, manager.token);
  chk('manager boleh menghapusnya', hapusOlehManager.status, 200);
  chk('harganya hilang dari konsumen setelah dihapus', await hargaDipakai(produkA), null);

  // ================================================================
  // ================================================================
  console.log('\n7b. Daftar vendor untuk bidding ikut tersaring, dan tidak pernah kosong diam-diam');
  // Endpoint ini menelan errornya sendiri dan membalas {data: []}, jadi
  // kegagalan apa pun di dalamnya menyamar jadi "tidak ada vendor". Dua asersi
  // di bawah adalah satu-satunya cara cacatnya terlihat.

  // Tanpa product_ids: harus mengembalikan daftar vendor, bukan kosong. Versi
  // sebelumnya memfilter `WHERE active = 1` padahal kolomnya `is_active`,
  // jadi query-nya melempar, errornya ditelan, dan layar Add Bid menampilkan
  // dropdown vendor kosong tanpa satu pun pesan.
  const semuaVendor = await call('GET', '/procurement/vendors-for-items', undefined, master);
  chk('tanpa product_ids: daftar vendor terisi',
    [semuaVendor.status, (semuaVendor.json?.data || []).length > 0], [200, true]);
  chk('  vendor uji ikut terdaftar',
    ((semuaVendor.json?.data || []) as any[]).some(v => Number(v.id) === Number(vendorId)), true);

  // Dengan product_ids: harga yang BELUM disetujui tidak boleh ikut terhitung.
  const cocokUntuk = async (productId: number) => {
    const r = await call('GET', `/procurement/vendors-for-items?product_ids=${productId}`, undefined, master);
    const v = ((r.json?.data || []) as any[]).find(x => Number(x.id) === Number(vendorId));
    return Number(v?.matched_items ?? -1);
  };
  const hargaPending = await buatHarga(produkB, 55000);
  chk('harga baru dibuat sebagai pending', !!hargaPending, true);
  chk('harga pending TIDAK terhitung sebagai vendor punya harga', await cocokUntuk(produkB), 0);

  // ================================================================
  console.log('\n7c. Kegagalan tidak menyamar jadi "tidak ada data" (PROC-AUDIT-01)');
  const srcProc = fs.readFileSync('src/routes/procurement.routes.ts', 'utf8');

  // Ketiga endpoint ini dulu menelan errornya dan membalas {data: []} /
  // {data: null} "supaya tidak memblokir UI". Query rusak jadi menyamar sebagai
  // "tidak ada vendor punya harga", dan buyer mengetik harga manual atas dasar
  // kekosongan yang bohong — kelas cacat yang sama dengan FinanceAP.vue.
  //
  // Yang dicari hanya balasan kosong DI DALAM catch. `return res.json({data: []})`
  // sebagai klausa penjaga untuk input kosong (mis. /price-search tanpa kata
  // kunci) memang benar — itu bukan kegagalan, itu memang tidak ada yang dicari.
  const barisProc = srcProc.split('\n');
  const menelan: string[] = [];
  barisProc.forEach((l, i) => {
    if (!/\}\s*catch\s*[({]/.test(l)) return;
    const blok = barisProc.slice(i, i + 6).join(' ');
    if (/res\.json\(\s*\{\s*data:\s*(\[\]|null)\s*\}/.test(blok)) menelan.push(`baris ${i + 1}`);
  });
  chk('tidak ada kegagalan yang dibalas sebagai data kosong', menelan, []);
  chk('jalur harga vendor punya balasan gagal yang menyebut sebabnya',
    /const gagalVendorHarga[\s\S]{0,400}VENDOR_HARGA_GAGAL/.test(srcProc), true);

  // Fallback "kalau tabelnya tidak ada" dibuang: ia mustahil terpakai dan
  // justru menyaring material_vendor_prices lewat kolom product_id yang tidak
  // ada di sana. Jaminannya dipindah ke verifyRequiredTables saat boot.
  const kodeHidup = srcProc.split('\n')
    .filter(l => !l.trimStart().startsWith('//') && l.includes('ER_NO_SUCH_TABLE'));
  chk('tidak ada lagi fallback ER_NO_SUCH_TABLE', kodeHidup, []);
  chk('vendor_prices termasuk tabel wajib saat boot',
    /'vendor_prices'/.test(fs.readFileSync('src/config/database.ts', 'utf8')
      .split('verifyRequiredTables')[0].slice(-3000)), true);

  // Layar PO dulu memanggil /vendors-for-product/:id sekali per item —
  // pola N+1 yang sama dengan PROC-N1-01, padahal endpoint batch-nya sudah ada.
  const srcPo = fs.readFileSync('../frontend/src/views/PurchaseOrders.vue', 'utf8');
  const loopPerProduk = /for\s*\(const productId of productIds\)[\s\S]{0,200}api\.get/.test(srcPo);
  chk('layar PO tidak lagi menembak vendor per produk', loopPerProduk, false);
  chk('  layar PO memakai endpoint batch', /vendors-for-items\?product_ids=/.test(srcPo), true);
  // Perbandingan angka tidak akan menangkap loop yang kembali muncul, dan
  // kegagalan penyaring yang tidak terlihat membuat pengguna mengira seluruh
  // vendor memang memasok barangnya.
  chk('  kegagalan penyaring ditampilkan di layar',
    /gagalSaringVendor/.test(srcPo) && /v-if="gagalSaringVendor"/.test(srcPo), true);

  // ================================================================
  console.log('\n8. Penyaringan konsumen tidak boleh bocor lewat pembaca baru');
  // Tes ini memindai sumber, bukan perilaku: pembaca vendor_prices yang
  // ditambahkan nanti tidak akan tertangkap tes perilaku mana pun sampai ada
  // yang melaporkan harga pending muncul di PR.
  //
  // Dipindai per TEMPLATE LITERAL, bukan per baris, dan menangkap JOIN bukan
  // cuma FROM. Versi pertama hanya mencocokkan `FROM vendor_prices` di satu
  // baris — dan `GET /vendors-for-items` membaca tabel ini lewat
  // `LEFT JOIN vendor_prices vp` di baris tersendiri, jadi kebocorannya lolos
  // sementara penjaga ini tetap hijau. Penjaga yang punya lubang lebih
  // berbahaya daripada tidak ada penjaga: ia membuat orang berhenti memeriksa.
  const berkas = ['src/routes/procurement.routes.ts', 'src/routes/ai.routes.ts'];
  const bocor: string[] = [];
  for (const f of berkas) {
    const isi = fs.readFileSync(f, 'utf8');
    // Komentar JS dibuang dulu supaya prosa yang menyebut vendor_prices tidak
    // ikut terbaca sebagai query.
    const bersih = isi.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !l.trimStart().startsWith('//')).join('\n');
    for (const m of bersih.matchAll(/`([^`]*)`/g)) {
      const q = m[1];
      // `material_vendor_prices` tabel yang berbeda dan tidak ikut fitur ini.
      if (!/(FROM|JOIN)\s+vendor_prices\b/.test(q)) continue;
      // Pembacaan per-id (jalur tulis/approval) memang harus melihat semua baris.
      if (/WHERE id = \?|WHERE revision_of = \?/.test(q)) continue;
      if (/hargaVendorAktif\(|approval_status/.test(q)) continue;
      // Layar daftar harga sengaja menampilkan yang menunggu persetujuan.
      if (/LEFT JOIN users sup/.test(q)) continue;
      const baris = bersih.slice(0, m.index).split('\n').length;
      bocor.push(`${f.split('/').pop()}:${baris}`);
    }
  }
  chk('tidak ada pembaca vendor_prices tanpa penjaga', bocor, []);

  // Backfill data warisan HARUS di dalam cabang sekali-jalan. Kalau ia lepas ke
  // jalur boot biasa, tiap restart menyetujui sendiri semua harga yang sedang
  // menunggu — meniadakan seluruh fitur ini tanpa satu pun error.
  const skema = fs.readFileSync('src/config/database.ts', 'utf8');
  const blokVpl = skema.slice(skema.indexOf('const ensureVendorPriceApprovalSchema'));
  const posBackfill = blokVpl.indexOf('UPDATE vendor_prices SET approval_status = 2');
  const posFirstRun = blokVpl.indexOf('if (firstRun) {');
  chk('backfill warisan berada di dalam cabang sekali-jalan',
    posFirstRun > 0 && posBackfill > posFirstRun, true);

  // ---------- bersih-bersih ----------
  console.log('\n9. Bersih-bersih fixture');
  await dbRun('DELETE FROM vendor_prices WHERE vendor_id = ?', [vendorId]);
  await dbRun('DELETE FROM vendors WHERE id = ?', [vendorId]);
  await dbRun('DELETE FROM products WHERE id IN (?, ?)', [produkA, produkB]);
  await dbRun('DELETE FROM users WHERE email IN (?, ?, ?)', [supervisor.email, manager.email, biasa.email]);
  await dbRun('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  await dbRun('DELETE FROM roles WHERE id = ?', [roleId]);
  const sisa = await dbAll('SELECT id FROM vendor_prices WHERE vendor_id = ?', [vendorId]);
  chk('fixture harga terhapus', sisa.length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
