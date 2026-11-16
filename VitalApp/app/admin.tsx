import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    SafeAreaView, TextInput, Alert, ActivityIndicator,
    Modal, StatusBar, RefreshControl, Platform, Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { avisar } from '../utils/dialogos';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Seccion = 'videos' | 'rutinas' | 'usuarios';
type FiltroVideos = 'todos' | 'revisar' | 'publicados';

interface EjercicioRutina {
    id_video: number;
    nombre_video: string;
    nivel_funcional: number;
    activo: number;
    tiene_fuente: number;
}

interface Rutina {
    id_rutina: number;
    titulo: string;
    descripcion: string | null;
    categoria: string;
    nivel_funcional: number;
    activo: number;
    ejercicios: EjercicioRutina[];
}

interface FormRutina {
    titulo: string;
    descripcion: string;
    categoria: string;
    activo: number;
    ejercicios: number[];
}

const RUTINA_VACIA: FormRutina = { titulo: '', descripcion: '', categoria: 'Movilidad', activo: 0, ejercicios: [] };

const CATEGORIAS = ['Cardio', 'Zumba', 'Baile', 'Fuerza', 'Flexibilidad', 'Equilibrio', 'Movilidad', 'Silla', 'Relajación', 'Respiración', 'Pilates', 'Yoga'];

const estaPublicado = (v: { activo: number; fuente_documental?: string; tiene_fuente?: number }) =>
    !!v.activo && (v.tiene_fuente !== undefined ? !!v.tiene_fuente : !!(v.fuente_documental || '').trim());

const abrirLink = (url: string) => {
    if (!url) return;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url);
};

interface Video {
    id_video: number;
    nombre_video: string;
    descripcion: string;
    categoria: string;
    subcategoria: string;
    dificultad: 'baja' | 'media' | 'alta';
    duracion_min: number;
    link_video: string;
    url_miniatura: string;
    calorias_estimadas: number;
    edad_minima: number;
    edad_maxima: number;
    peso_maximo_recomendado: number;
    nivel_funcional: number;
    contraindicaciones: string;
    fuente_documental: string;
    activo: number;
}

interface Usuario {
    id_usuario: number;
    nombre: string;
    email: string;
    edad: number;
    peso: number;
    altura: number;
    genero: 'M' | 'F' | 'Otro';
    telefono: string;
    rol: 'usuario' | 'admin';
    cuenta_activa: number;
    nivel_actividad: string;
    condiciones_medicas: string;
    restricciones: string;
    fecha_registro: string;
}

// ─── Formularios vacíos ───────────────────────────────────────────────────────

