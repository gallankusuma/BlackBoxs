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


console.log('\n12. Nilai enum dari UI harus dikenali (EST-MTO-011/012, R01)');
// Nilai di bawah disalin dari *TypePicker.vue — bukan dikarang ulang.
const wallCladding = calculateMto('wall', { wall_type: 'cladding_zincalume', area: 100, zinc_eff_w: 1 });
chk('cladding_zincalume TIDAK jatuh ke bata', !!lineOf(wallCladding, 'WAL-PLASTER'), false);
chk('cladding_zincalume menghasilkan cladding', !!lineOf(wallCladding, 'WAL-CLAD'), true);

const wallGrc = calculateMto('wall', { wall_type: 'partisi_grc', area: 100 });
chk('partisi_grc TIDAK jatuh ke bata', !!lineOf(wallGrc, 'WAL-PLASTER'), false);
chk('partisi_grc menghasilkan GRC', !!lineOf(wallGrc, 'WAL-GRC'), true);

for (const t of ['bata_ringan', 'bata_merah']) {
  const w = calculateMto('wall', { wall_type: t, area: 100, thickness_cm: 15 });
  chk(`${t} tetap pasangan bata`, !!lineOf(w, 'WAL-VOL'), true);
}

const roofDak = calculateMto('roof', { roof_type: 'beton_dak', floor_area: 100, perimeter: 40, dak_thick: 0.12 });
chk('beton_dak menghasilkan beton', !!lineOf(roofDak, 'RF-CONC'), true);
chk('beton_dak TIDAK menghasilkan gording', !!lineOf(roofDak, 'RF-PURLIN'), false);

const roofTile = calculateMto('roof', { roof_type: 'genteng_keramik', floor_area: 100, perimeter: 40 });
chk('genteng_keramik dihitung sebagai genteng', !!lineOf(roofTile, 'RF-TILE'), true);

const roofSheet = calculateMto('roof', { roof_type: 'zincalume', floor_area: 100, perimeter: 40, sheet_eff_w: 1 });
chk('zincalume dihitung sebagai lembaran', !!lineOf(roofSheet, 'RF-SHEET'), true);

console.log('\n13. Tipe tak dikenal tidak boleh diam-diam memakai default');
const bogus = calculateMto('wall', { wall_type: 'entah_apa', area: 100 });
chk('tidak menghasilkan baris apa pun', bogus.lines.length, 0);
chk('memberi peringatan', bogus.notes.length > 0, true);

console.log('\n14. Pondasi non-footplate tidak dihitung sebagai footplate (EST-MTO-R01)');
const pile = calculateMto('foundation', { foundation_type: 'bored_pile', L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12 });
chk('tidak ada galian footplate', !!lineOf(pile, 'FND-EXCV'), false);
chk('tidak ada beton footing', !!lineOf(pile, 'FND-CONC'), false);
chk('diberi peringatan eksplisit', pile.notes.some(n => n.includes('belum didukung')), true);
const footplate = calculateMto('foundation', { foundation_type: 'footplate', L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12 });
near('footplate tetap dihitung', lineOf(footplate, 'FND-EXCV').net_quantity, 36.864);

console.log('\n15. Satuan dari layar: cm tidak boleh dibaca sebagai meter (R02/R03/R04)');
// Default asli di layar: kolom kayu 12×12 cm, balok kayu 8×15 cm, screed 3 cm
const woodCol = calculateMto('column', {
  col_type: 'kayu', kayu_b: 12, kayu_h: 12,
  height_per_floor: 4, floors: 1, qty_per_floor: 12, waste_pct: 0,
});
near('kolom kayu 12×12cm × 4m × 12bh = 0,6912 m³', lineOf(woodCol, 'COL-WOOD').net_quantity, 0.6912, 0.0005);

const woodBeam = calculateMto('beam', {
  beam_type: 'kayu', kayu_b: 8, kayu_h: 15, total_length: 300, waste_pct: 0,
});
near('balok kayu 8×15cm × 300m = 3,6 m³', lineOf(woodBeam, 'BM-WOOD').net_quantity, 3.6, 0.001);

const ceramic = calculateMto('slab', { slab_type: 'keramik', area: 1000, screed_t: 3, waste_pct: 0 });
near('screed 3cm × 1000m² = 30 m³', lineOf(ceramic, 'SLB-SCREED').net_quantity, 30, 0.01);

