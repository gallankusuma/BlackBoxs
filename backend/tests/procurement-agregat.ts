import 'dotenv/config';
/**
 * Agregat layar Purchase Orders (PROC-N1-01).
 *
 * Layar PO memanggil `/purchase-requests/:id/bid-progress` sekali per PR yang
 * disetujui dan `/purchase-orders/:id` sekali per PO. Di produksi itu 54 + 97
 * permintaan paralel setiap layar dibuka, di atas 4 permintaan dasar — sementara
 * rate limit 300/menit. Membuka layar itu dua kali sudah cukup untuk memicu 429,
 * dan yang terlihat pengguna adalah tombol Approve yang gagal.
 *
 * Yang diuji di sini BUKAN "endpoint barunya menjawab 200", melainkan
 * **angkanya identik dengan jalur lama**. Endpoint cepat yang menjawab beda
 * untuk pertanyaan yang sama lebih berbahaya daripada endpoint lambat: sisa
 * alokasi bergeser tanpa ada yang mengubah data, dan tidak ada yang tahu
 * angka mana yang benar.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:proc-agregat
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
  return { status: res.status, json };
}

async function main() {
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  // ── 1. Urutan route ─────────────────────────────────────────────────────
  // Kedua endpoint ini berbagi awalan dengan `/:id`. Kalau didaftarkan sesudahnya,
  // Express membacanya sebagai id bernama "allocations" dan menjawab 404 —
  // tanpa error apa pun di build.
  console.log('\n1. Tidak tertelan oleh route /:id');
  const alokasi = await call('GET', '/procurement/purchase-orders/allocations', undefined, master);
  chk('GET /purchase-orders/allocations → 200', alokasi.status, 200);
  chk('bentuknya peta, bukan detail satu PO', typeof alokasi.json?.data === 'object' && !('po_number' in (alokasi.json?.data || {})), true);

  const ringkas = await call('GET', '/procurement/purchase-requests/bid-progress-summary?approval_status=2', undefined, master);
  chk('GET /purchase-requests/bid-progress-summary → 200', ringkas.status, 200);

  const peta = ringkas.json?.data || {};
  const idPr = Object.keys(peta);
  chk('ringkasan berisi banyak PR sekaligus', idPr.length > 1, true);

  // ── 2. Angka bid-progress identik dengan endpoint per-PR ────────────────
  console.log('\n2. Bid progress: agregat vs per-PR');
  const contoh = [
    ...idPr.filter(id => peta[id].percentage > 0).slice(0, 15),
    ...idPr.filter(id => peta[id].percentage === 0).slice(0, 10),
  ];
  chk('ada contoh yang berpemenang DAN yang belum', contoh.length >= 2, true);

  let beda = 0;
  const contohBeda: string[] = [];
  for (const id of contoh) {
    const satu = await call('GET', `/procurement/purchase-requests/${id}/bid-progress`, undefined, master);
    // Endpoint per-PR menghilangkan `total_bids` pada jalan keluar "tidak ada
    // item"; ringkasan menyalin perilaku itu, jadi perbandingannya utuh.
    if (JSON.stringify(satu.json) !== JSON.stringify(peta[id])) {
      beda++;
      if (contohBeda.length < 3) contohBeda.push(`PR ${id}: per-PR ${JSON.stringify(satu.json)} vs ringkasan ${JSON.stringify(peta[id])}`);
    }
  }
  contohBeda.forEach(c => console.log('       ' + c));
  chk(`${contoh.length} PR dibandingkan, yang berbeda`, beda, 0);

  // ── 3. Alokasi identik dengan penjumlahan detail PO satu per satu ───────
  console.log('\n3. Alokasi: agregat vs penjumlahan detail PO');
  const semuaPo: any[] = (await call('GET', '/procurement/purchase-orders', undefined, master)).json?.data || [];
  const petaAlokasi = alokasi.json?.data || {};

  // Ambil beberapa PR yang benar-benar punya PO, lalu jumlahkan detail PO-nya
  // dengan cara lama dan bandingkan.
  const prPunyaPo = Object.keys(petaAlokasi).slice(0, 6);
  chk('ada PR beralokasi untuk diperiksa', prPunyaPo.length > 0, true);

  let bedaAlokasi = 0;
  for (const prId of prPunyaPo) {
    const poMilikPr = semuaPo.filter((po: any) => Number(po.pr_id) === Number(prId));
    const harusnya: Record<string, number> = {};
    for (const po of poMilikPr) {
      const detail = await call('GET', `/procurement/purchase-orders/${po.id}`, undefined, master);
      for (const it of (detail.json?.data?.items || [])) {
        const pid = Number(it.product_id);
        if (!Number.isFinite(pid)) continue;
        harusnya[String(pid)] = (harusnya[String(pid)] || 0) + Number(it.quantity || 0);
      }
    }
    const dapat = petaAlokasi[prId] || {};
    const samakan = (o: Record<string, any>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]).sort((a, b) => a[0] < b[0] ? -1 : 1));
    if (JSON.stringify(samakan(dapat)) !== JSON.stringify(samakan(harusnya))) {
      bedaAlokasi++;
      console.log(`       PR ${prId}: agregat ${JSON.stringify(samakan(dapat))} vs jumlah detail ${JSON.stringify(samakan(harusnya))}`);
    }
  }
  chk(`${prPunyaPo.length} PR dibandingkan, alokasi yang berbeda`, bedaAlokasi, 0);

  // ── 4. Otorisasi tetap ditegakkan ───────────────────────────────────────
  console.log('\n4. Endpoint baru tetap terjaga');
  chk('allocations tanpa token → 401', (await call('GET', '/procurement/purchase-orders/allocations')).status, 401);
  chk('bid-progress-summary tanpa token → 401', (await call('GET', '/procurement/purchase-requests/bid-progress-summary')).status, 401);

  // ── 5. N+1 tidak boleh kembali ──────────────────────────────────────────
  // Perbandingan angka di atas TIDAK akan menangkap ini: loop per-PR bisa
  // dipasang lagi dan angkanya tetap benar — hanya 155 permintaan lagi. Yang
  // menahannya cuma pemindaian sumber.
  console.log('\n5. Layar procurement tidak kembali menembak per-baris');
  const fs = await import('fs');
  const berkas = [
    '../frontend/src/views/PurchaseOrders.vue',
    '../frontend/src/views/PurchaseRequests.vue',
  ];
  const pelanggar: string[] = [];
  for (const f of berkas) {
    let isi = '';
    try { isi = fs.readFileSync(f, 'utf8'); } catch { continue; }
    isi.split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
      // Panggilan per-id di dalam alur pemuatan daftar — inilah bentuk N+1-nya.
      if (/api\.get\(`\/procurement\/purchase-requests\/\$\{[^}]+\}\/bid-progress`/.test(line)) {
        pelanggar.push(`${f.split('/').pop()}:${i + 1} bid-progress per-PR`);
      }
      // Mengambil detail SATU PO saat pengguna membukanya jelas sah. Yang
      // dicari adalah pengambilan detail di dalam perulangan — itulah N+1-nya.
      if (/api\.get\(`\/procurement\/purchase-orders\/\$\{[^}]+\}`\)/.test(line)) {
        const sebelum = isi.split('\n').slice(Math.max(0, i - 6), i).join(' ');
        if (/\bfor\s*\(|\.map\(/.test(sebelum)) {
          pelanggar.push(`${f.split('/').pop()}:${i + 1} detail PO di dalam perulangan`);
        }
      }
    });
  }
  pelanggar.forEach(v => console.log('       ' + v));
  chk('tidak ada pemanggilan per-baris di alur pemuatan', pelanggar, []);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
