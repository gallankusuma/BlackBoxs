import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files allowed.'));
    }
  }
});

// Template structures for each entity
const templates = {
  products: {
    headers: ['sku', 'name', 'description', 'category', 'unit', 'item_type', 'standard_cost', 'reorder_point'],
    sample: [
      { 
        sku: 'PROD-001', 
        name: 'Baut M8', 
        description: 'Baut ukuran M8 stainless steel', 
        category: 'Raw Material', 
        unit: 'PCS', 
        item_type: 'inventory', 
        standard_cost: 500, 
        reorder_point: 200 
      },
      { 
        sku: 'PROD-002', 
        name: 'Cat Duco Merah', 
        description: 'Cat duco warna merah 1 liter', 
        category: 'Raw Material', 
        unit: 'LTR', 
        item_type: 'inventory', 
        standard_cost: 45000, 
        reorder_point: 20 
      },
      { 
        sku: 'FG-001', 
        name: 'Kursi Kantor Executive', 
        description: 'Kursi kantor type executive kulit hitam', 
        category: 'Finished Goods', 
        unit: 'UNIT', 
        item_type: 'manufacturing', 
        standard_cost: 1500000, 
        reorder_point: 10 
      }
    ]
  },
  categories: {
    headers: ['name', 'description', 'type'],
    sample: [
      { name: 'Raw Material', description: 'Bahan baku produksi', type: 'material' },
      { name: 'Finished Goods', description: 'Produk jadi siap jual', type: 'product' },
      { name: 'Work In Progress', description: 'Barang setengah jadi', type: 'wip' }
    ]
  },
  units: {
    headers: ['code', 'name', 'description', 'category'],
    sample: [
      { code: 'PCS', name: 'Pieces', description: 'Satuan buah/pcs', category: 'count' },
      { code: 'KG', name: 'Kilogram', description: 'Satuan berat kilogram', category: 'weight' },
      { code: 'LTR', name: 'Liter', description: 'Satuan volume liter', category: 'volume' },
      { code: 'MTR', name: 'Meter', description: 'Satuan panjang meter', category: 'length' },
      { code: 'UNIT', name: 'Unit', description: 'Satuan unit/set', category: 'count' },
      { code: 'BOX', name: 'Box', description: 'Satuan dus/kotak', category: 'packaging' }
    ]
  },
  vendors: {
    headers: ['code', 'name', 'address', 'phone', 'email', 'contact_person'],
    sample: [
      { code: 'VND-001', name: 'PT Sumber Jaya', address: 'Jl. Industri No. 123, Jakarta', phone: '021-12345678', email: 'info@sumberjaya.com', contact_person: 'Budi Santoso' },
      { code: 'VND-002', name: 'CV Makmur Sentosa', address: 'Jl. Raya Bekasi Km 20, Bekasi', phone: '021-87654321', email: 'sales@makmursentosa.co.id', contact_person: 'Siti Nurhaliza' }
    ]
  },
  customers: {
    headers: ['code', 'name', 'address', 'phone', 'email', 'contact_person'],
    sample: [
      { code: 'CUST-001', name: 'PT Mitra Prima', address: 'Jl. Sudirman No. 45, Jakarta Selatan', phone: '021-55551234', email: 'purchasing@mitraprima.com', contact_person: 'Ahmad Wijaya' },
      { code: 'CUST-002', name: 'CV Berkah Jaya', address: 'Jl. Gatot Subroto No. 88, Bandung', phone: '022-87651234', email: 'orders@berkahjaya.co.id', contact_person: 'Rina Susanti' }
    ]
  },
  employees: {
    headers: ['code', 'name', 'email', 'phone', 'department', 'position', 'hire_date'],
    sample: [
      { code: 'EMP-001', name: 'Agus Setiawan', email: 'agus.setiawan@company.com', phone: '081234567890', department: 'Production', position: 'Operator Produksi', hire_date: '2024-01-15' },
      { code: 'EMP-002', name: 'Dewi Lestari', email: 'dewi.lestari@company.com', phone: '081298765432', department: 'Sales & Marketing', position: 'Sales Executive', hire_date: '2023-06-01' },
      { code: 'EMP-003', name: 'Rudi Hartono', email: 'rudi.hartono@company.com', phone: '081334455667', department: 'Warehouse', position: 'Warehouse Staff', hire_date: '2024-03-10' }
    ]
  },
  departments: {
    headers: ['name', 'description'],
    sample: [
      { name: 'Production', description: 'Departemen produksi dan manufaktur' },
      { name: 'Sales & Marketing', description: 'Departemen penjualan dan pemasaran' },
      { name: 'Warehouse', description: 'Departemen gudang dan logistik' },
      { name: 'Quality Control', description: 'Departemen kontrol kualitas' }
    ]
  },
  labor: {
    headers: ['code', 'name', 'satuan', 'harga'],
    sample: [
      { code: 'LB-001', name: 'Mandor', satuan: 'OH', harga: 125000 },
      { code: 'LB-002', name: 'Tukang Batu', satuan: 'OH', harga: 110000 }
    ]
  },
  materials: {
    headers: ['code', 'jenis', 'name', 'satuan', 'harga', 'vendor'],
    sample: [
      { code: 'MT-001', jenis: 'Pasir', name: 'Pasir Beton', satuan: 'M3', harga: 190000, vendor: 'PT Supplier A' },
      { code: 'MT-002', jenis: 'Batu', name: 'Batu Split', satuan: 'M3', harga: 250000, vendor: 'PT Supplier B' },
      { code: 'MT-003', jenis: 'Semen', name: 'Semen Portland 50kg', satuan: 'Zak', harga: 65000, vendor: 'CV Bangunan' }
    ]
  },
  equipment: {
    headers: ['code', 'name', 'satuan', 'harga', 'vendor'],
    sample: [
      { code: 'EQ-001', name: 'Molen', satuan: 'Hari', harga: 450000, vendor: 'PT Rental' },
      { code: 'EQ-002', name: 'Excavator', satuan: 'Jam', harga: 850000, vendor: 'CV Alat Berat' },
      { code: 'EQ-003', name: 'Concrete Pump', satuan: 'Hari', harga: 1200000, vendor: 'PT Rental' }
    ]
  },
  ahsp: {
    headers: [
      'kode',
      'name',
      'satuan',
      'version',
      'status',
      'sub_discipline_id',
      'section',
      'resource_type',
      'resource_id',
      'resource_name',
      'resource_satuan',
      'koefisien',
      'resource_harga'
    ],
    sample: [
      {
        kode: '1.1.1.1',
        name: "Pembuatan 1 m1 pagar sementara dari kayu tinggi 2 meter",
        satuan: 'm1',
        version: '2024',
        status: 'active',
        sub_discipline_id: 1,
        section: 'A',
        resource_type: 'labor',
        resource_id: 0,
        resource_name: 'Mandor',
        resource_satuan: 'OH',
        koefisien: 0.013,
        resource_harga: 125685
      },
      {
        kode: '1.1.1.1',
        name: "Pembuatan 1 m1 pagar sementara dari kayu tinggi 2 meter",
        satuan: 'm1',
        version: '2024',
        status: 'active',
        sub_discipline_id: 1,
        section: 'B',
        resource_type: 'material',
        resource_id: 0,
        resource_name: 'Pasir Beton',
        resource_satuan: 'Kg',
        koefisien: 61.56,
        resource_harga: 190
      }
    ]
  }
};

