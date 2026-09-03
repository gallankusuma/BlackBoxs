import { dbGet, TxRunner } from '../config/database';

/**
 * Inti general ledger: SATU jalur pembuatan jurnal, dipakai jurnal manual
 * maupun jurnal otomatis (GL-01 langkah 3).
 *
 * Kenapa di util, bukan di rute: kalau auto-posting membuat jurnal lewat
 * jalurnya sendiri, ada DUA cara jurnal lahir — dan dua-duanya harus dijaga
 * seimbang, ditolak di akun header, dikunci periode. Cepat atau lambat yang
 * satu ketinggalan aturan yang sudah dipasang di yang lain, dan yang mulai
 * menyimpan jurnal rusak justru jalur yang tidak diketik manusia.
 */

export const uang = (v: any) => Math.round(Number(v || 0) * 10000) / 10000;

/**
 * Penolakan di dalam transaction WAJIB dilempar, tidak boleh di-return.
 *
 * `withTransaction` menganggap callback yang selesai tanpa melempar sebagai
 * sukses dan COMMIT. Versi pertama modul ini me-return objek kegagalan — dan
 * jurnal yang ditolak karena tidak seimbang tetap tersimpan, persis cacat yang
 * dihindari dari GL asal. Tertangkap tes: "tidak ada jurnal yang tertinggal".
 */
export class GlGagal extends Error {
  constructor(public code: string, message: string, public httpStatus = 400, public extra: any = {}) {
    super(message);
    this.name = 'GlGagal';
  }
}

/**
 * Status jurnal yang ikut dihitung dalam saldo.
 *
 * Draft tidak dihitung — ia belum terjadi. Jurnal `reversed` TETAP dihitung,
 * dan ini titik yang paling mudah salah: pembalikan bekerja dengan menambah
 * jurnal berlawanan, bukan menghapus yang asli. Kalau yang asli ikut
 * dikeluarkan, pembatalannya terjadi DUA KALI dan saldonya berbalik tanda.
 * Tertangkap tes: "saldo beban kembali nol" sempat menjawab -250000.
 */
export const STATUS_DIHITUNG = `('posted', 'reversed')`;

/** Satu-satunya rumus saldo. Semua laporan memakainya. */
export const SQL_SALDO = `
  SELECT jl.account_id,
         COALESCE(SUM(jl.debit), 0)  AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status IN ${STATUS_DIHITUNG}`;

/** Saldo bertanda sesuai sifat akun: positif berarti searah saldo normalnya. */
export const saldoNormal = (normal: string, debit: number, credit: number) =>
  normal === 'debit' ? uang(debit - credit) : uang(credit - debit);

/** Periode yang memuat tanggal ini, apa pun statusnya. */
export const periodeUntuk = async (tanggal: string, tx?: TxRunner) => {
  const q = 'SELECT * FROM fiscal_periods WHERE ? BETWEEN start_date AND end_date LIMIT 1';
  return (tx ? await tx.get(q, [tanggal]) : await dbGet(q, [tanggal])) as any;
};

/**
 * Memvalidasi akun tujuan tiap baris.
 *
 * `manual` membedakan jurnal yang diketik orang dari jurnal yang lahir dari
 * peristiwa: akun kontrol menolak yang pertama dan menerima yang kedua, karena
 * justru sistemlah yang berhak menggerakkan saldo subledger.
 */
