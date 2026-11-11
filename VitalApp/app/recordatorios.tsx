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
    const [nuevaHora, setNuevaHora] = useState('');
    const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
    const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>(['L', 'M', 'X', 'J', 'V']);

    const TODOS_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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
            setRecordatorios(lista);
            await AsyncStorage.setItem('recordatorios', JSON.stringify(lista));

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
        setRecordatorios(nuevos);
        await AsyncStorage.setItem('recordatorios', JSON.stringify(nuevos));
        await subirRecordatorios(nuevos);
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

    const agregarRecordatorio = async () => {
        // Validar hora formato HH:MM
        const horaRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
        if (!horaRegex.test(nuevaHora)) {
            avisar('Hora inválida', 'Ingresa la hora en formato HH:MM (ejemplo: 09:00 o 14:30)');
            return;
        }
        if (diasSeleccionados.length === 0) {
            avisar('Selecciona días', 'Debes seleccionar al menos un día para el recordatorio');
            return;
        }

        const nuevoId = recordatorios.length > 0 ? Math.max(...recordatorios.map(r => r.id)) + 1 : 1;
        const nuevo: Recordatorio = {
            id: nuevoId,
            hora: nuevaHora,
            activo: true,
            dias: diasSeleccionados,
            label: nuevaEtiqueta.trim() || 'Recordatorio de ejercicio'
        };

        const nuevos = [...recordatorios, nuevo];
        await guardarRecordatorios(nuevos);

        // Reset form
        setNuevaHora('');
        setNuevaEtiqueta('');
        setDiasSeleccionados(['L', 'M', 'X', 'J', 'V']);
        setModalVisible(false);
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
                    <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
                        <Ionicons name="add" size={24} color="#1E3A8A" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.headerSubtitle}>Programa tus horarios de ejercicio</Text>
            </LinearGradient>

            <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Toggle global */}
                <View style={styles.globalCard}>
                    <View style={styles.globalInfo}>
                        <View style={[styles.globalIcon, { backgroundColor: '#EFF6FF' }]}>
                            <Ionicons name="notifications" size={28} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.globalTitle}>Notificaciones</Text>
                            <Text style={styles.globalSubtitle}>Recibir recordatorios diarios</Text>
                        </View>
                    </View>
                    <Switch
                        value={notificacionesActivas}
                        onValueChange={toggleNotificacionesGlobal}
                        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                        thumbColor={notificacionesActivas ? '#2563EB' : '#F8FAFC'}
                    />
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
                    recordatorios.map((recordatorio) => (
                        <View key={recordatorio.id} style={[styles.reminderCard, !recordatorio.activo && styles.reminderCardInactive]}>
                            <View style={styles.reminderTop}>
                                <View style={styles.reminderTimeContainer}>
                                    <Ionicons name="time-outline" size={22} color={recordatorio.activo ? '#2563EB' : '#94A3B8'} />
                                    <Text style={[styles.reminderTime, !recordatorio.activo && styles.textInactive]}>{recordatorio.hora}</Text>
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
                            <Text style={[styles.reminderLabel, !recordatorio.activo && styles.textInactive]}>{recordatorio.label}</Text>
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
                    ))
                )}

                {/* Consejo */}
                <View style={styles.motivationCard}>
                    <View style={styles.motivationHeader}>
                        <Ionicons name="bulb" size={24} color="#D97706" />
                        <Text style={styles.motivationTitle}>Consejo Vital</Text>
                    </View>
                    <Text style={styles.motivationText}>
                        La constancia es la clave del éxito. Establece horarios fijos para tus ejercicios y tu cuerpo se acostumbrará a la rutina.
                    </Text>
                </View>

                <View style={styles.bottomSpace} />
            </ScrollView>

            {/* Modal para agregar recordatorio */}
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

                        <Text style={styles.modalLabel}>Hora (formato HH:MM)</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Ej: 09:00"
                            placeholderTextColor="#94A3B8"
                            value={nuevaHora}
                            onChangeText={setNuevaHora}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                        />

                        <Text style={styles.modalLabel}>Nombre del recordatorio</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Ej: Ejercicio matutino"
                            placeholderTextColor="#94A3B8"
                            value={nuevaEtiqueta}
                            onChangeText={setNuevaEtiqueta}
                        />

                        <Text style={styles.modalLabel}>Días de la semana</Text>
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
    scrollContent: { paddingBottom: 40 },
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
        backgroundColor: '#FFFFFF', margin: 20, padding: 20, borderRadius: 24,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
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
    globalInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 8 },
    globalIcon: {
        width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center',
    },
    globalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    globalSubtitle: { fontSize: 18, color: '#64748B', marginTop: 2, flexShrink: 1 },
    sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginHorizontal: 20, marginBottom: 16 },
    emptyState: {
        alignItems: 'center', paddingVertical: 60,
    },
    emptyText: { fontSize: 20, fontWeight: '700', color: '#94A3B8', marginTop: 16 },
    emptySubtext: { fontSize: 18, color: '#CBD5E1', marginTop: 4 },
    reminderCard: {
        backgroundColor: '#FFFFFF', marginHorizontal: 20, marginBottom: 16, padding: 20, borderRadius: 24,
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
    reminderCardInactive: { opacity: 0.6 },
    reminderTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, rowGap: 4 },
    reminderTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reminderTime: { fontSize: 28, fontWeight: '900', color: '#1E293B' },
    reminderLabel: { fontSize: 18, color: '#64748B', fontWeight: '600', marginBottom: 12 },
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
    diaText: { fontSize: 18, color: '#475569', fontWeight: '700' },
    diaTextActive: { color: '#FFFFFF' },
    diaTextInactive: { color: '#FFFFFF' },
    motivationCard: {
        backgroundColor: '#FFFBEB', margin: 20, padding: 24, borderRadius: 24,
        borderWidth: 1, borderColor: '#FEF3C7',
    },
    motivationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    motivationTitle: { fontSize: 18, fontWeight: '800', color: '#B45309' },
    motivationText: { fontSize: 18, color: '#92400E', lineHeight: 24, fontWeight: '500' },
    bottomSpace: { height: 30 },
    // Modal styles
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
        padding: 28, paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
    },
    modalTitle: { fontSize: 24, fontWeight: '900', color: '#1E293B' },
    modalLabel: { fontSize: 18, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 16 },
    modalInput: {
        borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 16,
        paddingHorizontal: 20, paddingVertical: 16, fontSize: 18,
        color: '#1E293B', backgroundColor: '#F8FAFC',
    },
    modalDias: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, marginTop: 8 },
    modalDiaBadge: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8FAFC',
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0',
    },
    modalDiaBadgeActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    modalDiaText: { fontSize: 18, color: '#94A3B8', fontWeight: '800' },
    modalDiaTextActive: { color: '#FFFFFF' },
    modalSaveBtn: { marginTop: 28, borderRadius: 24, overflow: 'hidden' },
    modalSaveBtnGradient: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 18, gap: 10,
    },
    modalSaveBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
