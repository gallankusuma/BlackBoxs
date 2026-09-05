import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * General Layout MTO (EST-MTO-LAYOUT-01).
 *
 * Kerangka bangunan per zona: panjang, lebar, tinggi, jarak kolom → jumlah
 * kolom, bentang balok, dan luasan DITURUNKAN.
 *
 * Yang dijaga di sini bukan "endpointnya menjawab", melainkan empat sifat yang
 * kalau hilang membuat angkanya terbaca lebih pasti daripada yang sebenarnya:
 *
 *   1. Jarak kolom yang diisi adalah TARGET. Bangunan 20 m dengan target 6 m
 *      dibagi rata jadi 3 bentang @ 6,667 m — dan selisihnya DISEBUTKAN.
 *      Menampilkan target seolah-olah itu yang terpasang membuat orang memesan
 *      kolom di posisi yang salah.
 *   2. Sifat angka yang belum bersih disebut: luas dinding masih KOTOR (bukaan
 *      belum dikurangi) dan luas atap cuma PROYEKSI DATAR.
 *   3. Hasil hitung TIDAK DISIMPAN — hanya parameternya. Angka turunan yang
 *      disimpan akan melenceng dari rumusnya begitu rumusnya diperbaiki.
 *   4. Kalkulatornya SATU dan ada di server. Layar tidak boleh menghitung
 *      sendiri; kalau ia menghitung, angka di layar dan angka tersimpan bisa
 *      berbeda tanpa ada yang menyadarinya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-layout
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
  return { status: res.status, json };
}

