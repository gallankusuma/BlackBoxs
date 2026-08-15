import { calculateMto } from './calculator';
import { FORMULA_VERSION } from './types';

/**
 * Pengayaan satu elemen MTO untuk jalur BACA (EST-MTO-019, R36, R37).
 *
 * Dipisahkan ke sini karena logikanya dipakai dua route — `/estimator/proposals/:id/mto`
 * dan `/projects/:id/mto` — dan sempat hanya ada di salah satunya. Perbandingan
 * drift juga bukan hal yang boleh ditulis dua kali: versi pertama hanya
 * membandingkan `net_quantity`, sehingga perubahan waste 5% → 8% tidak terdeteksi
 * sama sekali padahal jumlah yang dibeli berubah (R36).
 */

export interface StoredLineRow {
  line_code: string;
  label: string;
  net_quantity: any;
  waste_percent: any;
  gross_quantity: any;
  unit: string;
  formula_version?: string | null;
}

const DRIFT_TOLERANCE = 0.0001;

export const enrichMtoElement = (
  elementType: string,
  parameters: any,
  stored: StoredLineRow[],
  storedFormulaVersion?: string | null,
) => {
  // Dihitung ulang dari parameter, bukan membaca kolom `quantities` yang
  // tersimpan. Kalau formulanya diperbaiki, elemen lama ikut terkoreksi tanpa
  // perlu migrasi data.
  const mto = calculateMto(elementType, parameters || {});

  // R36: bukan hanya net. Waste, gross, dan satuan sama-sama menentukan angka
  // yang ditawarkan.
  const drifted = stored.length > 0 && (
    stored.length !== mto.lines.length
    || stored.some(sl => {
      const cur = mto.lines.find(l => l.code === sl.line_code);
      if (!cur) return true;
      return Math.abs(Number(sl.net_quantity) - cur.net_quantity) > DRIFT_TOLERANCE
        || Math.abs(Number(sl.waste_percent) - cur.waste_percent) > DRIFT_TOLERANCE
        || Math.abs(Number(sl.gross_quantity) - cur.gross_quantity) > DRIFT_TOLERANCE
        || String(sl.unit) !== String(cur.unit);
    })
  );

  const notes = [...mto.notes];
  if (drifted) {
    notes.push(
      'Formula kalkulator berubah sejak elemen ini disimpan — angka tersimpan dan '
      + 'angka sekarang berbeda. Simpan ulang untuk memperbarui.'
    );
  }

  return {
    lines: mto.lines,
    stored_lines: stored,
    formula_drift: drifted,
    // R35: dipakai layar untuk menandai elemen yang kuantitasnya berdiri di atas
    // asumsi kalkulator, bukan data teknis.
    missing_required: mto.missing_required || [],
    formula_version_stored: storedFormulaVersion || null,
    formula_version_current: FORMULA_VERSION,
    variant: mto.variant,
    notes,
  };
};

/** Kelompokkan baris `mto_lines` berdasarkan `element_id`. */
export const groupStoredLines = (rows: any[]): Map<number, StoredLineRow[]> => {
  const map = new Map<number, StoredLineRow[]>();
  for (const l of rows) {
    const arr = map.get(Number(l.element_id)) || [];
    arr.push(l);
    map.set(Number(l.element_id), arr);
  }
  return map;
};
