import jwt from 'jsonwebtoken';
import path from 'path';
import dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';
import { dbGet } from '../config/database';

// JWT_SECRET dibaca saat modul ini di-load, sedangkan dotenv.config() di
// index.ts baru jalan setelah semua import. Muat sendiri di sini supaya tidak
// bergantung pada urutan import.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// JWT_SECRET wajib ada. Dulu setiap pemanggilan memakai fallback
// `process.env.JWT_SECRET || 'secret'` — kalau variabel itu lupa diisi saat
// deploy, seluruh token ditandatangani dengan string 'secret' yang bisa ditebak
// siapa pun, dan aplikasinya tetap terlihat sehat. Lebih baik gagal saat boot.
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s.trim().length === 0) {
    throw new Error(
      'JWT_SECRET tidak diset. Isi di backend/.env sebelum menjalankan aplikasi — ' +
      'tanpa itu semua token bisa dipalsukan.'
    );
  }
  return s;
})();

// Token HANYA dibaca dari header Authorization. Dulu middleware juga menerima
// ?token=... di URL, yang ikut tersimpan di history browser, access log proxy,
// dan header Referer. Preview/unduh berkas kini memakai axios responseType
// 'blob' di frontend, jadi tidak ada lagi kebutuhan menaruh JWT di URL.
const bearerToken = (req: Request): string | undefined =>
  req.headers.authorization?.split(' ')[1];

interface AuthRequest extends Request {
  userId?: number;
  user?: any;
}

/**
 * Status akun diperiksa ke DATABASE tiap request (DR-P1-01).
 *
 * Login dulu tidak memeriksa `is_active`, dan middleware hanya memverifikasi
 * tanda tangan token. Akibatnya akun yang sudah dinonaktifkan tetap bisa login,
 * dan token yang sudah terbit sebelum penonaktifan tetap berlaku sampai
 * kedaluwarsa — 7 hari untuk desktop, 30 hari untuk mobile. Hanya endpoint yang
 * kebetulan memakai `requirePermission()` yang memeriksanya, dan mayoritas modul
 * belum memakainya.
 *
 * Diperiksa per request, bukan dari payload token, supaya penonaktifan langsung
 * berlaku — prinsip yang sama dengan level & permission di `requirePermission`.
 */
/**
 * Titik injeksi untuk tes unit.
 *
 * Middleware ini sengaja menyentuh database, dan itu membuatnya tidak lagi bisa
 * diuji sebagai fungsi murni. Daripada melemahkan pemeriksaannya demi tes, atau
 * memaksa tes unit menyediakan database, pencariannya dipisah ke objek ini —
 * `tests/auth-middleware.ts` menggantinya dengan stub, sedangkan produksi selalu
 * memakai yang asli.
 */
export const accountStatus = {
  isUserActive: async (userId: number): Promise<boolean> => {
    const row: any = await dbGet('SELECT is_active FROM users WHERE id = ?', [userId]);
    return !!row && !!row.is_active;
  },
  isEmployeeActive: async (employeeId: number): Promise<boolean> => {
    const row: any = await dbGet('SELECT status FROM employees WHERE id = ?', [employeeId]);
    return !!row && String(row.status).toUpperCase() === 'ACTIVE';
  },
};

const assertActiveUser = (userId: number) => accountStatus.isUserActive(userId);
const assertActiveEmployee = (employeeId: number) => accountStatus.isEmployeeActive(employeeId);

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = bearerToken(req);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Token mobile ditandatangani JWT_SECRET yang sama, jadi jwt.verify() saja
    // lolos. Payload-nya wajib dicek: tanpa ini, token karyawan bisa membuka
    // seluruh endpoint admin dengan req.userId = undefined.
    if (decoded?.scope === MOBILE_SCOPE || !decoded?.userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!(await assertActiveUser(decoded.userId))) {
      return res.status(401).json({
        error: 'Akun tidak aktif. Hubungi administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const generateToken = (userId: number, userLevel?: number) => {
  return jwt.sign(
    { userId, userLevel },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  );
};

// ===== MOBILE / PWA (employee self-service) =====
// Karyawan tidak punya akun `users`, jadi tokennya terpisah dari token admin:
// scope 'mobile' dicek eksplisit supaya token mobile tidak bisa dipakai di
// endpoint admin, dan sebaliknya.
const MOBILE_SCOPE = 'mobile';

export interface MobileAuthRequest extends Request {
  employeeId?: number;
}

export const generateMobileToken = (employeeId: number) => {
  return jwt.sign(
    { employeeId, scope: MOBILE_SCOPE },
    JWT_SECRET,
    { expiresIn: process.env.MOBILE_JWT_EXPIRES_IN || '30d' } as jwt.SignOptions
  );
};

export const mobileAuthMiddleware = async (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  const unauthorized = () =>
    res.status(401).json({ error: 'Sesi berakhir, silakan login ulang', code: 'MOBILE_AUTH_REQUIRED' });

  try {
    const token = bearerToken(req);

    if (!token) return unauthorized();

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.scope !== MOBILE_SCOPE || !decoded?.employeeId) return unauthorized();

    // Karyawan yang sudah tidak aktif tidak boleh memakai token lamanya —
    // masa berlaku token mobile 30 hari.
    if (!(await assertActiveEmployee(Number(decoded.employeeId)))) {
      return res.status(401).json({
        error: 'Akun karyawan tidak aktif. Hubungi HR.',
        code: 'EMPLOYEE_INACTIVE',
      });
    }

    req.employeeId = Number(decoded.employeeId);
    next();
  } catch (error) {
    unauthorized();
  }
};

// Untuk resource yang sah diakses dua sisi — misal master lokasi kantor, dibaca
// saat onboarding karyawan sekaligus dikelola admin dari desktop.
export const anyAuthMiddleware = async (req: MobileAuthRequest & AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = bearerToken(req);

    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.scope === MOBILE_SCOPE && decoded?.employeeId) {
      if (!(await assertActiveEmployee(Number(decoded.employeeId)))) {
        return res.status(401).json({ error: 'Akun karyawan tidak aktif', code: 'EMPLOYEE_INACTIVE' });
      }
      req.employeeId = Number(decoded.employeeId);
    } else if (decoded?.userId) {
      if (!(await assertActiveUser(decoded.userId))) {
        return res.status(401).json({ error: 'Akun tidak aktif', code: 'ACCOUNT_INACTIVE' });
      }
      req.userId = decoded.userId;
      req.user = decoded;
    } else {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Pastikan karyawan hanya membaca datanya sendiri. Dipakai di endpoint yang
// masih membawa :employee_id di URL — nilainya wajib cocok dengan token.
export const assertSelf = (req: MobileAuthRequest, res: Response, paramValue: unknown): boolean => {
  if (paramValue === undefined) return true;
  // Nilai non-string (mis. array dari query yang diulang) sengaja jatuh ke NaN,
  // yang tidak akan pernah sama dengan employeeId — jadi ditolak, bukan dilewatkan.
  const asNumber = Number(Array.isArray(paramValue) ? NaN : paramValue);
  if (asNumber !== req.employeeId) {
    res.status(403).json({ error: 'Tidak boleh mengakses data karyawan lain' });
    return false;
  }
  return true;
};
