import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * PROP-REV-R52 — revision ledger proposal (fase 1).
 *
 * Sebelum ini `proposals.revision` hanyalah TEKS yang bisa diubah, dan seluruh
 * item menunjuk langsung ke `proposal_id`. Artinya: begitu proposal yang sudah
 * dikirim ke client dikembalikan ke `review` lalu di-submit lagi, baris yang
 * sama ditimpa dan `submitted_at` tertulis ulang.
 *
 * **Versi yang pernah diterima client tidak bisa direkonstruksi sama sekali** —
 * dan itulah yang dipegang saat terjadi sengketa lingkup atau harga. Perusahaan
 * tidak bisa membuktikan BOQ dan harga versi mana yang disetujui.
 *
 * `proposal_audit_logs` juga sudah lama ada, tapi pencarian source menemukan
 * NOL kode yang menulis ke sana — jadi tidak ada history bisnis yang bisa
 * diverifikasi.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:revisi
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
  const { dbGet, dbAll } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `REV.${stamp}`, name: `Beton Revisi ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  // Client sungguhan: tanpa `client_id` yang cocok, Deal ditolak 400 dan
  // seluruh bagian kontrak tidak akan pernah teruji.
  const klien = await call('POST', '/clients',
    { name: `PT Revisi ${stamp}`, client_type: 'buyer' }, master);
  const clientId = klien.json?.id ?? klien.json?.data?.id;

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji revisi ${stamp}`, client_id: clientId,
      client: `PT Revisi ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  const item = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 10 }, master);
  const itemId = item.json?.id;
  const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
  const ids = (inc.json?.items || []).map((x: any) => x.id);
  if (ids.length) {
    await call('PUT', `/estimator/proposals/${pid}/items/scope`,
      { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
  }
  chk('proposal uji siap', !!pid && !!itemId, true);

  try {
    console.log('\n1. Submit MEMBEKUKAN satu revisi berikut checksumnya');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);

    const r1 = await call('GET', `/estimator/proposals/${pid}/revisions`, undefined, master);
    chk('ada satu revisi', r1.json?.total, 1);
    const rev1 = r1.json?.items?.[0];
    chk('nomornya 1', Number(rev1?.revision_no), 1);
    chk('statusnya issued', rev1?.status, 'issued');
    chk('punya checksum', String(rev1?.lines_checksum || '').length, 64);
    chk('mencatat siapa yang menerbitkan', !!rev1?.issued_by, true);
    const totalAwal = Number(rev1?.total_project);
    chk('memotret nilai proposal', totalAwal > 0, true);

    console.log('\n2. Isi revisi bisa dibaca ulang — apa adanya saat diterbitkan');
    const isi1 = await call('GET', `/estimator/proposals/${pid}/revisions/${rev1.id}`, undefined, master);
    chk('barisnya tersimpan', (isi1.json?.lines || []).length > 0, true);
    chk('checksum dihitung ulang tetap cocok',
      isi1.json?.lines_checksum_sekarang, rev1?.lines_checksum);
    const qtyRev1 = Number((isi1.json?.lines || []).find((l: any) => !Number(l.is_section))?.qty);
    chk('qty terpotret 10', qtyRev1, 10);

    console.log('\n3. Kembali ke review lalu ubah nilainya — INI kasus yang dulu hilang');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    const ubah = await call('PUT', `/estimator/proposals/${pid}/items/${itemId}`, { qty: 25 }, master);
    chk('qty berhasil diubah', ubah.status, 200);

    // Revisi 1 TIDAK boleh ikut berubah.
    const isi1Lagi = await call('GET', `/estimator/proposals/${pid}/revisions/${rev1.id}`, undefined, master);
    chk('qty di revisi 1 TETAP 10',
      Number((isi1Lagi.json?.lines || []).find((l: any) => !Number(l.is_section))?.qty), 10);
    chk('nilai revisi 1 TETAP', Number(isi1Lagi.json?.total_project), totalAwal);
    chk('checksumnya pun tidak bergeser', isi1Lagi.json?.lines_checksum, rev1?.lines_checksum);

    console.log('\n4. Submit lagi membuat revisi BARU, yang lama jadi superseded');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const r2 = await call('GET', `/estimator/proposals/${pid}/revisions`, undefined, master);
    chk('sekarang dua revisi', r2.json?.total, 2);
    const rev2 = r2.json?.items.find((x: any) => Number(x.revision_no) === 2);
    const rev1After = r2.json?.items.find((x: any) => Number(x.revision_no) === 1);
    chk('revisi 1 ditandai superseded', rev1After?.status, 'superseded');
    chk('revisi 2 issued', rev2?.status, 'issued');
    chk('nilainya berbeda dari revisi 1',
      Number(rev2?.total_project) !== Number(rev1After?.total_project), true);
    chk('checksumnya pun berbeda', rev2?.lines_checksum !== rev1After?.lines_checksum, true);
    const isi2 = await call('GET', `/estimator/proposals/${pid}/revisions/${rev2.id}`, undefined, master);
    chk('qty di revisi 2 adalah 25',
      Number((isi2.json?.lines || []).find((l: any) => !Number(l.is_section))?.qty), 25);

    console.log('\n5. Dua revisi bisa direkonstruksi berdampingan — inti seluruh ledger ini');
    chk('revisi 1 masih 10 dan revisi 2 sudah 25',
      [Number((isi1Lagi.json?.lines || []).find((l: any) => !Number(l.is_section))?.qty),
       Number((isi2.json?.lines || []).find((l: any) => !Number(l.is_section))?.qty)],
      [10, 25]);

    console.log('\n6. Deal menunjuk revisi yang DITERIMA, bukan menebak dari timestamp');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'deal' }, master);
    const hdr: any = await dbGet('SELECT accepted_revision_id FROM proposals WHERE id = ?', [pid]);
    chk('header menunjuk revisi yang diterima', Number(hdr?.accepted_revision_id), Number(rev2.id));
    const revAccepted: any = await dbGet('SELECT status, accepted_by, accepted_at FROM proposal_revisions WHERE id = ?', [rev2.id]);
    chk('revisi 2 menjadi accepted', revAccepted?.status, 'accepted');
    chk('mencatat siapa yang menerima', !!revAccepted?.accepted_by, true);
    const rev1Final: any = await dbGet('SELECT status FROM proposal_revisions WHERE id = ?', [rev1.id]);
    chk('revisi 1 tetap superseded, tidak ikut berubah', rev1Final?.status, 'superseded');

    console.log('\n7. Kontrak yang lahir memotret nilai revisi yang diterima');
    const proj: any = await dbGet('SELECT project_id FROM proposals WHERE id = ?', [pid]);
    const kontrak: any = await dbGet('SELECT original_value, baseline_checksum FROM contracts WHERE project_id = ?', [proj?.project_id]);
    chk('nilai kontrak = nilai revisi yang diterima',
      Number(kontrak?.original_value), Number(rev2?.total_project));
    chk('checksum baseline kontrak = checksum revisi yang diterima',
      kontrak?.baseline_checksum, rev2?.lines_checksum);

    console.log('\n8. Audit trail yang selama ini kosong kini terisi');
    const audit = (await call('GET', `/estimator/proposals/${pid}/revisions`, undefined, master)).json?.audit || [];
    chk('ada jejaknya', audit.length > 0, true);
    const aksi = audit.map((a: any) => a.action);
    chk('transisi status tercatat', aksi.includes('status_change'), true);
    chk('penerbitan revisi tercatat', aksi.includes('revision_issued'), true);
    chk('penerimaan revisi tercatat', aksi.includes('revision_accepted'), true);
    chk('setiap jejak punya aktor', audit.every((a: any) => a.user_id !== null), true);
    const perpindahan = audit.filter((a: any) => a.action === 'status_change')
      .map((a: any) => `${a.before_value}→${a.after_value}`).reverse();
    chk('urutan perpindahannya utuh',
      perpindahan.join(', '),
      'draft→review, review→submitted, submitted→review, review→submitted, submitted→deal');

    console.log('\n9. Self-approval DICATAT — belum ditegakkan, dan itu disengaja');
    // Menegakkannya sekarang akan mengunci alur satu orang yang berjalan di
    // produksi hari ini. Yang bisa dilakukan tanpa merusak apa pun adalah
    // membuat keadaannya terlihat, sehingga kalau nanti diputuskan harus
    // dipisah, buktinya sudah ada.
    chk('penerbit = penyetuju ditandai', aksi.includes('sod_self_approval'), true);

    console.log('\n10. Deal yang DITOLAK tidak boleh meninggalkan revisi "diterima"');
    // Ini bug yang sempat saya buat sendiri dan tertangkap saat menguji:
    // `withTransaction` di jalur status mengembalikan `{ error, body }` untuk
    // penolakan — dan MENGEMBALIKAN NILAI bukan melempar, jadi transactionnya
    // tetap commit. Penerimaan revisi yang ditaruh sebelum gerbang Deal karena
    // itu tetap tertulis walau projectnya tidak pernah lahir: bukti kesepakatan
    // yang tidak menunjuk apa pun.
    const pGagal = await call('POST', '/estimator/proposals',
      { project_name: `Uji deal gagal ${stamp}`, client: `Client Tanpa Data ${stamp}`, status: 'draft' }, master);
    const pidGagal = pGagal.json?.id;
    await call('POST', `/estimator/proposals/${pidGagal}/items`, { ahsp_id: ahspId, qty: 4 }, master);
    const incG = await call('GET', `/estimator/proposals/${pidGagal}/items/incomplete`, undefined, master);
    const idsG = (incG.json?.items || []).map((x: any) => x.id);
    if (idsG.length) {
      await call('PUT', `/estimator/proposals/${pidGagal}/items/scope`,
        { item_ids: idsG, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pidGagal}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pidGagal}/status`, { status: 'submitted' }, master);
    const dealGagal = await call('PUT', `/estimator/proposals/${pidGagal}/status`, { status: 'deal' }, master);
    chk('deal ditolak karena client tidak cocok', dealGagal.status, 400);
    const hdrGagal: any = await dbGet(
      'SELECT status, project_id, accepted_revision_id FROM proposals WHERE id = ?', [pidGagal]);
    chk('statusnya TIDAK berpindah ke deal', hdrGagal?.status, 'submitted');
    chk('tidak ada project yang lahir', hdrGagal?.project_id, null);
    chk('dan TIDAK ada revisi yang ditandai diterima', hdrGagal?.accepted_revision_id, null);
    const revGagal: any = await dbGet(
      `SELECT COUNT(*) n FROM proposal_revisions WHERE proposal_id = ? AND status = 'accepted'`, [pidGagal]);
    chk('nol revisi berstatus accepted', Number(revGagal?.n), 0);

    console.log('\n11. Baris revisi tidak punya jalur tulis dari route mana pun');
    const { readFileSync } = await import('node:fs');
    const rute = readFileSync(new URL('../src/routes/estimator.routes.ts', import.meta.url), 'utf8');
    const tulis = rute.match(/UPDATE proposal_revision_lines|DELETE FROM proposal_revision_lines/g) || [];
    chk('nol UPDATE/DELETE terhadap baris revisi', tulis.length, 0);
    // Header revisi HANYA boleh berubah statusnya (superseded/accepted).
    const updateHeader = rute.match(/UPDATE proposal_revisions SET ([^`]*)/g) || [];
    chk('UPDATE header revisi hanya menyentuh status dan stempel waktunya',
      updateHeader.every(u => !/total_project|lines_checksum|direct_cost/.test(u)), true);

    console.log('\n12. Terjaga auth');
    chk('riwayat tanpa token 401',
      (await call('GET', `/estimator/proposals/${pid}/revisions`)).status, 401);
    chk('revisi milik proposal lain ditolak 404',
      (await call('GET', `/estimator/proposals/999999999/revisions/${rev1.id}`, undefined, master)).status, 404);

  } finally {
    console.log('\n13. Bersih-bersih');
    const { dbRun } = await import('../src/config/database');
    const proj: any = await dbGet('SELECT project_id FROM proposals WHERE id = ?', [pid]);
    if (proj?.project_id) await dbRun('DELETE FROM client_projects WHERE id = ?', [proj.project_id]).catch(() => {});
    const disapu = await sapuFixture(stamp);
    if (clientId) await dbRun('DELETE FROM clients WHERE id = ?', [clientId]).catch(() => {});
    chk('fixture tersapu', disapu.proposal >= 1, true);
    const sisa: any = await dbGet(
      `SELECT COUNT(*) n FROM proposal_revisions r
       WHERE NOT EXISTS (SELECT 1 FROM proposals p WHERE p.id = r.proposal_id)`);
    chk('nol revisi tanpa proposal (FK cascade)', Number(sisa?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
