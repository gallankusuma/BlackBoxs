import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const generateCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

// Customers CRUD
router.get('/customers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const customers = await dbAll('SELECT * FROM customers ORDER BY name ASC', []);
    res.json({ data: customers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/customers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ data: customer });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

router.post('/customers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, contact, phone, email, address } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

    const result = await dbRun(
      'INSERT INTO customers (code, name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
      [code, name, contact || null, phone || null, email || null, address || null]
    );

    res.status(201).json({ message: 'Customer created', data: { id: result.insertId, code, name } });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    if (error.message?.includes('Duplicate entry')) return res.status(400).json({ error: 'Customer code must be unique' });
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.put('/customers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, contact, phone, email, address } = req.body;
    await dbRun(
      'UPDATE customers SET code = ?, name = ?, contact = ?, phone = ?, email = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [code, name, contact || null, phone || null, email || null, address || null, req.params.id]
    );
    res.json({ message: 'Customer updated' });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/customers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Sales Orders
router.get('/sales-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orders = await dbAll(
      `SELECT so.*, c.name as customer_name,
                (SELECT COUNT(*) FROM so_items i WHERE i.so_id = so.id) as item_count
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         ORDER BY so.created_at DESC`
    );
    res.json({ data: orders });
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    res.status(500).json({ error: 'Failed to fetch sales orders' });
  }
});

router.get('/sales-orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const order = await dbGet(
      `SELECT so.*, c.name as customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         WHERE so.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Sales order not found' });

    const items = await dbAll(
      `SELECT i.*, p.sku, p.name as product_name
         FROM so_items i
         JOIN products p ON i.product_id = p.id
         WHERE i.so_id = ?`,
      [req.params.id]
    );

    res.json({ data: { ...order, items } });
  } catch (error) {
    console.error('Error fetching sales order:', error);
    res.status(500).json({ error: 'Failed to fetch sales order' });
  }
});

router.post('/sales-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { so_number, customer_id, status, expected_ship_date, currency, notes, items } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items are required' });
    }

    // TODO: Use transaction for production
    const number = so_number || generateCode('SO');

    const orderResult = await dbRun(
      'INSERT INTO sales_orders (so_number, customer_id, status, expected_ship_date, currency, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [number, customer_id, status || 'draft', expected_ship_date || null, currency || 'IDR', notes || null]
    );
    const soId = orderResult.insertId;

    for (const item of items) {
      await dbRun(
        'INSERT INTO sales_order_items (so_id, product_id, quantity, uom, unit_price, currency, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [soId, item.product_id, item.quantity, item.uom || null, item.unit_price || 0, item.currency || currency || 'IDR', item.notes || null]
      );
    }

    res.status(201).json({ message: 'Sales order created', data: { id: soId, so_number: number } });
  } catch (error: any) {
    console.error('Error creating sales order:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'SO number must be unique' });
    res.status(500).json({ error: 'Failed to create sales order' });
  }
});

router.put('/sales-orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { customer_id, status, expected_ship_date, currency, notes, items } = req.body;

    // TODO: Use transaction for production
    await dbRun(
      'UPDATE sales_orders SET customer_id = ?, status = ?, expected_ship_date = ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [customer_id, status, expected_ship_date || null, currency || 'IDR', notes || null, req.params.id]
    );

    if (items && Array.isArray(items)) {
      await dbRun('DELETE FROM sales_order_items WHERE so_id = ?', [req.params.id]);
      for (const item of items) {
        await dbRun(
          'INSERT INTO sales_order_items (so_id, product_id, quantity, uom, unit_price, currency, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.uom || null, item.unit_price || 0, item.currency || currency || 'IDR', item.notes || null]
        );
      }
    }

    res.json({ message: 'Sales order updated' });
  } catch (error) {
    console.error('Error updating sales order:', error);
    res.status(500).json({ error: 'Failed to update sales order' });
  }
});

// Deliveries
router.get('/deliveries', authMiddleware, async (req: Request, res: Response) => {
  try {
    const deliveries = await dbAll(
      `SELECT d.*, so.so_number
         FROM deliveries d
         LEFT JOIN sales_orders so ON d.so_id = so.id
         ORDER BY d.created_at DESC`
    );
    res.json({ data: deliveries });
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

router.get('/deliveries/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const delivery = await dbGet(
      `SELECT d.*, so.so_number
         FROM deliveries d
         LEFT JOIN sales_orders so ON d.so_id = so.id
         WHERE d.id = ?`,
      [req.params.id]
    );
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    res.json({ data: delivery });
  } catch (error) {
    console.error('Error fetching delivery:', error);
    res.status(500).json({ error: 'Failed to fetch delivery' });
  }
});

router.post('/deliveries', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { do_number, so_id, warehouse_id, status, shipped_at, notes } = req.body;
    if (!so_id) return res.status(400).json({ error: 'so_id is required' });

    const number = do_number || generateCode('DO');
    const result = await dbRun(
      'INSERT INTO deliveries (do_number, so_id, warehouse_id, status, shipped_at, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [number, so_id, warehouse_id || null, status || 'draft', shipped_at || null, notes || null]
    );

    res.status(201).json({ message: 'Delivery created', data: { id: result.insertId, do_number: number } });
  } catch (error: any) {
    console.error('Error creating delivery:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'DO number must be unique' });
    res.status(500).json({ error: 'Failed to create delivery' });
  }
});

// Invoices
router.get('/invoices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const invoices = await dbAll(
      `SELECT i.*, so.so_number
         FROM invoices i
         LEFT JOIN sales_orders so ON i.so_id = so.id
         ORDER BY i.created_at DESC`
    );
    res.json({ data: invoices });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/invoices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const invoice = await dbGet(
      `SELECT i.*, so.so_number
         FROM invoices i
         LEFT JOIN sales_orders so ON i.so_id = so.id
         WHERE i.id = ?`,
      [req.params.id]
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: invoice });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/invoices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { invoice_number, so_id, amount, status, issued_at, due_at, notes } = req.body;
    if (!so_id || amount === undefined) return res.status(400).json({ error: 'so_id and amount are required' });

    const number = invoice_number || generateCode('INV');
    const result = await dbRun(
      'INSERT INTO invoices (invoice_number, so_id, total_amount, status, invoice_date, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [number, so_id, amount, status || 'unpaid', issued_at || null, due_at || null, notes || null]
    );

    res.status(201).json({ message: 'Invoice created', data: { id: result.insertId, invoice_number: number } });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Invoice number must be unique' });
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.put('/invoices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { so_id, amount, status, issued_at, due_at, notes } = req.body;
    await dbRun(
      'UPDATE invoices SET so_id = ?, total_amount = ?, status = ?, invoice_date = COALESCE(?, invoice_date), due_date = COALESCE(?, due_date), notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [so_id, amount, status, issued_at || null, due_at || null, notes || null, req.params.id]
    );
    res.json({ message: 'Invoice updated' });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// ===== SO APPROVAL =====

router.get('/approval', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT so.*, c.name as customer_name,
              COALESCE(SUM(soi.quantity * soi.unit_price), 0) as total_amount
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       LEFT JOIN sales_order_items soi ON soi.so_id = so.id
       WHERE so.status = 'draft'
       GROUP BY so.id
       ORDER BY so.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching SO for approval:', error);
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

router.put('/approval/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const so: any = await dbGet('SELECT * FROM sales_orders WHERE id = ?', [req.params.id]);
    if (!so) return res.status(404).json({ error: 'SO not found' });
    await dbRun('UPDATE sales_orders SET status = ? WHERE id = ?', ['open', req.params.id]);
    res.json({ success: true, message: 'SO approved' });
  } catch (error) {
    console.error('Error approving SO:', error);
    res.status(500).json({ error: 'Failed to approve SO' });
  }
});

router.put('/approval/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await dbRun('UPDATE sales_orders SET status = ?, notes = CONCAT(COALESCE(notes, \'\'), ?) WHERE id = ?',
      ['cancelled', `\n[REJECTED] ${reason || 'No reason provided'}`, req.params.id]);
    res.json({ success: true, message: 'SO rejected' });
  } catch (error) {
    console.error('Error rejecting SO:', error);
    res.status(500).json({ error: 'Failed to reject SO' });
  }
});

// ===== PRICE LIST =====

router.get('/price-list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.id, p.sku, p.name, p.description,
              p.selling_price as base_price, p.unit
       FROM products p
       WHERE p.selling_price IS NOT NULL AND p.selling_price > 0
       ORDER BY p.name`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching price list:', error);
    res.status(500).json({ error: 'Failed to fetch price list' });
  }
});

