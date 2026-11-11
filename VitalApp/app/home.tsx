import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  SafeAreaView, Alert, RefreshControl, StatusBar, Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome5, Entypo } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuInferior from '../components/MenuInferior';
import { useTheme } from '../hooks/useTheme';
import { getVideoIdForExercise, DAILY_TIPS } from '../constants/exercises';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';


import { avisar, confirmar } from '../utils/dialogos';
import { textoIntensidad, colorIntensidad } from '../utils/textos';
import { evaluarEjercicio, cargarCondiciones } from '../utils/condiciones';

type Recomendado = {
  title: string; categoria: string; time: string; intensity: string; nivel: number;
  icon: string; color: string; desc: string; bd?: any;
};

const ICONOS_CATEGORIA: Record<string, string> = {
  cardio: 'walk', zumba: 'musical-notes', baile: 'musical-note', fuerza: 'barbell', flexibilidad: 'body', equilibrio: 'shield-checkmark',
  movilidad: 'accessibility', silla: 'body', 'relajación': 'leaf', 'respiración': 'leaf', pilates: 'fitness', yoga: 'leaf',
};
const iconoCategoria = (categoria: string) => ICONOS_CATEGORIA[(categoria || '').toLowerCase()] || 'fitness';

const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// "09:00" → "9:00"
const horaLegible = (hora: string) => hora.replace(/^0(\d)/, '$1');

// Nivel funcional explicado en palabras (sin números ni términos técnicos)
const NIVEL_EN_PALABRAS: Record<number, { nombre: string; detalle: string }> = {
  1: { nombre: 'Suave', detalle: 'Ejercicios sentado o con apoyo' },
  2: { nombre: 'Moderado', detalle: 'Ejercicios de pie con apoyo cercano' },
  3: { nombre: 'Activo', detalle: 'Ejercicios de fuerza, equilibrio y resistencia' },
};

