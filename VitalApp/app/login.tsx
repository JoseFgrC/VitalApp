import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, StatusBar, Dimensions,
    Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

// Inyectar CSS global para quitar márgenes del navegador (solo web)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const styleId = 'vitalapp-login-fullscreen';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                overflow: hidden;
                background-color: #03071E;
            }
            #root {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                display: flex;
            }
        `;
        document.head.appendChild(style);
    }
}
import { API_URL } from '../constants/config';
import { fetchSeguro, rutaInicial } from '../utils/api';


import { avisar } from '../utils/dialogos';
const isWeb = Platform.OS === 'web';
const { width: SW, height: SH } = Dimensions.get('window');

// Imagen HD premium real — Adulto mayor activo
const BG_IMAGE = require('../assets/images/senior_fitness_bg.png');

// ── Fondo premium animado (MEMOIZADO para evitar re-renders) ─────────────────
const AnimatedBackground = React.memo(() => {
    const imgScale = useRef(new Animated.Value(1.0)).current;
    const imgX = useRef(new Animated.Value(0)).current;
    const shimmer = useRef(new Animated.Value(-SW)).current;

    // Usar useRef para las partículas
    const particlesRef = useRef(
        Array.from({ length: 5 }, () => ({
            y: new Animated.Value(SH),
        }))
    );

    useEffect(() => {
        // Ken Burns zoom
        const zoomAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(imgScale, {
                    toValue: 1.06,
                    duration: 15000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true
                }),
                Animated.timing(imgScale, {
                    toValue: 1.00,
                    duration: 15000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true
                }),
            ])
        );

        // Paneo sutil
        const panAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(imgX, {
                    toValue: -10,
                    duration: 18000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true
                }),
                Animated.timing(imgX, {
                    toValue: 10,
                    duration: 18000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true
                }),
            ])
        );

        // Destello de luz diagonal (shimmer)
        const shimmerAnimation = Animated.loop(
            Animated.sequence([
                Animated.delay(4000),
                Animated.timing(shimmer, {
                    toValue: SW * 2,
                    duration: 2500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true
                }),
                Animated.timing(shimmer, {
                    toValue: -SW,
                    duration: 0,
                    useNativeDriver: true
                }),
            ])
        );

        // Partículas
        const particleAnimations = particlesRef.current.map((particle, index) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(index * 1500),
                    Animated.timing(particle.y, {
                        toValue: -SH * 0.4,
                        duration: 7000 + index * 1000,
                        easing: Easing.linear,
                        useNativeDriver: true
                    }),
                    Animated.timing(particle.y, {
                        toValue: SH,
                        duration: 0,
                        useNativeDriver: true
                    }),
                ])
            );
        });

        zoomAnimation.start();
        panAnimation.start();
        shimmerAnimation.start();
        particleAnimations.forEach(anim => anim.start());

        return () => {
            zoomAnimation.stop();
            panAnimation.stop();
            shimmerAnimation.stop();
            particleAnimations.forEach(anim => anim.stop());
        };
    }, []);

    const particles = useMemo(() => [
        { l: SW * 0.10, s: 4, o: 0.35 },
        { l: SW * 0.30, s: 3, o: 0.25 },
        { l: SW * 0.55, s: 5, o: 0.40 },
        { l: SW * 0.75, s: 3, o: 0.30 },
        { l: SW * 0.90, s: 4, o: 0.20 },
    ], []);

    return (
        <>
            {/* Color base navy */}
            <LinearGradient
                colors={['#010B1E', '#061440', '#0B2560', '#050E30']}
                locations={[0, 0.3, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Imagen con movimiento Ken Burns */}
            <Animated.View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                transform: [{ scale: imgScale }, { translateX: imgX }],
            }}>
                <Animated.Image
                    source={BG_IMAGE}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                    blurRadius={0}
                />
                {/* Difuminado suave hacia abajo */}
                <LinearGradient
                    colors={['transparent', 'rgba(1,11,30,0.15)', 'rgba(1,11,30,0.40)', '#010B1E']}
                    locations={[0, 0.4, 0.75, 1]}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: isWeb ? '40%' : '60%' }}
                />
            </Animated.View>

            {/* Overlay cinematográfico */}
            <LinearGradient
                colors={['rgba(5,30,90,0.55)', 'rgba(5,20,60,0.70)', 'rgba(3,10,35,0.85)', 'rgba(2,8,25,0.95)']}
                locations={[0, 0.3, 0.65, 1]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Viñeta lateral */}
            <LinearGradient
                colors={['rgba(2,8,25,0.6)', 'transparent', 'transparent', 'rgba(2,8,25,0.6)']}
                locations={[0, 0.18, 0.82, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Destello diagonal de luz */}
            <Animated.View style={{
                position: 'absolute',
                top: 0,
                width: SW * 0.15,
                height: SH * 1.5,
                backgroundColor: 'rgba(255,255,255,0.04)',
                transform: [{ translateX: shimmer }, { rotate: '25deg' }],
            }} />

            {/* Partículas flotantes */}
            {particles.map((p, i) => (
                <Animated.View
                    key={i}
                    style={{
                        position: 'absolute',
                        left: p.l,
                        bottom: 0,
                        width: p.s,
                        height: p.s,
                        borderRadius: p.s / 2,
                        backgroundColor: `rgba(96,165,250,${p.o})`,
                        transform: [{ translateY: particlesRef.current[i].y }],
                    }}
                />
            ))}

            {/* Tenue gradiente azul en la base */}
            <LinearGradient
                colors={['transparent', 'transparent', 'rgba(20,60,180,0.10)', 'rgba(10,30,120,0.18)']}
                locations={[0, 0.65, 0.88, 1]}
                style={StyleSheet.absoluteFillObject}
            />
        </>
    );
});

// ── Componentes memoizados ────────────────────────────────────────────────────
const Lab = React.memo(({ text }: { text: string }) => (
    <Text style={st.label}>{text}</Text>
));

const Inp = React.memo(({ icon, ph, val, set, secure, ac, kb, multi, rIcon, rPress }: any) => (
    <View style={[st.inputWrap, multi && st.inputMulti]}>
        <Ionicons name={icon} size={18} color="rgba(150,180,255,0.55)" style={{ marginRight: 10 }} />
        <TextInput
            style={[
                st.input,
                multi && { height: 72, textAlignVertical: 'top', paddingTop: 10 },
                ...(isWeb ? [{ outlineStyle: 'none' as any }] : [])
            ]}
            placeholder={ph}
            placeholderTextColor="rgba(150,180,255,0.30)"
            value={val}
            onChangeText={set}
            secureTextEntry={secure}
            autoCapitalize={ac}
            keyboardType={kb}
            multiline={multi}
            autoComplete={secure ? "new-password" : "off"}
            autoCorrect={false}
            textContentType="none"
            importantForAutofill="no"
        />
        {rIcon && (
            <TouchableOpacity onPress={rPress} style={{ padding: 4 }}>
                <Ionicons name={rIcon} size={18} color="rgba(150,180,255,0.55)" />
            </TouchableOpacity>
        )}
    </View>
));

// ── Background wrapper memoizado ──────────────────────────────────────────────
const Background = React.memo(({ children }: { children: React.ReactNode }) => (
    <View style={st.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <AnimatedBackground />
        {children}
    </View>
));

export default function LoginScreen() {
    // Aviso cuando se llega aquí porque la sesión terminó (ver sesionTerminada en utils/api.ts)
    const [avisoSesion, setAvisoSesion] = useState('');
    useEffect(() => {
        AsyncStorage.getItem('avisoSesion').then((m) => {
            if (m) {
                setAvisoSesion(m);
                AsyncStorage.removeItem('avisoSesion');
            }
        }).catch(() => {});
    }, []);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [errorLogin, setErrorLogin] = useState(false);
    const [nombre, setNombre] = useState('');
    const [tipoCuenta, setTipoCuenta] = useState<'usuario' | 'cuidador'>('usuario');
    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [peso, setPeso] = useState('');
    const [altura, setAltura] = useState('');
    const [genero, setGenero] = useState<'M' | 'F' | 'Otro'>('Otro');
    const [telefono, setTelefono] = useState('');
    const [nivelActividad, setNivelActividad] = useState<'sedentario' | 'ligero' | 'moderado' | 'activo'>('sedentario');
    const [condicionesMedicas, setCondicionesMedicas] = useState('');
    const [restricciones, setRestricciones] = useState('');
    const [requiresMfa, setRequiresMfa] = useState(false);
    const [mfaToken, setMfaToken] = useState('');
    const [tempUserId, setTempUserId] = useState<number | null>(null);
    const router = useRouter();

    // ── GOOGLE SSO HOOK ───────────────────────────────────────────────────────
    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        clientId: '691441001085-m589115m0oplaunqp33l74jkpc6j3vf0.apps.googleusercontent.com',
        webClientId: '691441001085-m589115m0oplaunqp33l74jkpc6j3vf0.apps.googleusercontent.com',
    });

    useEffect(() => {
        if (response?.type === 'success') {
            // Google puede devolver el token en distintos campos según el flujo (web vs nativo)
            const id_token = response.params?.id_token || (response.authentication as any)?.idToken;
            console.log('[Google SSO] Response completa:', JSON.stringify(response?.params));
            console.log('[Google SSO] id_token encontrado:', id_token ? `${id_token.substring(0, 30)}...` : 'NINGUNO');
            if (id_token) {
                handleRealGoogleOAuth(id_token);
            } else {
                avisar('Error SSO', `Google no devolvió el ID Token.\nCampos recibidos: ${Object.keys(response.params || {}).join(', ')}`);
            }
        } else if (response?.type === 'error') {
            console.log('[Google SSO] Error response:', JSON.stringify(response));
            avisar('Error SSO', 'No se pudo completar el inicio de sesión con Google.');
        }
    }, [response]);

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    const handleLogin = async () => {
        if (!email || !password) {
            avisar('Faltan datos', 'Ingresa tu correo y contraseña.');
            return;
        }
        setCargando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email, password_hash: password }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.requiresMfa) {
                    setRequiresMfa(true);
                    setTempUserId(data.userId);
                    return;
                }
                const u = data.user;
                await AsyncStorage.setItem('userId', u.id_usuario.toString());
                await AsyncStorage.setItem('userName', u.nombre || '');
                await AsyncStorage.setItem('userEmail', u.email || '');
                await AsyncStorage.setItem('userAge', (u.edad ?? '').toString());
                await AsyncStorage.setItem('userRol', u.rol || 'usuario');
                await AsyncStorage.setItem('jwtToken', data.token);
                router.replace(await rutaInicial(u.rol || 'usuario'));
            } else {
                setErrorLogin(true);
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setCargando(false);
        }
    };

    // ── MFA VERIFICACIÓN ──────────────────────────────────────────────────────
    const handleMfaVerify = async () => {
        if (!mfaToken) {
            avisar('Faltan datos', 'Ingresa el código de 6 dígitos.');
            return;
        }
        setCargando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/mfa/verify-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: tempUserId, token: mfaToken }),
            });
            const data = await res.json();
            if (data.success) {
                const u = data.user;
                await AsyncStorage.setItem('userId', u.id_usuario.toString());
                await AsyncStorage.setItem('userName', u.nombre || '');
                await AsyncStorage.setItem('userEmail', u.email || '');
                await AsyncStorage.setItem('userAge', (u.edad ?? '').toString());
                await AsyncStorage.setItem('userRol', u.rol || 'usuario');
                await AsyncStorage.setItem('jwtToken', data.token);
                router.replace(await rutaInicial(u.rol || 'usuario'));
            } else {
                avisar('Error', data.message || 'Código incorrecto.');
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setCargando(false);
        }
    };

    // ── REGISTRO ──────────────────────────────────────────────────────────────
    const handleRegister = async () => {
        const esCuidador = tipoCuenta === 'cuidador';
        if (!nombre || !email || !password || !fechaNacimiento || (!esCuidador && !peso)) {
            avisar('Faltan datos', esCuidador
                ? 'Nombre, correo, contraseña y fecha de nacimiento son obligatorios.'
                : 'Nombre, correo, contraseña, fecha y peso son obligatorios.');
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
            avisar('Fecha inválida', 'Usa AAAA-MM-DD');
            return;
        }
        setCargando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Los datos de salud no se envían aquí: se capturan después del consentimiento (RN01)
                    nombre, email, password_hash: password, fecha_nacimiento: fechaNacimiento,
                    peso: peso ? parseFloat(peso) : null, altura: altura ? parseFloat(altura) : null,
                    genero, telefono: telefono || null, nivel_actividad: nivelActividad, rol: tipoCuenta,
                }),
            });
            const data = await res.json();
            if (data.success) {
                avisar('¡Cuenta creada!', 'Ya puedes iniciar sesión.');
                setIsRegistering(false);
                setNombre(''); setFechaNacimiento(''); setPeso(''); setAltura('');
                setGenero('Otro'); setTelefono(''); setNivelActividad('sedentario');
                setCondicionesMedicas(''); setRestricciones(''); setPassword(''); setEmail(''); setTipoCuenta('usuario');
            } else {
                avisar('Error', data.message || 'No se pudo crear la cuenta.');
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setCargando(false);
        }
    };

    // ── OAUTH2 (Google SSO REAL) ──────────────────────────────────────────────
    const handleRealGoogleOAuth = async (idToken: string) => {
        setCargando(true);
        try {
            const res = await fetchSeguro(`${API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: idToken }),
            });
            const data = await res.json();
            if (data.success) {
                const u = data.user;
                await AsyncStorage.setItem('userId', u.id_usuario.toString());
                await AsyncStorage.setItem('userName', u.nombre || '');
                await AsyncStorage.setItem('userEmail', u.email || '');
                await AsyncStorage.setItem('userAge', (u.edad ?? '').toString());
                await AsyncStorage.setItem('userRol', u.rol || 'usuario');
                if (data.token) await AsyncStorage.setItem('jwtToken', data.token);
                router.replace(await rutaInicial(u.rol || 'usuario'));
            } else {
                avisar('Error SSO', data.message || 'No se pudo iniciar sesión con Google.');
            }
        } catch (e: any) {
            avisar('Error de conexión', e.message);
        } finally {
            setCargando(false);
        }
    };

    const handleOAuthPress = () => {
        promptAsync();
    };

    // ── PANTALLA ERROR ────────────────────────────────────────────────────────
    if (errorLogin) return (
        <Background>
            <View style={st.centerFull}>
                <View style={st.card}>
                    <Ionicons name="close-circle" size={60} color="#EF4444" style={{ alignSelf: 'center', marginBottom: 16 }} />
                    <Text style={st.cardTitle}>Acceso denegado</Text>
                    <Text style={st.cardSub}>El correo o la contraseña no son correctos.</Text>
                    <TouchableOpacity style={st.btnWrap} onPress={() => { setErrorLogin(false); setPassword(''); }} activeOpacity={0.85}>
                        <LinearGradient colors={['#1E5FE6', '#1340A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.btnGrad}>
                            <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={st.btnTxt}>Volver al login</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </Background>
    );

    // ── RENDER PRINCIPAL ──────────────────────────────────────────────────────
    return (
        <Background>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    // El registro es más alto que la pantalla: centrado vertical recortaría la parte de arriba en web
                    contentContainerStyle={[st.scroll, isRegistering && { justifyContent: 'flex-start' }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                >
                    {/* Logo */}
                    <View style={st.logoZone}>
                        <View style={st.logoCircle}>
                            <Ionicons name="fitness" size={isWeb ? 30 : 40} color="#60A5FA" />
                        </View>
                        <Text style={st.appName}>
                            <Text style={{ color: '#FFFFFF' }}>Vital</Text>
                            <Text style={{ color: '#60A5FA' }}>App</Text>
                        </Text>
                        <Text style={st.slogan}>Tu bienestar, cada día</Text>
                    </View>

                    {/* Tarjeta */}
                    <View style={st.card}>
                        <Text style={st.cardTitle}>{isRegistering ? 'Crear cuenta' : 'Iniciar Sesión'}</Text>
                        <Text style={st.cardSub}>{isRegistering ? 'Únete a VitalApp hoy' : (requiresMfa ? 'Verificación en dos pasos' : 'Bienvenido de nuevo')}</Text>
                        {avisoSesion && !isRegistering ? (
                            <View style={st.avisoSesion}>
                                <Ionicons name="time-outline" size={20} color="#FCD34D" />
                                <Text style={st.avisoSesionTxt}>{avisoSesion}</Text>
                            </View>
                        ) : null}

                        {requiresMfa ? (
                            <>
                                <Lab text="Código de Autenticación (MFA)" />
                                <Inp icon="key-outline" ph="123456" val={mfaToken} set={setMfaToken} kb="numeric" />
                                
                                <TouchableOpacity
                                    style={[st.btnWrap, cargando && { opacity: 0.6 }]}
                                    onPress={handleMfaVerify}
                                    disabled={cargando}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient colors={['#1E5FE6', '#1340A0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.btnGrad}>
                                        {cargando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.btnTxt}>Verificar</Text>}
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={st.switchRow}
                                    onPress={() => { setRequiresMfa(false); setMfaToken(''); }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={st.switchTxt}>Volver al inicio de sesión</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {isRegistering && (
                                    <>
                                        <Lab text="¿Quién va a usar esta cuenta?" />
                                        <View style={st.pills}>
                                            {(['usuario', 'cuidador'] as const).map(op => (
                                                <TouchableOpacity
                                                    key={op}
                                                    style={[st.pill, tipoCuenta === op && st.pillOn]}
                                                    onPress={() => setTipoCuenta(op)}
                                                >
                                                    <Text style={[st.pillTxt, tipoCuenta === op && st.pillTxtOn]}>
                                                        {op === 'usuario' ? 'Soy adulto mayor' : 'Soy cuidador o familiar'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        <Lab text="Nombre completo *" />
                                        <Inp icon="person-outline" ph="Ej: Juan Pérez" val={nombre} set={setNombre} />
                                        <Lab text="Fecha de nacimiento *" />
                                        <Inp icon="calendar-outline" ph="AAAA-MM-DD" val={fechaNacimiento} set={setFechaNacimiento} />
                                        {tipoCuenta === 'usuario' && (
                                            <>
                                                <Lab text="Peso (kg) *" />
                                                <Inp icon="barbell-outline" ph="Ej: 75.5" val={peso} set={setPeso} kb="numeric" />
                                                <Lab text="Altura (m)" />
                                                <Inp icon="resize-outline" ph="Ej: 1.70" val={altura} set={setAltura} kb="numeric" />
                                            </>
                                        )}

                                        <Lab text="Género" />
                                        <View style={st.pills}>
                                            {(['M', 'F', 'Otro'] as const).map(op => (
                                                <TouchableOpacity
                                                    key={op}
                                                    style={[st.pill, genero === op && st.pillOn]}
                                                    onPress={() => setGenero(op)}
                                                >
                                                    <Text style={[st.pillTxt, genero === op && st.pillTxtOn]}>
                                                        {op === 'M' ? 'Masculino' : op === 'F' ? 'Femenino' : 'Otro'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        <Lab text="Teléfono" />
                                        <Inp icon="call-outline" ph="Ej: 312 123 4567" val={telefono} set={setTelefono} kb="phone-pad" />

                                        {tipoCuenta === 'usuario' && (
                                        <>
                                        <Lab text="Nivel de actividad" />
                                        <View style={st.pills}>
                                            {(['sedentario', 'ligero', 'moderado', 'activo'] as const).map(op => (
                                                <TouchableOpacity
                                                    key={op}
                                                    style={[st.pill, nivelActividad === op && st.pillOn]}
                                                    onPress={() => setNivelActividad(op)}
                                                >
                                                    <Text style={[st.pillTxt, nivelActividad === op && st.pillTxtOn]}>
                                                        {op.charAt(0).toUpperCase() + op.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        </>
                                        )}
                                    </>
                                )}

                                <Lab text="Usuario (correo)" />
                                <Inp icon="person-outline" ph="tu@correo.com" val={email} set={setEmail} ac="none" kb="email-address" />

                                <Lab text="Contraseña" />
                                <Inp
                                    icon="lock-closed-outline"
                                    ph="••••••••"
                                    val={password}
                                    set={setPassword}
                                    secure={!showPass}
                                    rIcon={showPass ? 'eye-off-outline' : 'eye-outline'}
                                    rPress={() => setShowPass(v => !v)}
                                />

                                {/* Botón */}
                                <TouchableOpacity
                                    style={[st.btnWrap, cargando && { opacity: 0.6 }]}
                                    onPress={isRegistering ? handleRegister : handleLogin}
                                    disabled={cargando}
                                    activeOpacity={0.85}
                                >
                                    <LinearGradient
                                        colors={['#1E5FE6', '#1340A0']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={st.btnGrad}
                                    >
                                        {cargando ?
                                            <ActivityIndicator color="#fff" size="small" /> :
                                            <Text style={st.btnTxt}>
                                                {isRegistering ? 'Crear mi cuenta' : 'Entrar'}
                                            </Text>
                                        }
                                    </LinearGradient>
                                </TouchableOpacity>



                                <TouchableOpacity
                                    style={st.switchRow}
                                    onPress={() => setIsRegistering(!isRegistering)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={st.switchTxt}>
                                        {isRegistering ? '¿Ya tienes cuenta?  ' : '¿Eres nuevo aquí?  '}
                                    </Text>
                                    <Text style={st.switchBold}>
                                        {isRegistering ? 'Inicia sesión' : 'Registrarse'}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <View style={{ height: 32 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </Background>
    );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const CARD_BG = 'rgba(10,18,52,0.72)';
const CARD_BDR = 'rgba(50,90,200,0.25)';
const INPUT_BG = 'rgba(20,35,80,0.60)';
const INPUT_BDR = 'rgba(60,100,220,0.22)';
const CARD_MAX = 440;

const st = StyleSheet.create({
    avisoSesion: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 12, backgroundColor: 'rgba(252, 211, 77, 0.12)', borderWidth: 1, borderColor: 'rgba(252, 211, 77, 0.4)' },
    avisoSesionTxt: { flex: 1, color: '#FDE68A', fontSize: 15, fontWeight: '600', lineHeight: 20 },
    root: {
        flex: 1,
        backgroundColor: '#03071E',
        overflow: 'hidden' as any,
        ...(isWeb ? {
            position: 'fixed' as any,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw' as any,
            height: '100vh' as any,
            zIndex: 1,
        } : {}),
    },
    centerFull: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20
    },
    scroll: {
        flexGrow: 1,
        alignItems: isWeb ? 'center' : 'stretch',
        paddingHorizontal: isWeb ? 24 : 20,
        paddingTop: isWeb ? 24 : 52,
        paddingBottom: 24,
        justifyContent: isWeb ? 'center' : 'flex-start',
    },
    logoZone: {
        alignItems: 'center',
        marginBottom: 22,
        width: '100%',
        ...(isWeb ? { maxWidth: CARD_MAX } : {})
    },
    logoCircle: {
        width: isWeb ? 64 : 80,
        height: isWeb ? 64 : 80,
        borderRadius: isWeb ? 32 : 40,
        backgroundColor: 'rgba(30,60,160,0.35)',
        borderWidth: 1.5,
        borderColor: 'rgba(60,130,255,0.30)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#3B82F6',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.65,
                shadowRadius: 20
            },
            android: { elevation: 12 },
            web: { boxShadow: '0 0 30px rgba(59,130,246,0.50)' },
        }),
    },
    appName: {
        fontSize: isWeb ? 36 : 46,
        fontWeight: '900',
        letterSpacing: 1.5,
        marginBottom: 4
    },
    slogan: {
        fontSize: isWeb ? 16 : 18,
        color: 'rgba(255,255,255,0.50)',
        fontWeight: '400'
    },
    card: {
        backgroundColor: CARD_BG,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: CARD_BDR,
        padding: isWeb ? 28 : 22,
        width: '100%',
        ...(isWeb ? { maxWidth: CARD_MAX } : {}),
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.45,
                shadowRadius: 28
            },
            android: { elevation: 16 },
            web: {
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.55)'
            },
        }),
    },
    cardTitle: {
        fontSize: isWeb ? 26 : 28,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 4
    },
    cardSub: {
        fontSize: isWeb ? 15 : 16,
        color: 'rgba(180,200,255,0.55)',
        marginBottom: 20
    },
    label: {
        fontSize: isWeb ? 14 : 15,
        fontWeight: '600',
        color: 'rgba(160,190,255,0.65)',
        marginBottom: 7,
        marginLeft: 2
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: INPUT_BG,
        borderWidth: 1,
        borderColor: INPUT_BDR,
        borderRadius: 14,
        paddingHorizontal: 14,
        height: isWeb ? 46 : 54,
        marginBottom: 14,
    },
    inputMulti: {
        height: 'auto' as any,
        minHeight: 54,
        alignItems: 'flex-start',
        paddingVertical: 8
    },
    input: {
        flex: 1,
        fontSize: isWeb ? 16 : 18,
        color: '#FFFFFF',
        fontWeight: '500',
        height: '100%'
    },
    pills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14
    },
    pill: {
        flex: 1,
        minWidth: 64,
        paddingVertical: 9,
        paddingHorizontal: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: INPUT_BDR,
        backgroundColor: INPUT_BG,
        alignItems: 'center',
        ...(isWeb ? { cursor: 'pointer' as any } : {}),
    },
    pillOn: {
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,0.25)'
    },
    pillTxt: {
        fontSize: isWeb ? 13 : 14,
        fontWeight: '600',
        color: 'rgba(160,190,255,0.50)'
    },
    pillTxtOn: {
        color: '#93C5FD'
    },
    btnWrap: {
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 6,
        marginBottom: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#1E5FE6',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.55,
                shadowRadius: 16
            },
            android: { elevation: 8 },
            web: {
                boxShadow: '0 8px 28px rgba(30,95,230,0.50)',
                cursor: 'pointer' as any
            },
        }),
    },
    btnGrad: {
        height: isWeb ? 48 : 58,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center'
    },
    btnTxt: {
        fontSize: isWeb ? 18 : 20,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 2
    },
    switchTxt: {
        fontSize: isWeb ? 15 : 16,
        color: 'rgba(160,190,255,0.50)',
        fontWeight: '500'
    },
    switchBold: {
        fontSize: isWeb ? 15 : 16,
        color: '#60A5FA',
        fontWeight: '800',
        ...(isWeb ? { cursor: 'pointer' as any } : {})
    },
    dividerWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 18,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(150,180,255,0.15)'
    },
    dividerTxt: {
        color: 'rgba(150,180,255,0.4)',
        marginHorizontal: 12,
        fontWeight: '600'
    },
    btnOAuth: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        height: isWeb ? 48 : 54,
        borderRadius: 14,
        marginBottom: 16,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
            android: { elevation: 4 },
            web: { boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer' as any },
        }),
    },
    btnOAuthTxt: {
        fontSize: isWeb ? 16 : 18,
        fontWeight: '700',
        color: '#333333'
    }
});