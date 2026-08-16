import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { dbAll, dbGet, dbRun, MASTER_EMAIL, MASTER_FALLBACK_ID } from '../config/database';
import { hashPassword, verifyPassword, validateEmail } from '../utils/auth.utils';
import { generateToken, authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * Perbandingan yang tidak membocorkan hasil lewat lama eksekusi.
 * Panjang yang berbeda tetap terdeteksi lebih dulu — itu kebocoran yang bisa
 * diterima dan sudah lazim.
 */
const secretEquals = (a: string, b: string): boolean => {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

/**
 * Password master — DR-P0 (review 16 Agustus 2026).
 *
 * Sebelumnya jalur ini berbunyi `password === 'master'`, literal, di repo yang
 * PUBLIK. Artinya siapa pun yang membuka GitHub bisa login ke produksi sebagai
 * master penuh: user_level 10 dan seluruh permission, tanpa menyentuh database.
 * Terbuka sejak review pertama 4 Agustus.
 *
 * Sekarang dibaca dari `MASTER_PASSWORD` di `.env` server, jadi kode tidak lagi
 * memuat kredensial apa pun.
 *
 * FAIL CLOSED: kalau tidak diisi — atau masih diisi 'master' yang sudah terlanjur
 * publik — jalur master MATI. Tidak ada default diam-diam, karena default itulah
 * yang membuat lubang ini bertahan dua belas hari.
 */
const masterLoginPassword = (): string | null => {
  const value = process.env.MASTER_PASSWORD || '';
  if (!value) return null;
  if (value === 'master') {
    console.error(
      '🚨 MASTER_PASSWORD masih bernilai "master" — kredensial itu sudah publik di repo. '
      + 'Jalur login master DINONAKTIFKAN sampai diganti.'
    );
    return null;
  }
  if (value.length < 12) {
    console.warn(`⚠️  MASTER_PASSWORD hanya ${value.length} karakter. Disarankan minimal 12.`);
  }
  return value;
};

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      // Master user — password dari .env, bukan dari kode. Lihat masterLoginPassword().
      const masterPass = masterLoginPassword();
      if (masterPass && email === MASTER_EMAIL && secretEquals(password, masterPass)) {
        // Token harus menunjuk ke baris users yang NYATA: banyak tabel punya FK
        // created_by → users(id), jadi id yang tidak ada di tabel membuat master
        // gagal membuat aset, dokumen, dsb. ensureMasterUserRow() menjamin
        // barisnya ada; id-nya bisa berbeda antar instalasi.
        const masterRow: any = await dbGet('SELECT id FROM users WHERE email = ? LIMIT 1', [MASTER_EMAIL]);
        const masterId = masterRow?.id || MASTER_FALLBACK_ID;

        const token = generateToken(masterId, 10);
        // Fetch all permissions for master admin
        const allPerms = await dbAll(`SELECT CONCAT(resource, '.', action) as perm FROM permissions`, []) as any[];
        return res.json({
          message: 'Login successful',
          token,
          user: {
            id: masterId,
            email: MASTER_EMAIL,
            name: 'Master Admin',
            role: 'Master Administrator',
            role_id: null,
            user_level: 10,
            permissions: allPerms.map(p => p.perm),
          },
        });
      }

      // Find user by email
      const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]) as any;

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const isPasswordValid = await verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token with user level
      const token = generateToken(user.id, user.user_level || 1);

      // Fetch user's role permissions
      let permissions: string[] = [];
      if (user.role_id) {
        const perms = await dbAll(`
          SELECT CONCAT(p.resource, '.', p.action) as perm
          FROM permissions p
          INNER JOIN role_permissions rp ON p.id = rp.permission_id
          WHERE rp.role_id = ?
        `, [user.role_id]) as any[];
        permissions = perms.map(p => p.perm);
      }

      // Get role name
      let roleName = user.role || '';
      if (user.role_id) {
        const roleRow = await dbGet('SELECT name FROM roles WHERE id = ?', [user.role_id]) as any;
        if (roleRow) roleName = roleRow.name;
      }

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.full_name,
          role: roleName,
          role_id: user.role_id,
          user_level: user.user_level || 1,
          permissions,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// POST /api/auth/register — ERP internal: user dibuat oleh admin, bukan
// registrasi mandiri. Dulu endpoint ini terbuka tanpa auth sehingga siapa pun
// bisa membuat akun sendiri lalu langsung mendapat JWT.
router.post(
  '/register',
  authMiddleware,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').notEmpty().withMessage('Name is required'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password, name } = req.body;

      // Check if user already exists
      const existingUser = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Get default role for new users (Officer)
      const defaultRole = await dbGet('SELECT id FROM roles WHERE code = ?', ['OFFICER']) as { id: number } | undefined;

      // Insert user with default role and user_level
      const result = await dbRun(
        'INSERT INTO users (email, password, name, role_id, user_level, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [email, hashedPassword, name, defaultRole?.id || null, 1]
      );

      // Sengaja TIDAK menerbitkan token: yang memanggil endpoint ini adalah
      // admin yang membuatkan akun, bukan user yang bersangkutan.
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: result.insertId,
          email,
          name,
          role: 'user',
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

export default router;