async function main() {
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const stamp = Date.now().toString().slice(-6);

  // ── 1. Matematika grid ──────────────────────────────────────────────────
  console.log('\n1. Jumlah kolom & balok diturunkan dari dimensi');
  const hitung = async (p: any) =>
    (await call('POST', '/estimator/mto/layout/pratinjau', { parameters: p }, master)).json?.data;

  // 40 m / 8 m = 5 bentang → 6 garis; 20 m / 10 m = 2 bentang → 3 garis.
  const gudang = await hitung({ panjang: 40, lebar: 20, tinggi: 6, jarak_kolom_x: 8, jarak_kolom_y: 10 });
  chk('gudang 40x20 grid 8x10 → 6 x 3 garis',
    [gudang?.grid?.garis_kolom_x, gudang?.grid?.garis_kolom_y], [6, 3]);
  chk('  jumlah kolom 18', gudang?.grid?.jumlah_kolom, 18);
  // Arah X: 3 garis Y x 5 bentang = 15; arah Y: 6 garis X x 2 bentang = 12.
  chk('  batang balok 27', gudang?.balok?.jumlah_total, 27);
  chk('  panjang balok 240 m (3x40 + 6x20)', gudang?.balok?.panjang_total, 240);
  chk('  luas lantai 800, keliling 120, dinding 720',
    [gudang?.luas?.lantai_total, gudang?.luas?.keliling, gudang?.luas?.dinding_kotor], [800, 120, 720]);

  // ── 2. Jarak yang diisi adalah TARGET ───────────────────────────────────
  console.log('\n2. Jarak kolom yang diisi adalah target, bukan hasil');
  const takPas = await hitung({ panjang: 20, lebar: 12, tinggi: 4, jarak_kolom_x: 6, jarak_kolom_y: 6 });
  chk('20 m target 6 m → 3 bentang', takPas?.grid?.bentang_x, 3);
  chk('  jarak aktual 6.667 m, bukan 6', takPas?.grid?.jarak_aktual_x, 6.667);
  chk('  target tetap dilaporkan apa adanya', takPas?.grid?.jarak_target_x, 6);
  // Inti bagian ini: selisihnya harus DIKATAKAN. Diam-diam membagi rata membuat
  // orang mengira kolomnya berjarak 6 m.
  chk('  selisih target vs aktual disebutkan',
    (takPas?.catatan || []).some((c: string) => /jarak aktual 6\.667/.test(c)), true);
  chk('  arah lebar yang sudah pas TIDAK ikut diberi catatan',
    (takPas?.catatan || []).some((c: string) => /Arah lebar/.test(c)), false);

  // Aturan pembulatannya sendiri harus diuji: 20 / 7 = 2,857 bentang.
  // Dibulatkan KE ATAS (3 bentang @ 6,667 m) jaraknya meleset 0,33 m dari
  // target; dibulatkan ke bawah (2 bentang @ 10 m) meleset 3 m — bentang 43%
  // lebih panjang dari yang diminta, dan itu bukan bangunan yang sama.
  // Tanpa kasus ini, `Math.round` dan `Math.floor` menghasilkan angka identik
  // di seluruh kasus lain dan mutasinya lolos.
  //
  // Arah lebar menguji sisi sebaliknya: 13 / 6 = 2,167 → dibulatkan ke 2 bentang
  // @ 6,5 m. Dibulatkan ke atas jadi 3 bentang @ 4,33 m — jauh lebih rapat dari
  // yang diminta, dan itu juga bukan bangunan yang sama. Kedua arah sengaja
  // dipilih dengan pecahan di sisi berbeda supaya `floor` dan `ceil` sama-sama
  // tertangkap; tanpa itu keduanya menghasilkan angka identik dengan `round`.
  const pembulatan = await hitung({ panjang: 20, lebar: 13, tinggi: 4, jarak_kolom_x: 7, jarak_kolom_y: 6 });
  chk('20 m target 7 m dibulatkan ke 3 bentang, bukan 2', pembulatan?.grid?.bentang_x, 3);
  chk('  jarak aktual 6.667 m (bukan 10 m)', pembulatan?.grid?.jarak_aktual_x, 6.667);
  chk('  garis kolom arah panjang 4', pembulatan?.grid?.garis_kolom_x, 4);
  chk('13 m target 6 m dibulatkan ke 2 bentang, bukan 3', pembulatan?.grid?.bentang_y, 2);
  chk('  jarak aktual 6.5 m (bukan 4.333 m)', pembulatan?.grid?.jarak_aktual_y, 6.5);

  // ── 3. Sifat angka yang belum bersih disebut ────────────────────────────
  console.log('\n3. Angka yang belum bersih disebut apa adanya');
  chk('luas dinding disebut KOTOR',
    (gudang?.catatan || []).some((c: string) => /KOTOR/.test(c)), true);
  chk('luas atap disebut proyeksi datar',
    (gudang?.catatan || []).some((c: string) => /proyeksi datar/i.test(c)), true);

  const bertingkat = await hitung({ panjang: 24, lebar: 16, tinggi: 3.5, jarak_kolom_x: 8, jarak_kolom_y: 8, jumlah_lantai: 3 });
  chk('3 lantai → kolom dikali lantai (12 x 3)', bertingkat?.grid?.jumlah_kolom, 36);
  chk('  tinggi diperlakukan PER LANTAI, dan itu dikatakan',
    (bertingkat?.catatan || []).some((c: string) => /tinggi PER LANTAI/i.test(c)), true);

  // ── 4. Dimensi kurang ditolak dengan menyebut yang kurang ───────────────
  console.log('\n4. Dimensi yang kurang disebutkan, bukan dihitung jadi nol');
  const kurang = await hitung({ panjang: 30, tinggi: 4 });
  chk('belum bisa dihitung', kurang?.ok, false);
  chk('  menyebut field yang kurang', (kurang?.kurang || []).sort(), ['jarak_kolom_x', 'jarak_kolom_y', 'lebar']);
  chk('  jumlah kolom tidak dikarang jadi angka', kurang?.grid?.jumlah_kolom, 0);

  // ── 5. Simpan & baca ulang: hasil DIHITUNG, bukan disimpan ──────────────
  console.log('\n5. Yang disimpan hanya parameter; hasilnya dihitung saat dibaca');
  const clientId = Number(((await dbGet('SELECT id FROM clients ORDER BY id DESC LIMIT 1')) as any)?.id);
  const p = await call('POST', '/estimator/proposals', { project_name: `LAYOUT-${stamp}`, client_id: clientId }, master);
  const pid = p.json?.id ?? p.json?.data?.id;
  chk('proposal uji dibuat', !!pid, true);

  const simpan = await call('PUT', `/estimator/proposals/${pid}/mto/layout`,
    { zone_name: 'Gudang A', parameters: { panjang: 40, lebar: 20, tinggi: 6, jarak_kolom_x: 8, jarak_kolom_y: 10 } }, master);
  chk('layout tersimpan', simpan.status, 200);

  const baris = await dbGet(
    "SELECT parameters FROM mto_layouts WHERE scope_type='proposal' AND scope_id = ? AND zone_name = 'Gudang A'",
    [pid]) as any;
  const par = typeof baris?.parameters === 'string' ? JSON.parse(baris.parameters) : baris?.parameters;
  chk('  parameter tersimpan', [par?.panjang, par?.jarak_kolom_x], [40, 8]);
  // Angka turunan yang disimpan akan melenceng dari rumusnya begitu rumusnya
  // diperbaiki, dan selisihnya tidak bisa dijelaskan siapa pun.
  chk('  hasil hitung TIDAK ikut tersimpan',
    ['jumlah_kolom', 'grid', 'balok', 'luas'].filter(k => k in (par || {})), []);

  const baca = (await call('GET', `/estimator/proposals/${pid}/mto/layout`, undefined, master)).json?.data?.[0];
  chk('  dibaca ulang: hasilnya ikut dihitung', baca?.hasil?.grid?.jumlah_kolom, 18);
  chk('  zona ikut terbaca', baca?.zone_name, 'Gudang A');

  // Satu zona satu layout — menyimpan ulang MENGGANTI, tidak menggandakan.
  await call('PUT', `/estimator/proposals/${pid}/mto/layout`,
    { zone_name: 'Gudang A', parameters: { panjang: 60, lebar: 20, tinggi: 6, jarak_kolom_x: 10, jarak_kolom_y: 10 } }, master);
  const setelah = (await call('GET', `/estimator/proposals/${pid}/mto/layout`, undefined, master)).json?.data;
  chk('  simpan ulang mengganti, tidak menggandakan', setelah?.length, 1);
  chk('  angkanya ikut berubah', setelah?.[0]?.hasil?.grid?.jumlah_kolom, 21);

  // ── 6. Layout BUKAN elemen MTO ──────────────────────────────────────────
  console.log('\n6. Layout tidak muncul sebagai elemen MTO');
  // Kalau ia jadi element_type ke-7, ia akan muncul sebagai baris tanpa material
  // di daftar take-off dan setiap penjumlahan harus mengecualikannya satu per satu.
  const elemen = (await call('GET', `/estimator/proposals/${pid}/mto`, undefined, master)).json;
  const daftar = elemen?.elements || elemen?.data || [];
  chk('daftar elemen MTO tetap kosong', Array.isArray(daftar) ? daftar.length : -1, 0);
  const diEngineering = await dbGet(
    "SELECT COUNT(*) c FROM engineering_inputs WHERE proposal_id = ? AND element_type = 'layout'", [pid]) as any;
  chk('  tidak menulis ke engineering_inputs', Number(diEngineering?.c), 0);

  // ── 7. Kalkulator tidak diduplikasi ke browser ──────────────────────────
  console.log('\n7. Layar tidak menghitung sendiri');
  const vue = fs.readFileSync('../frontend/src/components/projects/ProjectMTO.vue', 'utf8');
  // Rumusnya cuma boleh ada di server. Kalau layar mulai menghitung sendiri,
  // angka yang dilihat dan angka yang tersimpan bisa berbeda diam-diam.
  chk('layar memanggil pratinjau server', /mto\/layout\/pratinjau/.test(vue), true);
  chk('  layar tidak menghitung jumlah kolom sendiri',
    /(garis_kolom_x|jumlah_kolom)\s*=\s*[^=]/.test(vue.replace(/\{\{[\s\S]*?\}\}/g, '')), false);
  chk('  field formulir dibangun dari spesifikasi server',
    /layoutFields/.test(vue) && /mto\/layout\/fields/.test(vue), true);

  // ── Bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n8. Bersih-bersih fixture');
  await call('DELETE', `/estimator/proposals/${pid}/mto/layout?zone_name=Gudang%20A`, undefined, master);
  // Layout menempel pada proposal tapi tabelnya terpisah, jadi penyapu bersama
  // tidak melihatnya — barisnya dihapus di sini, proposalnya oleh penyapu.
  await dbRun("DELETE FROM mto_layouts WHERE scope_type='proposal' AND scope_id = ?", [pid]);
  await call('DELETE', `/estimator/proposals/${pid}`, undefined, master);

  // Penyapu bersama, bukan DELETE manual: endpoint DELETE menolak proposal
  // submitted/deal dan penolakannya mudah tertelan, sehingga fixture menetap.
  // Lihat `tests/_bersih.ts`.
  const disapu = await sapuFixture(stamp);
  if (disapu.proposal || disapu.elemen || disapu.ahsp) {
    console.log(`  ––   sisa fixture disapu: ${disapu.proposal} proposal, `
      + `${disapu.elemen} elemen MTO, ${disapu.baris} baris, ${disapu.ahsp} AHSP`);
  }
  chk('fixture terhapus',
    [(await dbAll('SELECT id FROM proposals WHERE id = ?', [pid])).length,
     (await dbAll('SELECT id FROM mto_layouts WHERE scope_id = ?', [pid])).length], [0, 0]);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
