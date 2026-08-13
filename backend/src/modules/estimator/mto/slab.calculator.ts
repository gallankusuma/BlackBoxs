import { MtoResult, line, num, STEEL_DENSITY } from './types';
import { plateKgPerM2, profileWeight } from './profiles';
import { meters, resolveVariant } from './contract';

/**
 * Lantai / pelat (EST-MTO-008, EST-MTO-009).
 *
 * Backend lama hanya mengenal pelat beton, padahal frontend sudah menyediakan
 * keramik, plat bordes, dan parket. Akibatnya lantai keramik pun dihitung
 * sebagai beton bertulang.
 *
 * Berat plat bordes memakai kg/m2 × luas — bukan tebal dianggap berat.
 */
export function calcSlab(p: any): MtoResult {
  const notes: string[] = [];
  const resolved = resolveVariant('slab', p.slab_type, 'concrete');
  const slabType = resolved.variant;
  if (resolved.note) notes.push(resolved.note);
  if (slabType === 'unknown') {
    return { element_type: 'slab', variant: 'invalid', lines: [], notes };
  }
  const waste = num(p.waste_pct, 5);
  const area = num(p.area);
  const lines = [];

  if (slabType === 'ceramic') {
    // Layar meminta cm: screed 3 cm pernah terbaca 3 m — 100× lipat.
    const screedT = meters(p, 'screed_t', 0.03);
    lines.push(line('SLB-SCREED', 'Screed', area * screedT, 'm3', waste));
    lines.push(line('SLB-TILE', `Keramik ${p.tile_size || '60x60'}`, area, 'm2', num(p.waste_pct, 8)));
    lines.push(line('SLB-ADHESIVE', 'Perekat Keramik', area, 'm2', waste, 2));
    lines.push(line('SLB-GROUT', 'Nat Keramik', area, 'm2', waste, 2));
    notes.push('Lantai keramik: tidak menghasilkan beton struktural maupun pembesian.');
  } else if (slabType === 'plate') {
    const thick = num(p.plate_thick, 5);
    const kgm2 = plateKgPerM2(thick);
    lines.push(line('SLB-PLATE', `Plat Bordes ${thick}mm (${kgm2} kg/m2)`, kgm2 * area, 'kg', waste, 1));

    const frameLen = num(p.frame_length, 0);
    if (frameLen > 0) {
      const profile = String(p.frame_profile || 'UNP100');
      const wpm = profileWeight(profile, 9.36);
      lines.push(line('SLB-FRAME', `Rangka ${profile} (${wpm} kg/m)`, wpm * frameLen, 'kg', waste, 1));
    }
    const weldLen = num(p.weld_length, 0);
    if (weldLen > 0) lines.push(line('SLB-WELD', 'Pengelasan', weldLen, 'm', 0, 1));
    notes.push('Plat bordes: tidak menghasilkan beton maupun pembesian.');
  } else if (slabType === 'parquet') {
    const levelT = meters(p, 'screed_t', 0.03);
    lines.push(line('SLB-LEVEL', 'Leveling', area * levelT, 'm3', waste));
    lines.push(line('SLB-FLOOR', `Lantai ${p.parquet_type || 'Parket'}`, area, 'm2', num(p.waste_pct, 8), 2));
    lines.push(line('SLB-ADHESIVE', 'Perekat', area, 'm2', waste, 2));
    notes.push('Parket/vinyl: tidak menghasilkan beton maupun pembesian.');
  } else {
    const cutDepth = num(p.cut_depth, 0);
    if (cutDepth > 0) lines.push(line('SLB-EXCV', 'Galian/Cut', area * cutDepth, 'm3', 0));

    const subbaseT = num(p.subbase_t, 0);
    if (subbaseT > 0) lines.push(line('SLB-SUBBASE', 'Urugan Sirtu', area * subbaseT, 'm3', waste));

    const leanT = num(p.lean_t, 0);
    if (leanT > 0) lines.push(line('SLB-LEAN', 'Lantai Kerja', area * leanT, 'm3', waste));

    const thickness = num(p.thickness, 0.12);
    lines.push(line('SLB-CONC', 'Beton Pelat', area * thickness, 'm3', waste));
    lines.push(line('SLB-FORM', 'Bekisting Pelat', area, 'm2', waste));

    // Pembesian dua arah
    const diaX = num(p.rebar_dia_x, 10) / 1000;
    const diaY = num(p.rebar_dia_y, num(p.rebar_dia_x, 10)) / 1000;
    const spX = num(p.spacing_x, 0.15) || 0.15;
    const spY = num(p.spacing_y, spX) || spX;
    const aX = Math.PI * (diaX / 2) ** 2, aY = Math.PI * (diaY / 2) ** 2;
    const rebar = ((area / spX) * aX + (area / spY) * aY) * STEEL_DENSITY;
    lines.push(line('SLB-REBAR', `Besi Pelat D${num(p.rebar_dia_x, 10)}`, rebar, 'kg', waste, 1));

    if (p.finishing) lines.push(line('SLB-FINISH', `Finishing ${p.finishing}`, area, 'm2', waste, 2));
  }

  return { element_type: 'slab', variant: slabType, lines, notes };
}
