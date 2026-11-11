import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
    StatusBar, ActivityIndicator, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';

// Las claves deben coincidir con PREGUNTAS_TAMIZAJE de VitalBackend/utils/nivel.js
const PREGUNTAS = [
    { clave: 'indicacion_medica', texto: '¿Su médico le ha dicho que no haga ejercicio?' },
    { clave: 'dolor_pecho', texto: '¿Siente dolor en el pecho cuando hace esfuerzo?' },
    { clave: 'caida_ultimo_anio', texto: '¿Se ha caído en los últimos 12 meses?' },
    { clave: 'usa_apoyo', texto: '¿Usa bastón, andadera u otro apoyo para caminar?' },
    { clave: 'dolor_limita', texto: '¿Tiene algún dolor que le limite al moverse?' },
    { clave: 'mareos', texto: '¿Ha tenido mareos o desmayos recientemente?' },
    { clave: 'miedo_caer', texto: '¿Le da miedo caerse al caminar o al levantarse?' },
];

const NIVELES: Record<number, { nombre: string; descripcion: string; color: string }> = {
    0: { nombre: 'Consulta médica', descripcion: 'Por ahora no te mostraremos rutinas. Consulta a tu médico y repite la valoración cuando te autorice.', color: '#DC2626' },
    1: { nombre: 'Nivel 1 · Suave', descripcion: 'Ejercicios sentados o con apoyo, de muy baja intensidad.', color: '#D97706' },
    2: { nombre: 'Nivel 2 · Moderado', descripcion: 'Ejercicios de pie con apoyo cercano y movimientos controlados.', color: '#2563EB' },
    3: { nombre: 'Nivel 3 · Activo', descripcion: 'Ejercicios de fuerza, equilibrio y resistencia moderada.', color: '#059669' },
};

type Respuestas = Record<string, boolean | undefined>;

