const jwt = require('jsonwebtoken');
require('dotenv').config({ path: __dirname + '/.env' });
const token = jwt.sign({userId:1, userLevel:10}, process.env.JWT_SECRET);
console.log('TOKEN:', token);

const http = require('http');
const options = {
  hostname: '127.0.0.1',
  port: 3002,
  path: '/api/bom/1/approve',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data);
  });
});
req.on('error', e => console.error('ERROR:', e.message));
req.end();
