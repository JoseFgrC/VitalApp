// Tamaño de letra elegido por la persona en Perfil (RNF de accesibilidad, WCAG 1.4.4).
//
// En la web se amplía toda la interfaz de forma proporcional (como el zoom del navegador):
// crecen letras, botones y áreas táctiles, y el diseño se reacomoda al nuevo ancho.
// En el teléfono se respeta además el tamaño de letra del sistema, que React Native aplica solo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type TamanoLetra = 'normal' | 'grande' | 'muy_grande';

export const OPCIONES_TAMANO: { clave: TamanoLetra; nombre: string; factor: number }[] = [
    { clave: 'normal', nombre: 'Normal', factor: 1 },
    { clave: 'grande', nombre: 'Grande', factor: 1.15 },
    { clave: 'muy_grande', nombre: 'Muy grande', factor: 1.3 },
];

const CLAVE = 'tamanoLetra';

const factorDe = (clave: string | null) =>
    OPCIONES_TAMANO.find(o => o.clave === clave)?.factor ?? 1;

// WCAG 1.4.10 (reflujo): el contenido debe funcionar a 320 px de ancho. La ampliación se limita
// para que el ancho útil nunca baje de ese valor; en pantallas anchas se aplica completa.
const ANCHO_MINIMO_UTIL = 320;
let claveActual: string | null = null;
let factorAplicado = 1;

// Factor realmente aplicado (lo usa la barra inferior para calcular su letra)
export const factorTamanoLetra = () => factorAplicado;

export function aplicarTamanoLetra(clave: string | null) {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;
    claveActual = clave;
    const limite = Math.max(1, window.innerWidth / ANCHO_MINIMO_UTIL);
    const factor = Math.min(factorDe(clave), limite);
    // Nada que hacer si ya está aplicado el mismo factor
    const zoomActual = document.documentElement.style.getPropertyValue('zoom');
    const yaAplicado = factor === 1 ? zoomActual === '' : zoomActual === factor.toFixed(3);
    if (factor === factorAplicado && yaAplicado) return;
    factorAplicado = factor;
    // zoom sobre el elemento raíz: todo el contenido escala y el ancho disponible se recalcula
    (document.documentElement.style as any).zoom = factor === 1 ? '' : factor.toFixed(3);
    window.dispatchEvent(new Event('tamanoLetra'));
}

// Al girar el teléfono o cambiar el tamaño de la ventana se recalcula el límite
if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('resize', () => aplicarTamanoLetra(claveActual));
}

export async function leerTamanoLetra(): Promise<TamanoLetra> {
    try {
        const v = await AsyncStorage.getItem(CLAVE);
        return (OPCIONES_TAMANO.some(o => o.clave === v) ? v : 'normal') as TamanoLetra;
    } catch {
        return 'normal';
    }
}

export async function guardarTamanoLetra(clave: TamanoLetra) {
    aplicarTamanoLetra(clave);
    try { await AsyncStorage.setItem(CLAVE, clave); } catch { /* sin almacenamiento: solo para esta sesión */ }
}