export const validasiAkun = async (tx: TxRunner, lines: any[], manual: boolean) => {
  const ids = [...new Set(lines.map(l => Number(l.account_id)).filter(Boolean))];
  if (!ids.length) throw new GlGagal('AKUN_WAJIB', 'Tidak ada akun yang sah di baris jurnal');
  const akun = await tx.all(
    `SELECT id, account_code, account_name, is_header, is_postable, is_active,
            is_control_account, allow_manual_posting
     FROM chart_of_accounts WHERE id IN (${ids.map(() => '?').join(',')})`, ids) as any[];
  const peta = new Map<number, any>(akun.map(a => [Number(a.id), a]));

  for (const l of lines) {
    const a = peta.get(Number(l.account_id));
    if (!a) throw new GlGagal('AKUN_TIDAK_ADA', `Akun id ${l.account_id} tidak ditemukan`);
    if (!a.is_active) throw new GlGagal('AKUN_NONAKTIF', `${a.account_code} ${a.account_name} sudah nonaktif`);
    if (a.is_header || !a.is_postable) {
      throw new GlGagal('AKUN_HEADER',
        `${a.account_code} ${a.account_name} adalah akun header — ia hanya mengelompokkan dan tidak bisa menerima jurnal. Pilih akun turunannya.`);
    }
    if (manual && a.is_control_account && !a.allow_manual_posting) {
      throw new GlGagal('AKUN_KONTROL',
        `${a.account_code} ${a.account_name} adalah akun kontrol — saldonya datang dari subledger, jadi tidak boleh dijurnal manual. Kalau tidak, buku besar dan daftar subledger bisa berselisih tanpa bisa dijelaskan.`,
        409);
    }
  }
};

/**
 * Membuat jurnal di dalam SATU transaction, lalu memeriksa keseimbangannya dari
 * baris yang BENAR-BENAR TERSIMPAN.
 *
 * Memeriksa body request saja tidak cukup: kalau penyisipan baris ke-3 gagal,
 * body-nya tetap seimbang sementara jurnalnya tidak. Dan pembulatan
 * DECIMAL(20,4) bisa membuat jumlah yang tersimpan berbeda dari jumlah yang
 * dikirim — sepuluh baris 10.00004 tersimpan 100.0000, bukan 100.0004.
 */
