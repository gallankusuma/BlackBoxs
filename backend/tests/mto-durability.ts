import 'dotenv/config';
/**
 * EST-MTO-R45 — indikator "tersimpan" harus mengikuti fakta, bukan satu boolean.
 *
 * Bar status tab MTO menurunkan seluruh keadaannya dari `isDirty`. Tapi
 * `isDirty` hanya menjawab "ada yang diubah sejak terakhir disimpan" — ia tidak
 * tahu apa-apa tentang zona yang **belum pernah dikirim sama sekali**. Dan
 * `addDefaultZone()` memang sengaja tidak menandai dirty, supaya membuka tab
 * kosong tidak otomatis mem-POST zona yang tidak diminta siapa pun.
 *
 * Gabungannya: membuka tab MTO yang belum punya data langsung menampilkan
 * "✓ 1 zona tersimpan" untuk zona yang cuma ada di memori. Estimator bisa
 * meninggalkan tab itu dengan yakin datanya aman.
 *
 * Perkara kedua: penyimpanan per zona memang PARTIAL — dan itu keputusan yang
 * disengaja, supaya satu zona bermasalah tidak menyandera zona lain. Justru
 * karena partial, layar wajib menyebut mana yang commit dan mana yang tidak;
 * pesan all-or-nothing menyesatkan ke dua arah sekaligus.
 *
 * Bagian backend di sini membuktikan bahwa partial itu nyata — supaya kalimat
 * yang ditampilkan layar memang menggambarkan yang benar-benar terjadi.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:durability
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

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji durability MTO ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
  chk('proposal dibuat', !!pid, true);

  try {
    console.log('\n1. Zona valid dan zona tak lengkap: yang valid commit, yang tak lengkap tidak');
    const zonaA = await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'column', element_name: 'Kolom 1',
      parameters: { B: 0.4, H: 0.4, qty_per_floor: 5, height_per_floor: 3.5, _zone_name: 'Kolom 1' },
    }, master);
    chk('zona A diterima', zonaA.status, 200);

    const zonaB = await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'column', element_name: 'Kolom Gudang',
      parameters: { _zone_name: 'Kolom Gudang' },
    }, master);
    chk('zona B ditolak', zonaB.status >= 400, true);
    chk('penolakannya menyebut field yang kurang',
      Array.isArray(zonaB.json?.missing_required) || Array.isArray(zonaB.json?.problems), true);

    const tersimpan: any[] = await dbAll(
      `SELECT element_name FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=? ORDER BY id`, [pid]);
    chk('hanya zona A yang benar-benar tersimpan', tersimpan.length, 1);
    chk('dan itu memang Kolom 1', tersimpan[0]?.element_name, 'Kolom 1');

    console.log('\n2. Zona yang gagal TIDAK mendapat element_id — itu penanda persistensinya');
    chk('respons zona B tidak membawa id', zonaB.json?.id, undefined);
    chk('respons zona A membawa id', typeof zonaA.json?.id === 'number', true);

    console.log('\n3. Melengkapi dimensinya membuat zona B tersimpan tanpa menyentuh A');
    const idA = zonaA.json?.id;
    const zonaBUlang = await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'column', element_name: 'Kolom Gudang',
      parameters: { B: 0.3, H: 0.5, qty_per_floor: 8, height_per_floor: 4, _zone_name: 'Kolom Gudang' },
    }, master);
    chk('zona B kini diterima', zonaBUlang.status, 200);
    chk('A tidak tersentuh', !!(await dbGet('SELECT id FROM engineering_inputs WHERE id = ?', [idA])), true);
    const semua: any[] = await dbAll(
      `SELECT element_name FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    chk('sekarang dua zona tersimpan', semua.length, 2);

    console.log('\n4. Menyimpan ulang zona yang sama tidak menggandakannya');
    await call('POST', `/estimator/proposals/${pid}/mto`, {
      element_type: 'column', element_name: 'Kolom Gudang',
      parameters: { B: 0.35, H: 0.5, qty_per_floor: 8, height_per_floor: 4, _zone_name: 'Kolom Gudang' },
    }, master);
    const sesudahUlang: any[] = await dbAll(
      `SELECT element_name FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    chk('tetap dua zona, bukan tiga', sesudahUlang.length, 2);

    console.log('\n5. Layar tidak lagi menyimpulkan "tersimpan" dari satu boolean');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/components/projects/ProjectMTO.vue', import.meta.url), 'utf8');

    chk('bar hijau tidak lagi digerbangi `isDirty` saja',
      !vue.includes(`<span v-else style="color:#065f46">✓ {{ zones[activeTab]?.length || 0 }} zona {{ activeModule?.label }} tersimpan</span>`), true);
    chk('ada penilaian persistensi tersendiri', vue.includes('const semuaTersimpan = computed'), true);
    chk('yang mensyaratkan setiap zona punya element_id',
      vue.includes('zonaBelumTersimpan.value === 0'), true);
    chk('zona tanpa element_id dihitung belum tersimpan',
      vue.includes(".filter((z: any) => !z.element_id).length"), true);
    chk('layar menyebutkan berapa zona yang belum pernah disimpan',
      vue.includes('zona belum pernah disimpan'), true);
    chk('ada penanda status per zona, bukan satu label global',
      vue.includes('zone-status') && vue.includes('zonaGagal.has(activeZone.zid)'), true);
    chk('zona yang gagal disimpan ditandai sendiri',
      vue.includes('const zonaGagal = ref<Set<string>>'), true);
    chk('galat menyebut modul asalnya supaya tidak salah alamat saat pindah tab',
      vue.includes('saveError.modul && saveError.modul !== activeTab'), true);
    chk('auto-save yang berhasil membersihkan penanda gagal',
      vue.includes('zonaGagal.value = new Set();'), true);
    chk('pesan partial menyebut jumlah yang commit dan yang tidak',
      vue.includes('zona gagal disimpan. Zona lain sudah tersimpan.'), true);

  } finally {
    console.log('\n6. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) AS n FROM engineering_inputs WHERE scope_type='proposal' AND scope_id=?`, [pid]);
    chk('tidak ada elemen MTO tertinggal', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