export default function ValoracionScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [respuestas, setRespuestas] = useState<Respuestas>({});
    const [conBerg, setConBerg] = useState(false);
    const [puntajeBerg, setPuntajeBerg] = useState('');
    const [aplicador, setAplicador] = useState('');
    const [fechaBerg, setFechaBerg] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [resultado, setResultado] = useState<{ nivel: number | null; mensaje: string } | null>(null);

    // Si ya existe una valoración, se muestra el nivel actual
    useEffect(() => {
        (async () => {
            try {
                const res = await fetchSeguro(`${API_URL}/valoracion`);
                const data = await res.json();
                if (data.success && !data.consentimiento) {
                    router.replace('/consentimiento');
                    return;
                }
                if (data.success && data.nivel !== null) {
                    setResultado({ nivel: data.nivel, mensaje: 'Este es tu nivel actual. Puedes repetir la valoración si tu condición cambió.' });
                }
            } catch (e) {
                console.log('No se pudo cargar la valoración:', e);
            } finally {
                setCargando(false);
            }
        })();
    }, []);

    const completas = PREGUNTAS.every(p => typeof respuestas[p.clave] === 'boolean');

    const enviar = async () => {
        if (!completas) {
            avisar('Faltan respuestas', 'Responde todas las preguntas con Sí o No.');
            return;
        }
        if (conBerg) {
            const puntaje = Number(puntajeBerg);
            if (!Number.isInteger(puntaje) || puntaje < 0 || puntaje > 56) {
                avisar('Puntuación inválida', 'La Escala de Berg va de 0 a 56.');
                return;
            }
            if (aplicador.trim().length < 3) {
                avisar('Falta el aplicador', 'Escribe el nombre de quien aplicó la Escala de Berg.');
                return;
            }
            if (fechaBerg && !/^\d{4}-\d{2}-\d{2}$/.test(fechaBerg)) {
                avisar('Fecha inválida', 'Usa el formato AAAA-MM-DD.');
                return;
            }
        }

        setGuardando(true);
        try {
            const resT = await fetchSeguro(`${API_URL}/valoracion/tamizaje`, {
                method: 'POST',
                body: JSON.stringify({ respuestas }),
            });
            let data = await resT.json();
            if (data.success && conBerg) {
                const resB = await fetchSeguro(`${API_URL}/valoracion/berg`, {
                    method: 'POST',
                    body: JSON.stringify({
                        puntaje: Number(puntajeBerg),
                        aplicador: aplicador.trim(),
                        fecha_aplicacion: fechaBerg || null,
                    }),
                });
                data = await resB.json();
            }
            if (data.success) {
                setResultado({ nivel: data.nivel, mensaje: data.message });
            } else {
                avisar('No se pudo guardar', data.message || 'Inténtalo de nuevo.');
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <SafeAreaView style={[styles.safeArea, styles.centro, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color="#2563EB" />
            </SafeAreaView>
        );
    }

    if (resultado && resultado.nivel !== null) {
        const info = NIVELES[resultado.nivel];
        return (
            <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
                <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
                <ScrollView contentContainerStyle={styles.contenido}>
                    <View style={styles.webContainer}>
                        <Text style={[styles.titulo, { color: colors.text }]}>Tu nivel funcional</Text>
                        <View style={[styles.tarjetaNivel, { borderColor: info.color, backgroundColor: colors.card }]}>
                            <Text style={[styles.nivelNombre, { color: info.color }]}>{info.nombre}</Text>
                            <Text style={[styles.textoGrande, { color: colors.text }]}>{info.descripcion}</Text>
                            <Text style={[styles.textoNormal, { color: colors.textSecondary, marginTop: 12 }]}>{resultado.mensaje}</Text>
                        </View>

                        <TouchableOpacity style={styles.botonPrincipal} onPress={() => router.replace('/home')}>
                            <Text style={styles.botonPrincipalTexto}>
                                {resultado.nivel === 0 ? 'Ir al inicio' : 'Ver mis ejercicios'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.botonSecundario} onPress={() => { setResultado(null); setRespuestas({}); }}>
                            <Text style={[styles.botonSecundarioTexto, { color: colors.textSecondary }]}>Repetir la valoración</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.bg} />
            <ScrollView contentContainerStyle={styles.contenido}>
                <View style={styles.webContainer}>
                    <Ionicons name="clipboard" size={52} color="#2563EB" style={{ alignSelf: 'center' }} />
                    <Text style={[styles.titulo, { color: colors.text }]}>Valoración inicial</Text>
                    <Text style={[styles.subtitulo, { color: colors.textSecondary }]}>
                        Responde con sinceridad. Así te mostraremos solo ejercicios seguros para ti.
                    </Text>

                    {PREGUNTAS.map((p, i) => (
                        <View key={p.clave} style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <Text style={[styles.textoGrande, { color: colors.text }]}>{i + 1}. {p.texto}</Text>
                            <View style={styles.filaBotones}>
                                {[true, false].map(valor => {
                                    const elegido = respuestas[p.clave] === valor;
                                    return (
                                        <TouchableOpacity
                                            key={String(valor)}
                                            style={[styles.botonRespuesta, elegido && { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' }, { borderColor: elegido ? '#1D4ED8' : colors.inputBorder }]}
                                            onPress={() => setRespuestas(r => ({ ...r, [p.clave]: valor }))}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: elegido }}
                                        >
                                            <Text style={[styles.botonRespuestaTexto, { color: elegido ? '#FFFFFF' : colors.text }]}>
                                                {valor ? 'Sí' : 'No'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    ))}

                    {/* Escala de Berg: solo la registra un profesional o cuidador capacitado (RD03) */}
                    <TouchableOpacity
                        style={[styles.tarjeta, styles.filaBerg, { backgroundColor: colors.card, borderColor: conBerg ? '#2563EB' : colors.cardBorder }]}
                        onPress={() => setConBerg(v => !v)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: conBerg }}
                    >
                        <Ionicons name={conBerg ? 'checkbox' : 'square-outline'} size={34} color={conBerg ? '#2563EB' : colors.textSecondary} />
                        <Text style={[styles.textoGrande, { color: colors.text, flex: 1 }]}>
                            Un profesional o cuidador capacitado me aplicó la Escala de Berg
                        </Text>
                    </TouchableOpacity>

                    {conBerg && (
                        <View style={[styles.tarjeta, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                            <Text style={[styles.etiqueta, { color: colors.text }]}>Puntuación total (0 a 56)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                                value={puntajeBerg}
                                onChangeText={setPuntajeBerg}
                                keyboardType="numeric"
                                maxLength={2}
                                placeholder="Ej. 42"
                                placeholderTextColor={colors.textSecondary}
                            />
                            <Text style={[styles.etiqueta, { color: colors.text }]}>¿Quién la aplicó?</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                                value={aplicador}
                                onChangeText={setAplicador}
                                placeholder="Nombre del fisioterapeuta o cuidador"
                                placeholderTextColor={colors.textSecondary}
                            />
                            <Text style={[styles.etiqueta, { color: colors.text }]}>Fecha de aplicación (opcional)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                                value={fechaBerg}
                                onChangeText={setFechaBerg}
                                placeholder="AAAA-MM-DD"
                                placeholderTextColor={colors.textSecondary}
                            />
                            <Text style={[styles.textoNormal, { color: colors.textSecondary }]}>
                                No intentes hacer la Escala de Berg tú solo: incluye pruebas de equilibrio que deben hacerse con supervisión.
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.botonPrincipal, !completas && styles.botonDeshabilitado]}
                        onPress={enviar}
                        disabled={guardando}
                    >
                        {guardando
                            ? <ActivityIndicator color="#FFFFFF" />
                            : <Text style={styles.botonPrincipalTexto}>Ver mi nivel</Text>}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    centro: { justifyContent: 'center', alignItems: 'center' },
    contenido: { padding: 20, paddingBottom: 48 },
    webContainer: { width: '100%', maxWidth: 600, alignSelf: 'center' },
    titulo: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 12 },
    subtitulo: { fontSize: 19, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 27 },
    tarjeta: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14 },
    textoGrande: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
    textoNormal: { fontSize: 17, lineHeight: 25 },
    filaBotones: { flexDirection: 'row', gap: 12, marginTop: 14 },
    botonRespuesta: {
        flex: 1, minHeight: 60, borderRadius: 14, borderWidth: 2,
        justifyContent: 'center', alignItems: 'center',
    },
    botonRespuestaTexto: { fontSize: 21, fontWeight: '800' },
    filaBerg: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2 },
    etiqueta: { fontSize: 18, fontWeight: '700', marginBottom: 6, marginTop: 6 },
    input: { borderWidth: 2, borderRadius: 12, minHeight: 56, paddingHorizontal: 14, fontSize: 20, marginBottom: 10 },
    tarjetaNivel: { borderWidth: 3, borderRadius: 20, padding: 22, marginVertical: 20 },
    nivelNombre: { fontSize: 28, fontWeight: '800', marginBottom: 10 },
    botonPrincipal: {
        backgroundColor: '#1D4ED8', borderRadius: 16, minHeight: 64,
        justifyContent: 'center', alignItems: 'center', marginTop: 8,
    },
    botonDeshabilitado: { backgroundColor: '#94A3B8' },
    botonPrincipalTexto: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
    botonSecundario: { minHeight: 56, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
    botonSecundarioTexto: { fontSize: 18, textDecorationLine: 'underline', fontWeight: '600' },
});