console.log('\n16. Tipe kolom & balok dari picker dikenali semua');
for (const t of ['beton', 'wf', 'cfs', 'kayu']) {
  const c = calculateMto('column', { col_type: t, height_per_floor: 3, floors: 1, qty_per_floor: 4, B: 0.3, H: 0.3 });
  chk(`kolom "${t}" menghasilkan baris`, c.lines.length > 0, true);
}
for (const t of ['beton', 'wf', 'kanal', 'kayu']) {
  const b = calculateMto('beam', { beam_type: t, total_length: 100, B: 0.25, H: 0.5 });
  chk(`balok "${t}" menghasilkan baris`, b.lines.length > 0, true);
}
for (const t of ['concrete', 'keramik', 'plate_bordes', 'parquet']) {
  const sl = calculateMto('slab', { slab_type: t, area: 100, thickness: 0.12 });
  chk(`lantai "${t}" menghasilkan baris`, sl.lines.length > 0, true);
}


console.log('\n17. Sloof, ring balk, dan gording jadi keluaran (EST-MTO-R05)');
const colSloof = calculateMto('column', {
  col_type: 'beton', B: 0.3, H: 0.3, height_per_floor: 3, floors: 1, qty_per_floor: 8,
  sloof_length: 200, sloof_w: 0.3, sloof_h: 0.5, sloof_rebar_dia: 16, waste_pct: 0,
});
chk('beton sloof muncul', !!lineOf(colSloof, 'COL-SLOOF-CONC'), true);
near('volume sloof = 0.3×0.5×200', lineOf(colSloof, 'COL-SLOOF-CONC').net_quantity, 30, 0.01);
chk('besi sloof muncul', !!lineOf(colSloof, 'COL-SLOOF-REBAR'), true);
chk('tanpa input sloof, tidak ada barisnya',
  !!lineOf(calculateMto('column', { col_type: 'beton', B: 0.3, H: 0.3, qty_per_floor: 8 }), 'COL-SLOOF-CONC'), false);

const beamRb = calculateMto('beam', {
  beam_type: 'beton', B: 0.25, H: 0.5, total_length: 100,
  rb_length: 80, rb_B: 0.15, rb_H: 0.25, rb_rebar_dia: 13, waste_pct: 0,
});
near('volume ring balk = 0.15×0.25×80', lineOf(beamRb, 'BM-RB-CONC').net_quantity, 3, 0.01);

const beamWfPurlin = calculateMto('beam', {
  beam_type: 'wf', wf_profile_beam: 'WF200x100', total_length: 100,
  purlin_length: 500, purlin_profile: 'C150x65', waste_pct: 0,
});
chk('gording ikut keluar di cabang WF', !!lineOf(beamWfPurlin, 'BM-PURLIN'), true);
near('gording = 6.76 × 500', lineOf(beamWfPurlin, 'BM-PURLIN').net_quantity, 3380, 1);

console.log('\n18. Lembar cladding memperhitungkan panjang sheet (EST-MTO-R09)');
const clad = calculateMto('wall', { wall_type: 'cladding_zincalume', area: 100, zinc_eff_w: 0.85, zinc_len: 6, waste_pct: 0 });
near('lembar = ceil(100 / (0.85×6))', lineOf(clad, 'WAL-CLAD-SHEET').net_quantity, 20, 0.01);
const cladNoLen = calculateMto('wall', { wall_type: 'cladding_zincalume', area: 100, zinc_eff_w: 0.85 });
chk('tanpa panjang sheet: tidak menebak', !!lineOf(cladNoLen, 'WAL-CLAD-SHEET'), false);
chk('dan diberi catatan', cladNoLen.notes.some(n => n.includes('Panjang sheet')), true);

console.log('\n19. Rangka kaca adalah TIPE, bukan panjang (EST-MTO-R10)');
const glassAlu = calculateMto('wall', { wall_type: 'kaca', area: 50, glass_thick: 8, glass_frame: 'aluminium' });
const frame = lineOf(glassAlu, 'WAL-FRAME');
chk('rangka aluminium muncul', !!frame, true);
chk('kuantitasnya BUKAN nol', frame.net_quantity > 0, true);
chk('satuannya m2, bukan m', frame.unit, 'm2');
const glassNone = calculateMto('wall', { wall_type: 'kaca', area: 50, glass_frame: 'frameless' });
chk('frameless tidak menghasilkan rangka', !!lineOf(glassNone, 'WAL-FRAME'), false);

