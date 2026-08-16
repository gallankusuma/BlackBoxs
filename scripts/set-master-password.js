#!/usr/bin/env node
/**
 * Ganti password akun master di database. DIJALANKAN DI SERVER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KENAPA ADA
 *
 * Audit 16 Agustus 2026: baris `master@admin.com` (id 99999, user_level 10,
 * aktif) di produksi berpassword `master` — nilai yang sudah publik karena dulu
 * ditulis literal di `auth.routes.ts` pada repo publik.
 *
 * Mencabut bypass di kode TIDAK cukup: baris database itu tetap bisa login lewat
 * jalur login biasa. Dua pintu, dan yang ini hanya bisa ditutup dengan mengganti
 * passwordnya.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cara pakai (interaktif — password diketik, tidak tampil, tidak masuk history):
 *
 *   scp scripts/set-master-password.js root@<server>:/root/
 *   ssh -t root@<server> "node /root/set-master-password.js"
 *   ssh root@<server> "rm -f /root/set-master-password.js"
 *
 * Opsi:
 *   --random   buat password acak kuat, tampilkan SEKALI, lalu simpan hash-nya
 *   --quiet    dipakai bersama --random: jangan tampilkan (untuk dev lokal)
 *
 * Skrip ini tidak pernah menulis password ke berkas mana pun — hanya hash bcrypt
 * yang masuk database.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { randomBytes } = require('crypto');

const BASE = process.env.APP_DIR || '/var/www/blackboxs/backend';
const RANDOM = process.argv.includes('--random');
const QUIET = process.argv.includes('--quiet');
const MIN_LENGTH = 12;

const bcrypt = require(path.join(BASE, 'node_modules/bcrypt'));
const mysql = require(path.join(BASE, 'node_modules/mysql2/promise'));

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(BASE, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/** Baca password tanpa menampilkannya di layar. */
function askHidden(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(String(char))) process.stdin.removeListener('data', onData);
      else readline.clearLine(process.stdout, 0), readline.cursorTo(process.stdout, 0), process.stdout.write(prompt);
    };
    process.stdout.write(prompt);
    process.stdin.on('data', onData);
    rl.question('', answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const env = readEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  });

  const [rows] = await conn.query(
    "SELECT id, username, email, user_level, is_active FROM users WHERE email = 'master@admin.com' OR username = 'master' ORDER BY id LIMIT 1"
  );
  if (!rows.length) {
    console.error('Baris user master tidak ditemukan. Tidak ada yang diubah.');
    await conn.end();
    process.exit(1);
  }
  const master = rows[0];
  console.log(`Akun master: id=${master.id} username=${master.username} email=${master.email} level=${master.user_level} aktif=${master.is_active}\n`);

  let password;
  if (RANDOM) {
    password = randomBytes(18).toString('base64url');
    if (!QUIET) {
      console.log('Password baru (DITAMPILKAN SEKALI — simpan sekarang di password manager):\n');
      console.log(`    ${password}\n`);
    }
  } else {
    password = await askHidden('Password master baru: ');
    const confirm = await askHidden('Ulangi                : ');
    if (password !== confirm) {
      console.error('Tidak cocok. Tidak ada yang diubah.');
      await conn.end();
      process.exit(1);
    }
  }

  if (password.length < MIN_LENGTH) {
    console.error(`Terlalu pendek — minimal ${MIN_LENGTH} karakter. Tidak ada yang diubah.`);
    await conn.end();
    process.exit(1);
  }
  if (password === 'master') {
    console.error('Nilai itu sudah publik di repo. Tidak ada yang diubah.');
    await conn.end();
    process.exit(1);
  }

  await conn.execute('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, 10), master.id]);

  // Dibuktikan, bukan diasumsikan: password lama harus benar-benar tidak berlaku.
  const [after] = await conn.query('SELECT password FROM users WHERE id = ?', [master.id]);
  const lamaMasihJalan = await bcrypt.compare('master', after[0].password);
  const baruJalan = await bcrypt.compare(password, after[0].password);

  console.log(`\nPassword master diperbarui.`);
  console.log(`  password baru berlaku      : ${baruJalan ? 'ya' : 'TIDAK — periksa manual'}`);
  console.log(`  password lama 'master'     : ${lamaMasihJalan ? 'MASIH BERLAKU — GAGAL' : 'sudah tidak berlaku'}`);

  await conn.end();
  process.exit(baruJalan && !lamaMasihJalan ? 0 : 1);
})().catch(err => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
