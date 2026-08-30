import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * Halaman Integration berhenti menjadi control plane semu.
 *
 * Tiga cacat terverifikasi di kode:
 *
 *   1. Store mengirim `{ value }` sementara backend menuntut `setting_value`,
 *      jadi SETIAP penyimpanan 400 — lalu ditelan `.catch(() => {})` dan badge
 *      tetap berubah seolah berhasil.
 *   2. PUT hanya meng-UPDATE; seed awal cuma membuat 3 kunci, jadi seluruh
 *      `integration_*` dan `api_*` mendapat 404 dan tidak akan pernah bisa
 *      dibuat lewat layar.
 *   3. Webhook hanya masuk array di memori browser.
 *
 * Dan satu batas yang ditegakkan di sini: `system_settings` dibaca
 * `GET /settings/all` yang hanya berpagar `authMiddleware`, jadi ia BUKAN
 * tempat menyimpan rahasia.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:integrasi
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

  const kunci = `integration_uji_${stamp}`;
  try {
    console.log('\n1. INI YANG MENENTUKAN — kunci yang belum ada bisa dibuat');
    // Seed awal cuma membuat company_name/currency/timezone. Sebelum ini,
    // seluruh integration_* mendapat 404 dan layar tidak pernah bisa menyimpan.
    const buat = await call('PUT', `/settings/${kunci}`, { setting_value: 'true' }, master);
    chk('berhasil, bukan 404', buat.status, 200);
    chk('dinyatakan baru dibuat', buat.json?.dibuat, true);
    const row: any = await dbGet('SELECT setting_value, category FROM system_settings WHERE setting_key = ?', [kunci]);
    chk('benar-benar tersimpan', row?.setting_value, 'true');
    chk('dikelompokkan sebagai integration', row?.category, 'integration');

    console.log('\n2. Nama field lama tetap dilayani — klien lama tidak putus');
    const lama = await call('PUT', `/settings/${kunci}`, { value: 'false' }, master);
    chk('dilayani, bukan 400', lama.status, 200);
    const row2: any = await dbGet('SELECT setting_value FROM system_settings WHERE setting_key = ?', [kunci]);
    chk('nilainya berubah', row2?.setting_value, 'false');
    chk('tanpa nilai sama sekali tetap 400',
      (await call('PUT', `/settings/${kunci}`, {}, master)).json?.code, 'NILAI_WAJIB');

    console.log('\n3. Rahasia DITOLAK, bukan disimpan lalu disamarkan');
    // `GET /settings/all` hanya berpagar authMiddleware — rahasia yang masuk
    // ke sini sudah bocor sebelum penyamaran sempat menolong.
    for (const k of [`api_key_${stamp}`, `smtp_password_${stamp}`, `slack_token_${stamp}`]) {
      const tolak = await call('PUT', `/settings/${k}`, { setting_value: 'rahasia' }, master);
      chk(`${k.split('_')[0]}… ditolak`, tolak.json?.code, 'RAHASIA_DITOLAK');
      const ada: any = await dbGet('SELECT COUNT(*) n FROM system_settings WHERE setting_key = ?', [k]);
      chk('  dan tidak tersimpan', Number(ada?.n), 0);
    }

    console.log('\n4. Nilai rahasia yang TERLANJUR ada disamarkan saat dibaca massal');
    await dbRun(
      `INSERT INTO system_settings (setting_key, setting_value, category, data_type)
       VALUES (?, 'sk-rahasia-sekali', 'integration', 'string')`, [`legacy_api_key_${stamp}`]);
    const semua = await call('GET', '/settings/all', undefined, master);
    const bocor = (semua.json?.data || []).find((x: any) => x.setting_key === `legacy_api_key_${stamp}`);
    chk('nilainya tidak terbaca apa adanya', bocor?.setting_value === 'sk-rahasia-sekali', false);
    chk('dan ditandai tersamarkan', bocor?.tersamarkan, true);

    console.log('\n5. Webhook benar-benar tersimpan — dan status kirimnya jujur');
    const wh = await call('POST', '/settings/webhooks',
      { event: `po.created.${stamp}`, url: 'https://hooks.example.com/uji' }, master);
    chk('terdaftar', wh.status, 201);
    // Yang paling penting: TIDAK mengaku aktif.
    chk('status kirimnya belum aktif', wh.json?.delivery_status, 'belum_aktif');
    const daftar = await call('GET', '/settings/webhooks', undefined, master);
    chk('terbaca kembali dari server', (daftar.json?.data || []).some((x: any) => x.id === wh.json?.id), true);
    chk('respons menyatakan pengiriman belum aktif', daftar.json?.pengiriman_aktif, false);
    chk('dan menjelaskan sebabnya', String(daftar.json?.catatan || '').length > 20, true);

    console.log('\n6. Webhook divalidasi, tidak asal diterima');
    chk('URL ngawur ditolak', (await call('POST', '/settings/webhooks',
      { event: 'x', url: 'bukan-url' }, master)).json?.code, 'URL_TIDAK_VALID');
    chk('protokol selain http/https ditolak', (await call('POST', '/settings/webhooks',
      { event: 'x', url: 'ftp://a.b/c' }, master)).json?.code, 'PROTOKOL_TIDAK_DIDUKUNG');
    chk('event kosong ditolak', (await call('POST', '/settings/webhooks',
      { event: '', url: 'https://a.b' }, master)).json?.code, 'FIELD_WAJIB');
    chk('duplikat ditolak', (await call('POST', '/settings/webhooks',
      { event: `po.created.${stamp}`, url: 'https://hooks.example.com/uji' }, master)).json?.code,
      'WEBHOOK_SUDAH_ADA');

    console.log('\n7. Hapus memeriksa baris terkena');
    chk('hapus berhasil', (await call('DELETE', `/settings/webhooks/${wh.json?.id}`, undefined, master)).status, 200);
    chk('hapus dua kali 404', (await call('DELETE', `/settings/webhooks/${wh.json?.id}`, undefined, master)).status, 404);

    console.log('\n8. Layar berhenti menelan kegagalan');
    const layarMentah = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'AdminIntegration.vue'), 'utf8');
    // Komentar dibuang lebih dulu: catatan sejarah yang MENYEBUT pola lama itu
    // berguna, yang dilarang adalah menjalankannya.
    const layar = layarMentah
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\*.*$/gm, '')
      .replace(/^\s*\/\/.*$/gm, '');
    chk('tidak ada lagi catch kosong', /catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(layar), false);
    chk('status dihidrasi dari server', layar.includes("api.get('/settings/all')"), true);
    chk('webhook dibaca dari server', layar.includes("api.get('/settings/webhooks')"), true);
    // Badge diubah SESUDAH server menerima, bukan sebelum.
    chk('badge tidak dibalik sebelum server menerima',
      /integ\.enabled = !integ\.enabled;\s*\n\s*store\.updateSetting/.test(layar), false);
    // Kolom API key dicabut — membuatnya "berfungsi" berarti membocorkannya.
    chk('kolom input API key dicabut', /v-model="apiConfig\.apiKey"/.test(layar), false);
    chk('dan sebabnya dijelaskan di layar',
      layar.includes('terbaca seluruh') || layar.includes('environment server'), true);
    chk('webhook tidak lagi berlabel Active tanpa dasar',
      /wh\.active \? 'Active'/.test(layar), false);

  } finally {
    console.log('\n9. Bersih-bersih');
    await dbRun('DELETE FROM system_settings WHERE setting_key LIKE ?', [`%${stamp}`]);
    await dbRun('DELETE FROM webhook_endpoints WHERE event LIKE ?', [`%${stamp}`]);
    const sisa: any = await dbGet(
      'SELECT COUNT(*) n FROM system_settings WHERE setting_key LIKE ?', [`%${stamp}`]);
    chk('setting fixture tersapu', Number(sisa?.n), 0);
    const sisaWh: any = await dbGet(
      'SELECT COUNT(*) n FROM webhook_endpoints WHERE event LIKE ?', [`%${stamp}`]);
    chk('webhook fixture tersapu', Number(sisaWh?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
