/**
 * Padanan satuan (EST-MTO-014).
 *
 * MTO menulis `m3`, AHSP menyimpan `m³`, dan sebagian data lama memakai `M3`
 * atau `m'`. Tanpa tabel padanan, menautkan kuantitas MTO ke item RAB akan
 * ditolak hanya karena beda cara menulis — atau lebih buruk, diterima padahal
 * satuannya memang berbeda jenis (kg dipasang ke item bervolume m3).
 */
const CANONICAL: Record<string, string> = {
  // volume
  'm3': 'm3', 'm³': 'm3', 'meter kubik': 'm3', 'kubik': 'm3',
  // luas
  'm2': 'm2', 'm²': 'm2', 'meter persegi': 'm2',
  // panjang
  'm': 'm', "m'": 'm', 'm1': 'm', 'meter': 'm', 'ml': 'm',
  // berat
  'kg': 'kg', 'kilogram': 'kg',
  'ton': 'ton',
  // hitungan
  'bh': 'pcs', 'buah': 'pcs', 'pcs': 'pcs', 'unit': 'pcs', 'set': 'pcs', 'ea': 'pcs',
  'btg': 'btg', 'batang': 'btg', 'lonjor': 'btg',
  'lbr': 'lbr', 'lembar': 'lbr',
  'ls': 'ls', 'lump sum': 'ls', 'lumpsum': 'ls',
  'zak': 'zak', 'sak': 'zak',
  'ltr': 'ltr', 'liter': 'ltr',
};

/** Bentuk baku sebuah satuan; null kalau tidak dikenali. */
export const canonicalUnit = (unit: string | null | undefined): string | null => {
  if (!unit) return null;
  const key = String(unit).trim().toLowerCase();
  return CANONICAL[key] ?? null;
};

export interface UnitCheck {
  compatible: boolean;
  mto_canonical: string | null;
  target_canonical: string | null;
  reason?: string;
}

/**
 * Satuan yang tidak dikenali sengaja TIDAK dianggap cocok begitu saja.
 * Melewatkan yang tidak dikenal berarti membiarkan kg terpasang ke item m3 —
 * persis kesalahan yang paling mahal di penawaran.
 */
export const checkUnitCompatibility = (mtoUnit: string, targetUnit: string): UnitCheck => {
  const a = canonicalUnit(mtoUnit);
  const b = canonicalUnit(targetUnit);

  if (!a) return { compatible: false, mto_canonical: a, target_canonical: b, reason: `Satuan MTO "${mtoUnit}" tidak dikenali` };
  if (!b) return { compatible: false, mto_canonical: a, target_canonical: b, reason: `Satuan item RAB "${targetUnit}" tidak dikenali` };
  if (a !== b) return { compatible: false, mto_canonical: a, target_canonical: b, reason: `Satuan MTO "${mtoUnit}" tidak sepadan dengan satuan item RAB "${targetUnit}"` };

  return { compatible: true, mto_canonical: a, target_canonical: b };
};

/** Status proposal yang MTO-nya masih boleh diubah (EST-MTO-016). */
export const EDITABLE_PROPOSAL_STATUSES = ['draft', 'review'];

export const isProposalEditable = (status: string | null | undefined): boolean =>
  EDITABLE_PROPOSAL_STATUSES.includes(String(status || 'draft').toLowerCase());
