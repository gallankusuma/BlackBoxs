const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_rheologi',
  });

  // Check what tables reference purchase_orders
  const [fks] = await pool.execute(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME = 'purchase_orders' AND TABLE_SCHEMA = 'erp_rheologi'
  `);
  
  console.log('Tables referencing purchase_orders:', JSON.stringify(fks, null, 2));

  // Let's also check if any of these tables have their own children that might block them
  // e.g., what references goods_receipts?
  const [grnFks] = await pool.execute(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME = 'goods_receipts' AND TABLE_SCHEMA = 'erp_rheologi'
  `);
  console.log('\nTables referencing goods_receipts:', JSON.stringify(grnFks, null, 2));
  
  // What references accounts_payable?
  const [apFks] = await pool.execute(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME = 'accounts_payable' AND TABLE_SCHEMA = 'erp_rheologi'
  `);
  console.log('\nTables referencing accounts_payable:', JSON.stringify(apFks, null, 2));

  await pool.end();
}

main().catch(console.error);
