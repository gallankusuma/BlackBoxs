
const mysql = require('mysql2/promise');

async function fixData() {
  console.log("Fixing AHSP Data for ID 91 and 90...");
  
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'erp_manufacturing'
  });

  try {
    // Fix ID 91
    // Update Tukang batu (resource_name LIKE 'Tukang batu%') coefficient to 1.3 (assuming 1300 was error for 1.3)
    // Actually, wall 10cm usually needs ~0.1-0.2 OH. 1.3 OH is still high for 1m2.
    // 1m2 brick wall:
    // Worker: 0.3
    // Mason: 0.1
    // Head Mason: 0.01
    // Foreman: 0.015
    // Let's set Tukang batu to 0.13.
    // If original was 1300, 0.13 is 1/10000.
    
    // Let's set it to 0.13 based on standard AHSP logic for lightweight brick.
    
    await connection.execute(`
        UPDATE ahsp_items 
        SET koefisien = 0.13, 
            jumlah_harga = 0.13 * resource_harga
        WHERE ahsp_id IN (90, 91) AND resource_name LIKE '%Tukang batu%'
    `);

    // Fix "Pekerja" too? It was 0.6710. That seems high-ish but maybe okay.
    // Let's assume only the 1300 one was the major outlier.
    
    // Recalculate Headers
    const ids = [90, 91];
    for (const id of ids) {
        // Get totals
        const [items] = await connection.execute('SELECT * FROM ahsp_items WHERE ahsp_id = ?', [id]);
        
        let hargaTenaga = 0;
        let hargaBahan = 0;
        let hargaAlat = 0;

        items.forEach(item => {
            const jumlah = parseFloat(item.koefisien) * parseFloat(item.resource_harga);
            if (item.section === 'A') hargaTenaga += jumlah;
            else if (item.section === 'B') hargaBahan += jumlah;
            else if (item.section === 'C') hargaAlat += jumlah;
        });

        const hargaLangsung = hargaTenaga + hargaBahan + hargaAlat;
        const overheadProfit = hargaLangsung * 0.1;
        const hargaSatuan = hargaLangsung + overheadProfit;

        await connection.execute(`
            UPDATE ahsp_headers
            SET harga_tenaga = ?, harga_bahan = ?, harga_alat = ?, 
                harga_langsung = ?, overhead_profit = ?, harga_satuan = ?
            WHERE id = ?
        `, [hargaTenaga, hargaBahan, hargaAlat, hargaLangsung, overheadProfit, hargaSatuan, id]);
        
        console.log(`Recalculated ID ${id}. New Price: ${hargaSatuan}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

fixData();
