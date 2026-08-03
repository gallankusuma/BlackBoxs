const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const rows = db.prepare('SELECT id, po_number, status, approval_status FROM purchase_orders').all();
console.log(JSON.stringify(rows, null, 2));
db.close();