// GET /api/import/template/:entity - Download Excel template
router.get('/template/:entity', authMiddleware, (req: Request, res: Response) => {
  const entity = req.params.entity as string;
  
  if (!templates[entity as keyof typeof templates]) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const template = templates[entity as keyof typeof templates];
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(template.sample);
  
  XLSX.utils.book_append_sheet(wb, ws, entity);
  
  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  
  res.setHeader('Content-Disposition', `attachment; filename=template_${entity}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// POST /api/import/preview/:entity - Preview and validate import
router.post('/preview/:entity', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const entity = req.params.entity as string;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!templates[entity as keyof typeof templates]) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'File is empty' });
    }

    // Validate data
    const validation = await validateData(entity, data);
    
    res.json({
      success: validation.validRows === data.length,
      validation: {
        totalRows: data.length,
        validRows: validation.validRows,
        invalidRows: validation.invalidRows,
        firstError: validation.firstError,
        preview: data.slice(0, 5) // First 5 rows for preview
      }
    });
  } catch (error: any) {
    console.error('Error previewing import:', error);
    res.status(500).json({ error: 'Failed to preview import: ' + error.message });
  }
});

// POST /api/import/check-conflicts/:entity - Check for conflicts before import
router.post('/check-conflicts/:entity', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const entity = req.params.entity as string;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!templates[entity as keyof typeof templates]) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'File is empty' });
    }

    // Validate data
    const validation = await validateData(entity, data);
    
    if (validation.validRows !== data.length) {
      return res.status(400).json({
        error: 'Validation failed',
        validation: {
          totalRows: data.length,
          validRows: validation.validRows,
          invalidRows: validation.invalidRows,
          firstError: validation.firstError
        }
      });
    }

    // Check for conflicts
    const conflicts = await detectConflicts(entity, data);

    res.json({
      success: true,
      preview: {
        totalRows: data.length,
        validRows: data.length - conflicts.length,
        conflicts: conflicts,
        conflictCount: conflicts.length
      },
      data // Return original data for later import
    });
  } catch (error: any) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: 'Failed to check conflicts: ' + error.message });
  }
});

// POST /api/import/resolve-conflicts/:entity - Resolve conflicts and import
router.post('/resolve-conflicts/:entity', authMiddleware, async (req: Request, res: Response) => {
  try {
    const entity = req.params.entity as string;
    const { data, resolution } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (!templates[entity as keyof typeof templates]) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Import with conflict resolution
    const importedCount = await importDataWithConflictResolution(entity, data, resolution);
    
    res.json({
      success: true,
      message: `Successfully imported ${importedCount} ${entity}`,
      importedCount
    });
  } catch (error: any) {
    console.error('Error resolving conflicts:', error);
    res.status(500).json({ error: 'Failed to resolve conflicts: ' + error.message });
  }
});

// POST /api/import/import/:entity - Perform actual import
router.post('/import/:entity', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const entity = req.params.entity as string;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!templates[entity as keyof typeof templates]) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'File is empty' });
    }

    // Validate data
    const validation = await validateData(entity, data);
    
    if (validation.validRows !== data.length) {
      return res.status(400).json({
        error: 'Validation failed',
        validation: {
          totalRows: data.length,
          validRows: validation.validRows,
          invalidRows: validation.invalidRows,
          firstError: validation.firstError
        }
      });
    }

    // Import data
    const importedCount = await importData(entity, data);
    
    res.json({
      success: true,
      message: `Successfully imported ${importedCount} ${entity}`,
      importedCount
    });
  } catch (error: any) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data: ' + error.message });
  }
});

// POST /api/import/materials/cleanup - Normalize imported material data in one click
router.post('/materials/cleanup', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await cleanupImportedMaterials();
    res.json({
      success: true,
      message: 'Material cleanup completed',
      result
    });
  } catch (error: any) {
    console.error('Error cleaning up materials:', error);
    res.status(500).json({ error: 'Failed to clean up materials: ' + error.message });
  }
});

// POST /api/import/vendors/cleanup - Normalize imported vendor data in one click
router.post('/vendors/cleanup', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await cleanupImportedVendors();
    res.json({
      success: true,
      message: 'Vendor cleanup completed',
      result
    });
  } catch (error: any) {
    console.error('Error cleaning up vendors:', error);
    res.status(500).json({ error: 'Failed to clean up vendors: ' + error.message });
  }
});

// Validation function
async function validateData(entity: string, data: any[]): Promise<{
  validRows: number;
  invalidRows: any[];
  firstError: any;
}> {
  let validRows = 0;
  const invalidRows: any[] = [];
  let firstError = null;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2; // Excel row (1-indexed, +1 for header)
    const errors: string[] = [];

    try {
      switch (entity) {
        case 'products':
          if (!row.sku) errors.push('SKU is required');
          if (!row.name) errors.push('Name is required');
          if (!row.category) errors.push('Category is required');
          if (!row.unit) errors.push('Unit is required');
          
          // Check duplicates
          if (row.sku) {
            const existing = await dbGet('SELECT id FROM products WHERE sku = ?', [row.sku]);
            if (existing) errors.push('SKU already exists');
          }
          break;

        case 'categories':
          if (!row.name) errors.push('Name is required');
          
          const existingCat = await dbGet('SELECT id FROM categories WHERE name = ?', [row.name]);
          if (existingCat) errors.push('Category name already exists');
          break;

        case 'units':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          
          const existingUnit = await dbGet('SELECT id FROM uom WHERE code = ?', [row.code]);
          if (existingUnit) errors.push('Unit code already exists');
          break;

        case 'vendors':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          
          const existingVendor = await dbGet('SELECT id FROM vendors WHERE code = ?', [row.code]);
          if (existingVendor) errors.push('Vendor code already exists');
          break;

        case 'customers':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          
          const existingCustomer = await dbGet('SELECT id FROM customers WHERE code = ?', [row.code]);
          if (existingCustomer) errors.push('Customer code already exists');
          break;

        case 'employees':
          if (!row.employee_id) errors.push('Employee ID is required');
          if (!row.name) errors.push('Name is required');
          
          // Kolomnya `code`, bukan `employee_id` — query lama selalu melempar
          // ER_BAD_FIELD_ERROR, jadi pemeriksaan duplikat NIK tidak pernah
          // benar-benar berjalan. Baris INSERT-nya sendiri sudah memakai `code`
          // (lihat `row.code || row.employee_id` di bawah).
          const existingEmp = await dbGet('SELECT id FROM employees WHERE code = ?',
            [row.code || row.employee_id]);
          if (existingEmp) errors.push('Employee ID already exists');
          break;

        case 'departments':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          
          const existingDept = await dbGet('SELECT id FROM departments WHERE code = ?', [row.code]);
          if (existingDept) errors.push('Department code already exists');
          break;

        case 'labor':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          if (!row.satuan) errors.push('Satuan is required');

          if (row.code) {
            const existingLabor = await dbGet('SELECT id FROM master_labor WHERE code = ?', [row.code]);
            if (existingLabor) errors.push('Labor code already exists');
          }
          break;

        case 'materials':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          if (!row.satuan) errors.push('Satuan is required');

          if (row.code) {
            const existingMaterial = await dbGet('SELECT id FROM master_materials WHERE code = ?', [row.code]);
            if (existingMaterial) errors.push('Material code already exists');
          }
          break;

        case 'equipment':
          if (!row.code) errors.push('Code is required');
          if (!row.name) errors.push('Name is required');
          if (!row.satuan) errors.push('Satuan is required');

          if (row.code) {
            const existingEquipment = await dbGet('SELECT id FROM master_equipment WHERE code = ?', [row.code]);
            if (existingEquipment) errors.push('Equipment code already exists');
          }
          break;

        case 'ahsp': {
          if (!row.kode) errors.push('kode is required');
          if (!row.name) errors.push('name is required');
          if (!row.satuan) errors.push('satuan is required');

          const section = (row.section || '').toString().trim();
          if (section) {
            const sectionUpper = section.toUpperCase();
            if (!['A', 'B', 'C'].includes(sectionUpper)) {
              errors.push('section must be A, B, or C');
            }
            if (!row.resource_name) errors.push('resource_name is required when section is provided');
            if (row.koefisien === undefined || row.koefisien === null || row.koefisien === '') {
              errors.push('koefisien is required when section is provided');
            }
            // resource_harga is optional - can be filled in later
          }
          break;
        }
      }

      if (errors.length > 0) {
        invalidRows.push({ rowNumber, errors });
        if (!firstError) {
          firstError = { rowNumber, errors };
        }
      } else {
        validRows++;
      }
    } catch (error: any) {
      errors.push('Validation error: ' + error.message);
      invalidRows.push({ rowNumber, errors });
      if (!firstError) {
        firstError = { rowNumber, errors };
      }
    }
  }

  return { validRows, invalidRows, firstError };
}

// Import function
async function importData(entity: string, data: any[]): Promise<number> {
  if (entity === 'ahsp') {
    return importAhspData(data);
  }

  let importedCount = 0;

  for (const row of data) {
    try {
      switch (entity) {
        case 'products':
          // Get category_id, unit_id, and product_type_id
          const category = await dbGet('SELECT id FROM categories WHERE name = ?', [row.category]) as any;
          const unit = await dbGet('SELECT id FROM uom WHERE code = ? OR name = ?', [row.unit, row.unit]) as any;
          const productType = await dbGet('SELECT id FROM product_types WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?)', [row.item_type, row.item_type]) as any;
          
          await dbRun(
            'INSERT INTO products (sku, name, description, category_id, unit_of_measure_id, product_type_id, standard_cost, reorder_point, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [
              row.sku, 
              row.name, 
              row.description || null, 
              category?.id || null, 
              unit?.id || null,
              productType?.id || null,
              row.standard_cost || 0,
              row.reorder_point || 0
            ]
          );
          break;

        case 'categories':
          await dbRun(
            'INSERT INTO categories (name, description, active) VALUES (?, ?, 1)',
            [row.name, row.description || null]
          );
          break;

        case 'units':
          await dbRun(
            'INSERT INTO uom (code, name, description, category, active) VALUES (?, ?, ?, ?, 1)',
            [row.code, row.name, row.description || null, row.category || 'general']
          );
          break;

        case 'vendors':
          await dbRun(
            'INSERT INTO vendors (code, name, address, phone, email, contact_person, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [row.code, row.name, row.address || null, row.phone || null, row.email || null, row.contact_person || null]
          );
          break;

        case 'customers':
          await dbRun(
            'INSERT INTO customers (code, name, address, phone, email, contact_person, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [row.code, row.name, row.address || null, row.phone || null, row.email || null, row.contact_person || null]
          );
          break;

        case 'employees':
          const dept = await dbGet('SELECT id FROM departments WHERE name = ?', [row.department]) as any;
          await dbRun(
            'INSERT INTO employees (code, name, email, phone, department_id, position, hire_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [row.code || row.employee_id, row.name, row.email || null, row.phone || null, dept?.id || null, row.position || null, row.hire_date || null, 'ACTIVE']
          );
          break;

        case 'departments':
          await dbRun(
            'INSERT INTO departments (name, description) VALUES (?, ?)',
            [row.name, row.description || null]
          );
          break;

        case 'labor':
          await dbRun(
            'INSERT INTO master_labor (code, name, satuan, harga, is_active) VALUES (?, ?, ?, ?, 1)',
            [row.code, row.name, row.satuan, parseNumber(row.harga)]
          );
          break;

        case 'materials':
          let materialVendorId = null;
          if (row.vendor) {
            const vendor = await dbGet('SELECT id FROM vendors WHERE name = ?', [row.vendor]) as any;
            if (vendor) {
              materialVendorId = vendor.id;
            } else {
              // Create new vendor if not found
              const vendorResult = await dbRun(
                'INSERT INTO vendors (code, name, is_active) VALUES (?, ?, 1)',
                [`VND-${Date.now()}`, row.vendor]
              ) as any;
              materialVendorId = vendorResult.insertId;
            }
          }
          await dbRun(
            'INSERT INTO master_materials (code, jenis, name, satuan, harga, vendor_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [row.code, row.jenis || null, row.name, row.satuan, parseNumber(row.harga), materialVendorId]
          );
          break;

        case 'equipment':
          let equipmentVendorId = null;
          if (row.vendor) {
            const vendor = await dbGet('SELECT id FROM vendors WHERE name = ?', [row.vendor]) as any;
            if (vendor) {
              equipmentVendorId = vendor.id;
            } else {
              // Create new vendor if not found
              const vendorResult = await dbRun(
                'INSERT INTO vendors (code, name, is_active) VALUES (?, ?, 1)',
                [`VND-${Date.now()}`, row.vendor]
              ) as any;
              equipmentVendorId = vendorResult.insertId;
            }
          }
          await dbRun(
            'INSERT INTO master_equipment (code, name, satuan, harga, vendor_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
            [row.code, row.name, row.satuan, parseNumber(row.harga), equipmentVendorId]
          );
          break;
      }
      
      importedCount++;
    } catch (error: any) {
      console.error(`Error importing row:`, row, error);
      throw new Error(`Failed to import row: ${error.message}`);
    }
  }

  return importedCount;
}

async function importAhspDataWithConflictResolution(data: any[], resolution: any): Promise<number> {
  let importedCount = 0;

  for (const row of data) {
    try {
      const kode = (row.kode || '').toString().trim();
      const name = (row.name || '').toString().trim();
      const satuan = (row.satuan || '').toString().trim();
      const version = (row.version || '28/2016').toString().trim();
      const status = (row.status || 'active').toString().trim();

      const existing = await dbGet('SELECT id FROM ahsp_headers WHERE kode = ?', [kode]) as any;
      let ahspId: number;

      // Get sub_discipline_id from kode prefix
      const prefix5 = kode.substring(0, 5);
      const prefix6 = kode.substring(0, 6);
      const subDisciplineId = await getSubDisciplineIdFromKode(prefix5, prefix6);

      // Handle conflict resolution
      if (existing) {
        // Check resolution strategy
        if (resolution === 'replace-all' || (typeof resolution === 'object' && resolution[kode] === 'replace')) {
          // Replace existing
          await dbRun(
            'UPDATE ahsp_headers SET name = ?, satuan = ?, version = ?, status = ? WHERE id = ?',
            [name, satuan, version, status, existing.id]
          );
          ahspId = existing.id;
          // Delete old items and mappings
          await dbRun('DELETE FROM ahsp_items WHERE ahsp_id = ?', [ahspId]);
          await dbRun('DELETE FROM ahsp_sub_discipline_map WHERE ahsp_id = ?', [ahspId]);
        } else {
          // Skip this record (keep existing)
          continue;
        }
      } else {
        // Insert new AHSP
        const result = await dbRun(
          'INSERT INTO ahsp_headers (kode, name, satuan, version, status, discipline_id) VALUES (?, ?, ?, ?, ?, 1)',
          [kode, name, satuan, version, status]
        );
        ahspId = result.insertId;
      }

      // Insert items if provided
      if (row.section) {
        const section = (row.section || '').toString().trim().toUpperCase();
        const resourceName = (row.resource_name || '').toString().trim();
        const resourceSatuan = (row.resource_satuan || '').toString().trim();
        const koefisien = parseNumber(row.koefisien);
        const resourceHarga = parseNumber(row.resource_harga);
        const jumlahHarga = koefisien * resourceHarga;

        await dbRun(
          `INSERT INTO ahsp_items
          (ahsp_id, section, koefisien, resource_name, resource_satuan, resource_harga, jumlah_harga)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [ahspId, section, koefisien, resourceName, resourceSatuan, resourceHarga, jumlahHarga]
        );
      }

      // Map to sub-discipline
      if (subDisciplineId) {
        await dbRun('INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id) VALUES (?, ?)', [
          ahspId,
          subDisciplineId
        ]);
      }

      await calculateAhspPrice(ahspId);
      importedCount++;
    } catch (error: any) {
      console.error('Error importing AHSP row:', error);
      throw error;
    }
  }

  return importedCount;
}

