/**
 * Mencocokkan baris MTO dengan AHSP — deterministik dan bisa dijelaskan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Kenapa BUKAN AI di sini, padahal pembacaan gambarnya memakai AI.
 *
 * Pembacaan gambar memang butuh penafsiran: "2000" di sebelah garis itu panjang
 * atau lebar hanya bisa dijawab dengan melihat. Pencocokan AHSP tidak begitu —
 * ia perbandingan kata dan satuan terhadap katalog yang sudah ada. Dikerjakan
 * AI, hasilnya berubah-ubah antar pemanggilan, tidak bisa diaudit, dan memakan
 * kuota untuk pekerjaan yang tidak memerlukannya.
 *
 * Yang penting di sini bukan pintar, tapi **bisa dipertanggungjawabkan**: tiap
 * usulan membawa skor dan alasannya, jadi estimator tahu kenapa AHSP itu yang
 * muncul dan bisa menolaknya dengan dasar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface KandidatAhsp {
  id: number;
  kode: string;
  name: string;
  satuan: string;
  harga_satuan: number;
  work_category?: string | null;
}

export interface UsulanCocok {
  ahsp_id: number;
  kode: string;
  name: string;
  satuan: string;
  harga_satuan: number;
  skor: number;
  /** Kenapa ia diusulkan — ditampilkan apa adanya ke estimator. */
  alasan: string[];
}

/**
 * Kata kunci per jenis pekerjaan, diturunkan dari kode baris MTO.
 *
 * Kodenya stabil (dipakai sebagai relasi RAB), jadi memetakan dari kode jauh
 * lebih tahan daripada menebak dari label yang bisa berubah kata-katanya.
 */
