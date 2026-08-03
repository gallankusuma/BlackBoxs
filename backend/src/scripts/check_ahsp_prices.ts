
import db, { initializeDatabase } from '../config/database';

async function checkPrices() {
  await initializeDatabase();
  console.log("Checking AHSP prices > 1,000,000...");
  
  const [highValueAHSPs] = await db.query(`
    SELECT id, kode, name, harga_satuan 
    FROM ahsp_headers 
    WHERE harga_satuan > 1000000 
    ORDER BY harga_satuan DESC 
    LIMIT 10
  `) as any[];

  console.log("Found:", highValueAHSPs);

  if (highValueAHSPs.length > 0) {
    const firstId = highValueAHSPs[0].id;
    console.log(`Checking items for AHSP ID ${firstId}...`);
    const [items] = await db.query(`
      SELECT * FROM ahsp_items WHERE ahsp_id = ?
    `, [firstId]) as any[];
    console.log(items);
  }
}

checkPrices().catch(console.error);
