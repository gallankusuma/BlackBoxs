/**
 * Kontrak keluaran MTO (EST-MTO-004).
 *
 * Sebelumnya faktor waste `× 1.05` tertanam diam-diam di dalam formula frontend,
 * sementara backend tidak memakainya sama sekali — dua sisi memberi angka
 * berbeda untuk input yang sama, dan tidak ada yang bisa menjelaskan selisihnya.
 *
 * Sekarang net, waste, dan gross selalu terpisah dan eksplisit:
 *   - RAB memakai `net_quantity` (volume pekerjaan yang benar-benar dibayar)
 *   - Procurement memakai `gross_quantity` (yang harus dibeli, termasuk susut)
 */
export interface MtoLine {
  /** Kode stabil untuk dirujuk RAB — jangan diubah sembarangan, dipakai sebagai relasi. */
  code: string;
  label: string;
  net_quantity: number;
  waste_percent: number;
  gross_quantity: number;
  unit: string;
}

export interface MtoResult {
  element_type: string;
  /** Varian yang benar-benar dipakai (col_type, slab_type, dst) — untuk audit. */
  variant: string;
  lines: MtoLine[];
  /** Peringatan non-fatal: parameter kosong, asumsi yang dipakai, dsb. */
  notes: string[];
}

const round = (v: number, d = 3): number => {
  if (!isFinite(v) || isNaN(v)) return 0;
  return +v.toFixed(d);
};

/** Angka dari klien bisa berupa string, null, atau kosong — semuanya jadi 0. */
export const num = (v: any, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : fallback;
};

export const line = (
  code: string, label: string, net: number, unit: string, wastePercent = 0, decimals = 3,
): MtoLine => {
  const n = round(Math.max(net, 0), decimals);
  const w = num(wastePercent, 0);
  return {
    code,
    label,
    net_quantity: n,
    waste_percent: w,
    gross_quantity: round(n * (1 + w / 100), decimals),
    unit,
  };
};

export const STEEL_DENSITY = 7850; // kg/m3

/**
 * Versi formula kalkulator (EST-MTO-019).
 *
 * Direkam pada tiap baris yang disimpan. Kalau formulanya diperbaiki, baris lama
 * tetap membawa versi yang menghasilkannya — sehingga bisa dibedakan mana angka
 * yang memang ditawarkan dulu dan mana yang berubah karena koreksi kemudian.
 *
 * Naikkan setiap kali ada perubahan yang mengubah ANGKA keluaran.
 */
export const FORMULA_VERSION = '2026.08.13';

/**
 * Validasi parameter teknik (EST-MTO-R19).
 *
 * Kalkulator sebelumnya menerima apa saja: dimensi negatif, jumlah nol, atau
 * teks yang tidak bisa diangkakan. Semuanya menghasilkan kuantitas — kadang nol,
 * kadang negatif — tanpa satu pun tanda bahwa masukannya keliru.
 *
 * Kuantitas negatif tidak pernah punya arti fisik, jadi lebih baik ditolak di
 * sini daripada menjalar ke RAB lalu ke harga penawaran.
 */
export const validateParams = (elementType: string, p: any): string[] => {
  const errors: string[] = [];
  const check = (field: string, label: string) => {
    const raw = p?.[field];
    if (raw === undefined || raw === null || raw === '') return;
    const v = num(raw, NaN);
    if (!isFinite(v)) { errors.push(`${label} bukan angka yang valid`); return; }
    if (v < 0) errors.push(`${label} tidak boleh negatif (${v})`);
  };

  for (const [f, label] of [
    ['L', 'Panjang'], ['W', 'Lebar'], ['H', 'Tinggi'], ['B', 'Lebar'],
    ['qty', 'Jumlah'], ['qty_per_floor', 'Jumlah per lantai'], ['floors', 'Jumlah lantai'],
    ['area', 'Luas'], ['floor_area', 'Luas lantai'], ['total_length', 'Panjang total'],
    ['thickness', 'Tebal'], ['depth', 'Kedalaman'], ['perimeter', 'Keliling'],
    ['waste_pct', 'Persentase waste'], ['opening_pct', 'Persentase bukaan'],
  ] as [string, string][]) check(f, label);

  const slope = num(p?.slope_deg, NaN);
  if (isFinite(slope) && (slope < 0 || slope >= 90)) {
    errors.push(`Kemiringan atap harus di antara 0 dan 90 derajat (${slope})`);
  }
  const waste = num(p?.waste_pct, NaN);
  if (isFinite(waste) && waste > 100) {
    errors.push(`Persentase waste ${waste}% tidak masuk akal`);
  }
  const opening = num(p?.opening_pct, NaN);
  if (isFinite(opening) && opening > 100) {
    errors.push(`Persentase bukaan ${opening}% melebihi 100%`);
  }

  return errors;
};
