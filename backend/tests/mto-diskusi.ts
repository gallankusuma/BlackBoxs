import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-MTO-R50 — Tahap 2: interaksi dua arah pada asisten gambar MTO.
 *
 * Tahap 1 sengaja satu arah, dan konsekuensinya dilaporkan pengguna
 * 27 Agustus 2026: *"ketika gw masukan document dia memberikan resume dan ketika
 * ada yang kurang dan gw mau tambahkan tidak bisa, bahkan ketika gw apply juga
 * jadinya tidak bisa karena belum lengkap."*
 *
 * Gambar kerja sering tidak memuat semua dimensi — kedalaman galian, misalnya,
 * kerap hanya ada di spesifikasi terpisah. Usulan yang kurang satu field
 * karenanya bukan kasus tepi, melainkan kejadian normal. Tanpa jalan
 * menambahkannya, seluruh fiturnya berhenti di situ.
 *
 * Dua jalan keluar yang diuji di sini:
 *   1. `POST /mto/pratinjau` — hitung ulang untuk parameter apa pun, TANPA
 *      menyimpan, memakai kalkulator yang sama dengan input manual.
 *   2. `POST /mto/diskusi` — revisi lewat percakapan, juga tanpa menyimpan.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:diskusi
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

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji diskusi MTO ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  chk('proposal uji dibuat', !!pid, true);

  try {
    console.log('\n1. Persis keadaan yang membuat pengguna buntu: dimensi kurang');
    // Pondasi tanpa `qty` — footplate mewajibkannya.
    const kurang = await call('POST', `/estimator/proposals/${pid}/mto/pratinjau`, {
      element_type: 'foundation',
      parameters: { foundation_type: 'footplate', L: 1.2, W: 1.2, H: 0.3, depth: 1.5 },
    }, master);
    chk('pratinjau tetap dilayani, bukan ditolak', kurang.status, 200);
    chk('dan menyebut yang kurang', (kurang.json?.missing_required || []).length > 0, true);
    chk('yang kurang memang qty',
      (kurang.json?.missing_required || []).some((m: string) => m.includes('(qty)')), true);

    console.log('\n2. Layar diberi SPESIFIKASI field — inilah yang dulu tidak ada');
    const spek = kurang.json?.field_wajib || [];
    chk('spesifikasi field wajib dikirim', Array.isArray(spek) && spek.length > 0, true);
    const namaField = spek.map((f: any) => f.field).sort();
    chk('memuat keempat dimensi footplate', namaField, ['H', 'L', 'W', 'qty']);
    chk('tiap field punya label manusia', spek.every((f: any) => !!f.label), true);
    chk('dan jenis isiannya', spek.every((f: any) => ['angka', 'teks'].includes(f.jenis)), true);
    const opsional = kurang.json?.field_opsional || [];
    chk('field opsional ikut dikirim, dibedakan dari yang wajib',
      opsional.length > 0 && opsional.every((f: any) => f.wajib === false), true);
    chk('kedalaman galian termasuk opsional',
      opsional.some((f: any) => f.field === 'depth'), true);

    console.log('\n3. Melengkapi dimensinya membuka jalan buntu itu');
    const lengkap = await call('POST', `/estimator/proposals/${pid}/mto/pratinjau`, {
      element_type: 'foundation',
      parameters: { foundation_type: 'footplate', L: 1.2, W: 1.2, H: 0.3, depth: 1.5, qty: 8 },
    }, master);
    chk('tidak ada lagi yang kurang', lengkap.json?.missing_required, []);
    chk('pratinjau berisi baris', (lengkap.json?.pratinjau || []).length > 0, true);

    console.log('\n4. Angkanya dari kalkulator yang sama dengan input manual');
    const { calculateMto } = await import('../src/modules/estimator/mto/calculator');
    const acuan = calculateMto('foundation',
      { foundation_type: 'footplate', L: 1.2, W: 1.2, H: 0.3, depth: 1.5, qty: 8 });
    const galianEndpoint = (lengkap.json?.pratinjau || []).find((l: any) => l.code === 'FND-EXCV');
    const galianAcuan = acuan.lines.find(l => l.code === 'FND-EXCV');
    chk('galian sama persis dengan kalkulator',
      Number(galianEndpoint?.net_quantity), Number(galianAcuan?.net_quantity));
    chk('jumlah barisnya sama', (lengkap.json?.pratinjau || []).length, acuan.lines.length);

    console.log('\n5. Pratinjau TIDAK menyimpan apa pun');
    const sesudah: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    chk('nol elemen tersimpan', Number(sesudah?.n), 0);
    chk('responsnya menyatakan begitu', lengkap.json?.tersimpan, false);

    console.log('\n6. Parameter yang tidak masuk akal ditolak, bukan diam-diam dipakai');
    const negatif = await call('POST', `/estimator/proposals/${pid}/mto/pratinjau`, {
      element_type: 'foundation',
      parameters: { foundation_type: 'footplate', L: -5, W: 1, H: 0.3, qty: 2 },
    }, master);
    chk('ditolak 422', negatif.status, 422);
    chk('kodenya PARAMETER_TIDAK_VALID', negatif.json?.code, 'PARAMETER_TIDAK_VALID');

    const tipeAneh = await call('POST', `/estimator/proposals/${pid}/mto/pratinjau`,
      { element_type: 'pondasi_karangan', parameters: {} }, master);
    chk('tipe elemen tak dikenal ditolak 422', tipeAneh.status, 422);

    console.log('\n7. Endpoint diskusi ada dan terjaga');
    chk('tanpa token ditolak 401',
      (await call('POST', `/estimator/proposals/${pid}/mto/diskusi`, { pesan: 'halo' })).status, 401);
    chk('pesan kosong ditolak 400',
      (await call('POST', `/estimator/proposals/${pid}/mto/diskusi`, { pesan: '   ' }, master)).status, 400);
    const tanpaPesan = await call('POST', `/estimator/proposals/${pid}/mto/diskusi`, {}, master);
    chk('kodenya PESAN_WAJIB', tanpaPesan.json?.code, 'PESAN_WAJIB');

    console.log('\n8. Diskusi juga tidak menyimpan apa pun');
    const sebelumDiskusi: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    const diskusi = await call('POST', `/estimator/proposals/${pid}/mto/diskusi`, {
      pesan: 'Kedalaman galian P1 1,5 meter.',
      zona: [{ element_name: 'P1', foundation_type: 'footplate',
               parameters: { L: 1.2, W: 1.2, H: 0.3, qty: 8 } }],
      riwayat: [],
    }, master);
    const sesudahDiskusi: any = await dbGet(
      `SELECT COUNT(*) n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    chk('nol elemen tersimpan', Number(sesudahDiskusi?.n), Number(sebelumDiskusi?.n));
    if (diskusi.status === 200) {
      chk('responsnya menyatakan belum tersimpan', diskusi.json?.tersimpan, false);
      chk('membawa usulan', Array.isArray(diskusi.json?.usulan), true);
      chk('dan balasan untuk pengguna', typeof diskusi.json?.balasan === 'string', true);
      // Bentuknya harus setara dengan jalur gambar — kalau tidak, layar akan
      // menampilkan usulan yang tidak bisa disunting.
      const u = (diskusi.json?.usulan || [])[0];
      if (u) {
        chk('usulan diskusi membawa spesifikasi field juga', Array.isArray(u.field_wajib), true);
        chk('dan pratinjau kuantitas', Array.isArray(u.pratinjau), true);
      }
    } else {
      console.log(`  ––   AI tidak menjawab 200 (HTTP ${diskusi.status}) — bagian bentuk dilewati`);
      chk('kegagalannya punya pesan yang bisa dibaca', typeof diskusi.json?.error === 'string', true);
    }

    console.log('\n9. Proposal terkunci menolak diskusi maupun usulan');
    const ahsp = await call('POST', '/estimator/ahsp', {
      kode: `DSK.${stamp}`, name: `AHSP Diskusi ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'B',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 500000 }],
    }, master);
    await call('POST', `/estimator/proposals/${pid}/items`,
      { ahsp_id: ahsp.json?.id ?? ahsp.json?.data?.id, qty: 2 }, master);
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const terkunci = await call('POST', `/estimator/proposals/${pid}/mto/diskusi`,
      { pesan: 'ubah kedalaman' }, master);
    chk('diskusi pada proposal submitted ditolak 409', terkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', terkunci.json?.code, 'PROPOSAL_LOCKED');
    // Pratinjau BOLEH tetap dilayani — ia hanya membaca, dan melarangnya akan
    // membuat layar proposal terkunci berhenti menampilkan angka.
    const pratinjauTerkunci = await call('POST', `/estimator/proposals/${pid}/mto/pratinjau`,
      { element_type: 'foundation', parameters: { foundation_type: 'footplate', L: 1, W: 1, H: 0.3, qty: 1 } }, master);
    chk('pratinjau tetap boleh dibaca', pratinjauTerkunci.status, 200);

    console.log('\n9b. Prompt diskusi memuat KATALOG FIELD — bukan hanya prompt gambar');
    // Tanpa katalog, AI yang diminta menyusun zona dari nol tidak tahu nama
    // field yang dipakai kalkulator dan mengembalikan parameter bernama lain.
    // Zonanya tetap terbentuk dan pratinjaunya tetap ada — tapi seluruh
    // dimensinya terhitung "belum diisi" dan angkanya berdiri di atas asumsi.
    // Terlihat saat mencoba: enam zona lintas tipe terbentuk rapi, tapi tiap
    // zonanya melaporkan 1–4 dimensi wajib kurang padahal semuanya disebutkan.
    const { readFileSync: baca } = await import('node:fs');
    const rute = baca(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    chk('kedua prompt memakai katalog yang sama',
      /const promptGambar[\s\S]{0,400}katalogRingkas\(\)/.test(rute)
      && /const promptDiskusi[\s\S]{0,900}katalogRingkas\(\)/.test(rute), true);
    chk('katalognya dibangkitkan dari kontrak, bukan ditulis tangan',
      rute.includes('const katalogRingkas = () => katalogElemen()'), true);
    chk('prompt diskusi menegaskan memakai nama field persis',
      rute.includes('pakai NAMA FIELD PERSIS'), true);

    console.log('\n9c. Jalur DISKUSI ikut berlapis, bukan hanya pembacaan gambar');
    // Diskusi justru yang paling sering dipanggil: satu pembacaan gambar bisa
    // diikuti sepuluh giliran diskusi, dan tiap giliran memakai satu kuota.
    // Melapisi separuh sistem berarti separuhnya masih berhenti total saat
    // kuota habis.
    const ai = baca(new URL('../src/routes/ai.routes.ts', import.meta.url), 'utf8');
    chk('ada lapisan untuk jalur teks', ai.includes('export async function jalankanTeksAi'), true);
    chk('jalur OpenAI teks ada', ai.includes('export async function callOpenAiText'), true);
    chk('endpoint diskusi memakai lapisan, bukan satu penyedia langsung',
      rute.includes('await jalankanTeksAi(') && !rute.includes('await callGeminiText('), true);
    chk('perilakunya sama dengan lapisan gambar — hanya kuota yang di-fallback',
      (ai.match(/if \(!galatKuota\(e\)\) throw e;/g) || []).length, 2);
    chk('penyedia yang gagal dicatat di kedua lapisan',
      (ai.match(/e\.penyediaGagal = p;/g) || []).length, 2);
    chk('penyedia yang dipakai dilaporkan juga di diskusi',
      rute.includes('penyedia: penyediaDiskusi'), true);

    console.log('\n10. Layar benar-benar memakai jalur ini');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/components/projects/ProjectMTO.vue', import.meta.url), 'utf8');
    chk('dimensinya bisa disunting', vue.includes('const ubahParameter'), true);
    chk('pratinjau dihitung ULANG DI SERVER, bukan di browser',
      vue.includes("api.post(`${baseUrl.value}/mto/pratinjau`"), true);
    chk('formulirnya memakai spesifikasi dari server, bukan daftar sendiri',
      vue.includes('const fieldTampil') && vue.includes('u.field_wajib'), true);
    chk('ada kotak diskusi', vue.includes('const kirimDiskusi'), true);
    chk('Terima dinonaktifkan saat belum lengkap',
      vue.includes("(u.missing_required?.length || 0) > 0"), true);
    chk('dan alasannya terbaca, bukan tombol mati tanpa penjelasan',
      vue.includes("'Lengkapi dulu: '"), true);
    chk('suntingan di-debounce, tidak menembak tiap ketukan', vue.includes('timerHitung'), true);

  } finally {
    console.log('\n11. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('fixture tersapu', disapu.proposal >= 1, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