export const buatJurnal = async (opts: {
  tx: TxRunner; entryNumber: string; entryDate: string; description: string;
  journalType?: string; lines: any[]; userId: number | null; manual: boolean;
  sourceModule?: string | null; sourceEvent?: string | null;
  referenceType?: string | null; referenceId?: number | null; referenceNumber?: string | null;
  idempotencyKey?: string | null; originalJournalId?: number | null;
}) => {
  const { tx, lines } = opts;

  await validasiAkun(tx, lines, opts.manual);

  const periode = await periodeUntuk(opts.entryDate, tx);
  if (!periode) {
    throw new GlGagal('PERIODE_TIDAK_ADA',
      `Belum ada periode fiskal yang memuat ${opts.entryDate}. Buat periode tahunnya dulu.`);
  }
  if (periode.status === 'closed') {
    throw new GlGagal('PERIODE_TERTUTUP',
      `Periode ${periode.period_name} sudah ditutup, jadi tidak bisa menerima jurnal bertanggal ${opts.entryDate}.`,
      409);
  }

  const head = await tx.run(
    `INSERT INTO journal_entries
      (entry_number, entry_date, fiscal_period_id, journal_type, description,
       source_module, source_event, reference_type, reference_id, reference_number,
       total_debit, total_credit, status, original_journal_id, idempotency_key, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'draft', ?, ?, ?)`,
    [opts.entryNumber, opts.entryDate, periode.id, opts.journalType || 'MANUAL', opts.description,
     opts.sourceModule ?? null, opts.sourceEvent ?? null, opts.referenceType ?? null,
     opts.referenceId ?? null, opts.referenceNumber ?? null,
     opts.originalJournalId ?? null, opts.idempotencyKey ?? null, opts.userId]
  );
  const jeId = head.insertId;

  let no = 0;
  for (const l of lines) {
    no++;
    await tx.run(
      `INSERT INTO journal_lines
        (journal_entry_id, line_number, account_id, description, debit, credit,
         project_id, vendor_id, client_id, employee_id, product_id, asset_id, source_line_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jeId, no, Number(l.account_id), l.description || null,
       uang(l.debit), uang(l.credit),
       l.project_id ?? null, l.vendor_id ?? null, l.client_id ?? null,
       l.employee_id ?? null, l.product_id ?? null, l.asset_id ?? null,
       l.source_line_ref ?? null]
    );
  }

  const jml = await tx.get(
    `SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS k, COUNT(*) AS n
     FROM journal_lines WHERE journal_entry_id = ?`, [jeId]) as any;
  const d = uang(jml?.d), k = uang(jml?.k);

  if (Number(jml?.n) < 2) {
    throw new GlGagal('BARIS_KURANG', 'Jurnal harus punya minimal 2 baris');
  }
  if (Math.abs(d - k) > 0.0001) {
    throw new GlGagal('TIDAK_SEIMBANG', `Jurnal tidak seimbang: debit ${d} vs kredit ${k}`,
      400, { total_debit: d, total_credit: k });
  }
  // Baris yang debit dan kredit dua-duanya nol tidak menambah informasi apa pun
  // tapi ikut terhitung sebagai baris — ia menutupi jurnal satu-sisi.
  const kosong = await tx.get(
    `SELECT COUNT(*) AS c FROM journal_lines WHERE journal_entry_id = ? AND debit = 0 AND credit = 0`,
    [jeId]) as any;
  if (Number(kosong?.c) > 0) {
    throw new GlGagal('BARIS_KOSONG', 'Ada baris jurnal tanpa nilai debit maupun kredit');
  }

  await tx.run('UPDATE journal_entries SET total_debit = ?, total_credit = ? WHERE id = ?', [d, k, jeId]);
  return { jeId, entryNumber: opts.entryNumber, total: d, periode };
};

// ═══════════════════════════════════════════════════════════════════════
// AUTO-POSTING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Membalas kegagalan GL dengan sebabnya, bukan dengan 500 generik.
 *
 * Dipakai di catch rute-rute yang menjurnal. Tanpa ini, pemetaan akun yang
 * belum diatur muncul di layar HR sebagai "Failed to record advance" — dan
 * yang harus membetulkannya tidak punya satu pun petunjuk harus ke mana.
 *
 * Mengembalikan true kalau errornya sudah dibalas, jadi pemanggil bisa menulis
 * `if (balasGlGagal(res, error)) return;` sebelum penanganan errornya sendiri.
 */
export const balasGlGagal = (res: any, error: any): boolean => {
  if (!(error instanceof GlGagal)) return false;
  res.status(error.httpStatus >= 500 ? 500 : error.httpStatus)
     .json({ error: error.message, code: error.code, ...error.extra });
  return true;
};

export type BarisOtomatis = {
  role: string;
  debit?: number;
  credit?: number;
  description?: string | null;
  project_id?: number | null;
  vendor_id?: number | null;
  client_id?: number | null;
  employee_id?: number | null;
  product_id?: number | null;
  asset_id?: number | null;
};

/**
 * Auto-posting MATI selama `auto_posting_start_date` masih NULL, dan tidak
 * pernah menjurnal transaksi bertanggal lebih awal dari itu.
 *
 * Keputusan pemilik (3 September 2026): tidak ada jurnal mundur. Menjurnal
 * transaksi lama yang aturannya belum ada saat itu menghasilkan buku besar yang
 * tidak bisa direkonsiliasi dengan apa pun. Penegakannya di SINI, satu tempat,
 * bukan diulang di tiap modul — kalau diulang, cepat atau lambat ada satu yang
 * lupa dan data lama mulai menetes masuk.
 */
/**
 * Memastikan periode fiskal untuk tanggal ini ADA — dibuat kalau belum.
 *
 * Hanya dipakai auto-posting, dan ini bedanya dengan jurnal manual:
 *
 * - Jurnal manual yang tanggalnya jatuh di periode tak dikenal DITOLAK.
 *   Manusia yang mengetik tanggal di luar periode kemungkinan besar salah
 *   ketik, dan menerimanya diam-diam akan menaruh jurnal di bulan yang tidak
 *   pernah ditutup siapa pun.
 * - Jurnal otomatis lahir dari dokumen bisnis yang tanggalnya OTORITATIF —
 *   invoice bertanggal Januari tahun depan adalah fakta, bukan salah ketik.
 *   Menolaknya berarti pengadaan berhenti karena periode akuntansi belum
 *   dibuat, dan itu memindahkan kegagalan setup akuntansi ke meja orang gudang.
 *
 * Periode yang sudah TERTUTUP tetap menolak — itu kendalinya. Yang dibuat di
 * sini hanya baris kalender yang memang belum ada, dan lahirnya `open`.
 */
const pastikanPeriode = async (tx: TxRunner, tanggal: string) => {
  const ada = await periodeUntuk(tanggal, tx);
  if (ada) return ada;

  const [th, bl] = tanggal.split('-').map(Number);
  if (!th || !bl || bl < 1 || bl > 12) {
    throw new GlGagal('TANGGAL_TIDAK_SAH', `Tanggal ${tanggal} tidak bisa dipetakan ke periode fiskal`);
  }
  const nama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const akhir = new Date(Date.UTC(th, bl, 0)).toISOString().slice(0, 10);
  await tx.run(
    `INSERT IGNORE INTO fiscal_periods (period_name, fiscal_year, period_number, start_date, end_date)
     VALUES (?, ?, ?, ?, ?)`,
    [`${nama[bl - 1]} ${th}`, th, bl, `${th}-${String(bl).padStart(2, '0')}-01`, akhir]
  );
  const baru = await periodeUntuk(tanggal, tx);
  if (!baru) {
    throw new GlGagal('PERIODE_TIDAK_ADA', `Periode fiskal untuk ${tanggal} tidak bisa dibuat`, 500);
  }
  return baru;
};

export const glAktifUntuk = async (tx: TxRunner, tanggal: string): Promise<boolean> => {
  const s = await tx.get(
    `SELECT setting_value FROM gl_settings WHERE setting_key = 'auto_posting_start_date'`) as any;
  const mulai = s?.setting_value;
  if (!mulai) return false;
  return String(tanggal).slice(0, 10) >= String(mulai).slice(0, 10);
};

/**
 * Memposting jurnal otomatis untuk satu peristiwa.
 *
 * Mengembalikan id jurnal, atau `null` kalau auto-posting memang sedang mati /
 * tanggalnya sebelum tanggal mulai. `null` bukan kegagalan — itu keadaan yang
 * disengaja, dan pemanggilnya tidak perlu tahu bedanya.
 *
 * Tiga sifat yang harus dijaga:
 *
 * 1. **Dipanggil DI DALAM transaction pemanggilnya.** Kalau jurnalnya gagal,
 *    transaksi bisnisnya ikut batal. Itu disengaja: GRN yang menambah stok
 *    tanpa jurnal pasangannya adalah selisih yang baru ketahuan saat tutup buku,
 *    dan saat itu tidak ada lagi yang ingat kejadiannya.
 * 2. **Idempoten lewat `idempotency_key`.** Satu peristiwa = satu jurnal,
 *    selamanya. Retry, tombol yang ditekan dua kali, atau perbaikan yang
 *    memanggil ulang tidak menggandakan apa pun — UNIQUE di database yang
 *    menjaminnya, bukan pemeriksaan yang bisa kalah balapan.
 * 3. **Peran diterjemahkan lewat `gl_account_mappings`.** Bentuk jurnalnya ada
 *    di pemanggil (itu logika akuntansi); akun mananya ada di data.
 */
export const postingOtomatis = async (tx: TxRunner, opts: {
  event: string;
  date: string;
  description: string;
  lines: BarisOtomatis[];
  refType?: string | null;
  refId?: number | null;
  refNumber?: string | null;
  sourceModule?: string | null;
  userId?: number | null;
  /** Dipakai kalau satu dokumen menerbitkan lebih dari satu jurnal. */
  idemSuffix?: string | null;
  nomorJurnal: (tx: TxRunner) => Promise<string>;
}): Promise<number | null> => {
  const tanggal = String(opts.date || '').slice(0, 10);
  if (!tanggal) return null;
  if (!(await glAktifUntuk(tx, tanggal))) return null;

  // Baris bernilai nol dibuang lebih dulu: PPN 0%, retensi 0%, potongan yang
  // tidak terjadi. Membiarkannya masuk akan ditolak sebagai BARIS_KOSONG dan
  // membatalkan transaksi bisnis yang sebenarnya sah.
  const lines = opts.lines.filter(l => uang(l.debit) !== 0 || uang(l.credit) !== 0);
  if (lines.length < 2) return null;

  // journal_entries.reference_id bertipe INT. Id yang dirakit dari beberapa
  // angka (project_id * 1e6 + tahun * 100 + bulan) melampauinya begitu id
  // proyeknya empat digit, dan MySQL menolaknya sebagai error mentah di tengah
  // transaksi bisnis — payroll berhenti bekerja dengan pesan 500 yang tidak
  // menyebut apa pun. Ditolak di sini dengan sebabnya.
  if (opts.refId != null &&
      (!Number.isInteger(Number(opts.refId)) || Math.abs(Number(opts.refId)) > 2147483647)) {
    throw new GlGagal('REFERENSI_DI_LUAR_JANGKAUAN',
      `reference_id ${opts.refId} untuk ${opts.event} melebihi jangkauan INT. Tambatkan jurnalnya ke satu baris nyata, bukan ke kode gabungan.`,
      500, { event_code: opts.event, ref_id: opts.refId });
  }

  // Periode dibuat kalau belum ada; yang sudah tertutup tetap menolak di
  // buatJurnal. Dipanggil SEBELUM idempotensi supaya jurnal yang sudah ada
  // tidak memicu pembuatan periode lagi.
  await pastikanPeriode(tx, tanggal);

  const kunci = `${opts.event}:${opts.refType || 'x'}:${opts.refId ?? 'x'}${opts.idemSuffix ? ':' + opts.idemSuffix : ''}`;
  const sudah = await tx.get(
    'SELECT id FROM journal_entries WHERE idempotency_key = ?', [kunci]) as any;
  if (sudah?.id) return Number(sudah.id);

  const peran = [...new Set(lines.map(l => l.role))];
  const petaBaris = await tx.all(
    `SELECT m.role, m.account_code, c.id AS account_id
     FROM gl_account_mappings m
     LEFT JOIN chart_of_accounts c ON c.account_code = m.account_code
     WHERE m.event_code = ? AND m.is_active = 1 AND m.role IN (${peran.map(() => '?').join(',')})`,
    [opts.event, ...peran]) as any[];
  const peta = new Map<string, any>(petaBaris.map(r => [r.role, r]));

  const barisJurnal = lines.map(l => {
    const m = peta.get(l.role);
    if (!m) {
      throw new GlGagal('PEMETAAN_HILANG',
        `Pemetaan akun untuk ${opts.event}/${l.role} belum diatur. Buka Pengaturan GL dan tentukan akunnya.`,
        500, { event_code: opts.event, role: l.role });
    }
    if (!m.account_id) {
      throw new GlGagal('PEMETAAN_MENUNJUK_AKUN_HILANG',
        `Pemetaan ${opts.event}/${l.role} menunjuk akun ${m.account_code} yang tidak ada di bagan akun.`,
        500, { event_code: opts.event, role: l.role, account_code: m.account_code });
    }
    return { ...l, account_id: Number(m.account_id) };
  });

  const hasil = await buatJurnal({
    tx,
    entryNumber: await opts.nomorJurnal(tx),
    entryDate: tanggal,
    description: opts.description,
    journalType: 'SYSTEM',
    lines: barisJurnal,
    userId: opts.userId ?? null,
    // Jurnal otomatis BOLEH menyentuh akun kontrol — justru sistemlah yang
    // berhak menggerakkan saldo AP/AR/persediaan.
    manual: false,
    sourceModule: opts.sourceModule ?? null,
    sourceEvent: opts.event,
    referenceType: opts.refType ?? null,
    referenceId: opts.refId ?? null,
    referenceNumber: opts.refNumber ?? null,
    idempotencyKey: kunci,
  });

  // Jurnal otomatis langsung posted: peristiwanya sudah terjadi, tidak ada yang
  // perlu disetujui lagi. Koreksinya lewat pembalikan, sama seperti jurnal manual.
  await tx.run(
    `UPDATE journal_entries SET status = 'posted', posted_by = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [opts.userId ?? null, hasil.jeId]
  );
  return hasil.jeId;
};
