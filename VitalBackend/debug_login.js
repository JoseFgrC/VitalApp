const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

// ¿Cómo manda la contraseña el frontend?
// Esta función prueba todas las variantes posibles
async function debugLogin() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vitalapp'
  });

  const EMAIL = 'admin@gmail.com';
  const PASSWORD_PLANO = 'Admin12345';

  const [rows] = await conn.query(
    'SELECT id_usuario, email, password_hash, rol, cuenta_activa FROM usuarios WHERE email = ?',
    [EMAIL]
  );

  if (rows.length === 0) {
    console.log(`❌ No existe ningún usuario con email: ${EMAIL}`);
    await conn.end();
    return;
  }

  const u = rows[0];
  console.log(`✅ Usuario encontrado:`);
  console.log(`   ID: ${u.id_usuario} | Rol: ${u.rol} | Activo: ${u.cuenta_activa}`);
  console.log(`   Hash guardado: ${u.password_hash}\n`);

  // Variantes que el frontend podría enviar como "password_hash"
  const variantes = [
    { label: 'Texto plano',          valor: PASSWORD_PLANO },
    { label: 'SHA-256',              valor: crypto.createHash('sha256').update(PASSWORD_PLANO).digest('hex') },
    { label: 'SHA-256 uppercase',    valor: crypto.createHash('sha256').update(PASSWORD_PLANO).digest('hex').toUpperCase() },
    { label: 'MD5',                  valor: crypto.createHash('md5').update(PASSWORD_PLANO).digest('hex') },
    { label: 'SHA-1',                valor: crypto.createHash('sha1').update(PASSWORD_PLANO).digest('hex') },
  ];

  const hashGuardado = u.password_hash.replace(/^\$2y\$/, '$2b$');

  console.log('=== PROBANDO VARIANTES DE CONTRASEÑA ===\n');
  for (const v of variantes) {
    try {
      const ok = await bcrypt.compare(v.valor, hashGuardado);
      console.log(`${ok ? '✅ MATCH' : '❌ no match'} → ${v.label}: ${v.valor.substring(0, 30)}...`);
      if (ok) {
        console.log(`\n🎯 EL FRONTEND ENVÍA LA CONTRASEÑA COMO: ${v.label}`);
      }
    } catch(e) {
      console.log(`⚠️  Error con ${v.label}: ${e.message}`);
    }
  }

  await conn.end();
}

debugLogin().catch(e => console.error('ERROR:', e.message));
