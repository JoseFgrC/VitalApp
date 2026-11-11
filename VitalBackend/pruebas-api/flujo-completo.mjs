// Prueba de integración del flujo completo contra un backend en ejecución (E08).
// Crea sus propias cuentas y al final las elimina con DELETE /api/mis-datos.
//
// Uso (con el servidor corriendo):
//   node pruebas-api/flujo-completo.mjs                 → http://localhost:3000
//   API=http://localhost:3999 node pruebas-api/flujo-completo.mjs
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE = (process.env.API || 'http://localhost:3000') + '/api';
const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const HMAC = /^HMAC_SECRET=(.*)$/m.exec(envFile)[1].trim();

let csrf = null;
let fallos = 0;

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
        const inicio = performance.now();
        const r = await fetch(BASE + path, { method, headers, body: payload });
        // Las rutas inexistentes responden con HTML (404 de Express), no con JSON
        const texto = await r.text();
        let data = {};
        try { data = JSON.parse(texto); } catch { /* respuesta no JSON */ }
        return { status: r.status, data, ms: performance.now() - inicio };
    };
    return c;
}

const ok = (cond, msg) => {
    console.log(`${cond ? 'OK   ' : 'FALLA'} ${msg}`);
    if (!cond) fallos++;
};

async function crearCuenta(c, nombre, rol) {
    const email = `prueba_${rol}_${Date.now()}@vitalapp.test`;
    await c.call('POST', '/register', { nombre, email, password_hash: 'Clave123!', fecha_nacimiento: '1950-05-10', peso: 70, rol });
    const r = await c.call('POST', '/login', { email, password_hash: 'Clave123!' });
    c.token = r.data.token;
    return r.data.user;
}

const adulto = cliente();
const cuidador = cliente();
const intruso = cliente();
const tiempos = [];

