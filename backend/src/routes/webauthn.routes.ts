import express, { Request, Response } from 'express';
import { businessDate, businessTime, businessDatePart } from '../utils/date.utils';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { generateMobileToken, mobileAuthMiddleware, anyAuthMiddleware, authMiddleware, assertSelf, MobileAuthRequest } from '../middleware/auth';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const router = express.Router();

const RP_NAME = 'BlackBox EPC Employee Portal';
const RP_ID   = process.env.WEBAUTHN_RP_ID  || 'blackboxs.io';
const ORIGIN  = process.env.WEBAUTHN_ORIGIN || 'https://blackboxs.io';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Validate current GPS against ALL registered locations of an employee credential
function validateGPSAgainstCredential(
  currentLat: number, currentLng: number,
  regLat: number, regLng: number, radius: number
): { valid: boolean; distance: number } {
  const dist = Math.round(haversineMeters(currentLat, currentLng, regLat, regLng));
  return { valid: dist <= radius, distance: dist };
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

// POST /webauthn/register/options
router.post('/register/options', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const employee_id = req.employeeId; // dari token — hanya boleh mendaftar untuk diri sendiri
    const emp: any = await dbGet(
      'SELECT id, code, name FROM employees WHERE id = ? AND status = ?',
      [employee_id, 'ACTIVE']
    );
    if (!emp) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

    const existingCreds = await dbAll(
      'SELECT credential_id FROM employee_webauthn_credentials WHERE employee_id = ?',
      [employee_id]
    ) as any[];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(String(emp.id)),
      userName: emp.code,
      userDisplayName: emp.name,
      attestationType: 'none',
      excludeCredentials: existingCreds.map(c => ({
        id: c.credential_id as string,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    // Store challenge (5 min TTL)
    await dbRun('DELETE FROM webauthn_challenges WHERE employee_id = ? AND type = ?', [employee_id, 'registration']);
    await dbRun(
      'INSERT INTO webauthn_challenges (employee_id, challenge, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
      [employee_id, options.challenge, 'registration']
    );

    res.json(options);
  } catch (error: any) {
    console.error('register/options error:', error);
    res.status(500).json({ error: 'Gagal: ' + error.message });
  }
});

/**
 * Lokasi kerja yang sah untuk sebuah kredensial (DR-P0-06).
 *
 * Koordinat dan radius TIDAK BOLEH datang dari karyawan. Sebelumnya
 * `register/verify` dan `PUT /credentials/:id/location` menerima `latitude`,
 * `longitude`, dan `radius` mentah dari body — karyawan tinggal mengirim
 * koordinat rumahnya sendiri dan pemeriksaan GPS kehilangan seluruh artinya.
 *
 * Sekarang klien hanya memilih ID kantor; angkanya diambil dari
 * `office_locations` yang dikelola admin.
 */
const resolveOfficeLocation = async (officeLocationId: any) => {
  const id = Number(officeLocationId);
  if (!id) return null;
  const row: any = await dbGet(
    'SELECT id, name, latitude, longitude, radius_m FROM office_locations WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    lat: parseFloat(row.latitude),
    lng: parseFloat(row.longitude),
    radius: Number(row.radius_m) || 200,
  };
};

// POST /webauthn/register/verify — save credential + GPS location
router.post('/register/verify', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const { registration_response, device_name, office_location_id } = req.body;
    const employee_id = req.employeeId; // dari token

    const challengeRow: any = await dbGet(
      'SELECT * FROM webauthn_challenges WHERE employee_id = ? AND type = ? AND expires_at > NOW()',
      [employee_id, 'registration']
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expired, coba daftarkan ulang' });

    // Lokasi kerja diambil dari daftar kantor yang dikelola admin, bukan dari
    // koordinat yang dikirim karyawan.
    //
    // Diperiksa SEBELUM verifikasi biometrik: kalau ditolak sesudahnya,
    // authenticator sudah terlanjur membuat credential di perangkat sementara
    // server tidak menyimpannya — karyawan melihat "sidik jari terdaftar" di HP
    // padahal tidak.
    const office = await resolveOfficeLocation(office_location_id);
    if (!office) {
      return res.status(400).json({
        error: 'Pilih lokasi kerja yang terdaftar terlebih dahulu.',
        code: 'OFFICE_LOCATION_REQUIRED',
      });
    }

    const verification = await verifyRegistrationResponse({
      response: registration_response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verifikasi sidik jari gagal' });
    }

    const { credential } = verification.registrationInfo;
    const credentialId = Buffer.from(credential.id).toString('base64url');
    const publicKey    = Buffer.from(credential.publicKey).toString('base64');

    // Save credential WITH registered GPS location
    await dbRun(
      `INSERT INTO employee_webauthn_credentials 
        (employee_id, credential_id, public_key, counter, device_name, 
         registered_lat, registered_lng, registered_radius, location_name, office_location_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id, credentialId, publicKey, credential.counter,
        device_name || 'HP Karyawan',
        office.lat, office.lng, office.radius,
        office.name, office.id
      ]
    );
    await dbRun('DELETE FROM webauthn_challenges WHERE id = ?', [challengeRow.id]);

    res.json({
      success: true,
      message: `✅ Sidik jari berhasil didaftarkan untuk ${office.name}.\nRadius toleransi: ${office.radius}m.`,
    });
  } catch (error: any) {
    console.error('register/verify error:', error);
    res.status(500).json({ error: 'Registrasi gagal: ' + error.message });
  }
});

// ─── AUTHENTICATION (ABSEN) ───────────────────────────────────────────────────

// POST /webauthn/auth/options
router.post('/auth/options', async (req: Request, res: Response) => {
  try {
    const { employee_id } = req.body;

    const creds = await dbAll(
      'SELECT * FROM employee_webauthn_credentials WHERE employee_id = ?',
      [employee_id]
    ) as any[];
    if (!creds.length) {
      return res.status(404).json({
        error: 'Sidik jari belum didaftarkan. Silakan daftar di menu Pengaturan.',
        code: 'NO_CREDENTIAL'
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: creds.map(c => ({
        id: c.credential_id as string,
        type: 'public-key' as const,
        transports: ['internal' as const],
      })),
    });

    await dbRun('DELETE FROM webauthn_challenges WHERE employee_id = ? AND type = ?', [employee_id, 'authentication']);
    await dbRun(
      'INSERT INTO webauthn_challenges (employee_id, challenge, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
      [employee_id, options.challenge, 'authentication']
    );

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: 'Gagal: ' + error.message });
  }
});

// POST /webauthn/auth/verify — MAIN ABSEN: verify fingerprint AND GPS, then check-in/out
router.post('/auth/verify', async (req: Request, res: Response) => {
  try {
    const { employee_id, auth_response, latitude, longitude, type } = req.body;
    // type = 'in' | 'out' | 'auto'

    // Tanpa ini, `employee_id` undefined menembus sampai ke driver MySQL dan
    // keluar sebagai 500 berikut pesan internalnya. Permintaan cacat harus
    // ditolak sebagai permintaan cacat.
    if (!employee_id || !auth_response) {
      return res.status(400).json({ error: 'employee_id dan auth_response diperlukan' });
    }

    // 1. Get challenge
    const challengeRow: any = await dbGet(
      'SELECT * FROM webauthn_challenges WHERE employee_id = ? AND type = ? AND expires_at > NOW()',
      [employee_id, 'authentication']
    );
    if (!challengeRow) return res.status(400).json({ error: 'Session expired, coba lagi' });

    // 2. Find credential used (match by rawId from auth_response)
    const creds = await dbAll(
      'SELECT * FROM employee_webauthn_credentials WHERE employee_id = ?',
      [employee_id]
    ) as any[];
    if (!creds.length) return res.status(404).json({ error: 'Sidik jari tidak terdaftar' });

    // Find the credential matching the response id
    const usedCredentialId = auth_response.id;
    let credRow = creds.find(c => c.credential_id === usedCredentialId) || creds[0];

    // 3. Verify fingerprint via WebAuthn
    const verification = await verifyAuthenticationResponse({
      response: auth_response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id as string,
        publicKey: Buffer.from(credRow.public_key, 'base64'),
        counter: Number(credRow.counter),
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: '❌ Sidik jari tidak cocok' });
    }

    // 4. Verify GPS — check current location vs REGISTERED location
    const currentLat = parseFloat(latitude);
    const currentLng = parseFloat(longitude);
    let gpsResult: any = { valid: false, distance: -1, location: credRow.location_name, registered: false };

    if (!currentLat || !currentLng) {
      gpsResult = { valid: false, distance: -1, location: credRow.location_name, error: 'GPS tidak tersedia' };
    } else if (!credRow.registered_lat || !credRow.registered_lng) {
      // DR-P0-06: kredensial tanpa lokasi terdaftar dulu DILOLOSKAN dengan
      // `valid: true` — artinya siapa pun yang punya kredensial semacam itu bisa
      // absen dari mana saja, dan pemeriksaan GPS-nya hanya formalitas.
      // Sekarang ditolak dan diarahkan mendaftar ulang.
      return res.status(403).json({
        error: 'Perangkat ini belum terikat lokasi kerja. Daftarkan ulang sidik jari lewat Pengaturan.',
        code: 'CREDENTIAL_WITHOUT_LOCATION',
      });
    } else {
      const check = validateGPSAgainstCredential(
        currentLat, currentLng,
        parseFloat(credRow.registered_lat), parseFloat(credRow.registered_lng),
        parseInt(credRow.registered_radius) || 200
      );
      gpsResult = {
        valid: check.valid, distance: check.distance,
        location: credRow.location_name,
        radius: credRow.registered_radius,
        registered: true,
      };
    }

    // 5. BOTH must pass: fingerprint ✅ + GPS ✅
    if (!gpsResult.valid) {
      return res.status(403).json({
        error: `📍 Di luar area absensi.\nJarak: ${gpsResult.distance}m dari ${gpsResult.location} (radius ${credRow.registered_radius}m).\nPastikan Anda berada di lokasi kerja yang sudah didaftarkan.`,
        gps: gpsResult,
        fingerprint_ok: true,
      });
    }

    // 6-7. Konsumsi challenge + counter + penulisan absensi: SATU transaction
    //      (DR-P0-06).
    //
    // Sebelumnya tiga penulisan autocommit terpisah tanpa lock. Akibatnya:
    //   - dua permintaan paralel sama-sama membaca challenge yang sama sebelum
    //     salah satunya menghapusnya — replay window;
    //   - check-in kedua MENIMPA `check_in` yang sudah final, jadi jam masuk
    //     bisa digeser hanya dengan absen lagi;
    //   - kegagalan di tengah meninggalkan counter naik tanpa absensi tercatat.
    const now   = new Date();
    // DR-P0-06: tanggal & jam absensi menurut WIB. Server berjalan UTC, jadi
    // absen 06:30 WIB dulu tercatat di TANGGAL KEMARIN — masuk periode payroll
    // yang salah, dan cek "sudah absen hari ini" melihat hari yang keliru.
    const today = businessDate(now);
    const time  = businessTime(now);

    const hasilAbsen = await withTransaction(async tx => {
      // Challenge dikonsumsi DULU dan sekali saja. Kalau baris ini sudah hilang,
      // permintaan lain sudah memakainya — itu replay, bukan absen baru.
      const konsumsi = await tx.run(
        'DELETE FROM webauthn_challenges WHERE id = ? AND employee_id = ?',
        [challengeRow.id, employee_id]
      );
      if (!konsumsi.affectedRows) {
        return { error: 409, body: { error: 'Sesi absensi sudah dipakai. Ulangi dari awal.', code: 'CHALLENGE_ALREADY_USED' } };
      }

      await tx.run(
        'UPDATE employee_webauthn_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?',
        [verification.authenticationInfo.newCounter, credRow.id]
      );

      const existing: any = await tx.get(
        'SELECT id, check_in, check_out FROM attendance_logs WHERE employee_id = ? AND date = ? FOR UPDATE',
        [employee_id, today]
      );

      let checkinType = type;
      if (!checkinType || checkinType === 'auto') {
        checkinType = !existing?.check_in ? 'in' : (!existing?.check_out ? 'out' : 'done');
      }

      if (checkinType === 'in') {
        // Jam masuk yang sudah tercatat TIDAK boleh ditimpa. Versi lama
        // meng-UPDATE `check_in` apa adanya, jadi absen lagi menggeser jam masuk.
        if (existing?.check_in) {
          return {
            ok: true as const,
            checkin: { type: 'done', time: existing.check_in,
              message: `Sudah check-in hari ini pukul ${existing.check_in}` },
          };
        }
        if (existing) {
          await tx.run(
            'UPDATE attendance_logs SET check_in=?, status=?, timesheet_value=1, gps_lat=?, gps_lng=?, gps_verified=1 WHERE id=? AND check_in IS NULL',
            [time, 'present', currentLat, currentLng, existing.id]
          );
        } else {
          await tx.run(
            'INSERT INTO attendance_logs (employee_id,date,check_in,status,timesheet_value,gps_lat,gps_lng,gps_verified) VALUES (?,?,?,?,1,?,?,1)',
            [employee_id, today, time, 'present', currentLat, currentLng]
          );
        }
        return {
          ok: true as const,
          checkin: { type: 'in', time,
            message: `✅ Check-In ${time}\nLokasi: ${gpsResult.location} (${gpsResult.distance}m)` },
        };
      }

      if (checkinType === 'out') {
        if (!existing) {
          return { ok: true as const, checkin: { type: 'done', message: 'Belum ada check-in hari ini.' } };
        }
        // Jam pulang yang sudah final juga tidak ditimpa.
        if (existing.check_out) {
          return {
            ok: true as const,
            checkin: { type: 'done', time: existing.check_out,
              message: `Sudah check-out hari ini pukul ${existing.check_out}` },
          };
        }
        await tx.run(
          'UPDATE attendance_logs SET check_out=?, gps_lat=?, gps_lng=?, gps_verified=1 WHERE id=? AND check_out IS NULL',
          [time, currentLat, currentLng, existing.id]
        );
        return {
          ok: true as const,
          checkin: { type: 'out', time,
            message: `👋 Check-Out ${time}\nLokasi: ${gpsResult.location} (${gpsResult.distance}m)` },
        };
      }

      return { ok: true as const, checkin: { type: 'done', message: 'Absensi hari ini sudah lengkap ✓' } };
    });

    if ('error' in hasilAbsen) return res.status(hasilAbsen.error).json(hasilAbsen.body);
    const checkinResult = hasilAbsen.checkin;

    // Get updated employee data
    const emp: any = await dbGet(
      `SELECT e.id, e.code, e.name, e.position, d.name as department
       FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [employee_id]
    );

    res.json({
      success: true,
      fingerprint: true,
      gps: gpsResult,
      checkin: checkinResult,
      employee: emp,
      token: generateMobileToken(Number(employee_id)),
    });
  } catch (error: any) {
    console.error('auth/verify error:', error);
    res.status(500).json({ error: 'Autentikasi gagal: ' + error.message });
  }
});

// ─── CREDENTIAL MANAGEMENT ────────────────────────────────────────────────────

// GET /webauthn/credentials/count — for admin dashboard
router.get('/credentials/count', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const row: any = await dbGet('SELECT COUNT(DISTINCT employee_id) as count FROM employee_webauthn_credentials');
    res.json({ count: row?.count || 0 });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// GET /webauthn/credentials/:employee_id
router.get('/credentials/:employee_id', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    if (!assertSelf(req, res, req.params.employee_id)) return;
    const rows = await dbAll(
      `SELECT id, device_name, registered_lat, registered_lng, registered_radius,
              location_name, created_at, last_used_at
       FROM employee_webauthn_credentials WHERE employee_id = ? ORDER BY created_at DESC`,
      [req.employeeId]
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// Kredensial hanya boleh disentuh pemiliknya — :id di sini adalah id baris
// kredensial, bukan employee_id, jadi kepemilikannya dicek lewat query.
const ownsCredential = async (req: MobileAuthRequest, res: Response): Promise<boolean> => {
  const row: any = await dbGet(
    'SELECT employee_id FROM employee_webauthn_credentials WHERE id = ?',
    [req.params.id]
  );
  if (!row) { res.status(404).json({ error: 'Kredensial tidak ditemukan' }); return false; }
  if (Number(row.employee_id) !== req.employeeId) {
    res.status(403).json({ error: 'Bukan kredensial Anda' });
    return false;
  }
  return true;
};

// DELETE /webauthn/credentials/:id
router.delete('/credentials/:id', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    if (!(await ownsCredential(req, res))) return;
    await dbRun('DELETE FROM employee_webauthn_credentials WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// PUT /webauthn/credentials/:id/location — update registered GPS
router.put('/credentials/:id/location', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    if (!(await ownsCredential(req, res))) return;
    // DR-P0-06: karyawan hanya boleh MEMILIH di antara kantor yang terdaftar.
    // Sebelumnya ia bisa mengirim koordinat apa pun — termasuk rumahnya sendiri —
    // sehingga absen "di lokasi" bisa dilakukan dari mana saja.
    const office = await resolveOfficeLocation(req.body?.office_location_id);
    if (!office) {
      return res.status(400).json({
        error: 'Pilih lokasi kerja yang terdaftar terlebih dahulu.',
        code: 'OFFICE_LOCATION_REQUIRED',
      });
    }
    await dbRun(
      'UPDATE employee_webauthn_credentials SET registered_lat=?, registered_lng=?, registered_radius=?, location_name=?, office_location_id=? WHERE id=?',
      [office.lat, office.lng, office.radius, office.name, office.id, req.params.id]
    );
    res.json({ success: true, location: { name: office.name, radius: office.radius } });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// ─── OFFICE LOCATIONS (Admin managed) ────────────────────────────────────────

// GET /webauthn/offices — dibaca onboarding mobile & admin desktop
router.get('/offices', anyAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, name, latitude, longitude, radius_m, project_name, is_active, created_at
       FROM office_locations ORDER BY is_active DESC, name ASC`
    );
    res.json({ data: rows });
  } catch (error: any) {
    console.error('offices GET error:', error);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
});

// POST /webauthn/offices — create new location
router.post('/offices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, latitude, longitude, radius_m, project_id, is_active, description } = req.body;
    if (!name || !latitude || !longitude) {
      return res.status(400).json({ error: 'name, latitude, longitude wajib diisi' });
    }
    await dbRun(
      `INSERT INTO office_locations (name, latitude, longitude, radius_m, project_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius_m) || 200,
        description || null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
      ]
    );
    res.json({ success: true, message: 'Lokasi berhasil ditambahkan' });
  } catch (error: any) {
    console.error('offices POST error:', error);
    res.status(500).json({ error: 'Gagal menyimpan: ' + error.message });
  }
});

// PUT /webauthn/offices/:id — update location
router.put('/offices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, latitude, longitude, radius_m, is_active, description } = req.body;
    await dbRun(
      `UPDATE office_locations SET name=?, latitude=?, longitude=?, radius_m=?, project_name=?, is_active=?
       WHERE id=?`,
      [
        name,
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius_m) || 200,
        description || null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        req.params.id,
      ]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Gagal update: ' + error.message });
  }
});

// DELETE /webauthn/offices/:id
router.delete('/offices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM office_locations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Gagal hapus: ' + error.message });
  }
});

export default router;
