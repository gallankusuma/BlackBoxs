const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function fixDatabase(dbName) {
  console.log(`Fixing database: ${dbName}...`);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD,
    database: dbName
  });

  try {
    // Fix products table
    try {
      await connection.query('ALTER TABLE products ADD COLUMN lead_time_days INT DEFAULT 0');
      console.log(`Added lead_time_days to ${dbName}.products`);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log(`lead_time_days already exists in ${dbName}.products`);
      else throw e;
    }

    // Fix work_orders table
    try {
      await connection.query('ALTER TABLE work_orders ADD COLUMN completed_quantity INT DEFAULT 0');
      console.log(`Added completed_quantity to ${dbName}.work_orders`);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log(`completed_quantity already exists in ${dbName}.work_orders`);
      else throw e;
    }

    // Create material_vendor_prices table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS material_vendor_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id INT NOT NULL,
        vendor_id INT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        source VARCHAR(255) DEFAULT 'offline',
        price DECIMAL(15,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'IDR',
        unit VARCHAR(50) NULL,
        url TEXT NULL,
        rating DECIMAL(3,1) NULL,
        contact VARCHAR(255) NULL,
        location VARCHAR(255) NULL,
        min_order_qty INT NULL,
        lead_time_days INT NULL,
        notes TEXT NULL,
        quoted_at DATETIME NULL,
        valid_until DATETIME NULL,
        created_by INT NULL,
        is_selected BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`Created material_vendor_prices in ${dbName}`);

  } catch (error) {
    console.error(`Error fixing database ${dbName}:`, error);
  } finally {
    await connection.end();
  }
}

async function main() {
  await fixDatabase('erp_rheologi');
  await fixDatabase('blackboxs');
  console.log('Database fixes complete.');
}

main();