try {
    // ── I1/I2: consentimiento, valoración y nivel ──────────────────────────────
    const ua = await crearCuenta(adulto, 'Adulta Prueba', 'usuario');
    ok(ua && ua.rol === 'usuario', 'registro y login del adulto mayor');

    let r = await adulto.call('POST', '/valoracion/tamizaje', { respuestas: {} });
    ok(r.status === 400 || r.status === 403, 'RN01: no se capturan datos de salud sin consentimiento');
    r = await adulto.call('POST', '/consentimiento', { acepta: true });
    ok(r.data.success, 'consentimiento registrado');

    r = await adulto.call('POST', '/valoracion/tamizaje', {
        respuestas: { indicacion_medica: false, dolor_pecho: false, caida_ultimo_anio: true, usa_apoyo: false, dolor_limita: false, mareos: false, miedo_caer: false }
    });
    ok(r.data.nivel === 2, `RN02: tamizaje con 1 factor y sin Berg → nivel 2 (obtenido ${r.data.nivel})`);
    r = await adulto.call('POST', '/valoracion/berg', { puntaje: 70, aplicador: 'Lic. Fisio' });
    ok(r.status === 400, 'RN04: Berg fuera de 0–56 rechazada');
    r = await adulto.call('POST', '/valoracion/berg', { puntaje: 18, aplicador: 'Lic. Fisio' });
    ok(r.data.nivel === 1, `RN02: Berg 18 → nivel 1 (obtenido ${r.data.nivel})`);

    r = await adulto.call('POST', '/ejercicio-realizado', { nombre_ejercicio: 'Respiración', duracion_segundos: 300, nivel_esfuerzo: 4, completado: 1 });
    ok(r.data.success, 'sesión completada con esfuerzo percibido');
    r = await adulto.call('POST', '/ejercicio-realizado', { nombre_ejercicio: 'Marcha', duracion_segundos: 30, completado: 0, comentarios: 'Detenida por señal de alarma' });
    ok(r.data.success, 'sesión detenida por señal de alarma');
    r = await adulto.call('GET', '/progreso');
    ok(r.data.totales.completadas === 1 && r.data.racha === 1 && r.data.ultima_alarma, 'progreso: 1 completada, racha 1 y alarma registrada');
    tiempos.push(r.ms);

    // ── Perfil: actualización parcial y condiciones de salud ─────────────────
    r = await adulto.call('PUT', `/user/${ua.id_usuario}`, { condiciones_medicas: 'Artritis, Diabetes' });
    ok(r.data.success, 'se guardan las enfermedades sin reenviar todo el perfil');
    r = await adulto.call('PUT', `/user/${ua.id_usuario}`, { nombre: 'Adulta Editada', peso: 68 });
    r = await adulto.call('GET', `/user/${ua.id_usuario}`);
    ok(r.data.user.condiciones_medicas === 'Artritis, Diabetes' && r.data.user.nombre === 'Adulta Editada' && Number(r.data.user.peso) === 68,
        'editar nombre y peso no borra las condiciones médicas');
    await crearCuenta(intruso, 'Otro Cuidador', 'cuidador');
    r = await intruso.call('GET', `/user/${ua.id_usuario}`);
    ok(r.status === 403, 'nadie más puede leer el perfil (datos de salud)');
    r = await intruso.call('PUT', `/user/${ua.id_usuario}`, { nombre: 'Hackeado' });
    ok(r.status === 403, 'nadie más puede modificar el perfil');

    // ── I3: recordatorios ─────────────────────────────────────────────────────
    r = await adulto.call('PUT', '/recordatorios', { recordatorios: [{ hora: '25:00', dias: ['L'], label: 'X', activo: true }] });
    ok(r.status === 400, 'recordatorio con hora inválida rechazado');
    r = await adulto.call('PUT', '/recordatorios', { recordatorios: [{ hora: '09:30', dias: ['L', 'X', 'V'], label: 'Rutina matutina', activo: true }] });
    ok(r.data.success, 'recordatorios guardados');
    r = await adulto.call('GET', '/recordatorios');
    ok(r.data.recordatorios.length === 1 && r.data.recordatorios[0].hora === '09:30', 'recordatorios leídos de la BD');

    // ── I3: cuidador vinculado (RN05) ─────────────────────────────────────────
    await crearCuenta(cuidador, 'Hijo Cuidador', 'cuidador');

    r = await cuidador.call('POST', '/cuidadores/codigo', {});
    ok(r.status === 403, 'un cuidador no puede generar códigos de invitación');
    r = await adulto.call('POST', '/cuidadores/codigo', {});
    const codigo = r.data.codigo;
    ok(/^\d{6}$/.test(codigo), 'el adulto mayor genera un código de 6 dígitos');

    r = await cuidador.call('POST', '/cuidador/vincular', { codigo: '000000' === codigo ? '111111' : '000000' });
    ok(r.status === 400, 'código incorrecto rechazado');
    r = await cuidador.call('POST', '/cuidador/vincular', { codigo });
    ok(r.data.success, 'el cuidador usa el código → solicitud pendiente');
    r = await intruso.call('POST', '/cuidador/vincular', { codigo });
    ok(r.status === 400, 'el mismo código no sirve dos veces');

    r = await cuidador.call('GET', `/cuidador/adultos/${ua.id_usuario}/progreso`);
    ok(r.status === 403, 'RN05: con la solicitud pendiente el cuidador no ve nada');

    r = await adulto.call('GET', '/cuidadores');
    const vinculo = r.data.vinculos.find(v => v.estado === 'pendiente');
    ok(vinculo && vinculo.nombre_cuidador === 'Hijo Cuidador', 'el adulto ve la solicitud pendiente');
    r = await cuidador.call('POST', `/cuidadores/${vinculo.id_vinculo}/autorizar`, { autorizar: true });
    ok(r.status === 403, 'el cuidador no puede autorizarse a sí mismo');
    r = await adulto.call('POST', `/cuidadores/${vinculo.id_vinculo}/autorizar`, { autorizar: true });
    ok(r.data.estado === 'autorizado', 'el adulto autoriza al cuidador');

    r = await cuidador.call('GET', `/cuidador/adultos/${ua.id_usuario}/progreso`);
    ok(r.data.success && r.data.totales.completadas === 1 && r.data.sesiones.length === 2, 'RN05: el cuidador autorizado ve el progreso');
    tiempos.push(r.ms);
    r = await intruso.call('GET', `/cuidador/adultos/${ua.id_usuario}/progreso`);
    ok(r.status === 403, 'RN05: otro cuidador sin vínculo no ve nada');

    r = await adulto.call('POST', `/cuidadores/${vinculo.id_vinculo}/revocar`, {});
    ok(r.data.estado === 'revocado', 'el adulto revoca el acceso');
    r = await cuidador.call('GET', `/cuidador/adultos/${ua.id_usuario}/progreso`);
    ok(r.status === 403, 'RN05: después de revocar el cuidador ya no ve nada');

    // ── RN05 / RD07: rutas antiguas con datos de salud eliminadas (IDOR) ──────
    // Antes cualquier sesión podía leer o escribir la evolución y los reportes de otro usuario.
    r = await intruso.call('GET', `/evolucion/${ua.id_usuario}`);
    ok(r.status === 404, `GET /api/evolucion/:id_usuario ya no existe (status ${r.status})`);
    r = await intruso.call('POST', '/evolucion', { id_usuario: ua.id_usuario, fecha_registro: '2026-01-01', peso: 99 });
    ok(r.status === 404, `POST /api/evolucion ya no existe (status ${r.status})`);
    r = await intruso.call('GET', `/reporte/${ua.id_usuario}`);
    ok(r.status === 404, `GET /api/reporte/:id_usuario ya no existe (status ${r.status})`);
    r = await intruso.call('GET', `/cuidador/adultos/${ua.id_usuario}/progreso`);
    ok(r.status === 403 && r.data.success === false, `RN05: un cuidador no autorizado recibe 403 al pedir el progreso de otro adulto (status ${r.status})`);

    // ── I3: derechos sobre los datos (RF15) ───────────────────────────────────
    r = await adulto.call('GET', '/mis-datos');
    ok(r.data.success && r.data.datos.valoraciones.length === 2 && r.data.datos.sesiones.length === 2, 'acceso: exportación de mis datos');
    tiempos.push(r.ms);
    r = await adulto.call('POST', '/consentimiento/revocar', {});
    ok(r.data.success, 'revocación del consentimiento');
    r = await adulto.call('GET', '/valoracion');
    ok(r.data.consentimiento === false && r.data.nivel === null && r.data.tamizaje === null, 'al revocar se borran valoraciones y nivel');

    // RNF04: tiempo de respuesta de la API < 2 s
    ok(Math.max(...tiempos) < 2000, `RNF04: respuesta máxima ${Math.round(Math.max(...tiempos))} ms (< 2000 ms)`);
} finally {
    // Cancelación: borra las cuentas de prueba y todos sus datos
    for (const c of [adulto, cuidador, intruso]) {
        if (!c.token) continue;
        const r = await c.call('DELETE', '/mis-datos', { confirmacion: 'ELIMINAR' });
        if (!r.data.success) { console.log('FALLA no se pudo eliminar una cuenta de prueba'); fallos++; }
    }
    console.log(fallos === 0 ? '\nTodas las comprobaciones pasaron' : `\n${fallos} comprobación(es) fallaron`);
    process.exitCode = fallos === 0 ? 0 : 1;
}
