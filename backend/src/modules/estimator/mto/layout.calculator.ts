import { num } from './types';
import { meters } from './contract';

/**
 * General Layout (EST-MTO-LAYOUT-01).
 *
 * Mendefinisikan kerangka bangunan — panjang, lebar, tinggi, dan jarak antar
 * kolom — lalu MENURUNKAN angka yang selama ini diketik manual: jumlah kolom,
 * jumlah bentang balok, luas lantai, luas dinding, luas atap.
 *
 * Ini BUKAN elemen MTO. Ia tidak menghasilkan kuantitas material sendiri, dan
 * memasukkannya sebagai elemen ke-7 akan memunculkan baris tanpa material di
 * daftar take-off. Ia kerangka yang darinya elemen-elemen itu nanti dibuat.
 *
 * Tiga hal yang harus dijaga, dan ketiganya soal kejujuran angka:
 *
 * 1. **Jarak kolom yang diisi adalah TARGET, bukan hasil.** Bangunan 20 m
 *    dengan target 6 m tidak menghasilkan bentang 6-6-6-2 — insinyur membaginya
 *    rata jadi 4 bentang @ 5 m. Karena itu jarak aktual dihitung ulang, dan
 *    kalau ia berbeda dari target, selisihnya DISEBUTKAN. Menampilkan target
 *    seolah-olah itu yang terpasang membuat orang memesan kolom di posisi yang
 *    salah.
 * 2. **Luas dinding adalah LUAS KOTOR.** Bukaan pintu dan jendela belum
 *    dikurangi — angkanya di sini tidak tahu apa-apa soal bukaan. Disebut di
 *    catatan supaya tidak dikira sudah bersih.
 * 3. **Luas atap adalah PROYEKSI DATAR.** Atap miring lebih luas dari denahnya;
 *    tanpa kemiringan, mengalikannya dengan faktor apa pun cuma menebak.
 */

export type LayoutInput = {
  panjang?: any; lebar?: any; tinggi?: any;
  jarak_kolom_x?: any; jarak_kolom_y?: any;
  jumlah_lantai?: any;
};

export type LayoutResult = {
  ok: boolean;
  /** Kolom yang membuat perhitungan tidak bisa dilakukan sama sekali. */
  kurang: string[];
  dimensi: { panjang: number; lebar: number; tinggi: number; jumlah_lantai: number };
  grid: {
    bentang_x: number; bentang_y: number;
    jarak_target_x: number; jarak_target_y: number;
    jarak_aktual_x: number; jarak_aktual_y: number;
    garis_kolom_x: number; garis_kolom_y: number;
    jumlah_kolom_per_lantai: number;
    jumlah_kolom: number;
  };
  balok: {
    jumlah_arah_x: number; jumlah_arah_y: number; jumlah_total: number;
    panjang_arah_x: number; panjang_arah_y: number; panjang_total: number;
  };
  luas: {
    lantai_per_lantai: number; lantai_total: number;
    keliling: number; dinding_kotor: number; atap_proyeksi: number;
  };
  catatan: string[];
};

