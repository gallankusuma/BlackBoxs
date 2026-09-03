import 'dotenv/config';
/**
 * General Ledger inti (GL-01).
 *
 * Yang diuji di sini bukan "endpointnya menjawab", melainkan lima hal yang di
 * GL asal (instance rheologi) tidak ada — dan tanpanya buku besar bisa rusak
 * tanpa satu pun error muncul:
 *
 *   1. Jurnal tidak seimbang TIDAK PERNAH tersimpan. Di sana pemeriksaannya
 *      atas body request, sementara penyisipan barisnya tidak dibungkus
 *      transaction — jadi jurnal setengah jadi bisa lolos.
 *   2. Akun header menolak jurnal. Di sana `is_header` cuma dipakai di filter
 *      laporan, jadi uang bisa mendarat di akun yang laporannya membuang.
 *   3. Akun kontrol menolak jurnal MANUAL tapi menerima jurnal sistem.
 *   4. Periode tertutup benar-benar mengunci, saat membuat maupun saat posting.
 *   5. Trial balance dan neraca dihitung dari SATU jalur, jadi keduanya tidak
 *      bisa berselisih. Di sana ada dua jalur: journal_lines dan kolom
 *      current_balance.
 *
 * Ditambah: jurnal posted tidak bisa dihapus, pembalikan menetralkan saldo
 * sampai nol, dan auto-posting mati selama tanggal mulainya belum diisi.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:gl-core
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

  const akunId = async (kode: string) =>
    Number(((await dbGet('SELECT id FROM chart_of_accounts WHERE account_code = ?', [kode])) as any)?.id);

  const KAS = await akunId('1101');          // biasa, boleh manual
  const BANK = await akunId('1102');         // kontrol BANK
  const AP = await akunId('2101');           // kontrol AP
  const HEADER = await akunId('1100');       // header "Aset Lancar"
  const BEBAN = await akunId('6200');        // beban kantor
  const MODAL = await akunId('3100');
  chk('akun uji tersedia', [KAS, BANK, AP, HEADER, BEBAN, MODAL].every(Boolean), true);

  // Periode fiskal untuk tahun uji. Idempoten.
  const TAHUN = new Date().getFullYear();
  await call('POST', '/gl/fiscal-periods/generate', { fiscal_year: TAHUN }, master);
  const hariIni = new Date().toISOString().slice(0, 10);
  const periode = await dbGet(
    'SELECT * FROM fiscal_periods WHERE ? BETWEEN start_date AND end_date', [hariIni]) as any;
  chk('periode fiskal untuk hari ini ada', !!periode?.id, true);
  // Tes tidak boleh bergantung pada sisa keadaan run sebelumnya.
  await dbRun("UPDATE fiscal_periods SET status = 'open' WHERE id = ?", [periode.id]);

  // Setiap jurnal uji diberi penanda, dan sisa run yang gagal di tengah
  // dibersihkan lebih dulu. Tanpa ini, satu draft yang tertinggal membuat
  // penutupan periode gagal di run berikutnya — tes jadi gagal karena dirinya
  // sendiri, bukan karena kodenya.
  const TANDA = '[UJI-GL]';
  const sisa = await dbAll(
    'SELECT id FROM journal_entries WHERE description LIKE ?', [`%${TANDA}%`]) as any[];
  if (sisa.length) {
    const ids = sisa.map(x => x.id);
    await dbRun(`UPDATE journal_entries SET reversal_journal_id=NULL, original_journal_id=NULL WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const id of ids) await dbRun('DELETE FROM journal_entries WHERE id = ?', [id]);
    console.log(`  ok   ${ids.length} jurnal sisa run sebelumnya dibersihkan`);
    pass++;
  }

  const dibuat: number[] = [];
  const buat = async (lines: any[], desc = 'Jurnal uji', tanggal = hariIni) => {
    const r = await call('POST', '/gl/journal-entries',
      { entry_date: tanggal, description: `${TANDA} ${desc}`, lines }, master);
    const id = r.json?.data?.id;
    if (id) dibuat.push(id);
    return r;
  };

  // ── 1. Jurnal tidak seimbang tidak pernah tersimpan ─────────────────────
  console.log('\n1. Jurnal tidak seimbang tidak pernah tersimpan');
  const sebelum = Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries')) as any)?.c);
  const timpang = await buat([
    { account_id: KAS, debit: 1000, credit: 0 },
    { account_id: MODAL, debit: 0, credit: 900 },
  ], 'Sengaja timpang');
  chk('ditolak 400', [timpang.status, timpang.json?.code], [400, 'TIDAK_SEIMBANG']);
  const sesudah = Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries')) as any)?.c);
  // Inti bagian ini: penolakan saja tidak cukup — barisnya juga tidak boleh
  // tertinggal di database. Tanpa transaction, header-nya sudah terlanjur ada.
  chk('  tidak ada jurnal yang tertinggal di database', sesudah, sebelum);

  // Sengaja SEIMBANG, dengan satu baris tambahan tanpa nilai. Kalau jurnalnya
  // dibuat timpang, penolakan TIDAK_SEIMBANG yang duluan dan penjaga baris
  // kosong tidak pernah tercapai — persis kekeliruan fixture yang pertama.
  const satuSisi = await buat([
    { account_id: KAS, debit: 500, credit: 0 },
    { account_id: MODAL, debit: 0, credit: 500 },
    { account_id: BEBAN, debit: 0, credit: 0 },
  ], 'Ada baris tanpa nilai');
  chk('baris tanpa nilai ditolak', satuSisi.json?.code, 'BARIS_KOSONG');
  chk('  tetap tidak ada yang tertinggal',
    Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries')) as any)?.c), sebelum);

  chk('satu baris saja ditolak',
    (await buat([{ account_id: KAS, debit: 100, credit: 0 }])).json?.code, 'BARIS_KURANG');

  // Inti klaim modul ini: keseimbangan diperiksa dari baris yang TERSIMPAN,
  // bukan dari body request. Dalam keadaan normal keduanya sama, jadi butuh
  // kasus yang membuat keduanya berbeda.
  //
  // journal_lines.debit bertipe DECIMAL(20,4). Sepuluh baris 10.00004 dibulatkan
  // masing-masing jadi 10.0000 — jumlah tersimpannya 100.0000, sementara jumlah
  // di body 100.0004. Lawannya satu baris 100.0004 yang tersimpan utuh.
  //
  // Jadi: menurut body jurnalnya SEIMBANG, menurut yang tersimpan TIDAK.
  // Pemeriksa yang membaca body akan meloloskannya, dan buku besar mulai
  // menyimpan selisih yang tidak pernah dilaporkan siapa pun.
  const pembulatan = await buat([
    ...Array.from({ length: 10 }, () => ({ account_id: KAS, debit: 10.00004, credit: 0 })),
    { account_id: MODAL, debit: 0, credit: 100.0004 },
  ], 'Selisih pembulatan yang hanya terlihat setelah tersimpan');
  chk('selisih pembulatan tertangkap dari baris tersimpan',
    [pembulatan.status, pembulatan.json?.code], [400, 'TIDAK_SEIMBANG']);
  chk('  angkanya dilaporkan dari yang tersimpan, bukan dari body',
    [pembulatan.json?.total_debit, pembulatan.json?.total_credit], [100, 100.0004]);
  chk('  dan tidak ada yang tertinggal',
    Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries')) as any)?.c), sebelum);

  // ── 2. Akun header menolak jurnal ───────────────────────────────────────
  console.log('\n2. Akun header dan akun kontrol');
  const keHeader = await buat([
    { account_id: HEADER, debit: 1000, credit: 0 },
    { account_id: MODAL, debit: 0, credit: 1000 },
  ], 'Ke akun header');
  chk('jurnal ke akun header ditolak', [keHeader.status, keHeader.json?.code], [400, 'AKUN_HEADER']);

  const keKontrol = await buat([
    { account_id: AP, debit: 0, credit: 1000 },
    { account_id: BEBAN, debit: 1000, credit: 0 },
  ], 'Manual ke akun kontrol');
  chk('jurnal MANUAL ke akun kontrol ditolak', [keKontrol.status, keKontrol.json?.code], [409, 'AKUN_KONTROL']);
  chk('  pesannya menyebut subledger',
    /subledger/i.test(String(keKontrol.json?.error || '')), true);

  // ── 3. Jurnal yang sah tersimpan & bisa di-post ─────────────────────────
  console.log('\n3. Jurnal yang sah: draft → posted');
  const sah = await buat([
    { account_id: BEBAN, debit: 250000, credit: 0, description: 'ATK' },
    { account_id: KAS, debit: 0, credit: 250000 },
  ], 'Beli ATK tunai');
  const jeId = sah.json?.data?.id;
  chk('jurnal sah dibuat', [sah.status, !!jeId], [201, true]);
  chk('  lahir sebagai draft',
    ((await dbGet('SELECT status FROM journal_entries WHERE id = ?', [jeId])) as any)?.status, 'draft');
  chk('  belum masuk trial balance selama draft',
    (await call('GET', `/gl/ledger/${BEBAN}`, undefined, master)).json?.data?.saldo_akhir, 0);

  chk('post diterima', (await call('PUT', `/gl/journal-entries/${jeId}/post`, {}, master)).status, 200);
  chk('  saldo beban jadi 250000',
    (await call('GET', `/gl/ledger/${BEBAN}`, undefined, master)).json?.data?.saldo_akhir, 250000);
  chk('  post kedua ditolak',
    (await call('PUT', `/gl/journal-entries/${jeId}/post`, {}, master)).json?.code, 'BUKAN_DRAFT');
  chk('  jurnal posted tidak bisa dihapus',
    (await call('DELETE', `/gl/journal-entries/${jeId}`, undefined, master)).json?.code, 'BUKAN_DRAFT');

  // ── 4. Trial balance & neraca dari satu jalur ───────────────────────────
  console.log('\n4. Trial balance dan neraca tidak bisa berselisih');
  const tb = (await call('GET', '/gl/trial-balance', undefined, master)).json;
  chk('trial balance seimbang', tb?.seimbang, true);
  chk('  selisihnya nol', tb?.selisih, 0);
  const ns = (await call('GET', '/gl/reports/balance-sheet', undefined, master)).json;
  chk('neraca seimbang', ns?.seimbang, true);

  // Angka yang sama harus keluar dari dua endpoint berbeda. Endpoint cepat yang
  // menjawab beda untuk pertanyaan yang sama lebih berbahaya daripada yang lambat.
  const dariTb = (tb?.data || []).find((r: any) => Number(r.id) === BEBAN)?.saldo;
  const dariLedger = (await call('GET', `/gl/ledger/${BEBAN}`, undefined, master)).json?.data?.saldo_akhir;
  chk('saldo akun sama di trial balance dan buku besar', dariTb, dariLedger);

  const lr = (await call('GET', '/gl/reports/income-statement', undefined, master)).json;
  const bebanDiLr = (lr?.beban_operasional || []).find((r: any) => Number(r.id) === BEBAN)?.amount;
  chk('  dan sama di laba rugi', bebanDiLr, dariLedger);

  // ── 5. Pembalikan menetralkan, bukan menghapus ──────────────────────────
  console.log('\n5. Pembalikan menetralkan saldo tanpa menghapus jejak');
  const balik = await call('PUT', `/gl/journal-entries/${jeId}/reverse`,
    { reason: 'salah akun' }, master);
  const balikId = balik.json?.data?.id;
  if (balikId) dibuat.push(balikId);
  chk('pembalikan dibuat', [balik.status, !!balikId], [201, true]);
  if (!balikId) {
    // Tanpa penjaga ini tes MATI dengan error database alih-alih melapor —
    // dan mutasi yang seharusnya terbukti tertangkap malah terlihat seperti
    // harness yang rusak. Yang gagal harus terbaca sebagai kegagalan.
    console.log('  FAIL pembalikan tidak terbentuk — bagian 5 dilewati');
    fail++;
    console.log(`\n${pass} lulus, ${fail} gagal`);
    process.exit(1);
  }
  chk('  jurnal asli jadi reversed',
    ((await dbGet('SELECT status FROM journal_entries WHERE id = ?', [jeId])) as any)?.status, 'reversed');
  chk('  jurnal pembalik langsung posted',
    ((await dbGet('SELECT status FROM journal_entries WHERE id = ?', [balikId])) as any)?.status, 'posted');
  chk('  saldo beban kembali nol',
    (await call('GET', `/gl/ledger/${BEBAN}`, undefined, master)).json?.data?.saldo_akhir, 0);
  chk('  jurnal aslinya TIDAK dihapus',
    Number(((await dbGet('SELECT COUNT(*) c FROM journal_entries WHERE id = ?', [jeId])) as any)?.c), 1);
  chk('  pembalikan kedua ditolak',
    (await call('PUT', `/gl/journal-entries/${jeId}/reverse`, { reason: 'lagi' }, master)).json?.code, 'SUDAH_DIBALIK');
  chk('  alasan wajib diisi',
    (await call('PUT', `/gl/journal-entries/${balikId}/reverse`, {}, master)).json?.code, 'ALASAN_WAJIB');

  // ── 6. Periode tertutup mengunci ────────────────────────────────────────
  console.log('\n6. Periode tertutup benar-benar mengunci');
  const draftDiPeriode = await buat([
    { account_id: BEBAN, debit: 1000, credit: 0 },
    { account_id: KAS, debit: 0, credit: 1000 },
  ], 'Draft menjelang tutup');
  const draftId = draftDiPeriode.json?.data?.id;
  const tutupGagal = await call('PUT', `/gl/fiscal-periods/${periode.id}/close`, {}, master);
  // Draft yang tertinggal di periode tertutup akan menggantung selamanya:
  // tidak bisa di-post, tidak terlihat di laporan.
  chk('tutup ditolak selama masih ada draft', [tutupGagal.status, tutupGagal.json?.code], [409, 'MASIH_ADA_DRAFT']);

  await call('DELETE', `/gl/journal-entries/${draftId}`, undefined, master);
  chk('setelah draft dibereskan, periode bisa ditutup',
    (await call('PUT', `/gl/fiscal-periods/${periode.id}/close`, {}, master)).status, 200);

  const setelahTutup = await buat([
    { account_id: BEBAN, debit: 5000, credit: 0 },
    { account_id: KAS, debit: 0, credit: 5000 },
  ], 'Setelah periode ditutup');
  chk('jurnal baru di periode tertutup ditolak',
    [setelahTutup.status, setelahTutup.json?.code], [409, 'PERIODE_TERTUTUP']);

  chk('membuka kembali butuh alasan',
    (await call('PUT', `/gl/fiscal-periods/${periode.id}/reopen`, {}, master)).json?.code, 'ALASAN_WAJIB');
  chk('dibuka kembali dengan alasan',
    (await call('PUT', `/gl/fiscal-periods/${periode.id}/reopen`, { reason: 'koreksi tes' }, master)).status, 200);

  // ── 7. Auto-posting mati sampai tanggalnya diisi ────────────────────────
  console.log('\n7. Auto-posting mati sampai tanggal mulainya diisi');
  // Keadaan setelan dikondisikan dan dikembalikan, bukan diasumsikan. Versi
  // pertama mengandaikan tanggalnya masih kosong — dan begitu test:gl-auto
  // menyalakannya lebih dulu di rangkaian yang sama, bagian ini gagal karena
  // tes lain, bukan karena kodenya.
  const setelanSemula = ((await dbGet(
    "SELECT setting_value v FROM gl_settings WHERE setting_key = 'auto_posting_start_date'")) as any)?.v ?? null;
  await dbRun("UPDATE gl_settings SET setting_value = NULL WHERE setting_key = 'auto_posting_start_date'");

  const setelan = (await call('GET', '/gl/settings', undefined, master)).json;
  chk('auto-posting mati saat tanggalnya kosong', setelan?.auto_posting_aktif, false);
  chk('tanggal mulai terbaca kosong', setelan?.auto_posting_start_date, null);
  chk('tanggal di luar periode fiskal ditolak',
    (await call('PUT', '/gl/settings/auto-posting-start', { start_date: '1999-01-01' }, master)).json?.code,
    'PERIODE_TIDAK_ADA');

  await dbRun("UPDATE gl_settings SET setting_value = ? WHERE setting_key = 'auto_posting_start_date'",
    [setelanSemula]);
  chk('  setelan dikembalikan seperti semula',
    ((await dbGet("SELECT setting_value v FROM gl_settings WHERE setting_key = 'auto_posting_start_date'")) as any)?.v ?? null,
    setelanSemula);

  // ── 8. Pemetaan tidak boleh menunjuk akun yang tidak bisa dijurnal ──────
  console.log('\n8. Pemetaan jurnal otomatis');
  const map = (await call('GET', '/gl/mappings', undefined, master)).json;
  chk('tidak ada pemetaan bermasalah', (map?.bermasalah || []).length, 0);
  const satuMap = (map?.data || [])[0];
  chk('pemetaan ke akun header ditolak',
    (await call('PUT', `/gl/mappings/${satuMap?.id}`, { account_code: '1100' }, master)).json?.code, 'AKUN_HEADER');
  chk('pemetaan ke akun tidak ada ditolak',
    (await call('PUT', `/gl/mappings/${satuMap?.id}`, { account_code: '9999' }, master)).json?.code, 'AKUN_TIDAK_ADA');

  // ── 9. Sifat struktural yang dijaga ─────────────────────────────────────
  console.log('\n9. Saldo tidak pernah disimpan; satu rumus untuk semua laporan');
  const kolomSaldo = await dbAll(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts'
       AND COLUMN_NAME IN ('current_balance','opening_balance')`) as any[];
  chk('tidak ada kolom saldo di chart_of_accounts', kolomSaldo.length, 0);

  const fs = await import('fs');
  // Dipindai KEDUANYA: sejak auto-posting, pembuatan jurnal ada di util
  // bersama sementara laporannya di rute. Memindai satu berkas saja akan
  // membuat penjaga struktural ini diam persis saat kodenya dipecah.
  const srcRute = fs.readFileSync('src/routes/gl.routes.ts', 'utf8');
  const srcUtil = fs.readFileSync('src/utils/gl-posting.ts', 'utf8');
  const src = srcRute + '\n' + srcUtil;
  // Kalau nanti ada yang menambah UPDATE saldo ke COA, ia harus tertangkap di
  // sini — bukan berbulan-bulan kemudian saat neraca mulai tidak cocok.
  chk('tidak ada UPDATE saldo ke chart_of_accounts',
    /UPDATE chart_of_accounts SET[^`]*balance/i.test(src), false);
  // Satu jalur pembuatan jurnal. Jurnal otomatis yang punya jalurnya sendiri
  // akan ketinggalan aturan yang dipasang di jalur manual, cepat atau lambat.
  chk('hanya ada SATU fungsi pembuat jurnal',
    (src.match(/INSERT INTO journal_entries/g) || []).length, 1);
  chk('rute memakai buatJurnal dari util, bukan salinannya',
    /from '\.\.\/utils\/gl-posting'/.test(srcRute) && !/INSERT INTO journal_entries/.test(srcRute),
    true);
  // Setiap laporan harus lewat SQL_SALDO. Jalur kedua = dua sumber kebenaran.
  const pakaiSaldo = (src.match(/SQL_SALDO/g) || []).length;
  chk('SQL_SALDO dipakai semua jalur laporan', pakaiSaldo >= 4, true);
  // Filter status yang ditulis ulang di SATU tempat saja sudah cukup untuk
  // membuat dua endpoint menjawab beda tentang saldo yang sama — itulah yang
  // terjadi pada /ledger di versi pertama.
  //
  // Yang diperiksa hanya query yang benar-benar MEMBACA ANGKA jurnal. Query
  // lain boleh memfilter status apa adanya: menghitung berapa entry posted per
  // periode, atau memfilter daftar sesuai pilihan pengguna, bukan perhitungan
  // saldo.
  const literal = src.split('`');
  const bacaAngka = literal.filter(t =>
    /journal_lines/.test(t) && /(jl\.debit|jl\.credit|SUM\(jl\.)/.test(t) && /je\.status/.test(t));
  const tanpaKonstanta = bacaAngka.filter(t => !/STATUS_DIHITUNG/.test(t));
  chk('setiap query yang membaca angka jurnal memakai STATUS_DIHITUNG',
    [bacaAngka.length >= 2, tanpaKonstanta.length], [true, 0]);
  const tulisTanpaTx = /router\.(post|put|delete)\([^)]*\)[\s\S]{0,400}?await dbRun\(\s*`INSERT INTO journal_/i.test(src);
  chk('tidak ada penulisan jurnal di luar transaction', tulisTanpaTx, false);

  // ── Bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n10. Bersih-bersih fixture');
  for (const id of dibuat) {
    await dbRun('DELETE FROM journal_lines WHERE journal_entry_id = ?', [id]);
  }
  // Jurnal pembalik menunjuk aslinya lewat original_journal_id; lepaskan dulu.
  await dbRun(`UPDATE journal_entries SET reversal_journal_id = NULL, original_journal_id = NULL
               WHERE id IN (${dibuat.map(() => '?').join(',') || '0'})`, dibuat);
  for (const id of dibuat) await dbRun('DELETE FROM journal_entries WHERE id = ?', [id]);
  chk('fixture jurnal terhapus',
    (await dbAll(`SELECT id FROM journal_entries WHERE id IN (${dibuat.map(() => '?').join(',') || '0'})`, dibuat)).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
