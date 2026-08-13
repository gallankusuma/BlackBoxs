import { MtoResult, line, num, STEEL_DENSITY } from './types';
import { profileWeight } from './profiles';
import { meters, resolveVariant } from './contract';

/**
 * Kolom (EST-MTO-005, EST-MTO-006).
 *
 * Bug yang diperbaiki: frontend mengalikan `floors` DUA KALI — sekali ke jumlah
 * kolom dan sekali lagi ke tingginya:
 *
 *     n = qty_per_floor * floors
 *     h = height_per_floor * floors      ← ini yang keliru
 *     volume = B * H * h * n             → mengandung floors²
 *
 * Untuk gedung 3 lantai, volumenya jadi 3× dari seharusnya, dan itu langsung
 * masuk ke harga penawaran. Tinggi yang benar tetap tinggi per lantai; hanya
 * jumlah kolomnya yang dikalikan jumlah lantai.
 *
 * Selain itu tipe kolom kini menentukan keluaran: kolom WF tidak boleh
 * menghasilkan volume beton dan besi tulangan.
 */
export function calcColumn(p: any): MtoResult {
  const notes: string[] = [];
  const resolved = resolveVariant('column', p.col_type, 'concrete');
  const colType = resolved.variant;
  if (resolved.note) notes.push(resolved.note);
  if (colType === 'unknown') {
    return { element_type: 'column', variant: resolved.raw, lines: [], notes };
  }
  const waste = num(p.waste_pct, 5);

  const floors = num(p.floors, 1) || 1;
  const qtyPerFloor = num(p.qty_per_floor, 1) || 1;
  const heightPerFloor = num(p.height_per_floor, 3);

  const totalColumns = qtyPerFloor * floors;
  const totalLength = heightPerFloor * totalColumns;

  const lines = [];

  if (colType === 'wf' || colType === 'steel') {
    const wpm = profileWeight(String(p.wf_profile || 'WF200x100'), 21.3);
    lines.push(line('COL-WF', `Profil ${p.wf_profile || 'WF200x100'} (${wpm} kg/m)`,
      wpm * totalLength, 'kg', waste, 1));

    // Base plate: pelat baja per kolom
    const bpP = num(p.bp_p, 300) / 1000, bpL = num(p.bp_l, 300) / 1000, bpT = num(p.bp_t, 20) / 1000;
    lines.push(line('COL-BASEPLATE', 'Base Plate',
      bpP * bpL * bpT * STEEL_DENSITY * totalColumns, 'kg', waste, 1));

    lines.push(line('COL-ANCHOR', `Angkur D${num(p.angkur_dia, 19)}`,
      num(p.angkur_qty, 4) * totalColumns, 'bh', 0, 0));

    // Pengecatan: keliling profil didekati dari beratnya
    lines.push(line('COL-PAINT', 'Pengecatan Baja', totalLength * num(p.paint_perimeter, 1.2), 'm2', waste, 2));
    notes.push('Kolom baja: tidak menghasilkan volume beton maupun besi tulangan.');
  } else if (colType === 'cfs' || colType === 'baja_ringan') {
    const wpm = num(p.cfs_weight_per_m, 1.5);
    const layers = num(p.cfs_layers, 2) || 1;
    lines.push(line('COL-CFS', `Baja Ringan ${p.cfs_profile || 'C100x50'}`,
      wpm * totalLength * layers, 'kg', waste, 1));
    lines.push(line('COL-SCREW', 'Sekrup', num(p.screws_per_m, 4) * totalLength * layers, 'bh', 0, 0));
    notes.push('Kolom baja ringan: tidak menghasilkan volume beton maupun besi tulangan.');
  } else if (colType === 'wood' || colType === 'kayu') {
    // Layar meminta cm; tanpa konversi, 12×12 cm terbaca 12×12 m — 10.000× lipat.
    const b = meters(p, 'kayu_b', 0.12), h = meters(p, 'kayu_h', 0.12);
    lines.push(line('COL-WOOD', `Kayu ${p.kayu_kelas || 'Kelas II'}`, b * h * totalLength, 'm3', waste));
    notes.push('Kolom kayu: tidak menghasilkan volume beton maupun besi tulangan.');
  } else {
    const B = num(p.B, 0.3), H = num(p.H, 0.3);
    lines.push(line('COL-CONC', 'Beton Kolom', B * H * totalLength, 'm3', waste));
    lines.push(line('COL-FORM', 'Bekisting Kolom', 2 * (B + H) * totalLength, 'm2', waste));

    const cover = num(p.cover, 0.04);
    const mainDia = num(p.rebar_dia, 16) / 1000;
    const mainArea = Math.PI * (mainDia / 2) ** 2;
    lines.push(line('COL-REBAR', `Besi Utama D${num(p.rebar_dia, 16)}`,
      num(p.rebar_count, 8) * totalLength * mainArea * STEEL_DENSITY, 'kg', waste, 1));

    const stDia = num(p.stirrup_dia, 10) / 1000;
    const stArea = Math.PI * (stDia / 2) ** 2;
    const spacing = num(p.stirrup_spacing, 0.15) || 0.15;
    const perColumn = Math.floor(heightPerFloor / spacing) + 1;
    const stLen = 2 * ((B - 2 * cover) + (H - 2 * cover));
    lines.push(line('COL-STIRRUP', `Sengkang D${num(p.stirrup_dia, 10)}`,
      perColumn * totalColumns * stLen * stArea * STEEL_DENSITY, 'kg', waste, 1));
  }

  // EST-MTO-R05: sloof diinput di layar kolom tapi tidak pernah menjadi keluaran
  // kalkulator, jadi volumenya hilang dari MTO maupun RAB. Hanya dihitung kalau
  // memang diisi.
  const sloofLen = num(p.sloof_length), sloofW = num(p.sloof_w), sloofH = num(p.sloof_h);
  if (sloofLen > 0 && sloofW > 0 && sloofH > 0) {
    lines.push(line('COL-SLOOF-CONC', 'Beton Sloof', sloofW * sloofH * sloofLen, 'm3', waste));
    lines.push(line('COL-SLOOF-FORM', 'Bekisting Sloof', 2 * sloofH * sloofLen, 'm2', waste));
    const sDia = meters(p, 'sloof_rebar_dia', 0.016);
    const sArea = Math.PI * (sDia / 2) ** 2;
    lines.push(line('COL-SLOOF-REBAR', `Besi Sloof D${num(p.sloof_rebar_dia, 16)}`,
      num(p.sloof_rebar_count, 4) * sloofLen * sArea * STEEL_DENSITY, 'kg', waste, 1));
  }

  return { element_type: 'column', variant: colType, lines, notes };
}