router.put('/price-list/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { selling_price } = req.body;
    if (selling_price === undefined || selling_price < 0) return res.status(400).json({ error: 'Valid price required' });
    await dbRun('UPDATE products SET selling_price = ? WHERE id = ?', [selling_price, req.params.id]);
    res.json({ success: true, message: 'Price updated' });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

// ===== SALES HISTORY =====

router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, from, to, search } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status && status !== 'all') { where += ' AND so.status = ?'; params.push(status); }
    if (from) { where += ' AND so.created_at >= ?'; params.push(from); }
    if (to) { where += ' AND so.created_at <= ?'; params.push(to + ' 23:59:59'); }
    if (search) { where += ' AND (so.so_number LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const rows = await dbAll(
      `SELECT so.*, c.name as customer_name,
              COALESCE(SUM(soi.quantity * soi.unit_price), 0) as total_amount,
              (SELECT COUNT(*) FROM deliveries d WHERE d.so_id = so.id) as delivery_count,
              (SELECT COUNT(*) FROM invoices inv WHERE inv.so_id = so.id) as invoice_count
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       LEFT JOIN sales_order_items soi ON soi.so_id = so.id
       ${where}
       GROUP BY so.id
       ORDER BY so.created_at DESC`, params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching sales history:', error);
    res.status(500).json({ error: 'Failed to fetch sales history' });
  }
});

router.get('/history/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await dbGet(
      `SELECT
         COUNT(*) as total_orders,
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_orders,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_orders,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
       FROM sales_orders`
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching sales stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
