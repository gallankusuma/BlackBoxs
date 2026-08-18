import 'dotenv/config';
/**
 * Tes konversi Prospect → Client.
 *
 * Bug yang dibuktikan: `POST /prospects/:id/convert-to-lead` hanya menjalankan
 * `UPDATE prospects SET status='converted'`. Tidak ada client yang dibuat, tidak
 * ada kontak yang dipindah, dan `converted_to_client_id` dibiarkan NULL —
 * padahal responsnya berbunyi "Prospect converted" dan prospect itu langsung
 * hilang dari hitungan aktif di /stats. Prospect menguap tanpa penerima.
 *
 * Tabel `leads` tidak ada di skema, jadi nama lamanya menjanjikan sesuatu yang
 * secara struktural mustahil; tujuan yang benar-benar ada adalah `clients`.
 *
 * Semua data uji dibuat dan dihapus sendiri oleh tes ini. Prasyarat: backend
 * jalan. Jalankan: npm run test:prospects
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

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  try {
    // ── 1. Konversi benar-benar membuat client ─────────────────────────────
    console.log('\n1. Konversi membuat client, bukan sekadar menandai status');

    const buat = await call('POST', '/prospects', {
      company_name: `PT Uji Konversi ${stamp}`,
      contact_name: `Kontak Uji ${stamp}`,
      contact_title: 'Procurement Manager',
      email: `uji${stamp}@contoh.test`,
      phone: `0800${stamp}`,
      industry: 'Konstruksi',
      city: 'Bandung',
      estimated_value: 750000000,
    }, master);
    chk('prospect uji dibuat', buat.status, 201);
    const prospectId = buat.json?.data?.id;
    chk('prospect punya id', typeof prospectId === 'number', true);
    chk('kode prospect berformat PSP-nnnn', /^PSP-\d{4}$/.test(buat.json?.data?.code || ''), true);
    bersihkan.push(() => call('DELETE', `/prospects/${prospectId}`, undefined, master));

    const konversi = await call('POST', `/prospects/${prospectId}/convert-to-client`, {}, master);
    chk('konversi berhasil', konversi.status, 200);

    const clientId = konversi.json?.data?.client_id;
    // Inti temuannya: sebelum perbaikan, tidak ada client_id sama sekali di respons.
    chk('respons menyebut client_id', typeof clientId === 'number', true);
    chk('kode client berformat BUY-nnnn', /^BUY-\d{4}$/.test(konversi.json?.data?.client_code || ''), true);
    if (clientId) bersihkan.push(() => call('DELETE', `/clients/${clientId}`, undefined, master));

    // ── 2. Client-nya sungguh ada di database, bukan cuma di respons ────────
    console.log('\n2. Client yang dijanjikan benar-benar tersimpan');
    const client = await call('GET', `/clients/${clientId}`, undefined, master);
    chk('client bisa dibaca kembali', client.status, 200);
    const c = client.json?.data ?? client.json;
    chk('nama client = nama perusahaan prospect', c?.name, `PT Uji Konversi ${stamp}`);
    chk('kota ikut terbawa', c?.city, 'Bandung');

    // ── 3. Jejak balik terisi ───────────────────────────────────────────────
    console.log('\n3. Prospect menyimpan jejak ke client-nya');
    const sesudah = await call('GET', `/prospects/${prospectId}`, undefined, master);
    chk('status jadi converted', sesudah.json?.data?.status, 'converted');
    // Kolom ini sudah lama ada di skema tapi tidak pernah diisi.
    chk('converted_to_client_id terisi', Number(sesudah.json?.data?.converted_to_client_id), Number(clientId));

    // ── 4. Kontak tidak hilang ──────────────────────────────────────────────
    // `clients` tidak punya kolom email; tanpa langkah kontak, email dan nama
    // PIC prospect lenyap begitu saja saat konversi.
    console.log('\n4. Kontak prospect ikut pindah');
    chk('respons menyebut contact_id', typeof konversi.json?.data?.contact_id === 'number', true);
    // GET /clients/:id sudah menyertakan daftar contacts + primary_contact.
    const daftarKontak: any[] = Array.isArray(c?.contacts) ? c.contacts : [];
    const ketemu = daftarKontak.find((k: any) => k.email === `uji${stamp}@contoh.test`);
    chk('email PIC tersimpan di contacts', !!ketemu, true);
    chk('jabatan PIC tersimpan', ketemu?.job_title, 'Procurement Manager');
    chk('PIC ditandai sebagai kontak utama', Number(c?.primary_contact?.id), Number(konversi.json?.data?.contact_id));
    chk('clients.primary_contact_id ikut di-set', Number(c?.primary_contact_id), Number(konversi.json?.data?.contact_id));

    // ── 5. Konversi ganda ditolak ───────────────────────────────────────────
    console.log('\n5. Konversi kedua ditolak, tidak membuat client kembar');
    const ulang = await call('POST', `/prospects/${prospectId}/convert-to-client`, {}, master);
    chk('konversi ulang ditolak', ulang.status, 400);
    chk('kodenya jelas', ulang.json?.code, 'ALREADY_CONVERTED');
    chk('menunjuk client yang sudah ada', Number(ulang.json?.client_id), Number(clientId));

    // ── 6. Dua permintaan bersamaan hanya menghasilkan satu client ─────────
    // Tanpa FOR UPDATE, keduanya lolos pemeriksaan status dan membuat dua client
    // untuk satu prospect.
    console.log('\n6. Dua konversi serentak → tepat satu yang lolos');
    const buat2 = await call('POST', '/prospects', {
      company_name: `PT Uji Balapan ${stamp}`, contact_name: 'PIC Balapan',
    }, master);
    const pid2 = buat2.json?.data?.id;
    chk('prospect kedua dibuat', buat2.status, 201);
    bersihkan.push(() => call('DELETE', `/prospects/${pid2}`, undefined, master));

    const serentak = await Promise.all([
      call('POST', `/prospects/${pid2}/convert-to-client`, {}, master),
      call('POST', `/prospects/${pid2}/convert-to-client`, {}, master),
    ]);
    const sukses = serentak.filter(r => r.status === 200);
    const ditolak = serentak.filter(r => r.status === 400);
    chk('tepat satu berhasil', sukses.length, 1);
    chk('satunya ditolak', ditolak.length, 1);
    for (const r of sukses) {
      const cid = r.json?.data?.client_id;
      if (cid) bersihkan.push(() => call('DELETE', `/clients/${cid}`, undefined, master));
    }

    // ── 7. Nama lama tetap hidup ────────────────────────────────────────────
    console.log('\n7. Alias convert-to-lead masih dilayani');
    const buat3 = await call('POST', '/prospects', {
      company_name: `PT Uji Alias ${stamp}`, contact_name: 'PIC Alias',
    }, master);
    const pid3 = buat3.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/prospects/${pid3}`, undefined, master));
    const viaAlias = await call('POST', `/prospects/${pid3}/convert-to-lead`, {}, master);
    chk('alias lama berhasil', viaAlias.status, 200);
    chk('alias juga membuat client', typeof viaAlias.json?.data?.client_id === 'number', true);
    if (viaAlias.json?.data?.client_id) {
      const cid = viaAlias.json.data.client_id;
      bersihkan.push(() => call('DELETE', `/clients/${cid}`, undefined, master));
    }

    // ── 8. Prospect tak dikenal ─────────────────────────────────────────────
    console.log('\n8. Prospect yang tidak ada → 404, bukan 500');
    chk('id asing ditolak 404',
      (await call('POST', '/prospects/99999999/convert-to-client', {}, master)).status, 404);

    // ── 9. Tetap butuh autentikasi ──────────────────────────────────────────
    console.log('\n9. Tanpa token tetap ditolak');
    chk('tanpa token → 401',
      (await call('POST', `/prospects/${prospectId}/convert-to-client`, {})).status, 401);

  } finally {
    // Dijalankan juga saat ada assertion yang gagal di tengah, supaya percobaan
    // berikutnya tidak menabrak sisa data percobaan sebelumnya.
    console.log('\n10. Bersih-bersih');
    let sisa = 0;
    for (const hapus of bersihkan.reverse()) {
      try { await hapus(); } catch { sisa++; }
    }
    chk('semua data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
