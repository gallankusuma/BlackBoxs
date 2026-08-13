import { MtoResult, line, num } from './types';
import { meters, resolveVariant } from './contract';

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
  const resolved = resolveVariant('wall', p.wall_type, 'masonry');
  const wallType = resolved.variant;
  if (resolved.note) notes.push(resolved.note);
  if (wallType === 'unknown') {
    return { element_type: 'wall', variant: resolved.raw, lines: [], notes };
  }
  const waste = num(p.waste_pct, 5);

  const grossArea = num(p.area);

  // Bukaan: pakai hitungan pintu/jendela kalau ada, kalau tidak pakai persentase
  const doorArea = num(p.door_qty) * num(p.door_w) * num(p.door_h);
  const windowArea = num(p.window_qty) * num(p.window_w) * num(p.window_h);
  // EST-MTO-R08: bukaan punya DUA sumber — rincian pintu/jendela dan persentase.
  // Yang dipakai harus jelas, bukan diam-diam salah satunya. Rincian menang
  // karena lebih spesifik, dan kalau keduanya diisi perbedaannya disebutkan
  // supaya estimator tahu angka mana yang masuk.
  const detailArea = doorArea + windowArea;
  const pctArea = num(p.opening_pct) > 0 ? grossArea * num(p.opening_pct) / 100 : 0;

  let openingArea = 0;
  if (detailArea > 0) {
    openingArea = detailArea;
    if (pctArea > 0) {
      notes.push(
        `Bukaan dihitung dari rincian pintu/jendela (${detailArea.toFixed(2)} m2). `
        + `Persentase bukaan ${num(p.opening_pct)}% (${pctArea.toFixed(2)} m2) diabaikan.`
      );
    }
  } else if (pctArea > 0) {
    openingArea = pctArea;
    notes.push(`Bukaan dihitung dari persentase ${num(p.opening_pct)}% karena rincian pintu/jendela belum diisi.`);
  }

  const netArea = Math.max(grossArea - openingArea, 0);
  if (openingArea > 0) {
    notes.push(`Luas bersih ${netArea.toFixed(2)} m2 = bruto ${grossArea.toFixed(2)} m2 − bukaan ${openingArea.toFixed(2)} m2.`);
  }
  if (openingArea > grossArea) {
    notes.push('Luas bukaan melebihi luas bruto — periksa kembali datanya.');
  }

  // thickness_cm (frontend) maupun thickness_mm (backend lama) sama-sama diterima
  // `thickness_cm` (layar sekarang) maupun `thickness_mm` (kontrak lama)
  // sama-sama diterima; keduanya terdaftar satuannya di contract.ts.
  const thicknessM = p.thickness_cm ? meters(p, 'thickness_cm', 0.15)
    : p.thickness_mm ? meters(p, 'thickness_mm', 0.15)
      : 0.15;

  const lines = [];

  if (wallType === 'cladding') {
    // EST-MTO-R09: jumlah lembar dulu hanya luas dibagi lebar efektif, sehingga
    // satuannya sebenarnya meter-lari, bukan lembar. Panjang sheet ikut
    // diperhitungkan supaya angkanya benar-benar jumlah lembar yang dipesan.
    const eff = num(p.zinc_eff_w, 0.85) || 0.85;
    const sheetLen = num(p.zinc_len, 0);
    lines.push(line('WAL-CLAD', 'Cladding Zincalume', netArea, 'm2', waste, 2));
    if (sheetLen > 0) {
      lines.push(line('WAL-CLAD-SHEET', `Lembar Cladding (${eff}m × ${sheetLen}m)`,
        Math.ceil(netArea / (eff * sheetLen)), 'lbr', waste, 0));
    } else {
      notes.push('Panjang sheet cladding belum diisi, jadi jumlah lembar tidak dihitung.');
    }
    notes.push('Cladding: tidak menghasilkan plesteran, acian, maupun volume pasangan.');
  } else if (wallType === 'glass') {
    lines.push(line('WAL-GLASS', `Kaca ${num(p.glass_thick, 8)}mm`, netArea, 'm2', waste, 2));
    // EST-MTO-R10: `glass_frame` adalah TIPE rangka (aluminium/spider/frameless),
    // bukan panjang. Versi lama memanggil num() atasnya sehingga selalu 0 —
    // barisnya muncul dengan kuantitas nol dan tidak berarti apa-apa.
    const frameType = String(p.glass_frame || '').toLowerCase();
    if (frameType && frameType !== 'frameless') {
      const label = frameType === 'spider' ? 'Spider System' : 'Rangka Aluminium';
      lines.push(line('WAL-FRAME', label, netArea, 'm2', waste, 2));
    } else if (frameType === 'frameless') {
      notes.push('Kaca frameless: tidak ada kuantitas rangka.');
    }
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
