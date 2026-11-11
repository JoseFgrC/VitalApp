import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    ActivityIndicator,
    Dimensions,
    StatusBar,
    Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuInferior from '../components/MenuInferior';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');

// --- Componente de gráfica de pastel (donut) dinámica ---
function DonutChart({ size = 120, strokeWidth = 12, percentage = 0, color = '#2563EB', label = '', value = '', oscuro = false }: {
    size?: number; strokeWidth?: number; percentage?: number; color?: string; label?: string; value?: string; oscuro?: boolean;
}) {
    // Colores del texto según el tema (contraste ≥ 4.5:1 sobre la tarjeta)
    const colorNumero = oscuro ? '#F1F5F9' : '#1E293B';
    const colorEtiqueta = oscuro ? '#CBD5E1' : '#475569';
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (circumference * Math.min(percentage, 100)) / 100;
    const center = size / 2;

    return (
        <View style={{ alignItems: 'center' }}>
            <Svg width={size} height={size}>
                <Circle cx={center} cy={center} r={radius} stroke={oscuro ? '#334155' : '#F1F5F9'} strokeWidth={strokeWidth} fill="none" />
                <Circle
                    cx={center} cy={center} r={radius}
                    stroke={color} strokeWidth={strokeWidth} fill="none"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90" origin={`${center}, ${center}`}
                />
                <SvgText x={center} y={center - 6} textAnchor="middle" fontSize={size * 0.22} fontWeight="900" fill={colorNumero}>
                    {value}
                </SvgText>
                <SvgText x={center} y={center + 14} textAnchor="middle" fontSize={Math.max(18, size * 0.11)} fontWeight="600" fill={colorEtiqueta}>
                    {label}
                </SvgText>
            </Svg>
        </View>
    );
}

