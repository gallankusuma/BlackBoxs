import { num } from './types';

/**
 * Kontrak parameter MTO: satuan yang dipakai UI, dan padanan nilai enum.
 *
 * Dua kelas kesalahan ditangani di sini, keduanya pernah lolos dan menghasilkan
 * angka yang salah tapi terlihat masuk akal:
 *
 * 1. SATUAN TERSIRAT. Layar meminta "Lebar B (cm)" tapi kalkulator
 *    memperlakukannya sebagai meter. Kolom kayu 12×12 cm jadi 12×12 m —
 *    10.000× terlalu besar. Screed 3 cm jadi 3 m — 100× terlalu besar.
 *    Tidak ada yang error; angkanya cuma salah.
 *
 * 2. ENUM YANG TIDAK COCOK. Picker mengirim `cladding_zincalume`, kalkulator
 *    mencari `zincalume`, tidak cocok, lalu JATUH KE CABANG DEFAULT — dinding
 *    cladding dihitung sebagai pasangan bata lengkap dengan plesteran.
 *
 * Keduanya berbahaya justru karena tidak menimbulkan error. Karena itu di sini
 * nilai enum yang tidak dikenali TIDAK didiamkan: pemanggil menerima peringatan
 * eksplisit, bukan diam-diam memakai default.
 *
 * Sumber kebenaran satuan adalah label di komponen input
 * (`frontend/src/components/projects/mto/*Inputs.vue`), dan sumber nilai enum
 * adalah `*TypePicker.vue`. Kalau salah satu berubah, ubah juga di sini.
 */

/** Field yang di UI diisi dalam SENTIMETER. */
const CM_FIELDS = new Set([
  'kayu_b', 'kayu_h',      // penampang kolom & balok kayu
  'screed_t',              // tebal screed keramik / leveling parket
  'thickness_cm',          // tebal dinding
]);

/** Field yang di UI diisi dalam MILIMETER. */
const MM_FIELDS = new Set([
  'rebar_dia', 'rebar_main', 'rebar_dia_x', 'rebar_dia_y', 'stirrup_dia',
  'tb_rebar_main', 'tb_stirrup', 'sloof_rebar_dia', 'rb_rebar_dia',
  'bp_p', 'bp_l', 'bp_t', 'angkur_dia',
  'plate_thick', 'grout_mm', 'glass_thick', 'zinc_thick', 'thickness_mm',
]);

/**
 * Baca sebuah parameter sebagai METER, apa pun satuan yang dipakai UI.
 * `fallbackMeters` diberikan dalam meter — bukan dalam satuan UI-nya.
 */
export const meters = (params: any, field: string, fallbackMeters = 0): number => {
  const raw = params?.[field];
  if (raw === undefined || raw === null || raw === '') return fallbackMeters;
  const value = num(raw, NaN);
  if (!isFinite(value)) return fallbackMeters;

  if (CM_FIELDS.has(field)) return value / 100;
  if (MM_FIELDS.has(field)) return value / 1000;
  return value;
};

/** Nilai enum dari tiap `*TypePicker.vue`, dipetakan ke varian kalkulator. */
const VARIANTS: Record<string, Record<string, string>> = {
  foundation: {
    footplate: 'footplate', footplat: 'footplate',
    bored_pile: 'bored_pile',
    precast_pile: 'precast_pile',
    mini_pile: 'mini_pile',
  },
  column: {
    beton: 'concrete', concrete: 'concrete',
    wf: 'wf', steel: 'wf',
    cfs: 'cfs', baja_ringan: 'cfs',
    kayu: 'wood', wood: 'wood',
  },
  beam: {
    beton: 'concrete', concrete: 'concrete',
    wf: 'wf', steel: 'wf',
    kanal: 'channel', unp: 'channel',
    purlin: 'purlin', gording: 'purlin',
    kayu: 'wood', wood: 'wood',
  },
  slab: {
    concrete: 'concrete', beton: 'concrete',
    keramik: 'ceramic', ceramic: 'ceramic', tile: 'ceramic',
    plate_bordes: 'plate', bordes: 'plate', plate: 'plate',
    parquet: 'parquet', parket: 'parquet', vinyl: 'parquet',
  },
  wall: {
    bata_ringan: 'masonry', bata_merah: 'masonry', bata: 'masonry', hebel: 'masonry',
    cladding_zincalume: 'cladding', zincalume: 'cladding', cladding: 'cladding',
    partisi_grc: 'grc', grc: 'grc',
    kaca: 'glass', glass: 'glass',
  },
  roof: {
    beton_dak: 'deck', dak: 'deck', concrete: 'deck',
    genteng_keramik: 'tile', genteng_metal: 'tile', genteng: 'tile', tile: 'tile',
    zincalume: 'sheet', pvc_double: 'sheet', sandwich: 'sheet', metal: 'sheet',
  },
};

export interface VariantResolution {
  variant: string;
  /** Nilai mentah dari klien, disimpan untuk audit. */
  raw: string;
  note?: string;
}

/**
 * Terjemahkan nilai enum dari UI ke varian kalkulator.
 *
 * Nilai kosong memakai default yang wajar. Nilai TIDAK DIKENAL tidak
 * didiamkan — dikembalikan apa adanya beserta peringatan, supaya keluarannya
 * bisa ditolak/ditandai daripada diam-diam dihitung dengan formula yang salah.
 */
export const resolveVariant = (
  elementType: string, raw: any, fallback: string,
): VariantResolution => {
  const table = VARIANTS[elementType] || {};
  const key = String(raw ?? '').trim().toLowerCase();

  if (!key) return { variant: fallback, raw: '' };
  if (table[key]) return { variant: table[key], raw: key };

  return {
    variant: 'unknown',
    raw: key,
    note: `Tipe ${elementType} "${raw}" tidak dikenali kalkulator. `
      + `Yang didukung: ${Object.keys(table).join(', ')}. `
      + `Kuantitas TIDAK dihitung supaya tidak menghasilkan angka yang keliru.`,
  };
};
