import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Lapisan komersial penawaran: overhead & cadangan risiko.
 *
 * Kolomnya sudah lama ada dan `recalculateProposal()` sudah membacanya dengan
 * benar — tapi **tidak ada satu pun jalur untuk mengisinya**. Terverifikasi di
 * produksi: ketiga penawaran punya `overhead = 0` dan `risk_contingency = 0`,
 * sehingga total penawaran persis sama dengan biaya langsung. Satu-satunya
 * margin adalah 10% yang tertanam di harga AHSP (3.440 dari 3.469 AHSP aktif),
 * dan itu berarti proyek berisiko tinggi dihargai sama dengan pekerjaan rutin.
 *
 * Yang dijaga di sini: mode DINYATAKAN, bukan disimpulkan. Nominal 150 juta
 * bisa berarti "angka yang saya hitung" atau "5% yang kebetulan segitu" —
 * setahun kemudian saat diaudit, keduanya harus bisa dibedakan.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:komersial
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

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `KM.${stamp}`, name: `Beton komersial ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: `Bahan ${stamp}`,
      resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id;
  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji komersial ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  // Harga AHSP sudah termasuk overhead+profit, jadi nilainya bukan tepat 1jt.
  await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 100 }, master);
  const awal: any = await dbGet('SELECT direct_cost, total_project FROM proposals WHERE id = ?', [pid]);
  const dc0 = Number(awal?.direct_cost);
  chk('biaya langsung terisi', dc0 > 0, true);
  chk('INI KEADAAN LAMA — total = biaya langsung, tanpa markup',
    Number(awal?.total_project), dc0);

  try {
    console.log('\n1. Mode PERSEN — ikut bergerak saat volume berubah');
    const r1 = await call('PUT', `/estimator/proposals/${pid}/komersial`, {
      overhead_mode: 'persen', overhead_pct: 5,
      contingency_mode: 'persen', contingency_pct: 3,
    }, master);
    chk('tersimpan', r1.status, 200);
    chk('overhead = 5% biaya langsung', Number(r1.json?.overhead), Math.round(dc0 * 5) / 100);
    chk('cadangan = 3%', Number(r1.json?.risk_contingency), Math.round(dc0 * 3) / 100);
    chk('total = langsung + keduanya',
      Number(r1.json?.total_project),
      Math.round((dc0 + dc0 * 0.05 + dc0 * 0.03) * 100) / 100);
    chk('markup efektif dilaporkan 8%', Number(r1.json?.markup_efektif_pct), 8);
    // Dan ini yang membedakan persen dari nominal: volume naik → markup ikut.
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 100 }, master);
    const setelah: any = await dbGet(
      'SELECT direct_cost, overhead, total_project FROM proposals WHERE id = ?', [pid]);
    const dc1 = Number(setelah?.direct_cost);
    chk('biaya langsung berlipat', Math.round(dc1), Math.round(dc0 * 2));
    chk('overhead IKUT bergerak', Number(setelah?.overhead), Math.round(dc1 * 5) / 100);

    console.log('\n2. Mode NOMINAL — TIDAK ikut bergerak, dan itu bedanya');
    const r2 = await call('PUT', `/estimator/proposals/${pid}/komersial`, {
      overhead_mode: 'nominal', overhead: 150000000,
      contingency_mode: 'nominal', risk_contingency: 50000000,
    }, master);
    chk('tersimpan', r2.status, 200);
    chk('overhead persis 150 juta', Number(r2.json?.overhead), 150000000);
    chk('persennya dikosongkan', r2.json?.overhead_pct, null);
    // Volume berubah lagi — nominal harus DIAM.
    await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 50 }, master);
    const setelah2: any = await dbGet(
      'SELECT direct_cost, overhead, risk_contingency, total_project FROM proposals WHERE id = ?', [pid]);
    chk('biaya langsung naik lagi', Number(setelah2?.direct_cost) > dc1, true);
    chk('overhead TETAP 150 juta', Number(setelah2?.overhead), 150000000);
    chk('cadangan TETAP 50 juta', Number(setelah2?.risk_contingency), 50000000);
    chk('total = langsung + 200 juta',
      Number(setelah2?.total_project),
      Math.round((Number(setelah2?.direct_cost) + 200000000) * 100) / 100);

    console.log('\n3. Mode DINYATAKAN, bukan disimpulkan dari ada/tidaknya persen');
    const row: any = await dbGet(
      'SELECT overhead_mode, overhead_pct, contingency_mode FROM proposals WHERE id = ?', [pid]);
    chk('modenya tersimpan eksplisit', row?.overhead_mode, 'nominal');
    chk('dan bisa dibedakan dari mode persen', row?.overhead_pct, null);

    console.log('\n4. Nilai tidak masuk akal ditolak, bukan dibulatkan diam-diam');
    const cek = async (body: any, kode: string) =>
      chk(kode, (await call('PUT', `/estimator/proposals/${pid}/komersial`, body, master)).json?.code, kode);
    await cek({ overhead_mode: 'persen', overhead_pct: 150 }, 'PERSEN_DI_LUAR_RENTANG');
    await cek({ overhead_mode: 'persen', overhead_pct: -5 }, 'PERSEN_DI_LUAR_RENTANG');
    await cek({ overhead_mode: 'nominal', overhead: -1 }, 'NOMINAL_TIDAK_VALID');
    await cek({ overhead_mode: 'kira-kira' }, 'MODE_TIDAK_DIKENAL');
    const tetap: any = await dbGet('SELECT overhead FROM proposals WHERE id = ?', [pid]);
    chk('tidak satu pun penolakan mengubah nilainya', Number(tetap?.overhead), 150000000);

    console.log('\n5. Angkanya ikut membeku di revisi — berikut MODE-nya');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const rev: any = await dbGet(
      `SELECT overhead, risk_contingency, total_project, overhead_mode, overhead_pct
       FROM proposal_revisions WHERE proposal_id = ? ORDER BY revision_no DESC LIMIT 1`, [pid]);
    chk('nominalnya terbawa', Number(rev?.overhead), 150000000);
    // Tanpa mode, revisi terbit hanya menyimpan angkanya dan tidak ada yang
    // bisa menjelaskan angka itu berasal dari persen berapa.
    chk('MODE-nya ikut dibekukan', rev?.overhead_mode, 'nominal');
    chk('total revisi = total proposal',
      Number(rev?.total_project), Number(setelah2?.total_project));

    console.log('\n6. Proposal terkunci menolak perubahan komersial');
    const tolak = await call('PUT', `/estimator/proposals/${pid}/komersial`,
      { overhead_mode: 'persen', overhead_pct: 20 }, master);
    chk('ditolak 409', tolak.status, 409);
    chk('kodenya PROPOSAL_LOCKED', tolak.json?.code, 'PROPOSAL_LOCKED');
    const akhir: any = await dbGet('SELECT overhead FROM proposals WHERE id = ?', [pid]);
    chk('nilainya tidak bergeser', Number(akhir?.overhead), 150000000);

    console.log('\n7. Terjaga auth');
    chk('tanpa token 401',
      (await call('PUT', `/estimator/proposals/${pid}/komersial`, { overhead_mode: 'nominal', overhead: 1 })).status, 401);

    console.log('\n8. Layar bisa mengisinya — bukan cuma menampilkan');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'EstimatorProposalEditor.vue'), 'utf8');
    chk('layar memanggil endpoint komersial', layar.includes('/komersial`'), true);
    chk('mode bisa dipilih di layar', layar.includes("komersial.overhead_mode"), true);
    // Ringkasan dimuat ulang dari server: nominal mode persen dihitung di sana.
    chk('ringkasan dimuat ulang dari server sesudah menyimpan',
      /simpanKomersial[\s\S]{0,700}loadSummary\(\)/.test(layar), true);
    // Markup efektif adalah angka yang dipakai memutuskan — harus terlihat.
    chk('markup efektif ditampilkan', layar.includes('markupEfektif'), true);
    chk('dan dijelaskan bahwa AHSP sudah memuat ~10%',
      layar.includes('tertanam di harga AHSP'), true);

  } finally {
    console.log('\n9. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`KM.${stamp}`]);
    chk('fixture tersapu', disapu.proposal >= 1, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
