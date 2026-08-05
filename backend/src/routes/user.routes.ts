import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { loadUserAccess, requirePermission } from '../middleware/permission';
import { hashPassword, verifyPassword, validateEmail } from '../utils/auth.utils';

const router = Router();

const USER_SELECT = `
  SELECT u.id,
         u.username,
         u.email,
         u.full_name AS name,
         u.full_name,
         u.department_id,
         d.name AS department_name,
         u.role_id,
         r.name AS role_name,
         u.user_level,
         u.phone,
         u.address,
         u.is_active,
         u.last_login,
         u.created_at,
         u.updated_at
  FROM users u
  LEFT JOIN departments d ON u.department_id = d.id
  LEFT JOIN roles r ON u.role_id = r.id
`;

const deriveUsername = async (email: string, baseUsername?: string): Promise<string> => {
  const seed = (baseUsername || email.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 80) || 'user';
  let candidate = seed;
  let i = 1;
  while (true) {
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [candidate]);
    if (!existing) return candidate;
    i += 1;
    candidate = `${seed}${i}`;
    if (i > 999) return `${seed}_${Date.now()}`;
  }
};

// Daftar user dipakai luas untuk dropdown (pilih project manager, tampilkan
// nama approver, filter audit log), jadi tidak digembok permission admin.
// Tapi kolom pribadi — email, telepon, alamat, level, last_login — hanya
// dikirim ke pemegang admin.users.view.
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const users = await dbAll(`${USER_SELECT} ORDER BY d.name, u.full_name ASC`, []) as any[];

    const access = await loadUserAccess((req as any).userId);
    const canSeeDetail = !!access && (access.level >= 10 || access.perms.has('admin.users.view'));
    if (canSeeDetail) return res.json({ data: users });

    res.json({
      data: users.map(u => ({
        id: u.id, username: u.username, name: u.name, full_name: u.full_name,
        department_id: u.department_id, department_name: u.department_name,
        role_id: u.role_id, role_name: u.role_name, is_active: u.is_active,
      })),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /users/change-password - Change own password
router.put('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Fetch current hashed password
    const user = await dbGet('SELECT id, password FROM users WHERE id = ?', [userId]) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    // Hash and update
    const hashed = await hashPassword(newPassword);
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: error?.message || 'Failed to change password' });
  }
});

router.get('/profile/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const user = await dbGet(`${USER_SELECT} WHERE u.id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.get('/:id', authMiddleware, requirePermission('admin.users.view'), async (req: Request, res: Response) => {
  try {
    const user = await dbGet(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/', authMiddleware, requirePermission('admin.users.create'), async (req: Request, res: Response) => {
  try {
    const { name, email, password, department_id, role_id, user_level, phone, address, username: providedUsername, is_active } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password are required' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    // Sama seperti pada PUT: hanya master yang boleh membuat user selevel master
    const requestedLevel = Number.isFinite(Number(user_level)) ? Number(user_level) : 1;
    if (requestedLevel >= 10) {
      const requester = await loadUserAccess((req as any).userId);
      if (!requester || requester.level < 10) {
        return res.status(403).json({ error: 'Hanya master admin yang boleh membuat user dengan user_level 10 ke atas' });
      }
    }
    const username = await deriveUsername(email, providedUsername);
    const hashed = await hashPassword(password);
    const result = await dbRun(
      `INSERT INTO users (username, email, password, full_name, role_id, department_id, user_level, phone, address, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, hashed, name, role_id ?? null, department_id ?? null, requestedLevel, phone || null, address || null, is_active === false ? 0 : 1]
    );
    const created = await dbGet(`${USER_SELECT} WHERE u.id = ?`, [result.insertId]);
    res.status(201).json({ data: created });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error?.message || 'Failed to create user' });
  }
});

router.put('/:id', authMiddleware, requirePermission('admin.users.edit'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id, email FROM users WHERE id = ?', [id]) as any;
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const { name, email, password, department_id, role_id, user_level, phone, address, is_active } = req.body || {};
    if (email && email !== existing.email) {
      if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
      const dup = await dbGet('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id]);
      if (dup) return res.status(409).json({ error: 'Email already in use' });
    }
    const fields: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { fields.push('full_name = ?'); values.push(name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (department_id !== undefined) { fields.push('department_id = ?'); values.push(department_id ?? null); }
    if (role_id !== undefined) { fields.push('role_id = ?'); values.push(role_id ?? null); }
    // user_level >= 10 melewati SELURUH pemeriksaan permission, jadi hanya
    // master yang boleh memberikannya. Tanpa batasan ini, pemegang
    // admin.users.edit bisa mengangkat dirinya sendiri jadi master.
    if (user_level !== undefined && Number.isFinite(Number(user_level))) {
      const requested = Number(user_level);
      const requester = await loadUserAccess((req as any).userId);
      if (requested >= 10 && (!requester || requester.level < 10)) {
        return res.status(403).json({ error: 'Hanya master admin yang boleh memberikan user_level 10 ke atas' });
      }
      fields.push('user_level = ?'); values.push(requested);
    }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone ?? null); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address ?? null); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      fields.push('password = ?'); values.push(await hashPassword(password));
    }
    if (!fields.length) return res.json({ data: await dbGet(`${USER_SELECT} WHERE u.id = ?`, [id]) });
    values.push(id);
    await dbRun(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await dbGet(`${USER_SELECT} WHERE u.id = ?`, [id]);
    res.json({ data: updated });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error?.message || 'Failed to update user' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('admin.users.delete'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const requesterId = (req as any).userId;
    if (id === requesterId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    if (error?.message?.includes('foreign key constraint')) {
      return res.status(400).json({ error: 'Cannot delete this user because they are linked to other data (e.g. proposals, approvals). Please deactivate the user instead.' });
    }
    res.status(500).json({ error: error?.message || 'Failed to delete user' });
  }
});

export default router;
