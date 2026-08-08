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
  /** Hanya muncul kalau aset punya capital addition (AST-004) */
  capitalized_additions?: number;
  total_capitalized_cost?: number;
  /** Hanya muncul kalau ada periode depresiasi yang sudah ditutup (AST-011) */
  locked_through?: string;
  locked_accumulated?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

/** Penambahan nilai yang dikapitalisasi (AST-004) */
export interface CapitalAddition {
  amount: number | string;
  /** Tanggal kapitalisasi; kalau kosong pakai purchase_date entri */
  capitalized_at?: string | Date | null;
  purchase_date?: string | Date | null;
}

/** Periode terakhir yang sudah ditutup beserta akumulasi yang dipostingnya (AST-011) */
export interface LedgerLock {
  /** Akhir periode terkunci, mis. 2026-06-30 */
  through: string | Date;
  /** Akumulasi penyusutan yang tercatat di ledger sampai periode itu */
  accumulated: number;
}

export function calcDepreciation(
  asset: DepreciationInput,
  asOfDate?: string | Date,
  additions: CapitalAddition[] = [],
  lock?: LedgerLock,
): DepreciationResult {
  // ── AST-011 ───────────────────────────────────────────────────────────
  // Kalau ada periode yang sudah ditutup, angka sampai periode itu diambil
  // dari LEDGER, bukan dihitung ulang. Yang dihitung dinamis hanya selisih
  // setelah tanggal kunci. Efeknya: mengubah harga perolehan atau umur
  // ekonomis hari ini tidak lagi mengubah laporan bulan-bulan yang sudah
  // ditutup — perubahan estimasi berlaku prospektif.
  if (lock) {
    const atLock = calcDepreciation(asset, lock.through, additions);
    const atNow = calcDepreciation(asset, asOfDate, additions);
    const delta = Math.max(0, atNow.accumulated_depreciation - atLock.accumulated_depreciation);

    const price = parseFloat(String(asset.purchase_price ?? 0)) || 0;
    const addedCost = additions.reduce((sum, a) => sum + (parseFloat(String(a.amount ?? 0)) || 0), 0);
    const accumulated = round2(lock.accumulated + delta);

    return {
      ...atNow,
      accumulated_depreciation: accumulated,
      book_value: round2(price + addedCost - accumulated),
      locked_through: typeof lock.through === 'string' ? lock.through : lock.through.toISOString().slice(0, 10),
      locked_accumulated: round2(lock.accumulated),
    };
  }

  return calcDepreciationRaw(asset, asOfDate, additions);
}

function calcDepreciationRaw(
  asset: DepreciationInput,
  asOfDate?: string | Date,
  additions: CapitalAddition[] = [],
): DepreciationResult {
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

  accumulated = Math.min(accumulated, depreciableBase);

  // ── Capital addition (AST-004) ──────────────────────────────────────────
  // Tiap penambahan nilai disusutkan sendiri sejak tanggal kapitalisasinya,
  // memakai metode yang sama dan SISA umur ekonomis aset induk. Histori
  // sebelum tanggal kapitalisasi tidak berubah — inilah sebabnya penambahan
  // tidak digabung begitu saja ke harga perolehan.
  let addedCost = 0;
  let addedAccumulated = 0;
  let addedMonthly = 0;

  for (const add of additions) {
    const amount = parseFloat(String(add.amount ?? 0)) || 0;
    if (amount <= 0) continue;
    const addDate = toDate(add.capitalized_at) || toDate(add.purchase_date);
    if (!addDate) continue;

    addedCost += amount;

    const monthsUsedAtCapitalisation = Math.max(0, monthsBetween(startDate, addDate));
    const remainingMonths = Math.max(totalMonths - monthsUsedAtCapitalisation, 1);
    const monthsSince = Math.max(0, Math.min(monthsBetween(addDate, cutoff), remainingMonths));

    if (method === 'declining_balance') {
      const explicitRate = parseFloat(String(asset.depreciation_rate ?? '')) || 0;
      const annualRate = explicitRate > 0 ? explicitRate : 2 / lifeYears;
      const monthlyRate = annualRate / 12;
      let book = amount;
      for (let m = 0; m < monthsSince; m++) {
        const charge = book * monthlyRate;
        if (charge <= 0) break;
        book -= charge;
        addedAccumulated += charge;
      }
      addedMonthly += book * monthlyRate;
    } else {
      const perMonth = amount / remainingMonths;
      addedAccumulated += Math.min(perMonth * monthsSince, amount);
      if (monthsSince < remainingMonths) addedMonthly += perMonth;
    }
  }

  const totalCost = price + addedCost;
  const totalAccumulated = round2(accumulated + addedAccumulated);
  const totalBase = depreciableBase + addedCost;
  const bookValue = round2(totalCost - totalAccumulated);
  const percent = totalBase > 0 ? Math.round((totalAccumulated / totalBase) * 1000) / 10 : 0;

  return {
    accumulated_depreciation: totalAccumulated,
    book_value: bookValue,
    monthly_depreciation: round2(monthlyDepreciation + addedMonthly),
    percent_depreciated: percent,
    ...(addedCost > 0 ? { capitalized_additions: round2(addedCost), total_capitalized_cost: round2(totalCost) } : {}),
  };
}
