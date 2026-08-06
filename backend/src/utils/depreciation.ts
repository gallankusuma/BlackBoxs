/**
 * Mesin depresiasi aset (AST-003, AST-010).
 *
 * Sebelumnya `calcDepreciation()` selalu memakai rumus garis lurus dan tidak
 * pernah membaca `depreciation_method`, padahal frontend menawarkan pilihan
 * saldo menurun. User memilih saldo menurun, laporannya keluar garis lurus.
 * Kategori Tanah juga ikut disusutkan karena tidak ada penanda non-depreciable.
 *
 * Fungsi ini sengaja murni (tanpa akses database) supaya bisa diuji langsung.
 */

export interface DepreciationInput {
  purchase_price: number | string | null;
  salvage_value: number | string | null;
  useful_life_years: number | string | null;
  purchase_date: string | Date | null;
  /** Tanggal aset siap digunakan; kalau kosang jatuh ke purchase_date */
  in_service_date?: string | Date | null;
  depreciation_method?: string | null;
  /** Rate tahunan untuk saldo menurun, mis. 0.25 = 25%/tahun */
  depreciation_rate?: number | string | null;
  status?: string | null;
  disposed_date?: string | Date | null;
  /** Dari master kategori; 0 = tidak disusutkan (mis. Tanah) */
  is_depreciable?: number | boolean | null;
}

export interface DepreciationResult {
  accumulated_depreciation: number;
  book_value: number;
  monthly_depreciation: number;
  percent_depreciated: number;
  /** Alasan kalau depresiasi nol — memudahkan menjelaskan angka di UI */
  depreciation_note?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

export function calcDepreciation(asset: DepreciationInput, asOfDate?: string | Date): DepreciationResult {
  const price = parseFloat(String(asset.purchase_price ?? 0)) || 0;
  const salvage = parseFloat(String(asset.salvage_value ?? 0)) || 0;
  const lifeYears = Number(asset.useful_life_years) || 1;

  const zero = (note: string): DepreciationResult => ({
    accumulated_depreciation: 0,
    book_value: round2(price),
    monthly_depreciation: 0,
    percent_depreciated: 0,
    depreciation_note: note,
  });

  // Kategori non-depreciable (Tanah) — nilai bukunya tetap harga perolehan.
  if (asset.is_depreciable === 0 || asset.is_depreciable === false) {
    return zero('Kategori aset ini tidak disusutkan');
  }

  // Depresiasi dimulai saat aset siap digunakan, bukan saat dibeli.
  const startDate = toDate(asset.in_service_date) || toDate(asset.purchase_date);
  if (!startDate) return zero('Tanggal perolehan belum diisi');
  if (price <= 0) return zero('Harga perolehan belum diisi');

  // Aset yang sudah disposed berhenti disusutkan pada tanggal disposal.
  const disposedDate = toDate(asset.disposed_date);
  const cutoff = (asset.status === 'disposed' && disposedDate)
    ? disposedDate
    : (toDate(asOfDate) || new Date());

  const totalMonths = Math.round(lifeYears * 12);
  let monthsElapsed = Math.max(0, Math.min(monthsBetween(startDate, cutoff), totalMonths));

  const depreciableBase = Math.max(price - salvage, 0);
  const method = (asset.depreciation_method || 'straight_line').toLowerCase();

  let accumulated = 0;
  let monthlyDepreciation = 0;

  if (method === 'declining_balance') {
    // Rate tahunan: eksplisit → default kategori → double-declining (2/umur).
    const explicitRate = parseFloat(String(asset.depreciation_rate ?? '')) || 0;
    const annualRate = explicitRate > 0 ? explicitRate : 2 / lifeYears;
    const monthlyRate = annualRate / 12;

    // Saldo menurun dihitung per bulan atas nilai buku berjalan, dan tidak
    // boleh menembus nilai residu.
    let book = price;
    for (let m = 0; m < monthsElapsed; m++) {
      const charge = Math.min(book * monthlyRate, Math.max(book - salvage, 0));
      if (charge <= 0) break;
      book -= charge;
      accumulated += charge;
    }
    // Beban bulan berikutnya, untuk ditampilkan sebagai "penyusutan per bulan"
    monthlyDepreciation = Math.min(book * monthlyRate, Math.max(book - salvage, 0));
  } else {
    monthlyDepreciation = totalMonths > 0 ? depreciableBase / totalMonths : 0;
    accumulated = Math.min(monthlyDepreciation * monthsElapsed, depreciableBase);
  }

  accumulated = round2(Math.min(accumulated, depreciableBase));
  const bookValue = round2(price - accumulated);
  const percent = depreciableBase > 0 ? Math.round((accumulated / depreciableBase) * 1000) / 10 : 0;

  return {
    accumulated_depreciation: accumulated,
    book_value: bookValue,
    monthly_depreciation: round2(monthlyDepreciation),
    percent_depreciated: percent,
  };
}
