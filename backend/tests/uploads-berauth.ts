import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * DR-P0-05b — menutup `/uploads` tanpa menyediakan gantinya memutus fiturnya.
 *
 * Penjagaan `/uploads/*` itu benar dan harus tetap ada: dokumen keuangan tidak
 * boleh terbuka tanpa token. Yang salah adalah menutupnya sementara modulnya
 * **tidak pernah punya jalur ber-autentikasi pengganti** — yang ada hanya list,
 * upload, dan delete. Layar menaut langsung ke `/uploads/fund-requests/<berkas>`,
 * jadi begitu penjagaan aktif seluruh dokumen fund request tidak bisa dibuka
 * lagi. 27 berkas di produksi. Dilaporkan pengguna 27 Agustus 2026:
 * membuka lampiran menampilkan JSON `UPLOADS_NOT_PUBLIC`, bukan dokumennya.
 *
 * Bukti pembayaran lebih parah lagi: thumbnail-nya memakai `<img :src>`, dan
 * `<img>` tidak bisa membawa header Authorization sama sekali.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:uploads
 */
const API = process.env.API || 'http://localhost:3005/api';
const BASE = API.replace(/\/api$/, '');
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

async function unggah(path: string, token: string, isi: Buffer, mime: string, nama: string) {
  const batas = '----uji' + Date.now();
  const kepala = Buffer.from(
    `--${batas}\r\nContent-Disposition: form-data; name="file"; filename="${nama}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`);
  const ekor = Buffer.from(`\r\n--${batas}--\r\n`);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${batas}`, Authorization: `Bearer ${token}` },
    body: Buffer.concat([kepala, isi, ekor]),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// PDF minimal yang sah — cukup untuk membuktikan isinya kembali utuh.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function main() {
  const stamp = Date.now().toString().slice(-7);

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  let frId: any;
  try {
    const fr = await call('POST', '/finance/fund-requests', {
      purpose: `Uji unggah ${stamp}`, needed_date: '2026-08-27',
      items: [{ description: 'Uji', amount: 100000 }],
    }, master);
    frId = fr.json?.id ?? fr.json?.data?.id;
    chk('fund request uji dibuat', !!frId, true);

    console.log('\n1. Dokumen diunggah');
    const unggahan = await unggah(`/finance/fund-requests/${frId}/documents`, master, PDF,
      'application/pdf', `Master_Schedule_${stamp}.pdf`);
    chk('unggahan diterima', unggahan.status < 300, true);
    const daftar = await call('GET', `/finance/fund-requests/${frId}/documents`, undefined, master);
    const doc = (daftar.json?.data || daftar.json || [])[0];
    chk('dokumen terdaftar', !!doc?.id, true);

    console.log('\n2. Jalur publik TETAP tertutup — penjagaannya tidak boleh dilonggarkan');
    const publik = await fetch(`${BASE}${doc.file_path}`);
    chk('akses langsung ke /uploads ditolak 403', publik.status, 403);
    const jsonPublik: any = await publik.json().catch(() => ({}));
    chk('kodenya UPLOADS_NOT_PUBLIC', jsonPublik?.code, 'UPLOADS_NOT_PUBLIC');

    console.log('\n3. Tapi sekarang ADA jalur ber-autentikasi, dan isinya utuh');
    const tanpaToken = await fetch(`${API}/finance/fund-requests/${frId}/documents/${doc.id}/download`);
    chk('tanpa token ditolak 401', tanpaToken.status, 401);

    const berauth = await fetch(`${API}/finance/fund-requests/${frId}/documents/${doc.id}/download`,
      { headers: { Authorization: `Bearer ${master}` } });
    chk('dengan token berhasil 200', berauth.status, 200);
    const isi = Buffer.from(await berauth.arrayBuffer());
    chk('isi berkasnya sama persis dengan yang diunggah', isi.equals(PDF), true);
    chk('dibuka inline, bukan dipaksa unduh',
      String(berauth.headers.get('content-disposition') || '').startsWith('inline'), true);
    chk('browser tidak boleh menebak tipenya',
      berauth.headers.get('x-content-type-options'), 'nosniff');

    console.log('\n4. Dokumen milik fund request lain tidak bisa diambil lewat id yang salah');
    const fr2 = await call('POST', '/finance/fund-requests', {
      purpose: `Uji unggah lain ${stamp}`, needed_date: '2026-08-27',
      items: [{ description: 'Uji', amount: 50000 }],
    }, master);
    const fr2Id = fr2.json?.id ?? fr2.json?.data?.id;
    const silang = await fetch(`${API}/finance/fund-requests/${fr2Id}/documents/${doc.id}/download`,
      { headers: { Authorization: `Bearer ${master}` } });
    chk('ditolak 404', silang.status, 404);

    console.log('\n5. Dokumen yang tidak ada memberi 404, bukan 500');
    const hilang = await fetch(`${API}/finance/fund-requests/${frId}/documents/999999999/download`,
      { headers: { Authorization: `Bearer ${master}` } });
    chk('404', hilang.status, 404);

    console.log('\n6. Endpoint bukti pembayaran juga ada dan terjaga');
    const proofTanpaToken = await fetch(`${API}/finance/payment-schedule/proofs/1/download`);
    chk('tanpa token ditolak 401', proofTanpaToken.status, 401);
    const proofHilang = await fetch(`${API}/finance/payment-schedule/proofs/999999999/download`,
      { headers: { Authorization: `Bearer ${master}` } });
    chk('bukti tidak ada memberi 404', proofHilang.status, 404);

    console.log('\n7. Layar tidak lagi menaut langsung ke /uploads');
    const { readFileSync } = await import('node:fs');
    const fr_vue = readFileSync(
      new URL('../../frontend/src/views/FinanceFundRequests.vue', import.meta.url), 'utf8');
    chk('fund request tidak lagi memakai href ke file_path',
      !fr_vue.includes('apiBaseUrl + doc.file_path'), true);
    chk('dan mengambilnya lewat endpoint download', fr_vue.includes('/download`'), true);

    const ps_vue = readFileSync(
      new URL('../../frontend/src/views/FinancePaymentSchedule.vue', import.meta.url), 'utf8');
    chk('bukti pembayaran tidak lagi memakai src ke file_path',
      !ps_vue.includes('apiBase + pf.file_path'), true);
    chk('thumbnail memakai blob URL', ps_vue.includes('pratinjauProof[pf.id]'), true);
    chk('blob URL dilepas saat panel ditutup', ps_vue.includes('URL.revokeObjectURL'), true);

  } finally {
    console.log('\n8. Bersih-bersih');
    if (frId) {
      const { dbAll, dbRun } = await import('../src/config/database');
      const ids: any[] = await dbAll(
        'SELECT id FROM fund_requests WHERE purpose LIKE ?', [`%${stamp}%`]);
      for (const r of ids) {
        await dbRun('DELETE FROM fund_request_documents WHERE fund_request_id = ?', [r.id]).catch(() => {});
        await dbRun('DELETE FROM fund_request_items WHERE fund_request_id = ?', [r.id]).catch(() => {});
        await dbRun('DELETE FROM fund_requests WHERE id = ?', [r.id]).catch(() => {});
      }
      chk('fund request uji terhapus', ids.length > 0, true);
    }
    await sapuFixture(stamp);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
