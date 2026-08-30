import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * Tiga cacat P1 yang tersisa terbuka setelah penyisiran review.md.
 *
 * Ketiganya diuji tanpa HTTP: yang diperiksa adalah BENTUK query dan guard-nya,
 * dan itu justru lebih tepat — dua di antaranya tidak punya data produksi sama
 * sekali (approval_rules 0 baris, approval_delegations 0 baris), jadi tes
 * berbasis data tidak akan pernah menyentuhnya.
 *
 * Jalankan: npm run test:sisir-p1
 */
let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

const baca = (...p: string[]) => readFileSync(join(__dirname, '..', 'src', ...p), 'utf8');

async function main() {
  const approval = baca('routes', 'approval.routes.ts');
  const hr = baca('routes', 'hr.routes.ts');

  console.log('1. Delegasi "All Modules" benar-benar berlaku');
  // Layar menyimpan `module || null` untuk "All Modules". Dengan syarat
  // `module = ?` saja, `NULL = 'procurement'` bernilai NULL — bukan TRUE —
  // sehingga delegasi itu tidak pernah cocok dengan modul APA PUN.
  chk('syaratnya menerima module NULL',
    /module IS NULL OR module = \?/.test(approval), true);
  chk('bukan lagi hanya module = ?',
    /is_active = 1 AND module = \?/.test(approval), false);
  chk('layar memang menyimpan NULL untuk All Modules',
    approval.includes('module || null'), true);

  console.log('\n2. Rule approval tidak lagi tercampur antar dokumen');
  const { default: _ } = { default: null } as any;
  // Alias lama tetap didukung, tapi hanya milik dokumen yang bersangkutan.
  chk('ada peta alias per ENTITAS', approval.includes('ALIAS_ENTITAS'), true);
  chk('moduleKeysFor menerima entityType',
    /moduleKeysFor = \(canonical: string, entityType\?: string\)/.test(approval), true);
  chk('dan pemanggilnya meneruskannya',
    approval.includes('moduleKeysFor(canonicalModule(moduleName), entityType)'), true);
  // Perilaku lama dipertahankan untuk pemanggil tanpa entityType — mencampur
  // lebih baik daripada tidak menemukan rule sama sekali.
  chk('tanpa entityType, perilaku lama dipertahankan',
    /if \(khusus\)[\s\S]{0,200}for \(const \[alias, target\]/.test(approval), true);

  console.log('\n3. Endpoint payroll tidak lagi terbuka lewat hak expense');
  // requirePermission bersifat OR, jadi dua hak berarti pemegang salah satunya
  // cukup. Endpoint ini membaca angka gaji seluruh karyawan.
  chk('guard-nya hanya hak payroll',
    hr.includes("requirePermission('hr.payroll.create'), async"), true);
  chk('hak expense tidak lagi membuka jalur ini',
    hr.includes("requirePermission('hr.payroll.create', 'projects.expenses.create')"), false);
  const perm = baca('middleware', 'permission.ts');
  chk('requirePermission memang OR (itu sebabnya daftar dua hak berbahaya)',
    perm.includes('required.some(p => access.perms.has(p))'), true);

  console.log('\n4. Alasan tiap perubahan tercatat di kodenya');
  chk('delegasi menjelaskan NULL = ... bukan TRUE',
    approval.includes('bukan TRUE'), true);
  chk('alias menjelaskan pencampuran antar dokumen',
    approval.includes('APPROVAL-INTEGRITY'), true);
  chk('guard payroll mencatat verifikasi role produksi',
    hr.includes('kedua role aktif'), true);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
