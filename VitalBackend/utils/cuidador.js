/**
 * Reglas del vínculo cuidador (RN05) y cálculo de racha de días activos.
 */
const crypto = require('crypto');

// Vigencia del código de invitación que el adulto mayor comparte con su cuidador
const HORAS_VIGENCIA_CODIGO = 24;

function generarCodigo() {
    return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

// Transiciones permitidas del vínculo según quién actúa
const TRANSICIONES = {
    usar_codigo: { desde: ['invitacion'], hacia: 'pendiente', actor: 'cuidador' },
    autorizar:   { desde: ['pendiente'],  hacia: 'autorizado', actor: 'adulto' },
    rechazar:    { desde: ['pendiente'],  hacia: 'rechazado',  actor: 'adulto' },
    revocar:     { desde: ['pendiente', 'autorizado'], hacia: 'revocado', actor: 'adulto' },
};

/**
 * Comprueba si una acción es válida sobre un vínculo.
 * vinculo: { id_adulto, id_cuidador, estado, codigo_expira }
 */
function validarTransicion(accion, vinculo, idUsuario, ahora = new Date()) {
    const t = TRANSICIONES[accion];
    if (!t) return { ok: false, mensaje: 'Acción no válida' };
    if (!vinculo) return { ok: false, mensaje: 'Vínculo no encontrado' };
    if (!t.desde.includes(vinculo.estado)) {
        return { ok: false, mensaje: `No se puede ${accion.replace('_', ' ')} un vínculo en estado "${vinculo.estado}"` };
    }
    if (t.actor === 'adulto' && vinculo.id_adulto !== idUsuario) {
        return { ok: false, mensaje: 'Solo el adulto mayor puede decidir sobre este vínculo' };
    }
    if (accion === 'usar_codigo') {
        if (vinculo.id_adulto === idUsuario) return { ok: false, mensaje: 'No puedes ser tu propio cuidador' };
        if (new Date(vinculo.codigo_expira) < ahora) return { ok: false, mensaje: 'El código ya venció. Pide uno nuevo.' };
    }
    return { ok: true, nuevoEstado: t.hacia };
}

// RN05: el cuidador solo accede si el vínculo con ese adulto está autorizado
function puedeVerAdulto(vinculo, idCuidador) {
    return !!vinculo && vinculo.estado === 'autorizado' && vinculo.id_cuidador === idCuidador;
}

/**
 * Días consecutivos con al menos una sesión completada, contando desde hoy
 * (o desde ayer si hoy todavía no hay sesión). dias: fechas 'AAAA-MM-DD'.
 */
function calcularRacha(dias, hoy = new Date()) {
    const conjunto = new Set(dias);
    const fmt = d => d.toISOString().slice(0, 10);
    const cursor = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    if (!conjunto.has(fmt(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let racha = 0;
    while (conjunto.has(fmt(cursor))) {
        racha++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return racha;
}

module.exports = { HORAS_VIGENCIA_CODIGO, generarCodigo, validarTransicion, puedeVerAdulto, calcularRacha };
