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
  [/EXCV|GALI/i,            ['galian', 'gali', 'tanah', 'excavation']],
  [/BACKFILL|URUG/i,        ['urugan', 'urug', 'timbunan', 'pemadatan', 'backfill']],
  [/LEAN/i,                 ['lantai kerja', 'lean', 'rabat']],
  [/CONC|BETON/i,           ['beton', 'concrete', 'cor']],
  [/REBAR|BESI|TULANG/i,    ['pembesian', 'besi', 'tulangan', 'baja tulangan', 'rebar']],
  [/SPIRAL|SENGKANG/i,      ['sengkang', 'spiral', 'begel', 'pembesian']],
  [/FORM|BEKIST/i,          ['bekisting', 'formwork', 'cetakan']],
  [/DRILL|BOR/i,            ['bor', 'pengeboran', 'drilling']],
  [/SPOIL/i,                ['buangan', 'spoil', 'pembuangan tanah']],
  [/CASING/i,               ['casing', 'selubung']],
  [/HEADCUT|BOBOK/i,        ['bobok', 'pemotongan kepala', 'head cut']],
  [/PILE|TIANG/i,           ['tiang pancang', 'pancang', 'pile']],
  [/BRICK|BATA|MASONRY/i,   ['pasangan bata', 'bata', 'dinding', 'batu']],
  [/PLASTER|PLESTER/i,      ['plesteran', 'plester', 'acian']],
  [/ROOF|ATAP/i,            ['atap', 'penutup atap', 'rangka atap']],
  [/PAINT|CAT/i,            ['pengecatan', 'cat']],
  [/STEEL|BAJA/i,           ['baja', 'steel', 'profil']],
];

const bersih = (t: string) => String(t || '').toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

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

    const nama = bersih(a.name);
    let skor = 0;
    const alasan: string[] = [];

    // Kata kunci dari KODE baris — sinyal terkuat karena kodenya stabil.
    const cocokKunci = kunci.filter(k => nama.includes(bersih(k)));
    if (cocokKunci.length) {
      skor += 40 + Math.min(cocokKunci.length - 1, 2) * 10;
      alasan.push(`jenis pekerjaan cocok: ${cocokKunci.slice(0, 3).join(', ')}`);
    }

    // Kata dari label MTO — sinyal pendukung.
    const cocokLabel = kataLabel.filter(w => nama.includes(w));
    if (cocokLabel.length) {
      skor += Math.min(cocokLabel.length * 12, 30);
      alasan.push(`kata yang sama: ${cocokLabel.slice(0, 3).join(', ')}`);
    }

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
