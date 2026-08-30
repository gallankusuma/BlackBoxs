import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Pembandingan antar revisi penawaran.
 *
 * Ledger sudah menyimpan tiap revisi utuh, tapi tidak ada yang menyandingkannya.
 * Saat client bertanya "kenapa naik 180 juta", satu-satunya jawaban adalah
 * membuka dua PDF dan membandingkannya baris per baris.
 *
 * Yang diuji paling keras di sini bukan daftar selisihnya, melainkan
 * **penguraiannya** menjadi efek VOLUME dan efek HARGA:
 *
 *   efek volume = (qty₂ − qty₁) × harga₁
 *   efek harga  = qty₂ × (harga₂ − harga₁)
 *
 * Keduanya harus berjumlah PERSIS Δnilai — itu identitas aljabar, bukan
 * pendekatan. Tanpa penguraian ini, "beton naik 180 juta" tidak bisa dijawab:
 * volumenya bertambah, atau harganya yang naik? Konsekuensi komersialnya
 * berbeda sama sekali.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:banding
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  const mk = async (kode: string, nama: string, harga: number) =>
    (await call('POST', '/estimator/ahsp', {
      kode, name: nama, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: `B ${stamp}`,
        resource_satuan: 'm3', koefisien: 1, resource_harga: harga }],
    }, master)).json?.id;
  const aBeton = await mk(`RB1.${stamp}`, `Beton ${stamp}`, 1000000);
  const aGali  = await mk(`RB2.${stamp}`, `Galian ${stamp}`, 100000);
  const aBaru  = await mk(`RB3.${stamp}`, `Bekisting ${stamp}`, 300000);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji banding ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  const iBeton = (await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: aBeton, qty: 100 }, master)).json?.id;
  const iGali  = (await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: aGali, qty: 50 }, master)).json?.id;

  const terbitkan = async () => {
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) await call('PUT', `/estimator/proposals/${pid}/items/scope`,
      { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    const r1 = await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    const r2 = await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    // Kegagalan penerbitan tidak boleh diam — fixture yang tidak lolos gerbang
    // kelayakan akan membuat seluruh asersi berikutnya gagal tanpa sebab jelas.
    if (r1.status >= 400 || r2.status >= 400) {
      chk(`penerbitan revisi berhasil (${String(r2.json?.code || r2.status)})`, false, true);
    }
  };

  try {
    console.log('\n1. Belum ada pembanding — dibedakan dari "tidak ada selisih"');
    const kosong = await call('GET', `/estimator/proposals/${pid}/revisions/banding`, undefined, master);
    chk('dijawab 200, bukan galat', kosong.status, 200);
    chk('dinyatakan belum bisa dibandingkan', kosong.json?.bisa_dibandingkan, false);
    chk('dan sebabnya disebut', String(kosong.json?.sebab || '').length > 10, true);

    await terbitkan();
    const satu = await call('GET', `/estimator/proposals/${pid}/revisions/banding`, undefined, master);
    chk('satu revisi pun belum bisa dibandingkan', satu.json?.bisa_dibandingkan, false);

    console.log('\n2. Revisi kedua: volume naik, harga naik, satu baris baru, satu dihapus');
    await dbRun("UPDATE proposals SET status = 'draft' WHERE id = ?", [pid]);
    // Beton: volume 100 → 120 (harga tetap)
    await call('PUT', `/estimator/proposals/${pid}/items/${iBeton}`, { qty: 120 }, master);
    // Galian: harga satuannya dinaikkan (volume tetap 50)
    // Dipisah dua pernyataan dengan sengaja: dalam satu UPDATE, MySQL memakai
    // nilai yang SUDAH diubah pada assignment berikutnya, sehingga
    // `total_price = qty * unit_price_snapshot * 2` menghasilkan 4× — baris
    // jadi tidak konsisten dan gerbang kelayakan submit menolaknya (benar).
    await dbRun('UPDATE proposal_items SET unit_price_snapshot = unit_price_snapshot * 2 WHERE id = ?', [iGali]);
    await dbRun('UPDATE proposal_items SET total_price = qty * unit_price_snapshot WHERE id = ?', [iGali]);
    // Baris baru + baris dihapus
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: aBaru, qty: 10 }, master);
    await terbitkan();

    const b = await call('GET', `/estimator/proposals/${pid}/revisions/banding`, undefined, master);
    chk('bisa dibandingkan', b.json?.bisa_dibandingkan, true);
    chk('membandingkan revisi 1 → 2',
      `${b.json?.dari?.revision_no}→${b.json?.ke?.revision_no}`, '1→2');
    chk('satu baris ditambah', b.json?.ringkasan?.jml_ditambah, 1);
    chk('dua baris berubah', b.json?.ringkasan?.jml_berubah, 2);

    console.log('\n3. INI YANG MENENTUKAN — penguraian volume vs harga');
    const beton = (b.json?.perubahan || []).find((x: any) => x.kode === `RB1.${stamp}`);
    chk('beton: volume berubah', `${beton?.qty_dari}→${beton?.qty_ke}`, '100→120');
    chk('beton: harganya TIDAK berubah', beton?.harga_dari, beton?.harga_ke);
    // Seluruh kenaikan beton harus jatuh ke efek VOLUME, nol ke efek harga.
    chk('beton: efek harga nol', Number(beton?.efek_harga), 0);
    chk('beton: seluruh deltanya efek volume',
      Number(beton?.efek_volume), Number(beton?.delta_nilai));

    const gali = (b.json?.perubahan || []).find((x: any) => x.kode === `RB2.${stamp}`);
    chk('galian: volume TIDAK berubah', gali?.qty_dari, gali?.qty_ke);
    chk('galian: efek volume nol', Number(gali?.efek_volume), 0);
    chk('galian: seluruh deltanya efek harga',
      Number(gali?.efek_harga), Number(gali?.delta_nilai));

    // Identitas aljabar: efek volume + efek harga = Δnilai, untuk SETIAP baris.
    const menyimpang = (b.json?.perubahan || [])
      .filter((x: any) => x.jenis === 'berubah')
      .filter((x: any) => Math.abs((x.efek_volume + x.efek_harga) - x.delta_nilai) > 0.02);
    chk('penguraian selalu berjumlah persis Δnilai', menyimpang.length, 0);

    console.log('\n4. Ringkasan berjumlah ke selisih biaya langsung');
    const r = b.json?.ringkasan;
    const jumlah = Number(r?.efek_volume) + Number(r?.efek_harga)
                 + Number(r?.nilai_ditambah) + Number(r?.nilai_dihapus);
    chk('volume + harga + tambah + hapus = Δ biaya langsung',
      Math.abs(jumlah - Number(r?.delta_direct_cost)) < 0.05, true);

    console.log('\n5. Lapisan komersial dilaporkan TERPISAH');
    // Kenaikan karena markup bukan kenaikan karena pekerjaan bertambah, dan
    // client berhak tahu bedanya.
    chk('delta overhead ada di ringkasan', r?.delta_overhead !== undefined, true);
    chk('delta cadangan ada di ringkasan', r?.delta_contingency !== undefined, true);
    chk('delta total = delta langsung + delta komersial',
      Math.abs(Number(r?.delta_total)
        - (Number(r?.delta_direct_cost) + Number(r?.delta_overhead) + Number(r?.delta_contingency))) < 0.05,
      true);

    console.log('\n6. Terbesar dulu — yang paling menggerakkan angka ditanya lebih dulu');
    const urut = (b.json?.perubahan || []).map((x: any) => Math.abs(x.delta_nilai));
    chk('diurutkan menurun', urut.every((v: number, i: number) => i === 0 || urut[i-1] >= v), true);

    console.log('\n7. Revisi tertentu bisa diminta, yang ngawur ditolak');
    chk('bisa memilih revisi eksplisit',
      (await call('GET', `/estimator/proposals/${pid}/revisions/banding?dari=1&ke=2`, undefined, master))
        .json?.dari?.revision_no, 1);
    chk('revisi tidak ada 404',
      (await call('GET', `/estimator/proposals/${pid}/revisions/banding?dari=1&ke=99`, undefined, master)).status, 404);
    chk('membandingkan dengan dirinya sendiri ditolak',
      (await call('GET', `/estimator/proposals/${pid}/revisions/banding?dari=2&ke=2`, undefined, master)).json?.code,
      'REVISI_SAMA');

    console.log('\n8. Rute literal tidak tertelan /:revId');
    // Kalau urutan pendaftarannya terbalik, Express mencocokkan "banding"
    // sebagai revId dan endpoint ini tidak pernah terpanggil.
    chk('/banding bukan dianggap revId',
      (await call('GET', `/estimator/proposals/${pid}/revisions/banding`, undefined, master))
        .json?.bisa_dibandingkan, true);

    console.log('\n9. Terjaga auth');
    chk('tanpa token 401', (await call('GET', `/estimator/proposals/${pid}/revisions/banding`)).status, 401);

    console.log('\n10. Layar menampilkan penguraiannya, bukan cuma selisih');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'EstimatorProposalEditor.vue'), 'utf8');
    chk('layar memanggil endpoint banding', layar.includes('/revisions/banding'), true);
    // Inti fiturnya: "karena volume" vs "karena harga" harus terlihat terpisah.
    chk('efek volume ditampilkan', layar.includes('efek_volume'), true);
    chk('efek harga ditampilkan', layar.includes('efek_harga'), true);
    chk('revisi pembanding bisa dipilih', layar.includes('bandingDari'), true);
    // Perubahan markup dipisahkan dari perubahan pekerjaan.
    chk('perubahan lapisan komersial dipisah',
      layar.includes('delta_overhead') && layar.includes('delta_direct_cost'), true);

  } finally {
    console.log('\n11. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`RB1.${stamp}`, `RB2.${stamp}`, `RB3.${stamp}`]);
    chk('fixture tersapu', disapu.proposal >= 1, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
