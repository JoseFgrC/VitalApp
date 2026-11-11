// Textos en lenguaje sencillo que se repiten en varias pantallas (accesibilidad para adultos mayores).

export type Intensidad = 'baja' | 'media' | 'alta';

// Unifica las distintas formas en que llega la intensidad (BD: baja/media/alta;
// rutinas fijas: Baja/Media; reproductor: Fácil/Normal) en una sola palabra.
export function normalizarIntensidad(valor: string | null | undefined): Intensidad {
    const v = (valor || '').toString().trim().toLowerCase();
    if (['alta', 'difícil', 'dificil', 'intensa'].includes(v)) return 'alta';
    if (['media', 'normal', 'moderada', 'moderado', 'intermedia'].includes(v)) return 'media';
    return 'baja';
}

// "Intensidad: baja" — nunca la palabra suelta, que no se entiende fuera de contexto
export function textoIntensidad(valor: string | null | undefined): string {
    return `Intensidad: ${normalizarIntensidad(valor)}`;
}

// Colores de la etiqueta de intensidad con contraste ≥ 4.5:1 (WCAG 1.4.3) en tema claro y oscuro
const COLORES_INTENSIDAD: Record<Intensidad, { claro: { fondo: string; texto: string }; oscuro: { fondo: string; texto: string } }> = {
    baja:  { claro: { fondo: '#F0FDF4', texto: '#166534' }, oscuro: { fondo: '#14532D', texto: '#DCFCE7' } },
    media: { claro: { fondo: '#FEF9C3', texto: '#854D0E' }, oscuro: { fondo: '#713F12', texto: '#FEF9C3' } },
    alta:  { claro: { fondo: '#FEF2F2', texto: '#991B1B' }, oscuro: { fondo: '#7F1D1D', texto: '#FEE2E2' } },
};

export function colorIntensidad(valor: string | null | undefined, oscuro = false) {
    const c = COLORES_INTENSIDAD[normalizarIntensidad(valor)];
    return oscuro ? c.oscuro : c.claro;
}

// "Dura 5 minutos" a partir de segundos
export function textoDuracion(segundos: number): string {
    const minutos = Math.round((Number(segundos) || 0) / 60);
    if (minutos < 1) return 'Dura menos de 1 minuto';
    return `Dura ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}