const VIDEO_VACIO: Omit<Video, 'id_video'> = {
    nombre_video: '', descripcion: '', categoria: '', subcategoria: '',
    dificultad: 'baja', duracion_min: 0, link_video: '', url_miniatura: '',
    calorias_estimadas: 0, edad_minima: 60, edad_maxima: 100,
    peso_maximo_recomendado: 0, nivel_funcional: 1, contraindicaciones: '', fuente_documental: '', activo: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const api = async (path: string, method = 'GET', body?: object) => {
    const url = `${API_URL}${path}`;
    const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (method === 'POST' || method === 'PUT') {
        opts.body = JSON.stringify(body ?? {});
    }
    const res = await fetchSeguro(url, opts);
    return res.json();
};

// ─── Componentes de Formularios Estilizados ───────────────────────────────────

const Campo = ({
    label, value, onChangeText, keyboardType = 'default', multiline = false, placeholder = ''
}: {
    label: string; value: string; onChangeText: (t: string) => void;
    keyboardType?: any; multiline?: boolean; placeholder?: string;
}) => (
    <View style={s.campoWrap}>
        <Text style={s.campoLabel}>{label}</Text>
        <TextInput
            style={[s.campoInput, multiline && s.campoInputMulti]}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            multiline={multiline}
            placeholder={placeholder}
            placeholderTextColor="#94A3B8"
        />
    </View>
);

const Selector = ({ label, opciones, valor, onSelect }: {
    label: string; opciones: string[]; valor: string;
    onSelect: (v: string) => void;
}) => (
    <View style={s.campoWrap}>
        <Text style={s.campoLabel}>{label}</Text>
        <View style={s.chipRow}>
            {opciones.map(op => {
                const activo = valor === op;
                return (
                    <TouchableOpacity
                        key={op}
                        style={[s.chip, activo && s.chipActivo]}
                        onPress={() => onSelect(op)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.chipTxt, activo && s.chipTxtActivo]}>
                            {op.charAt(0).toUpperCase() + op.slice(1)}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    </View>
);

// ─── Modal Genérico Rediseñado ────────────────────────────────────────────────

const ModalForm = ({ visible, titulo, onClose, onGuardar, cargando, children }: {
    visible: boolean; titulo: string; onClose: () => void;
    onGuardar: () => void; cargando: boolean; children: React.ReactNode;
}) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={s.modalOverlay}>
            <View style={s.modalCard}>
                <View style={s.modalDragPill} />
                <View style={s.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={s.modalHeaderIconBadge}>
                            <Ionicons name="create-outline" size={20} color="#2563EB" />
                        </View>
                        <Text style={s.modalTitulo}>{titulo}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={s.modalBtnCerrar} activeOpacity={0.7}>
                        <Ionicons name="close" size={22} color="#64748B" />
                    </TouchableOpacity>
                </View>
                <ScrollView
                    style={s.modalScroll}
                    contentContainerStyle={s.modalScrollContent}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    bounces={true}
                >
                    {children}
                    <View style={{ height: 24 }} />
                </ScrollView>
                <View style={s.modalFooter}>
                    <TouchableOpacity
                        style={[s.btnGuardar, cargando && s.btnDeshabilitado]}
                        onPress={onGuardar}
                        disabled={cargando}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={cargando ? ['#94A3B8', '#64748B'] : ['#2563EB', '#1D4ED8']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={s.btnGuardarGradiente}
                        >
                            {cargando
                                ? <ActivityIndicator color="#fff" />
                                : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="save-outline" size={19} color="#fff" />
                                        <Text style={s.btnGuardarTxt}>Guardar cambios</Text>
                                    </View>
                                )
                            }
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminScreen() {
    const router = useRouter();
    const [seccion, setSeccion] = useState<Seccion>('videos');
    const [cargando, setCargando] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Datos
    const [videos, setVideos] = useState<Video[]>([]);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [rutinas, setRutinas] = useState<Rutina[]>([]);
    const [filtroVideos, setFiltroVideos] = useState<FiltroVideos>('todos');

    // Rutinas
    const [modalRutina, setModalRutina] = useState(false);
    const [rutinaEdit, setRutinaEdit] = useState<Rutina | null>(null);
    const [fRutina, setFRutina] = useState<FormRutina>(RUTINA_VACIA);
    const [buscarEjercicio, setBuscarEjercicio] = useState('');

    // Modales
    const [modalVideo, setModalVideo] = useState(false);
    const [modalUsuario, setModalUsuario] = useState(false);

    // Items en edición
    const [videoEdit, setVideoEdit] = useState<Video | null>(null);
    const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null);

    // Formularios
    const [fVideo, setFVideo] = useState<Omit<Video, 'id_video'>>(VIDEO_VACIO);
    const [fUsuario, setFUsuario] = useState<Partial<Usuario>>({});

    // ── Verificar rol admin ────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const rol = await AsyncStorage.getItem('userRol');
            if (rol !== 'admin') {
                avisar('Acceso denegado', 'Esta sección es solo para administradores.');
                router.replace('/home');
            }
        })();
    }, []);

    // ── Carga de datos ─────────────────────────────────────────────────────────
    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            if (seccion === 'videos') {
                const d = await api('/admin/videos');
                if (d.success) setVideos(d.videos);
            } else if (seccion === 'rutinas') {
                const [dr, dv] = await Promise.all([api('/admin/rutinas'), api('/admin/videos')]);
                if (dr.success) setRutinas(dr.rutinas);
                if (dv.success) setVideos(dv.videos);
            } else {
                const d = await api('/admin/usuarios');
                if (d.success) setUsuarios(d.usuarios);
            }
        } catch (e) {
            avisar('Error', 'No se pudo cargar la información.');
        } finally {
            setCargando(false);
            setRefreshing(false);
        }
    }, [seccion]);

    useEffect(() => { cargar(); }, [cargar]);

    // ── Acciones Videos ────────────────────────────────────────────────────────
    const mostrarAlerta = (titulo: string, mensaje: string) => {
        if (Platform.OS === 'web') {
            window.alert(`${titulo}\n${mensaje}`);
        } else {
            avisar(titulo, mensaje);
        }
    };

    const abrirNuevoVideo = () => {
        setVideoEdit(null);
        setFVideo(VIDEO_VACIO);
        setModalVideo(true);
    };

    const abrirEditarVideo = (v: Video) => {
        setVideoEdit(v);
        setFVideo({ ...v });
        setModalVideo(true);
    };

    const guardarVideo = async () => {
        if (!fVideo.nombre_video || !fVideo.categoria || fVideo.duracion_min === undefined || fVideo.duracion_min === null) {
            mostrarAlerta('Faltan datos', 'Nombre, categoría y duración son obligatorios.');
            return;
        }
        setCargando(true);
        try {
            const d = videoEdit
                ? await api(`/admin/videos/${videoEdit.id_video}`, 'PUT', fVideo)
                : await api('/admin/videos', 'POST', fVideo);
            if (d.success) {
                setModalVideo(false);
                cargar();
            } else {
                mostrarAlerta('Error', d.message);
            }
        } catch { mostrarAlerta('Error', 'No se pudo guardar.'); }
        finally { setCargando(false); }
    };

    const confirmarEliminacion = (titulo: string, mensaje: string, onConfirm: () => void) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`${titulo}\n${mensaje}`)) {
                onConfirm();
            }
        } else {
            Alert.alert(titulo, mensaje, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: onConfirm }
            ]);
        }
    };

    const eliminarVideo = (v: Video) => {
        confirmarEliminacion('Eliminar video', `¿Eliminar "${v.nombre_video}"?`, async () => {
            setCargando(true);
            try {
                const d = await api(`/admin/videos/${v.id_video}`, 'DELETE');
                if (d.success) { avisar('', 'Video eliminado.'); cargar(); }
                else avisar('Error', d.message);
            } catch (e: any) {
                avisar('Error', e.message);
            } finally { setCargando(false); }
        });
    };

    // ── Acciones Rutinas ───────────────────────────────────────────────────────
    const abrirNuevaRutina = () => {
        setRutinaEdit(null);
        setFRutina(RUTINA_VACIA);
        setBuscarEjercicio('');
        setModalRutina(true);
    };

    const abrirEditarRutina = (r: Rutina) => {
        setRutinaEdit(r);
        setFRutina({
            titulo: r.titulo, descripcion: r.descripcion || '', categoria: r.categoria,
            activo: r.activo ? 1 : 0, ejercicios: r.ejercicios.map(e => e.id_video),
        });
        setBuscarEjercicio('');
        setModalRutina(true);
    };

    const moverEjercicio = (indice: number, delta: number) => {
        setFRutina(p => {
            const lista = [...p.ejercicios];
            const destino = indice + delta;
            if (destino < 0 || destino >= lista.length) return p;
            [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
            return { ...p, ejercicios: lista };
        });
    };

    const guardarRutina = async () => {
        if (!fRutina.titulo.trim()) { mostrarAlerta('Faltan datos', 'Escribe el título de la rutina.'); return; }
        if (fRutina.ejercicios.length === 0) { mostrarAlerta('Faltan datos', 'Agrega al menos un ejercicio.'); return; }
        setCargando(true);
        try {
            const d = rutinaEdit
                ? await api(`/admin/rutinas/${rutinaEdit.id_rutina}`, 'PUT', fRutina)
                : await api('/admin/rutinas', 'POST', fRutina);
            if (d.success) { setModalRutina(false); cargar(); }
            else mostrarAlerta('No se guardó', d.message);
        } catch { mostrarAlerta('Error', 'No se pudo guardar.'); }
        finally { setCargando(false); }
    };

    const eliminarRutina = (r: Rutina) => {
        confirmarEliminacion('Eliminar rutina', `¿Eliminar la rutina "${r.titulo}"? Sus ejercicios no se borran.`, async () => {
            setCargando(true);
            try {
                const d = await api(`/admin/rutinas/${r.id_rutina}`, 'DELETE');
                if (d.success) cargar();
                else avisar('Error', d.message);
            } catch (e: any) {
                avisar('Error', e.message);
            } finally { setCargando(false); }
        });
    };

    const videosPorId = new Map(videos.map(v => [v.id_video, v]));
    const porRevisar = videos.filter(v => !estaPublicado(v)).length;
    const videosFiltrados = videos.filter(v =>
        filtroVideos === 'todos' ? true : filtroVideos === 'revisar' ? !estaPublicado(v) : estaPublicado(v));
    const nivelRutinaForm = Math.max(1, ...fRutina.ejercicios.map(id => videosPorId.get(id)?.nivel_funcional || 1));
    const candidatosRutina = videos.filter(v =>
        !fRutina.ejercicios.includes(v.id_video) &&
        (v.nombre_video + ' ' + v.categoria).toLowerCase().includes(buscarEjercicio.trim().toLowerCase()));

    // ── Acciones Usuarios ──────────────────────────────────────────────────────
    const abrirEditarUsuario = (u: Usuario) => {
        setUsuarioEdit(u);
        setFUsuario({ ...u });
        setModalUsuario(true);
    };

    const guardarUsuario = async () => {
        if (!fUsuario.nombre || !fUsuario.email) {
            mostrarAlerta('Faltan datos', 'Nombre y email son obligatorios.');
            return;
        }
        setCargando(true);
        try {
            const d = await api(`/admin/usuarios/${usuarioEdit?.id_usuario}`, 'PUT', fUsuario);
            if (d.success) { setModalUsuario(false); cargar(); }
            else mostrarAlerta('Error', d.message);
        } catch { mostrarAlerta('Error', 'No se pudo guardar.'); }
        finally { setCargando(false); }
    };

    const eliminarUsuario = (u: Usuario) => {
        confirmarEliminacion('Eliminar usuario', `¿Eliminar a "${u.nombre}"?\nSe eliminarán también sus ejercicios y rutinas.`, async () => {
            setCargando(true);
            try {
                const d = await api(`/admin/usuarios/${u.id_usuario}`, 'DELETE');
                if (d.success) { avisar('', `Usuario "${u.nombre}" eliminado.`); cargar(); }
                else avisar('Error', d.message);
            } catch (e: any) {
                avisar('Error', e.message);
            } finally { setCargando(false); }
        });
    };

    const colorDificultad: Record<string, { bg: string; txt: string }> = {
        baja: { bg: '#DCFCE7', txt: '#15803D' },
        media: { bg: '#FEF3C7', txt: '#B45309' },
        alta: { bg: '#FEE2E2', txt: '#B91C1C' },
    };

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════════
    return (
        <SafeAreaView style={s.safe}>
            <StatusBar barStyle="light-content" backgroundColor="#0B132B" />

            {/* ── Encabezado Hero con Gradiente ── */}
            <LinearGradient
                colors={['#0B132B', '#132247', '#1E3A8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.header}
            >
                <View style={s.headerTopRow}>
                    <View>
                        <View style={s.badgeSuperAdmin}>
                            <View style={s.dotOnline} />
                            <Text style={s.badgeSuperAdminTxt}>PANEL DE CONTROL</Text>
                        </View>
                        <Text style={s.headerTitulo}>Administración</Text>
                        <Text style={s.headerSub}>Gestión de catálogo y usuarios VitalApp</Text>
                    </View>
                    <TouchableOpacity
                        style={s.btnCerrar}
                        activeOpacity={0.8}
                        onPress={async () => {
                            await Promise.all([
                                AsyncStorage.removeItem('userId'),
                                AsyncStorage.removeItem('userName'),
                                AsyncStorage.removeItem('userEmail'),
                                AsyncStorage.removeItem('userAge'),
                                AsyncStorage.removeItem('userRol'),
                                AsyncStorage.removeItem('userWeight'),
                                AsyncStorage.removeItem('jwtToken'),
                                AsyncStorage.removeItem('csrfToken')
                            ]);
                            router.replace('/login');
                        }}
                    >
                        <Ionicons name="log-out-outline" size={18} color="#FCA5A5" />
                        <Text style={s.btnCerrarTxt}>Salir</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Mini-tarjetas de Métricas (KPIs) ── */}
                <View style={s.kpiRow}>
                    <View style={s.kpiCard}>
                        <View style={s.kpiIconWrap}>
                            <Ionicons name="barbell-outline" size={18} color="#60A5FA" />
                        </View>
                        <Text style={s.kpiNumero}>{videos.length}</Text>
                        <Text style={s.kpiLabel}>Ejercicios</Text>
                        <Text style={s.kpiSub}>{videos.length - porRevisar} listos</Text>
                    </View>

                    <View style={s.kpiCard}>
                        <View style={s.kpiIconWrap}>
                            <Ionicons name="list-outline" size={18} color="#34D399" />
                        </View>
                        <Text style={s.kpiNumero}>{rutinas.length}</Text>
                        <Text style={s.kpiLabel}>Rutinas</Text>
                        <Text style={s.kpiSub}>{rutinas.filter(r => r.activo).length} activas</Text>
                    </View>

                    <View style={s.kpiCard}>
                        <View style={s.kpiIconWrap}>
                            <Ionicons name="people-outline" size={18} color="#A78BFA" />
                        </View>
                        <Text style={s.kpiNumero}>{usuarios.length}</Text>
                        <Text style={s.kpiLabel}>Usuarios</Text>
                        <Text style={s.kpiSub}>{usuarios.filter(u => u.cuenta_activa).length} activos</Text>
                    </View>
                </View>
            </LinearGradient>

            {/* ── Tabs Segmented Control Flotante ── */}
            <View style={s.tabsWrap}>
                <View style={s.tabs}>
                    {([
                        { key: 'videos', label: 'Ejercicios', icon: 'play-circle-outline' },
                        { key: 'rutinas', label: 'Rutinas', icon: 'list-outline' },
                        { key: 'usuarios', label: 'Usuarios', icon: 'people-outline' },
                    ] as { key: Seccion; label: string; icon: any }[]).map(t => {
                        const activo = seccion === t.key;
                        return (
                            <TouchableOpacity
                                key={t.key}
                                style={[s.tab, activo && s.tabActivo]}
                                onPress={() => setSeccion(t.key)}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={t.icon}
                                    size={18}
                                    color={activo ? '#FFFFFF' : '#64748B'}
                                />
                                <Text style={[s.tabTxt, activo && s.tabTxtActivo]}>
                                    {t.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* ── Barra de Acción / Agregar ── */}
            {seccion !== 'usuarios' && (
                <View style={s.accionBarra}>
                    <TouchableOpacity
                        style={s.btnAgregar}
                        onPress={seccion === 'rutinas' ? abrirNuevaRutina : abrirNuevoVideo}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['#2563EB', '#1D4ED8']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={s.btnAgregarGradiente}
                        >
                            <Ionicons name="add" size={20} color="#fff" />
                            <Text style={s.btnAgregarTxt}>
                                {seccion === 'rutinas' ? 'Nueva Rutina' : 'Nuevo Ejercicio'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Filtro de Ejercicios ── */}
            {seccion === 'videos' && (
                <View style={s.filtros}>
                    {([
                        ['todos', `Todos (${videos.length})`],
                        ['revisar', `Por revisar (${porRevisar})`],
                        ['publicados', `Publicados (${videos.length - porRevisar})`],
                    ] as [FiltroVideos, string][]).map(([clave, texto]) => {
                        const activo = filtroVideos === clave;
                        return (
                            <TouchableOpacity
                                key={clave}
                                style={[s.chipFiltro, activo && s.chipFiltroActivo]}
                                onPress={() => setFiltroVideos(clave)}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.chipFiltroTxt, activo && s.chipFiltroTxtActivo]}>
                                    {texto}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* ── Lista Principal ── */}
            {cargando && !refreshing ? (
                <View style={s.centerLoading}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={s.loadingTxt}>Cargando información...</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={[s.lista, { flexGrow: 1, paddingBottom: 130 }]}
                    showsVerticalScrollIndicator={true}
                    bounces={true}
                    overScrollMode="always"
                    keyboardShouldPersistTaps="handled"
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} colors={['#2563EB']} />
                    }
                >
                    {/* ─── VIDEOS / EJERCICIOS ─── */}
                    {seccion === 'videos' && videosFiltrados.map(v => {
                        const diff = colorDificultad[v.dificultad] || { bg: '#E2E8F0', txt: '#475569' };
                        const publicado = estaPublicado(v);
                        return (
                            <View key={v.id_video} style={s.tarjeta}>
                                <View style={s.tarjetaTop}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.tarjetaTitulo} numberOfLines={1}>{v.nombre_video}</Text>
                                        <Text style={s.tarjetaSub}>{v.categoria}{v.subcategoria ? ` · ${v.subcategoria}` : ''}</Text>
                                    </View>
                                    <View style={[s.badgeDificultad, { backgroundColor: diff.bg }]}>
                                        <Text style={[s.badgeDificultadTxt, { color: diff.txt }]}>
                                            {v.dificultad.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>

                                <View style={s.tarjetaMetaRow}>
                                    <View style={s.metaPill}>
                                        <Ionicons name="time-outline" size={14} color="#64748B" />
                                        <Text style={s.metaPillTxt}>{v.duracion_min} min</Text>
                                    </View>
                                    <View style={s.metaPill}>
                                        <Ionicons name="flame-outline" size={14} color="#64748B" />
                                        <Text style={s.metaPillTxt}>{v.calorias_estimadas ?? '—'} kcal</Text>
                                    </View>
                                    <View style={s.metaPill}>
                                        <Ionicons name="speedometer-outline" size={14} color="#64748B" />
                                        <Text style={s.metaPillTxt}>Nivel {v.nivel_funcional ?? 1}</Text>
                                    </View>
                                    <View style={[s.metaPillEstado, publicado ? s.pillPublicado : s.pillBorrador]}>
                                        <Ionicons
                                            name={publicado ? 'checkmark-circle' : 'alert-circle'}
                                            size={13}
                                            color={publicado ? '#16A34A' : '#D97706'}
                                        />
                                        <Text style={[s.metaPillEstadoTxt, { color: publicado ? '#15803D' : '#B45309' }]}>
                                            {publicado ? 'Publicado' : 'Borrador'}
                                        </Text>
                                    </View>
                                </View>

                                {v.fuente_documental ? (
                                    <View style={s.fuenteWrap}>
                                        <Ionicons name="bookmark-outline" size={13} color="#2563EB" />
                                        <Text style={s.fuenteTxt} numberOfLines={1}>Fuente: {v.fuente_documental}</Text>
                                    </View>
                                ) : null}

                                <View style={s.tarjetaAcciones}>
                                    {v.link_video ? (
                                        <TouchableOpacity style={s.btnAccionVideo} onPress={() => abrirLink(v.link_video)} activeOpacity={0.7}>
                                            <Ionicons name="logo-youtube" size={16} color="#DC2626" />
                                            <Text style={s.btnAccionVideoTxt}>Ver video</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                    <TouchableOpacity style={s.btnAccionEditar} onPress={() => abrirEditarVideo(v)} activeOpacity={0.7}>
                                        <Ionicons name="pencil-outline" size={16} color="#2563EB" />
                                        <Text style={s.btnAccionEditarTxt}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.btnAccionEliminar} onPress={() => eliminarVideo(v)} activeOpacity={0.7}>
                                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                        <Text style={s.btnAccionEliminarTxt}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}

                    {/* ─── RUTINAS ─── */}
                    {seccion === 'rutinas' && (
                        <View style={s.avisoInfoCard}>
                            <Ionicons name="information-circle-outline" size={20} color="#2563EB" />
                            <Text style={s.avisoInfoTxt}>
                                Las rutinas activas se asignan a los usuarios según su nivel funcional. Solo se muestran cuando todos sus ejercicios están publicados.
                            </Text>
                        </View>
                    )}

                    {seccion === 'rutinas' && rutinas.map(r => {
                        const pendientes = r.ejercicios.filter(e => !estaPublicado(e)).length;
                        return (
                            <View key={r.id_rutina} style={s.tarjeta}>
                                <View style={s.tarjetaTop}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.tarjetaTitulo} numberOfLines={1}>{r.titulo}</Text>
                                        <Text style={s.tarjetaSub}>{r.categoria} · Nivel {r.nivel_funcional} · {r.ejercicios.length} ejercicios</Text>
                                    </View>
                                    <View style={[s.badgeDificultad, { backgroundColor: r.activo ? '#DCFCE7' : '#FEF3C7' }]}>
                                        <Text style={[s.badgeDificultadTxt, { color: r.activo ? '#15803D' : '#B45309' }]}>
                                            {r.activo ? 'PUBLICADA' : 'BORRADOR'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={s.rutinaListaEjercicios}>
                                    {r.ejercicios.map((e, i) => (
                                        <View key={`${e.id_video}-${i}`} style={s.filaEjercicio}>
                                            <Ionicons
                                                name={estaPublicado(e) ? 'checkmark-circle' : 'alert-circle'}
                                                size={15}
                                                color={estaPublicado(e) ? '#10B981' : '#D97706'}
                                            />
                                            <Text style={s.filaEjercicioTxt} numberOfLines={1}>{i + 1}. {e.nombre_video}</Text>
                                        </View>
                                    ))}
                                </View>

                                {pendientes > 0 && (
                                    <View style={s.avisoAlertaRutina}>
                                        <Ionicons name="warning-outline" size={15} color="#D97706" />
                                        <Text style={s.avisoAlertaRutinaTxt}>
                                            {pendientes} ejercicio(s) pendientes de revisión.
                                        </Text>
                                    </View>
                                )}

                                <View style={s.tarjetaAcciones}>
                                    <TouchableOpacity style={s.btnAccionEditar} onPress={() => abrirEditarRutina(r)} activeOpacity={0.7}>
                                        <Ionicons name="pencil-outline" size={16} color="#2563EB" />
                                        <Text style={s.btnAccionEditarTxt}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.btnAccionEliminar} onPress={() => eliminarRutina(r)} activeOpacity={0.7}>
                                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                        <Text style={s.btnAccionEliminarTxt}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}

                    {/* ─── USUARIOS ─── */}
                    {seccion === 'usuarios' && usuarios.map(u => (
                        <View key={u.id_usuario} style={s.tarjeta}>
                            <View style={s.tarjetaTop}>
                                <View style={s.avatar}>
                                    <Text style={s.avatarTxt}>{u.nombre.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={s.tarjetaTitulo}>{u.nombre}</Text>
                                    <Text style={s.tarjetaSub}>{u.email}</Text>
                                </View>
                                <View style={[s.badgeDificultad, {
                                    backgroundColor: u.rol === 'admin' ? '#F3E8FF' : '#EFF6FF'
                                }]}>
                                    <Text style={[s.badgeDificultadTxt, {
                                        color: u.rol === 'admin' ? '#7C3AED' : '#2563EB'
                                    }]}>{u.rol.toUpperCase()}</Text>
                                </View>
                            </View>

                            <View style={s.tarjetaMetaRow}>
                                <View style={s.metaPill}>
                                    <Ionicons name="calendar-outline" size={14} color="#64748B" />
                                    <Text style={s.metaPillTxt}>{u.edad ?? '?'} años</Text>
                                </View>
                                <View style={s.metaPill}>
                                    <Ionicons name="fitness-outline" size={14} color="#64748B" />
                                    <Text style={s.metaPillTxt}>{u.peso ? `${u.peso} kg` : 'Sin peso'}</Text>
                                </View>
                                <View style={s.metaPill}>
                                    <Ionicons name="body-outline" size={14} color="#64748B" />
                                    <Text style={s.metaPillTxt}>{u.nivel_actividad}</Text>
                                </View>
                                <View style={[s.metaPillEstado, u.cuenta_activa ? s.pillPublicado : s.pillBorrador]}>
                                    <Ionicons
                                        name={u.cuenta_activa ? 'checkmark-circle' : 'close-circle'}
                                        size={13}
                                        color={u.cuenta_activa ? '#16A34A' : '#DC2626'}
                                    />
                                    <Text style={[s.metaPillEstadoTxt, { color: u.cuenta_activa ? '#15803D' : '#B91C1C' }]}>
                                        {u.cuenta_activa ? 'Activo' : 'Inactivo'}
                                    </Text>
                                </View>
                            </View>

                            {u.condiciones_medicas ? (
                                <Text style={s.condicionTxt} numberOfLines={1}>
                                    🩺 {u.condiciones_medicas}
                                </Text>
                            ) : null}

                            <View style={s.tarjetaAcciones}>
                                <TouchableOpacity style={s.btnAccionEditar} onPress={() => abrirEditarUsuario(u)} activeOpacity={0.7}>
                                    <Ionicons name="pencil-outline" size={16} color="#2563EB" />
                                    <Text style={s.btnAccionEditarTxt}>Editar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btnAccionEliminar} onPress={() => eliminarUsuario(u)} activeOpacity={0.7}>
                                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                    <Text style={s.btnAccionEliminarTxt}>Eliminar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}

                    {/* Empty states */}
                    {seccion === 'videos' && videosFiltrados.length === 0 && !cargando && (
                        <View style={s.emptyState}>
                            <Ionicons name="barbell-outline" size={54} color="#94A3B8" />
                            <Text style={s.emptyTxt}>{videos.length ? 'No hay ejercicios en este filtro' : 'Aún no hay ejercicios registrados'}</Text>
                        </View>
                    )}
                    {seccion === 'rutinas' && rutinas.length === 0 && !cargando && (
                        <View style={s.emptyState}>
                            <Ionicons name="list-outline" size={54} color="#94A3B8" />
                            <Text style={s.emptyTxt}>No hay rutinas registradas</Text>
                        </View>
                    )}
                    {seccion === 'usuarios' && usuarios.length === 0 && !cargando && (
                        <View style={s.emptyState}>
                            <Ionicons name="people-outline" size={54} color="#94A3B8" />
                            <Text style={s.emptyTxt}>No hay usuarios registrados</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {/* ══════════════════════════════════════════════════
                MODAL — EJERCICIO
            ══════════════════════════════════════════════════ */}
            <ModalForm
                visible={modalVideo}
                titulo={videoEdit ? 'Editar ejercicio' : 'Nuevo ejercicio'}
                onClose={() => setModalVideo(false)}
                onGuardar={guardarVideo}
                cargando={cargando}
            >
                <Campo label="Nombre del ejercicio *" value={fVideo.nombre_video}
                    placeholder="Ej. Flexión de rodilla sentado"
                    onChangeText={t => setFVideo(p => ({ ...p, nombre_video: t }))} />
                <Campo label="Descripción" value={fVideo.descripcion} multiline
                    placeholder="Describe los beneficios e instrucciones básicas"
                    onChangeText={t => setFVideo(p => ({ ...p, descripcion: t }))} />
                <Selector
                    label="Categoría *"
                    opciones={CATEGORIAS}
                    valor={fVideo.categoria}
                    onSelect={v => setFVideo(p => ({ ...p, categoria: v }))}
                />
                <Campo label="Subcategoría" value={fVideo.subcategoria}
                    placeholder="Ej. Piernas, Brazos, Postura"
                    onChangeText={t => setFVideo(p => ({ ...p, subcategoria: t }))} />
                <Selector
                    label="Dificultad"
                    opciones={['baja', 'media', 'alta']}
                    valor={fVideo.dificultad}
                    onSelect={v => setFVideo(p => ({ ...p, dificultad: v as any }))}
                />
                <Campo label="Duración (minutos) *" value={fVideo.duracion_min.toString()}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, duracion_min: parseInt(t) || 0 }))} />
                <Campo label="Link del video (YouTube)" value={fVideo.link_video}
                    placeholder="https://www.youtube.com/watch?v=..."
                    onChangeText={t => setFVideo(p => ({ ...p, link_video: t }))} />
                <Campo label="URL miniatura" value={fVideo.url_miniatura}
                    placeholder="https://img.youtube.com/vi/.../hqdefault.jpg"
                    onChangeText={t => setFVideo(p => ({ ...p, url_miniatura: t }))} />
                <Campo label="Calorías estimadas" value={fVideo.calorias_estimadas?.toString() ?? ''}
                    keyboardType="numeric"
                    placeholder="Ej. 45"
                    onChangeText={t => setFVideo(p => ({ ...p, calorias_estimadas: parseInt(t) || 0 }))} />
                <Campo label="Edad mínima recomendada" value={fVideo.edad_minima.toString()}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, edad_minima: parseInt(t) || 60 }))} />
                <Campo label="Edad máxima recomendada" value={fVideo.edad_maxima.toString()}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, edad_maxima: parseInt(t) || 100 }))} />
                <Campo label="Peso máximo recomendado (kg)" value={fVideo.peso_maximo_recomendado?.toString() ?? ''}
                    keyboardType="numeric"
                    placeholder="Ej. 110 (opcional)"
                    onChangeText={t => setFVideo(p => ({ ...p, peso_maximo_recomendado: parseFloat(t) || 0 }))} />
                <Selector
                    label="Nivel funcional mínimo (1: Suave · 2: Moderado · 3: Activo)"
                    opciones={['1', '2', '3']}
                    valor={(fVideo.nivel_funcional ?? 1).toString()}
                    onSelect={v => setFVideo(p => ({ ...p, nivel_funcional: parseInt(v) }))}
                />
                <Campo label="Contraindicaciones (cuándo NO hacerlo)" value={fVideo.contraindicaciones ?? ''} multiline
                    placeholder="Ej. Dolor agudo en rodilla, mareos al estar de pie"
                    onChangeText={t => setFVideo(p => ({ ...p, contraindicaciones: t }))} />
                <Campo label="Fuente documental * (obligatoria para publicar)" value={fVideo.fuente_documental ?? ''}
                    placeholder="Ej. OMS 2020; Programa Vivifrail; Guía Otago"
                    onChangeText={t => setFVideo(p => ({ ...p, fuente_documental: t }))} />
                <Selector
                    label="Estado de publicación"
                    opciones={['Publicado', 'Borrador']}
                    valor={fVideo.activo ? 'Publicado' : 'Borrador'}
                    onSelect={v => setFVideo(p => ({ ...p, activo: v === 'Publicado' ? 1 : 0 }))}
                />
                {fVideo.link_video ? (
                    <TouchableOpacity style={s.btnVerVideo} onPress={() => abrirLink(fVideo.link_video)} activeOpacity={0.8}>
                        <Ionicons name="logo-youtube" size={18} color="#DC2626" />
                        <Text style={s.btnVerVideoTxt}>Probar video en YouTube</Text>
                    </TouchableOpacity>
                ) : null}
            </ModalForm>

            {/* ══════════════════════════════════════════════════
                MODAL — RUTINA
            ══════════════════════════════════════════════════ */}
            <ModalForm
                visible={modalRutina}
                titulo={rutinaEdit ? 'Editar rutina' : 'Nueva rutina'}
                onClose={() => setModalRutina(false)}
                onGuardar={guardarRutina}
                cargando={cargando}
            >
                <Campo label="Título de la rutina *" value={fRutina.titulo}
                    placeholder="Ej. Movilidad y equilibrio matutino"
                    onChangeText={t => setFRutina(p => ({ ...p, titulo: t }))} />
                <Campo label="Descripción" value={fRutina.descripcion} multiline
                    placeholder="Explica el objetivo de esta rutina"
                    onChangeText={t => setFRutina(p => ({ ...p, descripcion: t }))} />
                <Selector
                    label="Categoría principal"
                    opciones={CATEGORIAS}
                    valor={fRutina.categoria}
                    onSelect={v => setFRutina(p => ({ ...p, categoria: v }))}
                />
                <Selector
                    label="Estado de la rutina"
                    opciones={['Publicada', 'Borrador']}
                    valor={fRutina.activo ? 'Publicada' : 'Borrador'}
                    onSelect={v => setFRutina(p => ({ ...p, activo: v === 'Publicada' ? 1 : 0 }))}
                />

                <Text style={s.campoLabel}>
                    Ejercicios en orden ({fRutina.ejercicios.length}) · Nivel resultante: {nivelRutinaForm}
                </Text>
                <Text style={s.ayuda}>El nivel de la rutina se calcula automáticamente según el ejercicio más exigente.</Text>

                {fRutina.ejercicios.map((id, i) => {
                    const v = videosPorId.get(id);
                    return (
                        <View key={`${id}-${i}`} style={s.filaEditable}>
                            <Ionicons
                                name={v && estaPublicado(v) ? 'checkmark-circle' : 'alert-circle'}
                                size={18}
                                color={v && estaPublicado(v) ? '#10B981' : '#D97706'}
                            />
                            <Text style={s.filaEditableTxt} numberOfLines={1}>
                                {i + 1}. {v?.nombre_video ?? `Ejercicio ${id}`}{v ? ` · N${v.nivel_funcional}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => moverEjercicio(i, -1)} style={s.btnIcono}>
                                <Ionicons name="arrow-up" size={17} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => moverEjercicio(i, 1)} style={s.btnIcono}>
                                <Ionicons name="arrow-down" size={17} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setFRutina(p => ({ ...p, ejercicios: p.ejercicios.filter((_, j) => j !== i) }))}
                                style={s.btnIconoQuitar}
                            >
                                <Ionicons name="close" size={17} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    );
                })}

                <Text style={[s.campoLabel, { marginTop: 18 }]}>Agregar ejercicios del catálogo</Text>
                <TextInput
                    style={s.campoInput}
                    value={buscarEjercicio}
                    onChangeText={setBuscarEjercicio}
                    placeholder="Buscar por nombre o categoría..."
                    placeholderTextColor="#94A3B8"
                />
                <View style={{ marginTop: 8, marginBottom: 14 }}>
                    {candidatosRutina.slice(0, 25).map(v => (
                        <TouchableOpacity
                            key={v.id_video}
                            style={s.filaCandidato}
                            onPress={() => setFRutina(p => ({ ...p, ejercicios: [...p.ejercicios, v.id_video] }))}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="add-circle" size={20} color="#2563EB" />
                            <Text style={s.filaEditableTxt} numberOfLines={1}>
                                {v.nombre_video} · {v.categoria} · N{v.nivel_funcional}
                            </Text>
                            {!estaPublicado(v) && <Text style={s.etiquetaBorrador}>borrador</Text>}
                        </TouchableOpacity>
                    ))}
                </View>
            </ModalForm>

            {/* ══════════════════════════════════════════════════
                MODAL — USUARIO
            ══════════════════════════════════════════════════ */}
            <ModalForm
                visible={modalUsuario}
                titulo="Editar usuario"
                onClose={() => setModalUsuario(false)}
                onGuardar={guardarUsuario}
                cargando={cargando}
            >
                <Campo label="Nombre completo *" value={fUsuario.nombre ?? ''}
                    onChangeText={t => setFUsuario(p => ({ ...p, nombre: t }))} />
                <Campo label="Email *" value={fUsuario.email ?? ''}
                    keyboardType="email-address"
                    onChangeText={t => setFUsuario(p => ({ ...p, email: t }))} />
                <Campo label="Peso (kg)" value={fUsuario.peso?.toString() ?? ''}
                    keyboardType="numeric"
                    onChangeText={t => setFUsuario(p => ({ ...p, peso: parseFloat(t) || 0 }))} />
                <Campo label="Altura (m)" value={fUsuario.altura?.toString() ?? ''}
                    keyboardType="numeric"
                    onChangeText={t => setFUsuario(p => ({ ...p, altura: parseFloat(t) || 0 }))} />
                <Selector
                    label="Género"
                    opciones={['M', 'F', 'Otro']}
                    valor={fUsuario.genero ?? 'Otro'}
                    onSelect={v => setFUsuario(p => ({ ...p, genero: v as any }))}
                />
                <Campo label="Teléfono" value={fUsuario.telefono ?? ''}
                    keyboardType="phone-pad"
                    onChangeText={t => setFUsuario(p => ({ ...p, telefono: t }))} />
                <Selector
                    label="Rol de cuenta"
                    opciones={['usuario', 'admin']}
                    valor={fUsuario.rol ?? 'usuario'}
                    onSelect={v => setFUsuario(p => ({ ...p, rol: v as any }))}
                />
                <Selector
                    label="Estado de la cuenta"
                    opciones={['1', '0']}
                    valor={fUsuario.cuenta_activa?.toString() ?? '1'}
                    onSelect={v => setFUsuario(p => ({ ...p, cuenta_activa: parseInt(v) }))}
                />
                <Selector
                    label="Nivel de actividad"
                    opciones={['sedentario', 'ligero', 'moderado', 'activo']}
                    valor={fUsuario.nivel_actividad ?? 'sedentario'}
                    onSelect={v => setFUsuario(p => ({ ...p, nivel_actividad: v }))}
                />
                <Campo label="Condiciones médicas" value={fUsuario.condiciones_medicas ?? ''} multiline
                    placeholder="Hipertensión, artrosis..."
                    onChangeText={t => setFUsuario(p => ({ ...p, condiciones_medicas: t }))} />
                <Campo label="Restricciones físicas" value={fUsuario.restricciones ?? ''} multiline
                    placeholder="Evitar saltos, dolor en hombro..."
                    onChangeText={t => setFUsuario(p => ({ ...p, restricciones: t }))} />
            </ModalForm>
        </SafeAreaView>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS MODERNOS PREMIUM
// ═══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },

    // ── Header Hero ──
    header: {
        paddingHorizontal: 22,
        paddingTop: Platform.OS === 'android' ? 24 : 16,
        paddingBottom: 24,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        ...Platform.select({
            web: { boxShadow: '0 8px 30px rgba(11, 19, 43, 0.25)' },
            ios: { shadowColor: '#0B132B', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15 },
            android: { elevation: 8 },
        }),
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    badgeSuperAdmin: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.35)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    dotOnline: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
    badgeSuperAdminTxt: {
        color: '#93C5FD',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    headerTitulo: {
        fontSize: 26,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '500',
        marginTop: 2,
    },
    btnCerrar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    btnCerrarTxt: {
        color: '#FCA5A5',
        fontSize: 13,
        fontWeight: '700',
    },

    // ── KPI Cards ──
    kpiRow: {
        flexDirection: 'row',
        gap: 12,
    },
    kpiCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 18,
        padding: 12,
        alignItems: 'center',
    },
    kpiIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
    },
    kpiNumero: {
        fontSize: 20,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    kpiLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#E2E8F0',
        marginTop: 1,
    },
    kpiSub: {
        fontSize: 10,
        fontWeight: '500',
        color: '#94A3B8',
        marginTop: 2,
    },

    // ── Segmented Control Tabs ──
    tabsWrap: {
        paddingHorizontal: 20,
        marginTop: -14,
        zIndex: 10,
    },
    tabs: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 4,
        ...Platform.select({
            web: { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
            android: { elevation: 3 },
        }),
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 14,
    },
    tabActivo: {
        backgroundColor: '#2563EB',
    },
    tabTxt: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    tabTxtActivo: {
        color: '#FFFFFF',
        fontWeight: '800',
    },

    // ── Acciones Barra ──
    accionBarra: {
        paddingHorizontal: 20,
        marginTop: 14,
    },
    btnAgregar: {
        borderRadius: 16,
        overflow: 'hidden',
        ...Platform.select({
            web: { boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)' },
            ios: { shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
            android: { elevation: 4 },
        }),
    },
    btnAgregarGradiente: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
    },
    btnAgregarTxt: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.3,
    },

    // ── Filtros Chips ──
    filtros: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 20,
        marginTop: 12,
    },
    chipFiltro: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: '#E2E8F0',
    },
    chipFiltroActivo: {
        backgroundColor: '#DBEAFE',
    },
    chipFiltroTxt: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    chipFiltroTxtActivo: {
        color: '#1D4ED8',
        fontWeight: '800',
    },

    // ── Lista ──
    lista: {
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 40,
        gap: 14,
    },

    // ── Tarjeta Premium ──
    tarjeta: {
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Platform.select({
            web: { boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)' },
            ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10 },
            android: { elevation: 2 },
        }),
    },
    tarjetaTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    tarjetaTitulo: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 2,
    },
    tarjetaSub: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '500',
    },
    badgeDificultad: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 14,
        marginLeft: 8,
    },
    badgeDificultadTxt: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
    },

    // Meta Pills
    tarjetaMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 12,
    },
    metaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
    },
    metaPillTxt: {
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
    metaPillEstado: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        marginLeft: 'auto',
    },
    pillPublicado: {
        backgroundColor: '#DCFCE7',
    },
    pillBorrador: {
        backgroundColor: '#FEF3C7',
    },
    metaPillEstadoTxt: {
        fontSize: 11,
        fontWeight: '800',
    },

    fuenteWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        marginBottom: 12,
    },
    fuenteTxt: {
        fontSize: 12,
        color: '#1D4ED8',
        fontWeight: '600',
        flex: 1,
    },

    // Acciones Tarjeta
    tarjetaAcciones: {
        flexDirection: 'row',
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 12,
    },
    btnAccionVideo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#FEF2F2',
        borderRadius: 12,
        paddingVertical: 9,
    },
    btnAccionVideoTxt: {
        color: '#DC2626',
        fontSize: 13,
        fontWeight: '700',
    },
    btnAccionEditar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        paddingVertical: 9,
    },
    btnAccionEditarTxt: {
        color: '#2563EB',
        fontSize: 13,
        fontWeight: '700',
    },
    btnAccionEliminar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#FFF1F2',
        borderRadius: 12,
        paddingVertical: 9,
    },
    btnAccionEliminarTxt: {
        color: '#E11D48',
        fontSize: 13,
        fontWeight: '700',
    },

    // Rutina Específico
    avisoInfoCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#EFF6FF',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    avisoInfoTxt: {
        flex: 1,
        fontSize: 13,
        color: '#1E40AF',
        lineHeight: 19,
        fontWeight: '500',
    },
    rutinaListaEjercicios: {
        backgroundColor: '#F8FAFC',
        padding: 10,
        borderRadius: 14,
        marginBottom: 10,
        gap: 6,
    },
    filaEjercicio: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    filaEjercicioTxt: {
        fontSize: 13,
        color: '#334155',
        fontWeight: '500',
        flex: 1,
    },
    avisoAlertaRutina: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFBEB',
        padding: 8,
        borderRadius: 10,
        marginBottom: 10,
    },
    avisoAlertaRutinaTxt: {
        fontSize: 12,
        color: '#B45309',
        fontWeight: '600',
        flex: 1,
    },

    // Usuario Específico
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarTxt: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1D4ED8',
    },
    condicionTxt: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 10,
        fontWeight: '500',
    },

    // Loading & Empty
    centerLoading: {
        paddingTop: 80,
        alignItems: 'center',
        gap: 12,
    },
    loadingTxt: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
        gap: 12,
    },
    emptyTxt: {
        color: '#64748B',
        fontSize: 15,
        fontWeight: '600',
    },

    // ── Modal Formulario ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    },
    modalCard: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: '90%',
        maxHeight: '92%',
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...Platform.select({
            web: { boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.25)' },
        }),
    },
    modalDragPill: {
        width: 40,
        height: 5,
        backgroundColor: '#CBD5E1',
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 12,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 22,
        paddingTop: 14,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    modalHeaderIconBadge: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitulo: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    modalBtnCerrar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalScroll: {
        flex: 1,
        width: '100%',
        ...Platform.select({
            web: {
                overflowY: 'auto' as any,
                WebkitOverflowScrolling: 'touch',
            },
        }),
    },
    modalScrollContent: {
        paddingHorizontal: 22,
        paddingTop: 16,
        paddingBottom: 24,
    },
    modalFooter: {
        paddingHorizontal: 22,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        backgroundColor: '#FFFFFF',
    },
    btnGuardar: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    btnGuardarGradiente: {
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnDeshabilitado: {
        opacity: 0.6,
    },
    btnGuardarTxt: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },

    // Campos
    campoWrap: {
        marginBottom: 16,
    },
    campoLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 6,
    },
    campoInput: {
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontSize: 14,
        color: '#0F172A',
        backgroundColor: '#F8FAFC',
    },
    campoInputMulti: {
        height: 84,
        textAlignVertical: 'top',
        paddingTop: 10,
    },
    btnVerVideo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    btnVerVideoTxt: {
        color: '#DC2626',
        fontWeight: '700',
        fontSize: 13,
    },

    // Chips
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
    },
    chipActivo: {
        borderColor: '#2563EB',
        backgroundColor: '#EFF6FF',
    },
    chipTxt: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    chipTxtActivo: {
        color: '#1D4ED8',
        fontWeight: '800',
    },

    // Edición Rutinas en Modal
    ayuda: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 12,
        lineHeight: 18,
    },
    filaEditable: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        marginBottom: 6,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    filaEditableTxt: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#1E293B',
    },
    btnIcono: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnIconoQuitar: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filaCandidato: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        marginBottom: 6,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    etiquetaBorrador: {
        fontSize: 10,
        color: '#B45309',
        fontWeight: '800',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
    },
});
