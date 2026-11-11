import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
    StatusBar, ActivityIndicator, TextInput, RefreshControl
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';

interface Adulto {
    id_vinculo: number;
    id_adulto: number;
    nombre: string;
    estado: 'pendiente' | 'autorizado';
    nivel_funcional: number | null;
}

interface Progreso {
    totales: { completadas: number; detenidas: number; minutos: number; esfuerzo_promedio: number | null };
    semana: number[];
    racha: number;
    ultima_alarma: string | null;
    sesiones: {
        ejercicio: string; fecha_hora_inicio: string; duracion_segundos: number | null;
        nivel_esfuerzo: number | null; completado: number; comentarios: string | null;
    }[];
}

const NOMBRE_NIVEL: Record<number, string> = { 0: 'Consulta médica', 1: 'Nivel 1 · Suave', 2: 'Nivel 2 · Moderado', 3: 'Nivel 3 · Activo' };
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Pantalla del cuidador o familiar (RF12): solo lectura del progreso de quien lo autorizó (RN05)
export default function CuidadorScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [nombre, setNombre] = useState('');
    const [codigo, setCodigo] = useState('');
    const [adultos, setAdultos] = useState<Adulto[]>([]);
    const [seleccionado, setSeleccionado] = useState<Adulto | null>(null);
    const [progreso, setProgreso] = useState<Progreso | null>(null);
    const [cargando, setCargando] = useState(true);
    const [enviando, setEnviando] = useState(false);

    const cargarAdultos = async () => {
        try {
            setNombre((await AsyncStorage.getItem('userName')) || '');
            const res = await fetchSeguro(`${API_URL}/cuidador/adultos`);
            const data = await res.json();
            if (data.success) setAdultos(data.adultos);
        } catch (e) {
            console.log('No se pudo cargar la lista de adultos:', e);
        } finally {
            setCargando(false);
        }
    };

    useFocusEffect(useCallback(() => { cargarAdultos(); }, []));

    const vincular = async () => {
        if (codigo.replace(/\D/g, '').length !== 6) {
            avisar('Código incompleto', 'El código tiene 6 números. Pídeselo al adulto mayor.');
            return;
        }
        setEnviando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/cuidador/vincular`, {
                method: 'POST',
                body: JSON.stringify({ codigo }),
            });
            const data = await res.json();
            avisar(data.success ? 'Solicitud enviada' : 'No se pudo vincular', data.message);
            if (data.success) {
                setCodigo('');
                cargarAdultos();
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setEnviando(false);
        }
    };

    const verProgreso = async (adulto: Adulto) => {
        if (adulto.estado !== 'autorizado') return;
        setSeleccionado(adulto);
        setProgreso(null);
        try {
            const res = await fetchSeguro(`${API_URL}/cuidador/adultos/${adulto.id_adulto}/progreso`);
            const data = await res.json();
            if (data.success) {
                setProgreso(data);
            } else {
                avisar('Sin acceso', data.message);
                setSeleccionado(null);
                cargarAdultos();
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
            setSeleccionado(null);
        }
    };

    const cerrarSesion = async () => {
        await Promise.all(
            ['userId', 'userName', 'userEmail', 'userAge', 'userRol', 'jwtToken', 'userConditions'].map(k => AsyncStorage.removeItem(k))
        );
        router.replace('/login');
    };

    const alarmaReciente = progreso?.ultima_alarma
        && (Date.now() - new Date(progreso.ultima_alarma).getTime()) < 7 * 86400000;

    const tarjeta = [styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.cardBorder }];

    if (seleccionado) {
        const maxSemana = Math.max(1, ...(progreso?.semana || [0]));
        return (
            <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
                <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
                <ScrollView contentContainerStyle={styles.contenido}>
                    <View style={styles.webContainer}>
                        <TouchableOpacity style={styles.volver} onPress={() => setSeleccionado(null)}>
                            <Ionicons name="arrow-back" size={28} color={colors.text} />
                            <Text style={[styles.volverTexto, { color: colors.text }]}>Volver</Text>
                        </TouchableOpacity>
                        <Text style={[styles.titulo, { color: colors.text }]}>{seleccionado.nombre}</Text>
                        {seleccionado.nivel_funcional !== null && (
                            <Text style={[styles.subtitulo, { color: colors.textSecondary }]}>{NOMBRE_NIVEL[seleccionado.nivel_funcional]}</Text>
                        )}

                        {!progreso ? (
                            <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
                        ) : (
                            <>
                                {alarmaReciente && (
                                    <View style={styles.alerta}>
                                        <Ionicons name="alert-circle" size={32} color="#B91C1C" />
                                        <Text style={styles.alertaTexto}>
                                            El {new Date(progreso.ultima_alarma!).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} detuvo
                                            un ejercicio porque se sintió mal. Pregúntale cómo está.
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.filaResumen}>
                                    {[
                                        { valor: progreso.racha, texto: 'días seguidos', icono: 'flame' },
                                        { valor: progreso.totales.completadas, texto: 'ejercicios hechos', icono: 'checkmark-circle' },
                                        { valor: progreso.totales.minutos, texto: 'minutos', icono: 'time' },
                                        { valor: progreso.totales.esfuerzo_promedio ?? '—', texto: 'esfuerzo (0–10)', icono: 'pulse' },
                                    ].map(d => (
                                        <View key={d.texto} style={[styles.dato, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                                            <Ionicons name={d.icono as any} size={26} color="#2563EB" />
                                            <Text style={[styles.datoValor, { color: colors.text }]}>{d.valor}</Text>
                                            <Text style={[styles.datoTexto, { color: colors.textSecondary }]}>{d.texto}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={tarjeta}>
                                    <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Esta semana</Text>
                                    <View style={styles.barras}>
                                        {progreso.semana.map((n, i) => (
                                            <View key={i} style={styles.barraCol}>
                                                <Text style={[styles.barraNum, { color: colors.text }]}>{n}</Text>
                                                <View style={[styles.barra, { height: 8 + (n / maxSemana) * 90, backgroundColor: n > 0 ? '#2563EB' : colors.cardBorder }]} />
                                                <Text style={[styles.barraDia, { color: colors.textSecondary }]}>{DIAS[i]}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={tarjeta}>
                                    <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Últimos ejercicios</Text>
                                    {progreso.sesiones.length === 0 && (
                                        <Text style={[styles.texto, { color: colors.textSecondary }]}>Todavía no ha hecho ejercicios.</Text>
                                    )}
                                    {progreso.sesiones.map((s, i) => (
                                        <View key={i} style={[styles.sesion, { borderBottomColor: colors.cardBorder }]}>
                                            <Ionicons
                                                name={s.completado ? 'checkmark-circle' : 'hand-left'}
                                                size={28}
                                                color={s.completado ? '#059669' : '#DC2626'}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.texto, { color: colors.text, fontWeight: '700' }]}>{s.ejercicio}</Text>
                                                <Text style={[styles.textoChico, { color: colors.textSecondary }]}>
                                                    {new Date(s.fecha_hora_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    {s.completado
                                                        ? (s.nivel_esfuerzo !== null ? ` · esfuerzo ${s.nivel_esfuerzo}/10` : '')
                                                        : ` · ${s.comentarios || 'Detenido'}`}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
            <ScrollView
                contentContainerStyle={styles.contenido}
                refreshControl={<RefreshControl refreshing={false} onRefresh={cargarAdultos} />}
            >
                <View style={styles.webContainer}>
                    <View style={styles.encabezado}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.titulo, { color: colors.text, textAlign: 'left' }]}>Hola{nombre ? `, ${nombre}` : ''}</Text>
                            <Text style={[styles.texto, { color: colors.textSecondary }]}>Cuenta de cuidador</Text>
                        </View>
                        <TouchableOpacity onPress={cerrarSesion} style={styles.botonIcono} accessibilityLabel="Cerrar sesión">
                            <Ionicons name="log-out-outline" size={30} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={tarjeta}>
                        <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Agregar a una persona</Text>
                        <Text style={[styles.texto, { color: colors.textSecondary, marginBottom: 12 }]}>
                            Pídele al adulto mayor que abra su perfil, toque «Privacidad y cuidadores» y te dé su código de 6 números.
                        </Text>
                        <TextInput
                            style={[styles.inputCodigo, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                            value={codigo}
                            onChangeText={t => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
                            keyboardType="number-pad"
                            placeholder="000000"
                            placeholderTextColor={colors.textSecondary}
                            maxLength={6}
                        />
                        <TouchableOpacity style={styles.botonPrincipal} onPress={vincular} disabled={enviando}>
                            {enviando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.botonPrincipalTexto}>Enviar solicitud</Text>}
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.tarjetaTitulo, { color: colors.text, marginTop: 8 }]}>Personas que acompañas</Text>
                    {cargando ? (
                        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 20 }} />
                    ) : adultos.length === 0 ? (
                        <Text style={[styles.texto, { color: colors.textSecondary }]}>Aún no acompañas a nadie.</Text>
                    ) : adultos.map(a => (
                        <TouchableOpacity
                            key={a.id_vinculo}
                            style={[...tarjeta, styles.filaAdulto]}
                            onPress={() => verProgreso(a)}
                            disabled={a.estado !== 'autorizado'}
                        >
                            <Ionicons name="person-circle" size={44} color={a.estado === 'autorizado' ? '#2563EB' : colors.textSecondary} />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.texto, { color: colors.text, fontWeight: '800' }]}>{a.nombre}</Text>
                                <Text style={[styles.textoChico, { color: a.estado === 'autorizado' ? '#059669' : '#D97706' }]}>
                                    {a.estado === 'autorizado' ? 'Toca para ver su progreso' : 'Esperando su autorización'}
                                </Text>
                            </View>
                            {a.estado === 'autorizado' && <Ionicons name="chevron-forward" size={28} color={colors.textSecondary} />}
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    contenido: { padding: 20, paddingBottom: 48 },
    webContainer: { width: '100%', maxWidth: 600, alignSelf: 'center' },
    encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    botonIcono: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
    titulo: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
    subtitulo: { fontSize: 19, textAlign: 'center', marginTop: 4, marginBottom: 12 },
    tarjeta: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14 },
    tarjetaTitulo: { fontSize: 21, fontWeight: '800', marginBottom: 8 },
    texto: { fontSize: 18, lineHeight: 26 },
    textoChico: { fontSize: 16, lineHeight: 22, marginTop: 2 },
    inputCodigo: {
        borderWidth: 2, borderRadius: 14, minHeight: 64, fontSize: 32, fontWeight: '800',
        textAlign: 'center', letterSpacing: 10, marginBottom: 12,
    },
    botonPrincipal: { backgroundColor: '#1D4ED8', borderRadius: 16, minHeight: 60, justifyContent: 'center', alignItems: 'center' },
    botonPrincipalTexto: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
    filaAdulto: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
    volver: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
    volverTexto: { fontSize: 19, fontWeight: '700' },
    alerta: {
        flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5', borderWidth: 2, borderRadius: 16, padding: 16, marginBottom: 14,
    },
    alertaTexto: { flex: 1, fontSize: 18, lineHeight: 26, color: '#7F1D1D', fontWeight: '700' },
    filaResumen: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    dato: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: 'center' },
    datoValor: { fontSize: 30, fontWeight: '800', marginTop: 4 },
    datoTexto: { fontSize: 16, textAlign: 'center' },
    barras: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, marginTop: 8 },
    barraCol: { alignItems: 'center', flex: 1 },
    barraNum: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    barra: { width: 26, borderRadius: 8 },
    barraDia: { fontSize: 15, marginTop: 6 },
    sesion: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
});