export default function EstadisticasScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [cargando, setCargando] = useState(true);
    const [periodoSeleccionado, setPeriodoSeleccionado] = useState('semana');
    const [estadisticas, setEstadisticas] = useState({
        totalEjercicios: 0,
        completados: 0,
        racha: 0,
        puntos: 0,
        calorias: 0,
        minutos: 0,
        progresoSemanal: [0, 0, 0, 0, 0, 0, 0],
        esfuerzoPromedio: null as number | null,
        detenidas: 0,
        // Meta de días por semana: los días de sus recordatorios activos, o 5 si no tiene
        metaDias: 5,
        logros: [
            { id: 1, nombre: 'Primer paso', icono: '🌟', desbloqueado: false, condicion: 1, tipo: 'ejercicios' },
            { id: 2, nombre: '5 días seguidos', icono: '🔥', desbloqueado: false, condicion: 5, tipo: 'racha' },
            { id: 3, nombre: '10 ejercicios', icono: '🎯', desbloqueado: false, condicion: 10, tipo: 'ejercicios' },
            { id: 4, nombre: '25 ejercicios', icono: '💎', desbloqueado: false, condicion: 25, tipo: 'ejercicios' },
            { id: 5, nombre: '50 ejercicios', icono: '👑', desbloqueado: false, condicion: 50, tipo: 'ejercicios' },
        ]
    });

    // Cargar datos cada vez que la pantalla tiene foco
    useFocusEffect(
        useCallback(() => {
            cargarEstadisticas();
        }, [])
    );

    const cargarEstadisticas = async () => {
        try {
            setCargando(true);

            // Leer progreso real desde AsyncStorage
            const statsStr = await AsyncStorage.getItem('userStats');
            const puntosStr = await AsyncStorage.getItem('userPoints');
            const completadosHoyStr = await AsyncStorage.getItem('completadosHoy');
            const historialStr = await AsyncStorage.getItem('weeklyHistory');
            const rachaStr = await AsyncStorage.getItem('streakDays');

            const stats = statsStr ? JSON.parse(statsStr) : null;
            const puntos = parseInt(puntosStr || '0');
            const completadosHoy = parseInt(completadosHoyStr || '0');

            // Historial semanal: guardamos un array de 7 días
            let progresoSemanal = [0, 0, 0, 0, 0, 0, 0];
            if (historialStr) {
                try {
                    const historial = JSON.parse(historialStr);
                    progresoSemanal = historial;
                } catch (e) {
                    console.log('Error parsing weekly history');
                }
            }

            // Si hay stats del home, usarlos para actualizar el día actual en el historial
            if (stats && completadosHoy > 0) {
                const dayIndex = new Date().getDay(); // 0=Dom, 1=Lun...
                progresoSemanal[dayIndex] = completadosHoy;
                await AsyncStorage.setItem('weeklyHistory', JSON.stringify(progresoSemanal));
            }

            let totalEjercicios = stats ? stats.exercises : 0;
            let racha = parseInt(rachaStr || '0');
            let calorias = stats ? stats.calories : 0;
            let minutos = stats ? stats.minutes : 0;
            let esfuerzoPromedio: number | null = null;
            let detenidas = 0;

            // RF11: el progreso real viene de las sesiones guardadas en la BD; lo local queda como respaldo sin conexión
            try {
                const res = await fetchSeguro(`${API_URL}/progreso`);
                const data = await res.json();
                if (data.success) {
                    totalEjercicios = data.totales.completadas;
                    racha = data.racha;
                    calorias = data.totales.calorias;
                    minutos = data.totales.minutos;
                    esfuerzoPromedio = data.totales.esfuerzo_promedio;
                    detenidas = data.totales.detenidas;
                    progresoSemanal = data.semana;
                }
            } catch (error) {
                console.log('Sin conexión, mostrando progreso guardado en el teléfono:', error);
            }

            // Meta de días: los días distintos de sus recordatorios activos (RF13); si no tiene, 5
            // (la OMS recomienda actividad física la mayoría de los días de la semana)
            let metaDias = 5;
            try {
                const resRec = await fetchSeguro(`${API_URL}/recordatorios`);
                const dataRec = await resRec.json();
                if (dataRec.success) {
                    const dias = new Set<string>();
                    (dataRec.recordatorios || []).filter((r: any) => r.activo).forEach((r: any) => r.dias.forEach((d: string) => dias.add(d)));
                    if (dias.size > 0) metaDias = dias.size;
                }
            } catch (error) {
                console.log('No se pudieron leer los recordatorios para la meta:', error);
            }

            // Meta: totalGoal es la meta semanal, weeklyGoal es lo logrado
            const metaTotal = stats ? (stats.totalGoal || 3) : 3;
            const hydrationStr = await AsyncStorage.getItem('userHydration');
            const hydration = parseInt(hydrationStr || '0');

            // Calcular logros dinámicamente
            const logrosActualizados = [
                { id: 1, nombre: 'Primer paso', icono: '🌟', desbloqueado: totalEjercicios >= 1, condicion: 1, tipo: 'ejercicios' },
                { id: 2, nombre: '5 días seguidos', icono: '🔥', desbloqueado: racha >= 5, condicion: 5, tipo: 'racha' },
                { id: 3, nombre: '10 ejercicios', icono: '🎯', desbloqueado: totalEjercicios >= 10, condicion: 10, tipo: 'ejercicios' },
                { id: 4, nombre: '25 ejercicios', icono: '💎', desbloqueado: totalEjercicios >= 25, condicion: 25, tipo: 'ejercicios' },
                { id: 5, nombre: '50 ejercicios', icono: '👑', desbloqueado: totalEjercicios >= 50, condicion: 50, tipo: 'ejercicios' },
                { id: 6, nombre: 'Hidratación Ideal', icono: '💧', desbloqueado: hydration >= 8, condicion: 8, tipo: 'hidratación' },
                { id: 7, nombre: 'Maestro del Bienestar', icono: '🏆', desbloqueado: totalEjercicios >= 100, condicion: 100, tipo: 'ejercicios' },
                { id: 8, nombre: 'Racha Dorada', icono: '✨', desbloqueado: racha >= 15, condicion: 15, tipo: 'racha' },
                { id: 9, nombre: 'Súper Atleta', icono: '⚡', desbloqueado: totalEjercicios >= 75, condicion: 75, tipo: 'ejercicios' },
            ];

            setEstadisticas({
                totalEjercicios: Math.max(metaTotal, totalEjercicios),
                completados: totalEjercicios,
                racha,
                puntos: puntos + (totalEjercicios * 10) + (hydration * 5),
                calorias,
                minutos,
                progresoSemanal,
                esfuerzoPromedio,
                detenidas,
                metaDias,
                logros: logrosActualizados
            });

        } catch (error) {
            console.log('Error cargando estadísticas:', error);
        } finally {
            setCargando(false);
        }
    };

    // Calcular racha dinámica: actualizar al entrar
    const actualizarRacha = async () => {
        try {
            const lastDateStr = await AsyncStorage.getItem('lastExerciseDate');
            const rachaStr = await AsyncStorage.getItem('streakDays');
            const today = new Date().toDateString();

            if (lastDateStr === today) return; // Ya contó hoy

            const completadosHoy = await AsyncStorage.getItem('completadosHoy');
            if (parseInt(completadosHoy || '0') > 0) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                let racha = parseInt(rachaStr || '0');
                if (lastDateStr === yesterday.toDateString()) {
                    racha += 1; // Día consecutivo
                } else if (lastDateStr !== today) {
                    racha = 1; // Reinicia racha
                }

                await AsyncStorage.setItem('streakDays', racha.toString());
                await AsyncStorage.setItem('lastExerciseDate', today);
            }
        } catch (error) {
            console.log('Error actualizando racha:', error);
        }
    };

    const porcentajeCompletado = estadisticas.totalEjercicios > 0
        ? Math.min((estadisticas.completados / estadisticas.totalEjercicios) * 100, 100)
        : 0;
    const diasSemana = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const maxProgreso = Math.max(...estadisticas.progresoSemanal, 1);

    if (cargando) {
        return (
            <View style={styles.centeredContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Cargando tu progreso...</Text>
            </View>
        );
    }

    // Días distintos de esta semana con al menos un ejercicio completado
    const diasConEjercicio = (estadisticas.progresoSemanal || []).filter((n: number) => n > 0).length;

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />
            <ScrollView 
                style={[styles.container, { backgroundColor: colors.bg }]}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header Premium */}
                <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    style={styles.headerGradient}
                >
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                        <TouchableOpacity onPress={() => router.push('/home')} style={{marginRight: 16}}>
                            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, {marginBottom: 0}]}>Mi progreso</Text>
                    </View>
                    <Text style={styles.headerSubtitle}>Sigue avanzando cada día, estás haciendo un gran trabajo.</Text>
                    
                    {/* Selector de período */}
                    <View style={styles.periodSelector}>
                        {['semana', 'mes', 'año'].map((periodo) => (
                            <TouchableOpacity
                                key={periodo}
                                style={[
                                    styles.periodButton,
                                    periodoSeleccionado === periodo && styles.periodButtonActive
                                ]}
                                onPress={() => setPeriodoSeleccionado(periodo)}
                                activeOpacity={0.8}
                            >
                                <Text style={[
                                    styles.periodText,
                                    periodoSeleccionado === periodo && styles.periodTextActive
                                ]}>
                                    {periodo.charAt(0).toUpperCase() + periodo.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </LinearGradient>

                {/* Resumen en frases con números grandes (accesibilidad para adultos mayores) */}
                <View style={[styles.resumen, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.resumenTitulo, { color: colors.text }]}>Tu resumen</Text>
                    {[
                        {
                            icono: 'calendar',
                            color: '#1D4ED8',
                            numero: `${diasConEjercicio} de ${estadisticas.metaDias}`,
                            frase: `Esta semana hiciste ejercicio ${diasConEjercicio} de ${estadisticas.metaDias} días.`,
                            extra: diasConEjercicio >= estadisticas.metaDias ? '¡Cumpliste tu meta de la semana!' : diasConEjercicio > 0 ? `Te faltan ${estadisticas.metaDias - diasConEjercicio} ${estadisticas.metaDias - diasConEjercicio === 1 ? 'día' : 'días'} para tu meta.` : 'Hoy es un buen día para empezar.',
                        },
                        {
                            icono: 'flame',
                            color: '#B45309',
                            numero: `${estadisticas.racha}`,
                            frase: estadisticas.racha === 1 ? 'Llevas 1 día seguido haciendo ejercicio.' : `Llevas ${estadisticas.racha} días seguidos haciendo ejercicio.`,
                        },
                        {
                            icono: 'time',
                            color: '#047857',
                            numero: `${estadisticas.minutos}`,
                            frase: `En total llevas ${estadisticas.minutos} ${estadisticas.minutos === 1 ? 'minuto' : 'minutos'} de ejercicio.`,
                        },
                        {
                            icono: 'checkmark-done',
                            color: '#6D28D9',
                            numero: `${estadisticas.completados}`,
                            frase: `Has completado ${estadisticas.completados} ${estadisticas.completados === 1 ? 'ejercicio' : 'ejercicios'}.`,
                        },
                        ...(estadisticas.esfuerzoPromedio !== null ? [{
                            icono: 'happy',
                            color: '#0E7490',
                            numero: comoTeSientes(estadisticas.esfuerzoPromedio).palabra,
                            frase: `En promedio, los ejercicios te han parecido ${comoTeSientes(estadisticas.esfuerzoPromedio).frase}.`,
                        }] : []),
                    ].map((item, i) => (
                        <View key={i} style={[styles.resumenFila, { borderTopColor: colors.cardBorder }, i === 0 && { borderTopWidth: 0 }]}>
                            <View style={[styles.resumenIcono, { backgroundColor: item.color + '1A' }]}>
                                <Ionicons name={item.icono as any} size={30} color={item.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.resumenNumero, { color: colors.isDark ? '#FFFFFF' : item.color }]}>{item.numero}</Text>
                                <Text style={[styles.resumenFrase, { color: colors.text }]}>{item.frase}</Text>
                                {item.extra ? <Text style={[styles.resumenFrase, { color: colors.textSecondary }]}>{item.extra}</Text> : null}
                            </View>
                        </View>
                    ))}
                </View>

                {/* Tarjeta de Progreso General */}
                <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.progressHeader}>
                        <View style={styles.visualIndicator}>
                            <Ionicons name="heart" size={32} color="#EF4444" />
                            <View style={styles.pulseContainer}>
                                <View style={styles.pulse} />
                            </View>
                        </View>
                        <View style={{flex: 1, marginLeft: 16}}>
                            <Text style={[styles.progressTitle, { color: colors.text }]}>Estado de Meta</Text>
                            <Text style={[styles.progressSubtitle, { color: colors.textSecondary }]}>Sigue así, vas muy bien</Text>
                        </View>
                        <View style={styles.percentageCircle}>
                            <Text style={styles.percentageText}>{Math.round(porcentajeCompletado)}%</Text>
                        </View>
                    </View>
                    
                    <View style={styles.progressBarContainer}>
                        <LinearGradient
                            colors={porcentajeCompletado >= 100 ? ['#059669', '#10B981'] : ['#2563EB', '#60A5FA']}
                            style={[styles.progressBar, { width: `${Math.min(porcentajeCompletado, 100)}%` }]}
                        />
                    </View>
                </View>

                {/* Gráficas de Pastel Dinámicas */}
                <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.chartHeader}>
                        <Ionicons name="pie-chart" size={24} color="#2563EB" />
                        <Text style={[styles.chartTitle, { color: colors.text }]}>Resumen General</Text>
                    </View>
                    <View style={styles.donutRow}>
                        <View style={styles.donutItem}>
                            <DonutChart
                                oscuro={colors.isDark}
                                size={110} strokeWidth={10}
                                percentage={Math.min(estadisticas.racha * 10, 100)}
                                color="#F59E0B" value={`${estadisticas.racha}`} label="días"
                            />
                            <View style={[styles.donutLabel, { backgroundColor: '#FEF3C7' }]}>
                                <Ionicons name="flame" size={14} color="#D97706" />
                                <Text style={[styles.donutLabelText, { color: '#92400E' }]}>Racha</Text>
                            </View>
                        </View>
                        <View style={styles.donutItem}>
                            <DonutChart
                                oscuro={colors.isDark}
                                size={110} strokeWidth={10}
                                percentage={Math.min(estadisticas.puntos / 5, 100)}
                                color="#2563EB" value={`${estadisticas.puntos}`} label="pts"
                            />
                            <View style={[styles.donutLabel, { backgroundColor: '#EFF6FF' }]}>
                                <Ionicons name="star" size={14} color="#2563EB" />
                                <Text style={[styles.donutLabelText, { color: '#1E40AF' }]}>Puntos</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.donutRow}>
                        <View style={styles.donutItem}>
                            <DonutChart
                                oscuro={colors.isDark}
                                size={110} strokeWidth={10}
                                percentage={Math.min(estadisticas.calorias / 3, 100)}
                                color="#EF4444" value={`${estadisticas.calorias}`} label="calorías"
                            />
                            <View style={[styles.donutLabel, { backgroundColor: '#FEE2E2' }]}>
                                <Ionicons name="fitness" size={14} color="#DC2626" />
                                <Text style={[styles.donutLabelText, { color: '#991B1B' }]}>Calorías</Text>
                            </View>
                        </View>
                        <View style={styles.donutItem}>
                            <DonutChart
                                oscuro={colors.isDark}
                                size={110} strokeWidth={10}
                                percentage={Math.min(estadisticas.minutos / 0.6, 100)}
                                color="#10B981" value={`${estadisticas.minutos}`} label="min"
                            />
                            <View style={[styles.donutLabel, { backgroundColor: '#F0FDF4' }]}>
                                <Ionicons name="time" size={14} color="#16A34A" />
                                <Text style={[styles.donutLabelText, { color: '#166534' }]}>Minutos</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Esfuerzo percibido y sesiones detenidas (RF10, RF11) */}
                <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.chartHeader}>
                        <Ionicons name="pulse" size={24} color="#2563EB" />
                        <Text style={[styles.chartTitle, { color: colors.text }]}>Cómo te has sentido</Text>
                    </View>
                    <Text style={{ fontSize: 18, lineHeight: 26, color: colors.text }}>
                        Esfuerzo promedio: <Text style={{ fontWeight: '800' }}>
                            {estadisticas.esfuerzoPromedio === null ? 'sin datos' : `${estadisticas.esfuerzoPromedio} de 10`}
                        </Text>
                    </Text>
                    {estadisticas.detenidas > 0 && (
                        <Text style={{ fontSize: 18, lineHeight: 26, color: colors.textSecondary, marginTop: 6 }}>
                            Detuviste {estadisticas.detenidas} {estadisticas.detenidas === 1 ? 'ejercicio' : 'ejercicios'} antes de terminar.
                            Si fue por sentirte mal, coméntalo con tu médico.
                        </Text>
                    )}
                </View>

                {/* Gráfico de actividad semanal */}
                <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.chartHeader}>
                        <Ionicons name="bar-chart" size={24} color="#1E293B" />
                        <Text style={[styles.chartTitle, { color: colors.text }]}>Actividad Semanal</Text>
                    </View>
                    
                    {estadisticas.progresoSemanal.every(v => v === 0) ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                            <Ionicons name="analytics-outline" size={48} color="#CBD5E1" />
                            <Text style={{ color: colors.textSecondary, fontSize: 18, marginTop: 12, fontWeight: '600' }}>
                                Completa ejercicios para ver tu gráfico
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.barsContainer}>
                            {estadisticas.progresoSemanal.map((valor, index) => (
                                <View key={index} style={styles.barWrapper}>
                                    <Text style={styles.barValue}>
                                        {valor > 0 ? valor : ''}
                                    </Text>
                                    <View style={styles.barOuterContainer}>
                                        <LinearGradient
                                            colors={valor > 0 ? ['#2563EB', '#60A5FA'] : ['#E2E8F0', '#E2E8F0']}
                                            style={[styles.bar, { height: `${Math.max((valor / maxProgreso) * 100, 5)}%` }]}
                                        />
                                    </View>
                                    <Text style={[styles.barLabel, valor > 0 && styles.barLabelActive]}>
                                        {diasSemana[index]}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Logros */}
                <View style={styles.achievementsCard}>
                    <View style={styles.achievementsHeader}>
                        <Ionicons name="trophy" size={24} color="#D97706" />
                        <Text style={styles.achievementsTitle}>Mis Logros</Text>
                        <View style={styles.achievementCount}>
                            <Text style={styles.achievementCountText}>
                                {estadisticas.logros.filter(l => l.desbloqueado).length}/{estadisticas.logros.length}
                            </Text>
                        </View>
                    </View>
                    
                    <View style={styles.achievementsGrid}>
                        {estadisticas.logros.map((logro) => (
                            <View 
                                key={logro.id} 
                                style={[
                                    styles.achievementItem, 
                                    !logro.desbloqueado && styles.achievementLocked
                                ]}
                            >
                                <View style={[styles.achievementIconCircle, !logro.desbloqueado && styles.achievementIconCircleLocked]}>
                                    <Text style={styles.achievementIcon}>{logro.icono}</Text>
                                </View>
                                <View style={styles.achievementInfo}>
                                    <Text style={[
                                        styles.achievementName, 
                                        !logro.desbloqueado && styles.achievementNameLocked
                                    ]}>
                                        {logro.nombre}
                                    </Text>
                                    <Text style={styles.achievementStatus}>
                                        {logro.desbloqueado ? '✅ Desbloqueado' : `Meta: ${logro.condicion} ${logro.tipo === 'ejercicios' ? 'ejercicios' : (logro.tipo === 'racha' ? 'días seguidos' : 'vasos de agua')}`}
                                    </Text>
                                </View>
                                {logro.desbloqueado && (
                                    <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
                                )}
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <MenuInferior />
        </SafeAreaView>
    );
}

// Esfuerzo percibido (0–10) en palabras sencillas
function comoTeSientes(promedio: number) {
    if (promedio <= 2) return { palabra: 'Muy ligero', frase: 'muy ligeros' };
    if (promedio <= 4) return { palabra: 'Ligero', frase: 'ligeros' };
    if (promedio <= 6) return { palabra: 'Moderado', frase: 'moderados' };
    if (promedio <= 8) return { palabra: 'Fuerte', frase: 'fuertes' };
    return { palabra: 'Muy fuerte', frase: 'muy fuertes' };
}

const styles = StyleSheet.create({
    resumen: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, padding: 20, borderRadius: 24, borderWidth: 2 },
    resumenTitulo: { fontSize: 26, fontWeight: '900', marginBottom: 8 },
    resumenFila: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderTopWidth: 1 },
    resumenIcono: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    resumenNumero: { fontSize: 34, fontWeight: '900', lineHeight: 40 },
    resumenFrase: { fontSize: 19, lineHeight: 26 },
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 100 },
    centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    loadingText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1E293B' },
    headerGradient: {
        paddingHorizontal: 24, paddingTop: 30, paddingBottom: 40,
        borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: 24,
        ...Platform.select({
            ios: {
                shadowColor: '#1E3A8A',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: '0 8px 16px rgba(30, 58, 138, 0.15)',
            }
        }),
    },
    headerTitle: { fontSize: 36, fontWeight: '900', color: '#FFFFFF', marginBottom: 8 },
    headerSubtitle: { fontSize: 18, color: '#DBEAFE', marginBottom: 28, fontWeight: '500', lineHeight: 24 },
    periodSelector: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 6 },
    periodButton: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
    periodButtonActive: { 
        backgroundColor: '#FFFFFF', 
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
        })
    },
    periodText: { fontSize: 18, color: '#DBEAFE', fontWeight: '600' },
    periodTextActive: { color: '#1E3A8A', fontWeight: '800' },
    progressCard: {
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 20, padding: 24, borderRadius: 24,
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
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    progressTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', marginBottom: 4 },
    progressSubtitle: { fontSize: 18, color: '#64748B', fontWeight: '500' },
    percentageCircle: { backgroundColor: '#EFF6FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    percentageText: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
    progressBarContainer: { height: 16, backgroundColor: '#F1F5F9', borderRadius: 8, overflow: 'hidden', marginBottom: 16 },
    progressBar: { height: '100%', borderRadius: 8 },
    progressFooter: { flexDirection: 'row', alignItems: 'baseline' },
  progressTextDark: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
  progressTextLight: { fontSize: 18, color: '#64748B', fontWeight: '600' },
  visualIndicator: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  pulseContainer: { position: 'absolute', width: '100%', height: '100%', borderRadius: 30, borderWidth: 2, borderColor: '#EF4444', opacity: 0.3 },
  pulse: { width: '100%', height: '100%', borderRadius: 30, backgroundColor: '#EF4444', opacity: 0.1 },
    statsGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20, gap: 16 },
    statCard: {
        flex: 1, backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, alignItems: 'center',
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
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    statIconWrapper: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    statNumber: { fontSize: 36, fontWeight: '900', color: '#1E293B', marginBottom: 4 },
    statLabel: { fontSize: 18, color: '#64748B', fontWeight: '600', textAlign: 'center' },
    chartCard: { 
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 20, padding: 24, borderRadius: 24,
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
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    chartHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
    chartTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
    barsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 8 },
    barWrapper: { alignItems: 'center' },
    barValue: { fontSize: 18, color: '#1E293B', marginBottom: 8, fontWeight: '800' },
    barOuterContainer: { height: 140, justifyContent: 'flex-end', marginBottom: 12, width: 32, backgroundColor: '#F8FAFC', borderRadius: 16 },
    bar: { width: '100%', borderRadius: 16 },
    barLabel: { fontSize: 18, color: '#94A3B8', fontWeight: '700' },
    barLabelActive: { color: '#1E293B' },
    donutRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
    donutItem: { alignItems: 'center' },
    donutLabel: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8, gap: 4 },
    donutLabelText: { fontSize: 18, fontWeight: '700' },
    achievementsCard: { 
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 24, padding: 24, borderRadius: 24,
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
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    achievementsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    achievementsTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B', flex: 1 },
    achievementCount: { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    achievementCountText: { fontSize: 18, fontWeight: '800', color: '#92400E' },
    achievementsGrid: { flexDirection: 'column' },
    achievementItem: { 
        backgroundColor: '#F8FAFC', padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    achievementLocked: { backgroundColor: '#FFFFFF', opacity: 0.7 },
    achievementIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    achievementIconCircleLocked: { backgroundColor: '#F1F5F9' },
    achievementIcon: { fontSize: 28 },
    achievementInfo: { flex: 1 },
    achievementName: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
    achievementNameLocked: { color: '#64748B' },
    achievementStatus: { fontSize: 18, color: '#64748B', fontWeight: '500' },
});