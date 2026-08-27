import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * PENAWARAN-PDF — dokumen penawaran dihasilkan server, deterministik.
 *
 * Sebelumnya satu-satunya cara mencetak penawaran adalah `window.print()` dari
 * layar RAB. Hasilnya bergantung pada mesin, versi browser, ukuran kertas, dan
 * pengaturan margin pengguna — dokumen yang menjadi dasar harga kontrak tidak
 * boleh berbeda antarperangkat, dan tidak boleh berubah diam-diam saat browser
 * pengguna diperbarui.
 *
 * Yang dijaga tes ini bukan "endpointnya menjawab 200", melainkan sifat-sifat
 * yang membuat dokumen ini layak dikirim ke klien:
 *
 *   - byte-nya identik untuk proposal yang sama (checksum bisa dipercaya),
 *   - angkanya benar-benar dari database, bukan dihitung ulang perender,
 *   - proposal draft TIDAK terlihat seperti dokumen final,
 *   - syarat & ketentuan yang belum diputuskan TIDAK dikarang,
 *   - proposal tanpa item ditolak, bukan menghasilkan penawaran kosong.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:penawaran
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

async function ambilPdf(pid: any, token?: string) {
  const res = await fetch(`${API}/estimator/proposals/${pid}/penawaran.pdf`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, checksum: res.headers.get('x-penawaran-checksum'), headers: res.headers };
}

/** Ambil seluruh teks dari PDF pdfkit (memakai TJ heksadesimal, bukan Tj). */
function teksPdf(buf: Buffer): string {
  const zlib = require('node:zlib');
  const raw = buf.toString('latin1');
  let hasil = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    let isi: string;
    try { isi = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const t of isi.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      for (const h of String(t[1]).matchAll(/<([0-9a-fA-F]+)>/g)) {
        hasil += Buffer.from(h[1], 'hex').toString('latin1');
      }
      hasil += ' ';
    }
  }
  // Teks yang di-justify terpecah antarbaris dan antar-potongan TJ. Spasinya
  // dinormalkan supaya asersi memeriksa ISI, bukan kebetulan pemenggalan baris.
  return hasil.replace(/\s+/g, ' ');
}

/**
 * Buang SELURUH spasi untuk pemeriksaan keberadaan frasa.
 *
 * Pada paragraf yang di-justify, pdfkit menyandikan spasi sebagai penyesuaian
 * kerning di dalam array TJ — bukan sebagai karakter. Jadi teks yang
 * diekstrak keluar sebagai "Masaberlakupenawaran…". Yang ingin dijaga asersi
 * adalah frasanya benar-benar tercetak, bukan bagaimana PDF menyandikan
 * spasinya.
 */
const tanpaSpasi = (t: string) => t.replace(/\s/g, '');