// Próximo recordatorio activo a partir de ahora (hoy o en los siguientes 7 días)
function calcularProximo(recordatorios: { hora: string; dias: string[]; activo: boolean }[]): string | null {
  const ahora = new Date();
  for (let d = 0; d < 8; d++) {
    const fecha = new Date(ahora);
    fecha.setDate(ahora.getDate() + d);
    const letra = DIAS_SEMANA[fecha.getDay()];
    const delDia = recordatorios
      .filter((r) => r.activo && r.dias.includes(letra))
      .map((r) => r.hora)
      .filter((hora) => {
        if (d > 0) return true;
        const [h, m] = hora.split(':').map(Number);
        return h * 60 + m > ahora.getHours() * 60 + ahora.getMinutes();
      })
      .sort();
    if (delDia.length) {
      const hora = horaLegible(delDia[0]);
      return d === 0 ? `hoy a las ${hora}` : d === 1 ? `mañana a las ${hora}` : `el ${NOMBRES_DIA[fecha.getDay()]} a las ${hora}`;
    }
  }
  return null;
}
export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [weeklyStats, setWeeklyStats] = useState({
    exercises: 0,
    calories: 0,
    minutes: 0,
    weeklyGoal: 0,
    totalGoal: 3,
    challenge: '7X4'
  });
  const [peso, setPeso] = useState(58);
  const [nombreUsuario, setNombreUsuario] = useState('Usuario');
  const [userId, setUserId] = useState<string | null>(null);   // id_usuario de la BD
  const [userConditions, setUserConditions] = useState<string[]>([]);
  const [conditionSummary, setConditionSummary] = useState('Ninguna condición registrada');
  const [refreshing, setRefreshing] = useState(false);
  const [completadosHoy, setCompletadosHoy] = useState(0);
  const [hydration, setHydration] = useState(0);
  const [dailyTip, setDailyTip] = useState('');
  // Nivel funcional asignado por la valoración (RN03); null mientras no se conoce
  const [nivelFuncional, setNivelFuncional] = useState<number | null>(null);
  // Datos del perfil para personalizar los recomendados
  const [edadUsuario, setEdadUsuario] = useState<number | null>(null);
  const [ejerciciosBD, setEjerciciosBD] = useState<any[]>([]);
  // Rutinas publicadas por el admin que este usuario puede hacer completas (GET /api/rutinas)
  const [rutinasBD, setRutinasBD] = useState<any[]>([]);
  // Nombres (en minúsculas) de los ejercicios completados hoy, según el historial de la BD
  const [hechosHoy, setHechosHoy] = useState<string[]>([]);
  const [proximoRecordatorio, setProximoRecordatorio] = useState<string | null>(null);

  // Cargar datos cada vez que la pantalla tiene foco
  useFocusEffect(
    useCallback(() => {
      cargarDatosUsuario();
    }, [])
  );

  const cargarDatosUsuario = async () => {
    try {
      const statsGuardadas    = await AsyncStorage.getItem('userStats');
      const nombreGuardado    = await AsyncStorage.getItem('userName');
      const userIdGuardado    = await AsyncStorage.getItem('userId');       // PK: id_usuario
      const completadosHoyGuardados = await AsyncStorage.getItem('completadosHoy');

      if (statsGuardadas) {
        const stats = JSON.parse(statsGuardadas);
        setWeeklyStats(stats);
        const porcentaje = stats.totalGoal > 0
          ? Math.round((stats.weeklyGoal / stats.totalGoal) * 100)
          : 0;
        setProgressPercentage(porcentaje);
      }
      if (nombreGuardado)    setNombreUsuario(nombreGuardado);
      if (userIdGuardado)    setUserId(userIdGuardado);
      if (completadosHoyGuardados) setCompletadosHoy(parseInt(completadosHoyGuardados));

      // Condiciones de salud: se leen de la BD (cifradas) para que sean las de esta cuenta
      const condicionesArray = await cargarCondiciones();
      setUserConditions(condicionesArray);
      setConditionSummary(condicionesArray.length > 0 ? condicionesArray.join(', ') : 'Ninguna condición registrada');

      // Peso: se obtiene del backend con el id_usuario real
      if (userIdGuardado) {
        try {
          const res = await fetchSeguro(`${API_URL}/user/${userIdGuardado}`);
          const data = await res.json();
          if (data.success && data.user?.edad != null) setEdadUsuario(Number(data.user.edad));
          if (data.success && data.user?.peso) {
            setPeso(parseFloat(data.user.peso));
            await AsyncStorage.setItem('userWeight', data.user.peso.toString());
          }
        } catch (error) {
          console.log('Sin conexión al backend, usando peso cacheado:', error);
          const pesoGuardado = await AsyncStorage.getItem('userWeight');
          if (pesoGuardado) setPeso(parseFloat(pesoGuardado));
        }
      }

      try {
        const resNivel = await fetchSeguro(`${API_URL}/valoracion`);
        const dataNivel = await resNivel.json();
        if (dataNivel.success) setNivelFuncional(dataNivel.nivel);
      } catch (error) {
        console.log('No se pudo consultar el nivel funcional:', error);
      }

      if (userIdGuardado) {
        // Ejercicios del catálogo permitidos para este usuario (nivel, edad, peso y fuente: RN03 y RN06)
        try {
          const resEj = await fetchSeguro(`${API_URL}/exercises/user/${userIdGuardado}`);
          const dataEj = await resEj.json();
          setEjerciciosBD(Array.isArray(dataEj.exercises) ? dataEj.exercises : []);
        } catch (error) {
          setEjerciciosBD([]);
        }
        try {
          const resRut = await fetchSeguro(`${API_URL}/rutinas`);
          const dataRut = await resRut.json();
          setRutinasBD(Array.isArray(dataRut.rutinas) ? dataRut.rutinas : []);
        } catch (error) {
          setRutinasBD([]);
        }

        // Ejercicios completados hoy, para marcar el avance de la rutina del día
        try {
          const resHist = await fetchSeguro(`${API_URL}/ejercicio-realizado/${userIdGuardado}`);
          const dataHist = await resHist.json();
          const hoy = new Date().toDateString();
          setHechosHoy((dataHist.historial || [])
            .filter((h: any) => h.completado && new Date(h.fecha_hora_inicio).toDateString() === hoy)
            .map((h: any) => (h.nombre_video || '').toLowerCase()));
        } catch (error) {
          console.log('No se pudo consultar el historial:', error);
        }
      }

      try {
        const resRec = await fetchSeguro(`${API_URL}/recordatorios`);
        const dataRec = await resRec.json();
        if (dataRec.success) setProximoRecordatorio(calcularProximo(dataRec.recordatorios || []));
      } catch (error) {
        setProximoRecordatorio(null);
      }

      const hydrationGuardado = await AsyncStorage.getItem('userHydration');
      if (hydrationGuardado) setHydration(parseInt(hydrationGuardado));

      // Tip aleatorio basado en el día
      const dayOfYear = Math.floor(
        (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
      );
      setDailyTip(DAILY_TIPS[dayOfYear % DAILY_TIPS.length]);
    } catch (error) {
      console.log('Error cargando datos:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatosUsuario();
    setRefreshing(false);
  };

  useEffect(() => {
    setConditionSummary(userConditions.length > 0 ? userConditions.join(', ') : 'Ninguna condición registrada');
  }, [userConditions]);

  const cambiarHydration = async (delta: number) => {
    const nuevo = Math.max(0, Math.min(12, hydration + delta));
    setHydration(nuevo);
    await AsyncStorage.setItem('userHydration', nuevo.toString());
  };

  const cambiarPeso = async (delta: number) => {
    const nuevo = Math.max(20, Math.min(250, peso + delta));
    setPeso(nuevo);
    await AsyncStorage.setItem('userWeight', nuevo.toString());

    // Sincronizar con la BD — tabla usuario, campo peso
    if (userId) {
      try {
        await fetchSeguro(`${API_URL}/user/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peso: nuevo })
        });
      } catch (e) {
        console.log('No se pudo actualizar peso en BD:', e);
      }
    }
  };

  const reiniciarProgreso = async () => {
    const statsIniciales = {
      exercises: 0,
      calories: 0,
      minutes: 0,
      weeklyGoal: 0,
      totalGoal: 3,
      challenge: '7X4'
    };
    setWeeklyStats(statsIniciales);
    setProgressPercentage(0);
    setCompletadosHoy(0);
    await AsyncStorage.setItem('userStats', JSON.stringify(statsIniciales));
    await AsyncStorage.setItem('completadosHoy', '0');
    avisar('Progreso reiniciado', 'El contador ha vuelto a cero.');
  };

  // Rutinas del día - una diferente por cada día de la semana
  const allRoutines = [
    {
      title: 'RUTINA SUAVE MATUTINA',
      categoria: 'movilidad',
      nivel: 1,
      time: '25 min - 5 ejercicios',
      exercises: [
        { name: 'Respiración Diafragmática', duration: '05:00', icon: 'leaf', color: '#1E40AF' },
        { name: 'Círculos con Hombros', duration: '05:00', icon: 'refresh', color: '#0369A1' },
        { name: 'Estiramiento Lateral', duration: '05:00', icon: 'body', color: '#0F766E' },
        { name: 'Movimiento de Tobillos', duration: '05:00', icon: 'footsteps', color: '#047857' },
        { name: 'Rotación de Cuello', duration: '05:00', icon: 'person', color: '#6D28D9' }
      ]
    },
    {
      title: 'MOVILIDAD Y EQUILIBRIO',
      categoria: 'equilibrio',
      nivel: 2,
      time: '20 min - 4 ejercicios',
      exercises: [
        { name: 'Marcha en el Lugar', duration: '05:00', icon: 'walk', color: '#0F766E' },
        { name: 'Equilibrio en un Pie', duration: '05:00', icon: 'accessibility', color: '#7C3AED' },
        { name: 'Sentadilla con Silla', duration: '05:00', icon: 'fitness', color: '#D97706' },
        { name: 'Estiramiento de Espalda', duration: '05:00', icon: 'fitness', color: '#059669' }
      ]
    },
    {
      title: 'FUERZA SUAVE DE BRAZOS',
      categoria: 'fuerza',
      nivel: 1,
      time: '20 min - 4 ejercicios',
      exercises: [
        { name: 'Elevación de Brazos', duration: '05:00', icon: 'barbell', color: '#2563EB' },
        { name: 'Curl de Bíceps', duration: '05:00', icon: 'barbell', color: '#7C3AED' },
        { name: 'Press contra Pared', duration: '05:00', icon: 'body', color: '#0369A1' },
        { name: 'Extensión de Pierna', duration: '05:00', icon: 'fitness', color: '#BE123C' }
      ]
    },
    {
      title: 'RELAJACIÓN ACTIVA',
      categoria: 'relajación',
      nivel: 1,
      time: '15 min - 3 ejercicios',
      exercises: [
        { name: 'Respiración Profunda', duration: '05:00', icon: 'leaf', color: '#059669' },
        { name: 'Yoga en Silla', duration: '05:00', icon: 'body', color: '#0F766E' },
        { name: 'Meditación Guiada', duration: '05:00', icon: 'leaf', color: '#6D28D9' }
      ]
    },
    {
      title: 'CARDIO LIGERO',
      categoria: 'cardio',
      nivel: 2,
      time: '20 min - 4 ejercicios',
      exercises: [
        { name: 'Caminata en el Lugar', duration: '05:00', icon: 'walk', color: '#2563EB' },
        { name: 'Paso Lateral', duration: '05:00', icon: 'footsteps', color: '#0D9488' },
        { name: 'Rodillas Arriba', duration: '05:00', icon: 'fitness', color: '#D97706' },
        { name: 'Estiramiento Final', duration: '05:00', icon: 'leaf', color: '#059669' }
      ]
    },
    {
      title: 'ARTICULACIONES SANAS',
      categoria: 'movilidad',
      nivel: 1,
      time: '25 min - 5 ejercicios',
      exercises: [
        { name: 'Círculos de Muñecas', duration: '05:00', icon: 'refresh', color: '#0891B2' },
        { name: 'Movimiento de Hombros', duration: '05:00', icon: 'body', color: '#6D28D9' },
        { name: 'Estiramiento de Cuello', duration: '05:00', icon: 'person', color: '#059669' },
        { name: 'Rotación de Tobillos', duration: '05:00', icon: 'footsteps', color: '#D97706' },
        { name: 'Relajación de Espalda', duration: '05:00', icon: 'leaf', color: '#BE123C' }
      ]
    },
    {
      title: 'PESAS LIGERAS',
      categoria: 'fuerza',
      nivel: 2,
      time: '20 min - 4 ejercicios',
      exercises: [
        { name: 'Press de Pesas Ligeras', duration: '05:00', icon: 'barbell', color: '#2563EB' },
        { name: 'Elevación Lateral de Brazos', duration: '05:00', icon: 'barbell', color: '#7C3AED' },
        { name: 'Curl de Bíceps con Pesas', duration: '05:00', icon: 'barbell', color: '#BE123C' },
        { name: 'Estiramiento Post-Ejercicio', duration: '05:00', icon: 'leaf', color: '#059669' }
      ]
    }
  ];

  // Seleccionar rutina del día basada en el día de la semana
  const dayOfWeek = new Date().getDay();

  const healthConditionNote = userConditions.length
    ? `Rutinas adaptadas a: ${conditionSummary}`
    : 'Registra tus condiciones en «Mi salud» para obtener recomendaciones personalizadas.';

  // RN03: solo rutinas del nivel asignado o inferiores; sin nivel conocido se usa el más conservador
  const nivelPermitido = nivelFuncional ?? 1;

  // Rutinas del administrador (ya filtradas por nivel, edad, peso y RN06 en el backend).
  // Las rutinas fijas de arriba solo se usan como respaldo mientras no haya ninguna publicada.
  const rutinasDelAdmin = rutinasBD.map((r: any) => {
    const minutos = r.ejercicios.reduce((t: number, e: any) => t + (Number(e.duracion_min) || 5), 0);
    return {
      title: String(r.titulo).toUpperCase(),
      categoria: (r.categoria || '').toLowerCase(),
      nivel: Number(r.nivel_funcional) || 1,
      time: `${minutos} min - ${r.ejercicios.length} ejercicios`,
      exercises: r.ejercicios.map((e: any) => ({
        name: e.nombre_video,
        duration: `${String(Number(e.duracion_min) || 5).padStart(2, '0')}:00`,
        icon: iconoCategoria(e.categoria),
        color: '#2563EB',
        bd: e,
      })),
    };
  });
  const rutinasDisponibles: any[] = rutinasDelAdmin.length > 0 ? rutinasDelAdmin : allRoutines;
  const levelRoutines = rutinasDisponibles.filter((routine) => routine.nivel <= nivelPermitido);

  // Enfermedades: se quitan las rutinas cuya categoría no conviene (mismas reglas que el catálogo)
  const safeRoutines = levelRoutines.filter(
    (routine) => !evaluarEjercicio(routine.categoria, userConditions).evitar
  );

  const filteredRoutines = safeRoutines.length > 0 ? safeRoutines : levelRoutines;

  const currentWorkout = filteredRoutines[dayOfWeek % filteredRoutines.length];

  // Avance de la rutina del día: ejercicios de la rutina completados hoy según el historial de la BD
  const ejerciciosHechos = currentWorkout.exercises.filter((ex: any) => hechosHoy.includes(ex.name.toLowerCase())).length;
  const rutinaCompletada = ejerciciosHechos === currentWorkout.exercises.length;

  // Catálogo de recomendaciones fijas (complementa los ejercicios que carga el administrador)
  const allDiscoveryWorkouts = [
    { title: 'Zumba Gold Alegre', categoria: 'zumba', time: '15 min', intensity: 'Media', icon: 'musical-notes', color: '#BE123C', desc: 'Ritmos latinos divertidos para todos' },
    { title: 'Baile en Silla', categoria: 'silla', time: '10 min', intensity: 'Baja', icon: 'musical-note', color: '#7C3AED', desc: 'Música y movimiento sin levantarte' },
    { title: 'Ritmo para el Alma', categoria: 'baile', time: '12 min', intensity: 'Baja', icon: 'heart', color: '#F43F5E', desc: 'Baile suave con canciones clásicas' },
    { title: 'Despierta tu cuerpo', categoria: 'movilidad', time: '15 min', intensity: 'Baja', icon: 'sunny', color: '#2563EB', desc: 'Activa tu cuerpo suavemente al despertar' },
    { title: 'Movilidad en silla', categoria: 'silla', time: '20 min', intensity: 'Baja', icon: 'body', color: '#0D9488', desc: 'Ejercicios sentado para articulaciones' },
    { title: 'Prevención caídas', categoria: 'equilibrio', time: '10 min', intensity: 'Media', icon: 'shield-checkmark', color: '#D97706', desc: 'Mejora tu equilibrio y estabilidad' },
    { title: 'Respiración y calma', categoria: 'respiración', time: '15 min', intensity: 'Baja', icon: 'leaf', color: '#059669', desc: 'Técnicas de relajación y respiración' },
    { title: 'Fuerza suave brazos', categoria: 'fuerza', time: '15 min', intensity: 'Media', icon: 'barbell', color: '#7C3AED', desc: 'Fortalece brazos y hombros sin riesgo' },
    { title: 'Circulación piernas', categoria: 'movilidad', time: '20 min', intensity: 'Baja', icon: 'fitness', color: '#BE123C', desc: 'Activa la circulación en tus piernas' },
    { title: 'Flexibilidad total', categoria: 'flexibilidad', time: '15 min', intensity: 'Baja', icon: 'body', color: '#0891B2', desc: 'Estiramientos completos para todo el cuerpo' },
    { title: 'Postura y columna', categoria: 'movilidad', time: '10 min', intensity: 'Baja', icon: 'accessibility', color: '#4F46E5', desc: 'Corrige tu postura con ejercicios suaves' },
    { title: 'Core para mayores', categoria: 'fuerza', time: '12 min', intensity: 'Media', icon: 'fitness', color: '#0F766E', desc: 'Fortalece tu zona media para mayor estabilidad' },
    { title: 'Yoga relajante', categoria: 'flexibilidad', time: '20 min', intensity: 'Baja', icon: 'leaf', color: '#6D28D9', desc: 'Posturas suaves para relajar mente y cuerpo' },
    { title: 'Cardio en casa', categoria: 'cardio', time: '15 min', intensity: 'Media', icon: 'walk', color: '#2563EB', desc: 'Mejora tu salud cardiovascular sin impacto' },
    { title: 'Manos y muñecas', categoria: 'movilidad', time: '10 min', intensity: 'Baja', icon: 'hand-right', color: '#0369A1', desc: 'Ejercicios para mantener la agilidad manual' }
  ];

  const nivelDeIntensidad = (intensidad: string) => (intensidad === 'Alta' ? 3 : intensidad === 'Media' ? 2 : 1);
  const intensidadDe = (dificultad: string) => {
    const d = (dificultad || '').toLowerCase();
    return d === 'alta' ? 'Alta' : d === 'media' ? 'Media' : 'Baja';
  };

  // Desempate que cambia cada día (los recomendados rotan, pero no al recargar la pantalla)
  const semillaDia = new Date().toDateString();
  const desempate = (texto: string) => {
    let h = 0;
    for (const ch of texto + semillaDia) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return (Math.abs(h) % 1000) / 1000;
  };

  // Recomendados según el perfil:
  //  - nivel funcional (RN03) y condiciones de salud (se excluye lo no recomendado)
  //  - se priorizan los ejercicios que benefician alguna condición del usuario,
  //    los del catálogo con fuente documental (cargados por el admin) y, a partir de 75 años, equilibrio
  const candidatos: Recomendado[] = [
    ...ejerciciosBD.map((e: any): Recomendado => ({
      title: e.nombre_video,
      categoria: (e.categoria || '').toLowerCase(),
      time: `${e.duracion_min || 5} min`,
      intensity: intensidadDe(e.dificultad),
      nivel: Number(e.nivel_funcional) || 1,
      icon: iconoCategoria(e.categoria),
      color: '#2563EB',
      desc: e.descripcion || '',
      bd: e,
    })),
    ...allDiscoveryWorkouts.map((w): Recomendado => ({ ...w, nivel: nivelDeIntensidad(w.intensity) })),
  ];

  // La lista fija solo rellena: si hay al menos 4 ejercicios publicados por el admin, se usan solo esos
  const recomendadosBD = candidatos.filter((w) => w.bd && w.nivel <= nivelPermitido && !evaluarEjercicio(w.categoria, userConditions).evitar);
  const recommendedWorkouts = candidatos
    .filter((w) => recomendadosBD.length < 4 || w.bd)
    .filter((w) => w.nivel <= nivelPermitido)
    .map((w) => {
      const { evitar, motivo } = evaluarEjercicio(w.categoria, userConditions);
      const porEdad = edadUsuario !== null && edadUsuario >= 75 && ['equilibrio', 'silla'].includes(w.categoria);
      // Lo que ya está en la rutina de hoy va al final, para que los recomendados aporten algo distinto
      const enRutinaHoy = currentWorkout.exercises.some((ex: any) => ex.name === w.title);
      const puntos = (motivo ? 3 : 0) + (w.bd ? 2 : 0) + (porEdad ? 1 : 0) + (w.nivel === nivelPermitido ? 0.5 : 0) - (enRutinaHoy ? 4 : 0) + desempate(w.title);
      const razon = motivo || (porEdad ? 'Previene caídas' : w.bd ? 'Con respaldo profesional' : `Para tu nivel ${nivelPermitido}`);
      return { ...w, evitar, razon, puntos };
    })
    .filter((w) => !w.evitar)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 4);

  // Diversión con Ritmo: baile, con los mismos filtros de nivel y condiciones
  // Si el admin publicó ejercicios de Zumba o Baile, se usan esos; si no, los fijos
  const bailesBD = candidatos.filter((w) => w.bd && ['zumba', 'baile'].includes(w.categoria));
  const funWorkouts = (bailesBD.length > 0
    ? bailesBD
    : allDiscoveryWorkouts.filter((w) => w.icon.includes('musical') || w.icon === 'heart'))
    .filter((w: any) => (w.bd ? Number(w.bd.nivel_funcional) || 1 : nivelDeIntensidad(w.intensity)) <= nivelPermitido)
    .filter((w: any) => !evaluarEjercicio(w.categoria, userConditions).evitar);

  // Calendario dinámico basado en la semana actual
  const today = new Date();
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dailySchedule = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + 1 + i); // Lun a Sáb
    return {
      day: dayNames[d.getDay()],
      date: d.getDate().toString(),
      active: d.toDateString() === today.toDateString(),
      locked: d > today
    };
  });

  const irAEjercicios = () => router.push('/ejercicios');
  const irAEstadisticas = () => router.push('/estadisticas');
  const irAPerfil = () => router.push('/perfil');

  // Datos de cada ejercicio de la rutina para el reproductor: los del admin llevan su propio
  // video, fuente y contraindicaciones; los de respaldo usan el video elegido por nombre
  const datosEjercicioRutina = (ex: any) => ex.bd
    ? {
        name: ex.name,
        url: ex.bd.link_video || getVideoIdForExercise(ex.name),
        id_video: String(ex.bd.id_video),
        fuente: ex.bd.fuente_documental || '',
        contraindicaciones: ex.bd.contraindicaciones || '',
        duracion: String((Number(ex.bd.duracion_min) || 5) * 60),
      }
    : { name: ex.name, url: getVideoIdForExercise(ex.name), duracion: '300' };

  const iniciarEntrenamiento = async () => {
    const ejercicios = currentWorkout.exercises.map(datosEjercicioRutina);
    const primero = ejercicios[0];
    const rutinaParaReproductor = { title: currentWorkout.title, exercises: ejercicios };

    router.push({
      pathname: '/detalle-ejercicio',
      params: {
        id: userId ?? '',                          // id_usuario real de la BD
        nombre: primero.name,
        descripcion: `Parte de la rutina: ${currentWorkout.title}`,
        duracion: primero.duracion,
        dificultad: 'Fácil',
        url: encodeURIComponent(primero.url),
        id_video: primero.id_video ?? '',
        fuente: primero.fuente ?? '',
        contraindicaciones: primero.contraindicaciones ?? '',
        routine: JSON.stringify(rutinaParaReproductor),
        index: '0'
      }
    });
  };



  const verDetalleEjercicio = (ejercicio: any) => {
    if (ejercicio.bd) {
      verDetalleWorkout({ bd: ejercicio.bd });
      return;
    }
    router.push({
      pathname: '/detalle-ejercicio',
      params: {
        id: userId ?? '',                          // id_usuario real de la BD
        nombre: ejercicio.name,
        descripcion: `Ejercicio de la rutina ${currentWorkout.title}. Diseñado para cuidar tus articulaciones.`,
        duracion: '300',
        dificultad: 'Fácil'
      }
    });
  };

  const verDetalleWorkout = (workout: any) => {
    if (workout.bd) {
      // Ejercicio del catálogo: se abre con su propio video, contraindicaciones y fuente
      const e = workout.bd;
      router.push({
        pathname: '/detalle-ejercicio',
        params: {
          id: String(e.id_video),
          nombre: e.nombre_video,
          descripcion: e.descripcion || 'Sin descripción',
          duracion: String((e.duracion_min || 5) * 60),
          dificultad: e.dificultad,
          url: encodeURIComponent(e.link_video || ''),
          id_video: String(e.id_video),
          contraindicaciones: e.contraindicaciones || '',
          fuente: e.fuente_documental || ''
        }
      });
      return;
    }
    router.push({
      pathname: '/detalle-ejercicio',
      params: {
        id: userId ?? '',                          // id_usuario real de la BD
        nombre: workout.title,
        descripcion: workout.desc || 'Rutina recomendada especialmente para ti.',
        duracion: (parseInt(workout.time) * 60).toString(),
        dificultad: workout.intensity === 'Media' ? 'Normal' : 'Fácil'
      }
    });
  };

  const cerrarSesion = async () => {
    const limpiarStorage = async () => {
      // Eliminar todas las claves guardadas por el login y la app
      await Promise.all([
        AsyncStorage.removeItem('userId'),
        AsyncStorage.removeItem('userName'),
        AsyncStorage.removeItem('userEmail'),
        AsyncStorage.removeItem('userAge'),
        AsyncStorage.removeItem('userRol'),
        AsyncStorage.removeItem('userWeight'),
        AsyncStorage.removeItem('userStats'),
        AsyncStorage.removeItem('completadosHoy'),
        AsyncStorage.removeItem('userHydration'),
        AsyncStorage.removeItem('userConditions'),
        AsyncStorage.removeItem('jwtToken'),
        AsyncStorage.removeItem('csrfToken')
      ]);
      router.replace('/login');
    };

    // Confirmación clara antes de salir (evita cerrar sesión por un toque accidental)
    confirmar(
      '¿Cerrar sesión?',
      'Para volver a entrar necesitarás tu correo y tu contraseña.',
      'Sí, cerrar sesión',
      limpiarStorage
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />
      <ScrollView 
        style={[styles.container, { backgroundColor: colors.bg }]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
        }
      >
        
        {/* Header Premium */}
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.headerStats}
        >
          <View style={styles.headerTitleRow}>
             <View>
               <Text style={styles.headerWelcomeText}>Hola, {nombreUsuario}</Text>
               <Text style={styles.headerGreetingSub}>Inicia tu jornada de bienestar hoy</Text>
             </View>
             <TouchableOpacity onPress={irAPerfil} style={styles.profileAvatar}>
                <Ionicons name="person" size={24} color="#FFFFFF" />
             </TouchableOpacity>
          </View>

          <View style={[styles.headerOverlay, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={styles.statCard} onPress={irAEstadisticas} activeOpacity={0.8}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.settingIconBg }]}>
                <Ionicons name="fitness" size={28} color={colors.isDark ? '#60A5FA' : '#1E3A8A'} />
              </View>
              <Text style={[styles.statNumber, { color: colors.text }]}>{weeklyStats.exercises}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={2}>Ejercicios</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.statCard} onPress={irAEstadisticas} activeOpacity={0.8}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.isDark ? '#78350F' : '#FEF3C7' }]}>
                <FontAwesome5 name="fire" size={24} color={colors.isDark ? '#FBBF24' : '#D97706'} />
              </View>
              <Text style={[styles.statNumber, { color: colors.text }]}>{weeklyStats.calories}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={2}>Calorías</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.statCard} onPress={irAEstadisticas} activeOpacity={0.8}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.isDark ? '#064E3B' : '#F0FDF4' }]}>
                <Ionicons name="time" size={28} color={colors.isDark ? '#34D399' : '#059669'} />
              </View>
              <Text style={[styles.statNumber, { color: colors.text }]}>{weeklyStats.minutes}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={2}>Minutos</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Tu plan de hoy: lo esencial arriba, con un solo botón grande (accesibilidad) */}
        <View style={[styles.planHoy, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.planHoyTitulo, { color: colors.text }]}>Tu plan de hoy</Text>

          {nivelFuncional === null ? (
            <>
              <Text style={[styles.planHoyTexto, { color: colors.text }]}>
                Aún no conocemos tu nivel. Responde unas preguntas para recomendarte ejercicios seguros.
              </Text>
              <TouchableOpacity style={styles.planHoyBoton} onPress={() => router.push('/valoracion')} accessibilityRole="button">
                <Ionicons name="clipboard-outline" size={30} color="#FFFFFF" />
                <Text style={styles.planHoyBotonTexto}>Responder las preguntas</Text>
              </TouchableOpacity>
            </>
          ) : nivelFuncional === 0 ? (
            <>
              <Text style={[styles.planHoyTexto, { color: colors.text }]}>
                Por tus respuestas, consulta a tu médico antes de hacer ejercicio.
              </Text>
              <TouchableOpacity style={[styles.planHoyBoton, styles.planHoyBotonSecundario]} onPress={() => router.push('/valoracion')} accessibilityRole="button">
                <Ionicons name="refresh" size={28} color="#1E3A8A" />
                <Text style={[styles.planHoyBotonTexto, { color: '#1E3A8A' }]}>Mi médico ya me autorizó</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.planHoyNivel, { backgroundColor: colors.isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                <Ionicons name="speedometer-outline" size={28} color={colors.isDark ? '#FFFFFF' : '#1E3A8A'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planHoyNivelNombre, { color: colors.isDark ? '#FFFFFF' : '#1E3A8A' }]}>
                    Tu nivel: {NIVEL_EN_PALABRAS[nivelFuncional]?.nombre}
                  </Text>
                  <Text style={[styles.planHoyTexto, { color: colors.isDark ? '#E0E7FF' : '#1E293B', marginBottom: 0 }]}>
                    {NIVEL_EN_PALABRAS[nivelFuncional]?.detalle}
                  </Text>
                </View>
              </View>

              {rutinaCompletada ? (
                <View style={styles.planHoyHecho} accessibilityRole="text">
                  <Ionicons name="checkmark-circle" size={34} color="#FFFFFF" />
                  <Text style={styles.planHoyBotonTexto}>Ya hiciste tu rutina de hoy</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.planHoyBoton}
                  onPress={iniciarEntrenamiento}
                  accessibilityRole="button"
                  accessibilityHint={`${currentWorkout.title.toLowerCase()}, ${currentWorkout.exercises.length} ejercicios`}
                >
                  <Ionicons name="play-circle" size={34} color="#FFFFFF" />
                  <Text style={styles.planHoyBotonTexto}>Hacer mi rutina de hoy</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.planHoyTexto, { color: colors.textSecondary, marginTop: 10, marginBottom: 0 }]}>
                {rutinaCompletada
                  ? '¡Muy bien! Mañana tendrás una rutina nueva.'
                  : ejerciciosHechos > 0
                    ? `Llevas ${ejerciciosHechos} de ${currentWorkout.exercises.length} ejercicios de hoy.`
                    : `${currentWorkout.exercises.length} ejercicios · ${currentWorkout.time.split(' - ')[0]}`}
              </Text>
            </>
          )}

          <TouchableOpacity
            style={[styles.planHoyRecordatorio, { borderTopColor: colors.cardBorder }]}
            onPress={() => router.push('/recordatorios')}
            accessibilityRole="button"
          >
            <Ionicons name="alarm-outline" size={28} color={colors.isDark ? '#93C5FD' : '#1D4ED8'} />
            <Text style={[styles.planHoyTexto, { color: colors.text, flex: 1, marginBottom: 0 }]}>
              {proximoRecordatorio ? `Próximo recordatorio: ${proximoRecordatorio}` : 'No tienes recordatorios. Toca aquí para programar uno.'}
            </Text>
            <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Banner de Motivación */}
        <TouchableOpacity style={[styles.motivationBanner, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={irAEstadisticas} activeOpacity={0.9}>
          <View style={styles.bannerContent}>
            <View style={[styles.bannerIconContainer, colors.isDark && { backgroundColor: '#78350F' }]}>
               <Ionicons name="stats-chart" size={32} color="#D97706" />
            </View>
            <View style={styles.bannerTextContainer}>
              <Text style={[styles.bannerTitle, { color: colors.text }]}>Tu progreso diario</Text>
              <Text style={[styles.bannerSubtitle, { color: colors.textSecondary }]}>
                {completadosHoy > 0 
                  ? `Has completado ${completadosHoy} actividad(es) hoy. ¡Sigue así!` 
                  : 'Una pequeña caminata hace una gran diferencia.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={28} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Tip del Día - NUEVO */}
        <View style={[styles.tipCard, { backgroundColor: colors.isDark ? '#1E293B' : '#EFF6FF', borderColor: colors.isDark ? '#334155' : '#DBEAFE' }]}>
          <LinearGradient
            colors={colors.isDark ? ['#1E293B', '#0F172A'] : ['#EFF6FF', '#DBEAFE']}
            style={styles.tipGradient}
          >
            <View style={styles.tipIconContainer}>
               <Entypo name="light-bulb" size={24} color="#D97706" />
            </View>
            <View style={styles.tipTextContainer}>
              <Text style={[styles.tipTitle, { color: colors.text }]}>Consejo de bienestar</Text>
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>{dailyTip}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Objetivo semanal */}
        <TouchableOpacity style={[styles.weeklyGoal, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={irAEstadisticas} activeOpacity={0.9}>
          <View style={styles.goalHeader}>
            <View style={styles.goalTitleContainer}>
              <Ionicons name="trophy" size={24} color="#D97706" />
              <Text style={[styles.goalTitle, { color: colors.text }]}>Meta Semanal</Text>
            </View>
            <View style={[styles.goalBadge, colors.isDark && { backgroundColor: '#1E3A8A' }]}>
              <Text style={[styles.goalProgress, colors.isDark && { color: '#DBEAFE' }]}>
                {weeklyStats.weeklyGoal} de {weeklyStats.totalGoal}
              </Text>
            </View>
          </View>
          <Text style={[styles.challengeText, { color: colors.text }]}>Desafío {weeklyStats.challenge}</Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>Progreso Total</Text>
              <Text style={[styles.progressPercentage, colors.isDark && { color: '#6EE7B7' }]}>{progressPercentage}%</Text>
            </View>
            <View style={[styles.progressBar, colors.isDark && { backgroundColor: '#334155' }]}>
              <LinearGradient
                colors={progressPercentage >= 100 ? ['#059669', '#10B981'] : ['#2563EB', '#60A5FA']}
                style={[styles.progressFill, { width: `${Math.min(progressPercentage, 100)}%` }]}
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* Desafío del Día - NUEVO */}
        <View style={[styles.dailyChallengeCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <LinearGradient
                colors={colors.isDark ? ['#1E1B4B', '#312E81'] : ['#EEF2FF', '#E0E7FF']}
                style={styles.dailyChallengeGradient}
            >
                <View style={styles.challengeIconRow}>
                    <View style={[styles.challengeIconCircle, { backgroundColor: '#4F46E5' }]}>
                        <Ionicons name="flash" size={24} color="#FFFFFF" />
                    </View>
                    <View style={styles.challengeTextGroup}>
                        <Text style={[styles.challengeTitle, { color: colors.isDark ? '#E0E7FF' : '#1E1B4B' }]}>Desafío del Día</Text>
                        <Text style={[styles.challengeDesc, { color: colors.isDark ? '#C7D2FE' : '#4338CA' }]}>
                            {completadosHoy >= 2 ? '¡Desafío completado!' : 'Completa 2 rutinas hoy'}
                        </Text>
                    </View>
                    {completadosHoy >= 2 && (
                        <View style={styles.completedBadge}>
                            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                        </View>
                    )}
                </View>
                
                <View style={styles.challengeProgressRow}>
                    <View style={styles.challengeDots}>
                        {[1, 2].map((i) => (
                            <View 
                                key={i} 
                                style={[
                                    styles.challengeDot, 
                                    completadosHoy >= i ? { backgroundColor: '#4F46E5' } : { backgroundColor: colors.isDark ? '#4338CA' : '#C7D2FE' }
                                ]} 
                            />
                        ))}
                    </View>
                    <Text style={[styles.challengeStatus, { color: colors.isDark ? '#C7D2FE' : '#4338CA' }]}>
                        {Math.min(completadosHoy, 2)} / 2
                    </Text>
                </View>
            </LinearGradient>
        </View>

        {/* Plan del Día */}
        <View style={[styles.daySection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.dayHeader}>
            <Text style={[styles.dayNumber, { color: colors.text }]}>Día {today.getDate()}</Text>
            <TouchableOpacity style={[styles.dayBadge, colors.isDark && { backgroundColor: '#334155' }]} onPress={reiniciarProgreso}>
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              <Text style={[styles.dayBadgeText, { color: colors.text }]}>Reiniciar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.daySelector}>
            {dailySchedule.map((day, index) => (
              <View 
                key={index} 
                style={[
                  styles.dayButton, 
                  { backgroundColor: colors.isDark ? '#334155' : '#F8FAFC', borderColor: colors.isDark ? '#475569' : '#F1F5F9' },
                  day.active && styles.activeDayButton,
                  day.locked && [styles.lockedDayButton, colors.isDark && { backgroundColor: '#1E293B' }]
                ]}
              >
                <Text style={[
                  styles.dayText, 
                  { color: colors.isDark ? '#E2E8F0' : colors.textSecondary },
                  day.active && styles.activeDayText,
                  day.locked && styles.lockedDayText,
                  day.locked && colors.isDark && { color: '#CBD5E1' }
                ]}>
                  {day.day}
                </Text>
                <Text style={[
                  styles.dateText, 
                  { color: colors.text },
                  day.active && styles.activeDayText,
                  day.locked && styles.lockedDayText,
                  day.locked && colors.isDark && { color: '#CBD5E1' }
                ]}>
                  {day.locked ? (
                    <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                  ) : day.date}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {nivelFuncional === 0 ? (
        <View style={[styles.healthInfoCard, { backgroundColor: colors.isDark ? '#451a03' : '#FFFBEB', borderColor: '#FCD34D' }]}>
          <Text style={[styles.healthInfoText, { color: colors.text, fontSize: 19 }]}>
            Por tu valoración, consulta a tu médico antes de hacer ejercicio. Cuando te autorice, repite la valoración para ver tus rutinas.
          </Text>
          <TouchableOpacity onPress={() => router.push('/valoracion')} style={{ marginTop: 12, minHeight: 56, justifyContent: 'center' }}>
            <Text style={[styles.seeAllText, { fontSize: 19 }, colors.isDark && { color: '#93C5FD' }]}>Repetir la valoración</Text>
          </TouchableOpacity>
        </View>
        ) : (
        <>
        {/* Sección Descubre */}
        <View style={[styles.discoverSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recomendados para ti</Text>
            <TouchableOpacity onPress={irAEjercicios}>
              <Text style={[styles.seeAllText, colors.isDark && { color: '#93C5FD' }]}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            {`Según tu nivel ${nivelPermitido}${edadUsuario !== null ? `, tu edad (${edadUsuario})` : ''}${userConditions.length ? ` y: ${conditionSummary}` : ''}`}
          </Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discoverScroll}>
            {recommendedWorkouts.map((workout, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.discoverCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} 
                activeOpacity={0.9}
                onPress={() => verDetalleWorkout(workout)}
              >
                <View style={[styles.discoverCardHeader, { backgroundColor: workout.color + '15' }]}>
                  <Ionicons name={workout.icon as any} size={40} color={workout.color} />
                </View>
                <View style={styles.discoverCardBody}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{workout.title}</Text>
                  <View style={styles.razonRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                    <Text style={[styles.razonText, colors.isDark && { color: '#6EE7B7' }]} numberOfLines={1}>{workout.razon}</Text>
                  </View>
                  <View style={styles.cardInfoRow}>
                    <View style={styles.cardTimeBadge}>
                      <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                      <Text style={[styles.cardTime, { color: colors.textSecondary }]}>{workout.time}</Text>
                    </View>
                    <View style={[styles.intensityBadge, { backgroundColor: colorIntensidad(workout.intensity, colors.isDark).fondo }]}>
                      <Text style={[styles.cardIntensity, { color: colorIntensidad(workout.intensity, colors.isDark).texto }]}>{textoIntensidad(workout.intensity)}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Sección Diversión con Ritmo: con los mismos filtros de nivel y condiciones */}
        {funWorkouts.length > 0 && (
        <View style={[styles.funSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.sectionHeader, { paddingHorizontal: 24 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>¡Diversión con Ritmo! 💃</Text>
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary, paddingHorizontal: 24 }]}>Disfruta bailando mientras te cuidas</Text>
            
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.discoverScroll}
                contentContainerStyle={styles.funScrollContent}
            >
                {funWorkouts.map((workout, index) => (
                    <TouchableOpacity 
                        key={index} 
                        style={[styles.funCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} 
                        activeOpacity={0.9}
                        onPress={() => verDetalleWorkout(workout)}
                    >
                        <LinearGradient
                            colors={['#F43F5E', '#E11D48']}
                            style={styles.funCardHeader}
                        >
                            <Ionicons name={workout.icon as any} size={40} color="#FFFFFF" />
                        </LinearGradient>
                        <View style={styles.discoverCardBody}>
                            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{workout.title}</Text>
                            <View style={styles.cardInfoRow}>
                                <Text style={[styles.cardTime, { color: colors.textSecondary }]}>{workout.time} de pura alegría</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
        )}

        {/* Información de salud */}
        <View style={[styles.healthInfoCard, { backgroundColor: colors.isDark ? '#111827' : '#E0F2FE', borderColor: colors.cardBorder }]}> 
          <Text style={[styles.healthInfoText, { color: colors.text }]}>{healthConditionNote}</Text>
        </View>

        {/* Rutina del Día */}
        <View style={[styles.todayWorkout, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.workoutHeader}>
            <Text style={[styles.workoutTitle, { color: colors.text }]}>{currentWorkout.title}</Text>
            {rutinaCompletada ? (
              <View style={[styles.workoutBadge, styles.badgeCompletada]}>
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                <Text style={[styles.workoutInfo, { color: '#FFFFFF' }]}>Completada hoy</Text>
              </View>
            ) : (
              <View style={[styles.workoutBadge, colors.isDark && { backgroundColor: '#1E3A8A' }]}>
                <Ionicons name="time" size={16} color="#60A5FA" />
                <Text style={[styles.workoutInfo, colors.isDark && { color: '#DBEAFE' }]}>{currentWorkout.time}</Text>
              </View>
            )}
          </View>
          
          {currentWorkout.exercises.map((exercise: any, index: number) => (
            <TouchableOpacity 
              key={index} 
              style={[styles.exerciseItem, { borderBottomColor: colors.isDark ? '#334155' : '#F1F5F9' }]}
              onPress={() => verDetalleEjercicio(exercise)}
              activeOpacity={0.8}
            >
              <View style={[styles.exerciseIconCircle, { backgroundColor: exercise.color + '15' }]}>
                <Ionicons name={exercise.icon as any} size={24} color={exercise.color} />
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text>
                {hechosHoy.includes(exercise.name.toLowerCase()) ? (
                  <Text style={[styles.exerciseDetail, styles.hechoText]}>✓ Hecho hoy</Text>
                ) : (
                  <Text style={[styles.exerciseDetail, { color: colors.textSecondary }]}>{exercise.duration}</Text>
                )}
              </View>
              {hechosHoy.includes(exercise.name.toLowerCase()) ? (
                <Ionicons name="checkmark-circle" size={32} color="#059669" />
              ) : (
                <Ionicons name="chevron-forward-circle" size={32} color={colors.isDark ? '#475569' : '#CBD5E1'} />
              )}
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity 
            style={styles.workoutStartButton} 
            activeOpacity={0.9}
            onPress={iniciarEntrenamiento}
          >
            <LinearGradient
              colors={rutinaCompletada ? ['#64748B', '#94A3B8'] : ['#059669', '#10B981']}
              style={styles.gradientButton}
            >
              <Ionicons name={rutinaCompletada ? 'refresh' : 'play'} size={28} color="#fff" />
              <Text style={styles.workoutStartText}>{rutinaCompletada ? 'Repetir la rutina' : 'Iniciar Rutina Completa'}</Text>
            </LinearGradient>
          </TouchableOpacity>
          {rutinaCompletada ? (
            <View style={styles.rutinaListaBox}>
              <Text style={styles.rutinaListaTitulo}>🎉 ¡Cumpliste la rutina de hoy!</Text>
              <Text style={styles.rutinaListaTexto}>Mañana tendrás una rutina nueva. Si lo deseas, puedes repetirla o elegir un ejercicio recomendado.</Text>
            </View>
          ) : ejerciciosHechos > 0 ? (
            <Text style={[styles.rutinaAvance, { color: colors.textSecondary }]}>
              Llevas {ejerciciosHechos} de {currentWorkout.exercises.length} ejercicios de hoy
            </Text>
          ) : null}
        </View>

        </>
        )}

        {/* Centro de Bienestar - UNIFICADO Y ÚTIL PARA ADULTOS MAYORES */}
        <View style={[styles.wellnessSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.wellnessHeader}>
                <View style={styles.wellnessTitleGroup}>
                    <Ionicons name="medkit" size={28} color="#EF4444" />
                    <Text style={[styles.wellnessTitle, { color: colors.text }]}>Centro de Bienestar</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/recordatorios')}>
                    <Text style={[styles.seeAllText, colors.isDark && { color: '#93C5FD' }]}>Configurar</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.wellnessGrid}>
                {/* Hidratación */}
                <View style={[styles.wellnessItem, { backgroundColor: colors.isDark ? '#1E293B' : '#EFF6FF' }]}>
                    <Ionicons name="water" size={32} color="#3B82F6" />
                    <Text style={[styles.wellnessValue, { color: colors.text }]}>{hydration} / 8</Text>
                    <Text style={[styles.wellnessLabel, { color: colors.text }]}>Vasos Agua</Text>
                    <View style={styles.wellnessControls}>
                        <TouchableOpacity onPress={() => cambiarHydration(-1)} style={styles.miniBtn}>
                            <Ionicons name="remove" size={18} color="#3B82F6" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => cambiarHydration(1)} style={styles.miniBtn}>
                            <Ionicons name="add" size={18} color="#3B82F6" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Recordatorios de ejercicio (RF13); no es un módulo de medicamentos */}
                <TouchableOpacity 
                    style={[styles.wellnessItem, { backgroundColor: colors.isDark ? '#1E293B' : '#FEF2F2' }]}
                    onPress={() => router.push('/recordatorios')}
                >
                    <Ionicons name="alarm" size={32} color="#EF4444" />
                    <Text style={[styles.wellnessValue, { color: colors.text, fontSize: proximoRecordatorio ? 18 : 20 }]} numberOfLines={2}>
                        {proximoRecordatorio || 'Sin horario'}
                    </Text>
                    <Text style={[styles.wellnessLabel, { color: colors.text }]}>Próximo ejercicio</Text>
                    <View style={[styles.miniBtn, { marginTop: 10, width: '80%' }]}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#B91C1C' }}>HORARIOS</Text>
                    </View>
                </TouchableOpacity>

                {/* Control de Peso */}
                <View style={[styles.wellnessItem, { backgroundColor: colors.isDark ? '#1E293B' : '#F0FDF4' }]}>
                    <Ionicons name="scale" size={32} color="#10B981" />
                    <Text style={[styles.wellnessValue, { color: colors.text }]}>{peso} kg</Text>
                    <Text style={[styles.wellnessLabel, { color: colors.text }]}>Mi Peso</Text>
                    <View style={styles.wellnessControls}>
                        <TouchableOpacity onPress={() => cambiarPeso(-1)} style={styles.miniBtn}>
                            <Ionicons name="remove" size={18} color="#10B981" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => cambiarPeso(1)} style={styles.miniBtn}>
                            <Ionicons name="add" size={18} color="#10B981" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            
            <View style={[styles.motivationCard, { marginTop: 20, marginHorizontal: 0, backgroundColor: colors.isDark ? '#1E293B' : '#FFFBEB' }]}>
                <View style={styles.motivationHeader}>
                    <Ionicons name="bulb" size={20} color="#D97706" />
                    <Text style={[styles.motivationTitle, { fontSize: 18 }, colors.isDark && { color: '#FBBF24' }]}>Consejo de salud</Text>
                </View>
                <Text style={[styles.motivationText, { fontSize: 18, lineHeight: 24 }, colors.isDark && { color: '#FDE68A' }]}>
                    Recuerda que mantenerte hidratado ayuda a tu concentración y energía diaria. ¡Bebe un poco de agua ahora!
                </Text>
            </View>
        </View>

        {/* Botón cerrar sesión */}
        <TouchableOpacity 
          style={[styles.logoutButton, colors.isDark && { backgroundColor: '#371717', borderColor: '#7F1D1D' }]} 
          onPress={cerrarSesion}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={24} color="#DC2626" />
          <Text style={[styles.logoutText, colors.isDark && { color: '#FCA5A5' }]}>Cerrar sesión</Text>
        </TouchableOpacity>

      </ScrollView>

      <MenuInferior />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  planHoy: { marginHorizontal: 20, marginTop: 16, marginBottom: 16, padding: 20, borderRadius: 24, borderWidth: 2 },
  planHoyTitulo: { fontSize: 26, fontWeight: '900', marginBottom: 12 },
  planHoyTexto: { fontSize: 19, lineHeight: 27, marginBottom: 14 },
  planHoyNivel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginBottom: 16 },
  planHoyNivelNombre: { fontSize: 21, fontWeight: '800', marginBottom: 2 },
  planHoyBoton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    minHeight: 72, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#047857',
  },
  planHoyBotonSecundario: { backgroundColor: '#DBEAFE' },
  planHoyHecho: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    minHeight: 72, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#166534',
  },
  planHoyBotonTexto: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  planHoyRecordatorio: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, minHeight: 56 },

  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 100 },
  headerStats: {
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 20,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 10px 20px rgba(30, 58, 138, 0.15)',
      }
    }),
  },
  headerTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24
  },
  headerWelcomeText: {
    fontSize: 28, fontWeight: '800', color: '#FFFFFF'
  },
  headerGreetingSub: {
    fontSize: 18, color: '#DBEAFE', fontWeight: '500', marginTop: 4
  },
  profileAvatar: {
    backgroundColor: 'rgba(255,255,255,0.2)', width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#60A5FA'
  },
  profileAvatarText: { fontSize: 24 },
  headerOverlay: { 
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 5,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      }
    }),
  },
  statIconCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  statCard: { alignItems: 'center', flex: 1, minWidth: 0, paddingHorizontal: 2 },
  statNumber: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
  statLabel: { fontSize: 18, color: '#64748B', fontWeight: '700', marginTop: 4, textAlign: 'center' },
  motivationBanner: {
    marginHorizontal: 20, marginTop: -20, marginBottom: 20, borderRadius: 24,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      }
    }),
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  bannerIconContainer: {
    backgroundColor: '#FEF3C7', width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', marginRight: 16
  },
  bannerEmoji: { fontSize: 32 },
  bannerTextContainer: { flex: 1 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  bannerSubtitle: { fontSize: 18, color: '#475569', lineHeight: 24 },
  weeklyGoal: {
    backgroundColor: '#FFFFFF', padding: 24, marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  goalTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  goalBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  goalProgress: { fontSize: 18, color: '#2563EB', fontWeight: '800' },
  challengeText: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 20 },
  progressContainer: { marginTop: 4 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressText: { fontSize: 18, color: '#64748B', fontWeight: '600' },
  progressPercentage: { fontSize: 18, color: '#047857', fontWeight: '800' },
  progressBar: { height: 12, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  daySection: {
    backgroundColor: '#FFFFFF', padding: 24, marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  dayNumber: { fontSize: 32, fontWeight: '900', color: '#1E293B' },
  dayBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 6 },
  dayBadgeText: { fontSize: 18, color: '#475569', fontWeight: '700' },
  daySelector: { flexDirection: 'row', justifyContent: 'space-between' },
  dayButton: { alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: '#F8FAFC', width: '15%', borderWidth: 1, borderColor: '#F1F5F9' },
  activeDayButton: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  lockedDayButton: { backgroundColor: '#F1F5F9' },
  dayText: { fontSize: 18, color: '#64748B', fontWeight: '700', marginBottom: 6 },
  dateText: { fontSize: 18, color: '#1E293B', fontWeight: '800' },
  activeDayText: { color: '#FFFFFF' },
  lockedDayText: { color: '#475569' },
  discoverSection: {
    padding: 24, backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
  seeAllText: { fontSize: 18, color: '#2563EB', fontWeight: '700' },
  sectionSubtitle: { fontSize: 18, color: '#64748B', fontWeight: '500', marginBottom: 20 },
  discoverScroll: { overflow: 'visible' },
  discoverCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, marginRight: 16, width: 220,
    borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden'
  },
  discoverCardHeader: { height: 90, justifyContent: 'center', alignItems: 'center' },
  cardEmoji: { fontSize: 48 },
  discoverCardBody: { padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6, height: 46 },
  razonRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  razonText: { fontSize: 18, fontWeight: '700', color: '#047857', flexShrink: 1 },
  badgeCompletada: { backgroundColor: '#059669' },
  hechoText: { color: '#059669', fontWeight: '800' },
  rutinaAvance: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  rutinaListaBox: { marginTop: 14, padding: 16, borderRadius: 16, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7' },
  rutinaListaTitulo: { fontSize: 18, fontWeight: '800', color: '#065F46', marginBottom: 4 },
  rutinaListaTexto: { fontSize: 18, color: '#065F46', lineHeight: 24 },
  cardInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTime: { fontSize: 18, color: '#64748B', fontWeight: '600' },
  intensityBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  cardIntensity: { fontSize: 18, fontWeight: '800' },
  todayWorkout: {
    backgroundColor: '#FFFFFF', padding: 24, marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  workoutHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, rowGap: 8, columnGap: 12 },
  workoutTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', flexGrow: 1, flexShrink: 1, minWidth: 160 },
  workoutBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 6 },
  workoutInfo: { fontSize: 18, color: '#2563EB', fontWeight: '700' },
  exerciseItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  exerciseIconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  exerciseIcon: { fontSize: 24 },
  exerciseInfo: { flex: 1, marginLeft: 16 },
  exerciseName: { fontSize: 18, color: '#1E293B', fontWeight: '700', marginBottom: 4 },
  exerciseDetail: { fontSize: 18, color: '#64748B', fontWeight: '500' },
  workoutStartButton: { borderRadius: 24, overflow: 'hidden', marginTop: 24 },
  gradientButton: { padding: 20, borderRadius: 24, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  workoutStartText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  userStats: {
    backgroundColor: '#FFFFFF', padding: 24, marginHorizontal: 20, marginBottom: 20, borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  weightHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  userStatTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
  weightDisplay: { flexDirection: 'row', alignItems: 'center' },
  weightCurrent: { flexDirection: 'row', alignItems: 'baseline', marginRight: 24 },
  weightNumber: { fontSize: 48, fontWeight: '900', color: '#0EA5E9' },
  weightUnit: { fontSize: 20, color: '#64748B', marginLeft: 6, fontWeight: '600' },
  weightHistory: { flex: 1 },
  weightLabel: { fontSize: 18, color: '#1E293B', fontWeight: '700', marginBottom: 4 },
  weightSubtext: { fontSize: 18, color: '#64748B' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 24, padding: 20, borderRadius: 24,
    backgroundColor: '#FEF2F2', gap: 10, borderWidth: 1, borderColor: '#FEE2E2'
  },
  logoutText: { fontSize: 18, color: '#B91C1C', fontWeight: '800' },
  weightBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#0EA5E9',
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }
    }),
  },
  tipCard: {
    marginHorizontal: 20, marginBottom: 20, borderRadius: 24,
    borderWidth: 1, overflow: 'hidden'
  },
  tipGradient: { padding: 20, flexDirection: 'row', alignItems: 'center' },
  tipIconContainer: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEF3C7',
    justifyContent: 'center', alignItems: 'center', marginRight: 16
  },
  tipTextContainer: { flex: 1 },
  tipTitle: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  tipText: { fontSize: 18, lineHeight: 24 },
  wellnessSection: {
    padding: 24, marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    borderWidth: 1,
  },
  wellnessHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, rowGap: 8 },
  wellnessTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wellnessTitle: { fontSize: 20, fontWeight: '800' },
  wellnessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  wellnessItem: { flexGrow: 1, flexBasis: 90, padding: 12, borderRadius: 20, alignItems: 'center', gap: 4 },
  wellnessValue: { fontSize: 18, fontWeight: '900', marginTop: 4 },
  wellnessLabel: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  wellnessControls: { flexDirection: 'row', gap: 8, marginTop: 8 },
  miniBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
      android: { elevation: 2 }
    })
  },
  motivationCard: {
    padding: 20, borderRadius: 20,
    borderWidth: 1, borderColor: '#FEF3C7',
  },
  healthInfoCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  healthInfoText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  motivationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  motivationTitle: { fontSize: 18, fontWeight: '800', color: '#B45309' },
  motivationText: { fontSize: 18, color: '#92400E', lineHeight: 24, fontWeight: '500' },
  dailyChallengeCard: {
    marginHorizontal: 20, marginBottom: 16, borderRadius: 24,
    overflow: 'hidden', borderWidth: 1
  },
  dailyChallengeGradient: { padding: 24 },
  challengeIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  challengeIconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  challengeTextGroup: { flex: 1 },
  challengeTitle: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  challengeDesc: { fontSize: 18, fontWeight: '600' },
  completedBadge: { marginLeft: 12 },
  challengeProgressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  challengeDots: { flexDirection: 'row', gap: 8 },
  challengeDot: { width: 40, height: 8, borderRadius: 4 },
  challengeStatus: { fontSize: 18, fontWeight: '800' },
  funSection: {
    paddingVertical: 24, marginBottom: 16, borderRadius: 24,
    marginHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    }),
    borderWidth: 1,
  },
  funScrollContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16
  },
  funCard: {
    borderRadius: 20, marginRight: 16, width: 220,
    borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
      }
    })
  },
  funCardHeader: {
    height: 100, justifyContent: 'center', alignItems: 'center'
  },
});