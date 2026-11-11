// Crea una cuenta de administrador sin pasar por el registro público.
// El registro de la app nunca asigna el rol admin; este script es la única vía.
//
// Uso (desde VitalBackend/):
//   node scripts/crear-admin.js <email> "<contraseña>" ["Nombre"]
//
// Si el correo ya existe, la cuenta se convierte en admin y se le pone la contraseña indicada.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const [email, password, nombre = 'Administrador'] = process.argv.slice(2);

async function main() {
    if (!email || !password) {
        console.log('Uso: node scripts/crear-admin.js <email> "<contraseña>" ["Nombre"]');
        process.exit(1);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error('❌ El correo no es válido.');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('❌ La contraseña del administrador debe tener al menos 8 caracteres.');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    const [existentes] = await pool.query('SELECT id_usuario, rol FROM usuarios WHERE email = ?', [email]);

    if (existentes.length > 0) {
        await pool.query(
            "UPDATE usuarios SET rol = 'admin', password_hash = ?, cuenta_activa = TRUE WHERE id_usuario = ?",
            [hash, existentes[0].id_usuario]
        );
        console.log(`✅ La cuenta ${email} (antes "${existentes[0].rol}") ahora es admin y tiene la contraseña nueva.`);
    } else {
        // fecha_nacimiento es obligatoria en la tabla; el admin no la usa para nada
        await pool.query(
            "INSERT INTO usuarios (nombre, email, password_hash, fecha_nacimiento, rol) VALUES (?, ?, ?, '1970-01-01', 'admin')",
            [nombre, email, hash]
        );
        console.log(`✅ Administrador creado: ${email}`);
    }
    console.log('   Inicia sesión en la app con ese correo y contraseña; te llevará a /admin.');
}

main()
    .catch(err => {
        console.error('❌ Error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
