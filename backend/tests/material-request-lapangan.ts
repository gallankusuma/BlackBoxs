import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * Material Request dari sisi lapangan: keputusan yang menjelaskan, dan sampai.
 *
 * Backend MR-nya sudah solid (satu transaction, nomor atomic, identitas dari
 * token, foto, nama barang bebas). Yang kurang ada di sisi yang menghadap
 * pemohon:
 *
 *   1. `PUT /:id/reject` hanya menyetel status — tanpa alasan. Tim lapangan
 *      tahu permintaannya ditolak tapi tidak tahu kenapa, jadi mereka
 *      mengajukan ulang barang yang sama atau berhenti memakai fitur ini dan
 *      kembali menelepon.
 *   2. Tidak ada satu pun penanda keputusan baru, sehingga satu-satunya cara
 *      mengetahui nasib permintaan adalah membuka aplikasi berulang kali.
 *
 * Dan penghalang terbesarnya bukan kode: di produksi **0 dari 52 karyawan**
 * punya PIN mobile, jadi tidak ada yang bisa login sama sekali.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mr-lapangan
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

  // Karyawan uji + PIN, supaya jalur mobile benar-benar dilalui.
  const emp: any = await dbRun(
    `INSERT INTO employees (code, name, status) VALUES (?, ?, 'ACTIVE')`,
    [`MR-${stamp}`, `Pekerja Uji ${stamp}`]);
  const empId = emp.insertId;
  const pinRes = await call('POST', `/hr/employees/${empId}/reset-pin`, {}, master);
  const pin = pinRes.json?.pin;
  chk('PIN diterbitkan HR', !!pin, true);

  const login = await call('POST', '/hr/mobile/login', { nik: `MR-${stamp}`, pin });
  const tokMobile: string = login.json?.token;
  chk('karyawan bisa login mobile', !!tokMobile, true);

  let mrTolak = 0, mrSetuju = 0;
  try {
    console.log('\n1. Permintaan diajukan dari HP');
    const buat = async (nama: string) => (await call('POST', '/material-requests', {
      priority: 'urgent', notes: `dari lapangan ${stamp}`,
      items: [{ item_name: nama, quantity: 5, uom: 'sak' }],
    }, tokMobile)).json;
    const a = await buat(`Semen ${stamp}`);
    const b = await buat(`Besi ${stamp}`);
    // Responsnya berbentuk { message, data: { id, mr_number } }.
    mrTolak = a?.data?.id;
    mrSetuju = b?.data?.id;
    chk('dua MR terbentuk', !!mrTolak && !!mrSetuju, true);
    // Nama barang bebas — lapangan sering butuh yang tidak ada di katalog.
    const item: any = await dbGet('SELECT item_name FROM material_request_items WHERE mr_id = ?', [mrTolak]);
    chk('barang di luar katalog tetap bisa diminta', String(item?.item_name).includes('Semen'), true);

    console.log('\n2. INI YANG MENENTUKAN — penolakan WAJIB beralasan');
    const tanpaAlasan = await call('PUT', `/material-requests/${mrTolak}/reject`, {}, master);
    chk('ditolak 400', tanpaAlasan.status, 400);
    chk('kodenya jelas', tanpaAlasan.json?.code, 'ALASAN_WAJIB');
    const masih: any = await dbGet('SELECT status FROM material_requests WHERE id = ?', [mrTolak]);
    chk('statusnya tidak berubah', masih?.status, 'pending');

    const alasan = `Stok gudang masih ada 20 sak ${stamp}`;
    chk('dengan alasan diterima',
      (await call('PUT', `/material-requests/${mrTolak}/reject`, { reason: alasan }, master)).status, 200);
    const ditolak: any = await dbGet(
      'SELECT status, rejection_reason, rejected_at FROM material_requests WHERE id = ?', [mrTolak]);
    chk('alasannya tersimpan', ditolak?.rejection_reason, alasan);
    chk('waktunya tercatat', !!ditolak?.rejected_at, true);

    console.log('\n3. Alasannya SAMPAI ke pemohon');
    const my1 = await call('GET', '/material-requests/my', undefined, tokMobile);
    const baris = (my1.json?.data || []).find((x: any) => Number(x.id) === Number(mrTolak));
    chk('pemohon melihat alasannya', baris?.rejection_reason, alasan);
    // Inilah yang membuat keputusan tidak menggantung tanpa ada yang tahu.
    chk('ditandai sebagai keputusan baru', Number(baris?.keputusan_baru), 1);
    chk('jumlah yang belum dibaca dihitung server', Number(my1.json?.belum_dibaca) >= 1, true);

    console.log('\n4. Ditandai dibaca — dan hanya milik pemohonnya sendiri');
    chk('penandaan berhasil',
      (await call('PUT', '/material-requests/my/tandai-dibaca', {}, tokMobile)).status, 200);
    const my2 = await call('GET', '/material-requests/my', undefined, tokMobile);
    chk('tidak ada lagi yang belum dibaca', Number(my2.json?.belum_dibaca), 0);
    // MR milik orang lain tidak boleh ikut tertandai.
    const emp2: any = await dbRun(
      `INSERT INTO employees (code, name, status) VALUES (?, ?, 'ACTIVE')`,
      [`MR2-${stamp}`, `Pekerja Lain ${stamp}`]);
    const mrLain: any = await dbRun(
      `INSERT INTO material_requests (mr_number, employee_id, employee_name, status, rejection_reason)
       VALUES (?, ?, ?, 'rejected', 'x')`,
      [`MRX-${stamp}`, emp2.insertId, `Pekerja Lain ${stamp}`]);
    await call('PUT', '/material-requests/my/tandai-dibaca', {}, tokMobile);
    const lain: any = await dbGet('SELECT outcome_seen_at FROM material_requests WHERE id = ?', [mrLain.insertId]);
    chk('MR orang lain tidak ikut tertandai', lain?.outcome_seen_at, null);

    console.log('\n5. Persetujuan juga muncul sebagai kabar baru');
    const setuju = await call('PUT', `/material-requests/${mrSetuju}/approve`, {}, master);
    chk('disetujui', setuju.status, 200);
    const my3 = await call('GET', '/material-requests/my', undefined, tokMobile);
    const bSetuju = (my3.json?.data || []).find((x: any) => Number(x.id) === Number(mrSetuju));
    chk('ditandai sebagai keputusan baru', Number(bSetuju?.keputusan_baru), 1);

    console.log('\n6. Status yang sudah final tidak bisa ditolak lagi');
    chk('menolak yang sudah ditolak ditolak',
      (await call('PUT', `/material-requests/${mrTolak}/reject`, { reason: 'lagi' }, master)).status, 400);

    console.log('\n6b. INI YANG PALING BERBAHAYA DARI ANTREAN — kirim ulang tidak boleh menggandakan');
    // Skenario nyata: permintaan sampai ke server, responsnya hilang di jalan,
    // perangkat mengira gagal lalu mengirim ulang. Tanpa idempotensi, barang
    // dipesan dua kali.
    const idKlien = `uji-antre-${stamp}`;
    const kirim = () => call('POST', '/material-requests', {
      client_request_id: idKlien, priority: 'normal',
      items: [{ item_name: `Paku ${stamp}`, quantity: 3, uom: 'kg' }],
    }, tokMobile);

    const k1 = await kirim();
    chk('pengiriman pertama membuat MR', k1.status, 201);
    const k2 = await kirim();
    chk('pengiriman ulang dijawab 200, bukan galat', k2.status, 200);
    // 200, bukan 409: dari sisi perangkat ini BERHASIL — permintaannya memang
    // sudah tercatat. Galat akan membuat antrean mencoba selamanya.
    chk('dinyatakan duplikat', k2.json?.duplikat, true);
    chk('MR yang dikembalikan SAMA', k2.json?.data?.id, k1.json?.data?.id);
    const jml: any = await dbGet(
      'SELECT COUNT(*) n FROM material_requests WHERE employee_id = ? AND client_request_id = ?',
      [empId, idKlien]);
    chk('hanya SATU MR tercatat', Number(jml?.n), 1);

    // Tiga pengiriman bersamaan — yang menahan di sini UNIQUE key, bukan
    // pemeriksaan di awal handler.
    await Promise.all([kirim(), kirim(), kirim()]);
    const jml2: any = await dbGet(
      'SELECT COUNT(*) n FROM material_requests WHERE employee_id = ? AND client_request_id = ?',
      [empId, idKlien]);
    chk('tetap satu walau dikirim bersamaan', Number(jml2?.n), 1);

    // Tanpa client_request_id, perilaku lama dipertahankan: tiap kiriman baru.
    const t1 = await call('POST', '/material-requests',
      { items: [{ item_name: `Tanpa id ${stamp}`, quantity: 1 }] }, tokMobile);
    const t2 = await call('POST', '/material-requests',
      { items: [{ item_name: `Tanpa id ${stamp}`, quantity: 1 }] }, tokMobile);
    chk('tanpa id klien, keduanya MR berbeda', t1.json?.data?.id !== t2.json?.data?.id, true);

    console.log('\n7. Layar mobile menampilkan alasan dan penandanya');
    const fe = join(__dirname, '..', '..', 'frontend', 'src');
    const layar = readFileSync(join(fe, 'views', 'mobile', 'MobileMaterialRequest.vue'), 'utf8');
    chk('alasan penolakan ditampilkan', layar.includes('rejection_reason'), true);
    chk('penanda keputusan baru ditampilkan', layar.includes('keputusan_baru'), true);
    chk('nomor PR lanjutannya ditampilkan', layar.includes('linked_pr_number'), true);
    // Ditandai dibaca SESUDAH tampil — kalau gagal muat, kabarnya tidak boleh
    // hilang tanpa pernah terlihat.
    // Diperiksa lewat URUTAN, bukan jarak karakter: batas jarak akan patah
    // setiap kali ada komentar ditambahkan di antaranya, padahal perilakunya
    // tidak berubah sama sekali.
    const iMuat = layar.indexOf('history.value = res.data.data');
    const iTandai = layar.indexOf('tandai-dibaca');
    chk('penandaan terjadi SESUDAH daftar termuat',
      iMuat >= 0 && iTandai > iMuat, true);

    console.log('\n7b. Antrean offline: terlihat, dan tidak mengantre penolakan');
    chk('antrean tersimpan lokal', layar.includes('KUNCI_ANTREAN'), true);
    chk('id permintaan dibuat sekali dan ikut payload',
      layar.includes('client_request_id: idPermintaan()'), true);
    // Kegagalan JARINGAN dibedakan dari PENOLAKAN server. Mengantrekan 400
    // berarti mencoba selamanya untuk yang tidak akan pernah diterima.
    chk('jaringan dibedakan dari penolakan', layar.includes('function layakDiantre'), true);
    chk('penolakan server tidak diantre ulang',
      /layakDiantre[\s\S]{0,200}e\?\.response\) return false/.test(layar), true);
    // Antrean yang tidak terlihat sama saja hilang dari sisi pemakainya.
    chk('antrean ditampilkan di layar', layar.includes('belum terkirim'), true);
    chk('dikirim ulang otomatis saat sinyal kembali',
      layar.includes("addEventListener('online'"), true);
    chk('dan saat aplikasi dibuka', /onMounted[\s\S]{0,400}kirimAntrean/.test(layar), true);

    console.log('\n8. Keadaan PIN terlihat — tanpa itu fitur mobile mati diam-diam');
    const kary = readFileSync(join(fe, 'views', 'Employees.vue'), 'utf8');
    chk('status PIN dimuat', kary.includes('/hr/employees/pin-status'), true);
    chk('yang belum punya PIN dinyatakan', kary.includes('belum punya PIN mobile'), true);
    chk('dan disebutkan akibatnya', kary.includes('tidak bisa login'), true);

    console.log('\n9. Terjaga auth');
    chk('MR tanpa token mobile 401', (await call('POST', '/material-requests', { items: [] })).status, 401);
    chk('tandai-dibaca tanpa token 401',
      (await call('PUT', '/material-requests/my/tandai-dibaca', {})).status, 401);
    // Token desktop bukan token mobile — scope dipisah tegas.
    chk('token desktop tidak bisa mengajukan MR',
      (await call('POST', '/material-requests', { items: [{ item_name: 'x' }] }, master)).status, 401);

  } finally {
    console.log('\n10. Bersih-bersih');
    await dbRun('DELETE FROM material_requests WHERE mr_number LIKE ?', [`%${stamp}%`]);
    await dbRun('DELETE FROM material_requests WHERE employee_name LIKE ?', [`%${stamp}%`]);
    await dbRun('DELETE FROM employees WHERE code LIKE ?', [`MR%${stamp}`]);
    const sisa: any = await dbGet('SELECT COUNT(*) n FROM employees WHERE code LIKE ?', [`MR%${stamp}`]);
    chk('karyawan fixture tersapu', Number(sisa?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM material_request_items i
       LEFT JOIN material_requests m ON m.id = i.mr_id WHERE m.id IS NULL`);
    chk('nol item MR tanpa induk', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
