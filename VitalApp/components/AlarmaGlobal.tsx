import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    RecordatorioItem,
    obtenerRecordatoriosLocales,
    reproducirCampanaAlarma,
    pronunciarAvisoVoz,
    mostrarNotificacionSistema,
    normalizarHora24,
    formatearHora12
} from '../utils/alarmaService';

const DIAS_LETRAS: Record<number, string> = {
    0: 'D',
    1: 'L',
    2: 'M',
    3: 'X',
    4: 'J',
    5: 'V',
    6: 'S',
};

export default function AlarmaGlobal() {
    const router = useRouter();
    const [alarmaActiva, setAlarmaActiva] = useState<RecordatorioItem | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const ultimoDisparoRef = useRef<string>('');
    const pospuestoHastaRef = useRef<number>(0);

    // ── Función para disparar la alarma ──────────────────────────────────────
    const dispararAlarma = async (item: RecordatorioItem) => {
        setAlarmaActiva(item);
        setModalVisible(true);

        // 1. Sonido de campana
        await reproducirCampanaAlarma();

        // 2. Voz amigable
        const etiqueta = item.label || 'tu ejercicio';
        await pronunciarAvisoVoz(`Hola. Es momento de ${etiqueta}. Tu cuerpo y salud te lo agradecerán.`);

        // 3. Notificación de escritorio / sistema
        mostrarNotificacionSistema(
            '¡Hora de tu ejercicio! ⏰',
            item.label ? `${item.label} (${formatearHora12(item.hora).etiquetaCompleta})` : 'Es momento de realizar tu rutina de hoy.'
        );
    };

    // ── Exponer para pruebas en pantalla y consola ───────────────────────────
    useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            (window as any).probarAlarmaVitalApp = (label = 'Rutina Vital de prueba') => {
                const ahora = new Date();
                const h = String(ahora.getHours()).padStart(2, '0');
                const m = String(ahora.getMinutes()).padStart(2, '0');
                dispararAlarma({
                    id: 9999,
                    hora: `${h}:${m}`,
                    activo: true,
                    dias: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
                    label: label
                });
            };
        }
    }, []);

    // ── Bucle de revisión cada 5 segundos ────────────────────────────────────
    useEffect(() => {
        const intervalId = setInterval(async () => {
            try {
                // Verificar si las notificaciones están activas globalmente
                const notifPref = await AsyncStorage.getItem('notifications');
                if (notifPref === 'false') return;

                // Sin sesión activa no se revisan recordatorios (evita bucle de 401)
                const token = await AsyncStorage.getItem('jwtToken');
                if (!token) return;

                // Verificar si hay una alarma pospuesta pendiente
                const ahoraMs = Date.now();
                if (pospuestoHastaRef.current > 0 && ahoraMs >= pospuestoHastaRef.current) {
                    pospuestoHastaRef.current = 0;
                    dispararAlarma({
                        id: 8888,
                        hora: 'Pospuesto',
                        activo: true,
                        dias: [],
                        label: 'Recordatorio pospuesto: Hora de ejercitarse'
                    });
                    return;
                }

                // Obtener hora actual y día
                const ahora = new Date();
                const horaStr = String(ahora.getHours()).padStart(2, '0');
                const minStr = String(ahora.getMinutes()).padStart(2, '0');
                const horaActual = `${horaStr}:${minStr}`;
                const diaLetra = DIAS_LETRAS[ahora.getDay()];

                // Clave única para evitar duplicados en el mismo minuto
                const claveMinuto = `${ahora.toDateString()}-${horaActual}`;

                const lista = await obtenerRecordatoriosLocales();
                if (!lista || lista.length === 0) return;

                // Buscar coincidencia normalizando horas (ej: "3:47" a "03:47")
                const coincidencia = lista.find(r =>
                    r.activo &&
                    Array.isArray(r.dias) &&
                    r.dias.includes(diaLetra) &&
                    normalizarHora24(r.hora) === horaActual
                );

                if (coincidencia) {
                    const claveDisparo = `${claveMinuto}-${coincidencia.id}`;
                    if (ultimoDisparoRef.current !== claveDisparo) {
                        ultimoDisparoRef.current = claveDisparo;
                        dispararAlarma(coincidencia);
                    }
                }
            } catch (e) {
                console.log('Error en ciclo de alarma:', e);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, []);

    const handleIrAEjercicio = () => {
        setModalVisible(false);
        setAlarmaActiva(null);
        router.push('/ejercicios');
    };

    const handlePosponer = () => {
        setModalVisible(false);
        setAlarmaActiva(null);
        // Posponer 5 minutos
        pospuestoHastaRef.current = Date.now() + 5 * 60 * 1000;
    };

    const handleCerrar = () => {
        setModalVisible(false);
        setAlarmaActiva(null);
    };

    if (!modalVisible || !alarmaActiva) return null;

    const infoHora = formatearHora12(alarmaActiva.hora);

    return (
        <Modal
            visible={modalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={handleCerrar}
        >
            <View style={st.overlay}>
                <View style={st.card}>
                    {/* Icono de campana vibrante */}
                    <LinearGradient
                        colors={['#2563EB', '#1D4ED8']}
                        style={st.iconWrap}
                    >
                        <Ionicons name="notifications" size={42} color="#FFFFFF" />
                    </LinearGradient>

                    <Text style={st.badge}>RECORDATORIO VITAL</Text>
                    <Text style={st.titulo}>¡Es hora de tu ejercicio!</Text>

                    {/* Caja de información del recordatorio */}
                    <View style={st.cajaInfo}>
                        <Ionicons name="time" size={24} color="#2563EB" />
                        <View style={{ flex: 1 }}>
                            <Text style={st.nombreRecordatorio}>
                                {alarmaActiva.label || 'Rutina diaria'}
                            </Text>
                            <Text style={st.horaRecordatorio}>
                                {infoHora.etiquetaCompleta}
                            </Text>
                        </View>
                    </View>

                    <Text style={st.mensaje}>
                        Dedicar unos minutos a tu cuerpo hoy te dará más fuerza, equilibrio y energía para disfrutar tu día.
                    </Text>

                    {/* Botón principal grande */}
                    <TouchableOpacity
                        style={st.btnPrincipal}
                        onPress={handleIrAEjercicio}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['#16A34A', '#15803D']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={st.btnPrincipalGradiente}
                        >
                            <Ionicons name="play-circle" size={26} color="#FFFFFF" />
                            <Text style={st.btnPrincipalTxt}>Hacer mi ejercicio ahora</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={st.filaSecundaria}>
                        <TouchableOpacity
                            style={st.btnPosponer}
                            onPress={handlePosponer}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="timer-outline" size={18} color="#475569" />
                            <Text style={st.btnPosponerTxt}>Posponer 5 min</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={st.btnCerrar}
                            onPress={handleCerrar}
                            activeOpacity={0.7}
                        >
                            <Text style={st.btnCerrarTxt}>Listo, gracias</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const st = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(11, 19, 43, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        zIndex: 99999,
        elevation: 99999,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        paddingHorizontal: 26,
        paddingTop: 30,
        paddingBottom: 24,
        alignItems: 'center',
        width: '100%',
        maxWidth: 440,
        ...Platform.select({
            web: { boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)' },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
            android: { elevation: 12 },
        }),
    },
    iconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        ...Platform.select({
            web: { boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)' },
        }),
    },
    badge: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2563EB',
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    titulo: {
        fontSize: 24,
        fontWeight: '900',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 14,
    },
    cajaInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#EFF6FF',
        borderWidth: 1.5,
        borderColor: '#BFDBFE',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        width: '100%',
        marginBottom: 14,
    },
    nombreRecordatorio: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1E3A8A',
    },
    horaRecordatorio: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2563EB',
        marginTop: 2,
    },
    mensaje: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    btnPrincipal: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
        ...Platform.select({
            web: { boxShadow: '0 6px 20px rgba(22, 163, 74, 0.35)' },
        }),
    },
    btnPrincipalGradiente: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
    },
    btnPrincipalTxt: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    filaSecundaria: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    btnPosponer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#F1F5F9',
        paddingVertical: 13,
        borderRadius: 14,
    },
    btnPosponerTxt: {
        color: '#475569',
        fontSize: 14,
        fontWeight: '700',
    },
    btnCerrar: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: 14,
    },
    btnCerrarTxt: {
        color: '#94A3B8',
        fontSize: 14,
        fontWeight: '600',
    },
});
