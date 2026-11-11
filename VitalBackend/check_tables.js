const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'vitalapp'
    });
    console.log('✅ Connection successful');
    const [rows] = await connection.query('SHOW TABLES');
    console.log('Tables:', rows);
    await connection.end();
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(error);
  }
}

test();
