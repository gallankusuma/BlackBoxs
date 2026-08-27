import crypto from 'crypto';

/**
 * Model dokumen penawaran — satu sumber untuk PDF dan checksum-nya.
 *
 * Dipisahkan dari perendernya supaya angka yang dicetak dan angka yang
 * di-checksum berasal dari objek yang SAMA. Kalau perender menghitung sendiri,
 * dua dokumen dengan checksum identik bisa memuat angka berbeda — dan checksum
 * yang tidak mengikat isi lebih buruk daripada tidak ada checksum.
 */

export interface BarisPenawaran {
  no: string;
  kode: string;
  uraian: string;
  satuan: string;
  qty: number;
  harga_satuan: number;
  jumlah: number;
}

export interface SeksiPenawaran {
  label: string;
  baris: BarisPenawaran[];
  subtotal: number;
}

export interface DokumenPenawaran {
  nomor: string;
  revisi: string | null;
  proyek: string;
  klien: string;
  lokasi: string | null;
  status: string;
  tanggal: string | null;          // tanggal terbit; null kalau belum dikirim
  seksi: SeksiPenawaran[];
  ringkasan: {
    direct_cost: number;
    overhead: number;
    risk_contingency: number;
    total: number;
  };
  jumlah_baris: number;
  checksum: string;
}

/**
 * Format angka TANPA `toLocaleString`.
 *
 * `toLocaleString('id-ID')` bergantung pada data ICU yang tersedia di runtime.
 * Node yang dibangun tanpa full-icu diam-diam jatuh ke format lain, sehingga
 * dokumen yang sama tercetak berbeda di server dan di laptop — persis cacat
 * "print browser berbeda antarperangkat" yang dokumen ini dimaksudkan untuk
 * menutupnya.
 */
export const rupiah = (v: number): string => {
  const n = Number(v) || 0;
  const neg = n < 0;
  const [bulat, pecahan] = Math.abs(n).toFixed(2).split('.');
  const ribuan = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${ribuan},${pecahan}`;
};

/** Volume: sampai 4 desimal, tanpa nol ekor yang tidak berarti. */
export const volume = (v: number): string => {
  const n = Number(v) || 0;
  const s = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  const [bulat, pecahan] = s.split('.');
  const ribuan = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return pecahan ? `${ribuan},${pecahan}` : ribuan;
};

const angka = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Rakit dokumen dari baris proposal.
 *
 * Struktur yang dipakai adalah SEKSI (`is_section` / `section_order`), bukan
 * klasifikasi discipline — itu yang benar-benar dipakai estimator, dan di
 * produksi seluruh 548 baris memakainya sementara tidak satu pun punya
 * discipline.
 */
export function rakitDokumen(proposal: any, items: any[]): DokumenPenawaran {
  const seksiMap = new Map<string, SeksiPenawaran>();
  const TANPA_SEKSI = '__tanpa_seksi__';

  // Judul seksi dulu, supaya urutannya mengikuti `section_order`.
  const judul = new Map<number, string>();
  for (const it of items) {
    if (Number(it.is_section) === 1) {
      judul.set(Number(it.section_order), String(it.section_label || it.ahsp_name_snapshot || '-'));
    }
  }

  let nomorSeksi = 0;
  const urutSeksi = [...judul.keys()].sort((a, b) => a - b);
  for (const so of urutSeksi) {
    nomorSeksi++;
    seksiMap.set(String(so), { label: judul.get(so)!, baris: [], subtotal: 0 });
  }

  for (const it of items) {
    if (Number(it.is_section) === 1) continue;
    const kunci = it.section_order == null ? TANPA_SEKSI : String(it.section_order);
    if (!seksiMap.has(kunci)) {
      // Baris yang menunjuk seksi tanpa judul — TIDAK dibuang. Baris yang hilang
      // dari dokumen jauh lebih berbahaya daripada seksi yang namanya kosong.
      seksiMap.set(kunci, {
        label: kunci === TANPA_SEKSI ? 'Lain-lain' : `Seksi ${kunci}`,
        baris: [], subtotal: 0,
      });
    }
    const s = seksiMap.get(kunci)!;
    const jumlah = angka(it.total_price);
    s.baris.push({
      no: '',
      kode: String(it.ahsp_code_snapshot || ''),
      uraian: String(it.description || it.ahsp_name_snapshot || '-'),
      satuan: String(it.unit_snapshot || ''),
      qty: angka(it.qty),
      harga_satuan: angka(it.unit_price_snapshot),
      jumlah,
    });
    s.subtotal += jumlah;
  }

  // Seksi kosong tidak dicetak — tapi hanya kalau memang tidak punya baris.
  const seksi = [...seksiMap.values()].filter(s => s.baris.length > 0);

  let i = 0, j = 0;
  for (const s of seksi) {
    i++; j = 0;
    s.subtotal = Math.round(s.subtotal * 100) / 100;
    for (const b of s.baris) { j++; b.no = `${i}.${j}`; }
  }

  const ringkasan = {
    direct_cost: angka(proposal.direct_cost),
    overhead: angka(proposal.overhead),
    risk_contingency: angka(proposal.risk_contingency),
    total: angka(proposal.total_project),
  };

  const dok: DokumenPenawaran = {
    nomor: String(proposal.proposal_number || '-'),
    revisi: proposal.revision == null ? null : String(proposal.revision),
    proyek: String(proposal.project_name || '-'),
    klien: String(proposal.client || '-'),
    lokasi: proposal.lokasi ? String(proposal.lokasi) : null,
    status: String(proposal.status || 'draft'),
    tanggal: proposal.submitted_at ? isoTanggal(proposal.submitted_at) : null,
    seksi,
    ringkasan,
    jumlah_baris: seksi.reduce((a, s) => a + s.baris.length, 0),
    checksum: '',
  };

  dok.checksum = hitungChecksum(dok);
  return dok;
}

/**
 * Checksum atas ISI dokumen, bukan atas byte PDF-nya.
 *
 * Dua dokumen dengan isi sama harus punya checksum sama walau perendernya
 * berubah versi — yang mengikat adalah angka dan lingkupnya, bukan tata letak.
 */
export function hitungChecksum(dok: DokumenPenawaran): string {
  const inti = {
    nomor: dok.nomor, revisi: dok.revisi, proyek: dok.proyek, klien: dok.klien,
    lokasi: dok.lokasi, tanggal: dok.tanggal,
    seksi: dok.seksi.map(s => ({
      label: s.label, subtotal: s.subtotal,
      baris: s.baris.map(b => [b.no, b.kode, b.uraian, b.satuan, b.qty, b.harga_satuan, b.jumlah]),
    })),
    ringkasan: dok.ringkasan,
  };
  return crypto.createHash('sha256').update(JSON.stringify(inti)).digest('hex');
}

/** `YYYY-MM-DD` tanpa bergantung zona waktu runtime. */
function isoTanggal(v: any): string {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const tanggalPanjang = (iso: string | null): string => {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${BULAN[m - 1]} ${y}`;
};
