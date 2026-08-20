/**
 * Sakelar tampilan yang dikendalikan dari satu tempat.
 *
 * Dipakai untuk fitur yang ingin disembunyikan dari pengguna tanpa membongkar
 * kodenya — kalau nanti mau dimunculkan lagi, cukup ubah nilai di sini (atau
 * setel variabel `.env`), bukan menyisir ulang belasan layar.
 */

const bacaEnv = (kunci: string, bawaan: boolean): boolean => {
  const v = (import.meta as any).env?.[kunci];
  if (v === undefined || v === '') return bawaan;
  return String(v).toLowerCase() !== 'false' && String(v) !== '0';
};

/**
 * Sembunyikan seluruh tombol Import/Export/unduh template.
 *
 * Kontrolnya ditandai `data-fitur="import-export"` di masing-masing layar;
 * penyembunyiannya dilakukan CSS lewat kelas pada elemen <html>, jadi tidak ada
 * layar yang perlu tahu soal sakelar ini.
 *
 * Catatan jujur: ini menyembunyikan JALAN MASUK di antarmuka, bukan menutup
 * endpoint-nya. Siapa pun yang tahu alamat API dan punya token masih bisa
 * memanggilnya langsung. Kalau yang diinginkan benar-benar menutup ekspor data,
 * penjagaannya harus dipasang di backend (permission), bukan di tampilan.
 */
export const SEMBUNYIKAN_IMPORT_EXPORT = bacaEnv('VITE_SEMBUNYIKAN_IMPORT_EXPORT', true);

/**
 * Cegah penyalinan teks lewat blok/seleksi.
 *
 * Catatan jujur yang sama, malah lebih longgar: ini hanya menghalangi seleksi
 * mouse. Isi halaman tetap bisa diambil lewat "View Source", DevTools,
 * print-to-PDF, ekstensi peramban, atau tangkapan layar. Anggap ini penghalang
 * ketidaksengajaan, bukan pengamanan.
 *
 * Kolom isian, textarea, dan area yang bisa disunting SENGAJA dikecualikan —
 * tanpa itu pengguna tidak bisa memperbaiki ketikannya sendiri.
 */
export const CEGAH_SALIN_TEKS = bacaEnv('VITE_CEGAH_SALIN_TEKS', true);

/** Pasang kelas penanda di <html> supaya CSS bisa bekerja. */
export function pasangSakelarTampilan(): void {
  const root = document.documentElement;
  root.classList.toggle('tanpa-import-export', SEMBUNYIKAN_IMPORT_EXPORT);
  root.classList.toggle('tanpa-salin-teks', CEGAH_SALIN_TEKS);
}
