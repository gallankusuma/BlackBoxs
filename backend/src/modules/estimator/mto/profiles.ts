/**
 * Berat profil per meter (kg/m).
 *
 * Angkanya sengaja disalin dari tabel yang sudah dipakai frontend
 * (ColumnInputs.vue / BeamInputs.vue) supaya pemindahan perhitungan ke backend
 * tidak diam-diam mengubah harga penawaran. Kalau nanti perlu dikoreksi,
 * koreksinya di sini — satu tempat, bukan tersebar di komponen.
 */
export const WF_WEIGHT: Record<string, number> = {
  'WF150x75': 14, 'WF200x100': 21.3, 'WF250x125': 29.6,
  'WF300x150': 46.8, 'WF350x175': 57.4, 'WF400x200': 66.0,
};

export const CHANNEL_WEIGHT: Record<string, number> = {
  'UNP100': 9.36, 'UNP125': 13.4, 'UNP150': 18.6, 'UNP200': 24.6,
  'C150x65': 6.76, 'C125x50': 5.5, 'C100x50': 4.5,
};

/** Berat pelat baja per m2 menurut tebal (mm). */
export const PLATE_KG_PER_M2: Record<string, number> = {
  '3': 23.6, '4': 31.4, '5': 39.3, '6': 47.1, '8': 62.8, '10': 78.5,
};

export const profileWeight = (name: string, fallback = 0): number =>
  WF_WEIGHT[name] ?? CHANNEL_WEIGHT[name] ?? fallback;

/** Pelat: pakai tabel kalau tebalnya standar, kalau tidak hitung dari densitas. */
export const plateKgPerM2 = (thicknessMm: number): number => {
  const key = String(thicknessMm);
  if (PLATE_KG_PER_M2[key]) return PLATE_KG_PER_M2[key];
  return +( (thicknessMm / 1000) * 7850 ).toFixed(2);
};
