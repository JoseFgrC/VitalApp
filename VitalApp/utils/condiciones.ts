// Reglas compartidas para adaptar los ejercicios a las condiciones de salud del usuario.
// Las usan Inicio (recomendados y rutina del día) y el catálogo de Ejercicios, para que
// ambas pantallas apliquen exactamente el mismo criterio.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { fetchSeguro } from './api';

export const CONDICIONES = ['Diabetes', 'Hipertensión', 'Cáncer', 'Problemas de corazón', 'Artritis', 'Osteoporosis'] as const;

type Regla = {
    claves: string[];        // palabras con las que se reconoce la condición
    evitar: string[];        // categorías no recomendadas (se ocultan en recomendados)
    precaucion?: string[];   // categorías permitidas pero con aviso
    beneficia: string[];     // categorías que se priorizan en recomendados
    aviso: string;           // texto para ejercicios a evitar
    avisoPrecaucion?: string;
    motivo: string;          // texto corto para la tarjeta recomendada: "Ideal para ..."
};

// Criterio conservador: ante una condición cardiovascular, oncológica u ósea se evitan
// las categorías de mayor intensidad o impacto. No sustituye la indicación médica (RD06).
const REGLAS: Regla[] = [
    {
        claves: ['corazón', 'corazon', 'hipertensión', 'hipertension'],
        evitar: ['cardio', 'zumba', 'fuerza'],
        beneficia: ['respiración', 'relajación', 'movilidad'],
        aviso: 'No recomendado para tu condición cardíaca o hipertensión',
        motivo: 'Suave para tu corazón',
    },
    {
        claves: ['cáncer', 'cancer'],
        evitar: ['cardio', 'fuerza'],
        beneficia: ['relajación', 'respiración', 'flexibilidad'],
        aviso: 'No recomendado durante el tratamiento de cáncer; elige algo más suave',
        motivo: 'De baja exigencia',
    },
    {
        claves: ['artritis'],
        evitar: ['fuerza', 'zumba'],
        beneficia: ['movilidad', 'flexibilidad', 'silla'],
        aviso: 'Puede ser incómodo si tienes artritis; elige ejercicios suaves',
        motivo: 'Cuida tus articulaciones',
    },
    {
        claves: ['osteoporosis'],
        evitar: ['fuerza', 'cardio', 'zumba'],
        beneficia: ['equilibrio', 'movilidad'],
        aviso: 'Evita ejercicios de impacto si tienes osteoporosis',
        motivo: 'Previene caídas',
    },
    {
        claves: ['diabetes'],
        evitar: [],
        precaucion: ['cardio', 'zumba'],
        beneficia: ['movilidad', 'silla', 'equilibrio'],
        aviso: '',
        avisoPrecaucion: 'Hazlo con precaución y mantén un ritmo constante',
        motivo: 'Ritmo constante y seguro',
    },
];

const normalizar = (t: string) => (t || '').toString().trim().toLowerCase();

function reglasDe(condiciones: string[]): Regla[] {
    const lista = condiciones.map(normalizar);
    return REGLAS.filter(r => r.claves.some(c => lista.some(cond => cond.includes(c))));
}

// Evalúa un ejercicio según su categoría: si conviene evitarlo, si requiere precaución,
// y si es especialmente adecuado para alguna condición del usuario.
export function evaluarEjercicio(categoria: string, condiciones: string[]) {
    const cat = normalizar(categoria);
    let aviso = '';
    let evitar = false;
    let motivo = '';
    for (const r of reglasDe(condiciones)) {
        if (r.evitar.includes(cat)) { evitar = true; aviso = aviso || r.aviso; }
        else if (r.precaucion?.includes(cat)) { aviso = aviso || r.avisoPrecaucion || ''; }
        if (!motivo && r.beneficia.includes(cat)) motivo = r.motivo;
    }
    return { evitar, aviso, motivo: evitar ? '' : motivo };
}

// Las condiciones se guardan cifradas en la BD; la copia local solo se usa sin conexión
export async function cargarCondiciones(): Promise<string[]> {
    const deTexto = (t: string | null | undefined) =>
        (t || '').split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'ninguna');
    try {
        const id = await AsyncStorage.getItem('userId');
        if (id) {
            const res = await fetchSeguro(`${API_URL}/user/${id}`);
            const data = await res.json();
            if (data.success && data.user) {
                const lista = deTexto(data.user.condiciones_medicas);
                await AsyncStorage.setItem('userConditions', JSON.stringify(lista));
                return lista;
            }
        }
    } catch { /* sin conexión: se usa la copia local */ }
    try {
        const local = JSON.parse((await AsyncStorage.getItem('userConditions')) || '[]');
        return Array.isArray(local) ? local.filter((c: string) => normalizar(c) !== 'ninguna') : [];
    } catch {
        return [];
    }
}
