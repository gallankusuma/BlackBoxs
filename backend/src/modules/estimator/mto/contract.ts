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
    footplate: 'footplate', footplat: 'footplate', telapak: 'footplate',
    // EST-MTO-R54: pile cap adalah poer di atas kelompok tiang — pekerjaannya
    // mirip footplate tapi bukan hal yang sama, dan menyamakannya membuat
    // besinya salah (pile cap bertulang dua lapis, atas dan bawah).
    pile_cap: 'pile_cap', pilecap: 'pile_cap', poer: 'pile_cap',
    bored_pile: 'bored_pile', borepile: 'bored_pile', bor: 'bored_pile',
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

/**
 * Nama field pemilih tipe di tiap layar, berikut varian defaultnya kalau kosong.
 * Nilainya harus sama persis dengan yang dipakai masing-masing kalkulator.
 */
/**
 * Katalog tipe elemen + varian + field wajibnya, sebagai DATA.
 *
 * EST-MTO-R53: dipakai membangun prompt asisten gambar. Dibangkitkan dari peta
 * yang sama dengan yang dipakai kalkulator dan validator — kalau prompt-nya
 * ditulis tangan, ia akan melenceng diam-diam setiap kali varian baru
 * ditambahkan, dan AI akan terus mengusulkan bentuk yang sudah tidak berlaku.
 */
export const katalogElemen = (): Array<{
  element_type: string;
  variant_field: string;
  variants: Array<{ variant: string; aliases: string[]; wajib: Array<{ field: string; label: string }> }>;
}> => Object.keys(VARIANT_FIELD).map(tipe => {
  const [field] = VARIANT_FIELD[tipe];
  const perVarian: Record<string, string[]> = {};
  for (const [alias, varian] of Object.entries(VARIANTS[tipe] || {})) {
    (perVarian[varian] = perVarian[varian] || []).push(alias);
  }
  return {
    element_type: tipe,
    variant_field: field,
    variants: Object.entries(perVarian).map(([variant, aliases]) => ({
      variant, aliases,
      wajib: spesifikasiField(tipe, variant).map(f => ({ field: f.field, label: f.label })),
    })),
  };
});

