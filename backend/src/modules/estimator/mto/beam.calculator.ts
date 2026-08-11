import { MtoResult, line, num, STEEL_DENSITY } from './types';
import { profileWeight } from './profiles';

/**
 * Balok (EST-MTO-007).
 *
 * Bug yang diperbaiki ada di frontend dan sifatnya fatal secara komersial:
 *
 *     const wBalk = +(WF_WEIGHT[profil] || 21.3 * total_length * 1.05).toFixed(0)
 *
 * `||` berpresedensi lebih rendah daripada `*`, jadi ekspresi itu terbaca
 * `WF_WEIGHT[profil] || (21.3 * panjang * 1.05)`. Karena profilnya selalu ada di
 * tabel, hasilnya SELALU berat per meter — balok WF 300 m dilaporkan 21,3 kg,
 * bukan 6.709,5 kg. Penawaran bisa meleset ratusan kali lipat.
 *
 * Rumus yang benar: berat per meter × panjang total, waste terpisah.
 */
export function calcBeam(p: any): MtoResult {
  const notes: string[] = [];
  const beamType = String(p.beam_type || 'concrete').toLowerCase();
  const waste = num(p.waste_pct, 5);
  const totalLength = num(p.total_length);
  const lines = [];

  if (beamType === 'wf' || beamType === 'steel') {
    const profile = String(p.wf_profile_beam || 'WF200x100');
    const wpm = profileWeight(profile, 21.3);
    lines.push(line('BM-WF', `Profil ${profile} (${wpm} kg/m)`, wpm * totalLength, 'kg', waste, 1));

    const stiffQty = num(p.stiffener_qty, 0);
    if (stiffQty > 0) lines.push(line('BM-STIFF', 'Pelat Stiffener', stiffQty, 'bh', 0, 0));

    const joints = num(p.bolt_joints, 0), perJoint = num(p.bolts_per_joint, 8);
    if (joints > 0) lines.push(line('BM-BOLT', 'Baut Sambungan', joints * perJoint, 'bh', 0, 0));

    lines.push(line('BM-PAINT', 'Pengecatan Baja', totalLength * num(p.paint_perimeter, 1.1), 'm2', waste, 2));
    notes.push('Balok baja: tidak menghasilkan volume beton maupun besi tulangan.');
  } else if (beamType === 'purlin' || beamType === 'gording') {
    const profile = String(p.purlin_profile || 'C150x65');
    const wpm = profileWeight(profile, 6.76);
    const len = num(p.purlin_length, totalLength);
    lines.push(line('BM-PURLIN', `Gording ${profile} (${wpm} kg/m)`, wpm * len, 'kg', waste, 1));
  } else if (beamType === 'unp' || beamType === 'kanal') {
    const profile = String(p.kanal_profile || 'UNP150');
    const wpm = profileWeight(profile, 18.6);
    lines.push(line('BM-UNP', `Kanal ${profile} (${wpm} kg/m)`, wpm * totalLength, 'kg', waste, 1));
    const kb = num(p.kanal_bolts, 0);
    if (kb > 0) lines.push(line('BM-KANAL-BOLT', 'Baut Kanal', kb, 'bh', 0, 0));
  } else if (beamType === 'wood' || beamType === 'kayu') {
    const b = num(p.kayu_b, 0.08), h = num(p.kayu_h, 0.12);
    lines.push(line('BM-WOOD', `Kayu ${p.kayu_kelas_beam || 'Kelas II'}`, b * h * totalLength, 'm3', waste));
  } else {
    const B = num(p.B, 0.25), H = num(p.H, 0.5);
    lines.push(line('BM-CONC', 'Beton Balok', B * H * totalLength, 'm3', waste));
    lines.push(line('BM-FORM', 'Bekisting Balok', (2 * H + B) * totalLength, 'm2', waste));

    const cover = num(p.cover, 0.04);
    const mainDia = num(p.rebar_dia, 16) / 1000;
    const mainArea = Math.PI * (mainDia / 2) ** 2;
    lines.push(line('BM-REBAR', `Besi Utama D${num(p.rebar_dia, 16)}`,
      num(p.rebar_count, 4) * totalLength * mainArea * STEEL_DENSITY, 'kg', waste, 1));

    const stDia = num(p.stirrup_dia, 10) / 1000;
    const stArea = Math.PI * (stDia / 2) ** 2;
    const spacing = num(p.stirrup_spacing, 0.15) || 0.15;
    const count = Math.floor(totalLength / spacing) + 1;
    const stLen = 2 * ((B - 2 * cover) + (H - 2 * cover));
    lines.push(line('BM-STIRRUP', `Sengkang D${num(p.stirrup_dia, 10)}`,
      count * stLen * stArea * STEEL_DENSITY, 'kg', waste, 1));
  }

  return { element_type: 'beam', variant: beamType, lines, notes };
}
