/**
 * Penjumlahan uang yang tidak bisa berubah jadi penggabungan teks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Pool MySQL di project ini sengaja TIDAK mengaktifkan `decimalNumbers` maupun
 * `typeCast` — menyalakannya global berarti mengubah tipe setiap kolom DECIMAL
 * di seluruh ERP sekaligus, tanpa audit presisi. Konsekuensinya `mysql2`
 * mengembalikan DECIMAL sebagai **string**, dan itu benar tapi menipu:
 *
 *     let subtotal = 0;
 *     subtotal += item.total_price;   // "100.00"
 *     subtotal += item.total_price;   // "200.00"
 *     // subtotal === "0100.00200.00"
 *
 * Tidak ada yang meledak. Angkanya cuma jadi salah, dan besar. Terukur di dev:
 * `typeof row.total_price === 'string'`, dan reducer yang identik dengan
 * endpoint RAB menghasilkan `"00.000.00"` untuk dua baris bernilai nol.
 *
 * Penjumlahannya dilakukan dalam satuan terkecil (bilangan bulat sen) lalu
 * dibagi seratus di akhir. Menjumlahkan `Number` biasa sebenarnya sudah cukup
 * untuk menghindari penggabungan teks, tapi menyisakan hanyutan float —
 * 0.1 + 0.2 = 0.30000000000000004 — yang muncul sebagai selisih satu rupiah
 * antara subtotal, total disiplin, dan grand total pada dokumen yang sama.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Satu nilai uang → number. Menerima string DECIMAL, number, null, undefined. */
export const uang = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Bulatkan ke 2 desimal, menghindari hasil seperti 1234.5600000000001. */
export const bulatUang = (v: unknown): number => Math.round(uang(v) * 100) / 100;

/**
 * Penjumlah uang yang aman dipakai berulang. Akumulasinya bilangan bulat sen,
 * jadi hasilnya tidak bergantung pada urutan penambahan.
 */
export class PenjumlahUang {
  private sen = 0;

  tambah(v: unknown): this {
    this.sen += Math.round(uang(v) * 100);
    return this;
  }

  get nilai(): number {
    return this.sen / 100;
  }
}

/** Jumlahkan sederet nilai uang sekaligus. */
export const jumlahUang = (values: unknown[]): number => {
  const p = new PenjumlahUang();
  for (const v of values) p.tambah(v);
  return p.nilai;
};
