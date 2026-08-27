import { MtoResult, line, num, STEEL_DENSITY } from './types';
import { resolveVariant } from './contract';

/**
 * Pondasi (EST-MTO-002, EST-MTO-003).
 *
 * Dua perbaikan penting dibanding versi lama:
 *
 * 1. Kedalaman galian memakai `depth`, BUKAN `H` (tebal footing). Versi lama
 *    memakai H, sehingga galian pondasi setebal 20 cm dihitung sedalam 20 cm
 *    juga — padahal galiannya bisa 1,2 m. Volume tanah dan buangan jadi jauh
 *    di bawah kenyataan.
 * 2. Keluarannya dipecah per pekerjaan (galian, urugan, lantai kerja, beton,
 *    bekisting, besi) dan tie beam dipisah dari footing. Sebelumnya seluruh besi
 *    digabung jadi satu angka meski diameternya berbeda, sehingga tidak bisa
 *    dipetakan ke harga satuan yang benar.
 */
export function calcFoundation(p: any): MtoResult {
  const notes: string[] = [];

  // EST-MTO-R01 / R54: footplate, pile cap, dan bored pile punya formulanya
  // masing-masing. Tipe pancang (precast/mini pile) masih belum.
  //
  // Sebelumnya `foundation_type` diabaikan sepenuhnya, jadi bored pile dan
  // mini pile tetap menghasilkan galian, footing, dan bekisting seperti
  // footplate — angka yang sama sekali tidak berhubungan dengan pekerjaannya,
  // tapi terlihat wajar sehingga bisa lolos ke penawaran.
  //
  // Sampai formulanya ada, lebih baik TIDAK mengeluarkan angka daripada
  // mengeluarkan angka yang salah.
  const resolved = resolveVariant('foundation', p.foundation_type, 'footplate');
  if (resolved.note) notes.push(resolved.note);
  if (resolved.variant === 'unknown') {
    return { element_type: 'foundation', variant: 'invalid', lines: [], notes };
  }
  if (resolved.variant === 'pile_cap') return calcPileCap(p, notes);
  if (resolved.variant === 'bored_pile') return calcBoredPile(p, notes);

  if (resolved.variant !== 'footplate') {
    // `precast_pile` dan `mini_pile` masih belum punya formula. Tetap TIDAK
    // mengeluarkan angka: tiang pancang dipancang bukan dibor, dan memakai
    // formula bored pile untuknya akan menghasilkan pengeboran serta buangan
    // tanah yang tidak pernah ada.
    notes.push(
      `Pondasi tipe "${resolved.raw}" belum didukung kalkulator — formulanya berbeda `
      + `dari footplate, pile cap, maupun bored pile. `
      + `Kuantitas tidak dihitung; isikan manual di RAB sampai formulanya tersedia.`
    );
    return { element_type: 'foundation', variant: resolved.variant, lines: [], notes };
  }

  const L = num(p.L), W = num(p.W), H = num(p.H);
  const qty = num(p.qty, 1) || 1;
  const ws = num(p.working_space, 0.3);
  const waste = num(p.waste_pct, 5);

  let depth = num(p.depth);
  if (!depth) {
    depth = H;
    notes.push('Kedalaman galian tidak diisi — memakai tebal footing sebagai perkiraan. Isi "depth" untuk hasil yang benar.');
  }

  const lines = [];

  // Galian: dimensi footing + ruang kerja di kedua sisi, sedalam `depth`
  const excav = (L + 2 * ws) * (W + 2 * ws) * depth * qty;
  lines.push(line('FND-EXCV', 'Galian Tanah Pondasi', excav, 'm3', 0));

  const leanT = num(p.lean_t, 0.05);
  const leanVol = (L + 2 * ws) * (W + 2 * ws) * leanT * qty;
  lines.push(line('FND-LEAN', 'Lantai Kerja', leanVol, 'm3', waste));

  const footingVol = L * W * H * qty;
  lines.push(line('FND-CONC', 'Beton Footing', footingVol, 'm3', waste));

  // Urugan kembali = galian dikurangi yang terisi beton & lantai kerja
  const backfill = Math.max(excav - footingVol - leanVol, 0);
  lines.push(line('FND-BACKFILL', 'Urugan Kembali', backfill, 'm3', 0));

  lines.push(line('FND-FORM', 'Bekisting Footing', 2 * (L + W) * H * qty, 'm2', waste));

  // Besi footing — dua arah, jarak tetap 15 cm
  const cover = num(p.cover, 0.04);
  const mainDia = num(p.rebar_main, 16) / 1000;
  const mainArea = Math.PI * (mainDia / 2) ** 2;
  const eL = Math.max(L - 2 * cover, 0), eW = Math.max(W - 2 * cover, 0);
  const spacing = num(p.rebar_spacing, 0.15) || 0.15;
  const nX = Math.floor(eW / spacing) + 1, nY = Math.floor(eL / spacing) + 1;
  const footingRebar = (nX * eL + nY * eW) * mainArea * STEEL_DENSITY * qty;
  lines.push(line('FND-REBAR', `Besi Footing D${num(p.rebar_main, 16)}`, footingRebar, 'kg', waste, 1));

  lines.push(...barisTieBeam(p, cover, waste));

  return { element_type: 'foundation', variant: 'footplate', lines, notes };
}

