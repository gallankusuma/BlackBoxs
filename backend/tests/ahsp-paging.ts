import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Katalog AHSP: mode berhalaman yang tidak berbohong.
 *
 * `GET /estimator/ahsp` tidak punya LIMIT sama sekali — katalog produksi berisi
 * 3.469 baris aktif dan seluruhnya ditarik tiap layar dibuka.
 *
 * Yang TIDAK dilakukan di sini, dan itu keputusan: memasang batas diam-diam
 * pada jalur bawaan. Pemilih AHSP di layar lain akan kehilangan baris tanpa ada
 * yang tahu, lalu orang menyimpulkan "AHSP-nya tidak ada di katalog" padahal
 * ada. Batas yang menyembunyikan data lebih berbahaya daripada muatan besar.
 *
 * Jadi: jalur lama utuh, dan yang meminta halaman mendapat TOTAL juga.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:ahsp-paging
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
  const { dbGet } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  // Tujuh AHSB bernama sama supaya pencarian menghasilkan lebih dari satu halaman.
  const kode: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const k = `PG${i}.${stamp}`;
    await call('POST', '/estimator/ahsp', {
      kode: k, name: `Pekerjaan halaman ${stamp} nomor ${i}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: `Bahan ${stamp}`,
        resource_satuan: 'm3', koefisien: 1, resource_harga: 100000 }],
    }, master);
    kode.push(k);
  }
  chk('tujuh AHSP fixture dibuat', kode.length, 7);

  try {
    console.log('\n1. Jalur lama TIDAK berubah — array polos, tanpa batas diam-diam');
    const lama = await call('GET', `/estimator/ahsp?search=halaman ${stamp}`, undefined, master);
    chk('mengembalikan array, bukan amplop', Array.isArray(lama.json), true);
    chk('ketujuhnya terbawa', (lama.json || []).length, 7);

    console.log('\n2. Mode berhalaman membawa TOTAL — bukan sekadar potongan');
    const h1 = await call('GET', `/estimator/ahsp?paged=1&limit=3&search=halaman ${stamp}`, undefined, master);
    chk('berbentuk amplop', Array.isArray(h1.json?.data), true);
    chk('tiga baris', (h1.json?.data || []).length, 3);
    // Inilah yang membuat layar bisa berkata "3 dari 7", bukan menampilkan 3
    // seolah itu semuanya.
    chk('total tetap 7', h1.json?.total, 7);
    chk('dinyatakan masih ada lagi', h1.json?.has_more, true);
    chk('limit & offset dilaporkan', `${h1.json?.limit}/${h1.json?.offset}`, '3/0');

    console.log('\n3. Halaman berikutnya menyambung, tidak mengulang');
    const h2 = await call('GET', `/estimator/ahsp?paged=1&limit=3&offset=3&search=halaman ${stamp}`, undefined, master);
    chk('tiga berikutnya', (h2.json?.data || []).length, 3);
    const idH1 = (h1.json?.data || []).map((x: any) => x.id);
    const idH2 = (h2.json?.data || []).map((x: any) => x.id);
    chk('tidak ada yang terulang', idH1.filter((x: any) => idH2.includes(x)).length, 0);
    const h3 = await call('GET', `/estimator/ahsp?paged=1&limit=3&offset=6&search=halaman ${stamp}`, undefined, master);
    chk('sisa satu', (h3.json?.data || []).length, 1);
    chk('dan dinyatakan habis', h3.json?.has_more, false);
    // Gabungan seluruh halaman harus sama dengan jalur lama — kalau tidak,
    // berhalaman berarti kehilangan baris.
    const semua = [...idH1, ...idH2, ...(h3.json?.data || []).map((x: any) => x.id)];
    chk('gabungan halaman = hasil jalur lama', semua.length, (lama.json || []).length);

    console.log('\n4. Total menghormati filter, bukan menghitung seluruh katalog');
    const satu = await call('GET', `/estimator/ahsp?paged=1&limit=50&search=PG3.${stamp}`, undefined, master);
    chk('hanya satu yang cocok', satu.json?.total, 1);
    const kosong = await call('GET', `/estimator/ahsp?paged=1&search=tidak-ada-${stamp}`, undefined, master);
    chk('tanpa hasil totalnya nol', kosong.json?.total, 0);
    chk('dan datanya kosong, bukan galat', (kosong.json?.data || []).length, 0);

    console.log('\n5. Nilai ngawur dijepit, bukan diteruskan ke SQL');
    const jepit = await call('GET', `/estimator/ahsp?paged=1&limit=99999&offset=-5&search=halaman ${stamp}`, undefined, master);
    chk('limit dijepit ke 500', jepit.json?.limit, 500);
    chk('offset negatif jadi 0', jepit.json?.offset, 0);
    chk('bukan-angka tidak meruntuhkan', (await call('GET',
      `/estimator/ahsp?paged=1&limit=abc&offset=xyz&search=halaman ${stamp}`, undefined, master)).status, 200);

    console.log('\n6. limit/offset saja sudah cukup memicu mode berhalaman');
    const implisit = await call('GET', `/estimator/ahsp?limit=2&search=halaman ${stamp}`, undefined, master);
    chk('amplop, tanpa perlu paged=1', Array.isArray(implisit.json?.data), true);
    chk('totalnya tetap 7', implisit.json?.total, 7);

    console.log('\n7. Terjaga auth');
    chk('tanpa token 401', (await call('GET', '/estimator/ahsp?paged=1')).status, 401);

  } finally {
    console.log('\n8. Bersih-bersih');
    const disapu = await sapuFixture(stamp, kode);
    chk('AHSP fixture tersapu', disapu.ahsp >= 7, true);
    const sisa: any = await dbGet(
      'SELECT COUNT(*) n FROM ahsp_headers WHERE kode LIKE ?', [`PG%${stamp}`]);
    chk('tidak ada sisa', Number(sisa?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