async function getSubDisciplineIdFromKode(prefix5: string, prefix6: string): Promise<number | null> {
  const mapping: { [key: string]: string } = {
    'A.1.1': 'Pekerjaan Persiapan',
    'A.1.2': 'Pekerjaan Bongkaran',
    'A.1.3': 'Pekerjaan Tanah',
    'A.1.4': 'Pekerjaan Pondasi',
    'A.1.5': 'Pekerjaan Pasangan',
    'A.1.6': 'Pekerjaan Beton',
    'A.1.7': 'Beton Pracetak',
    'A.1.8': 'Pekerjaan Plesteran',
    'A.1.9': 'Pek Penutup Dinding',
    'A.1.10': 'Pek Konblok'
  };

  let subDisciplineName = mapping[prefix6] || mapping[prefix5];
  if (!subDisciplineName) return null;

  const result = await dbGet(
    'SELECT id FROM master_sub_disciplines WHERE name = ? AND discipline_id = 1',
    [subDisciplineName]
  ) as any;

  return result?.id || null;
}

async function importAhspData(data: any[]): Promise<number> {
  const groups = new Map<string, any[]>();

  for (const row of data) {
    const kode = (row.kode || '').toString().trim();
    if (!kode) continue;
    if (!groups.has(kode)) groups.set(kode, []);
    groups.get(kode)?.push(row);
  }

  let importedCount = 0;

  for (const [kode, rows] of groups.entries()) {
    const headerRow = rows[0];
    const name = (headerRow.name || '').toString().trim();
    const satuan = (headerRow.satuan || '').toString().trim();
    const version = (headerRow.version || '2024').toString().trim();
    const status = (headerRow.status || 'active').toString().trim();
    const subDisciplineId = parseInt((headerRow.sub_discipline_id || '').toString(), 10) || null;

    const existing = await dbGet('SELECT id FROM ahsp_headers WHERE kode = ?', [kode]) as any;
    let ahspId: number;

    if (existing) {
      ahspId = existing.id;
      await dbRun(
        'UPDATE ahsp_headers SET name = ?, satuan = ?, version = ?, status = ? WHERE id = ?',
        [name, satuan, version, status, ahspId]
      );
      await dbRun('DELETE FROM ahsp_items WHERE ahsp_id = ?', [ahspId]);
      await dbRun('DELETE FROM ahsp_sub_discipline_map WHERE ahsp_id = ?', [ahspId]);
    } else {
      const result = await dbRun(
        'INSERT INTO ahsp_headers (kode, name, satuan, version, status) VALUES (?, ?, ?, ?, ?)',
        [kode, name, satuan, version, status]
      );
      ahspId = result.insertId;
    }

    for (const row of rows) {
      const sectionRaw = (row.section || '').toString().trim().toUpperCase();
      if (!sectionRaw) continue;

      const resourceTypeRaw = (row.resource_type || '').toString().trim().toLowerCase();
      const resourceType = resourceTypeRaw || (sectionRaw === 'A' ? 'labor' : sectionRaw === 'B' ? 'material' : 'equipment');
      const resourceId = parseInt((row.resource_id || '').toString(), 10) || 0;
      const resourceName = (row.resource_name || '').toString().trim();
      const resourceSatuan = (row.resource_satuan || '').toString().trim() || null;
      const koefisien = parseNumber(row.koefisien);
      const resourceHarga = parseNumber(row.resource_harga);
      const jumlahHarga = koefisien * resourceHarga;

      await dbRun(
        `INSERT INTO ahsp_items
        (ahsp_id, section, resource_type, resource_id, koefisien, resource_name, resource_satuan, resource_harga, jumlah_harga)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ahspId,
          sectionRaw,
          resourceType,
          resourceId,
          koefisien,
          resourceName,
          resourceSatuan,
          resourceHarga,
          jumlahHarga
        ]
      );
    }

    if (subDisciplineId) {
      await dbRun('INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id) VALUES (?, ?)', [
        ahspId,
        subDisciplineId
      ]);
    }

    await calculateAhspPrice(ahspId);
    importedCount++;
  }

  return importedCount;
}

// Detect conflicts for any entity
async function detectConflicts(entity: string, data: any[]): Promise<any[]> {
  const conflicts: any[] = [];
  
  const keyFields: { [key: string]: string } = {
    'products': 'sku',
    'categories': 'name',
    'units': 'code',
    'vendors': 'code',
    'customers': 'code',
    'employees': 'code',
    'departments': 'code',
    'labor': 'code',
    'materials': 'code',
    'equipment': 'code',
    'ahsp': 'kode'
  };

  const tableNames: { [key: string]: string } = {
    'products': 'products',
    'categories': 'categories',
    'units': 'uom',
    'vendors': 'vendors',
    'customers': 'customers',
    'employees': 'employees',
    'departments': 'departments',
    'labor': 'master_labor',
    'materials': 'master_materials',
    'equipment': 'master_equipment',
    'ahsp': 'ahsp_headers'
  };

  const keyField = keyFields[entity];
  const tableName = tableNames[entity];

  if (!keyField || !tableName) return conflicts;

  for (const row of data) {
    const keyValue = (row[keyField] || '').toString().trim();
    if (!keyValue) continue;

    const existing = await dbGet(
      `SELECT * FROM ${tableName} WHERE ${keyField} = ?`,
      [keyValue]
    ) as any;

    if (existing) {
      conflicts.push({
        [keyField]: keyValue,
        newData: row,
        existingData: existing
      });
    }
  }

  return conflicts;
}

// Import any entity with conflict resolution
async function importDataWithConflictResolution(entity: string, data: any[], resolution: string): Promise<number> {
  if (entity === 'ahsp') {
    return importAhspDataWithConflictResolution(data, resolution);
  }

  // For other entities, use standard import logic
  return importData(entity, data);
}

// Calculate AHSP price from items
async function calculateAhspPrice(ahspId: number): Promise<void> {
  const items = await dbAll(
    'SELECT section, koefisien, resource_harga FROM ahsp_items WHERE ahsp_id = ?',
    [ahspId]
  );

  let hargaTenaga = 0;
  let hargaBahan = 0;
  let hargaAlat = 0;

  items.forEach((item: any) => {
    const jumlah = parseFloat(item.koefisien) * parseFloat(item.resource_harga);
    if (item.section === 'A') hargaTenaga += jumlah;
    else if (item.section === 'B') hargaBahan += jumlah;
    else if (item.section === 'C') hargaAlat += jumlah;
  });

  const hargaLangsung = hargaTenaga + hargaBahan + hargaAlat;
  const overheadProfit = hargaLangsung * 0.1;
  const hargaSatuan = hargaLangsung + overheadProfit;

  await dbRun(
    `UPDATE ahsp_headers
     SET harga_tenaga = ?, harga_bahan = ?, harga_alat = ?, harga_langsung = ?, overhead_profit = ?, harga_satuan = ?
     WHERE id = ?`,
    [hargaTenaga, hargaBahan, hargaAlat, hargaLangsung, overheadProfit, hargaSatuan, ahspId]
  );
}

function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;

  let raw = value.toString().trim();
  if (!raw) return 0;

  raw = raw.replace(/[^0-9,.-]/g, '');
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    raw = raw.replace(',', '.');
  } else {
    raw = raw.replace(/,/g, '');
  }

  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function normalizeText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeJenis(value: any): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned || cleaned === '-') return null;
  return cleaned;
}

function normalizeSatuan(value: any): string {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return 'PCS';

  const satuanMap: Record<string, string> = {
    PC: 'PCS',
    'PCS.': 'PCS',
    PCS: 'PCS',
    BTG: 'BATANG',
    BATANG: 'BATANG',
    UNIT: 'UNIT',
    LOT: 'LOT',
    ROLL: 'ROLL',
    PACK: 'PACK',
    BOX: 'BOX',
    LUSIN: 'LUSIN',
    M: 'M',
    M2: 'M2',
    M3: 'M3',
    KG: 'KG',
    ZAK: 'SAK',
    SAK: 'SAK',
    DAY: 'DAYS',
    DAYS: 'DAYS',
    GALON: 'GALON',
    TABUNG: 'TABUNG',
    LEMBAR: 'LEMBAR',
    SET: 'SET',
    OH: 'OH'
  };

  return satuanMap[raw] || raw;
}

async function cleanupImportedMaterials(): Promise<{
  normalizedRows: number;
  duplicateDeactivated: number;
  codesStandardized: number;
  standardizedRange: string | null;
}> {
  const targetRows = await dbAll(
    `SELECT id, code, jenis, name, satuan, harga, vendor_id, is_active
     FROM master_materials
     WHERE code LIKE 'MAT-CSV-%' OR code LIKE 'MT-2026-%'
     ORDER BY id ASC`
  );

  let normalizedRows = 0;
  let duplicateDeactivated = 0;
  let codesStandardized = 0;

  // Normalize vendor names linked to imported materials
  const vendorRows = await dbAll(
    `SELECT v.id, v.name
     FROM vendors v
     WHERE v.id IN (
       SELECT DISTINCT vendor_id
       FROM master_materials
       WHERE (code LIKE 'MAT-CSV-%' OR code LIKE 'MT-2026-%') AND vendor_id IS NOT NULL
     )`
  );

  for (const vendor of vendorRows as any[]) {
    const fixedVendorName = normalizeText(vendor.name);
    if (fixedVendorName && fixedVendorName !== vendor.name) {
      await dbRun('UPDATE vendors SET name = ? WHERE id = ?', [fixedVendorName, vendor.id]);
    }
  }

  // Normalize imported material rows first
  for (const row of targetRows as any[]) {
    const fixedJenis = normalizeJenis(row.jenis);
    const fixedName = normalizeText(row.name);
    const fixedSatuan = normalizeSatuan(row.satuan);

    if (fixedJenis !== row.jenis || fixedName !== row.name || fixedSatuan !== row.satuan) {
      await dbRun(
        'UPDATE master_materials SET jenis = ?, name = ?, satuan = ? WHERE id = ?',
        [fixedJenis, fixedName, fixedSatuan, row.id]
      );
      normalizedRows++;
    }
  }

  // Deactivate duplicates among active imported rows
  const afterNormalizeRows = await dbAll(
    `SELECT id, jenis, name, satuan, harga, vendor_id, is_active
     FROM master_materials
     WHERE code LIKE 'MAT-CSV-%' OR code LIKE 'MT-2026-%'
     ORDER BY id ASC`
  );

  const keeperByKey = new Map<string, number>();
  for (const row of afterNormalizeRows as any[]) {
    const key = [
      normalizeText(row.name).toLowerCase(),
      normalizeText(row.jenis || '').toLowerCase(),
      normalizeSatuan(row.satuan),
      Number(row.harga || 0).toFixed(2),
      row.vendor_id || 0
    ].join('|');

    if (!keeperByKey.has(key)) {
      keeperByKey.set(key, row.id);
      continue;
    }

    if (row.is_active === 1) {
      await dbRun('UPDATE master_materials SET is_active = 0 WHERE id = ?', [row.id]);
      duplicateDeactivated++;
    }
  }

  // Standardize active MAT-CSV code to MT-2026-xxxx
  const maxCodeRow = await dbGet(
    `SELECT MAX(CAST(SUBSTRING(code, 9) AS UNSIGNED)) AS max_no
     FROM master_materials
     WHERE code REGEXP '^MT-2026-[0-9]{4}$'`
  ) as any;
  let nextSequence = Number(maxCodeRow?.max_no || 0);
  let firstCode: string | null = null;
  let lastCode: string | null = null;

  const rowsToStandardize = await dbAll(
    `SELECT id
     FROM master_materials
     WHERE code LIKE 'MAT-CSV-%' AND is_active = 1
     ORDER BY id ASC`
  );

  for (const row of rowsToStandardize as any[]) {
    let candidate = '';

    // Ensure no collision with any existing code
    while (true) {
      nextSequence += 1;
      candidate = `MT-2026-${String(nextSequence).padStart(4, '0')}`;
      const existing = await dbGet('SELECT id FROM master_materials WHERE code = ?', [candidate]) as any;
      if (!existing) break;
    }

    await dbRun('UPDATE master_materials SET code = ? WHERE id = ?', [candidate, row.id]);
    if (!firstCode) firstCode = candidate;
    lastCode = candidate;
    codesStandardized++;
  }

  return {
    normalizedRows,
    duplicateDeactivated,
    codesStandardized,
    standardizedRange: firstCode && lastCode ? `${firstCode}..${lastCode}` : null
  };
}

async function cleanupImportedVendors(): Promise<{
  normalizedRows: number;
  duplicateDeactivated: number;
  codesStandardized: number;
  standardizedRange: string | null;
}> {
  const targetRows = await dbAll(
    `SELECT id, code, name, contact, email, is_active
     FROM vendors
    WHERE code LIKE 'VENDOR-CSV-%' OR code LIKE 'VND-CSV-%' OR code LIKE 'VENDOR-IMPORT-%' OR code LIKE 'VND-2026-%'
     ORDER BY id ASC`
  );

  let normalizedRows = 0;
  let duplicateDeactivated = 0;
  let codesStandardized = 0;

  // Normalize imported vendor rows first
  for (const row of targetRows as any[]) {
    const fixedName = normalizeText(row.name);
    const fixedContact = normalizeText(row.contact || '');

    if (fixedName !== row.name || fixedContact !== row.contact) {
      await dbRun(
        'UPDATE vendors SET name = ?, contact = ? WHERE id = ?',
        [fixedName, fixedContact, row.id]
      );
      normalizedRows++;
    }
  }

  // Deactivate duplicates among active imported rows
  const afterNormalizeRows = await dbAll(
    `SELECT id, name, contact, email, is_active
     FROM vendors
    WHERE code LIKE 'VENDOR-CSV-%' OR code LIKE 'VND-CSV-%' OR code LIKE 'VENDOR-IMPORT-%' OR code LIKE 'VND-2026-%'
     ORDER BY id ASC`
  );

  const keeperByKey = new Map<string, number>();
  for (const row of afterNormalizeRows as any[]) {
    const key = [
      normalizeText(row.name).toLowerCase(),
      normalizeText(row.contact || '').toLowerCase(),
      row.email || ''
    ].join('|');

    if (!keeperByKey.has(key)) {
      keeperByKey.set(key, row.id);
      continue;
    }

    if (row.is_active === 1) {
      await dbRun('UPDATE vendors SET is_active = 0 WHERE id = ?', [row.id]);
      duplicateDeactivated++;
    }
  }

  // Standardize active VENDOR-CSV code to VND-2026-xxxx
  const maxCodeRow = await dbGet(
    `SELECT MAX(CAST(SUBSTRING(code, 9) AS UNSIGNED)) AS max_no
     FROM vendors
     WHERE code REGEXP '^VND-2026-[0-9]{4}$'`
  ) as any;
  let nextSequence = Number(maxCodeRow?.max_no || 0);
  let firstCode: string | null = null;
  let lastCode: string | null = null;

  const rowsToStandardize = await dbAll(
    `SELECT id
     FROM vendors
    WHERE (code LIKE 'VENDOR-CSV-%' OR code LIKE 'VND-CSV-%' OR code LIKE 'VENDOR-IMPORT-%') AND is_active = 1
     ORDER BY id ASC`
  );

  for (const row of rowsToStandardize as any[]) {
    let candidate = '';

    // Ensure no collision with any existing code
    while (true) {
      nextSequence += 1;
      candidate = `VND-2026-${String(nextSequence).padStart(4, '0')}`;
      const existing = await dbGet('SELECT id FROM vendors WHERE code = ?', [candidate]) as any;
      if (!existing) break;
    }

    await dbRun('UPDATE vendors SET code = ? WHERE id = ?', [candidate, row.id]);
    if (!firstCode) firstCode = candidate;
    lastCode = candidate;
    codesStandardized++;
  }

  return {
    normalizedRows,
    duplicateDeactivated,
    codesStandardized,
    standardizedRange: firstCode && lastCode ? `${firstCode}..${lastCode}` : null
  };
}

export default router;
