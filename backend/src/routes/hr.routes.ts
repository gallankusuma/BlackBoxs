import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { authMiddleware, generateMobileToken, mobileAuthMiddleware, assertSelf, MobileAuthRequest } from '../middleware/auth';
import { requirePermission, loadUserAccess } from '../middleware/permission';

const router = express.Router();

// ===== POSITION RATES (MASTER STANDAR GAJI) =====

// DR-P0-03: tarif per jabatan adalah data kompensasi, bukan data operasional
// umum. Seluruh 5 user aktif produksi memegang permission hr.position-rates
// penuh, jadi penggembokan ini tidak mengunci siapa pun (diperiksa 16 Agustus).
router.get('/position-rates', authMiddleware, requirePermission('hr.position-rates.view'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM position_rates WHERE is_active = 1 ORDER BY position_name ASC, grade ASC', []
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching position rates:', error);
    res.status(500).json({ error: 'Failed to fetch position rates' });
  }
});

router.get('/position-rates/:id', authMiddleware, requirePermission('hr.position-rates.view'), async (req: Request, res: Response) => {
  try {
    const row = await dbGet('SELECT * FROM position_rates WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Position rate not found' });
    res.json({ data: row });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch position rate' });
  }
});

router.post('/position-rates', authMiddleware, requirePermission('hr.position-rates.create'), async (req: Request, res: Response) => {
  try {
    const { position_code, position_name, grade, salary_type, basic_rate, tunjangan_rate, ot_rate, description } = req.body;
    if (!position_code || !position_name) return res.status(400).json({ error: 'position_code and position_name required' });
    const result = await dbRun(
      `INSERT INTO position_rates (position_code, position_name, grade, salary_type, basic_rate, tunjangan_rate, ot_rate, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [position_code, position_name, grade || null, salary_type || 'daily',
       Number(basic_rate || 0), Number(tunjangan_rate || 0), Number(ot_rate || 0), description || null]
    );
    res.status(201).json({ message: 'Position rate created', data: { id: result.insertId } });
  } catch (error: any) {
    if (error.message?.includes('Duplicate')) return res.status(400).json({ error: 'Position code must be unique' });
    res.status(500).json({ error: 'Failed to create position rate' });
  }
});

router.put('/position-rates/:id', authMiddleware, requirePermission('hr.position-rates.edit'), async (req: Request, res: Response) => {
  try {
    const { position_code, position_name, grade, salary_type, basic_rate, tunjangan_rate, ot_rate, description, is_active } = req.body;
    await dbRun(
      `UPDATE position_rates SET position_code=?, position_name=?, grade=?, salary_type=?, basic_rate=?, tunjangan_rate=?, ot_rate=?, description=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [position_code, position_name, grade || null, salary_type || 'daily',
       Number(basic_rate || 0), Number(tunjangan_rate || 0), Number(ot_rate || 0),
       description || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id]
    );
    res.json({ message: 'Position rate updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update position rate' });
  }
});

router.delete('/position-rates/:id', authMiddleware, requirePermission('hr.position-rates.delete'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM position_rates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Position rate deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete position rate' });
  }
});

// ===== EMPLOYEES (HR LITE) =====

