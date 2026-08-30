/**
 * Wawancara lingkup pekerjaan — dari percakapan menjadi zona MTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Kenapa pertanyaannya DIBANGKITKAN, bukan ditulis tangan.
 *
 * `spesifikasiField()` sudah mengekspor dimensi wajib tiap varian sebagai DATA
 * — daftar yang sama yang dipakai validator penyimpanan dan formulir usulan
 * gambar. Kalau daftar pertanyaan ditulis terpisah, ia akan melenceng diam-diam
 * setiap kali varian baru ditambahkan: wawancaranya berhenti menanyakan sesuatu
 * yang tetap wajib, dan pengguna baru tahu saat penyimpanan ditolak.
 *
 * Jadi di sini tidak ada satu pun daftar dimensi yang ditulis tangan. Yang
 * ditulis tangan hanyalah pertanyaan LINGKUP — hal yang memang tidak diketahui
 * kalkulator: bangunan apa, berapa lantai, sistem strukturnya apa.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Stateless: seluruh jawaban dikirim ulang tiap giliran, tidak ada tabel
 * percakapan. Alasannya sama dengan `/mto/diskusi` — wawancara yang belum
 * selesai bukan data bisnis, dan menyimpannya hanya menciptakan sampah yang
 * harus dibersihkan.
 */
import { spesifikasiField, spesifikasiOpsional, katalogElemen, VARIANT_FIELD } from './contract';

export type JenisPertanyaan = 'pilihan' | 'pilihan_ganda' | 'angka' | 'teks';

export interface Pertanyaan {
  field: string;
  label: string;
  jenis: JenisPertanyaan;
  wajib: boolean;
  opsi?: Array<{ nilai: string; label: string; catatan?: string }>;
  satuan?: string;
  bantuan?: string;
  /** Diisi otomatis dari jawaban sebelumnya; pengguna masih boleh mengubah. */
  saran?: any;
}

export interface LangkahWawancara {
  langkah: string;
  judul: string;
  penjelasan?: string;
  pertanyaan: Pertanyaan[];
  selesai: boolean;
  /** Zona yang akan dibentuk — hanya terisi pada langkah terakhir. */
  zona: Array<{
    element_type: string;
    element_name: string;
    parameters: Record<string, any>;
    /** Field yang nilainya DITURUNKAN, bukan dijawab langsung. */
    diturunkan: string[];
    template_id?: number;
  }>;
  /** Asumsi yang dipakai sistem, dinyatakan supaya bisa dikoreksi. */
  asumsi: string[];
}

const BANGUNAN = [
  { nilai: 'gudang',  label: 'Gudang / Warehouse' },
  { nilai: 'pabrik',  label: 'Pabrik / Industri' },
  { nilai: 'kantor',  label: 'Kantor / Komersial' },
  { nilai: 'ruko',    label: 'Ruko / Rumah Tinggal' },
  { nilai: 'sipil',   label: 'Pekerjaan Sipil (tanpa bangunan atas)' },
];

const STRUKTUR = [
  { nilai: 'beton', label: 'Beton bertulang', catatan: 'kolom & balok beton' },
  { nilai: 'baja',  label: 'Baja (WF)',       catatan: 'kolom & balok profil baja' },
  { nilai: 'campuran', label: 'Campuran',     catatan: 'kolom beton, atap rangka baja' },
];

/**
 * Varian yang wajar untuk kombinasi jawaban lingkup.
 *
 * Ini pemetaan, bukan tebakan cerdas: "struktur baja" berarti kolom WF, dan
 * itu benar terlepas dari luas bangunannya. Yang TIDAK dilakukan di sini
 * adalah menebak DIMENSI — itu selalu ditanyakan.
 */
const varianUntuk = (tipe: string, struktur: string): string => {
  const baja = struktur === 'baja';
  switch (tipe) {
    case 'foundation': return 'footplate';
    case 'column':     return baja ? 'wf' : 'concrete';
    case 'beam':       return baja || struktur === 'campuran' ? 'wf' : 'concrete';
    case 'slab':       return 'concrete';
    case 'wall':       return 'masonry';
    case 'roof':       return baja || struktur === 'campuran' ? 'sheet' : 'deck';
    default:           return '';
  }
};

const ELEMEN_BAWAAN: Record<string, string[]> = {
  gudang: ['foundation', 'column', 'beam', 'slab', 'wall', 'roof'],
  pabrik: ['foundation', 'column', 'beam', 'slab', 'wall', 'roof'],
  kantor: ['foundation', 'column', 'beam', 'slab', 'wall', 'roof'],
  ruko:   ['foundation', 'column', 'beam', 'slab', 'wall', 'roof'],
  sipil:  ['foundation'],
};

