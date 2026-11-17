import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    Switch,
    Alert,
    ActivityIndicator,
    Modal,
    TextInput,
    StatusBar,
    Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuInferior from '../components/MenuInferior';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';
import {
    solicitarPermisoNotificaciones,
    estadoPermisoNotificaciones,
    reproducirCampanaAlarma,
    pronunciarAvisoVoz,
    mostrarNotificacionSistema,
    obtenerVolumenAlarma,
    guardarVolumenAlarma,
    normalizarHora24,
    formatearHora12
} from '../utils/alarmaService';

interface Recordatorio {
    id: number;
    hora: string;
    activo: boolean;
    dias: string[];
    label: string;
}

export default function RecordatoriosScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [cargando, setCargando] = useState(true);
    const [notificacionesActivas, setNotificacionesActivas] = useState(true);
    const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    // Campos del formulario con selector AM / PM claro
    const [horaInput, setHoraInput] = useState('09');
    const [minutosInput, setMinutosInput] = useState('00');
    const [periodoInput, setPeriodoInput] = useState<'AM' | 'PM'>('AM');
    const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
    const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>(['L', 'M', 'X', 'J', 'V']);
    const [permisoNativo, setPermisoNativo] = useState<string>('default');

    // Volumen para alarma y voz
    const [volumen, setVolumen] = useState<number>(0.8);
    const [probando, setProbando] = useState(false);

    const TODOS_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    useEffect(() => {
        setPermisoNativo(estadoPermisoNotificaciones());
        obtenerVolumenAlarma().then(setVolumen);
    }, []);

    const cambiarVolumen = async (delta: number) => {
        const nuevo = Math.round(Math.max(0.1, Math.min(1.0, volumen + delta)) * 10) / 10;
        setVolumen(nuevo);
        await guardarVolumenAlarma(nuevo);
    };

    const probarAlarma = async () => {
        if (probando) return;
        setProbando(true);
        if (Platform.OS === 'web' && typeof (window as any).probarAlarmaVitalApp === 'function') {
            (window as any).probarAlarmaVitalApp('Rutina Vital de prueba');
        } else {
            await reproducirCampanaAlarma(volumen);
            await pronunciarAvisoVoz('Hola. Esta es una prueba de tu recordatorio de VitalApp a este volumen.', volumen);
            mostrarNotificacionSistema('Prueba de recordatorio ⏰', 'Tu alarma y notificaciones en pantalla están listas.');
        }
        setTimeout(() => setProbando(false), 2500);
    };

    const activarPermisosNativos = async () => {
        const ok = await solicitarPermisoNotificaciones();
        setPermisoNativo(estadoPermisoNotificaciones());
        if (ok) {
            avisar('Notificaciones activas', 'Ahora recibirás avisos en tu pantalla cuando sea hora de tu ejercicio.');
            // Disparar prueba para que el usuario vea el aviso en pantalla de inmediato
            if (Platform.OS === 'web' && typeof (window as any).probarAlarmaVitalApp === 'function') {
                (window as any).probarAlarmaVitalApp('Aviso en pantalla activado');
            }
        } else {
            avisar('Permisos pendientes', 'Puedes activar las notificaciones desde el icono del candado en la barra de tu navegador.');
        }
    };

    useFocusEffect(
        useCallback(() => {
            cargarRecordatorios();
        }, [])
    );

    // RF13: los recordatorios se guardan en la BD; AsyncStorage queda como copia sin conexión
    const subirRecordatorios = async (lista: Recordatorio[]) => {
        try {
            await fetchSeguro(`${API_URL}/recordatorios`, {
                method: 'PUT',
                body: JSON.stringify({ recordatorios: lista }),
            });
        } catch (error) {
            console.log('No se pudieron guardar los recordatorios en la BD:', error);
        }
    };

    const cargarRecordatorios = async () => {
        try {
            setCargando(true);
            const guardados = await AsyncStorage.getItem('recordatorios');
            const notifGuardadas = await AsyncStorage.getItem('notifications');
            const locales: Recordatorio[] | null = guardados ? JSON.parse(guardados) : null;

            let lista: Recordatorio[] | null = null;
            try {
                const res = await fetchSeguro(`${API_URL}/recordatorios`);
                const data = await res.json();
                if (data.success && data.recordatorios.length > 0) lista = data.recordatorios;
            } catch (error) {
                console.log('Sin conexión, usando recordatorios guardados en el teléfono:', error);
            }

            if (!lista) {
                // Primera vez: se suben los locales o, si no hay, los recordatorios por defecto
                lista = locales ?? [
                    { id: 1, hora: '09:00', activo: true, dias: ['L', 'M', 'X', 'J', 'V'], label: 'Rutina matutina' },
                    { id: 2, hora: '18:00', activo: true, dias: ['L', 'M', 'X', 'J', 'V'], label: 'Ejercicio vespertino' },
                ];
                await subirRecordatorios(lista);
            }

            // Normalizar horas (por ejemplo "3:47" -> "03:47")
            const listaNormalizada = lista.map(r => ({
                ...r,
                hora: normalizarHora24(r.hora),
            }));

            setRecordatorios(listaNormalizada);
            await AsyncStorage.setItem('recordatorios', JSON.stringify(listaNormalizada));

            if (notifGuardadas !== null) {
                setNotificacionesActivas(notifGuardadas === 'true');
            }
        } catch (error) {
            console.log('Error cargando recordatorios:', error);
        } finally {
            setCargando(false);
        }
    };

    const guardarRecordatorios = async (nuevos: Recordatorio[]) => {
        const limpios = nuevos.map(r => ({ ...r, hora: normalizarHora24(r.hora) }));
        setRecordatorios(limpios);
        await AsyncStorage.setItem('recordatorios', JSON.stringify(limpios));
        await subirRecordatorios(limpios);
    };

    const toggleRecordatorio = async (id: number) => {
        const nuevos = recordatorios.map(r =>
            r.id === id ? { ...r, activo: !r.activo } : r
        );
        await guardarRecordatorios(nuevos);
    };

    const toggleNotificacionesGlobal = async (valor: boolean) => {
        setNotificacionesActivas(valor);
        await AsyncStorage.setItem('notifications', valor.toString());
    };

    const toggleDia = (dia: string) => {
        if (diasSeleccionados.includes(dia)) {
            setDiasSeleccionados(diasSeleccionados.filter(d => d !== dia));
        } else {
            setDiasSeleccionados([...diasSeleccionados, dia]);
        }
    };

    const abrirModalNuevo = () => {
        const ahora = new Date();
        let h = ahora.getHours();
        const p: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        setHoraInput(String(h).padStart(2, '0'));
        setMinutosInput(String(ahora.getMinutes()).padStart(2, '0'));
        setPeriodoInput(p);
        setNuevaEtiqueta('');
        setDiasSeleccionados(['L', 'M', 'X', 'J', 'V']);
        setModalVisible(true);
    };

    const agregarRecordatorio = async () => {
        let hNum = parseInt(horaInput, 10);
        let mNum = parseInt(minutosInput, 10);

        if (isNaN(hNum) || hNum < 1 || hNum > 12) {
            avisar('Hora inválida', 'La hora debe ser un número del 1 al 12.');
            return;
        }
        if (isNaN(mNum) || mNum < 0 || mNum > 59) {
            avisar('Minutos inválidos', 'Los minutos deben estar entre 00 y 59.');
            return;
        }

        // Convertir de 12 horas (AM/PM) a 24 horas estándar para la alarma
        let h24 = hNum;
        if (periodoInput === 'PM' && h24 !== 12) h24 += 12;
        if (periodoInput === 'AM' && h24 === 12) h24 = 0;

        const hora24Final = `${String(h24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;

        if (diasSeleccionados.length === 0) {
            avisar('Selecciona días', 'Debes seleccionar al menos un día para el recordatorio.');
            return;
        }

        const nuevoId = recordatorios.length > 0 ? Math.max(...recordatorios.map(r => r.id)) + 1 : 1;
        const nuevo: Recordatorio = {
            id: nuevoId,
            hora: hora24Final,
            activo: true,
            dias: diasSeleccionados,
            label: nuevaEtiqueta.trim() || 'Recordatorio de ejercicio'
        };

        const nuevos = [...recordatorios, nuevo];
        await guardarRecordatorios(nuevos);

        setModalVisible(false);
        avisar('¡Recordatorio programado!', `Se activará a las ${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')} ${periodoInput}.`);
    };

    const eliminarRecordatorio = (id: number) => {
        if (Platform.OS === 'web') {
            if (window.confirm('¿Eliminar este recordatorio?')) {
                const nuevos = recordatorios.filter(r => r.id !== id);
                guardarRecordatorios(nuevos);
            }
        } else {
            Alert.alert(
                'Eliminar recordatorio',
                '¿Estás seguro de que quieres eliminar este recordatorio?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Eliminar',
                        style: 'destructive',
                        onPress: async () => {
                            const nuevos = recordatorios.filter(r => r.id !== id);
                            await guardarRecordatorios(nuevos);
                        }
                    }
                ]
            );
        }
    };

    if (cargando) {
        return (
            <View style={styles.centeredContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Cargando recordatorios...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />

            {/* Header Premium */}
            <LinearGradient
                colors={['#1E3A8A', '#2563EB']}
                style={styles.headerGradient}
            >
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Recordatorios</Text>
                    <TouchableOpacity onPress={abrirModalNuevo} style={styles.addBtn}>
                        <Ionicons name="add" size={24} color="#1E3A8A" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.headerSubtitle}>Programa tus horarios de ejercicio</Text>
            </LinearGradient>

            <ScrollView 
                style={styles.container} 
                contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]} 
                showsVerticalScrollIndicator={true}
                bounces={true}
                overScrollMode="always"
                keyboardShouldPersistTaps="handled"
            >
                {/* Toggle global */}
                <View style={styles.globalCard}>
                    <View style={styles.globalInfo}>
                        <View style={[styles.globalIcon, { backgroundColor: '#EFF6FF' }]}>
                            <Ionicons name="notifications" size={28} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.globalTitle}>Notificaciones</Text>
                            <Text style={styles.globalSubtitle}>Recibir avisos diarios en este horario</Text>
                        </View>
                    </View>
                    <Switch
                        value={notificacionesActivas}
                        onValueChange={toggleNotificacionesGlobal}
                        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                        thumbColor={notificacionesActivas ? '#2563EB' : '#F8FAFC'}
                    />
                </View>

                {/* Banner de permisos / avisos en pantalla */}
                <TouchableOpacity
                    style={styles.bannerPermiso}
                    onPress={activarPermisosNativos}
                    activeOpacity={0.85}
                >
                    <View style={styles.bannerPermisoIcono}>
                        <Ionicons name="desktop-outline" size={22} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.bannerPermisoTitulo}>
                            {permisoNativo === 'granted' ? 'Avisos en pantalla activados ✓' : 'Activar avisos en pantalla'}
                        </Text>
                        <Text style={styles.bannerPermisoSub}>
                            {permisoNativo === 'granted'
                                ? 'Toca para ver una prueba de cómo aparecerá tu recordatorio'
                                : 'Recibe avisos visuales aunque estés en otra pestaña o ventana'}
                        </Text>
                    </View>
                    <Ionicons name="play-circle-outline" size={24} color="#D97706" />
                </TouchableOpacity>

                {/* Tarjeta de Sonido y Voz de Alarma con CONTROL DE VOLUMEN */}
                <View style={styles.cardPrueba}>
                    <View style={styles.soundHeaderRow}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.cardPruebaTitulo}>Sonido y Voz de Alarma</Text>
                            <Text style={styles.cardPruebaSub}>Ajusta el volumen y prueba tu aviso</Text>
                        </View>
                        <TouchableOpacity 
                            style={[styles.btnProbar, probando && styles.btnProbarActivo]} 
                            onPress={probarAlarma} 
                            activeOpacity={0.8}
                        >
                            <Ionicons name={probando ? "volume-high" : "volume-medium"} size={18} color={probando ? "#FFFFFF" : "#2563EB"} />
                            <Text style={[styles.btnProbarTxt, probando && styles.btnProbarTxtActivo]}>
                                {probando ? 'Sonando...' : 'Probar'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Controles para BAJAR o SUBIR el volumen sin teclado */}
                    <View style={styles.volumenBox}>
                        <Text style={styles.volumenLabel}>Volumen de la voz:</Text>
                        <View style={styles.volumenControles}>
                            <TouchableOpacity 
                                style={styles.btnVolumenPaso}
                                onPress={() => cambiarVolumen(-0.1)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="volume-low" size={18} color="#475569" />
                                <Text style={styles.btnVolumenTxt}>Bajar</Text>
                            </TouchableOpacity>

                            {/* Barra visual de volumen */}
                            <View style={styles.volumenBarraContenedor}>
                                <View style={[styles.volumenBarraRelleno, { width: `${Math.round(volumen * 100)}%` }]} />
                                <Text style={styles.volumenPorcentajeTxt}>
                                    {Math.round(volumen * 100)}%
                                </Text>
                            </View>

                            <TouchableOpacity 
                                style={styles.btnVolumenPaso}
                                onPress={() => cambiarVolumen(0.1)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="volume-high" size={18} color="#2563EB" />
                                <Text style={[styles.btnVolumenTxt, { color: '#2563EB' }]}>Subir</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Lista de recordatorios */}
                <Text style={styles.sectionTitle}>Horarios programados</Text>
                
                {recordatorios.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="alarm-outline" size={64} color="#CBD5E1" />
                        <Text style={styles.emptyText}>Sin recordatorios</Text>
                        <Text style={styles.emptySubtext}>Toca el botón + para agregar uno</Text>
                    </View>
                ) : (
                    recordatorios.map((recordatorio) => {
                        const horaInfo = formatearHora12(recordatorio.hora);
                        const esManana = horaInfo.periodo === 'AM';

                        return (
                            <View key={recordatorio.id} style={[styles.reminderCard, !recordatorio.activo && styles.reminderCardInactive]}>
                                <View style={styles.reminderTop}>
                                    <View style={styles.reminderTimeContainer}>
                                        <Ionicons 
                                            name={esManana ? "sunny-outline" : "moon-outline"} 
                                            size={22} 
                                            color={recordatorio.activo ? (esManana ? '#D97706' : '#2563EB') : '#94A3B8'} 
                                        />
                                        <View>
                                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                                <Text style={[styles.reminderTime, !recordatorio.activo && styles.textInactive]}>
                                                    {horaInfo.hora12}
                                                </Text>
                                                <View style={[styles.periodoBadge, esManana ? styles.periodoBadgeAM : styles.periodoBadgePM]}>
                                                    <Text style={[styles.periodoBadgeTxt, esManana ? styles.periodoBadgeTxtAM : styles.periodoBadgeTxtPM]}>
                                                        {horaInfo.periodo}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={styles.hora24Subtxt}>
                                                {esManana ? 'Mañana' : 'Tarde / Noche'} ({horaInfo.hora24} hrs)
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.reminderActions}>
                                        <Switch
                                            value={recordatorio.activo}
                                            onValueChange={() => toggleRecordatorio(recordatorio.id)}
                                            trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                                            thumbColor={recordatorio.activo ? '#2563EB' : '#F8FAFC'}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => eliminarRecordatorio(recordatorio.id)}
                                            style={styles.deleteBtn}
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <Text style={[styles.reminderLabel, !recordatorio.activo && styles.textInactive]}>
                                    {recordatorio.label}
                                </Text>

                                <View style={styles.diasContainer}>
                                    {TODOS_DIAS.map((dia, index) => (
                                        <View key={`${recordatorio.id}-${dia}-${index}`} style={[
                                            styles.diaBadge,
                                            recordatorio.dias.includes(dia) && (recordatorio.activo ? styles.diaBadgeActive : styles.diaBadgeInactive)
                                        ]}>
                                            <Text style={[
                                                styles.diaText,
                                                recordatorio.dias.includes(dia) && (recordatorio.activo ? styles.diaTextActive : styles.diaTextInactive)
                                            ]}>{dia}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        );
                    })
                )}

                {/* Consejo Vital */}
                <View style={styles.motivationCard}>
                    <View style={styles.motivationHeader}>
                        <Ionicons name="bulb" size={24} color="#D97706" />
                        <Text style={styles.motivationTitle}>Consejo Vital</Text>
                    </View>
                    <Text style={styles.motivationText}>
                        La constancia es la clave del éxito. Establece horarios fijos para tus ejercicios y tu cuerpo se acostumbrará a la rutina.
                    </Text>
                </View>

                {/* Espacio amplio para que MenuInferior no tape nada al scrollear */}
                <View style={styles.bottomSpace} />
            </ScrollView>

            {/* Modal para agregar recordatorio con SELECTOR AM / PM */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Nuevo Recordatorio</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close-circle" size={32} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        {/* SELECTOR DE HORA Y PERÍODO AM/PM */}
                        <Text style={styles.modalLabel}>Hora y momento del día</Text>
                        <View style={styles.horaSelectorRow}>
                            {/* Input Hora (1 a 12) */}
                            <View style={styles.inputHoraWrap}>
                                <Text style={styles.subInputLabel}>Hora</Text>
                                <TextInput
                                    style={styles.horaNumberInput}
                                    placeholder="09"
                                    placeholderTextColor="#94A3B8"
                                    value={horaInput}
                                    onChangeText={(txt) => setHoraInput(txt.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric"
                                    maxLength={2}
                                />
                            </View>

                            <Text style={styles.dosPuntosTxt}>:</Text>

                            {/* Input Minutos (00 a 59) */}
                            <View style={styles.inputHoraWrap}>
                                <Text style={styles.subInputLabel}>Minutos</Text>
                                <TextInput
                                    style={styles.horaNumberInput}
                                    placeholder="00"
                                    placeholderTextColor="#94A3B8"
                                    value={minutosInput}
                                    onChangeText={(txt) => setMinutosInput(txt.replace(/\D/g, '').slice(0, 2))}
                                    keyboardType="numeric"
                                    maxLength={2}
                                />
                            </View>

                            {/* Botones AM / PM Grandes y Claros */}
                            <View style={styles.periodoToggleWrap}>
                                <TouchableOpacity
                                    style={[styles.btnPeriodo, periodoInput === 'AM' && styles.btnPeriodoActivoAM]}
                                    onPress={() => setPeriodoInput('AM')}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons 
                                        name="sunny" 
                                        size={18} 
                                        color={periodoInput === 'AM' ? '#FFFFFF' : '#D97706'} 
                                    />
                                    <Text style={[styles.btnPeriodoTxt, periodoInput === 'AM' && styles.btnPeriodoTxtActivo]}>
                                        a. m.
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.btnPeriodo, periodoInput === 'PM' && styles.btnPeriodoActivoPM]}
                                    onPress={() => setPeriodoInput('PM')}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons 
                                        name="moon" 
                                        size={18} 
                                        color={periodoInput === 'PM' ? '#FFFFFF' : '#2563EB'} 
                                    />
                                    <Text style={[styles.btnPeriodoTxt, periodoInput === 'PM' && styles.btnPeriodoTxtActivo]}>
                                        p. m.
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Vista previa clara para el adulto mayor */}
                        <View style={styles.previewBox}>
                            <Ionicons name="information-circle-outline" size={20} color="#2563EB" />
                            <Text style={styles.previewTxt}>
                                Programando para las{' '}
                                <Text style={{ fontWeight: '800' }}>
                                    {horaInput || '12'}:{minutosInput || '00'} {periodoInput}
                                </Text>
                                {' '}({periodoInput === 'AM' ? 'en la mañana' : 'en la tarde/noche'})
                            </Text>
                        </View>

                        {/* Nombre del recordatorio */}
                        <Text style={styles.modalLabel}>Nombre del recordatorio</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Ej: Ejercicio de brazos, Rutina matutina..."
                            placeholderTextColor="#94A3B8"
                            value={nuevaEtiqueta}
                            onChangeText={setNuevaEtiqueta}
                        />

                        {/* Días de la semana */}
                        <Text style={styles.modalLabel}>Días que se repetirá</Text>
                        <View style={styles.modalDias}>
                            {TODOS_DIAS.map((dia, index) => (
                                <TouchableOpacity
                                    key={`modal-${dia}-${index}`}
                                    style={[
                                        styles.modalDiaBadge,
                                        diasSeleccionados.includes(dia) && styles.modalDiaBadgeActive
                                    ]}
                                    onPress={() => toggleDia(dia)}
                                >
                                    <Text style={[
                                        styles.modalDiaText,
                                        diasSeleccionados.includes(dia) && styles.modalDiaTextActive
                                    ]}>{dia}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Botón Guardar */}
                        <TouchableOpacity style={styles.modalSaveBtn} onPress={agregarRecordatorio}>
                            <LinearGradient
                                colors={['#1E3A8A', '#2563EB']}
                                style={styles.modalSaveBtnGradient}
                            >
                                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                                <Text style={styles.modalSaveBtnText}>Guardar Recordatorio</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <MenuInferior />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 130 },
    centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    loadingText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1E293B' },
    headerGradient: {
        paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32,
        borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    },
    headerTop: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
    },
    backBtn: { width: 44, height: 44, justifyContent: 'center' },
    headerTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', flexShrink: 1 },
    addBtn: {
        backgroundColor: '#FFFFFF', width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
    },
    headerSubtitle: { fontSize: 18, color: '#DBEAFE', fontWeight: '500' },

    globalCard: {
        backgroundColor: '#FFFFFF', margin: 20, marginBottom: 12, padding: 20, borderRadius: 24,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
            android: { elevation: 3 },
            web: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }
        }),
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    globalInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 8 },
    globalIcon: {
        width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center',
    },
    globalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    globalSubtitle: { fontSize: 14, color: '#64748B', marginTop: 2, flexShrink: 1 },

    bannerPermiso: {
        backgroundColor: '#FEF3C7',
        marginHorizontal: 20,
        marginBottom: 14,
        padding: 16,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1.5,
        borderColor: '#FDE68A',
    },
    bannerPermisoIcono: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FDE68A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bannerPermisoTitulo: {
        fontSize: 16,
        fontWeight: '800',
        color: '#92400E',
    },
    bannerPermisoSub: {
        fontSize: 13,
        color: '#B45309',
        marginTop: 2,
    },

    cardPrueba: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 18,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        ...Platform.select({
            web: { boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)' },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
            android: { elevation: 2 }
        }),
    },
    soundHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    cardPruebaTitulo: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1E293B',
    },
    cardPruebaSub: {
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    btnProbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#BFDBFE',
    },
    btnProbarActivo: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    btnProbarTxt: {
        color: '#2563EB',
        fontSize: 14,
        fontWeight: '800',
    },
    btnProbarTxtActivo: {
        color: '#FFFFFF',
    },

    volumenBox: {
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    volumenLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 8,
    },
    volumenControles: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    btnVolumenPaso: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    btnVolumenTxt: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    volumenBarraContenedor: {
        flex: 1,
        height: 24,
        backgroundColor: '#E2E8F0',
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        justifyContent: 'center',
    },
    volumenBarraRelleno: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#2563EB',
        borderRadius: 12,
    },
    volumenPorcentajeTxt: {
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '800',
        color: '#0F172A',
        zIndex: 2,
    },

    sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginHorizontal: 20, marginBottom: 16 },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 20, fontWeight: '700', color: '#94A3B8', marginTop: 16 },
    emptySubtext: { fontSize: 16, color: '#CBD5E1', marginTop: 4 },

    reminderCard: {
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 16, padding: 20, borderRadius: 24,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
            android: { elevation: 3 },
            web: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }
        }),
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    reminderCardInactive: { opacity: 0.6 },
    reminderTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, rowGap: 4 },
    reminderTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    reminderTime: { fontSize: 28, fontWeight: '900', color: '#1E293B' },
    periodoBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    periodoBadgeAM: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
    periodoBadgePM: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
    periodoBadgeTxt: { fontSize: 13, fontWeight: '800' },
    periodoBadgeTxtAM: { color: '#B45309' },
    periodoBadgeTxtPM: { color: '#1D4ED8' },
    hora24Subtxt: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 1 },

    reminderLabel: { fontSize: 17, color: '#475569', fontWeight: '700', marginBottom: 12 },
    reminderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deleteBtn: { padding: 8 },
    textInactive: { color: '#94A3B8' },

    diasContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    diaBadge: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0',
    },
    diaBadgeActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    diaBadgeInactive: { backgroundColor: '#64748B', borderColor: '#64748B' },
    diaText: { fontSize: 14, color: '#475569', fontWeight: '700' },
    diaTextActive: { color: '#FFFFFF' },
    diaTextInactive: { color: '#FFFFFF' },

    motivationCard: {
        backgroundColor: '#FFFBEB', margin: 20, padding: 24, borderRadius: 24,
        borderWidth: 1, borderColor: '#FEF3C7',
    },
    motivationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    motivationTitle: { fontSize: 18, fontWeight: '800', color: '#B45309' },
    motivationText: { fontSize: 15, color: '#92400E', lineHeight: 22, fontWeight: '500' },
    bottomSpace: { height: 70 },

    // Modal styles
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16
    },
    modalContent: {
        backgroundColor: '#FFFFFF', borderRadius: 28,
        padding: 24, width: '100%', maxWidth: 480,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18,
    },
    modalTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
    modalLabel: { fontSize: 15, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 14 },

    horaSelectorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        gap: 8,
    },
    inputHoraWrap: {
        alignItems: 'center',
        flex: 1,
    },
    subInputLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    horaNumberInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#CBD5E1',
        borderRadius: 14,
        width: '100%',
        paddingVertical: 10,
        textAlign: 'center',
        fontSize: 26,
        fontWeight: '900',
        color: '#1E293B',
    },
    dosPuntosTxt: {
        fontSize: 28,
        fontWeight: '900',
        color: '#64748B',
        marginTop: 16,
    },
    periodoToggleWrap: {
        flexDirection: 'column',
        gap: 6,
        flex: 1.2,
    },
    btnPeriodo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#CBD5E1',
    },
    btnPeriodoActivoAM: {
        backgroundColor: '#D97706',
        borderColor: '#D97706',
    },
    btnPeriodoActivoPM: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    btnPeriodoTxt: {
        fontSize: 13,
        fontWeight: '800',
        color: '#475569',
    },
    btnPeriodoTxtActivo: {
        color: '#FFFFFF',
    },

    previewBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EFF6FF',
        padding: 10,
        borderRadius: 12,
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    previewTxt: {
        fontSize: 13,
        color: '#1E40AF',
        flex: 1,
    },

    modalInput: {
        borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 16,
        paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
        color: '#1E293B', backgroundColor: '#F8FAFC',
    },
    modalDias: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, marginTop: 4 },
    modalDiaBadge: {
        width: 38, height: 38, borderRadius: 19, backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0',
    },
    modalDiaBadgeActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    modalDiaText: { fontSize: 14, color: '#94A3B8', fontWeight: '800' },
    modalDiaTextActive: { color: '#FFFFFF' },

    modalSaveBtn: { marginTop: 24, borderRadius: 20, overflow: 'hidden' },
    modalSaveBtnGradient: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, gap: 10,
    },
    modalSaveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
