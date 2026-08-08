import { Response } from 'express';

/**
 * Validasi input modul Asset Management (AST-014).
 *
 * Sebelumnya backend menerima apa pun dan menyerahkan penolakan ke database,
 * lalu mengembalikan `error.message` mentah ke klien — sehingga nama database,
 * tabel, dan constraint ikut terkirim. Di sini input divalidasi lebih dulu dan
 * pesan errornya ditulis untuk manusia.
 */

export const ASSET_STATUSES = ['active', 'idle', 'under_maintenance', 'disposed'] as const;
export const DEPRECIATION_METHODS = ['straight_line', 'declining_balance'] as const;
export const MAINTENANCE_TYPES = ['preventive', 'corrective', 'inspection'] as const;
// AST-004 — hanya capital_addition yang menambah basis depresiasi
export const PURCHASE_ENTRY_TYPES = ['capital_addition', 'expense', 'replacement', 'improvement'] as const;

const has = (body: any, key: string) => Object.prototype.hasOwnProperty.call(body || {}, key);

const isBlank = (v: any) => v === undefined || v === null || v === '';

/** Angka non-negatif; string angka diterima karena datang dari form HTML. */
function checkNumber(value: any, label: string, opts: { min?: number; integer?: boolean } = {}): string | null {
  if (isBlank(value)) return null; // field opsional — ditangani pemanggil
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} harus berupa angka`;
  if (opts.integer && !Number.isInteger(n)) return `${label} harus bilangan bulat`;
  if (opts.min !== undefined && n < opts.min) return `${label} tidak boleh kurang dari ${opts.min}`;
  return null;
}

/**
 * `new Date()` saja TIDAK cukup untuk validasi: parser-nya terlalu longgar.
 * `new Date('32 Februari')` menghasilkan tahun 2032, dan `2026-02-30` digeser
 * diam-diam menjadi 2 Maret. Jadi formatnya diperiksa dulu, lalu hasil parse
 * dicocokkan kembali ke angka aslinya untuk menangkap tanggal yang meluber.
 */
function checkDate(value: any, label: string): string | null {
  if (isBlank(value)) return null;

  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!m) return `${label} harus dalam format YYYY-MM-DD`;

  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return `${label} bukan tanggal yang valid`;
  }
  return null;
}

function checkEnum(value: any, label: string, allowed: readonly string[]): string | null {
  if (isBlank(value)) return null;
  if (!allowed.includes(String(value))) {
    return `${label} tidak dikenal. Pilihan: ${allowed.join(', ')}`;
  }
  return null;
}

/**
 * @param existing baris aset saat ini — dibutuhkan pada update parsial supaya
 *        aturan lintas-field (residu ≤ harga) tetap dievaluasi terhadap nilai
 *        yang benar-benar akan berlaku, bukan hanya yang dikirim.
 */
export function validateAssetInput(body: any, existing?: any): string | null {
  const errors = [
    checkNumber(body.purchase_price, 'Harga perolehan', { min: 0 }),
    checkNumber(body.salvage_value, 'Nilai residu', { min: 0 }),
    checkNumber(body.useful_life_years, 'Umur ekonomis', { min: 1, integer: true }),
    checkDate(body.purchase_date, 'Tanggal pembelian'),
    checkDate(body.disposed_date, 'Tanggal disposal'),
    checkEnum(body.status, 'Status', ASSET_STATUSES),
    checkEnum(body.depreciation_method, 'Metode depresiasi', DEPRECIATION_METHODS),
  ].filter(Boolean);

  if (errors.length) return errors[0] as string;

  // Nilai residu tidak boleh melebihi harga perolehan — kalau iya, basis
  // depresiasi jadi negatif dan seluruh perhitungan nilai buku ngawur.
  const price = has(body, 'purchase_price') && !isBlank(body.purchase_price)
    ? Number(body.purchase_price)
    : (existing ? Number(existing.purchase_price) : undefined);
  const salvage = has(body, 'salvage_value') && !isBlank(body.salvage_value)
    ? Number(body.salvage_value)
    : (existing ? Number(existing.salvage_value) : undefined);

  if (price !== undefined && salvage !== undefined
      && Number.isFinite(price) && Number.isFinite(salvage) && salvage > price) {
    return 'Nilai residu tidak boleh lebih besar dari harga perolehan';
  }

  // Status disposed wajib punya tanggal (AST-006 minimal: jangan sampai
  // depresiasi diam-diam memakai tanggal hari ini).
  const status = has(body, 'status') ? body.status : existing?.status;
  const disposedDate = has(body, 'disposed_date') ? body.disposed_date : existing?.disposed_date;
  if (status === 'disposed' && isBlank(disposedDate)) {
    return 'Aset berstatus disposed wajib memiliki tanggal disposal';
  }

  return null;
}

export function validateMaintenanceInput(body: any): string | null {
  return checkNumber(body.cost, 'Biaya maintenance', { min: 0 })
    || checkDate(body.performed_at, 'Tanggal pelaksanaan')
    || checkDate(body.next_due_date, 'Tanggal jatuh tempo berikutnya')
    || checkEnum(body.maintenance_type, 'Tipe maintenance', MAINTENANCE_TYPES);
}

export function validatePurchaseHistoryInput(body: any): string | null {
  return checkNumber(body.amount, 'Nilai penambahan', { min: 0 })
    || checkDate(body.purchase_date, 'Tanggal pembelian')
    || checkDate(body.capitalized_at, 'Tanggal kapitalisasi')
    || checkEnum(body.entry_type, 'Jenis transaksi', PURCHASE_ENTRY_TYPES);
}

/**
 * Balas 500 tanpa membocorkan detail database. Pesan aslinya tetap dicatat di
 * log server supaya masih bisa ditelusuri.
 */
export function serverError(res: Response, context: string, error: any) {
  console.error(`[asset] ${context}:`, error?.message || error);
  return res.status(500).json({ error: 'Terjadi kesalahan di server. Hubungi administrator bila berulang.' });
}
