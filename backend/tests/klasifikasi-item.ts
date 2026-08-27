import 'dotenv/config';
/**
 * EST-KLAS-R41 — satu baris, satu klasifikasi.
 *
 * `discipline_id` dan `sub_discipline_id` dulu diterima sebagai dua acuan
 * independen dari klien lalu disimpan apa adanya. Keduanya bisa valid
 * sendiri-sendiri sementara pasangannya salah, dan akibatnya baru muncul jauh
 * di hilir: ringkasan discipline menjumlahkan `pi.discipline_id`, ringkasan
 * sub-discipline mengembalikan parent kanonik dari master, dan pohon RAB
 * mencetak sub apa pun di bawah `pi.discipline_id`. Baris yang sama muncul
 * sebagai Civil di satu laporan dan Piping di laporan lain — sementara grand
 * total-nya benar, jadi tidak ada angka yang terlihat janggal.
 *
 * Kontrak yang ditegakkan: sub-discipline yang menentukan parent.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:klasifikasi
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
  const { dbGet, dbRun } = await import('../src/config/database');
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  // Dua discipline dengan sub masing-masing — bahan untuk pasangan silang.
  const dA = await dbRun(
    'INSERT INTO master_disciplines (code, name, order_no, is_active) VALUES (?, ?, 900, 1)',
    [`KLA-${stamp}`, `Civil Uji ${stamp}`]);
  const dB = await dbRun(
    'INSERT INTO master_disciplines (code, name, order_no, is_active) VALUES (?, ?, 901, 1)',
    [`KLB-${stamp}`, `Piping Uji ${stamp}`]);
  const sdB = await dbRun(
    'INSERT INTO master_sub_disciplines (discipline_id, code, name, order_no, is_active) VALUES (?, ?, ?, 1, 1)',
    [dB.insertId, `SKLB-${stamp}`, `Sub Piping ${stamp}`]);
  const sdMati = await dbRun(
    'INSERT INTO master_sub_disciplines (discipline_id, code, name, order_no, is_active) VALUES (?, ?, ?, 2, 0)',
    [dB.insertId, `SKLZ-${stamp}`, `Sub Nonaktif ${stamp}`]);
  bersihkan.push(() => dbRun('DELETE FROM master_sub_disciplines WHERE id IN (?, ?)', [sdB.insertId, sdMati.insertId]));
  bersihkan.push(() => dbRun('DELETE FROM master_disciplines WHERE id IN (?, ?)', [dA.insertId, dB.insertId]));
  chk('master uji dibuat', !!dA.insertId && !!dB.insertId && !!sdB.insertId, true);

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `KLS.${stamp}`, name: `AHSP Klasifikasi ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 600000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji klasifikasi ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  bersihkan.unshift(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
  chk('proposal dibuat', !!pid, true);

  const tambah = (body: any) => call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 2, ...body }, master);

  try {
    console.log('\n1. Pasangan silang: parent kanonik yang menang, bukan yang dikirim klien');
    // Civil A + sub milik Piping B — persis skenario yang dilaporkan.
    const silang = await tambah({ discipline_id: dA.insertId, sub_discipline_id: sdB.insertId });
    chk('permintaan diterima', silang.status, 201);
    chk('respons mengembalikan parent kanonik (Piping), bukan Civil',
      Number(silang.json?.discipline_id), Number(dB.insertId));
    const barisSilang: any = await dbGet(
      'SELECT discipline_id, sub_discipline_id FROM proposal_items WHERE id = ?', [silang.json?.id]);
    chk('database menyimpan parent kanonik', Number(barisSilang?.discipline_id), Number(dB.insertId));
    chk('discipline Civil yang dikirim klien TIDAK tersimpan',
      Number(barisSilang?.discipline_id) !== Number(dA.insertId), true);
    chk('sub-discipline tetap yang dipilih', Number(barisSilang?.sub_discipline_id), Number(sdB.insertId));

    console.log('\n2. Pasangan yang benar tersimpan apa adanya');
    const benar = await tambah({ discipline_id: dB.insertId, sub_discipline_id: sdB.insertId });
    const barisBenar: any = await dbGet(
      'SELECT discipline_id, sub_discipline_id FROM proposal_items WHERE id = ?', [benar.json?.id]);
    chk('discipline sesuai', Number(barisBenar?.discipline_id), Number(dB.insertId));
    chk('sub sesuai', Number(barisBenar?.sub_discipline_id), Number(sdB.insertId));

    console.log('\n3. Sub saja (tanpa discipline) menghasilkan klasifikasi yang sama');
    const subSaja = await tambah({ sub_discipline_id: sdB.insertId });
    const barisSubSaja: any = await dbGet(
      'SELECT discipline_id, sub_discipline_id FROM proposal_items WHERE id = ?', [subSaja.json?.id]);
    chk('parent diturunkan dari sub', Number(barisSubSaja?.discipline_id), Number(dB.insertId));
    chk('hasilnya identik dengan pasangan yang benar',
      Number(barisSubSaja?.discipline_id) === Number(barisBenar?.discipline_id)
      && Number(barisSubSaja?.sub_discipline_id) === Number(barisBenar?.sub_discipline_id), true);

    console.log('\n4. Discipline saja tetap sah');
    const dSaja = await tambah({ discipline_id: dA.insertId });
    const barisDSaja: any = await dbGet(
      'SELECT discipline_id, sub_discipline_id FROM proposal_items WHERE id = ?', [dSaja.json?.id]);
    chk('discipline tersimpan', Number(barisDSaja?.discipline_id), Number(dA.insertId));
    chk('sub tetap kosong', barisDSaja?.sub_discipline_id, null);

    console.log('\n5. Id tidak ada / nonaktif ditolak — tidak jatuh diam-diam ke tanpa klasifikasi');
    const subHilang = await tambah({ sub_discipline_id: 999999999 });
    chk('sub tidak ada ditolak 404', subHilang.status, 404);
    chk('kodenya SUB_DISCIPLINE_TIDAK_DITEMUKAN', subHilang.json?.code, 'SUB_DISCIPLINE_TIDAK_DITEMUKAN');

    const subMati = await tambah({ sub_discipline_id: sdMati.insertId });
    chk('sub nonaktif ditolak 409', subMati.status, 409);
    chk('kodenya SUB_DISCIPLINE_TIDAK_AKTIF', subMati.json?.code, 'SUB_DISCIPLINE_TIDAK_AKTIF');

    const dHilang = await tambah({ discipline_id: 999999999 });
    chk('discipline tidak ada ditolak 404', dHilang.status, 404);
    chk('kodenya DISCIPLINE_TIDAK_DITEMUKAN', dHilang.json?.code, 'DISCIPLINE_TIDAK_DITEMUKAN');

    console.log('\n6. Tidak ada baris yang tercipta dari permintaan yang ditolak');
    const jml: any = await dbGet(
      'SELECT COUNT(*) AS n FROM proposal_items WHERE proposal_id = ? AND is_section = 0', [pid]);
    chk('tepat 4 item yang tercipta (3 ditolak)', Number(jml?.n), 4);

    console.log('\n7. Tidak ada satu pun baris berpasangan silang tersisa');
    const silangTersisa: any = await dbGet(
      `SELECT COUNT(*) AS n FROM proposal_items pi
       JOIN master_sub_disciplines sd ON sd.id = pi.sub_discipline_id
       WHERE pi.proposal_id = ? AND pi.discipline_id IS NOT NULL
         AND pi.discipline_id <> sd.discipline_id`, [pid]);
    chk('nol pasangan silang', Number(silangTersisa?.n), 0);

    console.log('\n8. Ringkasan dan RAB menempatkan baris pada parent yang sama');
    const ring = await call('GET', `/estimator/proposals/${pid}/summary`, undefined, master);
    chk('ringkasan terbaca', ring.status, 200);
    const rab = await call('GET', `/estimator/proposals/${pid}/rab`, undefined, master);
    chk('RAB terbaca', rab.status, 200);
    // Yang dijaga: sub uji tidak boleh muncul di bawah discipline Civil.
    const teksRab = JSON.stringify(rab.json || {});
    const civilPunyaSub = teksRab.includes(`"discipline_id":${dA.insertId}`)
      && new RegExp(`"discipline_id":${dA.insertId}[^}]*"sub_discipline_id":${sdB.insertId}`).test(teksRab);
    chk('sub Piping tidak pernah tercetak di bawah Civil', civilPunyaSub, false);

  } finally {
    console.log('\n9. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
    await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`KLS.${stamp}`]).catch(() => {});
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
