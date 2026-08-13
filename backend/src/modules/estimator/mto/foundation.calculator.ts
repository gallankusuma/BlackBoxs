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

  // EST-MTO-R01: tipe pondasi selain footplate BELUM punya formula sendiri.
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
  if (resolved.variant !== 'footplate') {
    notes.push(
      `Pondasi tipe "${resolved.raw}" belum didukung kalkulator — formulanya berbeda `
      + `dari footplate (kedalaman bor, volume beton per titik, casing, dan sebagainya). `
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

  // Tie beam / sloof — hanya kalau memang diinput
  const tbLen = num(p.tb_length), tbW = num(p.tb_w), tbH = num(p.tb_h);
  if (tbLen > 0 && tbW > 0 && tbH > 0) {
    lines.push(line('TB-CONC', 'Beton Tie Beam', tbW * tbH * tbLen, 'm3', waste));
    lines.push(line('TB-FORM', 'Bekisting Tie Beam', 2 * tbH * tbLen, 'm2', waste));

    const tbMainDia = num(p.tb_rebar_main, 13) / 1000;
    const tbMainArea = Math.PI * (tbMainDia / 2) ** 2;
    const tbBars = num(p.tb_rebar_count, 4);
    lines.push(line('TB-REBAR', `Besi Utama Tie Beam D${num(p.tb_rebar_main, 13)}`,
      tbBars * tbLen * tbMainArea * STEEL_DENSITY, 'kg', waste, 1));

    const stDia = num(p.tb_stirrup, 8) / 1000;
    const stArea = Math.PI * (stDia / 2) ** 2;
    const stSpacing = num(p.stirrup_spacing, 0.15) || 0.15;
    const stCount = Math.floor(tbLen / stSpacing) + 1;
    const stLen = 2 * ((tbW - 2 * cover) + (tbH - 2 * cover));
    lines.push(line('TB-STIRRUP', `Sengkang Tie Beam D${num(p.tb_stirrup, 8)}`,
      stCount * stLen * stArea * STEEL_DENSITY, 'kg', waste, 1));
  }

  return { element_type: 'foundation', variant: 'footplate', lines, notes };
}
