import { MtoResult } from './types';
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

  switch (type) {
    case 'foundation': return calcFoundation(p);
    case 'column':     return calcColumn(p);
    case 'beam':       return calcBeam(p);
    case 'slab':       return calcSlab(p);
    case 'wall':       return calcWall(p);
    case 'roof':       return calcRoof(p);
    default:
      return { element_type: type, variant: 'unknown', lines: [], notes: [`Tipe elemen "${elementType}" belum dikenali kalkulator.`] };
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
