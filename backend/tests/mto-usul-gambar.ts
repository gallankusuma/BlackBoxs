import 'dotenv/config';
import { sapuFixture } from './_bersih';
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

/** Kirim multipart tanpa pustaka tambahan — satu atau banyak berkas. */
async function kirimGambar(
  path: string, token: string,
  berkas: Buffer | Array<{ isi: Buffer; mime: string; nama: string }>,
  mime?: string, namaBerkas?: string,
) {
  const daftar = Array.isArray(berkas)
    ? berkas
    : [{ isi: berkas, mime: mime as string, nama: namaBerkas as string }];
  const batas = '----uji' + Date.now();
  const bagian: Buffer[] = [];
  for (const b of daftar) {
    bagian.push(Buffer.from(
      `--${batas}\r\nContent-Disposition: form-data; name="gambar"; filename="${b.nama}"\r\n` +
      `Content-Type: ${b.mime}\r\n\r\n`));
    bagian.push(b.isi);
    bagian.push(Buffer.from('\r\n'));
  }
  bagian.push(Buffer.from(`--${batas}--\r\n`));
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${batas}`, Authorization: `Bearer ${token}` },
    body: Buffer.concat(bagian),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// PDF minimal yang sah — cukup untuk menguji kontrak unggahan.
const PDF_KECIL = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

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

    console.log('\n2. PDF kini DITERIMA — gambar kerja memang beredar sebagai PDF (EST-MTO-R55)');
    const pdf = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`,
      master, PDF_KECIL, 'application/pdf', 'gambar-kerja.pdf');
    chk('PDF tidak lagi ditolak sebagai tipe berkas', pdf.status !== 400, true);

    const bukanGambar = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`,
      master, Buffer.from('ini bukan gambar'), 'text/plain', 'catatan.txt');
    chk('berkas teks tetap ditolak', bukanGambar.status >= 400, true);

    console.log('\n2b. Banyak lembar sekaligus');
    const banyak = await kirimGambar(`/estimator/proposals/${pid}/mto/usul-dari-gambar`, master, [
      { isi: PNG_KECIL, mime: 'image/png', nama: 'denah-pondasi.png' },
      { isi: PNG_KECIL, mime: 'image/png', nama: 'tabel-schedule.png' },
      { isi: PDF_KECIL, mime: 'application/pdf', nama: 'potongan.pdf' },
    ]);
    chk('tiga lembar diterima tanpa ditolak batas berkas', banyak.status !== 400, true);

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
      kode: `TUG-${stamp}`, name: `AHSP usul ${stamp}`, satuan: 'm3', status: 'active',
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
    // Kuantitas WAJIB lewat kalkulator, bukan diambil dari jawaban AI.
    //
    // Diperiksa lewat KONTRAKNYA, bukan posisinya di berkas: pembentuk usulan
    // kini dipakai dua jalur (gambar dan diskusi), jadi mencarinya dalam
    // jendela di sekitar endpoint akan patah setiap kali kodenya dirapikan —
    // padahal invariannya tidak berubah.
    const iBentuk = rute.indexOf('function bentukUsulan');
    chk('ada satu pembentuk usulan bersama', iBentuk > 0, true);
    const blokBentuk = rute.slice(iBentuk, rute.indexOf('\n}', iBentuk));
    // Sejak EST-MTO-R53 tipenya tidak lagi dipaku ke pondasi, jadi yang
    // diperiksa keberadaan panggilan kalkulatornya — bukan tipe tertentu.
    chk('pratinjau dihitung kalkulator, bukan dari AI',
      /calculateMto\(\s*tipe\s*,\s*parameters\s*\)/.test(blokBentuk), true);
    chk('dan usulan tidak pernah membawa kuantitas dari AI',
      !/quantit|volume\s*:/i.test(blokBentuk.replace(/\/\/.*$/gm, '')), true);
    chk('promptnya melarang AI menghitung kuantitas',
      rute.includes('JANGAN menghitung volume'), true);

    console.log('\n5b. Cakupan: SELURUH tipe elemen, bukan pondasi saja (EST-MTO-R53)');
    const { katalogElemen } = await import('../src/modules/estimator/mto/contract');
    const { calculateMto } = await import('../src/modules/estimator/mto/calculator');
    const katalog = katalogElemen();
    chk('katalog memuat enam tipe elemen', katalog.length, 6);

    // Prompt DIBANGKITKAN dari katalog, bukan ditulis tangan — kalau ditulis
    // tangan ia melenceng diam-diam tiap kali varian baru ditambahkan.
    chk('prompt dibangkitkan dari katalog, bukan hardcode',
      rute.includes('katalogElemen()') && rute.includes('const promptGambar'), true);
    chk('tidak ada lagi prompt khusus pondasi', rute.includes('const promptPondasi'), false);
    chk('pembentuk usulan tidak lagi memaku tipe ke foundation',
      rute.includes("calculateMto('foundation', parameters)"), false);

    // Berapa banyak baris pekerjaan yang sebenarnya bisa dihasilkan kalkulator.
    // Angka ini yang menentukan seberapa rinci BOQ dari sebuah gambar.
    const contoh: Array<[string, any]> = [
      ['foundation', { foundation_type: 'footplate', L: 1.2, W: 1.2, H: 0.3, depth: 1.5, qty: 8, tb_length: 120, tb_w: 0.25, tb_h: 0.4 }],
      ['column', { col_type: 'concrete', B: 0.4, H: 0.4, qty_per_floor: 12, height_per_floor: 4 }],
      ['column', { col_type: 'wf', wf_profile: 'WF 300x150', qty_per_floor: 8, height_per_floor: 6 }],
      ['beam', { beam_type: 'concrete', total_length: 180, B: 0.25, H: 0.5 }],
      ['slab', { slab_type: 'concrete', area: 600, thickness: 0.12 }],
      ['wall', { wall_type: 'bata_ringan', area: 450, thickness_cm: 15 }],
      ['roof', { roof_type: 'dak', floor_area: 400, slope_deg: 0, dak_thick: 0.12 }],
    ];
    let totalBaris = 0;
    const kosong: string[] = [];
    for (const [tipe, param] of contoh) {
      const m: any = calculateMto(tipe, param);
      totalBaris += m.lines.length;
      if (!m.lines.length) kosong.push(`${tipe}/${m.variant}`);
    }
    chk('tujuh contoh elemen menghasilkan ≥30 baris pekerjaan', totalBaris >= 30, true);
    // `chk` di berkas ini membandingkan dengan `===`, jadi array dibandingkan
    // sebagai teks — dua array kosong tidak pernah `===` satu sama lain.
    chk('tidak ada contoh yang menghasilkan nol baris', kosong.join(', '), '');

    // Varian yang belum punya formula tidak boleh ditawarkan ke AI —
    // mengusulkannya hanya menghasilkan zona berkuantitas nol.
    chk('varian tanpa field wajib disaring dari prompt',
      rute.includes('.filter(v => v.wajib.length > 0)'), true);
    chk('promptnya menegaskan satuan meter', rute.includes('SEMUA panjang dalam METER'), true);
    // Gambar tidak boleh disimpan ke disk.
    chk('gambar diproses di memori, tidak ditulis ke disk',
      rute.includes('multer.memoryStorage()'), true);

    console.log('\n5c. Kekuatan pembacaan (EST-MTO-R55)');
    chk('menerima PDF', rute.includes("'application/pdf'"), true);
    chk('menerima banyak lembar', rute.includes("unggahGambar.array('gambar', 10)"), true);
    chk('prompt menyilangkan antar lembar',
      rute.includes('SILANGKAN antar lembar'), true);
    chk('dan menuntut menyebut lembar asal angkanya',
      rute.includes('LEMBAR MANA angkanya dibaca'), true);
    chk('pertentangan denah vs tabel tidak dipilih diam-diam',
      rute.includes('pakai tabel schedule dan'), true);

    const ai = readFileSync(new URL('../src/routes/ai.routes.ts', import.meta.url), 'utf8');
    const blokVisi = ai.slice(ai.indexOf('export async function callGeminiVision'));
    chk('penalaran DINYALAKAN untuk pembacaan gambar',
      /thinkingConfig:\s*\{\s*thinkingBudget:\s*(?!0\b)\d+/.test(blokVisi), true);
    chk('keluarannya diberi ruang cukup supaya tidak terpotong',
      /maxOutputTokens:\s*(1638[4-9]|[2-9]\d{4,})/.test(blokVisi), true);

    console.log('\n5c-2. Balasan AI dibaca tahan pembungkus');
    // Terlihat saat smoke AI pertama dijalankan: HTTP 502 "tidak bisa dibaca"
    // pada berkas yang panggilan mentahnya justru menghasilkan JSON valid.
    // Sebabnya model membungkus jawabannya — `responseMimeType: application/json`
    // biasanya cukup, tapi tidak dijamin. Menolaknya mentah-mentah membuat
    // seluruh pembacaan gagal karena tiga karakter pembungkus.
    chk('ada pembaca JSON yang toleran', rute.includes('function bacaJsonAi'), true);
    chk('pagar markdown dibuang', rute.includes('```'), true);
    chk('dan blok objek dicari kalau ada teks pengantar',
      rute.includes("bersih.indexOf('{')"), true);
    chk('kegagalan membawa cuplikan untuk didiagnosis',
      rute.includes('cuplikan: dibaca.cuplikan'), true);
    chk('bagian penalaran dibuang dari jawaban',
      ai.includes('p.thought !== true'), true);

    console.log('\n5c-3. Penyedia AI bisa lebih dari satu, dengan cadangan otomatis');
    // Satu penyedia berarti satu titik gagal yang menghentikan seluruh fitur.
    // Kuota free tier Gemini berkali-kali habis selama fitur ini dikembangkan —
    // termasuk saat mencoba membaca gambar sungguhan milik user.
    chk('ada lapisan pemilih penyedia', ai.includes('export async function bacaGambarAi'), true);
    chk('jalur OpenAI ada', ai.includes('export async function callOpenAiVision'), true);
    chk('memakai Responses API supaya PDF bisa dibaca',
      ai.includes("path: '/v1/responses'") && ai.includes("type: 'input_file'"), true);
    chk('endpoint memakai pemilih, bukan memanggil satu penyedia langsung',
      rute.includes('await bacaGambarAi(') && !rute.includes('await callGeminiVision('), true);

    // Kegagalan SELAIN kuota tidak boleh di-fallback: kalau gambarnya memang
    // tidak terbaca, mencoba penyedia kedua hanya menghabiskan kuota kedua
    // untuk jawaban yang sama.
    // Awalnya HANYA kegagalan kuota yang di-fallback, dan itu terlalu sempit.
    // Ketahuan saat user meminta OpenAI dijadikan penyedia utama: kalau
    // kuncinya ditolak sementara aturannya hanya mem-fallback kuota, sistem
    // berhenti total di penyedia pertama dan tidak pernah mencoba yang kedua —
    // menjadikan OpenAI utama justru akan MEMATIKAN fitur yang tadinya jalan.
    chk('kunci ditolak juga memicu perpindahan penyedia',
      ai.includes('export function galatKunci'), true);
    chk('keduanya disatukan sebagai "penyedia tidak tersedia"',
      ai.includes('export function penyediaTakTersedia'), true);
    chk('dipakai kedua lapisan',
      (ai.match(/if \(!penyediaTakTersedia\(e\)\) throw e;/g) || []).length, 2);
    // Tapi kegagalan ISI tetap tidak di-fallback — mencoba penyedia kedua untuk
    // gambar yang memang tidak terbaca hanya menghabiskan kuota kedua.
    chk('kegagalan selain ketersediaan tetap dilempar',
      ai.includes('if (!penyediaTakTersedia(e)) throw e;'), true);

    // Penyedia yang gagal ditempelkan ke errornya. Tanpa ini pesannya
    // menyesatkan — terjadi sungguhan saat menguji: Gemini kehabisan kuota,
    // cadangan OpenAI menolak kunci, dan yang sampai ke pengguna adalah
    // "kunci ditolak Google" padahal kunci Google baik-baik saja.
    chk('penyedia yang gagal ikut dicatat di error', ai.includes('e.penyediaGagal = p'), true);
    chk('pesan error menunjuk penyedia yang benar',
      /penyediaGagal/.test(rute) && /'OpenAI'/.test(rute) && /'Gemini'/.test(rute), true);
    // Lanjutan: kalau penyedia utama sudah dicoba dan gagal lebih dulu, itu
    // disebutkan juga. Operator yang menyetel OpenAI sebagai utama lalu membaca
    // "Kuota Gemini habis" akan mencari masalah di tempat yang salah.
    chk('seluruh penyedia yang dicoba ditempelkan ke error',
      ai.includes('e.dicoba = [...dicoba]'), true);
    chk('dan rantainya disebut di pesan',
      rute.includes('sudah dicoba lebih dulu dan juga gagal'), true);
    chk('serta dilaporkan sebagai data', rute.includes('penyedia_dicoba'), true);
    chk('penyedia yang dipakai dilaporkan ke pemanggil',
      rute.includes('penyedia: penyediaDipakai'), true);

    console.log('\n5d. Field OPSIONAL ikut dikenalkan — bukan hanya yang wajib');
    // Terlihat saat menguji dengan gambar dua lembar: tabel schedule jelas
    // mencantumkan KEDALAMAN 1800 mm, tapi `depth` tidak pernah dikembalikan
    // karena model tidak tahu field itu ada. Padahal tanpa `depth` kalkulator
    // jatuh ke tebal footing sebagai perkiraan — dan galiannya meleset 5x.
    const { spesifikasiOpsional: opsi } = await import('../src/modules/estimator/mto/contract');
    chk('prompt menyebut field opsional', rute.includes('opsional (isi kalau ada di gambar)'), true);
    chk('pondasi menawarkan depth', opsi('foundation').some(f => f.field === 'depth'), true);
    let totalOpsional = 0;
    for (const t of ['foundation', 'column', 'beam', 'slab', 'wall', 'roof']) {
      const n = opsi(t).length;
      chk(`${t} punya field opsional`, n > 0, true);
      totalOpsional += n;
    }
    chk('seluruhnya ≥30 field opsional dikenalkan', totalOpsional >= 30, true);

    // Bukti bahwa `depth` memang menentukan, bukan sekadar pelengkap.
    const dgnDepth: any = calculateMto('foundation',
      { foundation_type: 'footplate', L: 1.5, W: 1.5, H: 0.35, qty: 6, depth: 1.8 });
    const tanpaDepth: any = calculateMto('foundation',
      { foundation_type: 'footplate', L: 1.5, W: 1.5, H: 0.35, qty: 6 });
    const galian = (m: any) => m.lines.find((l: any) => l.code === 'FND-EXCV').net_quantity;
    chk('galian dengan depth jauh lebih besar daripada tanpa',
      galian(dgnDepth) > galian(tanpaDepth) * 4, true);
    chk('dan tanpa depth kalkulator memperingatkan',
      tanpaDepth.notes.some((n: string) => n.includes('Kedalaman galian tidak diisi')), true);

    const vue = readFileSync(
      new URL('../../frontend/src/components/projects/ProjectMTO.vue', import.meta.url), 'utf8');
    chk('layar menyimpan lewat endpoint MTO biasa saat disetujui',
      vue.includes('await api.post(`${baseUrl.value}/mto`,'), true);
    chk('tombol usul tidak lagi terkunci di tab Pondasi',
      vue.includes(`activeTab === 'foundation'`), false);
    chk('usulan yang disetujui berpindah ke tab tipenya',
      vue.includes('activeTab.value = u.element_type'), true);
    chk('tipe yang belum didukung ditandai, bukan dibuang',
      vue.includes('tipe_dikenal === false'), true);
    chk('layar menyatakan usulan belum tersimpan',
      vue.includes('Belum tersimpan.'), true);

  } finally {
    console.log('\n6. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
  }

  // Sisa fixture disapu langsung di database — termasuk yang API-nya memang
  // menolak menghapus (proposal submitted/deal). Tanpa ini database dev
  // bertumbuh monoton tiap run; lihat `tests/_bersih.ts`.
  const disapu = await sapuFixture(stamp);
  if (disapu.proposal || disapu.elemen || disapu.ahsp) {
    console.log(`  ––   sisa fixture disapu: ${disapu.proposal} proposal, `
      + `${disapu.elemen} elemen MTO, ${disapu.baris} baris, ${disapu.ahsp} AHSP`);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
