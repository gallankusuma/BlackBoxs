import 'dotenv/config';
/**
 * Tes usulan MTO dari gambar kerja (Tahap 1: pondasi).
 *
 * Keputusan desain yang diuji di sini, bukan sekadar "endpointnya jalan":
 *
 *   1. AI menghasilkan PARAMETER, bukan kuantitas. Kuantitasnya dihitung
 *      kalkulator yang sama dengan input manual, jadi angkanya tetap bisa
 *      ditelusuri dan direproduksi.
 *   2. TIDAK ADA yang tersimpan dari endpoint ini. Membaca dimensi dari gambar
 *      teknik itu sulit — terutama satuan mm vs m yang salahnya 1000x — jadi
 *      keliru pasti terjadi. Yang tidak boleh adalah keliru yang tersimpan
 *      diam-diam.
 *   3. Proposal terkunci tidak menerima usulan.
 *
 * Tes ini TIDAK memanggil Gemini (butuh kunci + biaya + gambar sungguhan).
 * Yang diuji adalah kontrak dan penjagaannya; kualitas pembacaan gambar
 * diperiksa manusia lewat panel persetujuan, yang memang itu gunanya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-usul
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

/** Kirim multipart tanpa pustaka tambahan. */
async function kirimGambar(path: string, token: string, isi: Buffer, mime: string, namaBerkas: string) {
  const batas = '----uji' + Date.now();
  const kepala = Buffer.from(
    `--${batas}\r\nContent-Disposition: form-data; name="gambar"; filename="${namaBerkas}"\r\n` +
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

// PNG 1x1 yang sah — cukup untuk menguji kontrak, bukan kualitas pembacaan.
const PNG_KECIL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbAll } = await import('../src/config/database');

  try {
    const pr = await call('POST', '/estimator/proposals',
      { project_name: `Uji usul gambar ${stamp}`, status: 'draft' }, master);
    const pid = pr.json?.id ?? pr.json?.data?.id;
    chk('proposal uji dibuat', !!pid, true);
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));

    console.log('\n1. Endpoint terdaftar & terjaga');
    chk('tanpa token ditolak 401',
      (await call('POST', `/estimator/proposals/${pid}/mto/usul-dari-gambar`, {})).status, 401);
    chk('tanpa gambar ditolak 400',
      (await call('POST', `/estimator/proposals/${pid}/mto/usul-dari-gambar`, {}, master)).status, 400);

    console.log('\n2. Berkas non-gambar ditolak');
    const bukanGambar = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`,
      master, Buffer.from('ini bukan gambar'), 'application/pdf', 'gambar.pdf');
    chk('PDF ditolak, bukan diteruskan ke AI', bukanGambar.status >= 400, true);

    console.log('\n3. Tidak ada yang tersimpan dari endpoint usulan');
    const sebelum = await dbAll(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ?`, [pid]);
    const hasil = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`,
      master, PNG_KECIL, 'image/png', 'pondasi.png');
    // Hasilnya boleh apa saja — 200 dengan usulan kosong, atau 502/503 kalau AI
    // tidak siap. Yang WAJIB: tidak ada baris baru.
    const sesudah = await dbAll(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ?`, [pid]);
    chk('tidak ada elemen MTO yang tersimpan', sesudah.length, sebelum.length);
    if (hasil.status === 200) {
      chk('responsnya menyatakan belum tersimpan', hasil.json?.tersimpan, false);
      chk('usulan berupa array', Array.isArray(hasil.json?.usulan), true);
    } else {
      // Jangan diam-diam dilewati — keadaannya dinyatakan.
      console.log(`  ––   AI tidak menjawab 200 (HTTP ${hasil.status}) — bagian bentuk usulan dilewati`);
      chk('kegagalannya punya pesan yang bisa dibaca', typeof hasil.json?.error === 'string', true);
    }

    console.log('\n4. Proposal terkunci tidak menerima usulan');
    await call('POST', `/estimator/proposals/${pid}/items`, {}, master);
    const ah = await call('POST', '/estimator/ahsp', {
      kode: `TUG-${stamp}`, name: `AHSP usul ${stamp}`, satuan: 'm3',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'B',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 500000 }],
    }, master);
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ah.json?.id, qty: 2 }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);

    const terkunci = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`,
      master, PNG_KECIL, 'image/png', 'pondasi.png');
    chk('usulan pada proposal submitted ditolak 409', terkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', terkunci.json?.code, 'PROPOSAL_LOCKED');

    console.log('\n5. Kontrak desain terjaga di sumbernya');
    const { readFileSync } = await import('node:fs');
    const rute = readFileSync(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    const iBlok = rute.indexOf('usul-dari-gambar');
    const blok = rute.slice(Math.max(0, iBlok - 6000), iBlok + 4000);
    // Kuantitas WAJIB lewat kalkulator, bukan diambil dari jawaban AI.
    chk('pratinjau dihitung kalkulator, bukan dari AI', blok.includes("calculateMto('foundation'"), true);
    chk('promptnya melarang AI menghitung kuantitas',
      rute.includes('JANGAN menghitung volume'), true);
    chk('promptnya menegaskan satuan meter', rute.includes('SEMUA panjang dalam METER'), true);
    // Gambar tidak boleh disimpan ke disk.
    chk('gambar diproses di memori, tidak ditulis ke disk',
      rute.includes('multer.memoryStorage()'), true);

    const vue = readFileSync(
      new URL('../../frontend/src/components/projects/ProjectMTO.vue', import.meta.url), 'utf8');
    chk('layar menyimpan lewat endpoint MTO biasa saat disetujui',
      vue.includes('await api.post(`${baseUrl.value}/mto`,'), true);
    chk('layar menyatakan usulan belum tersimpan',
      vue.includes('Belum tersimpan.'), true);

  } finally {
    console.log('\n6. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
