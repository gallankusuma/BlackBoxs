import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
/**
 * Paket yang dipakai kode runtime tidak boleh hanya berstatus devDependency.
 *
 * 27 Agustus 2026 deploy produksi GAGAL dan ter-rollback karena ini:
 * `src/routes/import.routes.ts` sudah lama memakai `xlsx` saat runtime tanpa
 * pernah mendeklarasikannya di `package.json`. Ketika paket itu akhirnya
 * ditambahkan — sebagai devDependency — install produksi memangkasnya, dan
 * backend mati dengan `MODULE_NOT_FOUND` saat boot.
 *
 * Yang membuatnya berbahaya: `npx tsc --noEmit` dan seluruh `test:all` LULUS,
 * karena di mesin dev devDependency memang terpasang. Cacatnya hanya muncul di
 * server, setelah rilis diunggah.
 *
 * Tes ini murni statis — tidak perlu backend jalan, dan berjalan paling awal.
 *
 * Jalankan: npm run test:deps
 */
let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

const AKAR = path.join(__dirname, '..');

function berkasTs(dir: string, hasil: string[] = []): string[] {
  for (const nama of readdirSync(dir)) {
    const p = path.join(dir, nama);
    if (statSync(p).isDirectory()) berkasTs(p, hasil);
    else if (nama.endsWith('.ts') && !nama.endsWith('.d.ts')) hasil.push(p);
  }
  return hasil;
}

/** Nama paket dari sebuah specifier impor, `undefined` untuk yang bukan paket. */
function namaPaket(spec: string): string | undefined {
  if (spec.startsWith('.') || spec.startsWith('/')) return undefined;
  if (spec.startsWith('node:')) return undefined;
  // Template literal (`${...}`) dan string yang mengandung spasi bukan nama
  // paket — regex di bawah ikut menangkapnya kalau tidak disaring, dan
  // `${proposal.status}` sempat dilaporkan sebagai dependensi yang hilang.
  if (spec.includes('${') || /\s/.test(spec)) return undefined;
  const bagian = spec.split('/');
  const nama = spec.startsWith('@') ? bagian.slice(0, 2).join('/') : bagian[0];
  // Nama paket npm: huruf kecil, angka, `-`, `_`, `.`, dan `@scope/`.
  return /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(nama) ? nama : undefined;
}

const BAWAAN_NODE = new Set([
  'fs', 'path', 'crypto', 'http', 'https', 'url', 'os', 'util', 'stream', 'events',
  'zlib', 'buffer', 'child_process', 'net', 'tls', 'dns', 'assert', 'timers',
  'querystring', 'readline', 'worker_threads', 'perf_hooks', 'string_decoder',
]);

function main() {
  console.log('1. Seluruh paket yang di-import kode runtime ada di `dependencies`');
  const pkg = JSON.parse(readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
  const dependencies = new Set(Object.keys(pkg.dependencies || {}));
  const devDependencies = new Set(Object.keys(pkg.devDependencies || {}));

  const dipakai = new Map<string, string>();   // paket → berkas pertama yang memakainya
  for (const f of berkasTs(path.join(AKAR, 'src'))) {
    const isi = readFileSync(f, 'utf8');
    const re = /(?:from\s+['"]([^'"]+)['"])|(?:require\(\s*['"]([^'"]+)['"]\s*\))|(?:import\(\s*['"]([^'"]+)['"]\s*\))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(isi)) !== null) {
      const nama = namaPaket(m[1] || m[2] || m[3] || '');
      if (!nama || BAWAAN_NODE.has(nama)) continue;
      if (!dipakai.has(nama)) dipakai.set(nama, path.relative(AKAR, f));
    }
  }
  chk('ada paket eksternal yang terdeteksi', dipakai.size > 0, true);

  const hanyaDev = [...dipakai.entries()]
    .filter(([n]) => !dependencies.has(n) && devDependencies.has(n))
    .map(([n, f]) => `${n} (dipakai ${f})`);
  chk('tidak ada yang hanya devDependency', hanyaDev, []);

  const takDideklarasikan = [...dipakai.entries()]
    .filter(([n]) => !dependencies.has(n) && !devDependencies.has(n))
    .map(([n, f]) => `${n} (dipakai ${f})`);
  // Paket yang tidak dideklarasikan SAMA SEKALI juga berbahaya: ia hanya jalan
  // selama kebetulan terpasang sebagai dependensi transitif.
  chk('tidak ada yang tidak dideklarasikan', takDideklarasikan, []);

  console.log('\n2. Paket yang benar-benar dibutuhkan runtime memang terdaftar');
  for (const wajib of ['xlsx', 'pdfkit', 'mysql2', 'express', 'multer']) {
    chk(`${wajib} ada di dependencies`, dependencies.has(wajib), true);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main();
