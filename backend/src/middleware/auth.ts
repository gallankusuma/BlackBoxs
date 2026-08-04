import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
  userId?: number;
  user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
                  || (req.query.token as string | undefined);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

    // Token mobile ditandatangani JWT_SECRET yang sama, jadi jwt.verify() saja
    // lolos. Payload-nya wajib dicek: tanpa ini, token karyawan bisa membuka
    // seluruh endpoint admin dengan req.userId = undefined.
    if (decoded?.scope === MOBILE_SCOPE || !decoded?.userId) {
      return res.status(401).json({ error: 'Invalid token' });
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
    process.env.JWT_SECRET || 'secret',
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
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.MOBILE_JWT_EXPIRES_IN || '30d' } as jwt.SignOptions
  );
};

export const mobileAuthMiddleware = (req: MobileAuthRequest, res: Response, next: NextFunction) => {
  const unauthorized = () =>
    res.status(401).json({ error: 'Sesi berakhir, silakan login ulang', code: 'MOBILE_AUTH_REQUIRED' });

  try {
    const token = req.headers.authorization?.split(' ')[1]
                  || (req.query.token as string | undefined);

    if (!token) return unauthorized();

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    if (decoded?.scope !== MOBILE_SCOPE || !decoded?.employeeId) return unauthorized();

    req.employeeId = Number(decoded.employeeId);
    next();
  } catch (error) {
    unauthorized();
  }
};

// Untuk resource yang sah diakses dua sisi — misal master lokasi kantor, dibaca
// saat onboarding karyawan sekaligus dikelola admin dari desktop.
export const anyAuthMiddleware = (req: MobileAuthRequest & AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
                  || (req.query.token as string | undefined);

    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    if (decoded?.scope === MOBILE_SCOPE && decoded?.employeeId) {
      req.employeeId = Number(decoded.employeeId);
    } else if (decoded?.userId) {
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
