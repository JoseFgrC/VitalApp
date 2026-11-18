// Vasos de agua del día. No es dato de sesión ni preferencia general: se guarda en el
// dispositivo con AsyncStorage (localStorage en la web, compartido por las pestañas) con una clave por cuenta
// y por día, así cada cuenta lleva su propio contador, no se pierde al cerrar la pestaña y
// empieza en 0 cada día.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIJO = 'userHydration_';

// Fecha local AAAA-MM-DD (no UTC: el día cambia a la medianoche de la persona)
function hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const claveDelDia = (userId: string) => `${PREFIJO}${userId}_${hoy()}`;

// Borra los días anteriores de esta cuenta (y la clave antigua compartida, sin cuenta)
async function limpiarDiasAnteriores(userId: string) {
    try {
        const actual = claveDelDia(userId);
        const viejas = (await AsyncStorage.getAllKeys()).filter(
            (k) => (k.startsWith(`${PREFIJO}${userId}_`) && k !== actual) || k === 'userHydration');
        if (viejas.length) await AsyncStorage.removeMany(viejas);
    } catch { /* limpiar es opcional */ }
}

export async function leerHidratacion(userId: string | null): Promise<number> {
    if (!userId) return 0;
    limpiarDiasAnteriores(userId);
    try {
        return parseInt((await AsyncStorage.getItem(claveDelDia(userId))) || '0', 10) || 0;
    } catch {
        return 0;
    }
}

export async function guardarHidratacion(userId: string | null, vasos: number): Promise<void> {
    if (!userId) return;
    await AsyncStorage.setItem(claveDelDia(userId), String(vasos));
}
