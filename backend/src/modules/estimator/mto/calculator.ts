import { MtoResult, validateParams } from './types';
import { calcFoundation } from './foundation.calculator';
import { calcColumn } from './column.calculator';
import { calcBeam } from './beam.calculator';
import { calcSlab } from './slab.calculator';
import { calcWall } from './wall.calculator';
import { calcRoof } from './roof.calculator';

/**
 * Satu-satunya sumber kebenaran kuantitas MTO (EST-MTO-001).
 *
 * Sebelum ini ada TIGA tempat menghitung hal yang sama dengan rumus berbeda:
 * komponen input di frontend, rekap di ProjectMTO.vue, dan `calcMtoQty` di
 * backend. Ketiganya bisa memberi angka berbeda untuk input yang sama — dan
 * angka itu dipakai sebagai dasar penawaran harga ke pelanggan.
 *
 * Frontend tidak boleh lagi menghitung kuantitas bisnis sendiri; ia mengirim
 * parameter dan menampilkan apa yang dikembalikan kalkulator ini.
 */
export function calculateMto(elementType: string, parameters: any): MtoResult {
  const type = String(elementType || '').toLowerCase();
  const p = parameters || {};

  // EST-MTO-R19: parameter yang mustahil ditolak sebelum dihitung. Dimensi
  // negatif tidak punya arti fisik; membiarkannya berarti menyalurkan angka
  // keliru ke RAB dan harga penawaran.
  const paramErrors = validateParams(type, p);
  if (paramErrors.length > 0) {
    return { element_type: type, variant: 'invalid', lines: [], notes: paramErrors };
  }

  switch (type) {
    case 'foundation': return calcFoundation(p);
    case 'column':     return calcColumn(p);
    case 'beam':       return calcBeam(p);
    case 'slab':       return calcSlab(p);
    case 'wall':       return calcWall(p);
    case 'roof':       return calcRoof(p);
    default:
      // EST-MTO-R30: tipe elemen tak dikenal ditandai `invalid`, bukan `unknown`.
      // Keduanya sama-sama menghasilkan nol baris, tapi `invalid` yang ditolak
      // 422 oleh route sehingga tidak tersimpan sebagai engineering input yang
      // sah dengan kuantitas nol.
      return {
        element_type: type,
        variant: 'invalid',
        lines: [],
        notes: [`Tipe elemen "${elementType}" tidak dikenali kalkulator. Yang didukung: foundation, column, beam, slab, wall, roof.`],
      };
  }
}

/**
 * Bentuk lama `Record<string, number>` masih dipakai kolom `quantities` dan
 * beberapa layar. Dipertahankan sebagai turunan supaya data lama tetap terbaca,
 * tapi bukan lagi sumber kebenaran — `lines` yang otoritatif.
 */
export function toLegacyQuantities(result: MtoResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of result.lines) {
    out[l.code.toLowerCase().replace(/-/g, '_')] = l.gross_quantity;
  }
  return out;
}

export * from './types';
