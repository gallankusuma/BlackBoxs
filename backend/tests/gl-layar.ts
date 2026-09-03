import 'dotenv/config';
/**
 * Kontrak antara layar GL dan API-nya (GL-01 langkah 4).
 *
 * Yang diuji di sini adalah kelas cacat yang TIDAK terlihat oleh `vue-tsc`
 * maupun `npm run build`, dan baru muncul sebagai layar kosong di depan
 * penggunanya:
 *
 *   1. Endpoint yang dipanggil layar ternyata tidak ada (salah ketik jalur,
 *      atau rutenya berganti nama). Build tetap lolos — string tidak diperiksa.
 *   2. Nama field yang dibaca template tidak ada di respons. Ini persis cacat
 *      yang kena di layar aset: dropdown memakai `p.project_name` sementara
 *      `GET /projects` mengembalikan `title`, jadi dropdown-nya berisi baris
 *      kosong tanpa satu pun error.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:gl-layar
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

const LAYAR = [
  'GeneralLedger.vue', 'ChartOfAccounts.vue', 'GlReports.vue', 'GlSettings.vue',
];
const FE = '../frontend/src/views';

async function main() {
  const fs = await import('fs');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  // ── 1. Berkas layarnya ada dan terdaftar ────────────────────────────────
  console.log('\n1. Layar terdaftar di router dan menu');
  const hilang = LAYAR.filter(f => !fs.existsSync(`${FE}/${f}`));
  chk('semua berkas layar ada', hilang, []);

  const router = fs.readFileSync('../frontend/src/router/index.ts', 'utf8');
  const menu = fs.readFileSync('../frontend/src/components/Layout.vue', 'utf8');
  const tidakDiRouter = LAYAR.filter(f => !router.includes(`views/${f}`));
  chk('semua layar punya route', tidakDiRouter, []);
  // Layar yang tidak ada di menu praktis tidak ada — tidak ada jalan ke sana.
  const tidakDiMenu = LAYAR.map(f => f.replace('.vue', ''))
    .filter(n => !menu.includes(`name: '${n}'`));
  chk('semua layar punya entri menu', tidakDiMenu, []);

  // ── 2. Setiap endpoint yang dipanggil layar benar-benar ada ─────────────
  console.log('\n2. Endpoint yang dipanggil layar benar-benar ada');
  // Jalur diambil UTUH, termasuk bagian setelah interpolasi. Versi pertama
  // memotongnya di `${` dan menguji potongan yang memang bukan rute — probe
  // yang melaporkan hantu sama tidak bergunanya dengan probe yang diam.
  const dipanggil = new Set<string>();
  for (const f of LAYAR) {
    const src = fs.readFileSync(`${FE}/${f}`, 'utf8');
    for (const m of src.matchAll(/api\.(get|post|put|delete)\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2/g)) {
      const metode = m[1].toUpperCase();
      let jalur = m[3]
        .replace(/\$\{[^}]*\}/g, '1')   // id apa pun → 1
        .replace(/\?.*$/, '');            // query string dibuang
      if (!jalur.startsWith('/gl/')) continue;
      dipanggil.add(`${metode} ${jalur}`);
    }
  }
  chk('layar memanggil endpoint GL', dipanggil.size >= 10, true);

  const tidakAda: string[] = [];
  for (const d of dipanggil) {
    const [metode, jalur] = d.split(' ');
    // DELETE diuji sebagai GET supaya probe ini tidak menghapus apa pun; yang
    // dicari cuma "rutenya terdaftar atau tidak". 404 dari rute yang TERDAFTAR
    // membawa body JSON ("tidak ditemukan"); 404 dari rute yang tidak ada tidak.
    const metodeUji = metode === 'DELETE' ? 'GET' : metode;
    const r = await call(metodeUji, jalur, metodeUji === 'GET' ? undefined : {}, master);
    if (r.status === 404 && !r.json?.error) tidakAda.push(`${metode} ${jalur}`);
  }
  chk('tidak ada endpoint layar yang tidak terdaftar', tidakAda, []);

  // ── 3. Field yang dibaca template benar-benar ada di respons ────────────
  console.log('\n3. Field yang dibaca template ada di responsnya');

  const coa = (await call('GET', '/gl/coa?with_balance=1', undefined, master)).json?.data || [];
  chk('bagan akun terisi', coa.length > 0, true);
  const fieldCoa = ['id', 'account_code', 'account_name', 'account_type', 'normal_balance',
                    'is_header', 'is_postable', 'is_active', 'is_control_account', 'level', 'balance'];
  chk('  field bagan akun lengkap',
    fieldCoa.filter(f => coa[0] && !(f in coa[0])), []);

  const tb = (await call('GET', '/gl/trial-balance', undefined, master)).json;
  chk('neraca saldo membalas', [!!tb, typeof tb?.seimbang], [true, 'boolean']);
  chk('  field neraca saldo lengkap',
    ['data', 'total_debit', 'total_credit', 'selisih', 'seimbang'].filter(f => !(f in (tb || {}))), []);

  const ns = (await call('GET', '/gl/reports/balance-sheet', undefined, master)).json;
  chk('  field neraca lengkap',
    ['aset', 'liabilitas', 'ekuitas', 'laba_berjalan', 'total_aset', 'total_liabilitas',
     'total_ekuitas', 'total_liabilitas_ekuitas', 'seimbang', 'as_of'].filter(f => !(f in (ns || {}))), []);

  const lr = (await call('GET', '/gl/reports/income-statement', undefined, master)).json;
  chk('  field laba rugi lengkap',
    ['pendapatan', 'total_pendapatan', 'beban_pokok', 'total_beban_pokok', 'laba_kotor',
     'margin_kotor_pct', 'beban_operasional', 'total_beban_operasional', 'laba_operasi',
     'pendapatan_beban_lain', 'total_lain', 'pajak', 'total_pajak', 'laba_bersih']
      .filter(f => !(f in (lr || {}))), []);

  const set = (await call('GET', '/gl/settings', undefined, master)).json;
  chk('  field setelan lengkap',
    ['data', 'auto_posting_start_date', 'auto_posting_aktif'].filter(f => !(f in (set || {}))), []);

  const map = (await call('GET', '/gl/mappings', undefined, master)).json;
  chk('  field pemetaan lengkap',
    ['data', 'bermasalah'].filter(f => !(f in (map || {}))), []);
  const fieldMap = ['id', 'event_code', 'role', 'account_code', 'note', 'account_name',
                    'is_header', 'account_active'];
  chk('  field baris pemetaan lengkap',
    fieldMap.filter(f => (map?.data || [])[0] && !(f in map.data[0])), []);

  const fp = (await call('GET', '/gl/fiscal-periods', undefined, master)).json?.data || [];
  chk('  field periode fiskal lengkap',
    ['id', 'period_name', 'start_date', 'end_date', 'status', 'posted_entries']
      .filter(f => fp[0] && !(f in fp[0])), []);

  const je = (await call('GET', '/gl/journal-entries', undefined, master)).json?.data || [];
  if (je.length) {
    chk('  field daftar jurnal lengkap',
      ['id', 'entry_number', 'entry_date', 'description', 'journal_type', 'status',
       'total_debit', 'line_count'].filter(f => !(f in je[0])), []);
    const detail = (await call('GET', `/gl/journal-entries/${je[0].id}`, undefined, master)).json?.data;
    chk('  field detail jurnal lengkap',
      ['entry_number', 'description', 'entry_date', 'period_name', 'journal_type', 'status',
       'total_debit', 'total_credit', 'lines'].filter(f => !(f in (detail || {}))), []);
    if (detail?.lines?.length) {
      chk('  field baris jurnal lengkap',
        ['id', 'account_code', 'account_name', 'debit', 'credit', 'description', 'project_name']
          .filter(f => !(f in detail.lines[0])), []);
    }
  } else {
    console.log('  --   belum ada jurnal untuk memeriksa field detailnya');
  }

  const akunUji = coa.find((a: any) => !a.is_header && a.is_postable);
  if (akunUji) {
    const led = (await call('GET', `/gl/ledger/${akunUji.id}`, undefined, master)).json?.data;
    chk('  field buku besar lengkap',
      ['account', 'saldo_awal', 'saldo_akhir', 'mutasi'].filter(f => !(f in (led || {}))), []);
  }

  // ── 4. Layar tidak mengulang cacat prefix ganda ─────────────────────────
  console.log('\n4. Layar tidak memakai prefix /api ganda');
  // `baseURL` axios sudah berakhiran /api. StockCard, WarehouseLocations, dan
  // Dashboard memakai api.get('/api/...') sehingga URL-nya jadi /api/api/... dan
  // selalu 404 — tanpa satu pun error saat build.
  const prefixGanda: string[] = [];
  for (const f of LAYAR) {
    const src = fs.readFileSync(`${FE}/${f}`, 'utf8');
    if (/api\.(get|post|put|delete)\(\s*[`'"]\/api\//.test(src)) prefixGanda.push(f);
  }
  chk('tidak ada layar GL yang memakai /api ganda', prefixGanda, []);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
