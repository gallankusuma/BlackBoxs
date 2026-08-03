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

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = (decoded as any).userId;
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
