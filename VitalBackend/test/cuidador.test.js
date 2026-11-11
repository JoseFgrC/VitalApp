// Pruebas unitarias del vínculo cuidador (RN05) y de la racha. Ejecutar con: npm test
const test = require('node:test');
const assert = require('node:assert');
const { generarCodigo, validarTransicion, puedeVerAdulto, calcularRacha } = require('../utils/cuidador');

const MANANA = new Date(Date.now() + 86400000);
const AYER = new Date(Date.now() - 86400000);
const invitacion = { id_adulto: 1, id_cuidador: null, estado: 'invitacion', codigo_expira: MANANA };

test('el código de invitación tiene 6 dígitos', () => {
    for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/);
});

test('el cuidador puede usar un código vigente', () => {
    const r = validarTransicion('usar_codigo', invitacion, 2);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nuevoEstado, 'pendiente');
});

test('un código vencido se rechaza', () => {
    assert.strictEqual(validarTransicion('usar_codigo', { ...invitacion, codigo_expira: AYER }, 2).ok, false);
});

test('nadie puede ser su propio cuidador', () => {
    assert.strictEqual(validarTransicion('usar_codigo', invitacion, 1).ok, false);
});

test('un código ya usado no se puede volver a usar', () => {
    assert.strictEqual(validarTransicion('usar_codigo', { ...invitacion, estado: 'pendiente', id_cuidador: 2 }, 3).ok, false);
});

test('solo el adulto mayor autoriza o rechaza', () => {
    const pendiente = { ...invitacion, estado: 'pendiente', id_cuidador: 2 };
    assert.strictEqual(validarTransicion('autorizar', pendiente, 2).ok, false);
    assert.strictEqual(validarTransicion('autorizar', pendiente, 1).nuevoEstado, 'autorizado');
    assert.strictEqual(validarTransicion('rechazar', pendiente, 1).nuevoEstado, 'rechazado');
});

test('el adulto mayor puede revocar un vínculo autorizado; uno revocado ya no cambia', () => {
    const autorizado = { ...invitacion, estado: 'autorizado', id_cuidador: 2 };
    assert.strictEqual(validarTransicion('revocar', autorizado, 1).nuevoEstado, 'revocado');
    assert.strictEqual(validarTransicion('autorizar', { ...autorizado, estado: 'revocado' }, 1).ok, false);
});

test('RN05: el cuidador solo ve al adulto con vínculo autorizado y propio', () => {
    const autorizado = { ...invitacion, estado: 'autorizado', id_cuidador: 2 };
    assert.strictEqual(puedeVerAdulto(autorizado, 2), true);
    assert.strictEqual(puedeVerAdulto(autorizado, 3), false);
    assert.strictEqual(puedeVerAdulto({ ...autorizado, estado: 'pendiente' }, 2), false);
    assert.strictEqual(puedeVerAdulto({ ...autorizado, estado: 'revocado' }, 2), false);
    assert.strictEqual(puedeVerAdulto(null, 2), false);
});

test('racha: días consecutivos hasta hoy o ayer', () => {
    const hoy = new Date(2026, 10, 9);
    assert.strictEqual(calcularRacha(['2026-11-09', '2026-11-08', '2026-11-07'], hoy), 3);
    assert.strictEqual(calcularRacha(['2026-11-08', '2026-11-07'], hoy), 2);
    assert.strictEqual(calcularRacha(['2026-11-09', '2026-11-07'], hoy), 1);
    assert.strictEqual(calcularRacha(['2026-11-06'], hoy), 0);
    assert.strictEqual(calcularRacha([], hoy), 0);
});
