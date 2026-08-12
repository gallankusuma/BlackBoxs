#!/usr/bin/env python3
"""
Pemeriksaan pra-deploy, dijalankan DI SERVER.

Latar belakangnya konkret: 11 Agustus 2026 password MySQL produksi tidak lagi
cocok dengan `.env`, tapi aplikasi tetap terlihat sehat karena masih menumpang
koneksi pool yang dibuat sebelum perubahan. Deploy berikutnya me-restart proses,
koneksi lama hilang, dan produksi mati — kesalahannya baru ketahuan setelah
aplikasi tidak bisa naik lagi.

Skrip ini menguji hal yang benar-benar dipakai aplikasi saat boot: konek ke
MySQL sebagai `DB_USER` dari `.env`. Kalau gagal, deploy dibatalkan SEBELUM
apa pun diunggah — bukan setelah proses di-restart.

Sengaja dikirim sebagai berkas, bukan dirangkai lewat heredoc/ssh. Perintah
kredensial yang melewati dua lapis penguraian shell pernah membuat password
produksi tertimpa string harfiah `$PW`.

Keluar dengan kode 0 kalau semua lolos, 1 kalau ada yang gagal.
Password tidak pernah dicetak.
"""
import os
import subprocess
import sys

BACKEND_DIR = sys.argv[1] if len(sys.argv) > 1 else '/var/www/blackboxs/backend'
PM2_NAME = sys.argv[2] if len(sys.argv) > 2 else 'blackboxs-backend'

ok = True


def report(label, passed, detail=''):
    global ok
    mark = 'OK  ' if passed else 'GAGAL'
    print(f'  [{mark}] {label}' + (f' — {detail}' if detail else ''))
    if not passed:
        ok = False


def read_env(path):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            env[key.strip()] = val.strip().strip('"').strip("'")
    return env


print('Pemeriksaan pra-deploy')

env_path = os.path.join(BACKEND_DIR, '.env')
if not os.path.exists(env_path):
    report('.env ada', False, env_path)
    sys.exit(1)
report('.env ada', True, env_path)

try:
    env = read_env(env_path)
except Exception as exc:                                    # noqa: BLE001
    report('.env terbaca', False, str(exc)[:120])
    sys.exit(1)

missing = [k for k in ('DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME') if not env.get(k)]
report('kunci database lengkap', not missing,
       'kurang: ' + ', '.join(missing) if missing else f"database {env.get('DB_NAME')}")
if missing:
    sys.exit(1)

# Inti pemeriksaan: konek persis seperti aplikasi, sebagai DB_USER.
proc_env = dict(os.environ)
proc_env['MYSQL_PWD'] = env['DB_PASSWORD']
try:
    result = subprocess.run(
        ['mysql', '-u', env['DB_USER'], '-h', env['DB_HOST'], env['DB_NAME'],
         '-N', '-e', 'SELECT 1'],
        env=proc_env, capture_output=True, text=True, timeout=20,
    )
    connected = result.returncode == 0 and result.stdout.strip() == '1'
    detail = '' if connected else result.stderr.strip().splitlines()[-1][:120] if result.stderr.strip() else 'tidak ada balasan'
except Exception as exc:                                    # noqa: BLE001
    connected, detail = False, str(exc)[:120]

report(f"koneksi DB sebagai {env['DB_USER']}", connected, detail)

# JWT_SECRET wajib ada — tanpa itu backend melempar error saat boot.
report('JWT_SECRET terisi', bool(env.get('JWT_SECRET')))

# Proses pm2 harus sudah terdaftar; kalau tidak, `pm2 restart` akan gagal.
try:
    listed = subprocess.run(['pm2', 'jlist'], capture_output=True, text=True, timeout=20)
    import json
    names = [p.get('name') for p in json.loads(listed.stdout or '[]')]
    report(f'proses pm2 "{PM2_NAME}" terdaftar', PM2_NAME in names,
           '' if PM2_NAME in names else 'yang ada: ' + ', '.join(n for n in names if n)[:120])
except Exception as exc:                                    # noqa: BLE001
    report('daftar pm2 terbaca', False, str(exc)[:120])

if not ok:
    print('\nDeploy DIBATALKAN — perbaiki dulu yang gagal di atas.')
    print('Tidak ada berkas yang diunggah dan aplikasi tidak di-restart.')
    sys.exit(1)

print('\nSemua pemeriksaan lolos.')
sys.exit(0)
