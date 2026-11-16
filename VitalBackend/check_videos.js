const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vitalapp'
  });

  const [[total]] = await conn.query('SELECT COUNT(*) as total FROM videos');
  console.log('\n=== TOTAL VIDEOS EN BD ===');
  console.log('Total registros:', total.total);

  const [[activos]] = await conn.query('SELECT COUNT(*) as total FROM videos WHERE activo = 1');
  console.log('\n=== VIDEOS ACTIVOS (activo=1) ===');
  console.log('Activos:', activos.total);

  const [[conFuente]] = await conn.query(
    "SELECT COUNT(*) as total FROM videos WHERE activo = 1 AND fuente_documental IS NOT NULL AND fuente_documental != ''"
  );
  console.log('\n=== ACTIVOS + CON FUENTE DOCUMENTAL (pasan RN06) ===');
  console.log('Con fuente:', conFuente.total);

  const [rows] = await conn.query(
    'SELECT id_video, nombre_video, activo, nivel_funcional, edad_minima, edad_maxima, peso_maximo_recomendado, fuente_documental FROM videos'
  );
  console.log('\n=== DETALLE DE TODOS LOS VIDEOS ===');
  rows.forEach(r => {
    const ok = r.activo && r.fuente_documental;
    console.log(`[${ok ? 'OK' : 'FALLA'}] ID:${r.id_video} | "${r.nombre_video}" | activo:${r.activo} | nivel:${r.nivel_funcional} | edad:${r.edad_minima}-${r.edad_maxima} | fuente:${r.fuente_documental || 'VACÍA'}`);
  });

  // Checar usuario de prueba
  const [usuarios] = await conn.query(
    'SELECT id_usuario, nombre, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, peso, nivel_funcional FROM usuarios WHERE cuenta_activa = 1 LIMIT 5'
  );
  console.log('\n=== USUARIOS ACTIVOS (primeros 5) ===');
  usuarios.forEach(u => {
    console.log(`ID:${u.id_usuario} | "${u.nombre}" | edad:${u.edad} | peso:${u.peso} | nivel_funcional:${u.nivel_funcional}`);
  });

  await conn.end();
}

check().catch(e => console.error('ERROR DB:', e.message));
