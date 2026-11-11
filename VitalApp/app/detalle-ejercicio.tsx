import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    Dimensions,
    Modal,
    ActivityIndicator,
    StatusBar,
    Platform,
    Linking
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import VideoPlayer from '../components/VideoPlayer';
import * as Speech from 'expo-speech';
import { getVideoIdForExercise } from '../constants/exercises';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';

// Señales de alarma para detener el ejercicio (Capítulo 2, ejercicio terapéutico multicomponente)
const SENALES_ALARMA = [
    'Dolor o presión en el pecho',
    'Mareo o sensación de desmayo',
    'Falta de aire fuera de lo normal',
    'Dolor fuerte en una articulación',
    'Latidos muy rápidos o irregulares',
    'Cansancio extremo',
];

// Escala de esfuerzo percibido de Borg simplificada 0–10 (RD04)
const ESCALA_ESFUERZO = [
    { valor: 0, texto: 'Nada' }, { valor: 1, texto: 'Muy ligero' }, { valor: 2, texto: 'Muy ligero' },
    { valor: 3, texto: 'Ligero' }, { valor: 4, texto: 'Ligero' }, { valor: 5, texto: 'Moderado' },
    { valor: 6, texto: 'Moderado' }, { valor: 7, texto: 'Fuerte' }, { valor: 8, texto: 'Fuerte' },
    { valor: 9, texto: 'Muy fuerte' }, { valor: 10, texto: 'Máximo' },
];

const { width } = Dimensions.get('window');

// Instrucciones paso a paso según el tipo de ejercicio; se muestran en texto y se leen en voz alta
function obtenerPasos(nombre: string): string[] {
    const n = (nombre || '').toLowerCase();
    let pasos = [
        'Busca un espacio cómodo y seguro donde puedas moverte sin obstáculos.',
        'Sigue los movimientos del instructor en el video a tu propio ritmo.',
        'Respira profundamente y no contengas la respiración.',
        'Si sientes fatiga extrema, pausa el video y descansa.'
    ];
    if (n.includes('respiraci') || n.includes('diafragm') || n.includes('meditaci')) {
        pasos = [
            'Siéntate cómodamente con la espalda recta y los pies apoyados en el suelo.',
            'Inhala lentamente por la nariz durante 4 segundos, llenando el abdomen.',
            'Mantén el aire 2 segundos y exhala suavemente por la boca durante 6 segundos.',
            'Repite el ciclo sin forzar. La calma llega con la práctica constante.'
        ];
    } else if (n.includes('hombro') || n.includes('círculo') || n.includes('circulo') || n.includes('cuello')) {
        pasos = [
            'Siéntate o párate con la espalda recta y los hombros relajados.',
            'Realiza círculos lentos con los hombros hacia atrás, luego hacia adelante.',
            'Mueve la cabeza suavemente de lado a lado sin forzar el cuello.',
            'Si sientes tensión excesiva, reduce el rango de movimiento.'
        ];
    } else if (n.includes('estiramiento') || n.includes('lateral') || n.includes('espalda') || n.includes('relaj')) {
        pasos = [
            'Colócate en una posición cómoda, de pie o sentado.',
            'Realiza el estiramiento suavemente, sin rebotes ni movimientos bruscos.',
            'Mantén cada posición entre 15 y 30 segundos respirando con calma.',
            'Nunca estires hasta sentir dolor; la sensación debe ser de tensión leve.'
        ];
    } else if (n.includes('caminata') || n.includes('marcha') || n.includes('paso') || n.includes('tobillo')) {
        pasos = [
            'Párate cerca de una silla o pared por si necesitas apoyo.',
            'Levanta las rodillas de forma alternada a un ritmo cómodo para ti.',
            'Mantén la espalda erguida y los brazos moviéndose con naturalidad.',
            'Regula tu velocidad según tu nivel de energía del día.'
        ];
    } else if (n.includes('equilibrio') || n.includes('sentadilla')) {
        pasos = [
            'Párate frente a una silla robusta que puedas sujetar si pierdes el equilibrio.',
            'Levanta un pie lentamente y mantén la posición el mayor tiempo posible.',
            'Cambia de pie y repite. Con el tiempo irás mejorando la estabilidad.',
            'No te frustres si al inicio es difícil; el equilibrio mejora con práctica.'
        ];
    } else if (n.includes('yoga') || n.includes('meditaci')) {
        pasos = [
            'Prepara un espacio tranquilo y sin distracciones.',
            'Sigue las posturas del video a tu propio ritmo, sin competir.',
            'La respiración es clave: inhala al estirarte, exhala al relajarte.',
            'Termina la sesión con unos minutos de quietud y gratitud.'
        ];
    } else if (n.includes('brazo') || n.includes('biceps') || n.includes('bíceps') || n.includes('pesas') || n.includes('curl') || n.includes('press') || n.includes('elevaci')) {
        pasos = [
            'Usa pesas ligeras (0.5 a 1 kg). Si no tienes, usa botellas de agua.',
            'Mantén los codos pegados al cuerpo durante todo el movimiento.',
            'Sube el peso en 2 segundos y bájalo en 4 segundos de forma controlada.',
            'Descansa 30 segundos entre cada serie. La forma es más importante que el peso.'
        ];
    }
    return pasos;
}

