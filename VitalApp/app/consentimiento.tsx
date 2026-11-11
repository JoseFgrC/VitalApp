import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
    StatusBar, ActivityIndicator, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';

// Aviso de privacidad simplificado (LFPDPPP 2025). Versión 1.0 — debe coincidir con VERSION_AVISO del backend.
const SECCIONES_AVISO = [
    {
        titulo: '¿Quién cuida tus datos?',
        texto: 'El equipo de VitalApp del Instituto Tecnológico de Colima es responsable del uso y protección de tus datos personales.',
    },
    {
        titulo: '¿Qué datos usamos?',
        texto: 'Tu nombre, correo, fecha de nacimiento, peso y estatura. También datos de salud: tus respuestas al cuestionario de valoración, la puntuación de la Escala de Berg, tu nivel funcional y el registro de tus sesiones de ejercicio.',
    },
    {
        titulo: '¿Para qué los usamos?',
        texto: 'Solo para asignarte ejercicios adecuados a tu nivel y mostrarte tu progreso. No vendemos ni compartimos tus datos con nadie.',
    },
    {
        titulo: 'Tus derechos',
        texto: 'Puedes consultar, corregir o pedir que borremos tus datos en cualquier momento desde tu perfil o escribiendo al equipo de VitalApp.',
    },
];

export default function ConsentimientoScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [aceptaDatos, setAceptaDatos] = useState(false);
    const [entiendeAviso, setEntiendeAviso] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const puedeContinuar = aceptaDatos && entiendeAviso;

    const aceptar = async () => {
        if (!puedeContinuar) return;
        setGuardando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/consentimiento`, {
                method: 'POST',
                body: JSON.stringify({ acepta: true }),
            });
            const data = await res.json();
            if (data.success) {
                router.replace('/valoracion');
            } else {
                avisar('No se pudo guardar', data.message || 'Inténtalo de nuevo.');
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setGuardando(false);
        }
    };

    const rechazar = async () => {
        await Promise.all(
            ['userId', 'userName', 'userEmail', 'userAge', 'userRol', 'jwtToken'].map(k => AsyncStorage.removeItem(k))
        );
        router.replace('/login');
    };

    const Casilla = ({ marcada, onPress, texto }: { marcada: boolean; onPress: () => void; texto: string }) => (
        <TouchableOpacity
            style={[styles.casilla, { backgroundColor: colors.card, borderColor: marcada ? '#2563EB' : colors.cardBorder }]}
            onPress={onPress}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: marcada }}
        >
            <Ionicons name={marcada ? 'checkbox' : 'square-outline'} size={36} color={marcada ? '#2563EB' : colors.textSecondary} />
            <Text style={[styles.casillaTexto, { color: colors.text }]}>{texto}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
            <ScrollView contentContainerStyle={styles.contenido}>
                <View style={styles.webContainer}>
                    <Ionicons name="shield-checkmark" size={56} color="#2563EB" style={{ alignSelf: 'center' }} />
                    <Text style={[styles.titulo, { color: colors.text }]}>Aviso de privacidad</Text>
                    <Text style={[styles.subtitulo, { color: colors.textSecondary }]}>
                        Antes de empezar, lee cómo usamos tu información.
                    </Text>

                    {SECCIONES_AVISO.map(s => (
                        <View key={s.titulo} style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <Text style={[styles.tarjetaTitulo, { color: colors.text }]}>{s.titulo}</Text>
                            <Text style={[styles.tarjetaTexto, { color: colors.textSecondary }]}>{s.texto}</Text>
                        </View>
                    ))}

                    {/* RD06: aviso de que la app no sustituye la valoración médica */}
                    <View style={[styles.avisoMedico, colors.isDark && { backgroundColor: '#451a03', borderColor: '#92400e' }]}>
                        <Ionicons name="medkit" size={32} color="#D97706" />
                        <Text style={[styles.avisoMedicoTexto, colors.isDark && { color: '#fcd34d' }]}>
                            VitalApp es una herramienta de apoyo al bienestar. No sustituye la valoración ni el tratamiento de tu médico.
                            Si tienes una enfermedad del corazón, fragilidad o te operaron recientemente, consulta a tu médico antes de hacer ejercicio.
                        </Text>
                    </View>

                    <Casilla
                        marcada={aceptaDatos}
                        onPress={() => setAceptaDatos(v => !v)}
                        texto="Acepto que VitalApp use mis datos de salud para recomendarme ejercicios."
                    />
                    <Casilla
                        marcada={entiendeAviso}
                        onPress={() => setEntiendeAviso(v => !v)}
                        texto="Entiendo que la app no sustituye a mi médico."
                    />

                    <TouchableOpacity
                        style={[styles.botonPrincipal, !puedeContinuar && styles.botonDeshabilitado]}
                        onPress={aceptar}
                        disabled={!puedeContinuar || guardando}
                    >
                        {guardando
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.botonPrincipalTexto}>Acepto y continúo</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.botonSecundario} onPress={rechazar}>
                        <Text style={[styles.botonSecundarioTexto, { color: colors.textSecondary }]}>
                            No acepto (cerrar sesión)
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    contenido: { padding: 20, paddingBottom: 48 },
    webContainer: { width: '100%', maxWidth: 600, alignSelf: 'center' },
    titulo: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 12 },
    subtitulo: { fontSize: 19, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 27 },
    tarjeta: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 12 },
    tarjetaTitulo: { fontSize: 21, fontWeight: '700', marginBottom: 6 },
    tarjetaTexto: { fontSize: 18, lineHeight: 27 },
    avisoMedico: {
        flexDirection: 'row', gap: 12, alignItems: 'flex-start',
        backgroundColor: '#FFFBEB', borderColor: '#FCD34D', borderWidth: 2,
        borderRadius: 16, padding: 18, marginVertical: 12,
    },
    avisoMedicoTexto: { flex: 1, fontSize: 18, lineHeight: 27, color: '#92400E', fontWeight: '600' },
    casilla: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderWidth: 2, borderRadius: 16, padding: 16, marginBottom: 12, minHeight: 64,
    },
    casillaTexto: { flex: 1, fontSize: 19, lineHeight: 27, fontWeight: '600' },
    botonPrincipal: {
        backgroundColor: '#1D4ED8', borderRadius: 16, minHeight: 64,
        justifyContent: 'center', alignItems: 'center', marginTop: 12,
        ...Platform.select({ web: { cursor: 'pointer' } as any }),
    },
    botonDeshabilitado: { backgroundColor: '#94A3B8' },
    botonPrincipalTexto: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
    botonSecundario: { minHeight: 56, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
    botonSecundarioTexto: { fontSize: 18, textDecorationLine: 'underline', fontWeight: '600' },
});
