import 'dotenv/config';
/**
 * Kustodi & kondisi alat (AST-CUSTODY-01).
 *
 * Skenario yang diminta pemilik: mesin las dari workshop pindah ke Project A,
 * bulan depan ke Project B, dan kalau kondisinya tidak baik masuk perbaikan
 * dulu.
 *
 * Tiga hal yang dijaga paling keras di sini:
 *
 *   1. **Asal perpindahan tidak pernah datang dari klien.** Ia diturunkan dari
 *      perpindahan terakhir yang tercatat. Kalau asal boleh dikirim klien,
 *      rantainya bisa dikarang dan riwayatnya berhenti bisa dipercaya.
 *   2. **Alat berkondisi tidak baik tidak boleh dikirim ke proyek** — tapi
 *      TETAP boleh dipindah ke workshop atau vendor, karena itulah jalan
 *      memperbaikinya. Penguncian yang ikut menutup jalur perbaikan hanya akan
 *      membuat alat rusak mangkrak di proyek.
 *   3. **Lokasi berjalan DIHITUNG dari baris terakhir**, bukan disimpan sebagai
 *      kolom — kolom denormalisasi akan melenceng dari riwayatnya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:asset-custody
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
  const stamp = Date.now().toString().slice(-7);
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const kategori: any = await dbGet('SELECT id FROM asset_categories LIMIT 1');
  const proyek: any[] = await dbAll('SELECT id, project_name FROM client_projects ORDER BY id DESC LIMIT 2');
  chk('kategori aset & dua proyek tersedia', !!(kategori?.id && proyek.length >= 2), true);
  const [projA, projB] = proyek;

  const aset = await dbRun(
    `INSERT INTO assets (asset_code, category_id, name, spec, status, purchase_date, purchase_price)
     VALUES (?, ?, ?, ?, 'active', CURDATE(), 1000000)`,
    // `assets.spec` bertipe JSON, bukan teks — spesifikasi alat memang
    // tersimpan terstruktur ("jenis X spec Y").
    [`LAS-${stamp}`, kategori.id, `Mesin Las Uji ${stamp}`,
     JSON.stringify({ jenis: 'Inverter', arus: '200A', fase: 1 })]
  );
  const asetId = aset.insertId;
  chk('aset uji dibuat', !!asetId, true);

  const lokasi = async () => {
    const r = await call('GET', `/assets/${asetId}`, undefined, master);
    const d = r.json?.data || r.json;
    return { tipe: d?.current_location_type ?? null, proyek: d?.current_project_id ?? null,
             kondisi: d?.condition ?? null, status: d?.status ?? null };
  };

  // ── 1. Keadaan awal ─────────────────────────────────────────────────────
  console.log('\n1. Alat baru: kondisi baik, belum punya lokasi');
  chk('kondisi awal baik', (await lokasi()).kondisi, 'baik');
  chk('belum ada lokasi berjalan', (await lokasi()).tipe, null);

  // ── 2. Workshop → Project A → Project B ─────────────────────────────────
  console.log('\n2. Workshop → Project A → Project B');
  chk('pindah ke workshop', (await call('POST', `/assets/${asetId}/movements`,
    { to_type: 'workshop', to_label: 'Workshop Pusat' }, master)).status, 201);
  chk('pindah ke Project A', (await call('POST', `/assets/${asetId}/movements`,
    { to_type: 'project', to_project_id: projA.id, received_by: 'Site Manager A' }, master)).status, 201);
  chk('  lokasi berjalan = Project A', (await lokasi()).proyek, projA.id);

  chk('pindah ke Project B', (await call('POST', `/assets/${asetId}/movements`,
    { to_type: 'project', to_project_id: projB.id }, master)).status, 201);
  chk('  lokasi berjalan = Project B', (await lokasi()).proyek, projB.id);

  // Inti riwayat: asal perpindahan terakhir harus Project A, bukan karangan.
  const riwayat = (await call('GET', `/assets/${asetId}/movements`, undefined, master)).json?.data || [];
  chk('riwayat memuat 3 perpindahan', riwayat.length, 3);
  chk('  asal perpindahan terakhir = Project A', Number(riwayat[0]?.from_project_id), Number(projA.id));

  // ── 3. Asal tidak boleh dikarang klien ──────────────────────────────────
  console.log('\n3. Asal perpindahan tidak diambil dari klien');
  await call('POST', `/assets/${asetId}/movements`,
    { to_type: 'workshop', to_label: 'Workshop Pusat', from_type: 'project', from_project_id: 999999, from_label: 'KARANGAN' }, master);
  const r2 = (await call('GET', `/assets/${asetId}/movements`, undefined, master)).json?.data || [];
  chk('asal tetap diturunkan dari riwayat, bukan dari body',
    [Number(r2[0]?.from_project_id), r2[0]?.from_label], [Number(projB.id), null]);

  // ── 4. Kondisi tidak baik mengunci pengiriman ke proyek ─────────────────
  console.log('\n4. Kondisi tidak baik mengunci pengiriman ke proyek');
  chk('tandai rusak', (await call('PATCH', `/assets/${asetId}/condition`,
    { condition: 'rusak', note: 'kabel terbakar' }, master)).status, 200);
  // Alat rusak yang tetap berstatus 'active' adalah setengah jalan paling
  // membingungkan: daftar bilang siap dipakai, pengiriman ditolak.
  chk('  status ikut jadi under_maintenance', (await lokasi()).status, 'under_maintenance');
  const tolak = await call('POST', `/assets/${asetId}/movements`, { to_type: 'project', to_project_id: projA.id }, master);
  chk('  kirim ke proyek ditolak', [tolak.status, tolak.json?.code], [409, 'KONDISI_BELUM_LAYAK']);
  // Kalau jalur perbaikan ikut terkunci, alat rusak akan mangkrak.
  chk('  TAPI pindah ke vendor perbaikan tetap boleh',
    (await call('POST', `/assets/${asetId}/movements`, { to_type: 'vendor', to_label: 'Bengkel Jaya' }, master)).status, 201);

  console.log('\n5. Setelah diperbaiki, boleh dikirim lagi');
  chk('tandai baik', (await call('PATCH', `/assets/${asetId}/condition`, { condition: 'baik' }, master)).status, 200);
  chk('  status kembali active', (await lokasi()).status, 'active');
  chk('  kirim ke proyek kembali diterima',
    (await call('POST', `/assets/${asetId}/movements`, { to_type: 'project', to_project_id: projA.id }, master)).status, 201);

  // Perpindahan status dicatat di tabel riwayat yang sudah ada, bukan tabel
  // kedua — kalau tidak, 'kapan alat ini masuk bengkel' butuh dua sumber.
  const jejak = await dbAll(
    `SELECT from_status, to_status, note FROM asset_status_history WHERE asset_id = ? ORDER BY id`, [asetId]) as any[];
  chk('  masuk & keluar bengkel tercatat di asset_status_history',
    jejak.map(j => `${j.from_status}>${j.to_status}`), ['active>under_maintenance', 'under_maintenance>active']);
  chk('  catatannya menyebut sebabnya', String(jejak[0]?.note || '').includes('kabel terbakar'), true);

  // ── 6. Penolakan lain ───────────────────────────────────────────────────
  console.log('\n6. Masukan yang tidak sah ditolak');
  chk('tujuan proyek tanpa id ditolak',
    (await call('POST', `/assets/${asetId}/movements`, { to_type: 'project' }, master)).json?.code, 'PROJECT_WAJIB');
  chk('tipe tujuan ngawur ditolak',
    (await call('POST', `/assets/${asetId}/movements`, { to_type: 'bulan' }, master)).json?.code, 'TUJUAN_TIDAK_SAH');
  chk('kondisi ngawur ditolak',
    (await call('PATCH', `/assets/${asetId}/condition`, { condition: 'agak-baik' }, master)).json?.code, 'KONDISI_TIDAK_SAH');
  await dbRun("UPDATE assets SET status = 'disposed' WHERE id = ?", [asetId]);
  chk('aset yang sudah dilepas tidak bisa dipindah',
    (await call('POST', `/assets/${asetId}/movements`, { to_type: 'workshop' }, master)).json?.code, 'ASET_SUDAH_DILEPAS');
  await dbRun("UPDATE assets SET status = 'active' WHERE id = ?", [asetId]);

  // ── 7. Aset yang sudah dilepas tidak ditarik kembali oleh catatan kondisi
  console.log('\n7. Kondisi tidak menarik kembali aset yang sudah dilepas');
  await dbRun("UPDATE assets SET status = 'disposed' WHERE id = ?", [asetId]);
  await call('PATCH', `/assets/${asetId}/condition`, { condition: 'rusak' }, master);
  chk('status disposed tidak berubah jadi under_maintenance', (await lokasi()).status, 'disposed');
  await dbRun("UPDATE assets SET status = 'active', `condition` = 'baik' WHERE id = ?", [asetId]);

  // ── 7. Lokasi tidak boleh jadi kolom, dan tidak boleh N+1 ───────────────
  console.log('\n8. Lokasi dihitung, bukan disimpan; dan diambil sekali jalan');
  const kolom = await dbAll(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets'
       AND COLUMN_NAME IN ('current_project_id','current_location_type')`
  );
  chk('tidak ada kolom lokasi berjalan di tabel assets', kolom.length, 0);
  const src = fs.readFileSync('src/routes/asset.routes.ts', 'utf8');
  chk('daftar & detail memakai join perpindahan-terakhir',
    (src.match(/\$\{SQL_LOKASI_TERAKHIR\}/g) || []).length, 2);

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n9. Bersih-bersih fixture');
  await dbRun('DELETE FROM asset_movements WHERE asset_id = ?', [asetId]);
  await dbRun('DELETE FROM assets WHERE id = ?', [asetId]);
  chk('fixture terhapus', (await dbAll('SELECT id FROM assets WHERE id = ?', [asetId])).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