// DR-P0-03: daftar ini dipakai banyak layar sekadar untuk dropdown nama, jadi
// endpointnya TIDAK digembok — yang diredaksi angkanya.
//
// Sebelumnya setiap token desktop, level berapa pun, menerima `salary`,
// `basic_rate`, `tunjangan_rate`, dan `ot_rate` seluruh karyawan. Itu kebocoran
// data kompensasi lintas departemen lewat endpoint yang dipanggil hampir semua
// halaman.
router.get('/employees', authMiddleware, async (req: Request, res: Response) => {
  try {
    const access = await loadUserAccess((req as any).userId);
    const bolehLihatGaji = !!access && (access.level >= 10
      || access.perms.has('hr.payroll.view') || access.perms.has('hr.employees.view'));

    const employees = await dbAll(
      `SELECT e.id, e.code as employee_code, e.name as first_name, '' as last_name,
              e.email, e.phone, e.position, e.department_id, e.hire_date,
              e.salary as basic_salary, e.salary_type as contract_type,
              e.basic_rate, e.tunjangan_rate, e.ot_rate, e.status,
              e.created_at, e.updated_at, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       ORDER BY e.code ASC`,
      []
    );

    const data = bolehLihatGaji ? employees : (employees as any[]).map(e => ({
      ...e,
      basic_salary: null, basic_rate: null, tunjangan_rate: null, ot_rate: null,
      contract_type: null,
      salary_redacted: true,
    }));

    res.json({ data });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// ===== PENGELOLAAN PIN OLEH HR =====
// PIN awal dibuat acak dan hanya ditampilkan SEKALI di respons ini, karena yang
// tersimpan di database adalah hash-nya. Kalau HR kehilangan PIN itu, jalan
// satu-satunya adalah reset lagi.
const generatePin = () => String(randomInt(100000, 1000000)); // 6 digit

// POST /hr/employees/:id/reset-pin — reset PIN satu karyawan
// DR-P0-03: penerbitan PIN adalah kunci akun mobile karyawan — respons ini
// memuat PIN polos. Tanpa gembok, user desktop level berapa pun bisa mengambil
// NIK dari daftar employee, mereset PIN korban, lalu login sebagai korban,
// mendaftarkan sidik jarinya sendiri, dan membaca slip gaji serta absensinya.
router.post('/employees/:id/reset-pin', authMiddleware, requirePermission('hr.employees.edit'), async (req: Request, res: Response) => {
  try {
    const emp: any = await dbGet('SELECT id, code, name FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });

    const pin = generatePin();
    await dbRun(
      `UPDATE employees SET mobile_pin = ?, mobile_pin_set_at = NOW(),
         mobile_pin_must_change = 1, mobile_pin_failed_attempts = 0, mobile_pin_locked_until = NULL
       WHERE id = ?`,
      [await bcrypt.hash(pin, 10), emp.id]
    );

    res.json({
      success: true,
      employee: { id: emp.id, code: emp.code, name: emp.name },
      pin,
      message: 'PIN hanya ditampilkan sekali. Catat dan sampaikan ke karyawan.',
    });
  } catch (error) { res.status(500).json({ error: 'Gagal reset PIN' }); }
});

// POST /hr/employees/generate-missing-pins — untuk migrasi awal: buatkan PIN
// bagi semua karyawan aktif yang belum punya, sekali jalan.
// Lebih berat lagi: satu panggilan mengembalikan PIN SELURUH karyawan aktif
// yang belum punya PIN, sekaligus.
router.post('/employees/generate-missing-pins', authMiddleware, requirePermission('hr.employees.edit'), async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, code, name FROM employees WHERE status = 'ACTIVE' AND (mobile_pin IS NULL OR mobile_pin = '') ORDER BY code`
    ) as any[];

    const results: any[] = [];
    for (const emp of rows) {
      const pin = generatePin();
      await dbRun(
        `UPDATE employees SET mobile_pin = ?, mobile_pin_set_at = NOW(), mobile_pin_must_change = 1 WHERE id = ?`,
        [await bcrypt.hash(pin, 10), emp.id]
      );
      results.push({ id: emp.id, code: emp.code, name: emp.name, pin });
    }

    res.json({
      success: true,
      count: results.length,
      data: results,
      message: 'PIN hanya ditampilkan sekali. Simpan/cetak sebelum menutup halaman.',
    });
  } catch (error) { res.status(500).json({ error: 'Gagal membuat PIN' }); }
});

// GET /hr/employees/pin-status — siapa yang belum punya PIN / belum ganti
router.get('/employees/pin-status', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, code, name, position,
              (mobile_pin IS NOT NULL AND mobile_pin <> '') AS has_pin,
              mobile_pin_must_change, mobile_pin_set_at, mobile_pin_locked_until
       FROM employees WHERE status = 'ACTIVE' ORDER BY code`
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Gagal memuat status PIN' }); }
});

router.get('/employees/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const employee: any = await dbGet(
      `SELECT e.*, d.name as department_name FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [req.params.id]
    );
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    // `e.*` ikut membawa hash PIN — jangan pernah dikirim ke klien
    const { mobile_pin, ...safe } = employee;
    res.json({ data: safe });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

router.post('/employees', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, employee_code, name, first_name, last_name, email, phone, department_id, position, hire_date, is_active,
            basic_rate, tunjangan_rate, ot_rate, salary_type, contract_type, basic_salary, salary } = req.body;
    const empCode = code || employee_code;
    const empName = name || [first_name, last_name].filter(Boolean).join(' ');
    const empSalaryType = salary_type || contract_type || 'daily';
    const empSalary = salary || basic_salary || 0;
    if (!empCode || !empName) return res.status(400).json({ error: 'code and name are required' });
    const result = await dbRun(
      `INSERT INTO employees (code, name, email, phone, department_id, position, hire_date, status, basic_rate, tunjangan_rate, ot_rate, salary_type, salary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empCode, empName, email||null, phone||null, department_id||null, position||null, hire_date||null,
       is_active !== undefined ? (is_active ? 'ACTIVE' : 'INACTIVE') : 'ACTIVE',
       basic_rate||0, tunjangan_rate||0, ot_rate||0, empSalaryType, empSalary]
    );
    res.status(201).json({ message: 'Employee created', data: { id: result.insertId, code: empCode, name: empName } });
  } catch (error: any) {
    if (error.message?.includes('Duplicate entry')) return res.status(400).json({ error: 'Employee code must be unique' });
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/employees/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, first_name, last_name, email, phone, department_id, position, hire_date, is_active,
            basic_rate, tunjangan_rate, ot_rate, salary_type, contract_type, basic_salary, salary } = req.body;
    const empName = name || [first_name, last_name].filter(Boolean).join(' ');
    const empSalaryType = salary_type || contract_type || 'daily';
    const empSalary = salary || basic_salary || 0;
    await dbRun(
      `UPDATE employees 
       SET name=?, email=?, phone=?, department_id=?, position=?, hire_date=?, status=?,
           basic_rate=?, tunjangan_rate=?, ot_rate=?, salary_type=?,
           salary=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [empName, email||null, phone||null, department_id||null, position||null, hire_date||null,
       is_active !== undefined ? (is_active ? 'ACTIVE' : 'INACTIVE') : 'ACTIVE',
       basic_rate||0, tunjangan_rate||0, ot_rate||0, empSalaryType,
       empSalary, req.params.id]
    );
    res.json({ message: 'Employee updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Quick rate update from payslip editor (persists to employee record)
router.patch('/employees/:id/rates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ot_rate, basic_rate, tunjangan_rate } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (ot_rate !== undefined) { updates.push('ot_rate=?'); params.push(ot_rate); }
    if (basic_rate !== undefined) { updates.push('basic_rate=?'); params.push(basic_rate); }
    if (tunjangan_rate !== undefined) { updates.push('tunjangan_rate=?'); params.push(tunjangan_rate); }
    if (updates.length === 0) return res.status(400).json({ error: 'No rate fields provided' });
    updates.push('updated_at=CURRENT_TIMESTAMP');
    params.push(req.params.id);
    await dbRun(`UPDATE employees SET ${updates.join(', ')} WHERE id=?`, params);
    res.json({ message: 'Rates updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rates' });
  }
});

router.delete('/employees/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'Employee deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// ===== ATTENDANCE =====

router.get('/attendance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { project_id, month, year, employee_id } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (project_id) { where += ' AND a.project_id = ?'; params.push(project_id); }
    if (employee_id) { where += ' AND a.employee_id = ?'; params.push(employee_id); }
    if (month && year) { where += ' AND MONTH(a.date) = ? AND YEAR(a.date) = ?'; params.push(month, year); }
    const rows = await dbAll(
      `SELECT a.*, e.name as employee_name, e.code as employee_code, e.position,
              e.salary, e.basic_rate, e.tunjangan_rate, p.project_name as project_name
       FROM attendance_logs a
       LEFT JOIN employees e ON a.employee_id = e.id
       LEFT JOIN client_projects p ON a.project_id = p.id
       ${where} ORDER BY a.date DESC, e.name ASC`,
      params
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch attendance' }); }
});

router.post('/attendance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employee_id, date, project_id, check_in, check_out, status, timesheet_value, overtime_hours, notes } = req.body;
    if (!employee_id || !date) return res.status(400).json({ error: 'employee_id and date are required' });
    const existing: any = await dbGet('SELECT id FROM attendance_logs WHERE employee_id = ? AND date = ?', [employee_id, date]);
    if (existing) {
      await dbRun(
        'UPDATE attendance_logs SET check_in=?, check_out=?, status=?, timesheet_value=?, overtime_hours=?, notes=?, project_id=? WHERE id=?',
        [check_in||null, check_out||null, status||'present', timesheet_value??1, overtime_hours??0, notes||null, project_id||null, existing.id]
      );
      res.json({ message: 'Attendance updated', data: { id: existing.id } });
    } else {
      const result = await dbRun(
        'INSERT INTO attendance_logs (employee_id, date, project_id, check_in, check_out, status, timesheet_value, overtime_hours, notes) VALUES (?,?,?,?,?,?,?,?,?)',
        [employee_id, date, project_id||null, check_in||null, check_out||null, status||'present', timesheet_value??1, overtime_hours??0, notes||null]
      );
      res.status(201).json({ message: 'Attendance recorded', data: { id: result.insertId } });
    }
  } catch (error) { res.status(500).json({ error: 'Failed to record attendance' }); }
});

router.post('/attendance/bulk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { date, project_id, records } = req.body;
    if (!date || !records?.length) return res.status(400).json({ error: 'date and records required' });
    // Block future dates
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date > todayStr) return res.status(400).json({ error: 'Tidak bisa input absensi untuk tanggal di masa depan' });
    for (const r of records) {
      const ex: any = await dbGet('SELECT id FROM attendance_logs WHERE employee_id=? AND date=?', [r.employee_id, date]);
      if (ex) {
        await dbRun('UPDATE attendance_logs SET status=?, timesheet_value=?, check_in=?, check_out=?, overtime_hours=?, project_id=?, notes=? WHERE id=?',
          [r.status||'present', r.timesheet_value??1, r.check_in||null, r.check_out||null, r.overtime_hours??0, project_id||null, r.notes||null, ex.id]);
      } else {
        await dbRun('INSERT INTO attendance_logs (employee_id,date,project_id,status,timesheet_value,check_in,check_out,overtime_hours,notes) VALUES (?,?,?,?,?,?,?,?,?)',
          [r.employee_id, date, project_id||null, r.status||'present', r.timesheet_value??1, r.check_in||null, r.check_out||null, r.overtime_hours??0, r.notes||null]);
      }
    }
    res.json({ message: `${records.length} records saved` });
  } catch (error) { res.status(500).json({ error: 'Failed bulk attendance' }); }
});

// PUT /hr/attendance/:id — edit individual attendance record
router.put('/attendance/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { check_in, check_out, status, timesheet_value, overtime_hours, notes, project_id, date } = req.body;
    // Block future dates
    if (date) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (date > todayStr) return res.status(400).json({ error: 'Tidak bisa input absensi untuk tanggal di masa depan' });
    }
    const existing: any = await dbGet('SELECT id FROM attendance_logs WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' });
    await dbRun(
      `UPDATE attendance_logs SET check_in=?, check_out=?, status=?, timesheet_value=?, overtime_hours=?, notes=?, project_id=?${date ? ', date=?' : ''} WHERE id=?`,
      date
        ? [check_in||null, check_out||null, status||'present', timesheet_value??1, overtime_hours??0, notes||null, project_id||null, date, req.params.id]
        : [check_in||null, check_out||null, status||'present', timesheet_value??1, overtime_hours??0, notes||null, project_id||null, req.params.id]
    );
    res.json({ message: 'Attendance updated' });
  } catch (error) { res.status(500).json({ error: 'Failed to update attendance' }); }
});

// DELETE /hr/attendance/:id — delete individual attendance record
router.delete('/attendance/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM attendance_logs WHERE id = ?', [req.params.id]);
    res.json({ message: 'Attendance deleted' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete attendance' }); }
});


// ===== SALARY ADVANCES (KASBON) =====

router.get('/advances', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employee_id, status } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (employee_id) { where += ' AND sa.employee_id=?'; params.push(employee_id); }
    if (status) { where += ' AND sa.status=?'; params.push(status); }
    const rows = await dbAll(
      `SELECT sa.*, e.name as employee_name, e.code as employee_code, e.position
       FROM salary_advances sa JOIN employees e ON sa.employee_id=e.id
       ${where} ORDER BY sa.advance_date DESC, sa.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch advances' }); }
});

router.post('/advances', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employee_id, amount, description, advance_date, period_month, period_year } = req.body;
    if (!employee_id || !amount) return res.status(400).json({ error: 'employee_id and amount required' });
    const result = await dbRun(
      'INSERT INTO salary_advances (employee_id, amount, remaining, description, advance_date, period_month, period_year, status) VALUES (?,?,?,?,?,?,?,?)',
      [employee_id, amount, amount, description||null, advance_date||null, period_month||null, period_year||null, 'pending']
    );
    res.status(201).json({ message: 'Advance recorded', data: { id: result.insertId } });
  } catch (error) { res.status(500).json({ error: 'Failed to record advance' }); }
});

