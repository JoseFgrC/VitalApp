const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'Admin12345';

async function fixAdmin() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vitalapp'
  });

  console.log(' Conectado a la base de datos...\n');

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // 1. Asegurar cuenta admin@gmail.com
  const [rows] = await conn.query(
    'SELECT id_usuario, nombre, email, cuenta_activa, rol FROM usuarios WHERE email = ?',
    [ADMIN_EMAIL]
  );

  if (rows.length === 0) {
    console.log(` Creando cuenta administradora "${ADMIN_EMAIL}"...`);
    await conn.query(
      `INSERT INTO usuarios (nombre, email, password_hash, fecha_nacimiento, peso, rol, cuenta_activa, mfa_enabled)
       VALUES ('Administrador', ?, ?, '1990-01-01', 70, 'admin', 1, 0)`,
      [ADMIN_EMAIL, hash]
    );
    console.log(' Cuenta admin creada exitosamente.');
  } else {
    await conn.query(
      "UPDATE usuarios SET rol = 'admin', cuenta_activa = 1, mfa_enabled = 0, password_hash = ? WHERE id_usuario = ?",
      [hash, rows[0].id_usuario]
    );
    console.log(` Cuenta "${ADMIN_EMAIL}" actualizada a rol admin y password configurada.`);
  }

  // 2. También dar rol de admin a la cuenta de Lenin para que pueda entrar directo
  const [leninRows] = await conn.query(
    "UPDATE usuarios SET rol = 'admin' WHERE LOWER(nombre) LIKE '%lenin%' OR LOWER(email) LIKE '%lenin%'"
  );
  if (leninRows.affectedRows > 0) {
    console.log(` Usuario Lenin también fue promovido a rol 'admin'.`);
  }

  // 3. Mostrar lista de usuarios
  console.log('\n--- USUARIOS ACTUALES ---');
  const [todos] = await conn.query('SELECT id_usuario, nombre, email, rol, cuenta_activa FROM usuarios');
  console.table(todos);

  await conn.end();
  console.log('\n Listo. Ya puedes reiniciar el backend con "node server.js".');
}

fixAdmin().catch(e => console.error('ERROR:', e.message));
