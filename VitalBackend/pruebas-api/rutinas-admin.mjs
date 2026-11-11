// Prueba de integración: administración de contenido (RF14, RN03, RN06) y rutinas del día.
// Crea un admin y un adulto mayor temporales y los borra al final, junto con lo que crea.
//
// Uso (con el servidor corriendo):
//   node pruebas-api/rutinas-admin.mjs
//   API=http://localhost:3999 node pruebas-api/rutinas-admin.mjs
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pool } = require('../db.js');
const bcrypt = require('bcryptjs');

const BASE = (process.env.API || 'http://localhost:3000') + '/api';
const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const HMAC = /^HMAC_SECRET=(.*)$/m.exec(envFile)[1].trim();
const SELLO = Date.now();

let csrf = null;
let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? 'OK   ' : 'FALLA'} ${msg}`);
    if (!cond) fallos++;
};

function cliente() {
    const c = { token: null };
    c.call = async (method, path, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (c.token) headers.Authorization = `Bearer ${c.token}`;
        let payload;
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
            payload = JSON.stringify(body ?? {});
            headers['X-Signature'] = crypto.createHmac('sha256', HMAC).update(payload).digest('hex');
            if (!csrf) csrf = (await (await fetch(`${BASE}/csrf-token`)).json()).csrfToken;
            headers['X-CSRF-Token'] = csrf;
        }
        const r = await fetch(BASE + path, { method, headers, body: payload });
        return { status: r.status, data: await r.json() };
    };
    c.entrar = async (email) => {
        const r = await c.call('POST', '/login', { email, password_hash: 'Clave123!' });
        c.token = r.data.token;
    };
    return c;
}

// Cuentas creadas directamente en la BD (el registro público no crea administradores)
async function crearCuenta(email, rol, nivel) {
    const hash = await bcrypt.hash('Clave123!', 10);
    const [r] = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, fecha_nacimiento, peso, rol, nivel_funcional)
         VALUES ('Prueba', ?, ?, '1950-01-01', 70, ?, ?)`, [email, hash, rol, nivel]);
    return r.insertId;
}

const admin = cliente();
const adulto = cliente();
const ids = { usuarios: [], videos: [], rutinas: [] };

