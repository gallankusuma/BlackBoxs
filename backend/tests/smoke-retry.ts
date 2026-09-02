import 'dotenv/config';
/**
 * Retry `HTTP 0` pada smoke test (1 September 2026).
 *
 * Kejadiannya: smoke ditembak tepat setelah `pm2 restart`, satu permintaan ke
 * `/uploads/asset_documents/` gagal tersambung, dan karena bukan 403 ia
 * dilaporkan sebagai "DOKUMEN BISNIS TERBUKA TANPA TOKEN". Rilis yang sehat
 * digulung balik.
 *
 * Yang diuji di sini adalah DUA SISI yang berlawanan, dan sisi keduanya yang
 * lebih penting:
 *
 *   1. Sambungan yang gagal lalu pulih → diulang, lulus, dan retry-nya
 *      DILAPORKAN (bukan disembunyikan).
 *   2. Balasan HTTP yang SALAH → gagal seketika, TANPA diulang. Retry yang ikut
 *      mengulang 200-di-tempat-403 bukan memperbaiki gerbang, melainkan
 *      memberi server tiga kesempatan untuk kebetulan menjawab benar.
 *
 * Dikerjakan lewat server tiruan supaya kedua keadaan itu bisa dibuat sesuka
 * hati — menunggu jaringan produksi tidak stabil bukan pengujian.
 *
 * Jalankan: npm run test:smoke-retry
 */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

const JALUR_UJI = '/uploads/asset_documents/probe-smoke-test.pdf';
const SKRIP = path.resolve(__dirname, '../../scripts/smoke-test.js');

/**
 * @param putusPertama berapa kali permintaan ke JALUR_UJI diputus sebelum dijawab
 * @param statusAkhir  status yang dijawab setelah itu
 */
function serverTiruan(putusPertama: number, statusAkhir: number) {
  let n = 0;
  const server = http.createServer((req, res) => {
    if (req.url === JALUR_UJI) {
      n++;
      if (n <= putusPertama) {
        // Soket diputus tanpa balasan → fetch melempar → status 0 di klien.
        req.socket.destroy();
        return;
      }
      res.writeHead(statusAkhir); res.end('x');
      return;
    }
    res.writeHead(404); res.end('');
  });
  return { server, hits: () => n };
}

function jalankanSmoke(port: number, env: Record<string, string> = {}) {
  return new Promise<{ out: string; ms: number }>((resolve) => {
    const mulai = Date.now();
    const p = spawn('node', [SKRIP], {
      env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}`, SMOKE_TIMEOUT: '3000', ...env },
    });
    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.stderr.on('data', d => { out += d.toString(); });
    p.on('close', () => resolve({ out, ms: Date.now() - mulai }));
  });
}

const dengarkan = (server: http.Server) =>
  new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as any).port)));

async function main() {
  // ── 1. Gangguan sambungan yang pulih ────────────────────────────────────
  console.log('1. Sambungan putus dua kali lalu pulih → diulang dan lulus');
  {
    const { server, hits } = serverTiruan(2, 403);
    const port = await dengarkan(server);
    const { out } = await jalankanSmoke(port, { SMOKE_RETRY: '2', SMOKE_RETRY_DELAY: '50' });
    server.close();

    chk('dokumen aset dilaporkan tertutup (403)', /ok\s+dokumen aset tertutup/.test(out), true);
    chk('dokumen aset tidak dilaporkan gagal', /GAGAL dokumen aset tertutup/.test(out), false);
    chk('server benar-benar dihubungi 3 kali', hits(), 3);
    // Retry yang diam-diam memulihkan diri menyembunyikan server yang memburuk.
    chk('retry-nya dilaporkan di ringkasan', /baru berhasil setelah diulang/.test(out), true);
    chk('sebutkan percobaan keberapa', /berhasil pada percobaan ke-3/.test(out), true);
  }

  // ── 2. Gangguan yang TIDAK pulih ────────────────────────────────────────
  console.log('\n2. Sambungan putus terus → tetap gagal setelah semua percobaan');
  {
    const { server, hits } = serverTiruan(99, 403);
    const port = await dengarkan(server);
    const { out } = await jalankanSmoke(port, { SMOKE_RETRY: '2', SMOKE_RETRY_DELAY: '50' });
    server.close();

    chk('tetap dilaporkan gagal', /GAGAL dokumen aset tertutup/.test(out), true);
    chk('menyebut jumlah percobaan', /tidak ada balasan setelah 3 percobaan/.test(out), true);
    // Inti perbaikannya: gagal tersambung tidak boleh dilaporkan seolah
    // dokumennya terbuka.
    chk('TIDAK mengaku dokumennya terbuka', /dokumen aset tertutup → HTTP 0 — DOKUMEN BISNIS TERBUKA/.test(out), false);
    chk('menyebut server tidak dapat dihubungi', /server tidak dapat dihubungi/.test(out), true);
    chk('dicoba 3 kali, tidak lebih', hits(), 3);
  }

  // ── 3. SISI YANG PALING PENTING: gerbangnya tidak dilonggarkan ──────────
  console.log('\n3. Balasan HTTP yang salah → gagal seketika, TANPA diulang');
  {
    // 200 di jalur yang seharusnya 403 = dokumen bisnis benar-benar terbuka.
    const { server, hits } = serverTiruan(0, 200);
    const port = await dengarkan(server);
    // Jeda dibuat pendek: buktinya ada di hits() — kalau retry ikut mengulang
    // hasil yang salah, server akan dihubungi lebih dari sekali. Jeda panjang
    // hanya membuat pengujian mutasi berjalan berjam-jam tanpa menambah bukti.
    const { out } = await jalankanSmoke(port, { SMOKE_RETRY: '2', SMOKE_RETRY_DELAY: '200' });
    server.close();

    chk('tetap dilaporkan sebagai dokumen terbuka', /DOKUMEN BISNIS TERBUKA TANPA TOKEN/.test(out), true);
    // Kalau ini > 1, retry ikut mengulang hasil yang salah — artinya server
    // diberi kesempatan tambahan untuk kebetulan menjawab benar.
    chk('hanya dihubungi SEKALI (tidak diulang)', hits(), 1);
    chk('tidak ada catatan retry', /baru berhasil setelah diulang/.test(out), false);
  }

  // ── 4. Retry bisa dimatikan ─────────────────────────────────────────────
  console.log('\n4. SMOKE_RETRY=0 mengembalikan perilaku lama');
  {
    const { server, hits } = serverTiruan(1, 403);
    const port = await dengarkan(server);
    const { out } = await jalankanSmoke(port, { SMOKE_RETRY: '0' });
    server.close();

    chk('sekali putus langsung divonis gagal', /GAGAL dokumen aset tertutup/.test(out), true);
    chk('hanya satu percobaan', hits(), 1);
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
