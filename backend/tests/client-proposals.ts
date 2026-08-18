import 'dotenv/config';
/**
 * Tes tab Proposal pada CRM Client.
 *
 * Bug yang dibuktikan: detail client membaca tabel kedua `client_proposals` yang
 * tidak punya relasi apa pun ke proposal Estimator maupun project. Di produksi
 * tabel itu berisi **0 baris** sementara `proposals` berisi penawaran sungguhan
 * yang semuanya sudah ber-`client_id` — jadi tab ini selalu kosong.
 *
 * Kekosongan itu ditutupi frontend dengan menyisipkan dua record karangan
 * (`PROPOSAL #6` dan `#15`, status "Accepted"/"Sent") sebagai kalau-kalau
 * transaksi nyata. Sales, estimator, dan manajemen karena itu punya jawaban
 * berbeda untuk pipeline dan nilai penawaran yang sama.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:client-proposals
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
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: res.status, json, text };
}

const sen = (v: unknown) => Math.round(Number(v || 0) * 100);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbRun } = await import('../src/config/database');

  try {
    const klien = await call('POST', '/clients',
      { name: `PT Uji Tab Proposal ${stamp}`, client_type: 'buyer' }, master);
    chk('client uji dibuat', klien.status, 201);
    const clientId = klien.json?.id;
    bersihkan.push(() => call('DELETE', `/clients/${clientId}`, undefined, master));

    // ── 1. Client tanpa proposal → benar-benar kosong ───────────────────────
    // Sebelum perbaikan, layar tetap menampilkan dua proposal karangan di sini.
    console.log('\n1. Client tanpa proposal menampilkan kekosongan, bukan data karangan');
    const kosong = await call('GET', `/clients/${clientId}`, undefined, master);
    chk('detail client terbaca', kosong.status, 200);
    const dKosong = kosong.json?.data ?? kosong.json;
    chk('proposals berupa array', Array.isArray(dKosong?.proposals), true);
    chk('isinya kosong', (dKosong?.proposals || []).length, 0);

    // ── 2. Proposal estimator nyata muncul ──────────────────────────────────
    console.log('\n2. Proposal Estimator milik client ini muncul');
    const p1 = await call('POST', '/estimator/proposals', {
      project_name: `Penawaran Satu ${stamp}`, client_id: clientId,
      client: `PT Uji Tab Proposal ${stamp}`, lokasi: 'Cilegon', revision: 'Rev-1',
    }, master);
    const p1Id = p1.json?.id ?? p1.json?.data?.id;
    chk('proposal estimator dibuat', !!p1Id, true);
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${p1Id}`, undefined, master));

    // Nilai kontraknya diisi lewat recalculate yang dipicu penambahan item.
    const ahsp = await call('POST', '/estimator/ahsp', {
      kode: `TEST-CP-${stamp}`, name: `AHSP CP ${stamp}`, satuan: 'ls',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Paket',
                resource_satuan: 'ls', koefisien: 1, resource_harga: 2000000 }],
    }, master);
    await call('POST', `/estimator/proposals/${p1Id}/items`, { ahsp_id: ahsp.json?.id, qty: 3 }, master);

    const isi = await call('GET', `/clients/${clientId}`, undefined, master);
    const props: any[] = (isi.json?.data ?? isi.json)?.proposals || [];
    chk('proposal muncul di tab client', props.length, 1);
    const p = props[0];
    chk('id-nya proposal estimator, bukan tabel lain', Number(p?.id), Number(p1Id));
    chk('nomor proposalnya terbawa', typeof p?.proposal_number === 'string' && p.proposal_number.length > 0, true);
    chk('revision terbawa', p?.revision, 'Rev-1');
    chk('status memakai kosakata estimator', p?.status, 'draft');
    chk('field tanggal tersedia sesuai kontrak layar', !!p?.date, true);

    // Nilai harus sama dengan yang dilihat Estimator — bukan angka lain.
    const dariEstimator = await call('GET', `/estimator/proposals/${p1Id}`, undefined, master);
    const totalEstimator = (dariEstimator.json?.data ?? dariEstimator.json)?.total_project;
    chk('nilainya sama dengan Estimator', sen(p?.amount), sen(totalEstimator));
    chk('nilainya bertipe number, bukan string DECIMAL', typeof p?.amount, 'number');

    // ── 3. Proposal client lain tidak ikut terbawa ──────────────────────────
    console.log('\n3. Proposal client lain tidak bocor ke tab ini');
    const klien2 = await call('POST', '/clients',
      { name: `PT Uji Lain ${stamp}`, client_type: 'buyer' }, master);
    const client2Id = klien2.json?.id;
    bersihkan.push(() => call('DELETE', `/clients/${client2Id}`, undefined, master));
    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Penawaran Client Lain ${stamp}`, client_id: client2Id }, master);
    const p2Id = p2.json?.id ?? p2.json?.data?.id;
    bersihkan.push(() => call('DELETE', `/estimator/proposals/${p2Id}`, undefined, master));

    const lagi = await call('GET', `/clients/${clientId}`, undefined, master);
    const propsLagi: any[] = (lagi.json?.data ?? lagi.json)?.proposals || [];
    chk('tetap hanya proposal miliknya', propsLagi.length, 1);
    chk('bukan proposal client lain', propsLagi.every(x => Number(x.id) !== Number(p2Id)), true);

    // ── 4. Status ikut berubah mengikuti Estimator ──────────────────────────
    console.log('\n4. Status mengikuti Estimator, satu sumber kebenaran');
    await call('PUT', `/estimator/proposals/${p1Id}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${p1Id}/status`, { status: 'submitted' }, master);
    const sesudah = await call('GET', `/clients/${clientId}`, undefined, master);
    chk('status di tab client ikut submitted',
      ((sesudah.json?.data ?? sesudah.json)?.proposals || [])[0]?.status, 'submitted');

    // ── 5. Hitungan dashboard tidak lagi selalu nol ────────────────────────
    console.log('\n5. Hitungan proposal di dashboard membaca tabel yang benar');
    const dash = await call('GET', '/clients/dashboard', undefined, master);
    chk('dashboard terbaca', dash.status, 200);
    const d = dash.json?.data ?? dash.json;
    const open = Number(d?.openProposals ?? d?.proposals?.open ?? 0);
    // Proposal p1 barusan berstatus submitted, jadi hitungan "open" wajib ≥ 1.
    // Dengan sumber lama (`client_proposals`, 0 baris) angkanya selalu 0.
    chk('proposal submitted terhitung', open >= 1, true);

    // ── 6. Tidak ada record karangan di bundle produksi ────────────────────
    console.log('\n6. Build frontend bersih dari record karangan');
    const { readFileSync, existsSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const distDir = new URL('../../frontend/dist/', import.meta.url).pathname;
    if (!existsSync(distDir)) {
      chk('folder dist ada (jalankan npm run build lebih dulu)', false, true);
    } else {
      // Vite menaruh js di `dist/js/` dan css di `dist/assets/`, jadi seluruh
      // pohon dipindai — memindai satu folder saja pernah membuat pemeriksaan
      // ini lulus atas berkas kosong.
      const kumpul = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap(e =>
          e.isDirectory() ? kumpul(join(dir, e.name))
          : e.name.endsWith('.js') ? [join(dir, e.name)] : []);
      const berkas = kumpul(distDir);
      chk('ada berkas js di dist', berkas.length > 0, true);
      const semua = berkas.map(f => readFileSync(f, 'utf8')).join('\n');
      for (const jejak of ['PROPOSAL #6', 'PROPOSAL #15', 'Yearly subscription of example.com',
                           'Training and Workshop Services Contract', 'EST-2026-001']) {
        chk(`"${jejak}" tidak ada di bundle`, semua.includes(jejak), false);
      }
    }

  } finally {
    console.log('\n7. Bersih-bersih');
    let sisa = 0;
    for (const hapus of bersihkan.reverse()) {
      try { await hapus(); } catch { sisa++; }
    }
    chk('data uji terhapus', sisa, 0);
    void dbRun;
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