async function main() {
  const stamp = Date.now().toString().slice(-7);

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const buatAhsp = async (suf: string, nama: string, harga: number) => {
    const r = await call('POST', '/estimator/ahsp', {
      kode: `PNW.${stamp}.${suf}`, name: nama, satuan: 'm3', status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: 'Bahan',
                resource_satuan: 'm3', koefisien: 1, resource_harga: harga }],
    }, master);
    return r.json?.id ?? r.json?.data?.id;
  };
  const a1 = await buatAhsp('A', `Galian Tanah ${stamp}`, 185000);
  const a2 = await buatAhsp('B', `Beton K-250 ${stamp}`, 1450000);

  try {
    console.log('\n1. Proposal tanpa item ditolak — dokumen kosong lebih buruk daripada tidak ada dokumen');
    const kosong = await call('POST', '/estimator/proposals',
      { project_name: `Uji penawaran kosong ${stamp}`, status: 'draft' }, master);
    const pidKosong = kosong.json?.id;
    const rKosong = await ambilPdf(pidKosong, master);
    chk('ditolak 422', rKosong.status, 422);
    const jKosong = JSON.parse(rKosong.buf.toString('utf8'));
    chk('kodenya PENAWARAN_KOSONG', jKosong?.code, 'PENAWARAN_KOSONG');

    console.log('\n2. Proposal bernilai menghasilkan PDF');
    const p = await call('POST', '/estimator/proposals', {
      project_name: `Uji penawaran ${stamp}`, client: 'PT Klien Uji',
      lokasi: 'Cilegon, Banten', status: 'draft',
    }, master);
    const pid = p.json?.id;
    await call('POST', `/estimator/proposals/${pid}/apply-template`, {
      proposal_type: 'civil_structure', mode: 'replace', design_params: { luas: 100 },
      template_sections: [
        { code: 'A', name: 'PEKERJAAN TANAH', children: [{ name: 'Galian', ahsp_id: a1, volume: 124.5 }] },
        { code: 'B', name: 'PEKERJAAN STRUKTUR', children: [{ name: 'Beton', ahsp_id: a2, volume: 38.75 }] },
      ],
    }, master);

    const r1 = await ambilPdf(pid, master);
    chk('berhasil 200', r1.status, 200);
    chk('tipe kontennya PDF', r1.headers.get('content-type'), 'application/pdf');
    chk('berkasnya benar-benar PDF', r1.buf.subarray(0, 5).toString(), '%PDF-');
    chk('dibuka inline, bukan dipaksa unduh',
      String(r1.headers.get('content-disposition') || '').startsWith('inline'), true);
    chk('browser tidak boleh menebak tipenya', r1.headers.get('x-content-type-options'), 'nosniff');
    chk('checksum ikut dikirim di header', (r1.checksum || '').length, 64);

    console.log('\n3. DETERMINISTIK — byte yang sama untuk proposal yang sama');
    const r2 = await ambilPdf(pid, master);
    chk('dua permintaan menghasilkan byte identik', r1.buf.equals(r2.buf), true);
    chk('checksumnya pun sama', r1.checksum, r2.checksum);

    console.log('\n4. Angkanya dari database, bukan hitungan perender');
    const teks = teksPdf(r1.buf);
    const { dbGet, dbAll } = await import('../src/config/database');
    const baris: any[] = await dbAll(
      `SELECT qty, unit_price_snapshot, total_price FROM proposal_items
       WHERE proposal_id = ? AND is_section = 0 ORDER BY order_no`, [pid]);
    chk('ada dua baris pekerjaan', baris.length, 2);
    const fmt = (v: number) => {
      const [b, p] = Math.abs(Number(v)).toFixed(2).split('.');
      return `${b.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${p}`;
    };
    for (const b of baris) {
      chk(`jumlah ${fmt(b.total_price)} tercetak`, teks.includes(fmt(b.total_price)), true);
    }
    const hdr: any = await dbGet('SELECT total_project, proposal_number FROM proposals WHERE id = ?', [pid]);
    chk('total penawaran tercetak', teks.includes(fmt(hdr.total_project)), true);
    chk('nomor proposal tercetak', teks.includes(String(hdr.proposal_number)), true);
    chk('judul seksi tercetak', teks.includes('PEKERJAAN STRUKTUR'), true);
    chk('nama klien tercetak', teks.includes('PT Klien Uji'), true);

    console.log('\n5. Draft TIDAK boleh terlihat seperti dokumen final');
    chk('ditandai draf', teks.includes('BELUM DITERBITKAN'), true);

    console.log('\n6. Syarat & ketentuan yang belum diputuskan TIDAK dikarang');
    chk('bagiannya ada', teks.includes('Syarat dan Ketentuan'), true);
    chk('dan menyatakan menyusul, bukan menghilang diam-diam',
      tanpaSpasi(teks).includes(tanpaSpasi('akan dilampirkan terpisah')), true);
    // Kalau suatu hari ada yang mengarang angka termin, asersi ini yang jatuh.
    chk('tidak ada klaim masa berlaku yang dikarang',
      /berlaku\d+hari/i.test(tanpaSpasi(teks)), false);
    chk('tidak ada termin pembayaran yang dikarang',
      /(downpayment|uangmuka)\d+%/i.test(tanpaSpasi(teks)), false);

    console.log('\n7. Setelah di-submit, penandanya hilang dan tanggalnya muncul');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const r3 = await ambilPdf(pid, master);
    const teks3 = teksPdf(r3.buf);
    chk('penanda draf hilang', teks3.includes('BELUM DITERBITKAN'), false);
    chk('checksum berubah karena isinya berubah', r3.checksum !== r1.checksum, true);
    const r4 = await ambilPdf(pid, master);
    chk('tetap deterministik setelah submit', r3.buf.equals(r4.buf), true);

    console.log('\n8. Terjaga auth');
    chk('tanpa token ditolak 401', (await ambilPdf(pid)).status, 401);
    chk('proposal tidak ada memberi 404', (await ambilPdf(999999999, master)).status, 404);

    console.log('\n9. Format angka tidak bergantung locale runtime');
    const { rupiah, volume } = await import('../src/modules/estimator/penawaran/dokumen');
    chk('ribuan titik, desimal koma', rupiah(1234567.5), '1.234.567,50');
    chk('nol tetap dua desimal', rupiah(0), '0,00');
    chk('negatif ditandai', rupiah(-1500), '-1.500,00');
    chk('volume membuang nol ekor', volume(124.5), '124,5');
    chk('volume bulat tanpa koma', volume(6420), '6.420');

  } finally {
    console.log('\n10. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('fixture tersapu', disapu.proposal >= 2, true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
