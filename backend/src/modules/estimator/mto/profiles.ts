/**
 * Berat profil baja per meter (kg/m).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUMBER (EST-MTO-R06, diperbaiki 15 Agustus 2026)
 *
 * Angka di sini TIDAK lagi disalin dari label dropdown frontend. Sebelumnya
 * begitu, dan labelnya sendiri memuat beberapa angka yang tidak cocok dengan
 * tabel baja mana pun:
 *
 *   WF300x150   46,8  → seharusnya 36,7   (+27%)
 *   WF350x175   57,4  → seharusnya 49,6   (+16%)
 *
 * Tidak ada tabel yang mencantumkan varian WF 300x150 seberat 46,8 kg/m maupun
 * WF 350x175 seberat 57,4 kg/m, termasuk varian ringannya (298x149 = 32,0 dan
 * 346x174 = 41,2). Nilai yang benar juga cocok dengan hitungan luas penampang
 * JIS G3192 berikut filletnya, jadi ini kekeliruan angka, bukan beda standar.
 *
 * WF dan UNP memakai seri JIS G3192 yang menjadi acuan SNI dan yang beredar di
 * pasar Indonesia. CNP dan siku memakai tabel dagang (berat per batang 6 m
 * dibagi 6), karena keduanya produk cold-formed yang tidak ada di JIS G3192.
 *
 * Rujukan: konstruksibaja.net/dimensi-standar-baja-wf,
 * marselussteel.com/blog/tabel-berat-besi-unp, .../tabel-berat-besi-cnp,
 * kontraktorbangunandibali.com/tabel-besi-siku
 *
 * Kalau perlu dikoreksi lagi, koreksinya DI SINI — satu tempat. Label di
 * `*Inputs.vue` harus mengikuti tabel ini, bukan sebaliknya.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** WF / IWF — JIS G3192, dimensi nominal tinggi x lebar x tebal badan x tebal sayap. */
export const WF_WEIGHT: Record<string, number> = {
  'WF150x75': 14.0,   // 150x75x5x7
  'WF200x100': 21.3,  // 200x100x5.5x8
  'WF250x125': 29.6,  // 250x125x6x9
  'WF300x150': 36.7,  // 300x150x6.5x9   — sebelumnya 46.8
  'WF350x175': 49.6,  // 350x175x7x11    — sebelumnya 57.4
  'WF400x200': 66.0,  // 400x200x8x13
};

/** UNP / kanal U hot-rolled — JIS G3192. Nilai-nilai ini sudah benar sejak awal. */
export const CHANNEL_WEIGHT: Record<string, number> = {
  'UNP100': 9.36,   // 100x50x5x7.5
  'UNP125': 13.4,   // 125x65x6x8
  'UNP150': 18.6,   // 150x75x6.5x10
  'UNP200': 24.6,   // 200x80x7.5x11
};

/**
 * CNP / kanal C cold-formed (gording, rangka dinding).
 *
 * Kodenya WAJIB memuat tebal. Tanpa itu beratnya tidak tertentu — CNP 150x65x20
 * ada versi 2,3 mm (5,5 kg/m) dan 3,2 mm (7,52 kg/m), selisihnya 37%. Inilah
 * sumber kekacauan lama: satu kode `C150x65` dipakai untuk tiga angka berbeda
 * di tiga tempat.
 */
export const CNP_WEIGHT: Record<string, number> = {
  'CNP75x45x15x1.6': 2.32,
  'CNP75x45x15x2.3': 3.25,
  'CNP100x50x20x1.6': 2.88,
  'CNP100x50x20x2.3': 4.07,
  'CNP100x50x20x3.2': 5.50,
  'CNP125x50x20x2.3': 4.52,
  'CNP150x50x20x2.3': 5.00,
  'CNP150x50x20x3.2': 6.76,
  'CNP150x65x20x2.3': 5.50,
  'CNP150x65x20x3.2': 7.52,
  'CNP200x75x20x3.2': 9.27,
  // Profil Z beratnya sama dengan C pada ukuran nominal dan tebal yang sama —
  // lebar bentangan pelatnya identik, cuma arah tekukan bibirnya berbeda.
  'Z150x65x20x2.3': 5.50,
  'Z150x65x20x3.2': 7.52,
};

