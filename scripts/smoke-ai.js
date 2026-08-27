#!/usr/bin/env node
/**
 * Smoke test asisten gambar MTO — dengan gambar kerja SUNGGUHAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BUKAN bagian dari `npm run smoke`, dan itu disengaja.
 *
 * `scripts/smoke-test.js` sepenuhnya read-only dan gratis, jadi aman
 * ditembakkan ke produksi kapan saja. Yang ini memanggil Gemini — memakai kuota
 * dan berbiaya — serta membuat satu proposal sementara. Menggabungkannya berarti
 * setiap deploy ikut memakan kuota, dan smoke yang mahal akan berhenti
 * dijalankan orang.
 *
 * Yang TIDAK dilakukan: menyimpan hasil bacaan AI. Endpoint usulan memang tidak
 * menulis apa pun, dan skrip ini memverifikasinya, bukan mengasumsikannya.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pakai:
 *   node scripts/smoke-ai.js gambar.pdf                       # ke produksi
 *   node scripts/smoke-ai.js lembar1.pdf lembar2.pdf denah.png
 *   BASE_URL=http://localhost:3005 node scripts/smoke-ai.js gambar.pdf
 *
 * Kredensial dari env: ADMIN_EMAIL / ADMIN_PASS (atau MASTER_PASSWORD).
 * Tidak pernah dituliskan ke layar maupun ke berkas.
 */
const fs = require('fs');
const path = require('path');

const BASE = (process.env.BASE_URL || 'https://blackboxs.io').replace(/\/$/, '');
const API = `${BASE}/api`;
const EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || '';

let pass = 0, fail = 0, warn = 0;
const ok = (m, d) => { pass++; console.log(`  ok    ${m}${d !== undefined ? ' → ' + d : ''}`); };
const bad = (m, d) => { fail++; console.log(`  GAGAL ${m}${d !== undefined ? ' → ' + d : ''}`); };
const hmm = (m, d) => { warn++; console.log(`  ⚠️     ${m}${d !== undefined ? ' → ' + d : ''}`); };

