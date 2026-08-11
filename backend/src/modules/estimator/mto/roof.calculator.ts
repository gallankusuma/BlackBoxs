import { MtoResult, line, num } from './types';
import { profileWeight } from './profiles';

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
  const roofType = String(p.roof_type || 'genteng').toLowerCase();
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

  if (roofType === 'dak' || roofType === 'concrete') {
    const t = num(p.dak_thick, 0.12);
    lines.push(line('RF-CONC', 'Beton Dak', floorArea * t, 'm3', waste));
    lines.push(line('RF-FORM', 'Bekisting Dak', floorArea, 'm2', waste, 2));
    notes.push('Atap dak: tidak menghasilkan gording maupun penutup atap lembaran.');
  } else {
    if (roofType === 'genteng' || roofType === 'tile') {
      lines.push(line('RF-TILE', `Genteng ${p.genteng_type || 'Beton'}`, netRoofArea, 'm2', num(p.waste_pct, 8), 2));
    } else {
      const eff = num(p.sheet_eff_w, 1) || 1;
      lines.push(line('RF-SHEET', `Penutup ${p.cladding_type || 'Metal'}`, netRoofArea / eff, 'lbr', waste, 0));
    }

    const spacing = num(p.purlin_spacing, 1.2) || 1.2;
    const purlinLength = netRoofArea / spacing;
    const purlinProfile = String(p.purlin_profile || 'C150x65');
    const wpm = profileWeight(purlinProfile, 6.76);
    lines.push(line('RF-PURLIN', `Gording ${purlinProfile} (${wpm} kg/m)`,
      wpm * purlinLength, 'kg', waste, 1));
  }

  const ridge = num(p.ridge_length, 0);
  if (ridge > 0) lines.push(line('RF-RIDGE', 'Nok/Bubungan', ridge, 'm', waste, 1));

  const gutter = num(p.gutter_length, perimeter);
  if (gutter > 0) lines.push(line('RF-GUTTER', 'Talang', gutter, 'm', waste, 1));

  const downspout = num(p.downspout_qty, 0);
  if (downspout > 0) lines.push(line('RF-DOWNSPOUT', 'Pipa Turun', downspout, 'bh', 0, 0));

  return { element_type: 'roof', variant: roofType, lines, notes };
}