router.put('/advances/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount, remaining, description, advance_date, period_month, period_year, status } = req.body;
    await dbRun(
      'UPDATE salary_advances SET amount=?, remaining=?, description=?, advance_date=?, period_month=?, period_year=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [amount, remaining??amount, description||null, advance_date||null, period_month||null, period_year||null, status||'pending', req.params.id]
    );
    res.json({ message: 'Advance updated' });
  } catch (error) { res.status(500).json({ error: 'Failed to update advance' }); }
});

router.delete('/advances/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM salary_advances WHERE id=?', [req.params.id]);
    res.json({ message: 'Advance deleted' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete advance' }); }
});

// ===== PAYSLIP ENGINE =====

/**
 * Hitung slip gaji SEPENUHNYA dari data server (DR-P0-04).
 *
 * Diekstrak dari handler GET supaya jalur SIMPAN memakai perhitungan yang sama
 * persis. Sebelumnya `POST /payslip/save` menerima `calculation`, `advances`,
 * `deductions`, dan `net_salary` mentah dari body lalu menyimpannya apa adanya —
 * siapa pun yang bisa memanggil endpoint itu tinggal mengubah angkanya lewat
 * DevTools dan memfinalisasi gaji sembarang.
 *
 * Sumbernya: absensi (`attendance_logs`), tarif di baris karyawan, dan kasbon
 * (`salary_advances`) milik karyawan itu pada periode itu. Tidak ada satu pun
 * angka yang berasal dari klien.
 */
