import { MtoResult, line, num, STEEL_DENSITY } from './types';
import { profileWeight } from './profiles';
import { resolveVariant } from './contract';

/**
 * Atap (EST-MTO-012).
 *
 * Versi lama menurunkan keliling bangunan dari `sqrt(floor_area)` — itu hanya
 * benar kalau denahnya persegi sempurna. Frontend sudah menyediakan `perimeter`
 * hasil input, jadi angka itulah yang dipakai. `sqrt` hanya dipakai sebagai
 * cadangan kalau perimeter memang tidak diisi, dan itu dicatat sebagai asumsi.
 */
export function calcRoof(p: any): MtoResult {
  const notes: string[] = [];
  const resolved = resolveVariant('roof', p.roof_type, 'sheet');
  const roofType = resolved.variant;
  if (resolved.note) notes.push(resolved.note);
  if (roofType === 'unknown') {
    return { element_type: 'roof', variant: 'invalid', lines: [], notes };
  }
  const waste = num(p.waste_pct, 5);

  const floorArea = num(p.floor_area);
  const slopeDeg = num(p.slope_deg, 30);
  const overhang = num(p.overhang, 0.6);

  let perimeter = num(p.perimeter);
  if (!perimeter) {
    perimeter = 4 * Math.sqrt(Math.max(floorArea, 0));
    notes.push('Keliling bangunan tidak diisi — diperkirakan dari akar luas lantai (asumsi denah persegi).');
  }

  const slopeFactor = 1 / Math.cos(slopeDeg * Math.PI / 180);
  const coveredArea = floorArea + perimeter * overhang;
  const netRoofArea = coveredArea * slopeFactor;

  const lines = [];
  lines.push(line('RF-AREA', 'Luas Bidang Atap', netRoofArea, 'm2', waste, 2));

  if (roofType === 'deck') {
    const t = num(p.dak_thick, 0.12);
    lines.push(line('RF-CONC', 'Beton Dak', floorArea * t, 'm3', waste));
    lines.push(line('RF-FORM', 'Bekisting Dak', floorArea, 'm2', waste, 2));

    // EST-MTO-R12: dak beton sebelumnya hanya menghasilkan beton dan bekisting,
    // tanpa pembesian sama sekali. Layar atap belum meminta diameter dan jarak
    // tulangan, jadi dipakai asumsi lazim — dan asumsinya dicatat, tidak
    // disembunyikan di dalam angka.
    const dia = num(p.dak_rebar_dia, 10) / 1000;
    const spacing = num(p.dak_rebar_spacing, 0.15) || 0.15;
    const area = Math.PI * (dia / 2) ** 2;
    const rebarKg = (floorArea / spacing) * 2 * area * STEEL_DENSITY;
    lines.push(line('RF-REBAR', `Besi Dak D${num(p.dak_rebar_dia, 10)}`, rebarKg, 'kg', waste, 1));
    if (!p.dak_rebar_dia) {
      notes.push(`Pembesian dak memakai asumsi D${num(p.dak_rebar_dia, 10)} jarak ${spacing} m dua arah — sesuaikan bila berbeda.`);
    }
    notes.push('Atap dak: tidak menghasilkan gording maupun penutup atap lembaran.');
  } else {
    if (roofType === 'tile') {
      lines.push(line('RF-TILE', `Genteng ${p.genteng_type || 'Beton'}`, netRoofArea, 'm2', num(p.waste_pct, 8), 2));
    } else {
      // EST-MTO-R09: `luas / lebar_efektif` menghasilkan METER-LARI, bukan
      // lembar. Menyebutnya "lbr" membuat angka itu terlihat siap dipesan
      // padahal bukan. Jumlah lembar hanya dihitung kalau panjang sheet diketahui.
      const eff = num(p.sheet_eff_w, 1) || 1;
      const sheetLen = num(p.sheet_len, 0);
      lines.push(line('RF-SHEET', `Penutup ${p.cladding_type || 'Metal'}`, netRoofArea, 'm2', waste, 2));
      if (sheetLen > 0) {
        lines.push(line('RF-SHEET-QTY', `Lembar Penutup (${eff}m × ${sheetLen}m)`,
          Math.ceil(netRoofArea / (eff * sheetLen)), 'lbr', waste, 0));
      } else {
        notes.push('Panjang sheet penutup belum diisi, jadi jumlah lembar tidak dihitung — pakai luas m² untuk sementara.');
      }
    }

    const spacing = num(p.purlin_spacing, 1.2) || 1.2;
    const purlinLength = netRoofArea / spacing;
    const purlinProfile = String(p.purlin_profile || 'CNP150x65x20x2.3');
    const wpm = profileWeight(purlinProfile, 5.5);
    lines.push(line('RF-PURLIN', `Gording ${purlinProfile} (${wpm} kg/m)`,
      wpm * purlinLength, 'kg', waste, 1));
  }

  // EST-MTO-R05: `cladding_h` diinput di layar atap tapi tidak pernah dipakai,
  // jadi cladding samping (gable/dinding sopi-sopi) hilang dari MTO. Luasnya
  // diturunkan dari keliling bangunan × tinggi cladding.
  const claddingH = num(p.cladding_h, 0);
  if (claddingH > 0) {
    lines.push(line('RF-SIDE-CLAD', `Cladding Samping ${p.cladding_type || ''}`.trim(),
      perimeter * claddingH, 'm2', waste, 2));
  }

  const ridge = num(p.ridge_length, 0);
  if (ridge > 0) lines.push(line('RF-RIDGE', 'Nok/Bubungan', ridge, 'm', waste, 1));

  const gutter = num(p.gutter_length, perimeter);
  if (gutter > 0) lines.push(line('RF-GUTTER', 'Talang', gutter, 'm', waste, 1));

  const downspout = num(p.downspout_qty, 0);
  if (downspout > 0) lines.push(line('RF-DOWNSPOUT', 'Pipa Turun', downspout, 'bh', 0, 0));

  return { element_type: 'roof', variant: roofType, lines, notes };
}
