import 'dotenv/config';
/**
 * Peta cakupan AHSP terhadap seluruh baris yang bisa dihasilkan kalkulator MTO.
 *
 * Bukan tes — alat ukur. Menjawab satu pertanyaan: baris pekerjaan mana yang
 * bisa dihitung sistem tapi TIDAK punya satu pun AHSP bersatuan cocok di
 * katalog, sehingga jembatan MTO→RAB berhenti di situ.
 */
import { calculateMto } from '../src/modules/estimator/mto/calculator';
import { usulkanAhsp } from '../src/modules/estimator/mto/cocok-ahsp';
import { katalogElemen } from '../src/modules/estimator/mto/contract';

// Parameter representatif — cukup untuk memancing seluruh baris keluar.
const P: Record<string, any> = {
  L: 2, W: 2, H: 0.4, B: 0.4, T: 0.12, D: 0.4, qty: 10, depth: 1.5, lean_t: 0.05,
  length: 6, width: 4, height: 3, area: 100, span: 6, count: 10, n: 10,
  pile_length: 12, pile_dia: 0.4, pile_count: 20, cap_L: 2, cap_W: 2, cap_H: 0.8,
  tie_L: 4, tie_B: 0.25, tie_H: 0.4, rebar_dia: 16, spacing: 0.15, cover: 0.05,
  thickness: 0.12, floors: 3, qty_per_floor: 10, height_per_floor: 3,
  profile_weight: 50, wall_area: 200, opening_area: 20, slope: 30,
};

async function main() {
  // Katalog boleh datang dari berkas (dump produksi read-only) supaya
  // pengukurannya dilakukan terhadap katalog yang benar-benar dipakai.
  const berkas = process.env.KATALOG_TSV;
  let katalog: any[];
  if (berkas) {
    const { readFileSync } = await import('fs');
    katalog = readFileSync(berkas, 'utf8').trim().split('\n').map(b => {
      const [id, kode, name, satuan, harga] = b.split('\t');
      return { id: Number(id), kode, name, satuan, harga_satuan: Number(harga) || 0 };
    });
  } else {
    const { dbAll } = await import('../src/config/database');
    katalog = await dbAll(
      `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE status = 'active'`, []) as any[];
  }
  console.log(`Katalog AHSP aktif: ${katalog.length}\n`);

  const semua = new Map<string, { label: string; unit: string; asal: Set<string> }>();
  for (const el of katalogElemen()) {
    for (const v of (el as any).variants || [(el as any).variant]) {
      const varian = typeof v === 'string' ? v : v?.value ?? v?.variant;
      if (!varian) continue;
      const field = (el as any).variant_field || 'type';
      try {
        const r = calculateMto(el.element_type, { ...P, [field]: varian });
        for (const l of r.lines) {
          const k = l.code;
          if (!semua.has(k)) semua.set(k, { label: l.label, unit: l.unit, asal: new Set() });
          semua.get(k)!.asal.add(`${el.element_type}/${varian}`);
        }
      } catch { /* varian yang butuh parameter lain — dilewati */ }
    }
  }

  const kosong: any[] = [];
  const lemah: any[] = [];
  for (const [code, info] of semua) {
    const u = usulkanAhsp({ code, label: info.label, unit: info.unit }, katalog as any, 3);
    if (!u.length) kosong.push({ code, ...info });
    else if (u[0].skor < 50) lemah.push({ code, ...info, teratas: u[0] });
  }

  console.log(`Baris MTO unik yang bisa dihasilkan: ${semua.size}`);
  console.log(`  tanpa satu pun kandidat : ${kosong.length}`);
  console.log(`  kandidat lemah (skor<50): ${lemah.length}\n`);

  if (kosong.length) {
    console.log('── TANPA KANDIDAT ────────────────────────────────────────────');
    for (const k of kosong.sort((a, b) => a.code.localeCompare(b.code))) {
      console.log(`  ${k.code.padEnd(16)} ${String(k.unit).padEnd(5)} ${k.label}`);
      console.log(`  ${''.padEnd(16)}       dipakai: ${[...k.asal].join(', ')}`);
    }
  }
  if (lemah.length) {
    console.log('\n── KANDIDAT LEMAH ────────────────────────────────────────────');
    for (const k of lemah.sort((a, b) => a.code.localeCompare(b.code))) {
      console.log(`  ${k.code.padEnd(16)} ${String(k.unit).padEnd(5)} ${k.label}`);
      console.log(`  ${''.padEnd(16)}       teratas: ${k.teratas.kode} ${k.teratas.name} (skor ${k.teratas.skor})`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
