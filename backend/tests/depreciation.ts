/**
 * Unit test rumus depresiasi (AST-003, AST-010).
 * Murni perhitungan — tidak butuh database maupun server.
 *
 * Jalankan: npm run test:depreciation
 */
import { calcDepreciation } from '../src/utils/depreciation';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
};
const near = (label: string, actual: number, expected: number, tol = 0.02) => {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`  ok   ${label} → ${actual}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${actual}, harusnya ≈${expected}`); }
};

// Aset acuan: 120 juta, residu 20 juta, umur 10 tahun, mulai 1 Jan 2020
const base = {
  purchase_price: 120_000_000,
  salvage_value: 20_000_000,
  useful_life_years: 10,
  purchase_date: '2020-01-01',
};

console.log('1. Garis lurus');
{
  // Basis 100 juta / 120 bulan = 833.333,33 per bulan
  const r = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2020-01-01');
  near('bulan ke-0: akumulasi nol', r.accumulated_depreciation, 0);
  near('penyusutan per bulan', r.monthly_depreciation, 833_333.33);

  const y1 = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2021-01-01');
  near('setelah 12 bulan', y1.accumulated_depreciation, 10_000_000);
  near('nilai buku', y1.book_value, 110_000_000);
  chk('persen tersusut', y1.percent_depreciated, 10);

  const end = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2030-01-01');
  near('akhir umur: akumulasi = basis', end.accumulated_depreciation, 100_000_000);
  near('nilai buku = residu', end.book_value, 20_000_000);

  const past = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2040-01-01');
  near('lewat umur ekonomis tidak menembus residu', past.book_value, 20_000_000);
}

console.log('\n2. Saldo menurun — dulu diam-diam dihitung garis lurus');
{
  const dbAsset = { ...base, depreciation_method: 'declining_balance' };
  const sl = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2021-01-01');
  const db = calcDepreciation(dbAsset, '2021-01-01');

  chk('hasilnya BERBEDA dari garis lurus', db.accumulated_depreciation !== sl.accumulated_depreciation, true);
  chk('saldo menurun lebih besar di tahun awal', db.accumulated_depreciation > sl.accumulated_depreciation, true);

  // Double-declining: rate = 2/10 = 20%/tahun, 1,667%/bulan atas nilai buku berjalan.
  // Setelah 12 bulan: 120jt × (1 - 0,2/12)^12 ≈ 98,17jt → akumulasi ≈ 21,83jt
  near('akumulasi 12 bulan (double-declining)', db.accumulated_depreciation, 21_830_000, 100_000);

  const late = calcDepreciation(dbAsset, '2035-01-01');
  near('tidak pernah menembus nilai residu', late.book_value, 20_000_000, 1);

  // Rate eksplisit menang atas default
  const custom = calcDepreciation({ ...dbAsset, depreciation_rate: 0.5 }, '2021-01-01');
  chk('rate eksplisit dipakai', custom.accumulated_depreciation > db.accumulated_depreciation, true);
}

console.log('\n3. AST-010 — aset non-depreciable');
{
  const land = calcDepreciation({ ...base, is_depreciable: 0 }, '2030-01-01');
  chk('akumulasi nol', land.accumulated_depreciation, 0);
  chk('nilai buku = harga perolehan', land.book_value, 120_000_000);
  chk('penyusutan bulanan nol', land.monthly_depreciation, 0);
  chk('ada alasannya', land.depreciation_note, 'Kategori aset ini tidak disusutkan');
}

console.log('\n4. Tanggal mulai depresiasi');
{
  // Dibeli Jan 2020, baru siap dipakai Jul 2020 → per Jan 2021 hanya 6 bulan
  const delayed = calcDepreciation(
    { ...base, in_service_date: '2020-07-01', depreciation_method: 'straight_line' }, '2021-01-01');
  near('dihitung dari tanggal siap pakai', delayed.accumulated_depreciation, 5_000_000);

  const noDate = calcDepreciation({ ...base, purchase_date: null }, '2021-01-01');
  chk('tanpa tanggal perolehan → nol', noDate.accumulated_depreciation, 0);
  chk('disertai alasan', noDate.depreciation_note, 'Tanggal perolehan belum diisi');

  const noPrice = calcDepreciation({ ...base, purchase_price: 0 }, '2021-01-01');
  chk('tanpa harga → nol', noPrice.accumulated_depreciation, 0);
}

console.log('\n5. Aset disposed berhenti disusutkan');
{
  const disposed = calcDepreciation({
    ...base, depreciation_method: 'straight_line',
    status: 'disposed', disposed_date: '2021-01-01',
  }, '2030-01-01'); // ditanya jauh setelah disposal
  near('berhenti pada tanggal disposal', disposed.accumulated_depreciation, 10_000_000);
  near('nilai buku beku', disposed.book_value, 110_000_000);
}

console.log('\n6. as_of_date — nilai buku pada tanggal tertentu');
{
  const a = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2022-01-01');
  const b = calcDepreciation({ ...base, depreciation_method: 'straight_line' }, '2023-01-01');
  near('2 tahun', a.accumulated_depreciation, 20_000_000);
  near('3 tahun', b.accumulated_depreciation, 30_000_000);
  chk('tanggal berbeda menghasilkan angka berbeda', a.book_value !== b.book_value, true);
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);
