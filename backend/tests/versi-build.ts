import 'dotenv/config';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
/**
 * Halaman login menyebut versi & tanggal build.
 *
 * Gunanya sempit tapi nyata: saat pengguna melaporkan sesuatu, pengguna dan
 * support bisa memastikan sedang bicara tentang rilis yang sama. Angkanya
 * disuntikkan saat build lewat `define` di vite.config.ts — baris versi yang
 * harus diperbarui tangan akan berhenti diperbarui, lalu berbohong.
 *
 * Tidak perlu backend jalan. Jalankan: npm run test:versi
 */
let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

const fe = join(__dirname, '..', '..', 'frontend');

console.log('1. Vite menyuntikkan versi & waktu build');
const vite = readFileSync(join(fe, 'vite.config.ts'), 'utf8');
chk('__APP_VERSION__ didefinisikan', vite.includes('__APP_VERSION__'), true);
chk('__BUILD_TIME__ didefinisikan', vite.includes('__BUILD_TIME__'), true);
chk('versinya dibaca dari package.json, bukan ditulis tangan',
  /package\.json/.test(vite) && /\.version/.test(vite), true);

console.log('\n2. Halaman login memakainya');
const login = readFileSync(join(fe, 'src', 'views', 'Login.vue'), 'utf8');
chk('login memakai versi yang disuntik', login.includes('__APP_VERSION__'), true);
chk('login memakai waktu build yang disuntik', login.includes('__BUILD_TIME__'), true);
chk('tidak ada versi yang di-hardcode di layar',
  /BlackBox EPC v[0-9]+\.[0-9]/.test(login), false);

console.log('\n3. Tipenya dideklarasikan supaya vue-tsc tidak menebak');
chk('deklarasi tipe ada', existsSync(join(fe, 'src', 'vite-env-build.d.ts')), true);

console.log('\n4. Kalau build-nya ada, angkanya benar-benar sampai ke bundle');
const dist = join(fe, 'dist');
if (existsSync(dist)) {
  const semua = (d: string): string[] => readdirSync(d)
    .flatMap(n => statSync(join(d, n)).isDirectory() ? semua(join(d, n)) : [join(d, n)]);
  const js = semua(dist).filter(f => f.endsWith('.js'));
  const versi = JSON.parse(readFileSync(join(fe, 'package.json'), 'utf8')).version;
  const ada = js.some(f => {
    const c = readFileSync(f, 'utf8');
    return c.includes('BlackBox EPC v') && c.includes(`"${versi}"`);
  });
  chk(`versi ${versi} tersuntik ke bundle`, ada, true);
} else {
  // Bukan kegagalan: build memang belum tentu ada saat tes dijalankan.
  pass++; console.log('  ok   dist belum dibangun — pemeriksaan bundle dilewati');
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail > 0 ? 1 : 0);
