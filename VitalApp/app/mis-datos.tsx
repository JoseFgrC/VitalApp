import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
    StatusBar, ActivityIndicator, TextInput, Platform, Share
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar, confirmar } from '../utils/dialogos';

interface Vinculo {
    id_vinculo: number;
    estado: 'invitacion' | 'pendiente' | 'autorizado';
    codigo: string;
    codigo_expira: string;
    nombre_cuidador: string | null;
    email_cuidador: string | null;
}

const NOMBRE_NIVEL: Record<number, string> = { 0: 'Consulta médica', 1: 'Nivel 1 · Suave', 2: 'Nivel 2 · Moderado', 3: 'Nivel 3 · Activo' };

// Privacidad y cuidadores del adulto mayor: cuidador vinculado (RF12) y derechos sobre los datos (RF15)
export default function MisDatosScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [vinculos, setVinculos] = useState<Vinculo[]>([]);
    const [nivel, setNivel] = useState<number | null>(null);
    const [cargando, setCargando] = useState(true);
    const [textoEliminar, setTextoEliminar] = useState('');
    const [ocupado, setOcupado] = useState(false);

    const cargar = async () => {
        try {
            const [resV, resN] = await Promise.all([
                fetchSeguro(`${API_URL}/cuidadores`),
                fetchSeguro(`${API_URL}/valoracion`),
            ]);
            const dataV = await resV.json();
            const dataN = await resN.json();
            if (dataV.success) setVinculos(dataV.vinculos);
            if (dataN.success) setNivel(dataN.nivel);
        } catch (e) {
            console.log('No se pudo cargar la información de privacidad:', e);
        } finally {
            setCargando(false);
        }
    };

    useFocusEffect(useCallback(() => { cargar(); }, []));

    const post = async (ruta: string, body: object = {}) => {
        setOcupado(true);
        try {
            const res = await fetchSeguro(`${API_URL}${ruta}`, { method: 'POST', body: JSON.stringify(body) });
            const data = await res.json();
            // Si la sesión terminó, fetchSeguro ya lleva al login con su propio aviso
            if (!data.success && !String(data.message || '').includes('Token JWT')) avisar('No se pudo completar', data.message);
            return data;
        } catch (e: any) {
            avisar('Error de conexión', e.message);
            return { success: false };
        } finally {
            setOcupado(false);
        }
    };

    const generarCodigo = async () => {
        const data = await post('/cuidadores/codigo');
        if (data.success) cargar();
    };

    const decidir = async (v: Vinculo, autorizar: boolean) => {
        const data = await post(`/cuidadores/${v.id_vinculo}/autorizar`, { autorizar });
        if (data.success) cargar();
    };

    const quitarAcceso = (v: Vinculo) => confirmar(
        'Quitar acceso',
        `${v.nombre_cuidador} ya no podrá ver tu progreso.`,
        'Quitar acceso',
        async () => {
            const data = await post(`/cuidadores/${v.id_vinculo}/revocar`);
            if (data.success) cargar();
        }
    );

    // Derecho de acceso: el usuario obtiene una copia de todos sus datos
    const descargarDatos = async () => {
        setOcupado(true);
        try {
            const res = await fetchSeguro(`${API_URL}/mis-datos`);
            const data = await res.json();
            if (!data.success) return avisar('No se pudo obtener tus datos', data.message);
            const json = JSON.stringify(data.datos, null, 2);
            if (Platform.OS === 'web') {
                const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mis-datos-vitalapp.json';
                a.click();
                URL.revokeObjectURL(url);
            } else {
                await Share.share({ title: 'Mis datos de VitalApp', message: json });
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setOcupado(false);
        }
    };

    const retirarConsentimiento = () => confirmar(
        'Retirar consentimiento',
        'Se borrarán tu valoración, tu nivel y tus condiciones médicas, y tus cuidadores dejarán de ver tu progreso. Para volver a usar los ejercicios tendrás que aceptar el aviso y repetir la valoración.',
        'Retirar',
        async () => {
            const data = await post('/consentimiento/revocar');
            if (data.success) avisar('Consentimiento retirado', data.message, () => router.replace('/consentimiento'));
        }
    );

    const eliminarCuenta = () => {
        if (textoEliminar.trim().toUpperCase() !== 'ELIMINAR') {
            return avisar('Confirmación necesaria', 'Escribe la palabra ELIMINAR para confirmar.');
        }
        confirmar('Eliminar cuenta', 'Se borrarán tu cuenta y todos tus datos. Esta acción no se puede deshacer.', 'Eliminar', async () => {
            setOcupado(true);
            try {
                const res = await fetchSeguro(`${API_URL}/mis-datos`, {
                    method: 'DELETE',
                    body: JSON.stringify({ confirmacion: 'ELIMINAR' }),
                });
                const data = await res.json();
                if (!data.success) return avisar('No se pudo eliminar', data.message);
                await AsyncStorage.clear();
                avisar('Cuenta eliminada', data.message, () => router.replace('/login'));
            } catch (e: any) {
                avisar('Error de conexión', e.message);
            } finally {
                setOcupado(false);
            }
        });
    };

    const invitacion = vinculos.find(v => v.estado === 'invitacion');
    const pendientes = vinculos.filter(v => v.estado === 'pendiente');
    const autorizados = vinculos.filter(v => v.estado === 'autorizado');
    const tarjeta = [styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.cardBorder }];
    const Boton = ({ texto, onPress, color = '#1D4ED8', icono }: { texto: string; onPress: () => void; color?: string; icono?: string }) => (
        <TouchableOpacity style={[styles.boton, { backgroundColor: color }]} onPress={onPress} disabled={ocupado}>
            {icono && <Ionicons name={icono as any} size={24} color="#FFFFFF" />}
            <Text style={styles.botonTexto}>{texto}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
            <ScrollView contentContainerStyle={styles.contenido}>
                <View style={styles.webContainer}>
                    <TouchableOpacity style={styles.volver} onPress={() => router.canGoBack() ? router.back() : router.replace('/perfil')}>
                        <Ionicons name="arrow-back" size={28} color={colors.text} />
                        <Text style={[styles.volverTexto, { color: colors.text }]}>Volver</Text>
                    </TouchableOpacity>
                    <Text style={[styles.titulo, { color: colors.text }]}>Privacidad y cuidadores</Text>

                    {cargando ? <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} /> : (
                        <>
                            {/* Valoración */}
                            <View style={tarjeta}>
                                <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Mi nivel</Text>
                                <Text style={[styles.texto, { color: colors.textSecondary, marginBottom: 12 }]}>
                                    {nivel === null ? 'Aún no tienes valoración.' : NOMBRE_NIVEL[nivel]}
                                </Text>
                                <Boton texto={nivel === null ? 'Hacer la valoración' : 'Repetir la valoración'} icono="clipboard" onPress={() => router.push('/valoracion')} />
                            </View>

                            {/* Cuidadores */}
                            <View style={tarjeta}>
                                <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Mis cuidadores</Text>
                                <Text style={[styles.texto, { color: colors.textSecondary, marginBottom: 12 }]}>
                                    Un familiar puede ver tus ejercicios y tu avance, pero no tus datos médicos ni cambiar nada. Tú decides quién y puedes quitarle el acceso cuando quieras.
                                </Text>

                                {invitacion ? (
                                    <View style={[styles.cajaCodigo, { borderColor: '#2563EB' }]}>
                                        <Text style={[styles.texto, { color: colors.text }]}>Dale este código a tu cuidador:</Text>
                                        <Text style={[styles.codigo, colors.isDark && { color: '#93C5FD' }]}>{invitacion.codigo.slice(0, 3)} {invitacion.codigo.slice(3)}</Text>
                                        <Text style={[styles.textoChico, { color: colors.textSecondary }]}>
                                            Sirve hasta el {new Date(invitacion.codigo_expira).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                                        </Text>
                                    </View>
                                ) : (
                                    <Boton texto="Invitar a un cuidador" icono="person-add" onPress={generarCodigo} />
                                )}

                                {pendientes.map(v => (
                                    <View key={v.id_vinculo} style={[styles.solicitud, { borderColor: '#F59E0B' }]}>
                                        <Text style={[styles.texto, { color: colors.text, fontWeight: '700' }]}>
                                            {v.nombre_cuidador} ({v.email_cuidador}) quiere ver tu progreso.
                                        </Text>
                                        <View style={styles.fila}>
                                            <View style={{ flex: 1 }}><Boton texto="Autorizar" color="#059669" onPress={() => decidir(v, true)} /></View>
                                            <View style={{ flex: 1 }}><Boton texto="Rechazar" color="#64748B" onPress={() => decidir(v, false)} /></View>
                                        </View>
                                    </View>
                                ))}

                                {autorizados.map(v => (
                                    <View key={v.id_vinculo} style={[styles.solicitud, { borderColor: colors.cardBorder }]}>
                                        <Text style={[styles.texto, { color: colors.text, fontWeight: '700' }]}>
                                            <Ionicons name="checkmark-circle" size={20} color="#059669" /> {v.nombre_cuidador} puede ver tu progreso
                                        </Text>
                                        <Boton texto="Quitar acceso" color="#B91C1C" onPress={() => quitarAcceso(v)} />
                                    </View>
                                ))}
                            </View>

                            {/* Derechos sobre los datos */}
                            <View style={tarjeta}>
                                <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>Mis datos</Text>
                                <Text style={[styles.texto, { color: colors.textSecondary, marginBottom: 12 }]}>
                                    Puedes corregir tus datos en tu perfil, obtener una copia o pedir que se borren.
                                </Text>
                                <Boton texto="Descargar mis datos" icono="download" onPress={descargarDatos} />
                                <View style={{ height: 10 }} />
                                <Boton texto="Retirar mi consentimiento" icono="shield-outline" color="#B45309" onPress={retirarConsentimiento} />
                            </View>

                            <View style={[...tarjeta, { borderColor: '#FCA5A5' }]}>
                                <Text style={[styles.tarjetaTitulo, { color: colors.isDark ? '#FCA5A5' : '#B91C1C' }]}>Eliminar mi cuenta</Text>
                                <Text style={[styles.texto, { color: colors.textSecondary, marginBottom: 12 }]}>
                                    Se borrará todo: perfil, valoraciones, ejercicios y cuidadores. Escribe ELIMINAR para confirmar.
                                </Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                                    value={textoEliminar}
                                    onChangeText={setTextoEliminar}
                                    autoCapitalize="characters"
                                    placeholder="ELIMINAR"
                                    placeholderTextColor={colors.textSecondary}
                                />
                                <Boton texto="Eliminar mi cuenta" icono="trash" color="#B91C1C" onPress={eliminarCuenta} />
                            </View>
                        </>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    contenido: { padding: 20, paddingBottom: 48 },
    webContainer: { width: '100%', maxWidth: 600, alignSelf: 'center' },
    volver: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
    volverTexto: { fontSize: 19, fontWeight: '700' },
    titulo: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
    tarjeta: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14 },
    tarjetaTitulo: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
    texto: { fontSize: 18, lineHeight: 26 },
    textoChico: { fontSize: 18, lineHeight: 24 },
    boton: {
        flexDirection: 'row', gap: 10, borderRadius: 14, minHeight: 58,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12,
    },
    botonTexto: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
    cajaCodigo: { borderWidth: 2, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 },
    codigo: { fontSize: 44, fontWeight: '900', letterSpacing: 6, color: '#1D4ED8' },
    solicitud: { borderWidth: 2, borderRadius: 14, padding: 14, marginTop: 12, gap: 10 },
    fila: { flexDirection: 'row', gap: 10 },
    input: { borderWidth: 2, borderRadius: 12, minHeight: 56, paddingHorizontal: 14, fontSize: 20, marginBottom: 12 },
});