const KATA_KUNCI: Array<[RegExp, string[]]> = [
  // Urutan penting: pola yang lebih khusus didahulukan, karena `STIRRUP`
  // juga mengandung pola besi dan kalau tertukar ia akan mengusulkan
  // pembesian utama untuk sengkang.
  // Sengkang dan spiral TIDAK punya AHSP sendiri dalam SNI/Permen PUPR —
  // diperiksa di katalog produksi: nol dari 3.469 baris memuat kata itu.
  // Keduanya masuk pekerjaan PENULANGAN yang dihitung per kilogram, dan
  // diameternya (D10) kebetulan jatuh di kelompok "< 12 mm". Jadi yang benar
  // bukan menambah AHSP baru, melainkan memetakannya ke keluarga yang tepat.
  [/STIRRUP|SPIRAL|SENGKANG|BEGEL/i,
    ['penulangan', 'pembesian', 'tulangan', 'besi', 'sengkang', 'begel', 'spiral']],
  [/EXCV|GALI/i,            ['galian', 'gali', 'penggalian', 'excavation']],
  [/BACKFILL|URUG/i,        ['urugan', 'urug', 'timbunan', 'pemadatan', 'backfill', 'pengurugan']],
  [/LEAN/i,                 ['lantai kerja', 'lean', 'rabat', 'beton', 'kerja']],
  [/SCREED/i,               ['screed', 'plesteran', 'lantai', 'acian']],
  [/LEVEL/i,                ['leveling', 'perataan', 'lantai', 'screed']],
  [/CONC|BETON/i,           ['beton', 'concrete', 'cor', 'pengecoran']],
  [/REBAR|BESI|TULANG/i,    ['pembesian', 'besi', 'tulangan', 'rebar', 'penulangan']],
  [/FORM|BEKIST/i,          ['bekisting', 'formwork', 'cetakan', 'perancah']],
  [/DRILL|BOR\b/i,          ['bor', 'pengeboran', 'drilling', 'strauss']],
  [/SPOIL/i,                ['buangan', 'spoil', 'pembuangan', 'angkut'] ],
  [/CASING/i,               ['casing', 'selubung']],
  [/HEADCUT|BOBOK/i,        ['bobok', 'pembobokan', 'pemotongan', 'kepala']],
  [/PILE|TIANG|PANCANG/i,   ['pancang', 'tiang', 'pile']],
  [/BRICK|BATA|MASONRY/i,   ['pasangan', 'bata', 'dinding', 'batu', 'hebel']],
  [/PLASTER|PLESTER/i,      ['plesteran', 'plester', 'acian']],
  // Rangka atap dan penutup atap adalah dua pekerjaan berbeda; kodenya pun
  // berbeda, jadi kata kuncinya tidak boleh disamakan.
  [/PURLIN|GORDING/i,       ['gording', 'purlin', 'rangka', 'baja', 'profil', 'cnp']],
  [/RF-TILE|GENTENG/i,      ['genteng', 'penutup', 'atap']],
  [/RF-AREA|ROOF|ATAP/i,    ['atap', 'penutup', 'rangka']],
  [/CLAD/i,                 ['cladding', 'dinding', 'zincalume', 'penutup', 'metal']],
  [/ANCHOR|ANGKUR/i,        ['angkur', 'anchor', 'baut', 'stek']],
  [/SCREW|SEKRUP/i,         ['sekrup', 'screw', 'baut']],
  [/BASEPLATE|BASE/i,       ['base', 'plate', 'plat', 'perletakan', 'fabrikasi']],
  [/CFS|RINGAN/i,           ['ringan', 'fabrikasi', 'baja', 'truss']],
  [/WOOD|KAYU/i,            ['kayu', 'konstruksi']],
  [/PAINT|CAT/i,            ['pengecatan', 'cat', 'finishing']],
  [/ADHESIVE|PEREKAT/i,     ['perekat', 'adhesive', 'semen', 'mortar', 'pemasangan']],
  [/GROUT|NAT/i,            ['nat', 'grouting', 'grout', 'pengisi']],
  [/FLOOR|LANTAI/i,         ['lantai', 'penutup', 'pemasangan']],
  [/WF|STEEL|BAJA/i,        ['baja', 'profil', 'wf', 'ereksi', 'pabrikasi', 'fabrikasi']],
  // Penutup lantai & dinding. Sebelumnya tidak punya aturan sama sekali,
  // sehingga baris keramik, kaca, dan GRC dilaporkan "tanpa kandidat" padahal
  // katalognya punya — lubang di matcher, bukan di katalog.
  [/TILE|KERAMIK/i,         ['keramik', 'lantai', 'pemasangan', 'ubin']],
  [/GLASS|KACA/i,           ['kaca', 'glass', 'pemasangan']],
  [/GRC(?!-FRAME)/i,        ['grc', 'papan', 'partisi', 'pemasangan']],
  [/FRAME|HOLLOW|RANGKA/i,  ['rangka', 'hollow', 'besi', 'pemasangan']],
  [/PLATE|BORDES/i,         ['plat', 'bordes', 'plate', 'baja']],
];

const bersih = (t: string) => String(t || '').toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Kata utuh sebuah teks.
 *
 * Perbandingan substring pernah membuat "Lantai **Kerja**" cocok dengan
 * "Pe*kerja*an Umum" — usulan yang bukan cuma lemah, tapi keliru: galian tanah
 * diusulkan untuk lantai kerja. Usulan yang salah lebih buruk daripada tidak
 * ada usulan, karena ia mengundang orang menerimanya.
 */
const kataUtuh = (t: string): Set<string> => new Set(bersih(t).split(' ').filter(Boolean));

/** Cocok kalau katanya sama utuh, atau salah satu awalan yang lain (≥5 huruf). */
const adaKata = (kumpulan: Set<string>, kata: string): boolean => {
  if (kumpulan.has(kata)) return true;
  if (kata.length < 5) return false;
  for (const k of kumpulan) {
    if (k.length >= 5 && (k.startsWith(kata) || kata.startsWith(k))) return true;
  }
  return false;
};

