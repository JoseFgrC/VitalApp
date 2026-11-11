import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    SafeAreaView,
    Alert,
    ActivityIndicator,
    StatusBar,
    Switch,
    Platform,
    Modal,
    Image
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuInferior from '../components/MenuInferior';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { useTheme } from '../hooks/useTheme';


import { avisar, confirmar } from '../utils/dialogos';
import { OPCIONES_TAMANO, TamanoLetra, leerTamanoLetra, guardarTamanoLetra } from '../utils/tamanoLetra';
export default function PerfilScreen() {
    const router = useRouter();
    const [editando, setEditando] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [usuario, setUsuario] = useState({
        id: '',
        nombre: '',
        email: '',
        edad: '',
        peso: '',
        ejerciciosCompletados: 0,
        rachaDias: 0
    });
    const { colors, temaOscuro, toggleTheme } = useTheme();
    const [notificaciones, setNotificaciones] = useState(true);
    const [mostrarMensaje, setMostrarMensaje] = useState('');
    const [mensajeError, setMensajeError] = useState('');
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [mfaModalVisible, setMfaModalVisible] = useState(false);
    const [mfaQrCode, setMfaQrCode] = useState('');
    const [mfaSecret, setMfaSecret] = useState('');
    const [mfaTokenInput, setMfaTokenInput] = useState('');
    const [mfaLoading, setMfaLoading] = useState(false);
    // Accesibilidad: tamaño de letra y sección de opciones avanzadas (plegada)
    const [tamanoLetra, setTamanoLetra] = useState<TamanoLetra>('normal');
    const [verAvanzadas, setVerAvanzadas] = useState(false);
    useEffect(() => { leerTamanoLetra().then(setTamanoLetra); }, []);
    const elegirTamano = async (clave: TamanoLetra) => {
        setTamanoLetra(clave);
        await guardarTamanoLetra(clave);
    };

    // Cargar datos cada vez que la pantalla tiene foco
    useFocusEffect(
        useCallback(() => {
            cargarDatos();
        }, [])
    );

    const cargarDatos = async () => {
        try {
            setCargando(true);
            // Cargar datos de usuario de AsyncStorage
            const id = await AsyncStorage.getItem('userId');
            const nombre = await AsyncStorage.getItem('userName');
            const email = await AsyncStorage.getItem('userEmail');
            const edad = await AsyncStorage.getItem('userAge');
            const puntos = await AsyncStorage.getItem('userPoints');

            // Cargar estadísticas reales
            const statsStr = await AsyncStorage.getItem('userStats');
            const rachaStr = await AsyncStorage.getItem('streakDays');
            const stats = statsStr ? JSON.parse(statsStr) : null;

            // Cargar preferencias
            const temaGuardado = await AsyncStorage.getItem('darkMode');
            const notifGuardadas = await AsyncStorage.getItem('notifications');

            // Intentar obtener datos actualizados desde el backend (edad calculada en BD)
            let edadBackend = edad || '';
            let pesoBackend = await AsyncStorage.getItem('userWeight') || '';
            let nombreBackend = nombre || 'Usuario';
            let emailBackend = email || '';

            if (id) {
                try {
                    const response = await fetchSeguro(`${API_URL}/user/${id}`);
                    const data = await response.json();
                    if (data.success && data.user) {
                        edadBackend = data.user.edad?.toString() || edadBackend;
                        pesoBackend = data.user.peso?.toString() || pesoBackend;
                        nombreBackend = data.user.nombre || nombreBackend;
                        emailBackend = data.user.email || emailBackend;
                        if (data.user.mfa_enabled !== undefined) {
                            setMfaEnabled(!!data.user.mfa_enabled);
                        }

                        // Actualizar AsyncStorage con los datos frescos del backend
                        await AsyncStorage.setItem('userAge', edadBackend);
                        if (pesoBackend) await AsyncStorage.setItem('userWeight', pesoBackend);
                    }
                } catch (backendError) {
                    console.log('Backend no disponible, usando datos locales');
                }
            }

            setUsuario({
                id: id || '',
                nombre: nombreBackend,
                email: emailBackend,
                edad: edadBackend,
                peso: pesoBackend,
                ejerciciosCompletados: stats ? stats.exercises : 0,
                rachaDias: parseInt(rachaStr || '0')
            });

            if (notifGuardadas !== null) setNotificaciones(notifGuardadas === 'true');
        } catch (error) {
            console.log('Error cargando datos del perfil:', error);
        } finally {
            setCargando(false);
        }
    };

    const guardarCambios = async () => {
        if (!usuario.nombre.trim()) {
            setMensajeError('El nombre no puede estar vacío');
            setTimeout(() => setMensajeError(''), 3000);
            return;
        }

        setGuardando(true);
        try {
            // Guardar en AsyncStorage primero (siempre funciona)
            await AsyncStorage.setItem('userName', usuario.nombre);
            await AsyncStorage.setItem('userEmail', usuario.email);
            await AsyncStorage.setItem('userAge', usuario.edad);

            // Intentar guardar en el backend
            if (usuario.id) {
                try {
                    const response = await fetchSeguro(`${API_URL}/user/${usuario.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nombre: usuario.nombre,
                            email: usuario.email,
                            peso: parseFloat(usuario.peso) || 0
                        })
                    });
                    const data = await response.json();
                    if (!data.success) {
                        console.log('Backend update warning:', data.message);
                    }
                } catch (backendError) {
                    console.log('Backend no disponible, datos guardados localmente');
                }
            }

            setEditando(false);
            setMostrarMensaje('Perfil guardado correctamente.');
            setTimeout(() => setMostrarMensaje(''), 3000);
        } catch (error) {
            console.error('Error guardando perfil:', error);
            setMensajeError('Error al guardar los cambios');
            setTimeout(() => setMensajeError(''), 3000);
        } finally {
            setGuardando(false);
        }
    };

    const toggleTemaOscuro = async (valor: boolean) => {
        await toggleTheme(valor);
    };

    const toggleNotificaciones = async (valor: boolean) => {
        setNotificaciones(valor);
        await AsyncStorage.setItem('notifications', valor.toString());
    };

    const handleLogout = () => {
        // Confirmación clara antes de salir (evita cerrar sesión por un toque accidental)
        confirmar(
            '¿Cerrar sesión?',
            'Para volver a entrar necesitarás tu correo y tu contraseña.',
            'Sí, cerrar sesión',
            async () => {
                await Promise.all(['userId', 'userSession', 'jwtToken', 'csrfToken', 'userName', 'userEmail', 'userAge', 'userRol', 'userConditions']
                    .map(k => AsyncStorage.removeItem(k)));
                router.replace('/login');
            }
        );
    };

    const handleSetupMfa = async () => {
        if (mfaEnabled) {
            avisar("Aviso", "La seguridad de 2 pasos ya está activada.");
            return;
        }
        setMfaLoading(true);
        try {
            const response = await fetchSeguro(`${API_URL}/mfa/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (data.success) {
                setMfaQrCode(data.qrCode);
                setMfaSecret(data.secret);
                setMfaModalVisible(true);
            } else {
                avisar("Error", data.message || "No se pudo iniciar la configuración.");
            }
        } catch (error: any) {
            avisar("Error", error.message);
        } finally {
            setMfaLoading(false);
        }
    };

    const handleVerifyMfa = async () => {
        if (!mfaTokenInput || mfaTokenInput.length !== 6) {
            avisar("Error", "Ingresa un código válido de 6 dígitos.");
            return;
        }
        setMfaLoading(true);
        try {
            const response = await fetchSeguro(`${API_URL}/mfa/enable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: mfaTokenInput })
            });
            const data = await response.json();
            if (data.success) {
                setMfaEnabled(true);
                setMfaModalVisible(false);
                setMfaTokenInput('');
                avisar("¡Éxito!", "La seguridad de 2 pasos se activó correctamente.");
            } else {
                avisar("Error", data.message || "Código incorrecto.");
            }
        } catch (error: any) {
            avisar("Error", error.message);
        } finally {
            setMfaLoading(false);
        }
    };

    const handleDisableMfa = () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm('¿Estás seguro de que deseas desactivar la autenticación de dos factores?');
            if (confirmed) {
                ejecutarDesactivarMfa();
            }
        } else {
            Alert.alert(
                'Desactivar Seguridad de 2 Pasos',
                '¿Estás seguro de que deseas desactivar la autenticación de dos factores?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Desactivar',
                        style: 'destructive',
                        onPress: ejecutarDesactivarMfa
                    }
                ]
            );
        }
    };

    const ejecutarDesactivarMfa = async () => {
        setMfaLoading(true);
        console.log("Iniciando desactivación de MFA para ID:", usuario.id);
        try {
            const response = await fetchSeguro(`${API_URL}/mfa/disable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (data.success) {
                setMfaEnabled(false);
                if (Platform.OS === 'web') {
                    window.alert("La seguridad de 2 pasos ha sido desactivada.");
                } else {
                    avisar("MFA Desactivado", "La seguridad de 2 pasos ha sido desactivada.");
                }
                console.log("MFA desactivado con éxito");
            } else {
                const errorMsg = data.message || "No se pudo desactivar.";
                if (Platform.OS === 'web') {
                    window.alert("Error: " + errorMsg);
                } else {
                    avisar("Error", errorMsg);
                }
                console.log("Error del servidor al desactivar:", errorMsg);
            }
        } catch (error: any) {
            console.error("Error de red al desactivar MFA:", error);
            if (Platform.OS === 'web') {
                window.alert("Error: " + error.message);
            } else {
                avisar("Error", error.message);
            }
        } finally {
            setMfaLoading(false);
        }
    };

    // Eliminado el objeto colors local ya que usamos el del hook useTheme

    if (cargando) {
        return (
            <View style={[styles.centeredContainer, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={[styles.loadingText, { color: colors.text }]}>Cargando tu perfil...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />

            <ScrollView
                style={[styles.container, { backgroundColor: colors.bg }]}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header Premium y Avatar */}
                <LinearGradient
                    colors={temaOscuro ? ['#0F172A', '#1E3A8A'] : ['#1E3A8A', '#2563EB']}
                    style={styles.headerGradient}
                >
                    <View style={styles.headerTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => router.push('/home')} style={{ marginRight: 16 }}>
                                <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Mi Perfil</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => editando ? guardarCambios() : setEditando(true)}
                            style={styles.editButton}
                            activeOpacity={0.8}
                            disabled={guardando}
                        >
                            {guardando ? (
                                <ActivityIndicator size="small" color="#2563EB" />
                            ) : (
                                <>
                                    <Ionicons
                                        name={editando ? 'checkmark-circle' : 'create'}
                                        size={20}
                                        color={editando ? "#10B981" : "#1E3A8A"}
                                    />
                                    <Text style={[styles.editButtonText, editando && { color: '#10B981' }]}>
                                        {editando ? 'Guardar' : 'Editar'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.avatarSection}>
                        <View style={styles.avatarContainer}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {usuario.nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </Text>
                            </View>
                            {editando && (
                                <View style={styles.avatarEditBadge}>
                                    <Ionicons name="camera" size={16} color="#FFFFFF" />
                                </View>
                            )}
                        </View>
                        <Text style={styles.avatarName}>{usuario.nombre}</Text>
                        <Text style={styles.avatarEmail}>{usuario.email || 'Sin correo'}</Text>
                    </View>
                </LinearGradient>

                {/* Mensajes de feedback */}
                {mostrarMensaje !== '' && (
                    <View style={{ backgroundColor: '#D1FAE5', padding: 12, marginHorizontal: 20, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#10B981', alignItems: 'center' }}>
                        <Text style={{ color: '#065F46', fontWeight: 'bold' }}>{mostrarMensaje}</Text>
                    </View>
                )}
                {mensajeError !== '' && (
                    <View style={{ backgroundColor: '#FEE2E2', padding: 12, marginHorizontal: 20, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EF4444', alignItems: 'center' }}>
                        <Text style={{ color: '#991B1B', fontWeight: 'bold' }}>{mensajeError}</Text>
                    </View>
                )}

                {/* Estadísticas Resumidas */}
                <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.text }]}>{usuario.ejerciciosCompletados}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rutinas</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: '#D97706' }]}>{usuario.rachaDias}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Días (Racha)</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: colors.cardBorder }]} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: '#059669' }]}>{usuario.peso || '--'}</Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
                        </View>
                    </View>
                </View>

                {/* Privacidad y cuidadores: visible arriba, con un botón grande */}
                <TouchableOpacity
                    style={[styles.botonDestacado, { backgroundColor: colors.card, borderColor: colors.isDark ? '#3B82F6' : '#1D4ED8' }]}
                    onPress={() => router.push('/mis-datos')}
                    accessibilityRole="button"
                    activeOpacity={0.8}
                >
                    <View style={[styles.botonDestacadoIcono, { backgroundColor: colors.isDark ? '#1E3A8A' : '#DBEAFE' }]}>
                        <Ionicons name="people" size={32} color={colors.isDark ? '#FFFFFF' : '#1D4ED8'} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.botonDestacadoTitulo, { color: colors.text }]}>Privacidad y cuidadores</Text>
                        <Text style={[styles.botonDestacadoTexto, { color: colors.textSecondary }]}>Quién puede ver tu avance, tus datos y tu nivel</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={28} color={colors.text} />
                </TouchableOpacity>

                {/* Insignias Recientes - NUEVO */}
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder, paddingVertical: 20 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Mis Insignias</Text>
                        <TouchableOpacity onPress={() => router.push('/estadisticas')}>
                            <Text style={{ color: '#2563EB', fontWeight: '700' }}>Ver todas</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -5 }}>
                        <View style={styles.badgeItem}>
                            <View style={[styles.badgeCircle, usuario.ejerciciosCompletados >= 1 ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#F1F5F9' }]}>
                                <Text style={[styles.badgeEmoji, usuario.ejerciciosCompletados < 1 && { opacity: 0.3 }]}></Text>
                            </View>
                            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Inicio</Text>
                        </View>
                        <View style={styles.badgeItem}>
                            <View style={[styles.badgeCircle, usuario.rachaDias >= 5 ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#F1F5F9' }]}>
                                <Text style={[styles.badgeEmoji, usuario.rachaDias < 5 && { opacity: 0.3 }]}></Text>
                            </View>
                            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Constante</Text>
                        </View>
                        <View style={styles.badgeItem}>
                            <View style={[styles.badgeCircle, usuario.ejerciciosCompletados >= 10 ? { backgroundColor: '#E0E7FF' } : { backgroundColor: '#F1F5F9' }]}>
                                <Text style={[styles.badgeEmoji, usuario.ejerciciosCompletados < 10 && { opacity: 0.3 }]}></Text>
                            </View>
                            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Experto</Text>
                        </View>
                        <View style={styles.badgeItem}>
                            <View style={[styles.badgeCircle, usuario.ejerciciosCompletados >= 25 ? { backgroundColor: '#D1FAE5' } : { backgroundColor: '#F1F5F9' }]}>
                                <Text style={[styles.badgeEmoji, usuario.ejerciciosCompletados < 25 && { opacity: 0.3 }]}></Text>
                            </View>
                            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Maestro</Text>
                        </View>
                    </ScrollView>
                </View>

                {/* Información Personal */}
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Información Personal</Text>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre completo</Text>
                        <TextInput
                            style={[
                                styles.input,
                                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText },
                                !editando && { backgroundColor: colors.inputDisabledBg, color: colors.textSecondary }
                            ]}
                            value={usuario.nombre}
                            onChangeText={(text) => setUsuario({ ...usuario, nombre: text })}
                            editable={editando}
                            placeholder="Tu nombre completo"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Correo electrónico</Text>
                        <TextInput
                            style={[
                                styles.input,
                                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText },
                                !editando && { backgroundColor: colors.inputDisabledBg, color: colors.textSecondary }
                            ]}
                            value={usuario.email}
                            onChangeText={(text) => setUsuario({ ...usuario, email: text })}
                            editable={editando}
                            keyboardType="email-address"
                            placeholder="tu@email.com"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Edad</Text>
                        <View style={[
                            styles.input,
                            { backgroundColor: colors.inputDisabledBg, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center' }
                        ]}>
                            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>
                                {usuario.edad ? `${usuario.edad} años` : 'No disponible'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Peso Actual (kg)</Text>
                        <TextInput
                            style={[
                                styles.input,
                                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText },
                                !editando && { backgroundColor: colors.inputDisabledBg, color: colors.textSecondary }
                            ]}
                            value={usuario.peso.toString()}
                            onChangeText={(text) => setUsuario({ ...usuario, peso: text })}
                            editable={editando}
                            keyboardType="numeric"
                            placeholder="70.5"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>
                </View>

                {/* Ajustes */}
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Ajustes de la App</Text>

                    <View style={styles.settingItem}>
                        <View style={[styles.settingIcon, { backgroundColor: temaOscuro ? '#1E3A8A' : '#EFF6FF' }]}>
                            <Ionicons name="notifications" size={24} color="#2563EB" />
                        </View>
                        <Text style={[styles.settingText, { color: colors.text }]}>Notificaciones</Text>
                        <Switch
                            value={notificaciones}
                            onValueChange={toggleNotificaciones}
                            trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                            thumbColor={notificaciones ? '#2563EB' : '#F8FAFC'}
                        />
                    </View>

                    <View style={styles.settingItem}>
                        <View style={[styles.settingIcon, { backgroundColor: temaOscuro ? '#581C87' : '#F3E8FF' }]}>
                            <Ionicons name="moon" size={24} color="#9333EA" />
                        </View>
                        <Text style={[styles.settingText, { color: colors.text }]}>Tema Oscuro</Text>
                        <Switch
                            value={temaOscuro}
                            onValueChange={toggleTemaOscuro}
                            trackColor={{ false: '#CBD5E1', true: '#D8B4FE' }}
                            thumbColor={temaOscuro ? '#9333EA' : '#F8FAFC'}
                        />
                    </View>

                    {/* Tamaño de letra: se aplica en toda la app */}
                    <View style={styles.bloqueTamano}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <View style={[styles.settingIcon, { backgroundColor: temaOscuro ? '#1E3A8A' : '#DBEAFE' }]}>
                                <Ionicons name="text" size={24} color={temaOscuro ? '#FFFFFF' : '#1D4ED8'} />
                            </View>
                            <Text style={[styles.settingText, { color: colors.text }]}>Tamaño de letra</Text>
                        </View>
                        <View style={styles.filaTamano} accessibilityRole="radiogroup" accessibilityLabel="Tamaño de letra">
                            {OPCIONES_TAMANO.map((o) => {
                                const elegido = tamanoLetra === o.clave;
                                return (
                                    <TouchableOpacity
                                        key={o.clave}
                                        style={[styles.opcionTamano, { borderColor: elegido ? '#1D4ED8' : colors.cardBorder, backgroundColor: elegido ? '#1D4ED8' : colors.card }]}
                                        onPress={() => elegirTamano(o.clave)}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: elegido }}
                                        aria-checked={elegido}
                                        accessibilityLabel={`Letra ${o.nombre.toLowerCase()}`}
                                    >
                                        <Text style={{ fontSize: Math.round(18 * o.factor), fontWeight: '900', color: elegido ? '#FFFFFF' : colors.text }}>Aa</Text>
                                        <Text style={[styles.opcionTamanoTexto, { color: elegido ? '#FFFFFF' : colors.text }]}>{o.nombre}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.settingItem, { borderBottomWidth: 0 }]}
                        onPress={() => router.push('/recordatorios')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.settingIcon, { backgroundColor: temaOscuro ? '#78350F' : '#FEF3C7' }]}>
                            <Ionicons name="alarm" size={24} color="#B45309" />
                        </View>
                        <Text style={[styles.settingText, { color: colors.text }]}>Recordatorios de ejercicio</Text>
                        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Opciones avanzadas (plegadas): verificación en dos pasos */}
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <TouchableOpacity
                        style={styles.encabezadoAvanzadas}
                        onPress={() => setVerAvanzadas(v => !v)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: verAvanzadas }}
                        aria-expanded={verAvanzadas}
                    >
                        <Ionicons name="settings-outline" size={26} color={colors.text} />
                        <Text style={[styles.settingText, { color: colors.text }]}>Opciones avanzadas</Text>
                        <Ionicons name={verAvanzadas ? 'chevron-up' : 'chevron-down'} size={26} color={colors.text} />
                    </TouchableOpacity>
                    {verAvanzadas && (
                        <TouchableOpacity
                            style={[styles.settingItem, { borderBottomWidth: 0, marginTop: 8 }]}
                            onPress={() => mfaEnabled ? handleDisableMfa() : handleSetupMfa()}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.settingIcon, { backgroundColor: temaOscuro ? '#064E3B' : '#D1FAE5' }]}>
                                <Ionicons name={mfaEnabled ? "shield-checkmark" : "shield-outline"} size={24} color={temaOscuro ? '#6EE7B7' : '#047857'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingText, { color: colors.text }]}>Verificación en dos pasos</Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 18, marginTop: 2 }}>
                                    {mfaEnabled ? 'Activada: al entrar te pedirá un código de tu celular' : 'Desactivada'}
                                </Text>
                            </View>
                            {mfaLoading ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Cerrar Sesión */}
                <TouchableOpacity
                    style={[styles.logoutButton, temaOscuro && { backgroundColor: '#371717', borderColor: '#7F1D1D' }]}
                    onPress={handleLogout}
                    activeOpacity={0.8}
                >
                    <Ionicons name="log-out" size={24} color="#DC2626" />
                    <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
                </TouchableOpacity>

            </ScrollView>

            {/* Modal de Configuración MFA */}
            <Modal
                visible={mfaModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setMfaModalVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: colors.card, width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' }}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                            <Ionicons name="shield-checkmark" size={32} color="#2563EB" />
                        </View>
                        
                        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' }}>Activar Verificación</Text>
                        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
                            Abre la aplicación Google Authenticator y escanea el siguiente código QR:
                        </Text>
                        
                        {mfaQrCode ? (
                            <Image
                                source={{ uri: mfaQrCode }}
                                style={{ width: 200, height: 200, marginBottom: 20 }}
                                resizeMode="contain"
                            />
                        ) : (
                            <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 40 }} />
                        )}
                        
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>¿No puedes escanear? Usa este código:</Text>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2563EB', marginBottom: 20, letterSpacing: 2 }}>{mfaSecret}</Text>
                        
                        <TextInput
                            style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, width: '100%', padding: 16, fontSize: 20, textAlign: 'center', letterSpacing: 8, backgroundColor: colors.inputBg, color: colors.inputText, marginBottom: 20 }}
                            placeholder="000000"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            maxLength={6}
                            value={mfaTokenInput}
                            onChangeText={setMfaTokenInput}
                        />
                        
                        <TouchableOpacity
                            style={{ backgroundColor: '#2563EB', width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
                            onPress={handleVerifyMfa}
                            disabled={mfaLoading}
                        >
                            {mfaLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Verificar y Activar</Text>}
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                            style={{ padding: 12 }}
                            onPress={() => setMfaModalVisible(false)}
                        >
                            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <MenuInferior />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    botonDestacado: {
        flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginBottom: 20,
        padding: 18, borderRadius: 22, borderWidth: 2, minHeight: 88,
    },
    botonDestacadoIcono: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    botonDestacadoTitulo: { fontSize: 21, fontWeight: '800' },
    botonDestacadoTexto: { fontSize: 18, lineHeight: 24, marginTop: 2 },
    bloqueTamano: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    filaTamano: { flexDirection: 'row', gap: 10 },
    opcionTamano: { flex: 1, minHeight: 80, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
    opcionTamanoTexto: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
    encabezadoAvanzadas: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
    safeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC'
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    centeredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F8FAFC'
    },
    loadingText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#1E293B'
    },
    headerGradient: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 40,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        marginBottom: 24,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFFFFF'
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
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
        minWidth: 100,
        justifyContent: 'center',
    },
    editButtonText: {
        fontSize: 16,
        color: '#1E3A8A',
        fontWeight: '800',
        marginLeft: 8,
    },
    avatarSection: {
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#93C5FD',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
            }
        }),
    },
    avatarText: {
        fontSize: 48,
        fontWeight: '900',
        color: '#1E3A8A'
    },
    avatarEditBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#1E3A8A',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#FFFFFF',
    },
    avatarName: {
        fontSize: 28,
        fontWeight: '900',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    avatarEmail: {
        fontSize: 16,
        color: '#DBEAFE',
        fontWeight: '500',
    },
    statsCard: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        padding: 24,
        borderRadius: 24,
        marginTop: -30,
        marginBottom: 20,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
            },
            android: {
                elevation: 5,
            },
            web: {
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.08)',
            }
        }),
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statNumber: {
        fontSize: 28,
        fontWeight: '900',
        color: '#1E293B',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#E2E8F0',
    },
    sectionCard: {
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
    sectionTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#1E293B',
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#CBD5E1',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 16,
        fontSize: 18,
        backgroundColor: '#FFFFFF',
        color: '#1E293B',
        fontWeight: '500',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    settingIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    settingText: {
        flex: 1,
        fontSize: 18,
        color: '#1E293B',
        fontWeight: '600',
    },
    logoutButton: {
        backgroundColor: '#FEF2F2',
        marginHorizontal: 20,
        padding: 20,
        borderRadius: 20,
        alignItems: 'center',
        marginBottom: 30,
        flexDirection: 'row',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FECACA',
    },
    logoutButtonText: {
        color: '#DC2626',
        fontSize: 18,
        fontWeight: '800',
        marginLeft: 12,
    },
    badgeItem: {
        alignItems: 'center',
        marginHorizontal: 10,
        width: 80,
    },
    badgeCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    badgeEmoji: {
        fontSize: 28,
    },
    badgeLabel: {
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
    },
});