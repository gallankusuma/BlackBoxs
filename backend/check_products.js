const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_rheologi',
  });

  // Check vendor-related tables
  const [tables] = await pool.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'erp_rheologi' AND TABLE_NAME LIKE '%vendor%' OR TABLE_NAME LIKE '%price%'");
  console.log('Vendor/Price tables:', tables.map(t => t.TABLE_NAME).join(', '));

  // Check material_vendor_prices
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM material_vendor_prices");
    console.log('\nmaterial_vendor_prices columns:', cols.map(c => c.Field).join(', '));
    const [data] = await pool.execute('SELECT * FROM material_vendor_prices LIMIT 5');
    console.log('material_vendor_prices data:', JSON.stringify(data, null, 2));
  } catch(e) {
    console.log('No material_vendor_prices table');
  }

  await pool.end();
}

main().catch(console.error);