/**
 * Tie beam / sloof — dipakai footplate MAUPUN pile cap.
 *
 * Diangkat jadi helper saat pile cap ditambahkan (EST-MTO-R54). Menyalinnya
 * berarti dua tempat menghitung sloof yang sama, dan perbaikan di satu tempat
 * tidak akan sampai ke tempat lain.
 *
 * Hanya keluar kalau ketiga dimensinya benar-benar diisi: sloof yang tidak
 * diinput bukan sloof berukuran nol, melainkan sloof yang memang tidak ada di
 * lingkup ini.
 */
function barisTieBeam(p: any, cover: number, waste: number) {
  const tbLen = num(p.tb_length), tbW = num(p.tb_w), tbH = num(p.tb_h);
  if (!(tbLen > 0 && tbW > 0 && tbH > 0)) return [];

  const hasil = [
    line('TB-CONC', 'Beton Tie Beam', tbW * tbH * tbLen, 'm3', waste),
    line('TB-FORM', 'Bekisting Tie Beam', 2 * tbH * tbLen, 'm2', waste),
  ];

  const tbMainDia = num(p.tb_rebar_main, 13) / 1000;
  const tbMainArea = Math.PI * (tbMainDia / 2) ** 2;
  const tbBars = num(p.tb_rebar_count, 4);
  hasil.push(line('TB-REBAR', `Besi Utama Tie Beam D${num(p.tb_rebar_main, 13)}`,
    tbBars * tbLen * tbMainArea * STEEL_DENSITY, 'kg', waste, 1));

  const stDia = num(p.tb_stirrup, 8) / 1000;
  const stArea = Math.PI * (stDia / 2) ** 2;
  const stSpacing = num(p.stirrup_spacing, 0.15) || 0.15;
  const stCount = Math.floor(tbLen / stSpacing) + 1;
  const stLen = 2 * ((tbW - 2 * cover) + (tbH - 2 * cover));
  hasil.push(line('TB-STIRRUP', `Sengkang Tie Beam D${num(p.tb_stirrup, 8)}`,
    stCount * stLen * stArea * STEEL_DENSITY, 'kg', waste, 1));

  return hasil;
}

/**
 * EST-MTO-R54: PILE CAP (poer) — beton penutup di atas kelompok tiang.
 *
 * Pekerjaannya menyerupai footplate, tapi menyamakan keduanya menghasilkan besi
 * yang salah: **pile cap bertulang dua lapis** (atas dan bawah), sementara
 * footplate umumnya satu lapis di bawah. Selisihnya kira-kira dua kali lipat
 * berat besi, pada elemen yang besinya justru paling berat.
 *
 * Yang juga berbeda: galian pile cap dihitung dari kedalaman pile cap itu
 * sendiri, dan urugan kembali TIDAK dikurangi volume tiang — tiangnya sudah
 * ada di dalam tanah sebelum galian dimulai, jadi tidak menambah ruang yang
 * perlu diurug.
 */
function calcPileCap(p: any, notes: string[]): MtoResult {
  const L = num(p.L), W = num(p.W), H = num(p.H);
  const qty = num(p.qty, 1) || 1;
  const ws = num(p.working_space, 0.3);
  const waste = num(p.waste_pct, 5);
  const cover = num(p.cover, 0.05);

  let depth = num(p.depth);
  if (!depth) {
    depth = H;
    notes.push('Kedalaman galian tidak diisi — memakai tebal pile cap sebagai perkiraan. Isi "depth" untuk hasil yang benar.');
  }

  const lines = [];

  const excav = (L + 2 * ws) * (W + 2 * ws) * depth * qty;
  lines.push(line('PC-EXCV', 'Galian Tanah Pile Cap', excav, 'm3', 0));

  const leanT = num(p.lean_t, 0.05);
  const leanVol = (L + 2 * ws) * (W + 2 * ws) * leanT * qty;
  lines.push(line('PC-LEAN', 'Lantai Kerja Pile Cap', leanVol, 'm3', waste));

  const capVol = L * W * H * qty;
  lines.push(line('PC-CONC', 'Beton Pile Cap', capVol, 'm3', waste));

  lines.push(line('PC-BACKFILL', 'Urugan Kembali Pile Cap',
    Math.max(excav - capVol - leanVol, 0), 'm3', 0));

  lines.push(line('PC-FORM', 'Bekisting Pile Cap', 2 * (L + W) * H * qty, 'm2', waste));

  // Besi dua arah, DUA LAPIS — inilah bedanya dengan footplate.
  const layers = num(p.rebar_layers, 2) || 2;
  const mainDia = num(p.rebar_main, 16) / 1000;
  const mainArea = Math.PI * (mainDia / 2) ** 2;
  const eL = Math.max(L - 2 * cover, 0), eW = Math.max(W - 2 * cover, 0);
  const spacing = num(p.rebar_spacing, 0.15) || 0.15;
  const nX = Math.floor(eW / spacing) + 1, nY = Math.floor(eL / spacing) + 1;
  const rebar = (nX * eL + nY * eW) * layers * mainArea * STEEL_DENSITY * qty;
  lines.push(line('PC-REBAR', `Besi Pile Cap D${num(p.rebar_main, 16)} (${layers} lapis)`,
    rebar, 'kg', waste, 1));

  lines.push(...barisTieBeam(p, cover, waste));

  return { element_type: 'foundation', variant: 'pile_cap', lines, notes };
}