export const VARIANT_FIELD: Record<string, [field: string, fallback: string]> = {
  foundation: ['foundation_type', 'footplate'],
  column: ['col_type', 'concrete'],
  beam: ['beam_type', 'concrete'],
  slab: ['slab_type', 'concrete'],
  wall: ['wall_type', 'masonry'],
  roof: ['roof_type', 'sheet'],
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

/**
 * Field yang WAJIB diisi, per elemen dan per varian (EST-MTO-R35).
 *
 * Validator lama hanya menolak angka negatif, bukan angka. dan di luar rentang.
 * Field yang TIDAK diisi sama sekali dilewatkan begitu saja — `check()` langsung
 * return kalau nilainya undefined. Akibatnya kalkulator memakai default diam-diam:
 *
 *     const B = num(p.B, 0.3), H = num(p.H, 0.3);     // kolom beton
 *     const heightPerFloor = num(p.height_per_floor, 3);
 *
 * Kolom yang lebar dan tingginya tidak pernah diisi tetap menghasilkan volume
 * beton, bekisting, besi, dan sengkang — semuanya dari asumsi 30×30 cm setinggi
 * 3 m. Angkanya wajar, tidak ada error, dan bisa lolos ke penawaran.
 *
 * Yang didaftarkan di sini HANYA field yang benar-benar dikumpulkan layar
 * (`*Inputs.vue`). Mewajibkan field yang tidak ada di layar akan membuat elemen
 * mustahil disimpan.
 */
type Req = [field: string, label: string];

/** Wajib untuk semua varian dari elemen tersebut. */
const REQUIRED_COMMON: Record<string, Req[]> = {
  column: [['qty_per_floor', 'Jumlah kolom per lantai'], ['height_per_floor', 'Tinggi per lantai']],
  slab: [['area', 'Luas lantai']],
  wall: [['area', 'Luas dinding']],
  roof: [['floor_area', 'Luas lantai'], ['slope_deg', 'Kemiringan atap']],
};

/** Wajib hanya untuk varian tertentu. */
const REQUIRED_VARIANT: Record<string, Record<string, Req[]>> = {
  // Varian pondasi selain footplate tidak menghasilkan baris sama sekali
  // (EST-MTO-R01), jadi tidak ada yang perlu diwajibkan di sana.
  foundation: {
    footplate: [['L', 'Panjang footing'], ['W', 'Lebar footing'],
      ['H', 'Tebal footing'], ['qty', 'Jumlah titik pondasi']],
    pile_cap: [['L', 'Panjang pile cap'], ['W', 'Lebar pile cap'],
      ['H', 'Tebal pile cap'], ['qty', 'Jumlah pile cap']],
    bored_pile: [['pile_dia', 'Diameter tiang bor'], ['pile_length', 'Kedalaman tiang'],
      ['qty', 'Jumlah titik tiang']],
  },
  column: {
    concrete: [['B', 'Lebar kolom'], ['H', 'Tinggi penampang kolom']],
    wf: [['wf_profile', 'Profil baja kolom']],
    cfs: [['cfs_weight_per_m', 'Berat per meter baja ringan']],
    wood: [['kayu_b', 'Lebar penampang kayu'], ['kayu_h', 'Tinggi penampang kayu']],
  },
  beam: {
    concrete: [['total_length', 'Panjang total balok'], ['B', 'Lebar balok'], ['H', 'Tinggi balok']],
    wf: [['total_length', 'Panjang total balok'], ['wf_profile_beam', 'Profil baja balok']],
    channel: [['total_length', 'Panjang total balok'], ['kanal_profile', 'Profil kanal']],
    purlin: [['purlin_profile', 'Profil gording']],
    wood: [['total_length', 'Panjang total balok'],
      ['kayu_b', 'Lebar penampang kayu'], ['kayu_h', 'Tinggi penampang kayu']],
  },
  slab: {
    concrete: [['thickness', 'Tebal pelat']],
    ceramic: [['screed_t', 'Tebal screed']],
    plate: [['plate_thick', 'Tebal plat bordes']],
    parquet: [['screed_t', 'Tebal leveling']],
  },
  wall: {
    glass: [['glass_thick', 'Tebal kaca']],
  },
  roof: {
    deck: [['dak_thick', 'Tebal dak beton']],
  },
};

/**
 * Cukup salah satu yang diisi. Dipakai kalau memang ada dua jalur input yang
 * sah — bukan untuk melonggarkan field yang seharusnya wajib.
 */
const REQUIRED_EITHER: Record<string, Record<string, [fields: string[], label: string][]>> = {
  // Gording bisa diberi panjangnya sendiri atau ikut panjang total balok.
  beam: { purlin: [[['purlin_length', 'total_length'], 'Panjang gording']] },
  // Layar sekarang memakai cm; kontrak lama memakai mm. Keduanya sah.
  wall: { masonry: [[['thickness_cm', 'thickness_mm'], 'Tebal dinding']] },
};

/** Field yang boleh bernilai nol. Atap datar berkemiringan 0 derajat itu sah. */
const ALLOW_ZERO = new Set(['slope_deg']);

const isFilled = (params: any, field: string): boolean => {
  const raw = params?.[field];
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;

  // Field bernilai teks (nama profil) cukup tidak kosong.
  const value = num(raw, NaN);
  if (!isFinite(value)) return String(raw).trim() !== '';

  return ALLOW_ZERO.has(field) ? true : value > 0;
};

/**
 * Spesifikasi field wajib untuk satu tipe+varian, sebagai DATA.
 *
 * EST-MTO-R50: layar usulan AI perlu tahu field apa yang harus diisi supaya bisa
 * menampilkan isian yang tepat. Sebelumnya daftar ini hanya hidup sebagai pesan
 * teks ("Panjang footing (L) wajib diisi") — bisa dibaca manusia, tapi tidak
 * bisa dipakai membangun formulir. Akibatnya usulan yang kurang lengkap jadi
 * buntu total: penggunanya melihat apa yang kurang, tapi tidak punya tempat
 * untuk mengisinya.
 *
 * Dikembalikan sebagai data supaya layar dan validator memakai daftar yang SAMA
 * — kalau layar punya daftarnya sendiri, field yang ditambahkan di sini tidak
 * akan pernah muncul di formulir.
 */
export interface SpesifikasiField {
  field: string;
  label: string;
  wajib: boolean;
  /** `angka` untuk dimensi, `teks` untuk nama profil. */
  jenis: 'angka' | 'teks';
  /** Benar kalau nol adalah nilai yang sah (mis. atap datar). */
  boleh_nol: boolean;
  /** Field alternatif yang sama-sama memenuhi syarat, kalau ada. */
  alternatif?: string[];
}

const FIELD_TEKS = new Set([
  'wf_profile', 'wf_profile_beam', 'kanal_profile', 'purlin_profile',
  'foundation_type', 'column_type', 'beam_type', 'slab_type', 'wall_type', 'roof_type',
]);

export const spesifikasiField = (elementType: string, variant: string): SpesifikasiField[] => {
  const buat = (field: string, label: string, alternatif?: string[]): SpesifikasiField => ({
    field, label, wajib: true,
    jenis: FIELD_TEKS.has(field) ? 'teks' : 'angka',
    boleh_nol: ALLOW_ZERO.has(field),
    ...(alternatif ? { alternatif } : {}),
  });

  const out: SpesifikasiField[] = [];
  for (const [f, l] of REQUIRED_COMMON[elementType] || []) out.push(buat(f, l));
  for (const [f, l] of (REQUIRED_VARIANT[elementType] || {})[variant] || []) out.push(buat(f, l));
  for (const [fields, l] of (REQUIRED_EITHER[elementType] || {})[variant] || []) {
    out.push(buat(fields[0], l, fields));
  }
  return out;
};

/**
 * Field yang berpengaruh pada hasil tapi TIDAK wajib.
 *
 * Dipisahkan dari yang wajib supaya formulir bisa menampilkan keduanya tanpa
 * menyamakan "belum diisi sehingga memakai asumsi" dengan "boleh dikosongkan".
 */
const OPSIONAL: Record<string, Req[]> = {
  foundation: [
    ['depth', 'Kedalaman galian'],
    ['waste_pct', 'Susut (%)'],
    ['tb_length', 'Panjang tie beam'],
    ['tb_w', 'Lebar tie beam'],
    ['tb_h', 'Tinggi tie beam'],
    // Bored pile
    ['rebar_count', 'Jumlah besi utama per tiang'],
    ['spiral_dia', 'Diameter spiral (mm)'],
    ['head_cut', 'Bobokan kepala tiang'],
    ['casing_length', 'Panjang casing sementara'],
  ],
};

export const spesifikasiOpsional = (elementType: string): SpesifikasiField[] =>
  (OPSIONAL[elementType] || []).map(([field, label]) => ({
    field, label, wajib: false,
    jenis: FIELD_TEKS.has(field) ? 'teks' as const : 'angka' as const,
    boleh_nol: true,
  }));

/**
 * Daftar field wajib yang belum diisi, sudah dalam bahasa manusia.
 * Kosong berarti lengkap.
 */
export const missingRequiredFields = (elementType: string, params: any, variant: string): string[] => {
  const missing: string[] = [];

  for (const [field, label] of REQUIRED_COMMON[elementType] || []) {
    if (!isFilled(params, field)) missing.push(`${label} (${field}) wajib diisi`);
  }

  for (const [field, label] of (REQUIRED_VARIANT[elementType] || {})[variant] || []) {
    if (!isFilled(params, field)) missing.push(`${label} (${field}) wajib diisi`);
  }

  for (const [fields, label] of (REQUIRED_EITHER[elementType] || {})[variant] || []) {
    if (!fields.some(f => isFilled(params, f))) {
      missing.push(`${label} wajib diisi (${fields.join(' atau ')})`);
    }
  }

  return missing;
};
