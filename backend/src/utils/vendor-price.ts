/**
 * Predikat "harga vendor yang boleh dipakai" (PROC-VPL-01).
 *
 * Harga baru dan revisi yang masih menunggu persetujuan TIDAK boleh muncul di
 * auto-fill PR, price-search, pemilihan vendor, atau analisis AI. Kalau ia
 * tetap muncul, gerbang approval-nya hanya hiasan di layar daftar harga
 * sementara angkanya tetap mengalir ke dokumen yang mengikat. Baris yang sudah
 * digantikan revisi berhenti di sini juga.
 *
 * Ditaruh di modul sendiri, bukan di dalam salah satu berkas rute, supaya
 * pembacanya di `procurement.routes.ts` dan `ai.routes.ts` memakai definisi
 * yang SAMA. Dua salinan yang menyimpang adalah cara paling mudah membuat satu
 * modul diam-diam melihat harga yang belum disetujui.
 *
 * `tests/vendor-price-approval.ts` memindai berkas rute untuk memastikan tidak
 * ada pembaca baru yang lupa memasangnya.
 */
export const hargaVendorAktif = (alias: string = 'vp'): string =>
  `${alias}.approval_status = 2 AND ${alias}.superseded_at IS NULL`;
