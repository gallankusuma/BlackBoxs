import 'dotenv/config';
/**
 * Tes otorisasi modul Estimator.
 *
 * Bug yang dibuktikan: seluruh 31 route `/proposals…` hanya memakai
 * `authMiddleware`. Setiap token desktop yang sah — apa pun rolenya — bisa
 * membaca seluruh harga penawaran dan identitas client, mengubah RAB/MTO,
 * men-submit, membuat Deal berikut project-nya, dan me-retry handoff
 * Procurement. Menunya disembunyikan lewat permission, tapi URL dan API-nya
 * tetap terbuka; penyembunyian menu bukan otorisasi.
 *
 * Nama permission-nya sudah ada di katalog boot sejak lama, jadi ini memasang
 * gembok yang kuncinya memang sudah dicetak.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:estimator-rbac
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
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbGet, dbRun } = await import('../src/config/database');

  try {
    // Role TANPA satu pun permission estimator — meniru "Manager Finannce & Acc"
    // di produksi, yang punya 240 permission di modul lain tapi nol di sini.
    const roleKosong = await call('POST', '/roles',
      { code: `ESTR${stamp}`, name: `Uji Tanpa Estimator ${stamp}`,
        description: 'fixture rbac estimator' }, master);
    const roleKosongId = roleKosong.json?.data?.id ?? roleKosong.json?.id;
    chk('role tanpa permission estimator dibuat', !!roleKosongId, true);
    bersihkan.push(() => call('DELETE', `/roles/${roleKosongId}`, undefined, master));

    const buatUser = async (nama: string, roleId: number) => {
      const r = await call('POST', '/users', {
        name: nama, email: `${nama}@uji.test`, password: `Uji-${stamp}-xyz`,
        role_id: roleId, user_level: 1,
      }, master);
      const id = r.json?.data?.id ?? r.json?.id;
      bersihkan.push(() => call('DELETE', `/users/${id}`, undefined, master));
      const tok = (await call('POST', '/auth/login',
        { email: `${nama}@uji.test`, password: `Uji-${stamp}-xyz` })).json?.token;
      return { id, tok, status: r.status };
    };

    const tanpa = await buatUser(`ujitanpa${stamp}`, roleKosongId);
    chk('user tanpa hak estimator dibuat', tanpa.status, 201);
    chk('user itu bisa login', !!tanpa.tok, true);

    // Proposal nyata milik master, untuk diintip user tanpa hak.
    const ah = await call('POST', '/estimator/ahsp', {
      kode: `TEST-RBAC-${stamp}`, name: `AHSP RBAC ${stamp}`, satuan: 'm3',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
                resource_satuan: 'm3', koefisien: 1, resource_harga: 750000 }],
    }, master);
    const pr = await call('POST', '/estimator/proposals',
      { project_name: `Rahasia ${stamp}`, client: `Klien Rahasia ${stamp}` }, master);
    const pid = pr.json?.id ?? pr.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ah.json?.id, qty: 4 }, master);

    // Penegakannya bersakelar (ESTIMATOR_RBAC) karena menggemboknya sekarang
    // membuat dua user produksi langsung 403. Tes ini TIDAK boleh diam-diam
    // lolos saat sakelarnya mati — keadaannya dinyatakan terang-terangan.
    const sondir = await call('GET', '/estimator/proposals', undefined, tanpa.tok);
    const rbacHidup = sondir.status === 403;
    if (!rbacHidup) {
      console.log('\n  ––   ESTIMATOR_RBAC MATI — celah masih terbuka, ini yang diverifikasi:');
      chk('tanpa hak estimator, daftar proposal MASIH terbuka', sondir.status, 200);
      chk('artinya harga penawaran memang masih terbaca semua token',
        Array.isArray(sondir.json?.data ?? sondir.json), true);
      console.log('       Bagian penegakan dilewati sampai sakelarnya dinyalakan.');
    } else {

    // ── 1. Baca ditolak ─────────────────────────────────────────────────────
    console.log('\n1. Harga & identitas client tidak lagi terbuka untuk semua token');
    for (const [label, path] of [
      ['daftar proposal', '/estimator/proposals'],
      ['detail proposal', `/estimator/proposals/${pid}`],
      ['laporan RAB', `/estimator/proposals/${pid}/rab`],
      ['item RAB', `/estimator/proposals/${pid}/items`],
      ['payment schedule', `/estimator/proposals/${pid}/payment-schedule`],
      ['MTO proposal', `/estimator/proposals/${pid}/mto`],
    ] as const) {
      chk(`${label} ditolak 403`, (await call('GET', path, undefined, tanpa.tok)).status, 403);
    }

    // ── 2. Mutasi ditolak ───────────────────────────────────────────────────
    console.log('\n2. Perubahan RAB/MTO/jadwal ditolak');
    chk('buat proposal ditolak',
      (await call('POST', '/estimator/proposals', { project_name: 'Sisipan' }, tanpa.tok)).status, 403);
    chk('edit metadata ditolak',
      (await call('PUT', `/estimator/proposals/${pid}`, { project_name: 'Diubah' }, tanpa.tok)).status, 403);
    chk('tambah item ditolak',
      (await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ah.json?.id, qty: 1 }, tanpa.tok)).status, 403);
    chk('tambah MTO ditolak',
      (await call('POST', `/estimator/proposals/${pid}/mto`,
        { element_type: 'foundation', element_name: 'X', parameters: {} }, tanpa.tok)).status, 403);
    chk('hapus proposal ditolak',
      (await call('DELETE', `/estimator/proposals/${pid}`, undefined, tanpa.tok)).status, 403);

    // ── 3. Transisi komersial ditolak ───────────────────────────────────────
    console.log('\n3. Submit & Deal menuntut permission approve');
    chk('submit ditolak',
      (await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, tanpa.tok)).status, 403);

    // Beri hak EDIT saja — masih tidak boleh submit/deal.
    const permEdit: any = await dbGet(
      "SELECT id FROM permissions WHERE resource='estimator.estimator-proposals' AND action='edit'");
    const permView: any = await dbGet(
      "SELECT id FROM permissions WHERE resource='estimator.estimator-proposals' AND action='view'");
    chk('permission edit & view ada di katalog', !!permEdit?.id && !!permView?.id, true);
    if (permEdit?.id && permView?.id) {
      await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?), (?, ?)',
        [roleKosongId, permEdit.id, roleKosongId, permView.id]);
    }

    const tokEdit = (await call('POST', '/auth/login',
      { email: `ujitanpa${stamp}@uji.test`, password: `Uji-${stamp}-xyz` })).json?.token;
    chk('dengan hak edit, baca diizinkan',
      (await call('GET', `/estimator/proposals/${pid}`, undefined, tokEdit)).status, 200);
    chk('dengan hak edit, draft → review diizinkan',
      (await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, tokEdit)).status, 200);
    // Inti pemisahannya: menyusun ≠ mengirimkan ke pelanggan.
    const submitTanpaApprove = await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, tokEdit);
    chk('tanpa approve, submit tetap ditolak', submitTanpaApprove.status, 403);
    chk('kodenya jelas', submitTanpaApprove.json?.code, 'BUTUH_PERMISSION');
    const cekStatus = await call('GET', `/estimator/proposals/${pid}`, undefined, master);
    chk('statusnya tidak bergeser', (cekStatus.json?.data ?? cekStatus.json)?.status, 'review');

    // ── 3b. Bentuk "view saja" — persis yang diputuskan untuk Finance ───────
    //
    // Keputusan pemilik proses (23 Agustus 2026): role "Manager Finannce & Acc"
    // diberi `estimator.estimator-proposals.view` SAJA, lalu penegakan
    // dinyalakan. Bentuk itu diuji tersendiri karena berbeda dari kombinasi
    // view+edit di atas: boleh membaca seluruh harga, tapi tidak boleh menyentuh
    // apa pun.
    console.log('\n3b. Role "view saja" — boleh baca, tidak boleh ubah');
    const roleView = await call('POST', '/roles',
      { code: `ESTV${stamp}`, name: `Uji View Saja ${stamp}`, description: 'fixture view-only' }, master);
    const roleViewId = roleView.json?.data?.id ?? roleView.json?.id;
    bersihkan.push(() => call('DELETE', `/roles/${roleViewId}`, undefined, master));
    if (permView?.id) {
      await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleViewId, permView.id]);
    }
    const uv = await buatUser(`ujiview${stamp}`, roleViewId);
    chk('user view-saja dibuat', uv.status, 201);

    chk('view-saja boleh membaca daftar proposal',
      (await call('GET', '/estimator/proposals', undefined, uv.tok)).status, 200);
    chk('view-saja boleh membaca RAB',
      (await call('GET', `/estimator/proposals/${pid}/rab`, undefined, uv.tok)).status, 200);
    chk('view-saja TIDAK boleh mengubah metadata',
      (await call('PUT', `/estimator/proposals/${pid}`, { project_name: 'X' }, uv.tok)).status, 403);
    chk('view-saja TIDAK boleh menambah item',
      (await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ah.json?.id, qty: 1 }, uv.tok)).status, 403);
    chk('view-saja TIDAK boleh membuat proposal',
      (await call('POST', '/estimator/proposals', { project_name: 'X' }, uv.tok)).status, 403);
    chk('view-saja TIDAK boleh menghapus',
      (await call('DELETE', `/estimator/proposals/${pid}`, undefined, uv.tok)).status, 403);
    chk('view-saja TIDAK boleh mengubah status',
      (await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'draft' }, uv.tok)).status, 403);

    // ── 4. Master tetap bisa ────────────────────────────────────────────────
    console.log('\n4. Yang berwenang tidak ikut terkunci');
    for (const [label, path] of [
      ['daftar proposal', '/estimator/proposals'],
      ['detail proposal', `/estimator/proposals/${pid}`],
      ['laporan RAB', `/estimator/proposals/${pid}/rab`],
    ] as const) {
      chk(`master → ${label}`, (await call('GET', path, undefined, master)).status, 200);
    }
    chk('master boleh submit',
      (await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master)).status, 200);
    }

  } finally {
    console.log('\n5. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
