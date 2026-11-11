// Pruebas unitarias de las reglas de nivel (RN02, RN04). Ejecutar con: npm test
const test = require('node:test');
const assert = require('node:assert');
const { validarTamizaje, validarBerg, calcularNivel } = require('../utils/nivel');

const SIN_RIESGO = {
    indicacion_medica: false, dolor_pecho: false,
    caida_ultimo_anio: false, usa_apoyo: false, dolor_limita: false, mareos: false, miedo_caer: false,
};

test('RN04: Berg fuera de 0–56 se rechaza', () => {
    assert.strictEqual(validarBerg(-1, 'Dra. López').ok, false);
    assert.strictEqual(validarBerg(57, 'Dra. López').ok, false);
    assert.strictEqual(validarBerg(30.5, 'Dra. López').ok, false);
});

test('RN04: Berg sin aplicador identificado se rechaza', () => {
    assert.strictEqual(validarBerg(40, '').ok, false);
    assert.strictEqual(validarBerg(40, undefined).ok, false);
});

test('RN04: Berg válido se acepta en los límites', () => {
    assert.strictEqual(validarBerg(0, 'Dra. López').ok, true);
    assert.strictEqual(validarBerg(56, 'Dra. López').ok, true);
});

test('Tamizaje incompleto se rechaza', () => {
    const { mareos, ...incompleto } = SIN_RIESGO;
    assert.strictEqual(validarTamizaje(incompleto).ok, false);
    assert.strictEqual(validarTamizaje(null).ok, false);
});

test('RN02: sin tamizaje no hay nivel', () => {
    assert.strictEqual(calcularNivel({ tamizaje: null, berg: 50 }).nivel, null);
});

test('RN02: criterio de exclusión da nivel 0 aunque Berg sea alto', () => {
    assert.strictEqual(calcularNivel({ tamizaje: { ...SIN_RIESGO, dolor_pecho: true }, berg: 56 }).nivel, 0);
    assert.strictEqual(calcularNivel({ tamizaje: { ...SIN_RIESGO, indicacion_medica: true }, berg: null }).nivel, 0);
});

test('RN02: sin Berg el nivel nunca pasa de 2', () => {
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: null }).nivel, 2);
});

test('RN02: factores de riesgo bajan el nivel del tamizaje', () => {
    const dos = { ...SIN_RIESGO, caida_ultimo_anio: true, miedo_caer: true };
    const tres = { ...dos, usa_apoyo: true };
    assert.strictEqual(calcularNivel({ tamizaje: dos, berg: 56 }).nivel, 2);
    assert.strictEqual(calcularNivel({ tamizaje: tres, berg: 56 }).nivel, 1);
});

test('RN02: rangos de Berg (0–20, 21–44, 45–56)', () => {
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: 20 }).nivel, 1);
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: 21 }).nivel, 2);
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: 44 }).nivel, 2);
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: 45 }).nivel, 3);
});

test('RN02: se toma el nivel más conservador entre tamizaje y Berg', () => {
    const unFactor = { ...SIN_RIESGO, mareos: true };
    assert.strictEqual(calcularNivel({ tamizaje: unFactor, berg: 56 }).nivel, 2);
    assert.strictEqual(calcularNivel({ tamizaje: SIN_RIESGO, berg: 10 }).nivel, 1);
});