const computePayslip = async (
  employee_id: any, month: any, year: any, project_id: any,
): Promise<any> => {
    const emp: any = await dbGet('SELECT * FROM employees WHERE id=?', [employee_id]);
    if (!emp) return { error: 'Employee not found' };

    // ── Cut-off period: 26th prev month → 25th current month ──
    const m = Number(month);
    const y = Number(year);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear  = m === 1 ? y - 1 : y;
    const periodStart = `${prevYear}-${String(prevMonth).padStart(2,'0')}-26`;
    const periodEnd   = `${y}-${String(m).padStart(2,'0')}-25`;

    let where = 'WHERE a.employee_id=? AND a.date >= ? AND a.date <= ?';
    const params: any[] = [employee_id, periodStart, periodEnd];
    if (project_id) { where += ' AND a.project_id=?'; params.push(project_id); }
    const logs: any[] = await dbAll(
      `SELECT a.*, p.project_name as project_name FROM attendance_logs a
       LEFT JOIN client_projects p ON a.project_id=p.id ${where} ORDER BY a.date ASC`, params
    );

    // Determine rates
    const salaryType = emp.salary_type || 'daily'; // 'daily' | 'hourly' | 'monthly'
    const basicRateRaw = emp.basic_rate > 0 ? parseFloat(emp.basic_rate) : Math.round((emp.salary||0)/22);
    const tunjanganPerDay = emp.tunjangan_rate > 0 ? parseFloat(emp.tunjangan_rate) : 0;
    const WEEKLY_QUOTA = 40;

    // ── Timezone-safe date helpers ──
    function toDateStr(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function parseDateLocal(s: string): Date {
      // "2026-06-01" → local Date (not UTC)
      const [yy,mm,dd] = s.split('-').map(Number);
      return new Date(yy, mm-1, dd);
    }
    function logDateStr(log: any): string {
      if (typeof log.date === 'string') return log.date.slice(0, 10);
      return toDateStr(new Date(log.date));
    }
    function getWeekKey(dateStr: string): string {
      const d = parseDateLocal(dateStr);
      const day = d.getDay(); // 0=Sun..6=Sat
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Monday
      return toDateStr(d);
    }

    // For the 40h weekly rule, we need FULL week data for boundary weeks.
    const firstDate = logs.length > 0 ? logDateStr(logs[0]) : periodStart;
    const lastDate  = logs.length > 0 ? logDateStr(logs[logs.length-1]) : periodEnd;

    // Expand range to full weeks
    const firstMonday = getWeekKey(firstDate);
    const lastD = parseDateLocal(lastDate);
    const lastDow = lastD.getDay();
    lastD.setDate(lastD.getDate() + (lastDow === 0 ? 0 : 7 - lastDow)); // Sunday
    const expandedEnd = toDateStr(lastD);

    // Fetch supplemental logs for boundary weeks (outside main period)
    let supplementalLogs: any[] = [];
    if (firstMonday < periodStart || expandedEnd > periodEnd) {
      const suppParams: any[] = [employee_id, firstMonday, expandedEnd, periodStart, periodEnd];
      const projFilter = project_id ? ' AND a.project_id=?' : '';
      if (project_id) suppParams.push(project_id);
      supplementalLogs = await dbAll(
        `SELECT a.*, p.project_name as project_name FROM attendance_logs a
         LEFT JOIN client_projects p ON a.project_id=p.id
         WHERE a.employee_id=? AND a.date >= ? AND a.date <= ?
         AND (a.date < ? OR a.date > ?)${projFilter}
         ORDER BY a.date ASC`, suppParams
      );
    }

    // Combine all logs, marking in-period vs supplemental
    const allLogsForWeeks = [
      ...logs.map((l: any) => ({ ...l, _inPeriod: true })),
      ...supplementalLogs.map((l: any) => ({ ...l, _inPeriod: false })),
    ];

    // Group by week
    const weekMap: Record<string, any[]> = {};
    for (const log of allLogsForWeeks) {
      const ds = logDateStr(log);
      const wk = getWeekKey(ds);
      if (!weekMap[wk]) weekMap[wk] = [];
      weekMap[wk].push({ ...log, _dateStr: ds });
    }

    let recalcNormalHours = 0;
    let recalcOTHours = 0;
    let recalcNormalDays = 0;
    const adjustedOTMap: Record<string, number> = {};

    // Helper: compute actual work hours from check_in/check_out (minus 1h lunch)
    function actualHours(log: any): number {
      if (log.check_in && log.check_out) {
        const [ih, im] = String(log.check_in).split(':').map(Number);
        const [oh, om] = String(log.check_out).split(':').map(Number);
        const raw = (oh * 60 + om - ih * 60 - im) / 60 - 1; // minus 1h lunch
        return Math.max(0, Math.round(raw * 10) / 10);
      }
      return (parseFloat(log.timesheet_value) || 0) * 8; // fallback
    }

    for (const [, weekLogs] of Object.entries(weekMap)) {
      const weekdayLogs: any[] = [];
      const weekendLogs: any[] = [];
      for (const log of weekLogs) {
        const dow = parseDateLocal(log._dateStr).getDay();
        if (dow === 0 || dow === 6) weekendLogs.push(log);
        else weekdayLogs.push(log);
      }

      // weekdayHours: use ALL logs (incl. supplemental) for accurate 40h check
      let weekdayHours = 0;
      for (const log of weekdayLogs) {
        weekdayHours += (parseFloat(log.timesheet_value) || 0) * 8;
      }

      // Salary totals: only in-period logs with status 'present'
      for (const log of weekdayLogs) {
        if (!log._inPeriod) continue;
        if (log.status !== 'present') continue; // skip absent/off logs
        const tv = parseFloat(log.timesheet_value) || 0;
        recalcNormalDays += tv;
        recalcNormalHours += actualHours(log);
      }

      // Weekday OT: only in-period present logs
      for (const log of weekdayLogs) {
        if (!log._inPeriod) continue;
        if (log.status !== 'present') continue;
        const logOT = parseFloat(log.overtime_hours) || 0;
        recalcOTHours += logOT;
        adjustedOTMap[log._dateStr] = logOT;
      }

      // Weekend logs: attendance = normal, OT subject to 40h rule
      for (const log of weekendLogs) {
        if (!log._inPeriod) continue;
        if (log.status !== 'present') continue;
        const weekendNormalHours = actualHours(log);
        const weekendOTLogged = parseFloat(log.overtime_hours) || 0;

        recalcNormalHours += weekendNormalHours;
        recalcNormalDays += parseFloat(log.timesheet_value) || 0;

        if (weekdayHours >= WEEKLY_QUOTA) {
          recalcOTHours += weekendOTLogged;
          adjustedOTMap[log._dateStr] = weekendOTLogged;
        } else {
          adjustedOTMap[log._dateStr] = 0;
        }
      }
    }

    // Final aggregation
    const totalDays    = recalcNormalDays;
    const totalOTHours = recalcOTHours;

    let basicSalary: number;
    let basicRatePerDay: number;
    let otRatePerHour: number;
    let totalHours: number;

    if (salaryType === 'hourly') {
      // basic_rate = rate per jam
      totalHours     = Math.round(recalcNormalHours);
      basicRatePerDay = basicRateRaw; // stored as per-hour rate
      otRatePerHour   = emp.ot_rate > 0 ? parseFloat(emp.ot_rate) : basicRateRaw;
      basicSalary     = Math.round(totalHours * basicRateRaw);
    } else if (salaryType === 'monthly') {
      // Monthly = gaji pokok flat (all-in), use salary field directly
      const monthlySalary = parseFloat(emp.salary) || 0;
      totalHours      = Math.round(totalDays * 8);
      basicRatePerDay = monthlySalary; // store the full monthly amount as "rate"
      otRatePerHour   = emp.ot_rate > 0 ? parseFloat(emp.ot_rate) : Math.round(monthlySalary / 22 / 8);
      basicSalary     = monthlySalary; // flat, not multiplied by days
    } else {
      // daily — rate per hari
      totalHours      = Math.round(totalDays * 8);
      basicRatePerDay = basicRateRaw;
      otRatePerHour   = emp.ot_rate > 0 ? parseFloat(emp.ot_rate) : Math.round(basicRateRaw / 8);
      basicSalary     = Math.round(totalDays * basicRatePerDay);
    }

    const tunjangan   = Math.round(totalDays * tunjanganPerDay);
    const otPay       = Math.round(totalOTHours * otRatePerHour);
    const grossSalary = basicSalary + tunjangan + otPay;

    // Attach adjusted OT and actual_hours to each log for frontend display
    const adjustedLogs = logs.map((log: any) => {
      const ds = logDateStr(log);
      return {
        ...log,
        adjusted_ot_hours: adjustedOTMap[ds] ?? (parseFloat(log.overtime_hours) || 0),
        actual_hours: actualHours(log), // backend-computed normal hours (same as used for salary calc)
      };
    });

    // Advances for this employee in this period (pending OR already deducted for this period)
    const pendingAdvances: any[] = await dbAll(
      `SELECT * FROM salary_advances WHERE employee_id=?
       AND (
         (status='pending' AND (period_month IS NULL OR (period_month=? AND period_year=?)))
         OR (status='deducted' AND period_month=? AND period_year=?)
       )
       ORDER BY advance_date ASC LIMIT 2`,
      [employee_id, month, year, month, year]
    );
    const advance1 = pendingAdvances[0] ? parseFloat(pendingAdvances[0].amount) : 0;
    const advance2 = pendingAdvances[1] ? parseFloat(pendingAdvances[1].amount) : 0;
    const totalAdvances = advance1 + advance2;

    // Statutory deductions — disabled for now
    const bpjs_kes = 0;
    const bpjs_tk  = 0;
    const pph21    = 0;
    const totalDeductions = totalAdvances + bpjs_kes + bpjs_tk + pph21;
    const netSalary = grossSalary - totalDeductions;

    return {
      employee: {
        id: emp.id, code: emp.code, name: emp.name, position: emp.position,
        salary_type: salaryType, basic_rate: basicRatePerDay,
        tunjangan_rate: tunjanganPerDay, ot_rate: otRatePerHour
      },
      period: { month, year, project_id: project_id||null, period_start: periodStart, period_end: periodEnd },
      attendance: { total_days: totalDays, total_hours: totalHours, total_ot_hours: totalOTHours, logs: adjustedLogs },
      calculation: {
        salary_type: salaryType,
        basic_rate_per_day: basicRatePerDay,  // for daily/monthly = rate/hari; for hourly = rate/jam
        tunjangan_per_day: tunjanganPerDay,
        ot_rate_per_hour: otRatePerHour,
        total_hours: totalHours,
        basic_salary: basicSalary, tunjangan, ot_pay: otPay, gross_salary: grossSalary
      },
      advances: {
        advance_1: advance1, advance_2: advance2, total: totalAdvances,
        records: pendingAdvances.map((a:any) => ({ id:a.id, amount:a.amount, remaining:a.remaining, description:a.description, date:a.advance_date }))
      },
      deductions: { bpjs_kes, bpjs_tk, pph21, total_statutory: bpjs_kes+bpjs_tk+pph21, total: totalDeductions },
      net_salary: netSalary,
    };
};

router.get('/payslip', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employee_id, month, year, project_id } = req.query;
    if (!employee_id || !month || !year) return res.status(400).json({ error: 'employee_id, month, year required' });

    const result = await computePayslip(employee_id, month, year, project_id);
    if (result?.error) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    console.error('Payslip error:', error);
    res.status(500).json({ error: 'Failed to generate payslip' });
  }
});

