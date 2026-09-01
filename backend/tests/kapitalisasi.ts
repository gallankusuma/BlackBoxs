import 'dotenv/config';
/**
 * Kapitalisasi CAPEX — serah-terima dari anggaran/project ke Asset Management.
 *
 * Tiga keputusan pemilik (31 Agustus 2026) yang diuji di sini:
 *
 *   1. **Basis biaya = realisasi aktual**, bukan nilai kontrak. Aset lahir
 *      dengan biaya yang benar-benar dikeluarkan. Fixture sengaja memasang
 *      kontrak 500 jt di atas realisasi 200 jt: kalau kode diam-diam memakai
 *      nilai kontrak, aset akan lahir 2,5× lebih mahal dari kenyataannya.
 *   2. **Satu baris boleh melahirkan banyak aset**, dengan alokasi eksplisit
 *      yang jumlahnya wajib pas — bukan dibagi rata diam-diam.
 *   3. **Pemicunya manual.** Tidak ada jalur otomatis; project yang ditutup
 *      karena batal juga "selesai", dan tidak boleh mengisi register aset.
 *
 * Yang paling keras dijaga selain itu: realisasi terus bergerak setelah aset
 * didaftarkan. Tagihan susulan harus muncul sebagai **sisa yang belum
 * dikapitalisasi**, bukan diam-diam menaikkan harga perolehan aset yang sudah
 * berjalan penyusutannya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:kapitalisasi
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

const TAHUN_UJI = 2097;
const JT = 1_000_000;

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
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  const proyek: number[] = [], proposal: number[] = [], kontrak: number[] = [], ap: number[] = [];
  const bersihkanTahun = async () => {
    const t: any = await dbGet('SELECT id FROM budget_years WHERE year = ?', [TAHUN_UJI]);
    if (t) {
      const baris: any[] = await dbAll('SELECT id FROM budget_lines WHERE budget_year_id = ?', [t.id]);
      for (const b of baris) {
        await dbRun('UPDATE proposals SET budget_line_id = NULL WHERE budget_line_id = ?', [b.id]);
        await dbRun('DELETE FROM assets WHERE source_budget_line_id = ?', [b.id]);
        await dbRun('DELETE FROM asset_capitalizations WHERE budget_line_id = ?', [b.id]);
      }
      await dbRun('DELETE FROM budget_years WHERE id = ?', [t.id]);
    }
  };
  await bersihkanTahun();

  try {
    const kat: any = await dbGet('SELECT id FROM asset_categories LIMIT 1');
    const katId = kat?.id;

    console.log('\n1. Fixture — kontrak 500 jt, realisasi hanya 200 jt');
    const yid = (await call('POST', '/budget/years',
      { year: TAHUN_UJI, capex_ceiling: 2000 * JT, opex_ceiling: 500 * JT }, master)).json?.id;
    const buatBaris = (b: any) => call('POST', `/budget/years/${yid}/lines`, b, master);
    const A = (await buatBaris({ code: 'CX-A', type: 'capex', title: `Revamp reaktor ${stamp}`, planned_amount: 600 * JT })).json?.id;
    const OPX = (await buatBaris({ code: 'OX-A', type: 'opex', title: `Overhaul rutin ${stamp}`, planned_amount: 100 * JT })).json?.id;
    const BLM = (await buatBaris({ code: 'CX-B', type: 'capex', title: `Belum disetujui ${stamp}`, planned_amount: 100 * JT })).json?.id;
    const KOSONG = (await buatBaris({ code: 'CX-K', type: 'capex', title: `Tanpa realisasi ${stamp}`, planned_amount: 100 * JT })).json?.id;
    for (const id of [A, OPX, KOSONG]) await call('PUT', `/budget/lines/${id}/status`, { status: 'disetujui' }, master);

    const cl: any = await dbGet('SELECT id FROM clients LIMIT 1');
    const buatProyek = async (n: number) => {
      const r = await dbRun('INSERT INTO client_projects (client_id, project_number, project_name) VALUES (?, ?, ?)',
        [cl?.id || 1, `KAP-${stamp}-${n}`, `Proyek kapitalisasi ${stamp}`]);
      proyek.push(r.insertId); return r.insertId as number;
    };
    const buatProposal = async (nama: string, projectId: number | null, nilai: number) => {
      const r = await dbRun('INSERT INTO proposals (project_name, status, project_id, total_project) VALUES (?, ?, ?, ?)',
        [`${nama} ${stamp}`, 'deal', projectId, nilai]);
      proposal.push(r.insertId);
      await dbRun('INSERT INTO proposal_revisions (proposal_id, revision_no, status, total_project) VALUES (?, 1, ?, ?)',
        [r.insertId, 'issued', nilai]);
      return r.insertId as number;
    };

    const projX = await buatProyek(1);
    const P1 = await buatProposal('Revamp', projX, 500 * JT);
    const kR = await dbRun(
      `INSERT INTO contracts (contract_number, project_id, proposal_id, original_value, status)
       VALUES (?, ?, ?, ?, 'active')`, [`KTR-${stamp}`, projX, P1, 500 * JT]);
    kontrak.push(kR.insertId);
    await call('PUT', `/budget/lines/${A}/proposal/${P1}`, {}, master);
    // Realisasi: AP 150 jt + biaya project 50 jt = 200 jt.
    const apR = await dbRun('INSERT INTO accounts_payable (project_id, amount, description) VALUES (?, ?, ?)',
      [projX, 150 * JT, `uji ${stamp}`]);
    ap.push(apR.insertId);
    await dbRun('INSERT INTO project_expenses (project_id, expense_number, amount, description, expense_date) VALUES (?, ?, ?, ?, ?)',
      [projX, `EXP-${stamp}`, 50 * JT, `uji ${stamp}`, new Date().toISOString().slice(0, 10)]);

    const posisi = (await call('GET', `/budget/lines/${A}/kapitalisasi`, undefined, master)).json;
    chk('basis memakai realisasi aktual, bukan nilai kontrak', posisi?.realisasi?.total, 200 * JT);
    chk('rincian AP dinyatakan', posisi?.realisasi?.ap, 150 * JT);
    chk('rincian biaya project dinyatakan', posisi?.realisasi?.biaya, 50 * JT);
    chk('belum ada yang dikapitalisasi', posisi?.dikapitalisasi, 0);
    chk('baris capex disetujui siap dikapitalisasi', posisi?.bisa_dikapitalisasi, true);

    console.log('\n2. Yang tidak boleh menjadi aset');
    const kap = (id: any, body: any) => call('POST', `/budget/lines/${id}/kapitalisasi`, body, master);
    const satuAset = (n: number, nama = 'Reaktor') =>
      [{ allocated_cost: n, asset_baru: { name: `${nama} ${stamp}`, category_id: katId } }];
    chk('OPEX tidak bisa menjadi aset',
      (await kap(OPX, { amount: 10 * JT, allocations: satuAset(10 * JT) })).json?.code, 'BUKAN_CAPEX');
    chk('baris belum disetujui ditolak',
      (await kap(BLM, { amount: 10 * JT, allocations: satuAset(10 * JT) })).json?.code, 'BARIS_BELUM_DISETUJUI');
    chk('tanpa realisasi ditolak',
      (await kap(KOSONG, { amount: 10 * JT, allocations: satuAset(10 * JT) })).json?.code, 'BELUM_ADA_REALISASI');
    chk('tanpa alokasi ditolak',
      (await kap(A, { amount: 10 * JT, allocations: [] })).json?.code, 'ALOKASI_KOSONG');
    chk('nilai nol ditolak',
      (await kap(A, { amount: 0, allocations: satuAset(10 * JT) })).json?.code, 'NILAI_TIDAK_VALID');

    console.log('\n3. Alokasi wajib pas, dan tidak boleh melebihi realisasi');
    const beda = await kap(A, { amount: 100 * JT, allocations: [
      { allocated_cost: 60 * JT, asset_baru: { name: `Reaktor ${stamp}`, category_id: katId } },
      { allocated_cost: 30 * JT, asset_baru: { name: `Pompa ${stamp}`, category_id: katId } },
    ] });
    chk('jumlah alokasi tidak cocok ditolak', beda.json?.code, 'ALOKASI_TIDAK_COCOK');
    chk('selisihnya disebut', beda.json?.selisih, -10 * JT);

    // Inti keputusan pemilik: nilai kontrak 500 jt, tapi yang boleh jadi aset
    // hanya 200 jt yang benar-benar keluar.
    const lebih = await kap(A, { amount: 300 * JT, allocations: satuAset(300 * JT) });
    chk('melebihi realisasi ditolak walau kontraknya lebih besar', lebih.json?.code, 'MELEBIHI_REALISASI');
    chk('sisa realisasi disebut dalam penolakan', lebih.json?.sisa, 200 * JT);
    chk('alokasi nol ditolak',
      (await kap(A, { amount: 10 * JT, allocations: [{ allocated_cost: 0, asset_baru: { name: 'x', category_id: katId } }] })).json?.code,
      'ALOKASI_TIDAK_VALID');
    chk('aset baru tanpa nama ditolak',
      (await kap(A, { amount: 10 * JT, allocations: [{ allocated_cost: 10 * JT, asset_baru: { category_id: katId } }] })).json?.code,
      'NAMA_ASET_WAJIB');
    chk('aset yang tidak ada ditolak',
      (await call('POST', `/budget/lines/${A}/kapitalisasi`,
        { amount: 1, allocations: [{ allocated_cost: 1, asset_id: 999999999 }] }, master)).json?.code,
      'ASET_TIDAK_DITEMUKAN');
    chk('aset baru tanpa kategori ditolak',
      (await kap(A, { amount: 10 * JT, allocations: [{ allocated_cost: 10 * JT, asset_baru: { name: 'x' } }] })).json?.code,
      'KATEGORI_ASET_WAJIB');

    console.log('\n4. Satu baris melahirkan banyak aset');
    const jadi = await kap(A, { amount: 150 * JT, note: `kapitalisasi tahap 1 ${stamp}`, allocations: [
      { allocated_cost: 100 * JT, asset_baru: { name: `Reaktor R-101 ${stamp}`, category_id: katId, useful_life_years: 20 } },
      { allocated_cost: 50 * JT, asset_baru: { name: `Pompa P-201 ${stamp}`, category_id: katId, useful_life_years: 10 } },
    ] });
    chk('kapitalisasi berhasil', jadi.status, 201);
    chk('dua aset lahir', jadi.json?.assets?.length, 2);
    chk('sisa dilaporkan setelah kapitalisasi', jadi.json?.belum_dikapitalisasi, 50 * JT);

    const aset1 = jadi.json?.assets?.[0]?.asset_id;
    const a1: any = await dbGet('SELECT * FROM assets WHERE id = ?', [aset1]);
    chk('harga perolehan aset = alokasinya', Number(a1?.purchase_price), 100 * JT);
    chk('asal-usul aset tercatat ke baris anggaran', Number(a1?.source_budget_line_id), A);
    chk('umur manfaat ikut tersimpan', Number(a1?.useful_life_years), 20);

    console.log('\n5. Tagihan susulan tidak mengubah aset yang sudah berjalan');
    const apR2 = await dbRun('INSERT INTO accounts_payable (project_id, amount, description) VALUES (?, ?, ?)',
      [projX, 80 * JT, `susulan ${stamp}`]);
    ap.push(apR2.insertId);
    const p2 = (await call('GET', `/budget/lines/${A}/kapitalisasi`, undefined, master)).json;
    chk('realisasi naik karena tagihan susulan', p2?.realisasi?.total, 280 * JT);
    chk('yang sudah dikapitalisasi tidak ikut berubah', p2?.dikapitalisasi, 150 * JT);
    chk('selisihnya muncul sebagai sisa', p2?.belum_dikapitalisasi, 130 * JT);
    const a1b: any = await dbGet('SELECT purchase_price FROM assets WHERE id = ?', [aset1]);
    chk('harga perolehan aset TIDAK bergeser sendiri', Number(a1b?.purchase_price), 100 * JT);

    console.log('\n6. Kapitalisasi susulan menambah nilai aset yang sudah ada');
    const tahap2 = await kap(A, { amount: 130 * JT, allocations: [
      { allocated_cost: 130 * JT, asset_id: aset1, allocation_note: 'tagihan susulan reaktor' },
    ] });
    chk('kapitalisasi kedua berhasil', tahap2.status, 201);
    chk('urutan eventnya bertambah', tahap2.json?.seq, 2);
    const a1c: any = await dbGet('SELECT purchase_price FROM assets WHERE id = ?', [aset1]);
    chk('nilai aset yang ada bertambah, bukan tergantikan', Number(a1c?.purchase_price), 230 * JT);
    chk('realisasi habis dikapitalisasi',
      (await kap(A, { amount: 1 * JT, allocations: satuAset(1 * JT) })).json?.code, 'SUDAH_DIKAPITALISASI_PENUH');

    console.log('\n7. Pembatalan beralasan mengembalikan nilai aset');
    const capId = tahap2.json?.id;
    chk('pembatalan tanpa alasan ditolak',
      (await call('PUT', `/budget/kapitalisasi/${capId}/reversal`, {}, master)).json?.code, 'ALASAN_WAJIB');
    chk('pembatalan beralasan berhasil',
      (await call('PUT', `/budget/kapitalisasi/${capId}/reversal`,
        { reason: 'salah alokasi, tagihan itu milik pekerjaan lain' }, master)).status, 200);
    const a1d: any = await dbGet('SELECT purchase_price FROM assets WHERE id = ?', [aset1]);
    chk('nilai aset kembali seperti semula', Number(a1d?.purchase_price), 100 * JT);
    const p3 = (await call('GET', `/budget/lines/${A}/kapitalisasi`, undefined, master)).json;
    chk('yang direversal tidak lagi dihitung', p3?.dikapitalisasi, 150 * JT);
    chk('sisanya terbuka kembali', p3?.belum_dikapitalisasi, 130 * JT);
    chk('eventnya tetap ada, tidak dihapus', p3?.events?.length, 2);
    chk('statusnya reversed', p3?.events?.[1]?.status, 'reversed');
    chk('pembatalan ganda ditolak',
      (await call('PUT', `/budget/kapitalisasi/${capId}/reversal`, { reason: 'lagi' }, master)).json?.code,
      'SUDAH_DIREVERSAL');

    console.log('\n8. Pembatalan menghapus aset yang LAHIR dari event itu');
    const lahir = await kap(A, { amount: 130 * JT, allocations: [
      { allocated_cost: 130 * JT, asset_baru: { name: `Kompresor K-301 ${stamp}`, category_id: katId } },
    ] });
    chk('kapitalisasi ketiga berhasil', lahir.status, 201);
    if (lahir.status !== 201) console.log('     detail:', JSON.stringify(lahir.json));
    const asetBaru = lahir.json?.assets?.[0]?.asset_id || 0;
    await call('PUT', `/budget/kapitalisasi/${lahir.json?.id}/reversal`, { reason: 'salah input' }, master);
    const ab: any = await dbGet('SELECT is_deleted, purchase_price FROM assets WHERE id = ?', [asetBaru]);
    chk('aset yang lahir dari event ikut dicabut', Number(ab?.is_deleted), 1);
    chk('nilainya dikembalikan ke nol', Number(ab?.purchase_price), 0);
    const a1e: any = await dbGet('SELECT is_deleted FROM assets WHERE id = ?', [aset1]);
    chk('aset yang sudah ada sebelumnya TIDAK ikut dicabut', Number(a1e?.is_deleted), 0);

    console.log('\n9. Ringkasan kapitalisasi setahun');
    const ring = (await call('GET', `/budget/years/${yid}/kapitalisasi`, undefined, master)).json;
    chk('hanya baris CAPEX disetujui yang masuk', ring?.lines?.length, 2);
    chk('total realisasi CAPEX', ring?.total?.realisasi, 280 * JT);
    chk('total yang sudah menjadi aset', ring?.total?.dikapitalisasi, 150 * JT);
    chk('sisa yang menunggu kapitalisasi', ring?.total?.belum_dikapitalisasi, 130 * JT);
    chk('baris yang siap dikapitalisasi dihitung', ring?.total?.jml_siap_dikapitalisasi, 1);
    const rA = ring?.lines?.find((l: any) => l.id === A);
    chk('jumlah aset per baris', rA?.jml_aset, 2);
    chk('persentase kapitalisasi baris', rA?.pct, 53.6);
    const rK = ring?.lines?.find((l: any) => l.id === KOSONG);
    // null berarti belum ada realisasi sama sekali — berbeda dari 0%, yang
    // berarti ada biaya tapi belum satu pun dikapitalisasi.
    chk('tanpa realisasi dilaporkan null, bukan 0%', rK?.pct, null);

    console.log('\n10. Layar kapitalisasi');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fe = join(process.cwd(), '..', 'frontend', 'src');
    const layar = readFileSync(join(fe, 'views', 'AnnualBudget.vue'), 'utf8');
    chk('layar menyebut kapitalisasi', layar.includes('kapitalisasi'), true);
    chk('sisa yang belum dikapitalisasi ditampilkan', layar.includes('belum_dikapitalisasi'), true);
    chk('alokasi per aset diminta di layar', layar.includes('allocated_cost'), true);
    chk('layar menghitung selisih alokasi sebelum kirim', layar.includes('selisihAlokasi'), true);
    chk('pembatalan meminta alasan di layar', layar.includes('Alasan membatalkan'), true);
    // Tidak boleh ada jalur otomatis: aset lahir hanya lewat tindakan manusia.
    const rute = readFileSync(join(process.cwd(), 'src', 'routes', 'budget.routes.ts'), 'utf8');
    const tanpaKomentar = rute.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    chk('tidak ada kapitalisasi otomatis dari status project',
      /project.*status.*(selesai|completed)[\s\S]{0,200}INSERT INTO asset/i.test(tanpaKomentar), false);

  } finally {
    console.log('\n11. Bersih-bersih');
    await bersihkanTahun();
    await dbRun('DELETE FROM assets WHERE name LIKE ?', [`%${stamp}%`]).catch(() => {});
    for (const id of ap) await dbRun('DELETE FROM accounts_payable WHERE id = ?', [id]).catch(() => {});
    for (const id of kontrak) await dbRun('DELETE FROM contracts WHERE id = ?', [id]).catch(() => {});
    for (const id of proposal) {
      await dbRun('DELETE FROM proposal_revisions WHERE proposal_id = ?', [id]).catch(() => {});
      await dbRun('DELETE FROM proposals WHERE id = ?', [id]).catch(() => {});
    }
    for (const id of proyek) {
      await dbRun('DELETE FROM project_expenses WHERE project_id = ?', [id]).catch(() => {});
      await dbRun('DELETE FROM client_projects WHERE id = ?', [id]).catch(() => {});
    }
    const sisaAset: any = await dbGet('SELECT COUNT(*) n FROM assets WHERE name LIKE ?', [`%${stamp}%`]);
    chk('aset fixture tersapu', Number(sisaAset?.n), 0);
    const sisaProp: any = await dbGet('SELECT COUNT(*) n FROM proposals WHERE project_name LIKE ?', [`%${stamp}%`]);
    chk('proposal fixture tersapu', Number(sisaProp?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM asset_capitalization_lines cl
       LEFT JOIN asset_capitalizations c ON c.id = cl.capitalization_id WHERE c.id IS NULL`);
    chk('nol alokasi tanpa event (FK cascade)', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