/** Siku sama kaki (equal angle) — tabel dagang SNI. */
export const ANGLE_WEIGHT: Record<string, number> = {
  'L30x30x3': 1.36,
  'L40x40x3': 1.83,
  'L40x40x4': 2.42,
  'L40x40x5': 3.00,
  'L50x50x4': 3.07,
  'L50x50x5': 3.75,
  'L50x50x6': 4.60,
  'L60x60x5': 4.57,
  'L60x60x6': 5.42,
  'L65x65x6': 5.91,
  'L70x70x6': 6.38,
  'L70x70x7': 7.38,
};

/**
 * Kode lama yang masih tersimpan di data produksi, dipetakan ke profil pasar
 * yang sebenarnya. Ada di sini semata untuk kompatibilitas — layar tidak boleh
 * menawarkannya lagi.
 *
 * `C150x65` dulu bernilai 6,76 kg/m di backend. Angka itu ternyata berat CNP
 * 150x50x20x3,2 (40,56 kg per batang 6 m) — lebar sayapnya 50, bukan 65. Jadi
 * label dan angkanya milik profil yang berbeda.
 *
 * ⚠️ Tebal untuk kode lama diasumsikan 2,3 mm, ukuran stok paling umum untuk
 * gording. Kalau ternyata proyeknya memakai 3,2 mm, angkanya 37% lebih berat —
 * ini yang perlu dikonfirmasi Engineering.
 */
export const LEGACY_PROFILE_ALIAS: Record<string, string> = {
  'C150x65': 'CNP150x65x20x2.3',
  'C125x50': 'CNP125x50x20x2.3',
  'C100x50': 'CNP100x50x20x2.3',
  // Hanya tebal 3,2 mm yang punya nilai pasar terverifikasi untuk 200x75.
  'C200x75': 'CNP200x75x20x3.2',
  'Z150x65': 'Z150x65x20x2.3',
  'kanal100': 'CNP100x50x20x2.3',
  'siku40': 'L40x40x4',
  'siku50': 'L50x50x5',
  'siku60': 'L60x60x6',
  'siku65': 'L65x65x6',
  // UNP120 (seri Eropa) dan UNP125 (seri JIS) kebetulan sama-sama 13,4 kg/m,
  // jadi pemetaan ini tidak mengubah angka mana pun.
  'UNP120': 'UNP125',
};

/** Berat pelat baja per m2 menurut tebal (mm). Densitas 7.850 kg/m3. */
export const PLATE_KG_PER_M2: Record<string, number> = {
  '3': 23.6, '4': 31.4, '5': 39.3, '6': 47.1, '8': 62.8, '10': 78.5,
};

/** Semua tabel dalam satu peta, setelah kode lama diterjemahkan. */
const resolveName = (name: string): string => LEGACY_PROFILE_ALIAS[name] || name;

/** Berat profil, atau `null` kalau kodenya tidak dikenal. */
export const lookupProfileWeight = (name: string): number | null => {
  const key = resolveName(String(name || '').trim());
  return WF_WEIGHT[key] ?? CHANNEL_WEIGHT[key] ?? CNP_WEIGHT[key] ?? ANGLE_WEIGHT[key] ?? null;
};

export const profileWeight = (name: string, fallback = 0): number =>
  lookupProfileWeight(name) ?? fallback;

/** Pelat: pakai tabel kalau tebalnya standar, kalau tidak hitung dari densitas. */
export const plateKgPerM2 = (thicknessMm: number): number => {
  const key = String(thicknessMm);
  if (PLATE_KG_PER_M2[key]) return PLATE_KG_PER_M2[key];
  return +((thicknessMm / 1000) * 7850).toFixed(2);
};