// Save finalized payslip & mark advances as deducted
//
// DR-P0-04: SELURUH angka dihitung ulang di server. Versi lama menyimpan
// `calculation`, `advances`, `deductions`, dan `net_salary` apa adanya dari
// body — gaji bisa difinalisasi dengan angka sembarang lewat DevTools.
//
// Kasbon juga dulu ditandai lunas hanya berdasar `advances.records[].id` dari
// klien, tanpa memeriksa pemilik, periode, status, atau jumlahnya: id kasbon
// karyawan LAIN bisa dinolkan lewat payslip siapa pun. Sekarang yang ditandai
// hanya kasbon yang dikembalikan `computePayslip` sendiri — sudah tersaring
// employee_id + periode di query-nya — dan tetap diverifikasi lagi di dalam
// UPDATE-nya.
//
// Ketiga penulisan (payslip + kasbon) kini satu transaction. Sebelumnya
// autocommit: gagal di tengah loop meninggalkan payslip berstatus final
// sementara hanya sebagian kasbon terpotong.
router.post('/payslip/save', authMiddleware, requirePermission('hr.payroll.create', 'hr.payroll.edit'), async (req: Request, res: Response) => {
  try {
    const { employee_id, period_month, period_year, project_id, notes } = req.body;
    if (!employee_id || !period_month || !period_year) {
      return res.status(400).json({ error: 'employee_id, period_month, period_year wajib diisi' });
    }

    const hitung = await computePayslip(employee_id, period_month, period_year, project_id);
    if (hitung?.error) return res.status(404).json(hitung);

    const calc = hitung.calculation;
    const att = hitung.attendance;
    const adv = hitung.advances;
    const ded = hitung.deductions;

    const outcome = await withTransaction(async tx => {
      const existing: any = await tx.get(
        'SELECT id FROM payslip_records WHERE employee_id=? AND period_month=? AND period_year=? ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [employee_id, period_month, period_year]
      );

      const nilai = [
        project_id || null,
        att.total_days || 0, att.total_ot_hours || 0,
        calc.basic_salary || 0, calc.tunjangan || 0, calc.ot_pay || 0, calc.gross_salary || 0,
        adv.advance_1 || 0, adv.advance_2 || 0, 0,
        ded.bpjs_kes || 0, ded.bpjs_tk || 0, ded.pph21 || 0, ded.total || 0,
        hitung.net_salary || 0, notes || null,
      ];

      let recordId: number;
      if (existing) {
        await tx.run(
          `UPDATE payslip_records SET project_id=?,
            total_days=?, total_ot_hours=?, basic_salary=?, tunjangan=?, ot_pay=?, gross_salary=?,
            advance_1=?, advance_2=?, reimbursement=?, bpjs_kes=?, bpjs_tk=?, pph21=?, total_deductions=?, net_salary=?, notes=?, status='final', updated_at=NOW()
           WHERE id=?`,
          [...nilai, existing.id]
        );
        recordId = existing.id;
      } else {
        const result = await tx.run(
          `INSERT INTO payslip_records (employee_id, period_month, period_year, project_id,
            total_days, total_ot_hours, basic_salary, tunjangan, ot_pay, gross_salary,
            advance_1, advance_2, reimbursement, bpjs_kes, bpjs_tk, pph21, total_deductions, net_salary, notes, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'final')`,
          [employee_id, period_month, period_year, ...nilai]
        );
        recordId = result.insertId;
      }

      // `employee_id` diikutkan di WHERE sebagai jaring terakhir, walau daftarnya
      // sudah berasal dari server.
      let ditandai = 0;
      for (const kasbon of (adv.records || [])) {
        const r = await tx.run(
          "UPDATE salary_advances SET status='deducted', remaining=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND employee_id=?",
          [kasbon.id, employee_id]
        );
        ditandai += r.affectedRows || 0;
      }

      return { recordId, ditandai };
    });

    res.status(201).json({
      message: 'Payslip saved',
      data: {
        id: outcome.recordId,
        // Dikembalikan supaya layar memakai angka server, bukan angka yang
        // tadi ia kirim sendiri.
        net_salary: hitung.net_salary,
        gross_salary: calc.gross_salary,
        total_deductions: ded.total,
        advances_marked: outcome.ditandai,
      },
    });
  } catch (error) {
    console.error('Payslip save error:', error);
    res.status(500).json({ error: 'Failed to save payslip' });
  }
});

