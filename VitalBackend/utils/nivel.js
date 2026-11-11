/**
 * Reglas de nivel funcional (RN02, RN04).
 *
 * Niveles:
 *   0 = no apto para ejercicio sin autorización médica (no se muestran rutinas)
 *   1 = riesgo alto   → solo ejercicios de nivel 1
 *   2 = riesgo medio  → ejercicios de nivel 1 y 2
 *   3 = riesgo bajo   → ejercicios de nivel 1 a 3
 *
 * Escala de Berg (0–56): 0–20 riesgo alto, 21–40 riesgo medio, 41–56 riesgo bajo;
 * una puntuación menor a 45 se asocia con mayor riesgo de caída, por lo que
 * 41–44 se trata como riesgo medio.
 */

// Factores de riesgo del tamizaje de autorreporte (RF tamizaje)
const FACTORES_RIESGO = [
    'caida_ultimo_anio',   // ¿Se ha caído en los últimos 12 meses?
    'usa_apoyo',           // ¿Usa bastón, andadera u otro apoyo para caminar?
    'dolor_limita',        // ¿Tiene dolor que le limita al moverse?
    'mareos',              // ¿Ha tenido mareos o desmayos recientes?
    'miedo_caer',          // ¿Le da miedo caerse al caminar o levantarse?
];

// Cualquier respuesta afirmativa aquí impide asignar rutinas
const CRITERIOS_EXCLUSION = [
    'indicacion_medica',   // ¿Su médico le indicó no hacer ejercicio?
    'dolor_pecho',         // ¿Siente dolor en el pecho al hacer esfuerzo?
];

const PREGUNTAS_TAMIZAJE = [...CRITERIOS_EXCLUSION, ...FACTORES_RIESGO];

// Sin Escala de Berg el nivel se asigna de forma conservadora: nunca mayor a 2
const NIVEL_MAXIMO_SIN_BERG = 2;

function validarTamizaje(respuestas) {
    if (!respuestas || typeof respuestas !== 'object') {
        return { ok: false, mensaje: 'Faltan las respuestas del tamizaje' };
    }
    for (const clave of PREGUNTAS_TAMIZAJE) {
        if (typeof respuestas[clave] !== 'boolean') {
            return { ok: false, mensaje: `Falta responder la pregunta: ${clave}` };
        }
    }
    return { ok: true };
}

// RN04: la puntuación de Berg solo se acepta en el rango 0–56 y con aplicador identificado
function validarBerg(puntaje, aplicador) {
    if (!Number.isInteger(puntaje) || puntaje < 0 || puntaje > 56) {
        return { ok: false, mensaje: 'La puntuación de Berg debe ser un número entero entre 0 y 56' };
    }
    if (typeof aplicador !== 'string' || aplicador.trim().length < 3) {
        return { ok: false, mensaje: 'Indica el nombre de quien aplicó la Escala de Berg' };
    }
    return { ok: true };
}

function nivelPorTamizaje(respuestas) {
    if (CRITERIOS_EXCLUSION.some(c => respuestas[c])) return 0;
    const factores = FACTORES_RIESGO.filter(f => respuestas[f]).length;
    if (factores === 0) return 3;
    if (factores <= 2) return 2;
    return 1;
}

function nivelPorBerg(puntaje) {
    if (puntaje <= 20) return 1;
    if (puntaje < 45) return 2;
    return 3;
}

// RN02: el nivel final es el más conservador entre tamizaje y Berg
function calcularNivel({ tamizaje, berg }) {
    if (!tamizaje) {
        return { nivel: null, mensaje: 'Responde el cuestionario de tamizaje para asignar tu nivel.' };
    }
    const nivelTamizaje = nivelPorTamizaje(tamizaje);
    if (nivelTamizaje === 0) {
        return {
            nivel: 0,
            mensaje: 'Por tus respuestas, consulta a tu médico antes de hacer ejercicio. No se mostrarán rutinas por ahora.'
        };
    }
    if (berg === null || berg === undefined) {
        return {
            nivel: Math.min(nivelTamizaje, NIVEL_MAXIMO_SIN_BERG),
            mensaje: 'Nivel asignado solo con el tamizaje (de forma conservadora). Registra la Escala de Berg para ajustarlo.'
        };
    }
    return {
        nivel: Math.min(nivelTamizaje, nivelPorBerg(berg)),
        mensaje: 'Nivel asignado con el tamizaje y la Escala de Berg.'
    };
}

module.exports = {
    PREGUNTAS_TAMIZAJE,
    validarTamizaje,
    validarBerg,
    calcularNivel,
};