try {
    const emailAdmin = `admin_${SELLO}@vitalapp.test`;
    const emailAdulto = `adulto_${SELLO}@vitalapp.test`;
    ids.usuarios.push(await crearCuenta(emailAdmin, 'admin', null));
    ids.usuarios.push(await crearCuenta(emailAdulto, 'usuario', 2));
    await admin.entrar(emailAdmin);
    await adulto.entrar(emailAdulto);

    // ── Solo el admin administra contenido ────────────────────────────────────
    let r = await adulto.call('GET', '/admin/videos');
    ok(r.status === 403, 'un usuario normal no puede ver la administración de videos');
    r = await adulto.call('POST', '/admin/videos', { nombre_video: 'Intruso', categoria: 'Cardio', dificultad: 'baja', duracion_min: 5, fuente_documental: 'x' });
    ok(r.status === 403, 'un usuario normal no puede crear videos');
    r = await adulto.call('GET', '/admin/usuarios');
    ok(r.status === 403, 'un usuario normal no puede ver la lista de usuarios');

    // ── Ejercicios: uno publicado y uno en borrador ───────────────────────────
    const base = { categoria: 'Equilibrio', dificultad: 'baja', duracion_min: 5, edad_minima: 60, edad_maxima: 100, link_video: 'https://youtu.be/abcdefghijk' };
    r = await admin.call('POST', '/admin/videos', { ...base, nombre_video: `Publicado ${SELLO}`, nivel_funcional: 1, fuente_documental: 'Programa Otago, 2003', activo: 1 });
    ok(r.data.success, 'el admin publica un ejercicio con fuente');
    ids.videos.push(r.data.id);
    r = await admin.call('POST', '/admin/videos', { ...base, nombre_video: `Borrador ${SELLO}`, nivel_funcional: 2, activo: 0 });
    ok(r.data.success, 'el admin guarda un borrador sin fuente');
    ids.videos.push(r.data.id);
    const [publicado, borrador] = ids.videos;

    r = await admin.call('GET', '/admin/videos');
    ok(r.data.videos.find(v => v.id_video === publicado)?.link_video === 'https://youtu.be/abcdefghijk', 'el link se guarda sin alterar');

    // ── Rutinas ───────────────────────────────────────────────────────────────
    const rutina = { titulo: `Rutina ${SELLO}`, categoria: 'Equilibrio', ejercicios: [publicado, borrador] };
    r = await admin.call('POST', '/admin/rutinas', { ...rutina, activo: 1 });
    ok(r.status === 400 && /publica estos ejercicios/.test(r.data.message), 'RN06: no se activa una rutina con ejercicios en borrador');
    r = await admin.call('POST', '/admin/rutinas', { ...rutina, activo: 0 });
    ok(r.data.success, 'la rutina se guarda como borrador');
    r = await admin.call('GET', '/admin/rutinas');
    const creada = r.data.rutinas.find(x => x.titulo === rutina.titulo);
    ids.rutinas.push(creada.id_rutina);
    ok(creada.nivel_funcional === 2 && creada.ejercicios.length === 2, 'RN03: el nivel de la rutina es el de su ejercicio más exigente (2)');

    r = await admin.call('PUT', `/admin/videos/${borrador}`, { ...base, nombre_video: `Borrador ${SELLO}`, nivel_funcional: 2, fuente_documental: 'Vivifrail, 2017', activo: 1 });
    ok(r.data.success, 'el admin revisa el borrador, le pone fuente y lo publica');
    r = await admin.call('PUT', `/admin/rutinas/${creada.id_rutina}`, { ...rutina, activo: 1 });
    ok(r.data.success, 'con todos sus ejercicios publicados, la rutina se activa');

    r = await adulto.call('GET', '/rutinas');
    let vista = r.data.rutinas.find(x => x.id_rutina === creada.id_rutina);
    ok(vista && vista.ejercicios.map(e => e.id_video).join() === `${publicado},${borrador}` && vista.ejercicios[0].fuente_documental,
        'el adulto mayor (nivel 2) ve la rutina con sus ejercicios en orden, video y fuente');

    await pool.query('UPDATE usuarios SET nivel_funcional = 1 WHERE id_usuario = ?', [ids.usuarios[1]]);
    r = await adulto.call('GET', '/rutinas');
    ok(!r.data.rutinas.some(x => x.id_rutina === creada.id_rutina), 'RN03: con nivel 1 ya no ve la rutina de nivel 2');
    await pool.query('UPDATE usuarios SET nivel_funcional = 2 WHERE id_usuario = ?', [ids.usuarios[1]]);

    r = await admin.call('PUT', `/admin/videos/${borrador}`, { ...base, nombre_video: `Borrador ${SELLO}`, nivel_funcional: 2, activo: 0 });
    r = await adulto.call('GET', '/rutinas');
    ok(!r.data.rutinas.some(x => x.id_rutina === creada.id_rutina), 'si un ejercicio se despublica, la rutina deja de mostrarse (nunca aparece incompleta)');

    r = await admin.call('DELETE', `/admin/rutinas/${creada.id_rutina}`);
    ok(r.data.success, 'el admin elimina la rutina');
} finally {
    if (ids.rutinas.length) await pool.query('DELETE FROM rutinas WHERE id_rutina IN (?)', [ids.rutinas]);
    if (ids.videos.length) await pool.query('DELETE FROM videos WHERE id_video IN (?)', [ids.videos.filter(Boolean)]);
    if (ids.usuarios.length) await pool.query('DELETE FROM usuarios WHERE id_usuario IN (?)', [ids.usuarios]);
    await pool.end();
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodas las comprobaciones pasaron');
process.exit(fallos ? 1 : 0);