const LABEL_ELEMEN: Record<string, string> = {
  foundation: 'Pondasi', column: 'Kolom', beam: 'Balok',
  slab: 'Pelat Lantai', wall: 'Dinding', roof: 'Atap',
};

const angka = (v: any): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Satu giliran wawancara.
 *
 * `jawaban` memuat seluruh jawaban sejauh ini. Fungsi ini murni — tidak
 * menyentuh database, tidak menulis apa pun — sehingga bisa diuji tanpa
 * backend dan hasilnya sama tiap kali.
 */
export const langkahWawancara = (
  jawaban: Record<string, any>,
  templateTersedia: Array<{ id: number; name: string; element_type: string; variant_raw?: string | null; parameters: any; pending_fields?: any[] }> = [],
): LangkahWawancara => {
  const asumsi: string[] = [];
  const kosong = { zona: [], asumsi, selesai: false };

  // ── Langkah 1: lingkup ────────────────────────────────────────────────────
  if (!jawaban.jenis_bangunan || !jawaban.sistem_struktur) {
    return {
      ...kosong,
      langkah: 'lingkup',
      judul: 'Pekerjaan apa yang ditawarkan?',
      penjelasan: 'Dua jawaban ini menentukan elemen dan varian yang akan ditanyakan berikutnya.',
      pertanyaan: [
        { field: 'jenis_bangunan', label: 'Jenis bangunan', jenis: 'pilihan', wajib: true, opsi: BANGUNAN },
        { field: 'sistem_struktur', label: 'Sistem struktur', jenis: 'pilihan', wajib: true, opsi: STRUKTUR },
      ],
    };
  }

  // ── Langkah 2: ukuran kasar ───────────────────────────────────────────────
  if (angka(jawaban.jumlah_lantai) === null) {
    return {
      ...kosong,
      langkah: 'ukuran',
      judul: 'Seberapa besar?',
      penjelasan: 'Dipakai untuk menyarankan jumlah — bukan untuk menebak dimensi. '
                + 'Dimensi tetap ditanyakan satu per satu.',
      pertanyaan: [
        { field: 'jumlah_lantai', label: 'Jumlah lantai', jenis: 'angka', wajib: true, saran: 1 },
        { field: 'luas_lantai', label: 'Luas per lantai', jenis: 'angka', wajib: false, satuan: 'm²',
          bantuan: 'Boleh dikosongkan kalau belum diketahui.' },
        { field: 'grid_x', label: 'Jarak kolom arah X', jenis: 'angka', wajib: false, satuan: 'm',
          bantuan: 'Kalau diisi bersama luas, jumlah kolom disarankan otomatis.' },
        { field: 'grid_y', label: 'Jarak kolom arah Y', jenis: 'angka', wajib: false, satuan: 'm' },
      ],
    };
  }

  // ── Langkah 3: elemen mana saja ───────────────────────────────────────────
  const bawaan = ELEMEN_BAWAAN[String(jawaban.jenis_bangunan)] || ['foundation'];
  if (!Array.isArray(jawaban.elemen) || !jawaban.elemen.length) {
    const tersedia = katalogElemen().map(e => e.element_type);
    return {
      ...kosong,
      langkah: 'elemen',
      judul: 'Lingkup pekerjaannya mencakup apa saja?',
      penjelasan: 'Yang tidak dicentang tidak akan masuk MTO — dan itu keputusan lingkup, '
                + 'bukan kelalaian, jadi sebaiknya disengaja.',
      pertanyaan: [{
        field: 'elemen', label: 'Elemen pekerjaan', jenis: 'pilihan_ganda', wajib: true,
        saran: bawaan.filter(t => tersedia.includes(t)),
        opsi: tersedia.map(t => ({
          nilai: t, label: LABEL_ELEMEN[t] || t,
          catatan: varianUntuk(t, String(jawaban.sistem_struktur)) || undefined,
        })),
      }],
    };
  }

  // ── Langkah 4: dimensi per elemen ─────────────────────────────────────────
  //
  // Pertanyaannya DIBANGKITKAN dari `spesifikasiField()` — daftar yang sama
  // yang dipakai gerbang penyimpanan. Jadi wawancara tidak mungkin lupa
  // menanyakan sesuatu yang nanti ditolak.
  const dim: Record<string, any> = jawaban.dimensi || {};
  const luas = angka(jawaban.luas_lantai);
  const gx = angka(jawaban.grid_x);
  const gy = angka(jawaban.grid_y);
  const lantai = angka(jawaban.jumlah_lantai) || 1;

  // Saran jumlah kolom hanya kalau datanya benar-benar ada. Menyarankan dari
  // luas saja berarti mengarang jarak grid.
  let saranTitik: number | null = null;
  if (luas && gx && gy && gx > 0 && gy > 0) {
    saranTitik = Math.max(1, Math.round(luas / (gx * gy)));
    asumsi.push(`Jumlah titik kolom/pondasi disarankan ${saranTitik} dari luas ${luas} m² dibagi grid ${gx}×${gy} m. Periksa terhadap denah.`);
  }

  for (const tipe of jawaban.elemen as string[]) {
    const varian = varianUntuk(tipe, String(jawaban.sistem_struktur));
    if (!varian) continue;
    const fieldVarian = VARIANT_FIELD[tipe]?.[0];
    const isian = dim[tipe] || {};
    const spek = spesifikasiField(tipe, varian);

    const kurang = spek.filter(f => {
      const alt = f.alternatif || [f.field];
      return !alt.some(a => {
        const v = angka(isian[a]);
        return v !== null && (f.boleh_nol ? v >= 0 : v > 0);
      });
    });
    if (!kurang.length) continue;

    // Template yang cocok ditawarkan lebih dulu — kalau ada yang pernah
    // disimpan, mengetik ulang dimensinya adalah pekerjaan yang sia-sia.
    const cocok = templateTersedia.filter(t =>
      t.element_type === tipe &&
      (!t.variant_raw || String(t.variant_raw).toLowerCase() === varian));

    return {
      langkah: `dimensi:${tipe}`,
      judul: `Dimensi ${LABEL_ELEMEN[tipe] || tipe}`,
      penjelasan: cocok.length
        ? `Ada ${cocok.length} template tersimpan untuk ini — pakai salah satunya, atau isi manual.`
        : 'Angka-angka ini yang menentukan kuantitas; tidak ada yang ditebak sistem.',
      pertanyaan: [
        ...(cocok.length ? [{
          field: `template:${tipe}`, label: 'Pakai template', jenis: 'pilihan' as const, wajib: false,
          opsi: [
            { nilai: '', label: '— isi manual —' },
            ...cocok.map(t => ({ nilai: String(t.id), label: t.name })),
          ],
        }] : []),
        ...kurang.map(f => ({
          field: f.field, label: f.label, jenis: 'angka' as const, wajib: true,
          ...(f.alternatif ? { bantuan: `Bisa juga diisi lewat: ${f.alternatif.join(' / ')}` } : {}),
          ...(saranTitik && /qty|jumlah|count|per_floor/i.test(f.field) ? { saran: saranTitik } : {}),
        })),
      ],
      selesai: false,
      zona: [],
      asumsi,
      ...(fieldVarian ? {} : {}),
    };
  }

  // ── Selesai: zona siap dibentuk ───────────────────────────────────────────
  const zona = (jawaban.elemen as string[]).map(tipe => {
    const varian = varianUntuk(tipe, String(jawaban.sistem_struktur));
    const fieldVarian = VARIANT_FIELD[tipe]?.[0];
    const isian = { ...(dim[tipe] || {}) };
    const diturunkan: string[] = [];

    // Jumlah lantai diturunkan dari jawaban ukuran kalau kalkulatornya memang
    // mengenal field itu dan pengguna belum mengisinya sendiri.
    //
    // Diperiksa terhadap spesifikasi WAJIB **dan** OPSIONAL: `floors` adalah
    // field opsional pada kolom, jadi memeriksa yang wajib saja membuat
    // penurunan ini tidak pernah menyala — dan kolom tiga lantai dihitung
    // seolah satu lantai.
    const dikenal = [
      ...spesifikasiField(tipe, varian),
      ...spesifikasiOpsional(tipe),
    ].some(f => f.field === 'floors');
    if (angka(isian.floors) === null && lantai > 0 && dikenal) {
      isian.floors = lantai;
      diturunkan.push('floors');
    }

    const params: Record<string, any> = { ...isian };
    if (fieldVarian) params[fieldVarian] = varian;

    return {
      element_type: tipe,
      element_name: `${LABEL_ELEMEN[tipe] || tipe} ${String(jawaban.jenis_bangunan)}`,
      parameters: params,
      diturunkan,
      ...(dim[`template:${tipe}`] ? { template_id: Number(dim[`template:${tipe}`]) } : {}),
    };
  });

  return {
    langkah: 'ringkasan',
    judul: 'Lingkup siap dibentuk',
    penjelasan: `${zona.length} zona akan dibuat. Kuantitasnya dihitung kalkulator yang sama `
              + 'dengan input manual — periksa dulu sebelum diterima.',
    pertanyaan: [],
    selesai: true,
    zona,
    asumsi,
  };
};