console.log('\n20. Dak beton punya pembesian (EST-MTO-R12)');
const dak = calculateMto('roof', { roof_type: 'beton_dak', floor_area: 200, perimeter: 60, dak_thick: 0.12, waste_pct: 0 });
chk('beton dak ada', !!lineOf(dak, 'RF-CONC'), true);
chk('pembesian dak ada', !!lineOf(dak, 'RF-REBAR'), true);
chk('asumsinya dicatat', dak.notes.some(n => n.includes('asumsi')), true);

console.log('\n21. Sumber bukaan dinding dinyatakan tegas (EST-MTO-R08)');
const bothSources = calculateMto('wall', {
  wall_type: 'bata_merah', area: 100, thickness_cm: 15, opening_pct: 30,
  door_qty: 2, door_w: 0.9, door_h: 2.1,
});
near('rincian yang dipakai (3.78), bukan 30%', lineOf(bothSources, 'WAL-AREA').net_quantity, 96.22, 0.01);
chk('persentase yang diabaikan disebutkan', bothSources.notes.some(n => n.includes('diabaikan')), true);
const pctOnly = calculateMto('wall', { wall_type: 'bata_merah', area: 100, thickness_cm: 15, opening_pct: 20 });
near('tanpa rincian, persentase dipakai', lineOf(pctOnly, 'WAL-AREA').net_quantity, 80, 0.01);

console.log('\n22. Parameter mustahil ditolak (EST-MTO-R19)');
const negatif = calculateMto('slab', { slab_type: 'concrete', area: -100, thickness: 0.12 });
chk('luas negatif tidak menghasilkan baris', negatif.lines.length, 0);
chk('diberi alasan', negatif.notes.length > 0, true);
const miring = calculateMto('roof', { roof_type: 'zincalume', floor_area: 100, perimeter: 40, slope_deg: 95 });
chk('kemiringan 95° ditolak', miring.lines.length, 0);
const wasteGila = calculateMto('slab', { slab_type: 'concrete', area: 100, thickness: 0.12, waste_pct: 500 });
chk('waste 500% ditolak', wasteGila.lines.length, 0);
const wajar = calculateMto('slab', { slab_type: 'concrete', area: 100, thickness: 0.12, waste_pct: 5 });
chk('parameter wajar tetap jalan', wajar.lines.length > 0, true);


console.log('\n23. Atap: cladding samping & satuan lembar (EST-MTO-R05/R09 reopened)');
const roofClad = calculateMto('roof', {
  roof_type: 'zincalume', floor_area: 200, perimeter: 60, slope_deg: 15,
  overhang: 0.6, cladding_h: 2, sheet_eff_w: 1, waste_pct: 0,
});
chk('cladding samping muncul', !!lineOf(roofClad, 'RF-SIDE-CLAD'), true);
near('luas cladding = keliling 60 × tinggi 2', lineOf(roofClad, 'RF-SIDE-CLAD').net_quantity, 120, 0.01);
chk('penutup atap dilaporkan m2, bukan lbr', lineOf(roofClad, 'RF-SHEET').unit, 'm2');
chk('tanpa panjang sheet: tidak ada baris lembar', !!lineOf(roofClad, 'RF-SHEET-QTY'), false);

const roofSheets = calculateMto('roof', {
  roof_type: 'zincalume', floor_area: 200, perimeter: 60, slope_deg: 0,
  overhang: 0, sheet_eff_w: 1, sheet_len: 5, waste_pct: 0,
});
chk('dengan panjang sheet: baris lembar muncul', !!lineOf(roofSheets, 'RF-SHEET-QTY'), true);
chk('satuannya lbr', lineOf(roofSheets, 'RF-SHEET-QTY').unit, 'lbr');
near('lembar = ceil(200 / (1×5))', lineOf(roofSheets, 'RF-SHEET-QTY').net_quantity, 40, 0.01);

console.log('\n24. Tipe tak dikenal ditandai invalid, bukan sekadar kosong (EST-MTO-R30)');
const badElement = calculateMto('tiang_listrik', { area: 100 });
chk('element_type asing → invalid', badElement.variant, 'invalid');
chk('nol baris', badElement.lines.length, 0);
for (const [t, key, val] of [
  ['column', 'col_type', 'titanium'],
  ['wall', 'wall_type', 'entah'],
  ['roof', 'roof_type', 'jerami'],
  ['slab', 'slab_type', 'karpet_terbang'],
] as [string, string, string][]) {
  const r = calculateMto(t, { [key]: val, area: 100, B: 0.3, H: 0.3, floor_area: 100 });
  chk(`${t} subtipe "${val}" → invalid`, r.variant, 'invalid');
}

