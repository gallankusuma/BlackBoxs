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
