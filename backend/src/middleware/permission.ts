import { Request, Response, NextFunction } from 'express';
import { dbAll, dbGet } from '../config/database';

/**
 * Penegakan RBAC di backend.
 *
 * Sebelumnya seluruh endpoint kantor hanya memakai authMiddleware, sehingga
 * siapa pun yang punya token desktop bisa membuat user, mengubah role orang
 * lain, dan menghapus permission. Pemisahan token mobile/admin membedakan
 * JENIS token, bukan KEWENANGAN antar-user desktop.
 *
 * Nama permission mengikuti data yang sudah ada di database: `resource.action`,
 * mis. `admin.users.create`, `hr.payroll.view`. String yang sama sudah dipakai
 * frontend lewat authStore.hasPermission(), jadi penegakan ini konsisten dengan
 * apa yang memang sudah disembunyikan di UI.
 */

interface AuthedRequest extends Request {
  userId?: number;
  user?: any;
}

// Level 10 = master admin. Sengaja disamakan dengan aturan di frontend
// (authStore.hasPermission) supaya UI dan backend tidak berbeda pendapat.
const MASTER_LEVEL = 10;

// user_level dan permission dibaca dari DATABASE, bukan dari payload token.
// Kalau dibaca dari token, pencabutan hak baru berlaku setelah token kedaluwarsa.
export const loadUserAccess = async (userId: number): Promise<{ level: number; perms: Set<string> } | null> => {
  const user: any = await dbGet(
    'SELECT id, role_id, user_level, is_active FROM users WHERE id = ?',
    [userId]
  );

  // Master admin hardcoded tidak punya baris di tabel users
  if (!user) {
    return userId === 99999 ? { level: MASTER_LEVEL, perms: new Set() } : null;
  }
  if (user.is_active === 0) return null;

  const level = Number(user.user_level || 0);
  if (level >= MASTER_LEVEL) return { level, perms: new Set() }; // bypass, tidak perlu query permission

  const rows = await dbAll(
    `SELECT CONCAT(p.resource, '.', p.action) AS perm
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [user.role_id]
  ) as any[];

  return { level, perms: new Set(rows.map(r => r.perm)) };
};

/**
 * Pemakaian: router.post('/', authMiddleware, requirePermission('admin.users.create'), handler)
 *
 * Beberapa permission = cukup salah satu dimiliki (OR), bukan semuanya.
 */
export const requirePermission = (...required: string[]) => {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        // requirePermission selalu dipasang SETELAH authMiddleware
        return res.status(401).json({ error: 'No token provided' });
      }

      const access = await loadUserAccess(req.userId);
      if (!access) return res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan' });

      if (access.level >= MASTER_LEVEL) return next();
      if (required.some(p => access.perms.has(p))) return next();

      return res.status(403).json({
        error: 'Anda tidak punya hak untuk tindakan ini',
        required,
        code: 'PERMISSION_DENIED',
      });
    } catch (error: any) {
      console.error('requirePermission error:', error.message);
      res.status(500).json({ error: 'Gagal memeriksa hak akses' });
    }
  };
};