console.log('\nX. Dimensi wajib yang kosong ditandai, bukan didiamkan (EST-MTO-R35)');
// Sebelum ini, kolom beton tanpa B/H tetap menghasilkan volume beton, bekisting,
// besi, dan sengkang dari asumsi 30x30 cm setinggi 3 m — angka wajar, tanpa
// error, dan bisa lolos ke penawaran.
const kolomKosong = calculateMto('column', { col_type: 'beton', qty_per_floor: 4, height_per_floor: 3.5 });
chk('kolom beton tanpa B/H ditandai', (kolomKosong.missing_required || []).length, 2);
chk('sebutkan B', (kolomKosong.missing_required || []).some(m => m.includes('(B)')), true);
chk('sebutkan H', (kolomKosong.missing_required || []).some(m => m.includes('(H)')), true);

// Yang ditandai TIDAK dibuat invalid: elemen lama harus tetap terbaca di layar
// dan tetap bisa ditautkan ke RAB. Penolakannya ada di route POST/PUT.
chk('tetap menghasilkan baris', kolomKosong.lines.length > 0, true);
chk('bukan invalid', kolomKosong.variant, 'concrete');
chk('asumsinya disebut di catatan',
  kolomKosong.notes.some(n => n.includes('nilai asumsi')), true);

const kolomLengkap = calculateMto('column',
  { col_type: 'beton', qty_per_floor: 4, height_per_floor: 3.5, B: 0.3, H: 0.4 });
chk('kolom lengkap tidak ditandai', kolomLengkap.missing_required, undefined);

console.log('\nX2. Field wajib berbeda per varian (EST-MTO-R35)');
// Kolom WF tidak butuh B/H tapi WAJIB punya profil — tanpa itu beratnya diambil
// dari asumsi WF200x100 (21,3 kg/m).
const wfTanpaProfil = calculateMto('column', { col_type: 'wf', qty_per_floor: 4, height_per_floor: 3.5 });
chk('kolom WF wajib profil', (wfTanpaProfil.missing_required || [])[0]?.includes('wf_profile'), true);
chk('kolom WF tidak diminta B/H',
  (wfTanpaProfil.missing_required || []).some(m => m.includes('(B)')), false);

const wfLengkap = calculateMto('column',
  { col_type: 'wf', qty_per_floor: 4, height_per_floor: 3.5, wf_profile: 'WF250x125' });
chk('kolom WF dengan profil lolos', wfLengkap.missing_required, undefined);

// Gording boleh memakai panjangnya sendiri ATAU panjang total balok.
const gordingA = calculateMto('beam', { beam_type: 'gording', purlin_profile: 'C150x65', purlin_length: 120 });
chk('gording pakai purlin_length lolos', gordingA.missing_required, undefined);
const gordingB = calculateMto('beam', { beam_type: 'gording', purlin_profile: 'C150x65', total_length: 120 });
chk('gording pakai total_length lolos', gordingB.missing_required, undefined);
const gordingC = calculateMto('beam', { beam_type: 'gording', purlin_profile: 'C150x65' });
chk('gording tanpa keduanya ditandai', (gordingC.missing_required || []).length, 1);

// Dinding: layar sekarang cm, kontrak lama mm — dua-duanya sah.
const dindingCm = calculateMto('wall', { wall_type: 'bata_ringan', area: 100, thickness_cm: 15 });
chk('dinding thickness_cm lolos', dindingCm.missing_required, undefined);
const dindingMm = calculateMto('wall', { wall_type: 'bata_ringan', area: 100, thickness_mm: 150 });
chk('dinding thickness_mm lolos', dindingMm.missing_required, undefined);

// Atap datar 0 derajat itu sah — nol tidak boleh dianggap "belum diisi".
const atapDatar = calculateMto('roof', { roof_type: 'beton_dak', floor_area: 200, slope_deg: 0, dak_thick: 0.12 });
chk('kemiringan 0 derajat diterima', atapDatar.missing_required, undefined);

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);
