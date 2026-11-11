/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         VitalApp — fetchSeguro con HMAC SHA-256                  ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Envuelve el fetch nativo para añadir automáticamente la         ║
 * ║  cabecera X-Signature (HMAC-SHA256) a todas las peticiones       ║
 * ║  POST, PUT y DELETE, garantizando la integridad de los datos.    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_URL } from '../constants/config';

// Clave compartida con el backend (debe coincidir con HMAC_SECRET en .env)
const HMAC_SECRET = process.env.EXPO_PUBLIC_HMAC_SECRET || 'VitalApp_HMAC_K3y_S3cur@2024!xZ9qPm';

// ── Implementación pura de HMAC-SHA256 (sin librerías externas) ──────────────
// Usa la Web Crypto API disponible en React Native >= 0.74 y todos los navegadores modernos

async function hmacSha256(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── fetchSeguro ────────────────────────────────────────────────────────────────
/**
 * Reemplazo de fetch() que agrega automáticamente el header X-Signature
 * en métodos POST, PUT y DELETE para garantizar la integridad del payload.
 *
 * Uso idéntico al fetch nativo:
 *   const res = await fetchSeguro(`${API_URL}/login`, { method: 'POST', body: JSON.stringify({...}) });
 */
export async function fetchSeguro(url: string, options: RequestInit = {}): Promise<Response> {
    const metodo = (options.method || 'GET').toUpperCase();
    const necesitaFirma = ['POST', 'PUT', 'DELETE'].includes(metodo);

    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    // 1. Inyectar JWT
    try {
        const token = await AsyncStorage.getItem('jwtToken');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    } catch (e) {}

    // 2. CSRF & HMAC
    if (necesitaFirma) {
        // CSRF Token Check
        try {
            let csrf = await AsyncStorage.getItem('csrfToken');
            if (!csrf) {
                const csrfRes = await fetch(`${API_URL}/csrf-token`, {
                    credentials: 'include'
                });
                const csrfData = await csrfRes.json();
                if (csrfData.success) {
                    csrf = csrfData.csrfToken;
                    await AsyncStorage.setItem('csrfToken', csrf!);
                }
            }
            if (csrf) {
                headers['X-CSRF-Token'] = csrf;
            }
        } catch (e) {
            console.warn('⚠️ No se pudo obtener CSRF Token:', e);
        }

        const cuerpo = options.body as string || '{}';
        try {
            const firma = await hmacSha256(HMAC_SECRET, cuerpo);
            headers['X-Signature'] = firma;
        } catch (e) {
            console.warn('⚠️ No se pudo calcular firma HMAC:', e);
        }
    }

    const response = await fetch(url, {
        ...options,
        credentials: 'include', // Envía y recibe cookies en peticiones cross-origin
        headers,
    });
    
    if (response.status === 401 || response.status === 403) {
        try {
            const data = await response.clone().json();
            const mensaje = String(data.message || '');
            // Si da error de CSRF, lo limpiamos para forzar su renovación
            if (mensaje.includes('CSRF')) {
                await AsyncStorage.removeItem('csrfToken');
            }
            // Sin sesión o con la sesión vencida: se vuelve al inicio de sesión con un aviso claro
            if (mensaje.includes('Token JWT')) {
                await sesionTerminada();
            }
        } catch (e) {}
    }

    return response;
}

// ── Sesión terminada ───────────────────────────────────────────────────────────
// Pasa cuando se cierra sesión en otra pestaña (comparten el almacenamiento),
// cuando el token vence (7 días) o al volver con «Atrás» después de salir.
const CLAVES_SESION = ['jwtToken', 'csrfToken', 'userId', 'userName', 'userEmail', 'userAge', 'userRol', 'userConditions'];
let redirigiendo = false;

export async function sesionTerminada() {
    if (redirigiendo) return;   // varias peticiones pueden fallar a la vez: un solo aviso
    redirigiendo = true;
    try {
        await Promise.all(CLAVES_SESION.map(k => AsyncStorage.removeItem(k)));
        try { await AsyncStorage.setItem('avisoSesion', 'Tu sesión terminó. Inicia sesión de nuevo para continuar.'); } catch (e) {}
        router.replace('/login');
    } finally {
        setTimeout(() => { redirigiendo = false; }, 1500);
    }
}

// ── rutaInicial ────────────────────────────────────────────────────────────────
/**
 * Decide a qué pantalla llevar al usuario después de iniciar sesión:
 * sin consentimiento → aviso de privacidad (RN01); sin nivel → valoración; si no, inicio.
 */
export async function rutaInicial(rol: string): Promise<'/admin' | '/cuidador' | '/consentimiento' | '/valoracion' | '/home'> {
    if (rol === 'admin') return '/admin';
    if (rol === 'cuidador') return '/cuidador';
    try {
        const res = await fetchSeguro(`${API_URL}/valoracion`);
        const data = await res.json();
        if (data.success && !data.consentimiento) return '/consentimiento';
        if (data.success && data.nivel === null) return '/valoracion';
    } catch (e) {
        console.warn('⚠️ No se pudo consultar la valoración:', e);
    }
    return '/home';
}
