import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

async function getProductIdBySku(sku: string): Promise<number | null> {
  const row = await dbGet('SELECT id FROM products WHERE sku = ?', [sku]);
  return row?.id ?? null;
}

async function getLocationByCode(code: string): Promise<{ id: number; warehouse_id: number } | null> {
  const row = await dbGet('SELECT id, warehouse_id FROM warehouse_locations WHERE code = ?', [code]);
  return row ?? null;
}

async function getBatchIdByNumber(batchNumber: string): Promise<number | null> {
  const row = await dbGet('SELECT id FROM batches WHERE batch_number = ?', [batchNumber]);
  return row?.id ?? null;
}

// Reuse inventory update logic similar to warehouses stock-movements
async function recordStockMovement(payload: {
  product_id: number;
  warehouse_id: number;
  location_id?: number | null;
  batch_id?: number | null;
  movement_type: 'IN' | 'OUT' | 'TRANSFER' | string;
  quantity: number;
  uom?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  notes?: string | null;
}): Promise<number> {

  // NOTE: This simplified version does not use transactions like the original
  // logical transaction would require passing a connection object through helpers
  // For simulation/dev purposes, individual queries are acceptable

  const result = await dbRun(
    'INSERT INTO stock_movements (product_id, warehouse_id, location_id, batch_id, movement_type, quantity, uom, reference_type, reference_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.product_id,
      payload.warehouse_id,
      payload.location_id ?? null,
      payload.batch_id ?? null,
      payload.movement_type,
      payload.quantity,
      payload.uom ?? null,
      payload.reference_type ?? null,
      payload.reference_id ?? null,
      payload.notes ?? null
    ]
  );

  const movementId = result.insertId;

  const inv = await dbGet('SELECT id, quantity_on_hand, quantity_reserved FROM inventory_stocks WHERE product_id = ? AND warehouse_id = ? AND location_id = ?', [payload.product_id, payload.warehouse_id, payload.location_id]);

  if (!inv) {
    const onHand = payload.movement_type === 'OUT' ? -payload.quantity : payload.quantity;
    // if (onHand < 0) throw new Error('Cannot create negative stock'); // Relaxed for simulation
    await dbRun(
      'INSERT INTO inventory_stocks (product_id, warehouse_id, location_id, quantity, reorder_point) VALUES (?, ?, ?, ?, ?)',
      [payload.product_id, payload.warehouse_id, payload.location_id, onHand, 0]
    );
  } else {
    let onHand = inv.quantity || 0;
    if (payload.movement_type === 'IN') onHand += payload.quantity;
    if (payload.movement_type === 'OUT') onHand -= payload.quantity;
    // if (payload.movement_type === 'TRANSFER') onHand = onHand; // net zero but record movement

    // if (onHand < 0) throw new Error('Insufficient stock'); // Relaxed for simulation

    await dbRun(
      'UPDATE inventory_stocks SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [onHand, inv.id]
    );
  }

  return movementId;
}

/**
 * POST /api/simulate/run
 * Body: { scenario?: 'basic' }
 * Creates a handful of movements for quick UI validation.
 */
router.post('/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const scenario = (req.body?.scenario as string) || 'basic';
    const results: any[] = [];

    // Defaults use seeded SKUs and locations
    const skuGlucose = 'RM-GLUCOSE';
    const skuEthanol = 'RM-ETHANOL';
    const skuEnergy = 'FG-ENERGY-500';
    const locRaw = 'A-RA-01';
    const locFg1 = 'B-FG-01';

    const pidGlucose = await getProductIdBySku(skuGlucose);
    const pidEthanol = await getProductIdBySku(skuEthanol);
    const pidEnergy = await getProductIdBySku(skuEnergy);
    const rawLoc = await getLocationByCode(locRaw);
    const fgLoc1 = await getLocationByCode(locFg1);

    if (!pidGlucose || !pidEthanol || !pidEnergy || !rawLoc || !fgLoc1) {
      return res.status(400).json({ error: 'Required seeded data not found (products/locations).' });
    }

    if (scenario === 'basic') {
      // IN: Add 100 KG Glucose to Raw location
      const m1 = await recordStockMovement({
        product_id: pidGlucose,
        warehouse_id: rawLoc.warehouse_id,
        location_id: rawLoc.id,
        batch_id: await getBatchIdByNumber('RM-GLU-2401'),
        movement_type: 'IN',
        quantity: 100,
        uom: 'KG',
        reference_type: 'SIM',
        notes: 'Simulation IN Glucose 100 KG',
      });
      results.push(m1);

      // OUT: Consume 50 L Ethanol from Raw location
      const m2 = await recordStockMovement({
        product_id: pidEthanol,
        warehouse_id: rawLoc.warehouse_id,
        location_id: rawLoc.id,
        batch_id: await getBatchIdByNumber('RM-ETH-2402'),
        movement_type: 'OUT',
        quantity: 50,
        uom: 'L',
        reference_type: 'SIM',
        notes: 'Simulation OUT Ethanol 50 L',
      });
      results.push(m2);

      // OUT: Ship 150 PCS FG Energy Drink from FG location
      const m3 = await recordStockMovement({
        product_id: pidEnergy,
        warehouse_id: fgLoc1.warehouse_id,
        location_id: fgLoc1.id,
        batch_id: await getBatchIdByNumber('FG-ENE-500-2403'),
        movement_type: 'OUT',
        quantity: 150,
        uom: 'PCS',
        reference_type: 'SIM',
        notes: 'Simulation OUT Energy Drink 150 PCS',
      });
      results.push(m3);
    }

    // Return summary
    const inv = await dbAll(
      `SELECT i.id, i.product_id, i.quantity, p.sku, p.name 
         FROM inventory_stocks i 
         JOIN products p ON p.id = i.product_id 
         ORDER BY p.name`
    );

    const movements = await dbAll(
      `SELECT sm.id, sm.product_id, sm.movement_type, sm.quantity, sm.uom, sm.created_at as moved_at, p.sku 
         FROM stock_movements sm 
         JOIN products p ON p.id = sm.product_id 
         ORDER BY sm.id DESC LIMIT 10`
    );

    res.json({ message: 'Simulation executed', data: { movement_ids: results, inventory: inv, recent_movements: movements } });
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: 'Failed to run simulation' });
  }
});

export default router;