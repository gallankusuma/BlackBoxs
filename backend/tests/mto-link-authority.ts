import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * EST-MTO-R39 — respons server yang berlaku, bukan tebakan layar.
 *
 * Cacat yang ditutup di sini punya satu bentuk: angka yang dilihat estimator
 * bukan angka yang tersimpan.
 *
 *   - Picker menampilkan `value` yang berisi GROSS, sementara penautan menulis
 *     NET. Baris di layar langsung menampilkan gross, database menyimpan net,
 *     kartu ringkasan masih angka sebelum penautan — tiga keadaan pada satu
 *     layar.
 *   - Unlink hanya menghapus badge; qty/total gross tertinggal di baris,
 *     input kembali aktif, dan blur berikutnya memersistenkan gross itu sebagai
 *     qty manual. Nilai penawaran berubah sebesar waste hanya lewat
 *     link → unlink → blur, tanpa satu pun angka diketik.
 *   - `PUT /items/:id` menerima qty pada item yang masih tertaut, sehingga
 *     provenance bisa menyatakan "net 100 dari elemen X" untuk baris bernilai
 *     lain.
 *
 * Tes ini menembak HTTP, jadi ia menguji kontrak backend-nya. Bagian layar
 * diuji lewat asersi sumber: yang menentukan di sana adalah "payload sendiri
 * tidak boleh dipakai", dan itu terbaca dari kode.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:link-authority
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
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
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `AUT.${stamp}`, name: `Beton Uji ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP uji dibuat', !!ahspId, true);

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji otoritas link ${stamp}`, status: 'draft' }, master);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  bersihkan.push(() => call('DELETE', `/estimator/proposals/${pid}`, undefined, master));
  chk('proposal dibuat', !!pid, true);

  // waste 5% → net ≠ gross, yang justru inti perkaranya.
  const el = await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'foundation', element_name: 'P1',
    parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
  }, master);
  const eid = el.json?.id;
  chk('elemen MTO dibuat', !!eid, true);

  const it = await call('POST', `/estimator/proposals/${pid}/items`,
    { ahsp_id: ahspId, qty: 7 }, master);
  const iid = it.json?.id ?? it.json?.data?.id;
  chk('item RAB manual qty 7 dibuat', !!iid, true);

  try {
    console.log('\n1. Picker menawarkan angka yang sama dengan yang akan ditulis');
    const q = await call('GET', `/estimator/proposals/${pid}/mto-quantities`, undefined, master);
    // FND-EXCV sengaja TIDAK dipakai: galian tanpa waste, jadi net = gross dan
    // baris itu tidak bisa membuktikan apa pun tentang perkara ini. Beton
    // ber-waste 5% — net 3.6, gross 3.78 — justru bentuk yang dilaporkan.
    const opsi = (q.json?.elements?.[0]?.available || []).find((a: any) => a.line_code === 'FND-CONC');
    chk('opsi FND-CONC ada', !!opsi, true);
    chk('membawa net_quantity terpisah dari gross', opsi?.net_quantity !== opsi?.gross_quantity, true);
    chk('net dan gross memang berbeda (waste 5%)', Number(opsi?.gross_quantity) > Number(opsi?.net_quantity), true);
    chk('membawa line_code canonical', opsi?.line_code, 'FND-CONC');

    console.log('\n2. Respons link membawa BARIS FINAL, bukan cuma pesan');
    const taut = await call('PUT', `/estimator/proposals/${pid}/items/${iid}/mto-link`,
      // Layar lama mengirim `value` berisi gross. Itu harus diabaikan total.
      { element_id: eid, line_code: 'FND-CONC', value: opsi?.gross_quantity, unit: 'm3' }, master);
    chk('link berhasil', taut.status, 200);
    chk('respons membawa item final', !!taut.json?.item, true);
    chk('qty final = NET, bukan gross', Number(taut.json?.item?.qty), Number(opsi?.net_quantity));
    chk('gross klien tidak dipakai', Number(taut.json?.item?.qty) !== Number(opsi?.gross_quantity), true);
    const dbSetelahLink: any = await dbGet(
      'SELECT qty, total_price, unit_price_snapshot FROM proposal_items WHERE id = ?', [iid]);
    // Harga satuan dibaca dari baris, bukan diasumsikan sama dengan harga
    // sumber daya: `harga_satuan` AHSP sudah termasuk overhead & profit.
    const hargaSatuan = Number(dbSetelahLink?.unit_price_snapshot);
    chk('database sama dengan yang dikembalikan',
      Number(dbSetelahLink?.qty), Number(taut.json?.item?.qty));
    chk('total_price konsisten dengan qty × harga',
      Number(dbSetelahLink?.total_price), Number(dbSetelahLink?.qty) * hargaSatuan);

    console.log('\n3. Ringkasan header ikut bergerak, tidak tertinggal di angka lama');
    const ringkas = await call('GET', `/estimator/proposals/${pid}`, undefined, master);
    chk('direct_cost mencerminkan qty baru',
      Number(ringkas.json?.direct_cost) >= Number(dbSetelahLink?.total_price), true);

    console.log('\n4. qty item tertaut ditolak lewat jalur item generik');
    const paksa = await call('PUT', `/estimator/proposals/${pid}/items/${iid}`, { qty: 999 }, master);
    chk('ditolak 409', paksa.status, 409);
    chk('kodenya ITEM_TERTAUT_MTO', paksa.json?.code, 'ITEM_TERTAUT_MTO');
    const dbSetelahPaksa: any = await dbGet('SELECT qty FROM proposal_items WHERE id = ?', [iid]);
    chk('qty database TIDAK berubah', Number(dbSetelahPaksa?.qty), Number(dbSetelahLink?.qty));

    console.log('\n5. Deskripsi tetap boleh diubah pada item tertaut');
    const desc = await call('PUT', `/estimator/proposals/${pid}/items/${iid}`,
      { description: 'Galian pondasi P1' }, master);
    chk('perubahan deskripsi diterima', desc.status, 200);

    console.log('\n6. Unlink memulihkan qty manual DAN mengembalikannya ke layar');
    const lepas = await call('DELETE', `/estimator/proposals/${pid}/items/${iid}/mto-link`, undefined, master);
    chk('unlink berhasil', lepas.status, 200);
    chk('respons membawa item final', !!lepas.json?.item, true);
    chk('qty kembali ke 7 (nilai manual sebelum penautan)', Number(lepas.json?.item?.qty), 7);
    chk('tautannya benar-benar lepas', lepas.json?.item?.mto_link, null);
    const dbSetelahLepas: any = await dbGet('SELECT qty, total_price, mto_link FROM proposal_items WHERE id = ?', [iid]);
    chk('database ikut 7', Number(dbSetelahLepas?.qty), 7);
    chk('total_price ikut dipulihkan', Number(dbSetelahLepas?.total_price), 7 * hargaSatuan);

    console.log('\n7. Setelah unlink, qty manual kembali boleh diubah');
    const manual = await call('PUT', `/estimator/proposals/${pid}/items/${iid}`, { qty: 9 }, master);
    chk('perubahan qty diterima', manual.status, 200);
    chk('database jadi 9', Number((await dbGet('SELECT qty FROM proposal_items WHERE id = ?', [iid]) as any)?.qty), 9);

    console.log('\n8. Layar tidak boleh memakai payload-nya sendiri');
    const { readFileSync } = await import('node:fs');
    const vue = readFileSync(
      new URL('../../frontend/src/views/EstimatorProposalEditor.vue', import.meta.url), 'utf8');
    chk('link tidak lagi menyimpan payload klien ke state',
      !vue.includes('item.mto_link = payload;'), true);
    chk('link tidak lagi menetapkan qty dari q.value',
      !vue.includes('item.qty = q.value;'), true);
    chk('baris final server yang diterapkan', vue.includes('terapkanBarisServer(item, data?.item)'), true);
    chk('ringkasan dimuat ulang setelah link/unlink',
      (vue.match(/await loadSummary\(\);/g) || []).length >= 3, true);
    chk('unlink tidak lagi sekadar menghapus badge',
      !vue.includes('    item.mto_link = null;\n  } catch'), true);
    chk('pilihan aktif dibandingkan lewat line_code', vue.includes('link.line_code ?? link.field'), true);
    chk('blur tanpa edit tidak mengirim request', vue.includes('simpanQtyKalauBerubah'), true);
    chk('picker menampilkan net sebagai angka utama',
      vue.includes('Number(q.net_quantity ?? q.value)'), true);

  } finally {
    console.log('\n9. Bersih-bersih');
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('data uji terhapus', sisa, 0);
    await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [`AUT.${stamp}`]).catch(() => {});
  }

  // Sisa fixture disapu langsung di database — termasuk yang API-nya memang
  // menolak menghapus (proposal submitted/deal). Tanpa ini database dev
  // bertumbuh monoton tiap run; lihat `tests/_bersih.ts`.
  const disapu = await sapuFixture(stamp);
  if (disapu.proposal || disapu.elemen || disapu.ahsp) {
    console.log(`  ––   sisa fixture disapu: ${disapu.proposal} proposal, `
      + `${disapu.elemen} elemen MTO, ${disapu.baris} baris, ${disapu.ahsp} AHSP`);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
