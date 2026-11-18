// Metas de actividad compartidas por Inicio y Mi progreso (RF11, RF13).

// La OMS recomienda a las personas de 65 años o más actividad física multicomponente
// (equilibrio y fuerza) 3 o más días por semana.
export const META_DIAS_POR_DEFECTO = 3;

// Meta de días de la semana: los días distintos de los recordatorios activos del usuario;
// si no tiene recordatorios, la recomendación de la OMS.
export function metaDiasSemana(recordatorios: { activo: boolean; dias: string[] }[] | undefined): number {
    const dias = new Set<string>();
    (recordatorios || []).filter(r => r.activo).forEach(r => (r.dias || []).forEach(d => dias.add(d)));
    return dias.size > 0 ? dias.size : META_DIAS_POR_DEFECTO;
}

// Lunes 00:00 de la semana de la fecha dada
export function inicioDeSemana(fecha: Date): Date {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}
