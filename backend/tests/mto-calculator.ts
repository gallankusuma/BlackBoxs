/**
 * Tes kalkulator MTO — angka acuannya diambil dari contoh regresi yang ditulis
 * tim reviewer, bukan dari hasil kode ini sendiri.
 *
 * Murni fungsi, tidak butuh backend jalan. Jalankan: npm run test:mto
 */
import { calculateMto } from '../src/modules/estimator/mto/calculator';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
};
const near = (label: string, actual: number, expected: number, tol = 0.01) => {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`  ok   ${label} → ${actual}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${actual}, harusnya ~${expected}`); }
};
const lineOf = (r: any, code: string) => r.lines.find((l: any) => l.code === code);

console.log('1. Galian pondasi memakai depth, bukan tebal footing (EST-MTO-002)');
const f = calculateMto('foundation', { L: 1, W: 1, H: 0.3, depth: 1.2, working_space: 0.3, qty: 12 });
near('galian = (1+0.6)×(1+0.6)×1.2×12', lineOf(f, 'FND-EXCV').net_quantity, 36.864);
chk('satuan galian', lineOf(f, 'FND-EXCV').unit, 'm3');

console.log('\n2. Pondasi menghasilkan baris terpisah (EST-MTO-003)');
const f2 = calculateMto('foundation', {
  L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12,
  tb_length: 40, tb_w: 0.2, tb_h: 0.3, tb_rebar_main: 13, tb_stirrup: 8,
});
for (const code of ['FND-EXCV', 'FND-BACKFILL', 'FND-LEAN', 'FND-CONC', 'FND-FORM', 'FND-REBAR',
                    'TB-CONC', 'TB-FORM', 'TB-REBAR', 'TB-STIRRUP']) {
  chk(`ada baris ${code}`, !!lineOf(f2, code), true);
}
chk('besi footing dan tie beam TIDAK digabung',
  lineOf(f2, 'FND-REBAR').net_quantity !== lineOf(f2, 'TB-REBAR').net_quantity, true);

console.log('\n3. Net dan gross terpisah, waste tidak tersembunyi (EST-MTO-004)');
const c = calculateMto('column', { B: 0.4, H: 0.4, height_per_floor: 3, floors: 1, qty_per_floor: 10, waste_pct: 5 });
const conc = lineOf(c, 'COL-CONC');
near('net = 0.4×0.4×3×10', conc.net_quantity, 4.8);
chk('waste tercatat eksplisit', conc.waste_percent, 5);
near('gross = net × 1.05', conc.gross_quantity, 5.04);

console.log('\n4. Lantai TIDAK dihitung dua kali (EST-MTO-005)');
const c1 = calculateMto('column', { B: 0.4, H: 0.4, height_per_floor: 3, floors: 1, qty_per_floor: 10 });
const c3 = calculateMto('column', { B: 0.4, H: 0.4, height_per_floor: 3, floors: 3, qty_per_floor: 10 });
near('1 lantai', lineOf(c1, 'COL-CONC').net_quantity, 4.8);
near('3 lantai = 3× (bukan 9×)', lineOf(c3, 'COL-CONC').net_quantity, 14.4);
chk('rasio tepat 3, bukan 9',
  +(lineOf(c3, 'COL-CONC').net_quantity / lineOf(c1, 'COL-CONC').net_quantity).toFixed(3), 3);

console.log('\n5. Kolom baja tidak menghasilkan beton/besi tulangan (EST-MTO-006)');
const cw = calculateMto('column', { col_type: 'wf', wf_profile: 'WF200x100', height_per_floor: 4, floors: 2, qty_per_floor: 5 });
chk('tidak ada beton', !!lineOf(cw, 'COL-CONC'), false);
chk('tidak ada besi tulangan', !!lineOf(cw, 'COL-REBAR'), false);
near('berat profil = 21.3 × (4×10)', lineOf(cw, 'COL-WF').net_quantity, 852, 0.5);

console.log('\n6. Berat balok baja = berat/m × panjang (EST-MTO-007)');
const b = calculateMto('beam', { beam_type: 'wf', wf_profile_beam: 'WF200x100', total_length: 300, waste_pct: 5 });
const wf = lineOf(b, 'BM-WF');
near('net = 21.3 × 300', wf.net_quantity, 6390, 0.5);
near('gross dengan waste 5% = 6709.5', wf.gross_quantity, 6709.5, 0.5);
chk('BUKAN 21.3 kg', wf.net_quantity !== 21.3, true);

console.log('\n7. Berat plat bordes = kg/m2 × luas (EST-MTO-008)');
const s = calculateMto('slab', { slab_type: 'plate_bordes', plate_thick: 5, area: 1000, waste_pct: 5 });
const pl = lineOf(s, 'SLB-PLATE');
near('net = 39.3 × 1000', pl.net_quantity, 39300, 1);
near('gross 5% = 41265', pl.gross_quantity, 41265, 1);

console.log('\n8. Tipe lantai menentukan keluaran (EST-MTO-009)');
const tile = calculateMto('slab', { slab_type: 'keramik', area: 100 });
chk('keramik: tidak ada beton struktural', !!lineOf(tile, 'SLB-CONC'), false);
chk('keramik: tidak ada pembesian', !!lineOf(tile, 'SLB-REBAR'), false);
chk('keramik: ada keramik', !!lineOf(tile, 'SLB-TILE'), true);
const conc2 = calculateMto('slab', { slab_type: 'concrete', area: 100, thickness: 0.12 });
chk('beton: ada beton', !!lineOf(conc2, 'SLB-CONC'), true);

console.log('\n9. Dinding memakai luas bersih setelah bukaan (EST-MTO-010)');
const w = calculateMto('wall', {
  area: 100, thickness_cm: 15,
  door_qty: 2, door_w: 0.9, door_h: 2.1,
  window_qty: 4, window_w: 1.2, window_h: 1.5,
});
near('luas bersih = 100 − 3.78 − 7.2', lineOf(w, 'WAL-AREA').net_quantity, 89.02);
chk('thickness_cm dipahami', lineOf(w, 'WAL-VOL').net_quantity > 0, true);

console.log('\n10. Cladding tidak menghasilkan plesteran (EST-MTO-011)');
const cl = calculateMto('wall', { wall_type: 'zincalume', area: 100, zinc_eff_w: 1 });
chk('tidak ada plesteran', !!lineOf(cl, 'WAL-PLASTER'), false);
chk('tidak ada acian', !!lineOf(cl, 'WAL-ACIAN'), false);
chk('tidak ada volume pasangan', !!lineOf(cl, 'WAL-VOL'), false);
chk('ada cladding', !!lineOf(cl, 'WAL-CLAD'), true);

console.log('\n11. Atap memakai perimeter yang diinput (EST-MTO-012)');
const r1 = calculateMto('roof', { floor_area: 100, perimeter: 50, slope_deg: 30, overhang: 0.6 });
const r2 = calculateMto('roof', { floor_area: 100, slope_deg: 30, overhang: 0.6 });
near('pakai perimeter 50: (100+50×0.6)/cos30', lineOf(r1, 'RF-AREA').net_quantity, 150.11, 0.05);
chk('tanpa perimeter → dicatat sebagai asumsi', r2.notes.length > 0, true);
chk('hasilnya berbeda dari yang memakai perimeter',
  lineOf(r1, 'RF-AREA').net_quantity !== lineOf(r2, 'RF-AREA').net_quantity, true);

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);