/** Kata yang muncul hampir di semua nama AHSP — tidak membedakan apa pun. */
const KATA_UMUM = new Set([
  'pekerjaan', 'pembuatan', 'pemasangan', 'per', 'dan', 'dengan', 'untuk',
  'm2', 'm3', 'm1', 'kg', 'buah', 'unit', 'tebal', 'ukuran', 'campuran',
]);

/**
 * Satuan disamakan sebelum dibandingkan. `M3`, `m³`, dan `m3` adalah satuan
 * yang sama; kalau tidak dinormalkan, kandidat yang benar justru tersaring.
 */
export const normalSatuan = (s: string): string => String(s || '').toLowerCase()
  .replace(/³/g, '3').replace(/²/g, '2')
  .replace(/[^a-z0-9]/g, '')
  .replace(/^m1$/, 'm')
  .replace(/^meter$/, 'm')
  .replace(/^kilogram$/, 'kg')
  .replace(/^bh$|^bji$|^biji$/, 'buah');

/**
 * Usulkan AHSP untuk satu baris MTO.
 *
 * Satuan adalah **saringan keras**, bukan sekadar penambah skor: menautkan
 * baris m³ ke AHSP m² menghasilkan angka yang salah besaran, dan penaut RAB
 * memang sudah menolaknya (`UNIT_MISMATCH`). Mengusulkannya berarti mengundang
 * orang menekan tombol yang pasti gagal.
 */
export const usulkanAhsp = (
  baris: { code: string; label: string; unit: string },
  katalog: KandidatAhsp[],
  batas = 5,
): UsulanCocok[] => {
  const satuanBaris = normalSatuan(baris.unit);

  const kunci: string[] = [];
  for (const [pola, kata] of KATA_KUNCI) {
    if (pola.test(baris.code)) kunci.push(...kata);
  }
  const kataLabel = bersih(baris.label).split(' ')
    .filter(w => w.length > 3 && !KATA_UMUM.has(w));

  const hasil: UsulanCocok[] = [];
  for (const a of katalog) {
    if (normalSatuan(a.satuan) !== satuanBaris) continue;

    const kataNama = kataUtuh(a.name);
    let skor = 0;
    const alasan: string[] = [];

    // Kata kunci dari KODE baris — sinyal terkuat karena kodenya stabil.
    const cocokKunci = kunci.filter(k =>
      bersih(k).split(' ').every(w => adaKata(kataNama, w)));
    if (cocokKunci.length) {
      skor += 40 + Math.min(cocokKunci.length - 1, 3) * 10;
      alasan.push(`jenis pekerjaan cocok: ${cocokKunci.slice(0, 3).join(', ')}`);
    }

    // Kata dari label MTO — sinyal pendukung.
    const cocokLabel = kataLabel.filter(w => adaKata(kataNama, w));
    if (cocokLabel.length) {
      skor += Math.min(cocokLabel.length * 12, 30);
      alasan.push(`kata yang sama: ${cocokLabel.slice(0, 3).join(', ')}`);
    }

    // Lantai bawah: kecocokan yang HANYA dari kata label, tanpa satu pun kata
    // kunci jenis pekerjaan, terlalu sering keliru — "lantai" pada "Lantai
    // Parket" mencocoki "kantor sementara ... lantai plesteran". Diam lebih
    // berguna daripada usulan yang mengundang orang menekan terima.
    if (!cocokKunci.length) continue;
    if (!skor) continue;
    alasan.push(`satuan sama (${a.satuan})`);
    hasil.push({
      ahsp_id: a.id, kode: a.kode, name: a.name, satuan: a.satuan,
      harga_satuan: Number(a.harga_satuan) || 0,
      skor: Math.min(skor, 100), alasan,
    });
  }

  // Skor tertinggi dulu; pada skor sama, yang harganya sudah terisi lebih dulu
  // karena AHSP tanpa harga menghasilkan RAB bernilai nol.
  hasil.sort((x, y) => y.skor - x.skor || (y.harga_satuan > 0 ? 1 : 0) - (x.harga_satuan > 0 ? 1 : 0));
  return hasil.slice(0, batas);
};
