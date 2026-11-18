// Almacenamiento de la SESIÓN (cuenta con la que se entró y datos de esa cuenta).
// En la web se usa sessionStorage: cada pestaña tiene su propia sesión, así se puede tener
// abierta una pestaña con el adulto mayor, otra con el cuidador y otra con el admin sin que
// se mezclen. En Android/iOS se sigue usando AsyncStorage (una sesión por dispositivo).
// Las preferencias del dispositivo (darkMode, tamanoLetra, notifications) NO van aquí:
// siguen en AsyncStorage (localStorage en la web, compartido por todas las pestañas).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Todas las claves de sesión: se borran al cerrar sesión, al vencer el token o al eliminar la cuenta
export const CLAVES_SESION = [
    'jwtToken', 'csrfToken',
    'userId', 'userRol', 'userName', 'userEmail', 'userAge', 'userWeight',
    'userConditions', 'recordatorios',
];

// sessionStorage solo existe en el navegador (no durante el renderizado estático de Expo)
function almacenWeb(): Storage | null {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    try { return window.sessionStorage; } catch { return null; }
}

export const sesion = {
    async getItem(clave: string): Promise<string | null> {
        const web = almacenWeb();
        return web ? web.getItem(clave) : AsyncStorage.getItem(clave);
    },
    async setItem(clave: string, valor: string): Promise<void> {
        const web = almacenWeb();
        if (web) web.setItem(clave, valor);
        else await AsyncStorage.setItem(clave, valor);
    },
    async removeItem(clave: string): Promise<void> {
        const web = almacenWeb();
        if (web) web.removeItem(clave);
        else await AsyncStorage.removeItem(clave);
    },
    async multiRemove(claves: string[]): Promise<void> {
        const web = almacenWeb();
        if (web) claves.forEach((c) => web.removeItem(c));
        else await AsyncStorage.removeMany(claves);
    },
};

// Cierra la sesión de ESTA pestaña (o del dispositivo, en el celular) sin tocar las preferencias
export const borrarSesion = () => sesion.multiRemove(CLAVES_SESION);
