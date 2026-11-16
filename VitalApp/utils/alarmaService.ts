import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { fetchSeguro } from './api';

export interface RecordatorioItem {
    id: number;
    hora: string;
    activo: boolean;
    dias: string[];
    label: string;
}

const CLAVE_VOLUMEN = 'alarma_volumen';

// ── Control de volumen persistente (0.1 a 1.0) ────────────────────────────────
export async function obtenerVolumenAlarma(): Promise<number> {
    try {
        const guardado = await AsyncStorage.getItem(CLAVE_VOLUMEN);
        if (guardado !== null) {
            const num = parseFloat(guardado);
            if (!isNaN(num) && num >= 0 && num <= 1) return num;
        }
    } catch (e) {}
    return 0.8; // 80% por defecto
}

export async function guardarVolumenAlarma(vol: number): Promise<void> {
    try {
        const normalizado = Math.max(0.1, Math.min(1.0, vol));
        await AsyncStorage.setItem(CLAVE_VOLUMEN, normalizado.toString());
    } catch (e) {}
}

// ── Reproducción de sonido de campana suave (Web Audio API) ──────────────────
export async function reproducirCampanaAlarma(volumenPersonalizado?: number) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
            const vol = volumenPersonalizado !== undefined ? volumenPersonalizado : await obtenerVolumenAlarma();
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();

            const notas = [523.25, 659.25, 783.99, 1046.5];
            notas.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);

                const gananciaPico = 0.35 * Math.max(0.05, vol);
                gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.18);
                gain.gain.exponentialRampToValueAtTime(gananciaPico, ctx.currentTime + idx * 0.18 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.18 + 1.2);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + idx * 0.18);
                osc.stop(ctx.currentTime + idx * 0.18 + 1.3);
            });
        } catch (e) {
            console.log('Error reproduciendo sonido web:', e);
        }
    }
}

// ── Voz cálida y comprensible para adulto mayor ───────────────────────────────
export async function pronunciarAvisoVoz(mensaje: string, volumenPersonalizado?: number) {
    try {
        const vol = volumenPersonalizado !== undefined ? volumenPersonalizado : await obtenerVolumenAlarma();
        Speech.stop();
        Speech.speak(mensaje, {
            language: 'es-MX',
            rate: 0.88,
            pitch: 1.05,
            volume: Math.max(0.1, Math.min(1.0, vol)),
        });
    } catch (e) {
        console.log('Error en síntesis de voz:', e);
    }
}

// ── Solicitar y comprobar permiso de notificaciones del sistema ───────────────
export async function solicitarPermisoNotificaciones(): Promise<boolean> {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
        try {
            if (Notification.permission === 'granted') return true;
            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            }
        } catch (e) {
            console.log('Error solicitando permisos de notificación:', e);
        }
    }
    return false;
}

export function estadoPermisoNotificaciones(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
        return Notification.permission;
    }
    return 'unsupported';
}

// ── Disparar notificación del sistema (escritorio / navegador) ────────────────
export function mostrarNotificacionSistema(titulo: string, cuerpo: string) {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
            try {
                const notif = new Notification(titulo, {
                    body: cuerpo,
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    tag: 'vitalapp-recordatorio',
                });
                notif.onclick = () => {
                    window.focus();
                };
            } catch (e) {
                console.log('Error mostrando notificación nativa:', e);
            }
        }
    }
}

// ── Formateo y normalización de hora 12h / 24h ───────────────────────────────
export function normalizarHora24(hora: string): string {
    if (!hora) return '00:00';
    const partes = hora.trim().split(':');
    if (partes.length < 2) return hora;
    const h = partes[0].padStart(2, '0');
    const m = partes[1].padStart(2, '0');
    return `${h}:${m}`;
}

export function formatearHora12(hora: string): { hora12: string; periodo: 'AM' | 'PM'; etiquetaCompleta: string; hora24: string } {
    const normal = normalizarHora24(hora);
    const [hStr, mStr] = normal.split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) h = 0;
    const m = mStr || '00';
    const periodo: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    const hora12Str = String(h12).padStart(2, '0') + ':' + m;
    return {
        hora12: hora12Str,
        periodo,
        etiquetaCompleta: `${hora12Str} ${periodo}`,
        hora24: normal,
    };
}

// ── Obtener lista actual de recordatorios (desde BD o AsyncStorage) ───────────
export async function obtenerRecordatoriosLocales(): Promise<RecordatorioItem[]> {
    try {
        const guardados = await AsyncStorage.getItem('recordatorios');
        if (guardados) {
            const parseados = JSON.parse(guardados);
            if (Array.isArray(parseados) && parseados.length > 0) {
                return parseados.map(r => ({
                    ...r,
                    hora: normalizarHora24(r.hora),
                }));
            }
        }
    } catch (e) {}

    try {
        const res = await fetchSeguro(`${API_URL}/recordatorios`);
        const data = await res.json();
        if (data.success && Array.isArray(data.recordatorios)) {
            const limpios = data.recordatorios.map((r: any) => ({
                ...r,
                hora: normalizarHora24(r.hora),
            }));
            await AsyncStorage.setItem('recordatorios', JSON.stringify(limpios));
            return limpios;
        }
    } catch (e) {}

    return [];
}