/**
 * EST-MTO-R54: BORED PILE — tiang bor di tempat.
 *
 * Pekerjaannya sama sekali berbeda dari pondasi telapak: tidak ada galian
 * terbuka, tidak ada bekisting, tidak ada urugan kembali. Yang ada pengeboran,
 * beton yang dicor ke dalam lubang, tulangan, pembuangan tanah bor, dan
 * pembobokan kepala tiang.
 *
 * Sebelum ini `bored_pile` memang tidak menghasilkan satu baris pun — dan itu
 * keputusan yang benar pada waktunya: mengeluarkan angka footplate untuk tiang
 * bor akan menghasilkan galian dan bekisting yang tidak pernah ada, dengan
 * angka yang terlihat wajar sehingga bisa lolos ke penawaran.
 *
 * Dua hal yang mudah salah dan sengaja dipisah barisnya:
 *
 * 1. **Beton dicor lebih panjang daripada tiang terpakai.** Beton diisi sampai
 *    di atas level potong lalu kepalanya dibobok — volume corannya karena itu
 *    `pile_length + head_cut`, bukan `pile_length` saja.
 * 2. **Tanah bor keluar sebanyak lubangnya**, dan itu pekerjaan angkut
 *    tersendiri — bukan bagian dari harga pengeboran.
 */
function calcBoredPile(p: any, notes: string[]): MtoResult {
  const dia = num(p.pile_dia);
  const panjang = num(p.pile_length);
  const qty = num(p.qty, 1) || 1;
  const waste = num(p.waste_pct, 5);

  const luas = Math.PI * (dia / 2) ** 2;
  const lines = [];

  // Pengeboran diukur per meter panjang tiang, bukan per m3.
  lines.push(line('BP-DRILL', `Pengeboran Tiang Ø${(dia * 1000).toFixed(0)} mm`,
    panjang * qty, 'm', 0));

  // Bobokan kepala tiang: beton dicor melebihi level potong lalu dibobok.
  const bobok = num(p.head_cut, 0.5);
  const betonVol = luas * (panjang + bobok) * qty;
  lines.push(line('BP-CONC', 'Beton Tiang Bor (termasuk over-pour)', betonVol, 'm3', waste));

  // Tanah bor keluar sebanyak lubangnya — pekerjaan angkut tersendiri.
  lines.push(line('BP-SPOIL', 'Buangan Tanah Bor', luas * panjang * qty, 'm3', 0));

  // Tulangan utama sepanjang tiang + panjang penyaluran ke pile cap.
  const jmlBesi = num(p.rebar_count, 8) || 8;
  const mainDia = num(p.rebar_main, 16) / 1000;
  const mainArea = Math.PI * (mainDia / 2) ** 2;
  const lap = num(p.rebar_lap, 0.8);
  lines.push(line('BP-REBAR', `Besi Utama Tiang D${num(p.rebar_main, 16)} (${jmlBesi} btg)`,
    jmlBesi * (panjang + lap) * mainArea * STEEL_DENSITY * qty, 'kg', waste, 1));

  // Spiral / sengkang melingkar.
  const spDia = num(p.spiral_dia, 10) / 1000;
  const spArea = Math.PI * (spDia / 2) ** 2;
  const spSpacing = num(p.spiral_spacing, 0.15) || 0.15;
  const cover = num(p.cover, 0.05);
  const kelilingSpiral = Math.PI * Math.max(dia - 2 * cover, 0);
  const jmlSpiral = Math.floor(panjang / spSpacing) + 1;
  lines.push(line('BP-SPIRAL', `Spiral Tiang D${num(p.spiral_dia, 10)}`,
    jmlSpiral * kelilingSpiral * spArea * STEEL_DENSITY * qty, 'kg', waste, 1));

  // Casing sementara hanya kalau memang dipakai — bukan default, karena tidak
  // semua kondisi tanah memerlukannya.
  const casing = num(p.casing_length);
  if (casing > 0) {
    lines.push(line('BP-CASING', 'Pemasangan Casing Sementara', casing * qty, 'm', 0));
  }

  lines.push(line('BP-HEADCUT', 'Bobok Kepala Tiang', luas * bobok * qty, 'm3', 0));

  return { element_type: 'foundation', variant: 'bored_pile', lines, notes };
}