// Get saved payslips history
router.get('/payslip/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { employee_id, year } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (employee_id) { where += ' AND pr.employee_id=?'; params.push(employee_id); }
    if (year) { where += ' AND pr.period_year=?'; params.push(year); }
    const rows = await dbAll(
      `SELECT pr.*, e.name as employee_name, e.code as employee_code, e.position
       FROM payslip_records pr JOIN employees e ON pr.employee_id=e.id
       ${where} ORDER BY pr.period_year DESC, pr.period_month DESC`,
      params
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch payslip history' }); }
});

// ===== MOBILE / PWA ENDPOINTS (login pakai NIK + PIN) =====

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const PIN_MIN_LENGTH = 6;

// POST /hr/mobile/login — NIK + PIN.
// Dulu NIK saja sudah cukup mendapat token, sehingga siapa pun yang tahu NIK
// karyawan bisa membaca slip gajinya dan mendaftarkan sidik jari atas namanya.
router.post('/mobile/login', async (req: Request, res: Response) => {
  // Pesan sengaja seragam untuk NIK tidak dikenal maupun PIN salah, supaya
  // endpoint ini tidak bisa dipakai menebak NIK mana yang valid.
  const invalid = () => res.status(401).json({ error: 'NIK atau PIN salah' });

  try {
    const { nik, pin } = req.body;
    if (!nik || !pin) return res.status(400).json({ error: 'NIK dan PIN diperlukan' });

    const emp: any = await dbGet(
      `SELECT e.id, e.code, e.name, e.position, e.department_id, e.status,
              e.salary_type, e.basic_rate, e.tunjangan_rate, d.name as department,
              e.mobile_pin, e.mobile_pin_must_change,
              e.mobile_pin_failed_attempts, e.mobile_pin_locked_until
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.code = ? AND e.status = 'ACTIVE'`,
      [String(nik).trim().toUpperCase()]
    );
    if (!emp) return invalid();

    if (emp.mobile_pin_locked_until && new Date(emp.mobile_pin_locked_until) > new Date()) {
      return res.status(429).json({
        error: `Terlalu banyak percobaan. Coba lagi setelah ${new Date(emp.mobile_pin_locked_until).toLocaleTimeString('id-ID')}.`,
      });
    }

    // Karyawan yang PIN-nya belum diatur HR belum bisa masuk. Ini disengaja:
    // tanpa PIN, satu-satunya faktor kembali menjadi NIK saja.
    if (!emp.mobile_pin) {
      return res.status(403).json({
        error: 'PIN belum diatur. Hubungi HR untuk mendapatkan PIN awal Anda.',
        code: 'PIN_NOT_SET',
      });
    }

    const ok = await bcrypt.compare(String(pin), emp.mobile_pin);
    if (!ok) {
      const attempts = Number(emp.mobile_pin_failed_attempts || 0) + 1;
      if (attempts >= PIN_MAX_ATTEMPTS) {
        await dbRun(
          `UPDATE employees SET mobile_pin_failed_attempts = 0,
             mobile_pin_locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
          [PIN_LOCK_MINUTES, emp.id]
        );
        return res.status(429).json({
          error: `PIN salah ${PIN_MAX_ATTEMPTS} kali. Akun dikunci ${PIN_LOCK_MINUTES} menit.`,
        });
      }
      await dbRun('UPDATE employees SET mobile_pin_failed_attempts = ? WHERE id = ?', [attempts, emp.id]);
      return invalid();
    }

    await dbRun(
      'UPDATE employees SET mobile_pin_failed_attempts = 0, mobile_pin_locked_until = NULL WHERE id = ?',
      [emp.id]
    );

    // Jangan pernah kirim hash PIN ke klien
    const { mobile_pin, mobile_pin_failed_attempts, mobile_pin_locked_until, mobile_pin_must_change, ...employee } = emp;

    res.json({
      success: true,
      employee,
      token: generateMobileToken(emp.id),
      must_change_pin: !!mobile_pin_must_change,
    });
  } catch (error) { res.status(500).json({ error: 'Login gagal' }); }
});

// POST /hr/mobile/change-pin — karyawan mengganti PIN-nya sendiri
router.post('/mobile/change-pin', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const { current_pin, new_pin } = req.body;
    if (!current_pin || !new_pin) return res.status(400).json({ error: 'PIN lama dan PIN baru diperlukan' });

    const newPin = String(new_pin).trim();
    if (newPin.length < PIN_MIN_LENGTH || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: `PIN baru harus angka, minimal ${PIN_MIN_LENGTH} digit` });
    }
    if (String(current_pin) === newPin) {
      return res.status(400).json({ error: 'PIN baru tidak boleh sama dengan PIN lama' });
    }

    const emp: any = await dbGet('SELECT mobile_pin FROM employees WHERE id = ? AND status = ?', [req.employeeId, 'ACTIVE']);
    if (!emp?.mobile_pin) return res.status(403).json({ error: 'PIN belum diatur' });

    if (!(await bcrypt.compare(String(current_pin), emp.mobile_pin))) {
      return res.status(401).json({ error: 'PIN lama salah' });
    }

    await dbRun(
      `UPDATE employees SET mobile_pin = ?, mobile_pin_set_at = NOW(),
         mobile_pin_must_change = 0, mobile_pin_failed_attempts = 0, mobile_pin_locked_until = NULL
       WHERE id = ?`,
      [await bcrypt.hash(newPin, 10), req.employeeId]
    );

    res.json({ success: true, message: 'PIN berhasil diganti' });
  } catch (error) { res.status(500).json({ error: 'Gagal mengganti PIN' }); }
});

// POST /hr/mobile/checkin — Self check-in from mobile
router.post('/mobile/checkin', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const { type, latitude, longitude, project_id } = req.body;
    const employee_id = req.employeeId; // dari token — tidak bisa absen atas nama orang lain
    if (!type) return res.status(400).json({ error: 'type required' });
    const emp: any = await dbGet('SELECT id, name FROM employees WHERE id = ? AND status = ?', [employee_id, 'ACTIVE']);
    if (!emp) return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const existing: any = await dbGet('SELECT * FROM attendance_logs WHERE employee_id=? AND date=?', [employee_id, today]);
    const location = (latitude && longitude) ? `${latitude},${longitude}` : null;

    if (type === 'in') {
      if (existing) {
        await dbRun('UPDATE attendance_logs SET check_in=?, status=?, timesheet_value=1 WHERE id=?',
          [timeStr, 'present', existing.id]);
      } else {
        await dbRun(
          'INSERT INTO attendance_logs (employee_id,date,project_id,check_in,status,timesheet_value,notes) VALUES (?,?,?,?,?,?,?)',
          [employee_id, today, project_id||null, timeStr, 'present', 1, location ? `GPS: ${location}` : null]
        );
      }
      res.json({ success: true, message: `Check-in ${timeStr} berhasil ✅`, time: timeStr, date: today });
    } else if (type === 'out') {
      if (!existing) return res.status(400).json({ error: 'Belum check-in hari ini' });
      await dbRun('UPDATE attendance_logs SET check_out=? WHERE id=?', [timeStr, existing.id]);
      res.json({ success: true, message: `Check-out ${timeStr} berhasil 👋`, time: timeStr, date: today });
    } else {
      res.status(400).json({ error: 'type must be "in" or "out"' });
    }
  } catch (error) { res.status(500).json({ error: 'Check-in gagal' }); }
});

// GET /hr/mobile/attendance/:employee_id — Recent attendance for mobile view
router.get('/mobile/attendance/:employee_id', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    if (!assertSelf(req, res, req.params.employee_id)) return;
    const { month, year } = req.query;
    const m = month || (new Date().getMonth() + 1);
    const y = year || new Date().getFullYear();
    const rows = await dbAll(
      `SELECT date, check_in, check_out, status, timesheet_value, overtime_hours, notes, gps_lat, gps_lng, gps_verified
       FROM attendance_logs WHERE employee_id=? AND MONTH(date)=? AND YEAR(date)=?
       ORDER BY date DESC LIMIT 31`,
      [req.params.employee_id, m, y]
    );
    const totalDays = rows.reduce((s: number, r: any) => s + (parseFloat(r.timesheet_value) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayLog: any = await dbGet('SELECT * FROM attendance_logs WHERE employee_id=? AND date=?', [req.params.employee_id, today]);
    res.json({ data: rows, summary: { total_days: totalDays, month: m, year: y }, today: todayLog || null });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch attendance' }); }
});

// GET /hr/mobile/payslip/:employee_id — Payslip history for mobile
router.get('/mobile/payslip/:employee_id', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    if (!assertSelf(req, res, req.params.employee_id)) return;
    const rows = await dbAll(
      `SELECT pr.*, e.name as employee_name, e.code as employee_code, e.position
       FROM payslip_records pr JOIN employees e ON pr.employee_id=e.id
       WHERE pr.employee_id=? ORDER BY pr.period_year DESC, pr.period_month DESC LIMIT 12`,
      [req.params.employee_id]
    );
    res.json({ data: rows });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch payslips' }); }
});

// ===== GENERATE PAYROLL → PROJECT EXPENSE =====
// Creates project_expenses entries from finalized payslips for a period
router.post('/payslip/generate-expense', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { period_month, period_year, project_id } = req.body;
    if (!period_month || !period_year || !project_id) {
      return res.status(400).json({ error: 'period_month, period_year, and project_id are required' });
    }

    const userId = (req as any).user?.userId || null;
    const monthNames = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const periodLabel = `${monthNames[+period_month]} ${period_year}`;

    // Check if project exists
    const project: any = await dbGet('SELECT id, project_name FROM client_projects WHERE id=?', [project_id]);
    if (!project) return res.status(404).json({ error: 'Project tidak ditemukan' });

    // Check if expense already exists for this period + project (avoid duplicates)
    const existingExp: any = await dbGet(
      `SELECT id FROM project_expenses WHERE project_id=? AND category='salary'
       AND description LIKE ? AND status NOT IN ('rejected')`,
      [project_id, `%Gaji ${periodLabel}%`]
    );
    if (existingExp) {
      return res.status(400).json({
        error: `Expense gaji ${periodLabel} sudah ada di project ${project.project_name}. Hapus dulu jika ingin generate ulang.`,
        existing_id: existingExp.id
      });
    }

    // Get all finalized payslips for the period
    const payslips: any[] = await dbAll(
      `SELECT pr.*, e.name as employee_name, e.code as employee_code
       FROM payslip_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.period_month=? AND pr.period_year=? AND pr.status='final'
       ORDER BY e.name ASC`,
      [period_month, period_year]
    );

    if (payslips.length === 0) {
      return res.status(400).json({ error: 'Tidak ada slip gaji finalized untuk periode ini' });
    }

    // Aggregate totals
    let totalGross = 0, totalKasbon = 0, totalNet = 0;
    const employeeDetails: string[] = [];
    for (const ps of payslips) {
      const gross = parseFloat(ps.gross_salary) || 0;
      const adv1 = parseFloat(ps.advance_1) || 0;
      const adv2 = parseFloat(ps.advance_2) || 0;
      const kasbon = adv1 + adv2;
      totalGross += gross;
      totalKasbon += kasbon;
      totalNet += parseFloat(ps.net_salary) || 0;
      employeeDetails.push(`${ps.employee_name}: Rp ${Math.round(ps.net_salary||0).toLocaleString('id-ID')}`);
    }

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const lastDay = new Date(+period_year, +period_month, 0).getDate();
    const expenseDate = `${period_year}-${String(period_month).padStart(2,'0')}-${lastDay}`;
    const createdExpenses: any[] = [];

    // 1. Expense: Gaji (net salary = gross - kasbon)
    const salaryExpNum = `EXP-SAL-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;
    const salaryResult = await dbRun(
      `INSERT INTO project_expenses (project_id, expense_number, category, description, amount, expense_date, notes, status, created_by)
       VALUES (?, ?, 'salary', ?, ?, ?, ?, 'approved', ?)`,
      [project_id, salaryExpNum,
       `Gaji ${periodLabel} (${payslips.length} karyawan)`,
       totalNet, expenseDate,
       JSON.stringify({ type: 'payroll', period_month, period_year, employee_count: payslips.length, gross: totalGross, kasbon: totalKasbon, net: totalNet, details: employeeDetails }),
       userId]
    );
    createdExpenses.push({ id: salaryResult.insertId, type: 'salary', amount: totalNet });

    // 2. Expense: Kasbon (if any kasbon deductions exist)
    if (totalKasbon > 0) {
      const kasbonExpNum = `EXP-KSB-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;
      const kasbonDetails: string[] = [];
      for (const ps of payslips) {
        const k = (parseFloat(ps.advance_1)||0) + (parseFloat(ps.advance_2)||0);
        if (k > 0) kasbonDetails.push(`${ps.employee_name}: Rp ${Math.round(k).toLocaleString('id-ID')}`);
      }
      const kasbonResult = await dbRun(
        `INSERT INTO project_expenses (project_id, expense_number, category, description, amount, expense_date, notes, status, created_by)
         VALUES (?, ?, 'kasbon', ?, ?, ?, ?, 'approved', ?)`,
        [project_id, kasbonExpNum,
         `Kasbon ${periodLabel} (${kasbonDetails.length} karyawan)`,
         totalKasbon, expenseDate,
         JSON.stringify({ type: 'kasbon', period_month, period_year, details: kasbonDetails }),
         userId]
      );
      createdExpenses.push({ id: kasbonResult.insertId, type: 'kasbon', amount: totalKasbon });
    }

    res.status(201).json({
      message: `✅ Expense berhasil di-generate ke project ${project.project_name}`,
      data: {
        project_id, project_name: project.project_name,
        period: periodLabel,
        employee_count: payslips.length,
        total_gross: totalGross,
        total_kasbon: totalKasbon,
        total_net: totalNet,
        expenses: createdExpenses
      }
    });
  } catch (error) {
    console.error('Generate expense error:', error);
    res.status(500).json({ error: 'Failed to generate expense' });
  }
});

export default router;
