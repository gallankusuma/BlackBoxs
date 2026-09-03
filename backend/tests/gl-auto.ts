import 'dotenv/config';
/**
 * Auto-posting general ledger (GL-01 langkah 3).
 *
 * Yang diuji bukan "jurnalnya terbentuk", melainkan sifat-sifat yang kalau
 * hilang membuat buku besar diam-diam salah:
 *
 *   1. Selama tanggal mulai belum diisi, TIDAK ADA jurnal otomatis sama sekali.
 *      Keputusan pemilik: tidak ada jurnal mundur.
 *   2. Transaksi bertanggal SEBELUM tanggal mulai tetap tidak dijurnal, meski
 *      auto-posting sudah aktif.
 *   3. Satu peristiwa = satu jurnal, selamanya. Memanggil ulang tidak
 *      menggandakan apa pun.
 *   4. Setelah rangkaian transaksi bisnis nyata, trial balance dan neraca TETAP
 *      seimbang. Ini asersi yang paling penting: ia menangkap jurnal timpang
 *      dari peristiwa mana pun tanpa perlu tahu peristiwanya.
 *   5. Pemetaan yang hilang menggagalkan transaksi bisnisnya, bukan diam-diam
 *      melewatkan jurnalnya.
 *   6. Barang yang diterima tapi tidak bisa dinilai menolak GRN, bukan menjurnal
 *      angka seadanya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:gl-auto
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
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const stamp = Date.now().toString().slice(-7);
  const TANDA = `[UJI-AUTO-${stamp}]`;
  const hariIni = new Date().toISOString().slice(0, 10);
  const TAHUN = new Date().getFullYear();

  // Periode fiskal & GL bersih untuk tahun uji.
  await call('POST', '/gl/fiscal-periods/generate', { fiscal_year: TAHUN }, master);
  await dbRun("UPDATE fiscal_periods SET status = 'open' WHERE fiscal_year = ?", [TAHUN]);
  const setelanAwal = await dbGet(
    "SELECT setting_value v FROM gl_settings WHERE setting_key = 'auto_posting_start_date'") as any;

  const jumlahJurnal = async () =>
    Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries')) as any)?.c);
  const jurnalUntuk = async (refType: string, refId: any) =>
    await dbAll('SELECT * FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
      [refType, refId]) as any[];

  const bersihkan: { sql: string; params: any[] }[] = [];
  const nanti = (sql: string, ...params: any[]) => bersihkan.unshift({ sql, params });

  // ── Fixture bisnis ──────────────────────────────────────────────────────
  const vendorId = (await call('POST', '/procurement/vendors',
    { name: `Vendor GL ${stamp}`, code: `VGL${stamp}` }, master)).json?.data?.id;
  nanti('DELETE FROM vendors WHERE id = ?', vendorId);
  const emp = await dbRun(
    'INSERT INTO employees (code, name, basic_rate, ot_rate, tunjangan_rate) VALUES (?, ?, 0, 0, 0)',
    [`GL-${stamp}`, `Karyawan GL ${stamp}`]);
  nanti('DELETE FROM employees WHERE id = ?', emp.insertId);
  chk('fixture vendor & karyawan siap', !!(vendorId && emp.insertId), true);

  // ── 1. Auto-posting mati: tidak ada jurnal sama sekali ──────────────────
  console.log('\n1. Selama tanggal mulai kosong, tidak ada jurnal otomatis');
  await dbRun("UPDATE gl_settings SET setting_value = NULL WHERE setting_key = 'auto_posting_start_date'");
  const sebelumMati = await jumlahJurnal();

  const kasbonMati = await call('POST', '/hr/advances',
    { employee_id: emp.insertId, amount: 500000, description: `${TANDA} kasbon saat GL mati`, advance_date: hariIni }, master);
  const kasbonMatiId = kasbonMati.json?.data?.id;
  if (kasbonMatiId) nanti('DELETE FROM salary_advances WHERE id = ?', kasbonMatiId);
  chk('transaksi bisnisnya tetap berhasil', kasbonMati.status, 201);
  chk('  tapi tidak ada jurnal yang lahir', await jumlahJurnal(), sebelumMati);

  // ── 2. Auto-posting aktif, tapi tidak berlaku mundur ────────────────────
  console.log('\n2. Aktif hari ini: transaksi kemarin tetap tidak dijurnal');
  const aktif = await call('PUT', '/gl/settings/auto-posting-start', { start_date: hariIni }, master);
  chk('tanggal mulai diterima', aktif.status, 200);

  const kemarin = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const kasbonMundur = await call('POST', '/hr/advances',
    { employee_id: emp.insertId, amount: 100000, description: `${TANDA} kasbon kemarin`, advance_date: kemarin }, master);
  const kasbonMundurId = kasbonMundur.json?.data?.id;
  if (kasbonMundurId) nanti('DELETE FROM salary_advances WHERE id = ?', kasbonMundurId);
  chk('kasbon bertanggal kemarin dicatat', kasbonMundur.status, 201);
  chk('  tidak dijurnal (tanggalnya sebelum tanggal mulai)',
    (await jurnalUntuk('salary_advance', kasbonMundurId)).length, 0);

  // ── 3. Transaksi hari ini dijurnal, dan hanya sekali ────────────────────
  console.log('\n3. Kasbon hari ini dijurnal, satu peristiwa satu jurnal');
  const kasbon = await call('POST', '/hr/advances',
    { employee_id: emp.insertId, amount: 750000, description: `${TANDA} kasbon`, advance_date: hariIni }, master);
  const kasbonId = kasbon.json?.data?.id;
  if (kasbonId) nanti('DELETE FROM salary_advances WHERE id = ?', kasbonId);
  const jKasbon = await jurnalUntuk('salary_advance', kasbonId);
  chk('jurnal kasbon terbentuk', jKasbon.length, 1);
  chk('  langsung posted', jKasbon[0]?.status, 'posted');
  chk('  bertipe SYSTEM', jKasbon[0]?.journal_type, 'SYSTEM');
  chk('  seimbang 750000',
    [Number(jKasbon[0]?.total_debit), Number(jKasbon[0]?.total_credit)], [750000, 750000]);
  chk('  punya kunci idempotensi',
    /^KASBON_DISBURSED:salary_advance:/.test(String(jKasbon[0]?.idempotency_key || '')), true);

  const barisKasbon = await dbAll(
    `SELECT c.account_code, jl.debit, jl.credit FROM journal_lines jl
     JOIN chart_of_accounts c ON c.id = jl.account_id
     WHERE jl.journal_entry_id = ? ORDER BY jl.line_number`, [jKasbon[0].id]) as any[];
  chk('  Dr 1120 Piutang Karyawan / Cr 1102 Bank',
    barisKasbon.map(b => `${b.account_code}:${Number(b.debit) > 0 ? 'D' : 'K'}`), ['1120:D', '1102:K']);

  // ── 4. Idempotensi ──────────────────────────────────────────────────────
  console.log('\n4. Peristiwa yang sama tidak pernah menjurnal dua kali');
  const { withTransaction } = await import('../src/config/database');
  const { postingOtomatis } = await import('../src/utils/gl-posting');
  const { nextSequentialCode } = await import('../src/routes/procurement.routes');
  // Dua lapis menjaga ini: pemeriksaan idempotency_key di kode, dan UNIQUE di
  // database. Kalau yang pertama dilepas, yang kedua menolak dengan
  // ER_DUP_ENTRY — jurnal keduanya tetap tidak pernah lahir. Keduanya
  // dinyatakan lulus di sini, karena yang dijaga adalah "tidak pernah dua
  // jurnal", bukan cara menahannya.
  let ulang: any;
  try {
    ulang = await withTransaction(async tx => postingOtomatis(tx, {
      event: 'KASBON_DISBURSED', date: hariIni, description: 'panggilan ulang',
      refType: 'salary_advance', refId: Number(kasbonId), sourceModule: 'hr', userId: null,
      lines: [{ role: 'advance', debit: 750000 }, { role: 'bank', credit: 750000 }],
      nomorJurnal: (t: any) => nextSequentialCode('JE', 'journal_entries', 'entry_number', t),
    }));
  } catch (e: any) {
    ulang = { ditolakDatabase: e?.code === 'ER_DUP_ENTRY' };
  }
  chk('panggilan kedua tidak melahirkan jurnal baru',
    typeof ulang === 'number' ? Number(ulang) === Number(jKasbon[0].id) : !!ulang?.ditolakDatabase, true);
  chk('  jumlah jurnalnya tetap satu', (await jurnalUntuk('salary_advance', kasbonId)).length, 1);

  // ── 5. Pemetaan hilang menggagalkan transaksinya, bukan didiamkan ───────
  console.log('\n5. Pemetaan hilang menggagalkan transaksi, tidak didiamkan');
  await dbRun("UPDATE gl_account_mappings SET is_active = 0 WHERE event_code = 'KASBON_DISBURSED' AND role = 'bank'");
  const tanpaPeta = await call('POST', '/hr/advances',
    { employee_id: emp.insertId, amount: 123000, description: `${TANDA} tanpa peta`, advance_date: hariIni }, master);
  chk('kasbon ditolak saat pemetaannya hilang', tanpaPeta.status, 500);
  // Statusnya saja tidak cukup: tanpa penjaga `if (!m)`, kodenya tetap gagal —
  // lewat TypeError mentah — dan layarnya cuma bilang "Failed to record
  // advance". Yang harus membetulkannya tidak punya satu pun petunjuk harus ke
  // mana. Sebabnya harus sampai ke penggunanya.
  chk('  sebabnya disebut, bukan 500 generik', tanpaPeta.json?.code, 'PEMETAAN_HILANG');
  chk('  pesannya menyebut peristiwa & perannya',
    /KASBON_DISBURSED\/bank/.test(String(tanpaPeta.json?.error || '')), true);
  const adaBaris = await dbGet(
    'SELECT COUNT(*) c FROM salary_advances WHERE description LIKE ?', [`%tanpa peta%`]) as any;
  // Inti bagian ini: baris bisnisnya ikut batal. Kalau ia tetap tersimpan
  // sementara jurnalnya tidak, selisihnya baru ketahuan saat tutup buku.
  chk('  baris kasbonnya ikut batal, tidak tersimpan tanpa jurnal', Number(adaBaris?.c), 0);
  await dbRun("UPDATE gl_account_mappings SET is_active = 1 WHERE event_code = 'KASBON_DISBURSED' AND role = 'bank'");

  // ── 5b. Payroll: beban = GROSS, bukan net ───────────────────────────────
  //
  // Menjalankan payroll penuh butuh fixture payslip satu periode; yang diuji di
  // sini invariannya, dan invarian itulah yang menangkap kekeliruannya:
  // beban = utang gaji + potongan kasbon. Kalau bebannya diisi NET, jurnalnya
  // jadi timpang sebesar kasbon dan ditolak — jadi payroll akan berhenti
  // bekerja, bukan diam-diam mencatat biaya proyek yang terlalu kecil.
  console.log('\n5b. Payroll menjurnal GROSS, bukan net');
  const GROSS = 10000000, KASBON = 1500000, NET = GROSS - KASBON;
  const cobaPayroll = async (bebanDebit: number, suffix: string) => {
    try {
      return await withTransaction(async tx => postingOtomatis(tx, {
        event: 'PAYROLL_DIRECT', date: hariIni,
        description: `${TANDA} uji payroll ${suffix}`,
        refType: 'payroll_period', refId: 990000 + Number(suffix), sourceModule: 'hr', userId: null,
        lines: [
          { role: 'expense', debit: bebanDebit },
          { role: 'payable', credit: NET },
          { role: 'advance', credit: KASBON },
        ],
        nomorJurnal: (t: any) => nextSequentialCode('JE', 'journal_entries', 'entry_number', t),
      }));
    } catch (e: any) { return { gagal: e?.code || e?.message }; }
  };
  const pGross = await cobaPayroll(GROSS, '1');
  chk('payroll dengan beban GROSS diterima', typeof pGross === 'number', true);
  if (typeof pGross === 'number') await dbRun('DELETE FROM journal_entries WHERE id = ?', [pGross]);
  const pNet = await cobaPayroll(NET, '2');
  chk('payroll dengan beban NET ditolak sebagai timpang', (pNet as any)?.gagal, 'TIDAK_SEIMBANG');

  // Penjaga di titik kaitnya sendiri: yang dijurnal sebagai beban harus
  // totalGross. Invarian di atas menangkap akibatnya; ini menangkap sebabnya,
  // dan menyebut nama variabelnya supaya penggantian diam-diam ikut ketahuan.
  const fsHr = await import('fs');
  const srcHr = fsHr.readFileSync('src/routes/hr.routes.ts', 'utf8');
  chk('titik kait payroll memakai totalGross sebagai beban',
    /role: 'expense', debit: totalGross/.test(srcHr), true);

  // ── 5c. Referensi jurnal harus muat di INT ──────────────────────────────
  //
  // journal_entries.reference_id bertipe INT. Payroll sempat merakit refId dari
  // project_id * 1e6 + tahun * 100 + bulan — untuk proyek berid empat digit
  // hasilnya 4,5 miliar, dan MySQL menolaknya sebagai error mentah di tengah
  // transaksi. Yang terlihat cuma 500 tanpa sebab, dan payroll berhenti bekerja.
  console.log('\n5c. Referensi jurnal yang melebihi jangkauan INT ditolak dengan sebabnya');
  let refBesar: any;
  try {
    refBesar = await withTransaction(async tx => postingOtomatis(tx, {
      event: 'KASBON_DISBURSED', date: hariIni, description: `${TANDA} ref kebesaran`,
      refType: 'salary_advance', refId: 4510209812, sourceModule: 'hr', userId: null,
      lines: [{ role: 'advance', debit: 1000 }, { role: 'bank', credit: 1000 }],
      nomorJurnal: (t: any) => nextSequentialCode('JE', 'journal_entries', 'entry_number', t),
    }));
  } catch (e: any) { refBesar = { code: e?.code }; }
  chk('refId di luar jangkauan INT ditolak', refBesar?.code, 'REFERENSI_DI_LUAR_JANGKAUAN');

  // ── 6. Buku besar tetap seimbang setelah transaksi bisnis ───────────────
  console.log('\n6. Trial balance dan neraca tetap seimbang');
  const tb = (await call('GET', '/gl/trial-balance', undefined, master)).json;
  chk('trial balance seimbang', [tb?.seimbang, tb?.selisih], [true, 0]);
  const ns = (await call('GET', '/gl/reports/balance-sheet', undefined, master)).json;
  chk('neraca seimbang', ns?.seimbang, true);

  // Setiap jurnal otomatis harus seimbang satu per satu, bukan cuma totalnya.
  const timpang = await dbAll(
    `SELECT je.entry_number, je.total_debit, je.total_credit,
            (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE journal_entry_id = je.id) d,
            (SELECT COALESCE(SUM(credit),0) FROM journal_lines WHERE journal_entry_id = je.id) k
     FROM journal_entries je WHERE je.journal_type = 'SYSTEM'
     HAVING ABS(d - k) > 0.0001 OR ABS(d - je.total_debit) > 0.0001`) as any[];
  chk('tidak ada jurnal otomatis yang timpang', timpang.length, 0);

  // ── 7. Setiap peristiwa yang dipanggil kode punya pemetaannya ───────────
  console.log('\n7. Setiap peristiwa yang dipanggil kode punya pemetaannya');
  const fs = await import('fs');
  const berkas = ['procurement', 'finance', 'project', 'asset', 'hr'].map(f => `src/routes/${f}.routes.ts`);
  const dipakai = new Set<string>();
  const perluPeran: Record<string, Set<string>> = {};
  for (const f of berkas) {
    const src = fs.readFileSync(f, 'utf8');
    // Hanya yang benar-benar berada di posisi `event:` — termasuk yang dipilih
    // lewat ternary. Memindai ternary di seluruh berkas akan ikut menangkap
    // konstanta lain yang kebetulan huruf besar (PO_LOCKED_APPROVED, ACTIVE).
    for (const m of src.matchAll(/event:\s*(?:'([A-Z_]+)'|[^,\n]*?\?\s*'([A-Z_]+)'\s*:\s*'([A-Z_]+)')/g)) {
      for (const g of [m[1], m[2], m[3]]) if (g) dipakai.add(g);
    }
    for (const m of src.matchAll(/role:\s*'([a-z_]+)'/g)) (perluPeran['*'] ||= new Set()).add(m[1]);
  }
  const terdaftar = new Set((await dbAll('SELECT DISTINCT event_code FROM gl_account_mappings WHERE is_active = 1') as any[])
    .map((r: any) => r.event_code));
  const hilang = [...dipakai].filter(e => !terdaftar.has(e));
  chk('tidak ada peristiwa yang dipanggil tapi tidak dipetakan', hilang, []);
  chk('  peristiwa yang benar-benar dipakai kode', dipakai.size >= 6, true);

  // Pemetaan yang menunjuk akun tidak ada / header akan meledak saat jurnalnya
  // dibentuk — dan itu terjadi di tengah transaksi bisnis orang lain.
  const petaRusak = await dbAll(
    `SELECT m.event_code, m.role, m.account_code FROM gl_account_mappings m
     LEFT JOIN chart_of_accounts c ON c.account_code = m.account_code
     WHERE m.is_active = 1 AND (c.id IS NULL OR c.is_header = 1 OR c.is_active = 0)`) as any[];
  chk('tidak ada pemetaan yang menunjuk akun tak terpakai', petaRusak.length, 0);

  // ── 8. Kolom yang disebut SQL auto-posting benar-benar ada ──────────────
  console.log('\n8. Nama kolom di jalur auto-posting benar-benar ada');
  // Nama kolom yang salah tidak menghasilkan error saat tsc maupun build —
  // ia baru meledak saat jurnalnya dibentuk, di tengah transaksi bisnis.
  // change_orders.value_change sempat ditulis begitu; yang benar value_delta.
  const kolomDipakai: [string, string][] = [
    ['change_orders', 'value_delta'],
    ['contracts', 'original_value'],
    ['project_progress_periods', 'earned_pct'],
    ['goods_receipts', 'received_date'],
    ['purchase_order_items', 'unit_price'],
    ['salary_advances', 'advance_date'],
    ['accounts_receivable', 'tax_amount'],
  ];
  const kolomHilang: string[] = [];
  for (const [t, k] of kolomDipakai) {
    const ada = await dbGet(
      `SELECT COUNT(*) c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [t, k]) as any;
    if (!Number(ada?.c)) kolomHilang.push(`${t}.${k}`);
  }
  chk('kolom yang disebut jalur auto-posting ada semua', kolomHilang, []);

  // ── Bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n9. Bersih-bersih fixture');
  const jurnalUji = await dbAll(
    `SELECT id FROM journal_entries WHERE reference_type IN ('salary_advance')
       AND reference_id IN (${[kasbonId, kasbonMatiId, kasbonMundurId].filter(Boolean).map(() => '?').join(',') || '0'})`,
    [kasbonId, kasbonMatiId, kasbonMundurId].filter(Boolean)) as any[];
  for (const j of jurnalUji) await dbRun('DELETE FROM journal_entries WHERE id = ?', [j.id]);
  for (const b of bersihkan) await dbRun(b.sql, b.params);
  await dbRun("UPDATE gl_settings SET setting_value = ? WHERE setting_key = 'auto_posting_start_date'",
    [setelanAwal?.v ?? null]);
  chk('fixture terhapus & setelan dikembalikan',
    [(await dbAll('SELECT id FROM salary_advances WHERE description LIKE ?', [`%${TANDA}%`])).length,
     ((await dbGet("SELECT setting_value v FROM gl_settings WHERE setting_key = 'auto_posting_start_date'")) as any)?.v ?? null],
    [0, setelanAwal?.v ?? null]);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