const MIME = {
  '.pdf': 'application/pdf', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

/**
 * Dimensi PENAMPANG — nilainya dalam meter dan wajar kalau kecil.
 *
 * Inilah yang dipakai mendeteksi kesalahan satuan. Gambar teknik memakai
 * milimeter, formula memakai meter; kalau konversinya terlewat, angkanya
 * meleset 1000× dan hasilnya tetap terlihat "wajar" di layar — footing 1500
 * meter tidak menimbulkan error apa pun, hanya volume yang mustahil.
 *
 * Panjang total, luas, dan jumlah titik sengaja TIDAK diperiksa: balok
 * sepanjang 96 m atau pelat 480 m² itu normal.
 */
const DIMENSI_PENAMPANG = {
  L: 30, W: 30, H: 5, B: 5, depth: 40,
  thickness: 2, thickness_cm: 100, plate_thick: 0.5, screed_t: 50, glass_thick: 0.2,
  dak_thick: 2, pile_dia: 5, kayu_b: 1, kayu_h: 1,
  tb_w: 3, tb_h: 3, sloof_w: 3, sloof_h: 3,
  bp_p: 3, bp_l: 3, bp_t: 0.5,
  height_per_floor: 30, overhang: 10, lean_t: 1, subbase_t: 2,
};

async function json(method, p, body, token) {
  const res = await fetch(API + p, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null; const t = await res.text();
  try { j = JSON.parse(t); } catch { /* bukan JSON */ }
  return { status: res.status, json: j, text: t };
}

function multipart(berkas) {
  const batas = '----smokeai' + Date.now();
  const bagian = [];
  for (const b of berkas) {
    bagian.push(Buffer.from(
      `--${batas}\r\nContent-Disposition: form-data; name="gambar"; filename="${b.nama}"\r\n` +
      `Content-Type: ${b.mime}\r\n\r\n`));
    bagian.push(b.isi);
    bagian.push(Buffer.from('\r\n'));
  }
  bagian.push(Buffer.from(`--${batas}--\r\n`));
  return { batas, body: Buffer.concat(bagian) };
}

async function main() {
  const argv = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (!argv.length) {
    console.error('Pakai: node scripts/smoke-ai.js <gambar.pdf|png> [lembar-lain...]');
    process.exit(2);
  }
  if (!PASS) {
    console.error('ADMIN_PASS atau MASTER_PASSWORD belum diset di environment.');
    process.exit(2);
  }

  const berkas = [];
  for (const f of argv) {
    if (!fs.existsSync(f)) { console.error(`Berkas tidak ada: ${f}`); process.exit(2); }
    const ext = path.extname(f).toLowerCase();
    if (!MIME[ext]) { console.error(`Tipe tidak didukung: ${f} (PDF/PNG/JPG/WebP)`); process.exit(2); }
    const isi = fs.readFileSync(f);
    if (isi.length > 20 * 1024 * 1024) {
      console.error(`${path.basename(f)} lebih dari 20 MB — perkecil atau pisah per lembar.`);
      process.exit(2);
    }
    berkas.push({ nama: path.basename(f), mime: MIME[ext], isi });
  }

  console.log(`Smoke AI — ${BASE}`);
  console.log('─'.repeat(72));
  console.log(`Berkas: ${berkas.map(b => `${b.nama} (${(b.isi.length / 1024).toFixed(0)} KB)`).join(', ')}`);

  const login = await json('POST', '/auth/login', { email: EMAIL, password: PASS });
  const token = login.json?.token;
  if (!token) { bad('login', `HTTP ${login.status}`); return selesai(); }
  ok('login');

  const stamp = 'SMOKEAI' + Date.now().toString().slice(-7);
  const prop = await json('POST', '/estimator/proposals',
    { project_name: `Smoke AI ${stamp}`, status: 'draft' }, token);
  const pid = prop.json?.id ?? prop.json?.data?.id;
  if (!pid) { bad('proposal sementara dibuat', `HTTP ${prop.status}`); return selesai(); }
  ok('proposal sementara dibuat', `#${pid}`);

  try {
    const { batas, body } = multipart(berkas);
    const mulai = Date.now();
    const res = await fetch(`${API}/estimator/proposals/${pid}/mto/usul-dari-gambar`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${batas}`,
        Authorization: 'Bearer ' + token,
      },
      body,
    });
    const detik = ((Date.now() - mulai) / 1000).toFixed(1);
    const teks = await res.text();
    let j = null; try { j = JSON.parse(teks); } catch {}

    if (res.status === 429) {
      hmm(`kuota AI habis (${detik}s)`, j?.error?.slice(0, 90));
      console.log('\n  Ini bukan kegagalan sistem. Coba lagi sebentar, atau naikkan tier.');
      return selesai(pid, token);
    }
    if (res.status !== 200) {
      bad(`pembacaan gagal (${detik}s)`, `HTTP ${res.status} ${String(j?.error || teks).slice(0, 120)}`);
      return selesai(pid, token);
    }
    ok(`pembacaan berhasil (${detik}s)`);

    // Kontrak: TIDAK ADA yang tersimpan dari jalur ini.
    if (j?.tersimpan === false) ok('responsnya menyatakan belum tersimpan');
    else bad('responsnya TIDAK menyatakan belum tersimpan', JSON.stringify(j?.tersimpan));

    const usulan = Array.isArray(j?.usulan) ? j.usulan : [];
    if (!usulan.length) {
      hmm('nol zona terbaca', String(j?.catatan_umum || '').slice(0, 120));
      return selesai(pid, token);
    }
    ok('zona terbaca', usulan.length);

    const perTipe = {};
    let totalBaris = 0, totalKurang = 0;
    const satuanCurigai = [];
    const tanpaDasar = [];

    for (const z of usulan) {
      perTipe[z.element_type] = (perTipe[z.element_type] || 0) + 1;
      totalBaris += (z.pratinjau || []).length;
      totalKurang += (z.missing_required || []).length;
      if (!String(z.dasar || '').trim()) tanpaDasar.push(z.element_name);

      for (const [f, batasWajar] of Object.entries(DIMENSI_PENAMPANG)) {
        const v = Number(z.parameters?.[f]);
        if (Number.isFinite(v) && v > batasWajar) {
          satuanCurigai.push(`${z.element_name}.${f} = ${v} (wajarnya ≤ ${batasWajar} m)`);
        }
      }
    }

    console.log('\nSebaran tipe elemen:');
    for (const [t, n] of Object.entries(perTipe)) console.log(`    ${String(n).padStart(3)} ${t}`);
    ok('baris pekerjaan terhitung kalkulator', totalBaris);

    // Pemeriksaan yang paling menentukan: satuan.
    if (satuanCurigai.length) {
      bad(`${satuanCurigai.length} dimensi diduga belum dikonversi ke meter`);
      for (const s of satuanCurigai.slice(0, 8)) console.log(`         ${s}`);
      if (satuanCurigai.length > 8) console.log(`         … dan ${satuanCurigai.length - 8} lagi`);
    } else {
      ok('tidak ada dimensi penampang yang mencurigakan (kemungkinan mm belum dikonversi)');
    }

    if (tanpaDasar.length) {
      hmm(`${tanpaDasar.length} zona tanpa "dasar" — sulit diverifikasi ke gambar`,
        tanpaDasar.slice(0, 4).join(', '));
    } else {
      ok('setiap zona menyebut dari mana angkanya dibaca');
    }

    if (berkas.length > 1) {
      const sebutLembar = usulan.filter(z => /lembar|sheet|hal\.?\s*\d/i.test(String(z.dasar || ''))).length;
      if (sebutLembar) ok('penyilangan antar lembar terlihat di "dasar"', `${sebutLembar}/${usulan.length} zona`);
      else hmm('tidak ada zona yang menyebut lembar asalnya — penyilangan antar lembar belum terlihat');
    }

    // Yang ditandai kurang justru pertanda baik: AI tidak menebak.
    console.log(`\n  Catatan: ${totalKurang} dimensi wajib ditandai belum lengkap.`);
    console.log('  Itu WAJAR dan justru sehat — artinya AI tidak menebak angka yang tidak ada di gambar.');
    console.log('  Lengkapi di kartu usulan sebelum menekan Terima.');

    if (j?.catatan_umum) console.log(`\n  Catatan AI: ${String(j.catatan_umum).slice(0, 300)}`);

    console.log('\nRincian:');
    for (const z of usulan) {
      console.log(`\n  ${z.element_name}  [${z.element_type}]  keyakinan=${z.keyakinan}  ${(z.pratinjau || []).length} baris`);
      console.log(`    ${JSON.stringify(z.parameters)}`);
      if (z.dasar) console.log(`    dasar: ${String(z.dasar).slice(0, 150)}`);
      if ((z.ragu || []).length) console.log(`    ragu : ${z.ragu.join(' | ').slice(0, 150)}`);
    }

    // Buktikan tidak ada yang tersimpan — dibaca ulang dari server, bukan
    // dipercaya dari respons.
    const cek = await json('GET', `/estimator/proposals/${pid}/mto`, undefined, token);
    const tersimpan = (cek.json?.elements || []).length;
    if (tersimpan === 0) ok('diverifikasi: nol elemen MTO tersimpan di proposal ini');
    else bad('ADA yang tersimpan padahal endpoint ini tidak boleh menulis', tersimpan);

  } finally {
    await selesai(pid, token);
  }
}

async function selesai(pid, token) {
  if (pid && token) {
    const h = await json('DELETE', `/estimator/proposals/${pid}`, undefined, token);
    if (h.status === 200) ok('proposal sementara dibersihkan');
    else hmm('proposal sementara belum terhapus', `HTTP ${h.status} — id ${pid}`);
  }
  console.log('\n' + '─'.repeat(72));
  console.log(`${pass} lulus, ${fail} gagal${warn ? `, ${warn} perlu diperhatikan` : ''}`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('Smoke AI gagal dijalankan:', e.message); process.exit(1); });