export default function DetalleEjercicioScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { colors, temaOscuro } = useTheme();
    const [completado, setCompletado] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [segundosVistos, setSegundosVistos] = useState(0);
    // Seguridad: aviso previo obligatorio, botón de paro y esfuerzo percibido al terminar
    // En una rutina el aviso y el calentamiento solo se muestran en el primer ejercicio
    const [seguridadAceptada, setSeguridadAceptada] = useState(!!params.index && params.index !== '0');
    const [detenido, setDetenido] = useState(false);
    const [alarmaVisible, setAlarmaVisible] = useState(false);
    const [esfuerzoVisible, setEsfuerzoVisible] = useState(false);





    const getParamString = (value: string | string[] | undefined): string => {
        if (Array.isArray(value)) return value[0] || '';
        return value || '';
    };

    // Parsing params for routine support
    const routineData = params.routine ? JSON.parse(getParamString(params.routine)) : null;
    const currentIndex = parseInt(getParamString(params.index)) || 0;

    const ejercicio = {
        id: getParamString(params.id),
        nombre: getParamString(params.nombre) || 'Ejercicio',
        descripcion: getParamString(params.descripcion),
        duracion: parseInt(getParamString(params.duracion)) || 60,
        dificultad: getParamString(params.dificultad) || 'Normal',
        url: decodeURIComponent(getParamString(params.url)),
        idVideo: parseInt(getParamString(params.id_video)) || null,
        contraindicaciones: getParamString(params.contraindicaciones),
        fuente: getParamString(params.fuente)
    };
    const pasos = obtenerPasos(ejercicio.nombre);

    // RF08 / RNF04: las instrucciones también se escuchan (voz del sistema, sin archivos de audio)
    const [hablando, setHablando] = useState(false);
    const escucharInstrucciones = () => {
        if (hablando) {
            Speech.stop();
            setHablando(false);
            return;
        }
        const texto = [`${ejercicio.nombre}.`, ...pasos.map((p, i) => `Paso ${i + 1}. ${p}`)].join(' ');
        setHablando(true);
        Speech.speak(texto, {
            language: 'es-MX',
            rate: 0.85,
            onDone: () => setHablando(false),
            onStopped: () => setHablando(false),
            onError: () => setHablando(false),
        });
    };
    useEffect(() => () => { Speech.stop(); }, []);

    // Guarda la sesión en la BD (RF registro de sesión). Los ejercicios de rutinas
    // predefinidas no tienen video en la BD y se guardan por nombre.
    const registrarSesion = async (completada: boolean, esfuerzo: number | null, comentarios: string | null) => {
        try {
            await fetchSeguro(`${API_URL}/ejercicio-realizado`, {
                method: 'POST',
                body: JSON.stringify({
                    id_video: ejercicio.idVideo,
                    nombre_ejercicio: ejercicio.nombre,
                    duracion_segundos: Math.round(segundosVistos),
                    calorias_quemadas: completada ? Math.max(5, Math.floor(ejercicio.duracion / 60) * 4) : null,
                    nivel_esfuerzo: esfuerzo,
                    completado: completada ? 1 : 0,
                    comentarios,
                }),
            });
        } catch (error) {
            console.log('No se pudo registrar la sesión en la BD:', error);
        }
    };

    const detenerEjercicio = () => {
        Speech.stop();
        setDetenido(true);
        setAlarmaVisible(true);
    };

    const terminarDetenido = async (conSintomas: boolean) => {
        await registrarSesion(false, null, conSintomas ? 'Detenida por señal de alarma' : 'Detenida por el usuario');
        setAlarmaVisible(false);
        if (conSintomas) {
            avisar(
                'Descansa y busca ayuda',
                'Siéntate en un lugar seguro y avisa a un familiar. Si tienes dolor en el pecho, falta de aire o te sientes a punto de desmayarte, llama al 911.',
                () => router.back()
            );
        } else {
            router.back();
        }
    };

    const guardarEsfuerzo = async (valor: number) => {
        setEsfuerzoVisible(false);
        await registrarSesion(true, valor, null);
        setCelebrationVisible(true);
    };

    // Anti-trampa: requiere ver al menos 1/3 de la duración real del video
    const TIEMPO_MINIMO = Math.max(15, Math.floor(ejercicio.duracion / 3));

    const [celebrationVisible, setCelebrationVisible] = useState(false);

    const irAlSiguiente = () => {
        if (segundosVistos < TIEMPO_MINIMO) {
            console.log('Video terminado demasiado pronto, no se avanza automáticamente');
            return;
        }

        if (routineData && currentIndex < routineData.exercises.length - 1) {
            const nextIndex = currentIndex + 1;
            const nextExercise = routineData.exercises[nextIndex];
            const nextVideoId = nextExercise.url || getVideoIdForExercise(nextExercise.name);
            router.replace({
                pathname: '/detalle-ejercicio',
                params: {
                    id: (nextIndex + 1).toString(),
                    nombre: nextExercise.name,
                    descripcion: `Parte de la rutina: ${routineData.title}`,
                    // Los ejercicios de rutinas del admin traen su duración, video, fuente y contraindicaciones
                    duracion: nextExercise.duracion || '300',
                    dificultad: 'Fácil',
                    url: encodeURIComponent(nextVideoId),
                    id_video: nextExercise.id_video || '',
                    fuente: nextExercise.fuente || '',
                    contraindicaciones: nextExercise.contraindicaciones || '',
                    routine: JSON.stringify(routineData),
                    index: nextIndex.toString()
                }
            });
        } else {
            router.back();
        }
    };

    const handleCompletar = async (forzar = false) => {
        if (!forzar && segundosVistos < TIEMPO_MINIMO) {
            avisar(
                'Tiempo insuficiente', 
                `Para asegurar la efectividad del ejercicio, se requiere una duración mínima de ${TIEMPO_MINIMO} segundos.`);
            return;
        }

        setCompletado(true);
        try {
            // Actualizar estadísticas en AsyncStorage
            const statsStr = await AsyncStorage.getItem('userStats');
            const stats = statsStr ? JSON.parse(statsStr) : {
                exercises: 0, calories: 0, minutes: 0,
                weeklyGoal: 0, totalGoal: 3, challenge: '7X4'
            };

            const duracionMin = Math.floor(ejercicio.duracion / 60);
            const caloriasEstimadas = duracionMin * 3; // ~3 cal/min for light exercise

            stats.exercises += 1;
            stats.calories += caloriasEstimadas;
            stats.minutes += duracionMin;
            stats.weeklyGoal = Math.min(stats.weeklyGoal + 1, stats.totalGoal);

            await AsyncStorage.setItem('userStats', JSON.stringify(stats));

            // Actualizar completados hoy
            const hoyStr = await AsyncStorage.getItem('completadosHoy');
            const hoy = parseInt(hoyStr || '0') + 1;
            await AsyncStorage.setItem('completadosHoy', hoy.toString());

            // Actualizar historial semanal
            const historialStr = await AsyncStorage.getItem('weeklyHistory');
            let historial = historialStr ? JSON.parse(historialStr) : [0, 0, 0, 0, 0, 0, 0];
            const dayIndex = new Date().getDay();
            historial[dayIndex] = hoy;
            await AsyncStorage.setItem('weeklyHistory', JSON.stringify(historial));

            // Actualizar racha
            const lastDateStr = await AsyncStorage.getItem('lastExerciseDate');
            const today = new Date().toDateString();
            if (lastDateStr !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const rachaStr = await AsyncStorage.getItem('streakDays');
                let racha = parseInt(rachaStr || '0');
                if (lastDateStr === yesterday.toDateString()) {
                    racha += 1;
                } else {
                    racha = 1;
                }
                await AsyncStorage.setItem('streakDays', racha.toString());
                await AsyncStorage.setItem('lastExerciseDate', today);
            }
        } catch (error) {
            console.log('Error guardando progreso:', error);
        }

        // Antes de celebrar se pide el esfuerzo percibido; al elegirlo se guarda la sesión
        setEsfuerzoVisible(true);
        
        // El modal de celebración se encargará de avanzar o volver
    };

    const getYouTubeId = (url: string) => {
        if (!url) return null;
        const cleanUrl = url.trim();
        if (cleanUrl.length === 11) return cleanUrl;
        
        // Expresión regular robusta para varios formatos
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = cleanUrl.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
        
        // Fallback manual si el regex falla
        if (cleanUrl.includes('v=')) return cleanUrl.split('v=')[1].split('&')[0].substring(0, 11);
        if (cleanUrl.includes('youtu.be/')) return cleanUrl.split('youtu.be/')[1].split('?')[0].substring(0, 11);
        if (cleanUrl.includes('embed/')) return cleanUrl.split('embed/')[1].split('?')[0].substring(0, 11);
        
        return null;
    };

    const videoId = getYouTubeId(ejercicio.url) || getVideoIdForExercise(ejercicio.nombre);

    // Soporte para seguimiento de tiempo en Web o sin video
    useEffect(() => {
        let interval: any;
        if ((Platform.OS === 'web' || !videoId) && !cargando && seguridadAceptada && !detenido) {
            interval = setInterval(() => {
                setSegundosVistos(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [cargando, videoId, seguridadAceptada, detenido]);

    useEffect(() => {
        if (!videoId) setCargando(false);
    }, [videoId]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
            
            {/* Cabecera pegajosa */}
            <View style={[styles.topHeader, { backgroundColor: colors.bg, borderBottomColor: colors.cardBorder, borderBottomWidth: 1 }]}>
                <TouchableOpacity onPress={() => {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/ejercicios');
                    }
                }} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.topHeaderTitle, { color: colors.text }]} numberOfLines={1}>{ejercicio.nombre}</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={styles.webContainer}>
                {/* Aviso de seguridad previo: el video no aparece hasta aceptarlo */}
                {!seguridadAceptada ? (
                    <View style={[styles.contentSection, { backgroundColor: colors.card, borderColor: '#2563EB', borderWidth: 2, marginTop: 10 }]}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="shield-checkmark" size={30} color="#2563EB" />
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>Antes de empezar</Text>
                        </View>
                        <Text style={[styles.sectionText, { color: colors.text, fontWeight: '700' }]}>1. Calentamiento (3 a 5 minutos)</Text>
                        <Text style={[styles.sectionText, { color: colors.textSecondary, marginBottom: 12 }]}>
                            Marcha suave en tu lugar, gira los hombros y mueve los tobillos. Ten una silla firme cerca.
                        </Text>
                        {!!ejercicio.contraindicaciones && (
                            <>
                                <Text style={[styles.sectionText, { color: colors.text, fontWeight: '700' }]}>2. No hagas este ejercicio si…</Text>
                                <Text style={[styles.sectionText, { color: colors.textSecondary, marginBottom: 12 }]}>{ejercicio.contraindicaciones}</Text>
                            </>
                        )}
                        <Text style={[styles.sectionText, { color: '#B91C1C', fontWeight: '800' }]}>
                            {ejercicio.contraindicaciones ? '3' : '2'}. Detente de inmediato si sientes:
                        </Text>
                        {SENALES_ALARMA.map(senal => (
                            <Text key={senal} style={[styles.sectionText, { color: colors.text }]}>•  {senal}</Text>
                        ))}
                        <TouchableOpacity
                            style={{ backgroundColor: '#1D4ED8', borderRadius: 16, minHeight: 64, justifyContent: 'center', alignItems: 'center', marginTop: 18 }}
                            onPress={() => setSeguridadAceptada(true)}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '800' }}>Ya calenté, empezar</Text>
                        </TouchableOpacity>
                    </View>
                ) : detenido ? (
                    <View style={[styles.contentSection, { backgroundColor: colors.card, borderColor: colors.cardBorder, alignItems: 'center', marginTop: 10 }]}>
                        <Ionicons name="hand-left" size={48} color="#DC2626" />
                        <Text style={[styles.sectionTitle, { color: colors.text, textAlign: 'center' }]}>Ejercicio detenido</Text>
                    </View>
                ) : videoId ? (
                    <>
                        <View style={styles.videoCard}>
                            <View style={styles.videoContainer}>
                                <VideoPlayer 
                                    videoId={videoId} 
                                    onEnd={() => { if (!completado) handleCompletar(false); }} 
                                    onProgress={(segundos) => setSegundosVistos(segundos)}
                                    onReady={() => setCargando(false)}
                                />

                                {cargando && (
                                    <View style={styles.loadingOverlay}>
                                        <ActivityIndicator size="large" color="#3B82F6" />
                                        <Text style={styles.loadingText}>Cargando tu video...</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Botón de fallback por si el video no carga */}
                        <TouchableOpacity 
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: -10, marginBottom: 20, gap: 8 }}
                            onPress={() => {
                                if (typeof window !== 'undefined') {
                                    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
                                } else {
                                    Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
                                }
                            }}
                        >
                            <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' }}>
                                ¿Problemas con el video? Ábrelo en YouTube
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <View style={[styles.contentSection, { backgroundColor: colors.isDark ? '#1E3A8A' : '#EFF6FF', borderColor: colors.isDark ? '#1E40AF' : '#BFDBFE', alignItems: 'center', marginTop: 10 }]}>
                        <Ionicons name="barbell" size={48} color={colors.isDark ? '#60A5FA' : '#2563EB'} style={{ marginBottom: 10 }} />
                        <Text style={[styles.sectionTitle, { color: colors.isDark ? '#93C5FD' : '#1E40AF', textAlign: 'center' }]}>Ejercicio sin video</Text>
                        <Text style={[styles.sectionText, { color: colors.isDark ? '#BFDBFE' : '#1E3A8A', textAlign: 'center', marginTop: 5 }]}>
                            Sigue las instrucciones paso a paso que aparecen más abajo. El temporizador avanzará automáticamente.
                        </Text>
                    </View>
                )}

                {/* Info Principal */}
                <View style={styles.heroSection}>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>{ejercicio.nombre}</Text>
                    
                    <View style={styles.badgesRow}>
                        <View style={[styles.badge, { backgroundColor: colors.settingIconBg }]}>
                            <Ionicons name="time" size={20} color={colors.isDark ? '#60A5FA' : '#2563EB'} />
                            <Text style={[styles.badgeText, { color: colors.isDark ? '#60A5FA' : '#2563EB' }]}>{Math.floor(ejercicio.duracion / 60)} min</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: colors.isDark ? '#064E3B' : '#F0FDF4' }]}>
                            <Ionicons name="bar-chart" size={20} color={colors.isDark ? '#34D399' : '#16A34A'} />
                            <Text style={[styles.badgeText, { color: colors.isDark ? '#34D399' : '#16A34A' }]}>{ejercicio.dificultad}</Text>
                        </View>
                    </View>
                </View>

                {/* Métricas dinámicas reales */}
                <View style={styles.metricsGrid}>
                    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.metricValue, { color: colors.isDark ? '#60A5FA' : '#1E3A8A' }]}>
                            {ejercicio.duracion >= 60 
                                ? `${Math.floor(ejercicio.duracion / 60)}:${String(ejercicio.duracion % 60).padStart(2, '0')}`
                                : `${ejercicio.duracion}s`}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Duración</Text>
                    </View>
                    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.metricValue, { color: colors.isDark ? '#60A5FA' : '#1E3A8A' }]}>
                            {Math.max(5, Math.floor(ejercicio.duracion / 60) * 4)}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Cal. estimadas</Text>
                    </View>
                    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.metricValue, { color: colors.isDark ? '#34D399' : '#059669', fontSize: 18 }]}>
                            {Math.floor(TIEMPO_MINIMO / 60) > 0 
                                ? `${Math.floor(TIEMPO_MINIMO / 60)}:${String(TIEMPO_MINIMO % 60).padStart(2, '0')}`
                                : `${TIEMPO_MINIMO}s`}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Mín. requerido</Text>
                    </View>
                </View>

                {/* Descripción */}
                <View style={[styles.contentSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="information-circle" size={28} color="#2563EB" />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>¿De qué trata?</Text>
                    </View>
                    <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
                        {ejercicio.descripcion || 'Este ejercicio está cuidadosamente diseñado para cuidar tus articulaciones y mejorar tu calidad de vida diaria.'}
                    </Text>
                    {!!ejercicio.fuente && (
                        <Text style={[styles.sectionText, { color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 }]}>
                            Fuente: {ejercicio.fuente}
                        </Text>
                    )}
                </View>

                {/* Paso a paso - Dinámico por tipo de ejercicio */}
                <View style={[styles.contentSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="list" size={28} color="#2563EB" />
                        <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>Instrucciones paso a paso</Text>
                    </View>
                    <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: 14, borderWidth: 2, borderColor: '#2563EB', marginBottom: 14 }}
                        onPress={escucharInstrucciones}
                        accessibilityLabel={hablando ? 'Detener la lectura' : 'Escuchar las instrucciones'}
                    >
                        <Ionicons name={hablando ? 'volume-mute' : 'volume-high'} size={28} color="#2563EB" />
                        <Text style={{ fontSize: 19, fontWeight: '800', color: '#2563EB' }}>
                            {hablando ? 'Detener lectura' : 'Escuchar instrucciones'}
                        </Text>
                    </TouchableOpacity>
                    
                    <View style={styles.stepsContainer}>
                        {pasos.map((paso, index) => (
                            <View key={index} style={styles.stepItem}>
                                <View style={[styles.stepNumberCircle, { backgroundColor: colors.settingIconBg }]}>
                                    <Text style={[styles.stepNumberText, { color: colors.isDark ? '#60A5FA' : '#2563EB' }]}>{index + 1}</Text>
                                </View>
                                <Text style={[styles.stepText, { color: colors.textSecondary }]}>{paso}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Precauciones (Alerta amigable) */}
                <View style={[styles.warningCard, colors.isDark && { backgroundColor: '#451a03', borderColor: '#92400e' }]}>
                    <View style={styles.warningHeader}>
                        <Ionicons name="warning" size={28} color="#D97706" />
                        <Text style={[styles.warningTitle, colors.isDark && { color: '#fbbf24' }]}>Precaución Importante</Text>
                    </View>
                    <Text style={[styles.warningText, colors.isDark && { color: '#fcd34d' }]}>
                        Si en algún momento sientes dolor agudo o mareos, detén el ejercicio inmediatamente. Siempre escucha a tu cuerpo.
                    </Text>
                </View>

                {seguridadAceptada && !detenido && (
                <>
                <TouchableOpacity 
                    style={[
                        styles.mainButton, 
                        completado && styles.mainButtonSuccess,
                        (!completado && segundosVistos < TIEMPO_MINIMO) && { opacity: 0.7 }
                    ]}
                    onPress={() => {
                        if (completado) {
                            if (router.canGoBack()) router.back();
                            else router.replace('/(tabs)/ejercicios');
                        } else {
                            handleCompletar(false);
                        }
                    }}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={completado ? ['#059669', '#10B981'] : (segundosVistos < TIEMPO_MINIMO ? ['#64748B', '#94A3B8'] : [colors.gradientStart, colors.gradientEnd])}
                        style={styles.buttonGradient}
                    >
                        <Ionicons 
                            name={completado ? "checkmark-circle" : (segundosVistos < TIEMPO_MINIMO ? "time-outline" : (routineData ? "arrow-forward-circle" : "checkmark-done-circle"))} 
                            size={28} 
                            color="#FFFFFF" 
                        />
                        <Text style={styles.mainButtonText}>
                            {completado 
                                ? 'Ejercicio completado' 
                                : segundosVistos < TIEMPO_MINIMO 
                                    ? `Tiempo restante (${TIEMPO_MINIMO - segundosVistos}s)`
                                    : (routineData ? 'Siguiente ejercicio' : 'Marcar como completado')
                            }
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>

                {/* Botón para terminar antes */}
                {!completado && segundosVistos < TIEMPO_MINIMO && (
                    <TouchableOpacity 
                        style={{ marginTop: 15, alignItems: 'center', marginBottom: 20 }}
                        onPress={() => handleCompletar(true)}
                    >
                        <Text style={{ color: colors.textSecondary, fontSize: 16, textDecorationLine: 'underline', fontWeight: '600' }}>
                            Ya terminé (Saltar temporizador)
                        </Text>
                    </TouchableOpacity>
                )}
                </>
                )}
                </View>
            </ScrollView>

            {/* Botón de paro: siempre visible mientras el ejercicio está en curso */}
            {seguridadAceptada && !detenido && !completado && (
                <View style={[styles.barraDetener, { backgroundColor: colors.bg, borderTopColor: colors.cardBorder }]}>
                    <TouchableOpacity
                        style={styles.botonDetener}
                        onPress={detenerEjercicio}
                        accessibilityLabel="Detener el ejercicio"
                    >
                        <Ionicons name="stop-circle" size={34} color="#FFFFFF" />
                        <Text style={styles.botonDetenerTexto}>DETENER</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Modal de señales de alarma al detener */}
            <Modal visible={alarmaVisible} transparent animationType="fade">
                <View style={styles.celebrationOverlay}>
                    <View style={[styles.celebrationCard, { backgroundColor: colors.card, padding: 24 }]}>
                        <Ionicons name="alert-circle" size={56} color="#DC2626" style={{ alignSelf: 'center' }} />
                        <Text style={[styles.celebrationTitle, { color: colors.text }]}>¿Cómo te sientes?</Text>
                        <Text style={[styles.sectionText, { color: colors.textSecondary, marginBottom: 8 }]}>¿Tienes alguno de estos síntomas?</Text>
                        {SENALES_ALARMA.map(senal => (
                            <Text key={senal} style={[styles.sectionText, { color: colors.text }]}>•  {senal}</Text>
                        ))}
                        <TouchableOpacity
                            style={[styles.botonDetener, { marginTop: 18 }]}
                            onPress={() => terminarDetenido(true)}
                        >
                            <Text style={styles.botonDetenerTexto}>Sí, me siento mal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.botonDetener, { backgroundColor: '#475569', marginTop: 12 }]}
                            onPress={() => terminarDetenido(false)}
                        >
                            <Text style={styles.botonDetenerTexto}>No, solo quiero terminar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal de esfuerzo percibido + enfriamiento al completar */}
            <Modal visible={esfuerzoVisible} transparent animationType="fade">
                <View style={styles.celebrationOverlay}>
                    <View style={[styles.celebrationCard, { backgroundColor: colors.card, padding: 24 }]}>
                        <Text style={[styles.celebrationTitle, { color: colors.text }]}>¿Qué tan pesado fue?</Text>
                        <Text style={[styles.sectionText, { color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }]}>
                            0 es nada de esfuerzo y 10 es el máximo que puedes dar.
                        </Text>
                        <View style={styles.gridEsfuerzo}>
                            {ESCALA_ESFUERZO.map(e => (
                                <TouchableOpacity
                                    key={e.valor}
                                    style={[styles.botonEsfuerzo, { borderColor: colors.cardBorder, backgroundColor: e.valor >= 7 ? '#FEE2E2' : e.valor >= 5 ? '#FEF3C7' : '#DCFCE7' }]}
                                    onPress={() => guardarEsfuerzo(e.valor)}
                                >
                                    <Text style={styles.botonEsfuerzoNumero}>{e.valor}</Text>
                                    <Text style={styles.botonEsfuerzoTexto}>{e.texto}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={[styles.sectionText, { color: colors.text, marginTop: 14, fontWeight: '700' }]}>
                            Enfriamiento: camina despacio 2 a 3 minutos y respira profundo antes de sentarte.
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* Modal de Video Pantalla Completa */}
            <Modal
                visible={modalVisible}
                transparent={false}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <SafeAreaView style={styles.fullscreenContainer}>
                    <TouchableOpacity 
                        style={styles.closeFullscreenBtn}
                        onPress={() => setModalVisible(false)}
                    >
                        <Ionicons name="close" size={32} color="#FFFFFF" />
                    </TouchableOpacity>
                    {Platform.OS === 'web' ? (
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}?playsinline=1`}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <WebView
                            style={styles.fullscreenVideo}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            allowsFullscreenVideo={true}
                            source={{ uri: `https://www.youtube.com/embed/${videoId}?playsinline=1` }}
                        />
                    )}
                </SafeAreaView>
            </Modal>

            {/* Modal de Celebración - NUEVO */}
            <Modal
                visible={celebrationVisible}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.celebrationOverlay}>
                    <View style={[styles.celebrationCard, { backgroundColor: colors.card }]}>
                        <LinearGradient
                            colors={['#059669', '#10B981']}
                            style={styles.celebrationHeader}
                        >
                            <Ionicons name="trophy" size={80} color="#FFFFFF" />
                        </LinearGradient>
                        
                        <View style={styles.celebrationContent}>
                            <Text style={[styles.celebrationTitle, { color: colors.text }]}>¡Excelente Trabajo!</Text>
                            <Text style={[styles.celebrationSubtitle, { color: colors.textSecondary }]}>
                                Has completado: {ejercicio.nombre}
                            </Text>
                            
                            <View style={styles.statsRow}>
                                <View style={styles.miniStat}>
                                    <Text style={styles.miniStatValue}>+{Math.floor(ejercicio.duracion / 60)}</Text>
                                    <Text style={styles.miniStatLabel}>Min</Text>
                                </View>
                                <View style={styles.miniStat}>
                                    <Text style={styles.miniStatValue}>+{Math.max(5, Math.floor(ejercicio.duracion / 60) * 4)}</Text>
                                    <Text style={styles.miniStatLabel}>Kcal</Text>
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={styles.continueButton}
                                onPress={() => {
                                    setCelebrationVisible(false);
                                    irAlSiguiente();
                                }}
                            >
                                <Text style={styles.continueButtonText}>
                                    {routineData && currentIndex < routineData.exercises.length - 1 
                                        ? 'Siguiente Ejercicio' 
                                        : 'Finalizar Rutina'}
                                </Text>
                                <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    barraDetener: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    botonDetener: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#DC2626',
        borderRadius: 16,
        minHeight: 64,
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
    },
    botonDetenerTexto: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
    },
    gridEsfuerzo: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
    },
    botonEsfuerzo: {
        width: 84,
        minHeight: 64,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 4,
    },
    botonEsfuerzoNumero: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1E293B',
    },
    botonEsfuerzoTexto: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
        textAlign: 'center',
    },
    safeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#F8FAFC',
    },
    backButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    topHeaderTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1E293B',
        flex: 1,
        textAlign: 'center',
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    webContainer: {
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
    },
    videoCard: {
        marginHorizontal: 20,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#000000',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
            }
        }),
        marginBottom: 24,
    },
    videoContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        position: 'relative',
    },
    video: {
        flex: 1,
    },
    fullscreenBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 12,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
    },
    loadingText: {
        marginTop: 12,
        color: '#F8FAFC',
        fontSize: 16,
        fontWeight: '600',
    },
    heroSection: {
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    heroTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#1E293B',
        marginBottom: 16,
        lineHeight: 38,
    },
    badgesRow: {
        flexDirection: 'row',
        gap: 12,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 16,
        gap: 8,
    },
    badgeText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2563EB',
    },
    metricsGrid: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 16,
        marginBottom: 24,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 20,
        alignItems: 'center',
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
        borderColor: '#E2E8F0',
    },
    metricValue: {
        fontSize: 32,
        fontWeight: '900',
        color: '#1E3A8A',
        marginBottom: 4,
    },
    metricLabel: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
    },
    contentSection: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        padding: 24,
        borderRadius: 24,
        marginBottom: 20,
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
        borderColor: '#E2E8F0',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1E293B',
    },
    sectionText: {
        fontSize: 18,
        color: '#475569',
        lineHeight: 28,
        fontWeight: '400',
    },
    stepsContainer: {
        marginTop: 8,
    },
    stepItem: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    stepNumberCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        marginTop: 2,
    },
    stepNumberText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#2563EB',
    },
    stepText: {
        flex: 1,
        fontSize: 18,
        color: '#475569',
        lineHeight: 28,
    },
    warningCard: {
        backgroundColor: '#FFFBEB',
        marginHorizontal: 20,
        padding: 24,
        borderRadius: 24,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: '#FEF3C7',
    },
    warningHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 10,
    },
    warningTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#B45309',
    },
    warningText: {
        fontSize: 17,
        color: '#92400E',
        lineHeight: 26,
        fontWeight: '500',
    },
    celebrationOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    celebrationCard: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 32,
        overflow: 'hidden',
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
    },
    celebrationHeader: {
        width: '100%',
        paddingVertical: 40,
        alignItems: 'center',
    },
    celebrationContent: {
        padding: 32,
        alignItems: 'center',
        width: '100%',
    },
    celebrationTitle: {
        fontSize: 28,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 8,
    },
    celebrationSubtitle: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 32,
        marginBottom: 32,
    },
    miniStat: {
        alignItems: 'center',
    },
    miniStatValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#059669',
    },
    miniStatLabel: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '700',
    },
    continueButton: {
        backgroundColor: '#059669',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        paddingHorizontal: 32,
        borderRadius: 20,
        width: '100%',
        gap: 12,
    },
    continueButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '800',
    },
    mainButton: {
        marginHorizontal: 20,
        borderRadius: 24,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#2563EB',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
            },
            android: {
                elevation: 6,
            },
            web: {
                boxShadow: '0 8px 16px rgba(37, 99, 235, 0.2)',
            }
        }),
    },
    mainButtonSuccess: {
        shadowColor: '#059669',
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        paddingHorizontal: 24,
        gap: 12,
    },
    mainButtonText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
    },
    fullscreenContainer: {
        flex: 1,
        backgroundColor: '#000000',
    },
    fullscreenVideo: {
        flex: 1,
    },
    closeFullscreenBtn: {
        position: 'absolute',
        top: 40,
        left: 20,
        zIndex: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 12,
        borderRadius: 20,
    },
});