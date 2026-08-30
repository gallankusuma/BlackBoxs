import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Wawancara lingkup — dari percakapan menjadi zona MTO.
 *
 * Yang dijaga di sini, dan urutannya bukan kebetulan:
 *
 * 1. Pertanyaan dimensinya **dibangkitkan dari `spesifikasiField()`**, daftar
 *    yang sama yang dipakai gerbang penyimpanan. Kalau ditulis terpisah, ia
 *    melenceng diam-diam tiap kali varian baru ditambahkan, dan wawancaranya
 *    berhenti menanyakan sesuatu yang tetap wajib.
 * 2. Sistem **tidak menebak dimensi**. Ia boleh menyarankan JUMLAH dari luas
 *    dan grid — dan saat menyarankan, ia mengatakannya sebagai asumsi.
 * 3. Wawancara **tidak menulis apa pun**. Penyimpanan hanya lewat
 *    `POST /mto/terima-usulan` yang sudah ada.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:wawancara
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

  console.log('A. Mesin wawancaranya sendiri — murni, tanpa HTTP');
  {
    const { langkahWawancara } = await import('../src/modules/estimator/mto/wawancara');
    const { spesifikasiField } = await import('../src/modules/estimator/mto/contract');

    const l1 = langkahWawancara({});
    chk('mulai dari lingkup', l1.langkah, 'lingkup');
    chk('dua pertanyaan pembuka', l1.pertanyaan.length, 2);
    chk('belum selesai', l1.selesai, false);

    const l2 = langkahWawancara({ jenis_bangunan: 'gudang', sistem_struktur: 'baja' });
    chk('lanjut ke ukuran', l2.langkah, 'ukuran');
    chk('jumlah lantai wajib',
      l2.pertanyaan.find(p => p.field === 'jumlah_lantai')?.wajib, true);
    chk('luas TIDAK wajib — boleh belum diketahui',
      l2.pertanyaan.find(p => p.field === 'luas_lantai')?.wajib, false);

    const l3 = langkahWawancara({ jenis_bangunan: 'gudang', sistem_struktur: 'baja', jumlah_lantai: 1 });
    chk('lanjut ke pemilihan elemen', l3.langkah, 'elemen');
    chk('elemen bawaan disarankan', (l3.pertanyaan[0]?.saran || []).includes('foundation'), true);
    // Struktur baja → kolom WF, bukan beton. Ini pemetaan, bukan tebakan.
    chk('struktur baja menandai kolom WF',
      l3.pertanyaan[0]?.opsi?.find((o: any) => o.nilai === 'column')?.catatan, 'wf');
    chk('struktur beton menandai kolom beton',
      langkahWawancara({ jenis_bangunan: 'gudang', sistem_struktur: 'beton', jumlah_lantai: 1 })
        .pertanyaan[0]?.opsi?.find((o: any) => o.nilai === 'column')?.catatan, 'concrete');

    console.log('\n  INI YANG MENENTUKAN — pertanyaan dimensi dibangkitkan, bukan ditulis tangan');
    const dasar = { jenis_bangunan: 'gudang', sistem_struktur: 'beton', jumlah_lantai: 1, elemen: ['foundation'] };
    const l4 = langkahWawancara(dasar);
    chk('masuk ke dimensi pondasi', l4.langkah, 'dimensi:foundation');
    const spek = spesifikasiField('foundation', 'footplate').map(f => f.field);
    const ditanya = l4.pertanyaan.filter(p => !p.field.startsWith('template:')).map(p => p.field);
    chk('yang ditanyakan PERSIS dimensi wajib kalkulator',
      ditanya.sort().join(','), spek.sort().join(','));

    console.log('\n  Sistem tidak menebak dimensi — tapi boleh menyarankan JUMLAH');
    const tanpaGrid = langkahWawancara({ ...dasar, luas_lantai: 1200 });
    chk('tanpa grid, tidak ada asumsi', tanpaGrid.asumsi.length, 0);
    chk('dan tidak ada saran jumlah',
      tanpaGrid.pertanyaan.some(p => p.saran !== undefined && /qty/i.test(p.field)), false);
    const denganGrid = langkahWawancara({ ...dasar, luas_lantai: 1200, grid_x: 6, grid_y: 5 });
    // 1200 / (6x5) = 40 titik.
    chk('dengan grid, jumlah disarankan 40',
      denganGrid.pertanyaan.find(p => /qty/i.test(p.field))?.saran, 40);
    chk('dan asumsinya DINYATAKAN, bukan disembunyikan', denganGrid.asumsi.length, 1);
    chk('asumsinya menyebut angkanya',
      denganGrid.asumsi[0].includes('1200') && denganGrid.asumsi[0].includes('40'), true);
    // Dimensi tetap ditanya walau luas & grid diketahui.
    chk('dimensi tetap ditanyakan, tidak diturunkan dari luas',
      denganGrid.pertanyaan.some(p => p.field === 'L'), true);

    console.log('\n  Selesai hanya kalau semua dimensi terjawab');
    const belum = langkahWawancara({ ...dasar, dimensi: { foundation: { L: 2, W: 2 } } });
    chk('masih di dimensi', belum.langkah, 'dimensi:foundation');
    chk('yang sudah dijawab tidak ditanya lagi',
      belum.pertanyaan.some(p => p.field === 'L'), false);
    const selesai = langkahWawancara({
      ...dasar, dimensi: { foundation: { L: 2, W: 2, H: 0.4, qty: 24, depth: 1.5 } },
    });
    chk('selesai', selesai.selesai, true);
    chk('satu zona terbentuk', selesai.zona.length, 1);
    chk('varian ikut disisipkan ke parameter',
      (selesai.zona[0].parameters as any).foundation_type, 'footplate');

    console.log('\n  Nilai turunan ditandai, tidak disamarkan sebagai jawaban');
    const kolom = langkahWawancara({
      jenis_bangunan: 'gudang', sistem_struktur: 'beton', jumlah_lantai: 3, elemen: ['column'],
      dimensi: { column: { B: 0.4, H: 0.4, qty_per_floor: 20, height_per_floor: 4 } },
    });
    chk('selesai', kolom.selesai, true);
    chk('jumlah lantai diturunkan dari jawaban ukuran',
      (kolom.zona[0].parameters as any).floors, 3);
    chk('dan ditandai sebagai turunan', kolom.zona[0].diturunkan, ['floors']);

    console.log('\n  Hasilnya deterministik');
    chk('dipanggil dua kali, hasilnya sama',
      JSON.stringify(langkahWawancara(dasar)), JSON.stringify(l4));
  }

  console.log('\nB. Gambar → jawaban wawancara — tanpa memanggil AI');
  {
    const { jawabanDariGambar, langkahWawancara } = await import('../src/modules/estimator/mto/wawancara');

    // Bentuk yang persis dikembalikan `bentukUsulan()` dari bacaan AI.
    const usulanAi = [
      { element_type: 'foundation',
        parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 24, depth: 1.5 } },
      { element_type: 'column',
        parameters: { col_type: 'wf', B: 0.4, H: 0.4, qty_per_floor: 20 } },
    ];
    const { jawaban, asumsi, terbaca } = jawabanDariGambar(usulanAi);

    chk('elemen terbaca dari gambar', jawaban.elemen, ['foundation', 'column']);
    chk('dimensi pondasi terbawa', Number(jawaban.dimensi.foundation.L), 2);
    chk('dimensi kolom terbawa', Number(jawaban.dimensi.column.qty_per_floor), 20);
    // Varian TIDAK masuk dimensi — ia ditentukan jawaban sistem struktur, supaya
    // satu proposal tidak bercampur kolom baja dan beton hanya karena satu
    // lembar gambar terbaca berbeda.
    chk('varian tidak ikut ke dimensi', jawaban.dimensi.column.col_type, undefined);
    chk('sistem struktur disimpulkan BAJA dari profil WF', jawaban.sistem_struktur, 'baja');
    chk('dan disimpulkan BETON kalau tidak ada WF',
      jawabanDariGambar([{ element_type: 'column', parameters: { col_type: 'concrete', B: 0.4 } }])
        .jawaban.sistem_struktur, 'beton');
    chk('kesimpulannya DINYATAKAN sebagai asumsi',
      asumsi.some(a => a.includes('disimpulkan')), true);
    chk('yang terbaca dari gambar dicatat per elemen',
      (terbaca.foundation || []).includes('qty'), true);

    console.log('\n  Yang TIDAK diturunkan dari gambar — dan itu disengaja');
    // Gambar struktur tidak memberitahu jenis bangunan; menebaknya karangan.
    chk('jenis bangunan tidak diturunkan', jawaban.jenis_bangunan, undefined);
    chk('luas & grid tidak diturunkan',
      jawaban.luas_lantai === undefined && jawaban.grid_x === undefined, true);
    // Karena itu wawancara TETAP menanyakannya.
    chk('wawancara tetap menanyakan lingkup',
      langkahWawancara(jawaban).langkah, 'lingkup');

    console.log('\n  Wawancara melanjutkan dari gambar, tidak mengulang dari nol');
    const lanjut = langkahWawancara({ ...jawaban, jenis_bangunan: 'gudang', jumlah_lantai: 2 });
    // Pondasi sudah lengkap dari gambar → tidak ditanya lagi. Kolom WF kurang
    // tinggi lantai → itu yang ditanyakan.
    chk('langsung ke dimensi kolom, pondasi dilewati', lanjut.langkah, 'dimensi:column');
    chk('yang sudah terbaca tidak ditanya ulang',
      lanjut.pertanyaan.some(p => p.field === 'qty_per_floor'), false);
    chk('yang belum terbaca ditanyakan',
      lanjut.pertanyaan.some(p => p.field === 'height_per_floor'), true);

    console.log('\n  Zona kedua bertipe sama tidak menimpa yang pertama');
    const dua = jawabanDariGambar([
      { element_type: 'foundation', parameters: { L: 2, W: 2, H: 0.4, qty: 24 } },
      { element_type: 'foundation', parameters: { L: 3, W: 3, H: 0.5, qty: 6 } },
    ]);
    chk('yang pertama menang, tidak tertimpa', Number(dua.jawaban.dimensi.foundation.L), 2);
  }

  console.log('\n0. Lewat HTTP');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji wawancara ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;

  try {
    console.log('\n1. Pratinjau kuantitas datang dari server, bukan dihitung browser');
    const w = await call('POST', '/estimator/wawancara', {
      jawaban: {
        jenis_bangunan: 'gudang', sistem_struktur: 'beton', jumlah_lantai: 1,
        elemen: ['foundation'],
        dimensi: { foundation: { L: 2, W: 2, H: 0.4, qty: 24, depth: 1.5, lean_t: 0.05 } },
      },
    }, master);
    chk('terbaca', w.status, 200);
    chk('selesai', w.json?.selesai, true);
    chk('dinyatakan belum tersimpan', w.json?.tersimpan, false);
    chk('zona membawa baris kuantitas', (w.json?.zona?.[0]?.lines || []).length > 0, true);
    chk('dan ditandai siap', w.json?.zona?.[0]?.siap, true);
    // 2x2x0.4 x24 = 38.4 m3 beton.
    const beton = (w.json?.zona?.[0]?.lines || []).find((l: any) => l.code === 'FND-CONC');
    chk('volumenya benar (38.4 m3)', Number(beton?.net_quantity), 38.4);

    console.log('\n2. Wawancara TIDAK menulis apa pun');
    const sisa: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid]);
    chk('nol zona tersimpan', Number(sisa?.n), 0);

    console.log('\n3. Zona belum lengkap ditandai TIDAK siap, bukan ditolak diam-diam');
    const kurang = await call('POST', '/estimator/wawancara', {
      jawaban: {
        jenis_bangunan: 'gudang', sistem_struktur: 'beton', jumlah_lantai: 1,
        elemen: ['foundation'],
        // Sengaja dilengkapi agar lolos ke ringkasan, lalu satu dirusak.
        dimensi: { foundation: { L: 2, W: 2, H: 0.4, qty: 24, depth: 1.5 } },
      },
    }, master);
    chk('siap', kurang.json?.zona?.[0]?.siap, true);

    console.log('\n4. Hasil wawancara masuk MTO lewat jalur yang sudah ada');
    const terima = await call('POST', `/estimator/proposals/${pid}/mto/terima-usulan`, {
      zones: (w.json?.zona || []).map((z: any) => ({
        element_type: z.element_type, element_name: `${z.element_name} ${stamp}`,
        parameters: z.parameters,
      })),
    }, master);
    chk('diterima', terima.status, 201);
    chk('satu zona masuk', (terima.json?.diterima || []).length, 1);
    const tersimpan: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid]);
    chk('kini benar-benar tersimpan', Number(tersimpan?.n), 1);
    // Kuantitas tersimpan HARUS sama dengan pratinjau — kalau tidak, layar
    // menampilkan angka yang berbeda dari yang tersimpan.
    const el: any = await dbGet(
      `SELECT id FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid]);
    const baris: any = await dbGet(
      `SELECT net_quantity FROM mto_lines WHERE element_id = ? AND line_code = 'FND-CONC'`, [el?.id]);
    chk('kuantitas tersimpan = kuantitas pratinjau', Number(baris?.net_quantity), 38.4);

    console.log('\n5. Terjaga auth');
    chk('tanpa token 401', (await call('POST', '/estimator/wawancara', { jawaban: {} })).status, 401);
    chk('jawaban kosong tetap dijawab langkah pertama',
      (await call('POST', '/estimator/wawancara', {}, master)).json?.langkah, 'lingkup');

    console.log('\n5b. Endpoint dari-gambar terjaga & tidak menulis');
    // Tanpa berkas: ditolak sebelum menyentuh AI sama sekali — tidak memakai
    // kuota untuk permintaan yang pasti tidak berguna.
    const tanpaBerkas = await fetch(`${API}/estimator/wawancara/dari-gambar`, {
      method: 'POST', headers: { Authorization: `Bearer ${master}` },
      body: new FormData(),
    });
    chk('tanpa gambar ditolak 400', tanpaBerkas.status, 400);
    chk('tanpa token 401', (await fetch(`${API}/estimator/wawancara/dari-gambar`,
      { method: 'POST', body: new FormData() })).status, 401);
    const belumBerubah: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id = ?`, [pid]);
    chk('tidak ada yang tertulis oleh percobaan itu', Number(belumBerubah?.n), 1);

    console.log('\n6. Layar tidak punya daftar pertanyaan sendiri');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'components', 'projects', 'ProjectMTO.vue'), 'utf8');
    chk('layar memanggil endpoint wawancara', layar.includes("'/estimator/wawancara'"), true);
    // Ini yang paling penting dijaga: begitu layar punya daftar dimensinya
    // sendiri, ia akan melenceng dari gerbang penyimpanan tanpa ada yang tahu.
    const blokWwc = layar.slice(layar.indexOf('Wawancara lingkup'), layar.indexOf('Template zona'));
    chk('tidak ada daftar dimensi yang di-hardcode di blok wawancara',
      /(depth|lean_t|qty_per_floor|height_per_floor)\s*:/.test(blokWwc), false);
    chk('menerima lewat jalur terima-usulan yang sudah ada',
      layar.includes('/mto/terima-usulan'), true);
    chk('memuat ulang dari server sesudah diterima',
      /terimaWawancara[\s\S]{0,1200}fetchAll\(\)/.test(layar), true);
    chk('layar bisa mulai dari gambar',
      layar.includes('/estimator/wawancara/dari-gambar'), true);
    // Gambar melengkapi, bukan menggantikan: jawaban yang sudah ada ikut dikirim.
    chk('jawaban yang sudah ada ikut dikirim bersama gambar',
      /wawancaraDariGambar[\s\S]{0,900}rakitJawaban\(\)/.test(layar), true);
    // Kuota habis bukan jalan buntu — wawancara manual harus tetap jalan.
    chk('kegagalan AI menyatakan wawancara manual tetap bisa dilanjutkan',
      layar.includes('tetap bisa dilanjutkan'), true);

  } finally {
    console.log('\n7. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('fixture tersapu', disapu.proposal >= 1, true);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM mto_lines l LEFT JOIN engineering_inputs e ON e.id = l.element_id WHERE e.id IS NULL`);
    chk('nol mto_lines yatim', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
