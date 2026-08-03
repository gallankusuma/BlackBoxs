
const mysql = require('mysql2/promise');

async function checkPrices() {
  console.log("Checking AHSP prices > 1,000,000...");
  
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'erp_manufacturing'
  });

  try {
    const [highValueAHSPs] = await connection.execute(`
      SELECT id, kode, name, harga_satuan 
      FROM ahsp_headers 
      WHERE harga_satuan > 1000000 
      ORDER BY harga_satuan DESC 
      LIMIT 10
    `);

    const fs = require('fs');
    let output = '';

    output += `High Value AHSPs Found: ${highValueAHSPs.length}\n`;
    highValueAHSPs.forEach(h => {
        output += `ID: ${h.id} | Code: ${h.kode} | Price: ${h.harga_satuan} | Name: ${h.name}\n`;
    });

    if (highValueAHSPs.length > 0) {
      const firstId = highValueAHSPs[0].id;
      output += `\nChecking items for AHSP ID ${firstId}...\n`;
      const [items] = await connection.execute(`
        SELECT resource_type, resource_name, koefisien, resource_harga, jumlah_harga 
        FROM ahsp_items WHERE ahsp_id = ?
      `, [firstId]);
      
      output += JSON.stringify(items, null, 2);
    } else {
        output += "No high value AHSPs found.";
    }

    fs.writeFileSync('ahsp_analysis.txt', output);
    console.log("Analysis written to ahsp_analysis.txt");
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkPrices();
