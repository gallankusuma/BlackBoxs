import { MtoResult, line, num } from './types';
import { plateKgPerM2 } from './profiles';

/**
 * Dinding (EST-MTO-010, EST-MTO-011).
 *
 * Dua masalah yang diperbaiki:
 *
 * 1. Kontrak parameter berbeda antara frontend (`thickness_cm`, `opening_pct`,
 *    `wall_type`) dan backend (`thickness_mm`, `has_plaster`). Keduanya kini
 *    diterima dan dinormalisasi ke satu model.
 * 2. Luas kotor dipakai sebagai kuantitas material. Pintu dan jendela harus
 *    dikurangi dulu — memplester bidang yang berlubang tetap dihitung penuh
 *    membuat penawaran kemahalan.
 *
 * Cladding (zincalume) dan kaca tidak lagi otomatis menghasilkan plesteran,
 * acian, dan volume pasangan.
 */
export function calcWall(p: any): MtoResult {
  const notes: string[] = [];
  const wallType = String(p.wall_type || 'bata').toLowerCase();
  const waste = num(p.waste_pct, 5);

  const grossArea = num(p.area);

  // Bukaan: pakai hitungan pintu/jendela kalau ada, kalau tidak pakai persentase
  const doorArea = num(p.door_qty) * num(p.door_w) * num(p.door_h);
  const windowArea = num(p.window_qty) * num(p.window_w) * num(p.window_h);
  let openingArea = doorArea + windowArea;
  if (openingArea === 0 && num(p.opening_pct) > 0) {
    openingArea = grossArea * num(p.opening_pct) / 100;
  }
  const netArea = Math.max(grossArea - openingArea, 0);
  if (openingArea > 0) {
    notes.push(`Luas bukaan ${openingArea.toFixed(2)} m2 dikurangkan dari ${grossArea.toFixed(2)} m2.`);
  }

  // thickness_cm (frontend) maupun thickness_mm (backend lama) sama-sama diterima
  const thicknessM = num(p.thickness_cm) ? num(p.thickness_cm) / 100
    : num(p.thickness_mm) ? num(p.thickness_mm) / 1000
      : 0.15;

  const lines = [];

  if (wallType === 'zincalume' || wallType === 'cladding') {
    const eff = num(p.zinc_eff_w, 1) || 1;
    lines.push(line('WAL-CLAD', 'Cladding Zincalume', netArea, 'm2', waste, 2));
    lines.push(line('WAL-CLAD-SHEET', 'Lembar Cladding', netArea / eff, 'lbr', waste, 0));
    notes.push('Cladding: tidak menghasilkan plesteran, acian, maupun volume pasangan.');
  } else if (wallType === 'glass' || wallType === 'kaca') {
    lines.push(line('WAL-GLASS', `Kaca ${num(p.glass_thick, 8)}mm`, netArea, 'm2', waste, 2));
    if (p.glass_frame) lines.push(line('WAL-FRAME', 'Rangka Kaca', num(p.glass_frame), 'm', waste, 1));
    notes.push('Dinding kaca: tidak menghasilkan plesteran maupun acian.');
  } else if (wallType === 'grc') {
    lines.push(line('WAL-GRC', 'Papan GRC', netArea, 'm2', waste, 2));
    lines.push(line('WAL-GRC-FRAME', 'Rangka Hollow', netArea * num(p.frame_per_m2, 3), 'm', waste, 1));
    notes.push('GRC: tidak menghasilkan plesteran maupun volume pasangan.');
  } else {
    // Bata merah / hebel
    lines.push(line('WAL-AREA', 'Pasangan Dinding', netArea, 'm2', waste, 2));
    lines.push(line('WAL-VOL', 'Volume Pasangan', netArea * thicknessM, 'm3', waste));
    lines.push(line('WAL-PLASTER', 'Plesteran (2 sisi)', netArea * 2, 'm2', waste, 2));
    lines.push(line('WAL-ACIAN', 'Acian (2 sisi)', netArea * 2, 'm2', waste, 2));
    if (p.finishing) lines.push(line('WAL-FINISH', `Finishing ${p.finishing}`, netArea * 2, 'm2', waste, 2));
  }

  return { element_type: 'wall', variant: wallType, lines, notes };
}