const bulat = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function hitungLayout(p: LayoutInput): LayoutResult {
  const catatan: string[] = [];
  const kurang: string[] = [];

  // `meters(params, field)` menerima OBJEK parameternya, bukan nilainya —
  // ia yang tahu field mana diisi cm/mm di UI. Seluruh field layout memang
  // dalam meter, tapi dilewatkan lewat helper yang sama supaya kalau nanti
  // ada field layout bersatuan lain, konversinya tetap di satu tempat.
  const panjang = meters(p, 'panjang');
  const lebar = meters(p, 'lebar');
  const tinggi = meters(p, 'tinggi');
  const jarakX = meters(p, 'jarak_kolom_x');
  const jarakY = meters(p, 'jarak_kolom_y');
  const lantai = Math.max(1, Math.floor(num(p.jumlah_lantai, 1) || 1));

  for (const [nilai, nama] of [[panjang, 'panjang'], [lebar, 'lebar'], [tinggi, 'tinggi'],
                               [jarakX, 'jarak_kolom_x'], [jarakY, 'jarak_kolom_y']] as [number, string][]) {
    if (!(nilai > 0)) kurang.push(nama);
  }

  const kosong: LayoutResult = {
    ok: false, kurang,
    dimensi: { panjang, lebar, tinggi, jumlah_lantai: lantai },
    grid: { bentang_x: 0, bentang_y: 0, jarak_target_x: jarakX, jarak_target_y: jarakY,
            jarak_aktual_x: 0, jarak_aktual_y: 0, garis_kolom_x: 0, garis_kolom_y: 0,
            jumlah_kolom_per_lantai: 0, jumlah_kolom: 0 },
    balok: { jumlah_arah_x: 0, jumlah_arah_y: 0, jumlah_total: 0,
             panjang_arah_x: 0, panjang_arah_y: 0, panjang_total: 0 },
    luas: { lantai_per_lantai: 0, lantai_total: 0, keliling: 0, dinding_kotor: 0, atap_proyeksi: 0 },
    catatan,
  };
  if (kurang.length) {
    catatan.push(`Belum bisa dihitung — ${kurang.join(', ')} harus diisi lebih dulu.`);
    return kosong;
  }

  // Jarak yang diisi adalah TARGET. Bentang dibagi rata, lalu jarak aktualnya
  // diturunkan — itu yang benar-benar terpasang di lapangan.
  const bentangX = Math.max(1, Math.round(panjang / jarakX));
  const bentangY = Math.max(1, Math.round(lebar / jarakY));
  const aktualX = bulat(panjang / bentangX, 3);
  const aktualY = bulat(lebar / bentangY, 3);

  const garisX = bentangX + 1;
  const garisY = bentangY + 1;
  const kolomPerLantai = garisX * garisY;

  // Balok menghubungkan garis kolom. Arah X: tiap garis Y punya `bentangX`
  // balok; arah Y sebaliknya.
  const balokX = garisY * bentangX;
  const balokY = garisX * bentangY;
  const panjangBalokX = bulat(garisY * panjang, 3);
  const panjangBalokY = bulat(garisX * lebar, 3);

  const luasLantai = bulat(panjang * lebar, 3);
  const keliling = bulat(2 * (panjang + lebar), 3);

  if (Math.abs(aktualX - jarakX) > 0.005) {
    catatan.push(`Arah panjang: ${panjang} m dibagi ${bentangX} bentang → jarak aktual ${aktualX} m (target ${jarakX} m).`);
  }
  if (Math.abs(aktualY - jarakY) > 0.005) {
    catatan.push(`Arah lebar: ${lebar} m dibagi ${bentangY} bentang → jarak aktual ${aktualY} m (target ${jarakY} m).`);
  }
  catatan.push('Luas dinding adalah luas KOTOR — bukaan pintu dan jendela belum dikurangi.');
  catatan.push('Luas atap adalah proyeksi datar; atap miring lebih luas dan butuh sudut kemiringannya.');
  if (lantai > 1) {
    catatan.push(`Tinggi ${tinggi} m dipakai sebagai tinggi PER LANTAI, bukan tinggi total bangunan.`);
  }

  return {
    ok: true, kurang: [],
    dimensi: { panjang, lebar, tinggi, jumlah_lantai: lantai },
    grid: {
      bentang_x: bentangX, bentang_y: bentangY,
      jarak_target_x: jarakX, jarak_target_y: jarakY,
      jarak_aktual_x: aktualX, jarak_aktual_y: aktualY,
      garis_kolom_x: garisX, garis_kolom_y: garisY,
      jumlah_kolom_per_lantai: kolomPerLantai,
      jumlah_kolom: kolomPerLantai * lantai,
    },
    balok: {
      jumlah_arah_x: balokX * lantai, jumlah_arah_y: balokY * lantai,
      jumlah_total: (balokX + balokY) * lantai,
      panjang_arah_x: bulat(panjangBalokX * lantai, 3),
      panjang_arah_y: bulat(panjangBalokY * lantai, 3),
      panjang_total: bulat((panjangBalokX + panjangBalokY) * lantai, 3),
    },
    luas: {
      lantai_per_lantai: luasLantai,
      lantai_total: bulat(luasLantai * lantai, 3),
      keliling,
      dinding_kotor: bulat(keliling * tinggi * lantai, 3),
      atap_proyeksi: luasLantai,
    },
    catatan,
  };
}

/**
 * Field General Layout sebagai DATA.
 *
 * Sama alasannya dengan `spesifikasiField()` untuk elemen: layar membangun
 * formulirnya dari sini, jadi field baru otomatis muncul dan tidak ada daftar
 * kedua di frontend yang bisa melenceng.
 */
export const spesifikasiLayout = () => ([
  { field: 'panjang', label: 'Panjang bangunan (m)', wajib: true, jenis: 'angka' as const },
  { field: 'lebar', label: 'Lebar bangunan (m)', wajib: true, jenis: 'angka' as const },
  { field: 'tinggi', label: 'Tinggi per lantai (m)', wajib: true, jenis: 'angka' as const },
  { field: 'jarak_kolom_x', label: 'Jarak kolom arah panjang (m)', wajib: true, jenis: 'angka' as const },
  { field: 'jarak_kolom_y', label: 'Jarak kolom arah lebar (m)', wajib: true, jenis: 'angka' as const },
  { field: 'jumlah_lantai', label: 'Jumlah lantai', wajib: false, jenis: 'angka' as const },
]);
