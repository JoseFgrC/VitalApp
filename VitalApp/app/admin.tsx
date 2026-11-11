import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    SafeAreaView, TextInput, Alert, ActivityIndicator,
    Modal, StatusBar, RefreshControl, Platform, Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
    ejercicios: number[];   // id_video en orden
}

const RUTINA_VACIA: FormRutina = { titulo: '', descripcion: '', categoria: 'Movilidad', activo: 0, ejercicios: [] };

const CATEGORIAS = ['Cardio', 'Zumba', 'Baile', 'Fuerza', 'Flexibilidad', 'Equilibrio', 'Movilidad', 'Silla', 'Relajación', 'Respiración', 'Pilates', 'Yoga'];

// RN06: un ejercicio solo se muestra a los usuarios si está activo y tiene fuente documental
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

// ─── Componente campo del formulario ─────────────────────────────────────────

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

// Selector de opciones tipo chip
const Selector = ({ label, opciones, valor, onSelect }: {
    label: string; opciones: string[]; valor: string;
    onSelect: (v: string) => void;
}) => (
    <View style={s.campoWrap}>
        <Text style={s.campoLabel}>{label}</Text>
        <View style={s.chipRow}>
            {opciones.map(op => (
                <TouchableOpacity
                    key={op}
                    style={[s.chip, valor === op && s.chipActivo]}
                    onPress={() => onSelect(op)}
                >
                    <Text style={[s.chipTxt, valor === op && s.chipTxtActivo]}>
                        {op.charAt(0).toUpperCase() + op.slice(1)}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    </View>
);

// Selector múltiple tipo chip
const MultiSelector = ({ label, opciones, valoresStr, onChange }: {
    label: string; opciones: string[]; valoresStr: string;
    onChange: (v: string) => void;
}) => {
    const seleccionados = valoresStr ? valoresStr.split(',').map(s => s.trim()).filter(s => s) : [];
    const toggle = (op: string) => {
        if (op === 'Ninguna') {
            onChange('');
            return;
        }
        let nuevos;
        if (seleccionados.includes(op)) {
            nuevos = seleccionados.filter(s => s !== op);
        } else {
            nuevos = [...seleccionados.filter(s => s !== 'Ninguna'), op];
        }
        onChange(nuevos.join(', '));
    };
    return (
        <View style={s.campoWrap}>
            <Text style={s.campoLabel}>{label}</Text>
            <View style={s.chipRow}>
                {opciones.map(op => {
                    const activo = seleccionados.includes(op) || (op === 'Ninguna' && seleccionados.length === 0);
                    return (
                        <TouchableOpacity
                            key={op}
                            style={[s.chip, activo && s.chipActivo]}
                            onPress={() => toggle(op)}
                        >
                            <Text style={[s.chipTxt, activo && s.chipTxtActivo]}>{op}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

// ─── Modal genérico ───────────────────────────────────────────────────────────

const ModalForm = ({ visible, titulo, onClose, onGuardar, cargando, children }: {
    visible: boolean; titulo: string; onClose: () => void;
    onGuardar: () => void; cargando: boolean; children: React.ReactNode;
}) => (
    <Modal visible={visible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
            <View style={s.modalCard}>
                <View style={s.modalHeader}>
                    <Text style={s.modalTitulo}>{titulo}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close-circle" size={28} color="#64748B" />
                    </TouchableOpacity>
                </View>
                <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
                    {children}
                </ScrollView>
                <TouchableOpacity
                    style={[s.btnGuardar, cargando && s.btnDeshabilitado]}
                    onPress={onGuardar}
                    disabled={cargando}
                >
                    {cargando
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={s.btnGuardarTxt}>Guardar cambios</Text>
                    }
                </TouchableOpacity>
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

    // Rutinas: modal, edición y buscador de ejercicios
    const [modalRutina, setModalRutina] = useState(false);
    const [rutinaEdit, setRutinaEdit] = useState<Rutina | null>(null);
    const [fRutina, setFRutina] = useState<FormRutina>(RUTINA_VACIA);
    const [buscarEjercicio, setBuscarEjercicio] = useState('');

    // Modales
    const [modalVideo, setModalVideo] = useState(false);
    const [modalUsuario, setModalUsuario] = useState(false);

    // Item en edición (null = nuevo)
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
                // Las rutinas se arman con los ejercicios del catálogo
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

    // ── CONFIG — acciones ──────────────────────────────────────────────────────
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

    // ── RUTINAS — acciones ─────────────────────────────────────────────────────
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

    // ── USUARIOS — acciones ────────────────────────────────────────────────────
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

    // ── Badges ────────────────────────────────────────────────────────────────
    const colorDificultad: Record<string, string> = {
        baja: '#10B981', media: '#F59E0B', alta: '#EF4444'
    };

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════════
    return (
        <SafeAreaView style={s.safe}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

            {/* ── Header ── */}
            <View style={s.header}>
                <View>
                    <Text style={s.headerSub}>Panel de control</Text>
                    <Text style={s.headerTitulo}>Administrador</Text>
                </View>
                <TouchableOpacity
                    style={s.btnCerrar}
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
                    <Ionicons name="log-out-outline" size={22} color="#F87171" />
                    <Text style={s.btnCerrarTxt}>Salir</Text>
                </TouchableOpacity>
            </View>

            {/* ── Tabs de sección ── */}
            <View style={s.tabs}>
                {([
                    { key: 'videos', label: 'Ejercicios', icon: 'play-circle-outline' },
                    { key: 'rutinas', label: 'Rutinas', icon: 'list-outline' },
                    { key: 'usuarios', label: 'Usuarios', icon: 'people-outline' },
                ] as { key: Seccion; label: string; icon: any }[]).map(t => (
                    <TouchableOpacity
                        key={t.key}
                        style={[s.tab, seccion === t.key && s.tabActivo]}
                        onPress={() => setSeccion(t.key)}
                    >
                        <Ionicons
                            name={t.icon}
                            size={18}
                            color={seccion === t.key ? '#2563EB' : '#94A3B8'}
                        />
                        <Text style={[s.tabTxt, seccion === t.key && s.tabTxtActivo]}>
                            {t.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Botón agregar (no en usuarios) ── */}
            {seccion !== 'usuarios' && (
                <TouchableOpacity
                    style={s.btnAgregar}
                    onPress={seccion === 'rutinas' ? abrirNuevaRutina : abrirNuevoVideo}
                >
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={s.btnAgregarTxt}>
                        {seccion === 'rutinas' ? 'Nueva rutina' : 'Nuevo ejercicio'}
                    </Text>
                </TouchableOpacity>
            )}

            {/* ── Filtro de ejercicios: los borradores importados se revisan aquí ── */}
            {seccion === 'videos' && (
                <View style={s.filtros}>
                    {([
                        ['todos', `Todos (${videos.length})`],
                        ['revisar', `Por revisar (${porRevisar})`],
                        ['publicados', `Publicados (${videos.length - porRevisar})`],
                    ] as [FiltroVideos, string][]).map(([clave, texto]) => (
                        <TouchableOpacity key={clave} style={[s.chip, filtroVideos === clave && s.chipActivo]} onPress={() => setFiltroVideos(clave)}>
                            <Text style={[s.chipTxt, filtroVideos === clave && s.chipTxtActivo]}>{texto}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* ── Lista principal ── */}
            {cargando && !refreshing
                ? <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
                : (
                    <ScrollView
                        contentContainerStyle={s.lista}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} />
                        }
                    >
                        {/* ─── VIDEOS ─── */}
                        {seccion === 'videos' && videosFiltrados.map(v => (
                            <View key={v.id_video} style={s.tarjeta}>
                                <View style={s.tarjetaTop}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.tarjetaTitulo} numberOfLines={1}>{v.nombre_video}</Text>
                                        <Text style={s.tarjetaSub}>{v.categoria}{v.subcategoria ? ` · ${v.subcategoria}` : ''}</Text>
                                    </View>
                                    <View style={[s.badge, { backgroundColor: colorDificultad[v.dificultad] + '22' }]}>
                                        <Text style={[s.badgeTxt, { color: colorDificultad[v.dificultad] }]}>
                                            {v.dificultad}
                                        </Text>
                                    </View>
                                </View>
                                <View style={s.tarjetaMeta}>
                                    <View style={s.metaItem}>
                                        <Ionicons name="time-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{v.duracion_min} min</Text>
                                    </View>
                                    <View style={s.metaItem}>
                                        <Ionicons name="flame-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{v.calorias_estimadas ?? '—'} kcal</Text>
                                    </View>
                                    <View style={s.metaItem}>
                                        <Ionicons name="person-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{v.edad_minima}–{v.edad_maxima} años</Text>
                                    </View>
                                    <View style={s.metaItem}>
                                        <Ionicons name="stats-chart-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>Nivel {v.nivel_funcional ?? 1}</Text>
                                    </View>
                                    <View style={[s.metaItem, { marginLeft: 'auto' }]}>
                                        <Ionicons
                                            name={estaPublicado(v) ? 'checkmark-circle' : 'alert-circle'}
                                            size={14}
                                            color={estaPublicado(v) ? '#10B981' : '#D97706'}
                                        />
                                        <Text style={[s.metaTxt, { color: estaPublicado(v) ? '#10B981' : '#D97706' }]}>
                                            {estaPublicado(v) ? 'Publicado' : !(v.fuente_documental || '').trim() ? 'Borrador · falta fuente' : 'Borrador'}
                                        </Text>
                                    </View>
                                </View>
                                {v.fuente_documental ? (
                                    <Text style={s.fuenteTxt} numberOfLines={1}>Fuente: {v.fuente_documental}</Text>
                                ) : null}
                                <View style={s.tarjetaAcciones}>
                                    {v.link_video ? (
                                        <TouchableOpacity style={s.btnEditar} onPress={() => abrirLink(v.link_video)}>
                                            <Ionicons name="logo-youtube" size={15} color="#DC2626" />
                                            <Text style={[s.btnEditarTxt, { color: '#DC2626' }]}>Ver video</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                    <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditarVideo(v)}>
                                        <Ionicons name="pencil-outline" size={15} color="#2563EB" />
                                        <Text style={s.btnEditarTxt}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.btnEliminar} onPress={() => eliminarVideo(v)}>
                                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                        <Text style={s.btnEliminarTxt}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}

                        {/* ─── RUTINAS ─── */}
                        {seccion === 'rutinas' && (
                            <Text style={s.ayudaLista}>
                                La rutina del día de cada usuario se elige entre las rutinas publicadas de su nivel.
                                Una rutina solo se muestra si todos sus ejercicios están publicados.
                            </Text>
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
                                        <View style={[s.badge, { backgroundColor: r.activo ? '#10B98122' : '#D9770622' }]}>
                                            <Text style={[s.badgeTxt, { color: r.activo ? '#10B981' : '#D97706' }]}>
                                                {r.activo ? 'Publicada' : 'Borrador'}
                                            </Text>
                                        </View>
                                    </View>
                                    {r.ejercicios.map((e, i) => (
                                        <View key={`${e.id_video}-${i}`} style={s.filaEjercicio}>
                                            <Ionicons
                                                name={estaPublicado(e) ? 'checkmark-circle' : 'alert-circle'}
                                                size={16}
                                                color={estaPublicado(e) ? '#10B981' : '#D97706'}
                                            />
                                            <Text style={s.filaEjercicioTxt} numberOfLines={1}>{i + 1}. {e.nombre_video}</Text>
                                        </View>
                                    ))}
                                    {pendientes > 0 && (
                                        <Text style={s.avisoPendientes}>
                                            {pendientes} ejercicio(s) por revisar: publícalos en «Ejercicios» para poder activar esta rutina.
                                        </Text>
                                    )}
                                    <View style={s.tarjetaAcciones}>
                                        <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditarRutina(r)}>
                                            <Ionicons name="pencil-outline" size={15} color="#2563EB" />
                                            <Text style={s.btnEditarTxt}>Editar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.btnEliminar} onPress={() => eliminarRutina(r)}>
                                            <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                            <Text style={s.btnEliminarTxt}>Eliminar</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                        {seccion === 'rutinas' && rutinas.length === 0 && !cargando && (
                            <View style={s.emptyState}>
                                <Ionicons name="list-outline" size={48} color="#CBD5E1" />
                                <Text style={s.emptyTxt}>No hay rutinas registradas</Text>
                            </View>
                        )}

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
                                    <View style={[s.badge, {
                                        backgroundColor: u.rol === 'admin' ? '#7C3AED22' : '#2563EB22'
                                    }]}>
                                        <Text style={[s.badgeTxt, {
                                            color: u.rol === 'admin' ? '#7C3AED' : '#2563EB'
                                        }]}>{u.rol}</Text>
                                    </View>
                                </View>
                                <View style={s.tarjetaMeta}>
                                    <View style={s.metaItem}>
                                        <Ionicons name="calendar-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{u.edad ?? '?'} años</Text>
                                    </View>
                                    <View style={s.metaItem}>
                                        <Ionicons name="barbell-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{u.peso} kg</Text>
                                    </View>
                                    <View style={s.metaItem}>
                                        <Ionicons name="fitness-outline" size={13} color="#94A3B8" />
                                        <Text style={s.metaTxt}>{u.nivel_actividad}</Text>
                                    </View>
                                    <View style={[s.metaItem, { marginLeft: 'auto' }]}>
                                        <Ionicons
                                            name={u.cuenta_activa ? 'checkmark-circle' : 'close-circle'}
                                            size={14}
                                            color={u.cuenta_activa ? '#10B981' : '#EF4444'}
                                        />
                                        <Text style={[s.metaTxt, { color: u.cuenta_activa ? '#10B981' : '#EF4444' }]}>
                                            {u.cuenta_activa ? 'Activo' : 'Inactivo'}
                                        </Text>
                                    </View>
                                </View>
                                {u.condiciones_medicas ? (
                                    <Text style={s.condicionTxt} numberOfLines={1}>
                                         {u.condiciones_medicas}
                                    </Text>
                                ) : null}
                                <View style={s.tarjetaAcciones}>
                                    <TouchableOpacity style={s.btnEditar} onPress={() => abrirEditarUsuario(u)}>
                                        <Ionicons name="pencil-outline" size={15} color="#2563EB" />
                                        <Text style={s.btnEditarTxt}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.btnEliminar} onPress={() => eliminarUsuario(u)}>
                                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                        <Text style={s.btnEliminarTxt}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}

                        {/* Empty state */}
                        {seccion === 'videos' && videosFiltrados.length === 0 && !cargando && (
                            <View style={s.emptyState}>
                                <Ionicons name="barbell-outline" size={48} color="#CBD5E1" />
                                <Text style={s.emptyTxt}>{videos.length ? 'Nada en este filtro' : 'No hay ejercicios registrados'}</Text>
                            </View>
                        )}
                        {seccion === 'usuarios' && usuarios.length === 0 && !cargando && (
                            <View style={s.emptyState}>
                                <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                                <Text style={s.emptyTxt}>No hay usuarios registrados</Text>
                            </View>
                        )}
                    </ScrollView>
                )
            }

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
                    onChangeText={t => setFVideo(p => ({ ...p, nombre_video: t }))} />
                <Campo label="Descripción" value={fVideo.descripcion} multiline
                    onChangeText={t => setFVideo(p => ({ ...p, descripcion: t }))} />
                <Selector
                    label="Categoría *"
                    opciones={CATEGORIAS}
                    valor={fVideo.categoria}
                    onSelect={v => setFVideo(p => ({ ...p, categoria: v }))}
                />
                <Campo label="Subcategoría" value={fVideo.subcategoria}
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
                <Campo label="Link del video (YouTube) (Opcional)" value={fVideo.link_video}
                    placeholder="https://www.youtube.com/watch?v=..."
                    onChangeText={t => setFVideo(p => ({ ...p, link_video: t }))} />
                <Campo label="URL miniatura" value={fVideo.url_miniatura}
                    placeholder="https://img.youtube.com/vi/.../hqdefault.jpg"
                    onChangeText={t => setFVideo(p => ({ ...p, url_miniatura: t }))} />
                <Campo label="Calorías estimadas" value={fVideo.calorias_estimadas?.toString() ?? ''}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, calorias_estimadas: parseInt(t) || 0 }))} />
                <Campo label="Edad mínima" value={fVideo.edad_minima.toString()}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, edad_minima: parseInt(t) || 60 }))} />
                <Campo label="Edad máxima" value={fVideo.edad_maxima.toString()}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, edad_maxima: parseInt(t) || 100 }))} />
                <Campo label="Peso máximo recomendado (kg)" value={fVideo.peso_maximo_recomendado?.toString() ?? ''}
                    keyboardType="numeric"
                    onChangeText={t => setFVideo(p => ({ ...p, peso_maximo_recomendado: parseFloat(t) || 0 }))} />
                <Selector
                    label="Nivel funcional mínimo (1 suave · 2 moderado · 3 activo)"
                    opciones={['1', '2', '3']}
                    valor={(fVideo.nivel_funcional ?? 1).toString()}
                    onSelect={v => setFVideo(p => ({ ...p, nivel_funcional: parseInt(v) }))}
                />
                <Campo label="Contraindicaciones (cuándo NO hacerlo)" value={fVideo.contraindicaciones ?? ''} multiline
                    placeholder="Ej. dolor agudo de rodilla, mareos al estar de pie"
                    onChangeText={t => setFVideo(p => ({ ...p, contraindicaciones: t }))} />
                <Campo label="Fuente documental * (obligatoria para publicar)" value={fVideo.fuente_documental ?? ''}
                    placeholder="Ej. OMS 2020; Programa Vivifrail; Programa Otago"
                    onChangeText={t => setFVideo(p => ({ ...p, fuente_documental: t }))} />
                <Selector
                    label="Estado"
                    opciones={['Publicado', 'Borrador']}
                    valor={fVideo.activo ? 'Publicado' : 'Borrador'}
                    onSelect={v => setFVideo(p => ({ ...p, activo: v === 'Publicado' ? 1 : 0 }))}
                />
                <Text style={s.ayuda}>
                    Publicado: lo ven los usuarios (requiere fuente documental). Borrador: queda guardado pero oculto.
                </Text>
                {fVideo.link_video ? (
                    <TouchableOpacity style={s.btnVerVideo} onPress={() => abrirLink(fVideo.link_video)}>
                        <Ionicons name="logo-youtube" size={18} color="#DC2626" />
                        <Text style={s.btnVerVideoTxt}>Revisar el video en YouTube</Text>
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
                <Campo label="Título *" value={fRutina.titulo}
                    placeholder="Ej. Movilidad y equilibrio"
                    onChangeText={t => setFRutina(p => ({ ...p, titulo: t }))} />
                <Campo label="Descripción" value={fRutina.descripcion} multiline
                    onChangeText={t => setFRutina(p => ({ ...p, descripcion: t }))} />
                <Selector
                    label="Categoría principal (se usa para no recomendarla ante ciertas enfermedades)"
                    opciones={CATEGORIAS}
                    valor={fRutina.categoria}
                    onSelect={v => setFRutina(p => ({ ...p, categoria: v }))}
                />
                <Selector
                    label="Estado"
                    opciones={['Publicada', 'Borrador']}
                    valor={fRutina.activo ? 'Publicada' : 'Borrador'}
                    onSelect={v => setFRutina(p => ({ ...p, activo: v === 'Publicada' ? 1 : 0 }))}
                />

                <Text style={s.campoLabel}>Ejercicios en orden ({fRutina.ejercicios.length}) · Nivel de la rutina: {nivelRutinaForm}</Text>
                <Text style={s.ayuda}>El nivel se calcula solo: es el del ejercicio más exigente.</Text>
                {fRutina.ejercicios.length === 0 && (
                    <Text style={s.ayuda}>Aún no hay ejercicios. Agrégalos desde la lista de abajo.</Text>
                )}
                {fRutina.ejercicios.map((id, i) => {
                    const v = videosPorId.get(id);
                    return (
                        <View key={`${id}-${i}`} style={s.filaEditable}>
                            <Ionicons
                                name={v && estaPublicado(v) ? 'checkmark-circle' : 'alert-circle'}
                                size={18}
                                color={v && estaPublicado(v) ? '#10B981' : '#D97706'}
                            />
                            <Text style={s.filaEditableTxt} numberOfLines={2}>
                                {i + 1}. {v?.nombre_video ?? `Ejercicio ${id}`}{v ? ` · N${v.nivel_funcional}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => moverEjercicio(i, -1)} style={s.btnIcono} accessibilityLabel="Subir">
                                <Ionicons name="arrow-up" size={18} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => moverEjercicio(i, 1)} style={s.btnIcono} accessibilityLabel="Bajar">
                                <Ionicons name="arrow-down" size={18} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setFRutina(p => ({ ...p, ejercicios: p.ejercicios.filter((_, j) => j !== i) }))}
                                style={s.btnIcono} accessibilityLabel="Quitar"
                            >
                                <Ionicons name="close" size={18} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    );
                })}

                <Text style={[s.campoLabel, { marginTop: 16 }]}>Agregar ejercicios del catálogo</Text>
                <TextInput
                    style={s.campoInput}
                    value={buscarEjercicio}
                    onChangeText={setBuscarEjercicio}
                    placeholder="Buscar por nombre o categoría..."
                    placeholderTextColor="#94A3B8"
                />
                <View style={{ marginTop: 8, marginBottom: 12 }}>
                    {candidatosRutina.slice(0, 30).map(v => (
                        <TouchableOpacity
                            key={v.id_video}
                            style={s.filaCandidato}
                            onPress={() => setFRutina(p => ({ ...p, ejercicios: [...p.ejercicios, v.id_video] }))}
                        >
                            <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                            <Text style={s.filaEditableTxt} numberOfLines={1}>
                                {v.nombre_video} · {v.categoria} · N{v.nivel_funcional}
                            </Text>
                            {!estaPublicado(v) && <Text style={s.etiquetaBorrador}>borrador</Text>}
                        </TouchableOpacity>
                    ))}
                    {candidatosRutina.length > 30 && (
                        <Text style={s.ayuda}>Hay {candidatosRutina.length - 30} más: escribe en el buscador para encontrarlos.</Text>
                    )}
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
                <Campo label="Nombre *" value={fUsuario.nombre ?? ''}
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
                    label="Rol"
                    opciones={['usuario', 'admin']}
                    valor={fUsuario.rol ?? 'usuario'}
                    onSelect={v => setFUsuario(p => ({ ...p, rol: v as any }))}
                />
                <Selector
                    label="Cuenta activa"
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
                    onChangeText={t => setFUsuario(p => ({ ...p, condiciones_medicas: t }))} />
                <Campo label="Restricciones físicas" value={fUsuario.restricciones ?? ''} multiline
                    onChangeText={t => setFUsuario(p => ({ ...p, restricciones: t }))} />
            </ModalForm>
        </SafeAreaView>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
    filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
    fuenteTxt: { fontSize: 12, color: '#64748B', marginTop: 6 },
    ayuda: { fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 17 },
    ayudaLista: { fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 18 },
    btnVerVideo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2', marginBottom: 12, alignSelf: 'flex-start' },
    btnVerVideoTxt: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
    filaEjercicio: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    filaEjercicioTxt: { fontSize: 13, color: '#334155', flexShrink: 1 },
    avisoPendientes: { fontSize: 12, color: '#B45309', marginTop: 8, fontWeight: '600' },
    filaEditable: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    filaEditableTxt: { flex: 1, fontSize: 14, color: '#1E293B' },
    btnIcono: { padding: 6, borderRadius: 8, backgroundColor: '#F1F5F9' },
    filaCandidato: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#F8FAFC', marginBottom: 6 },
    etiquetaBorrador: { fontSize: 11, color: '#B45309', fontWeight: '700', backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    safe: { flex: 1, backgroundColor: '#F1F5F9' },

    // Header
    header: {
        backgroundColor: '#0F172A',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 16 : 12,
        paddingBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerSub: { fontSize: 12, color: '#64748B', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    headerTitulo: { fontSize: 22, color: '#F8FAFC', fontWeight: '800' },
    btnCerrar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
    btnCerrarTxt: { color: '#F87171', fontSize: 14, fontWeight: '700' },

    // Tabs
    tabs: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    tab: {
        flex: 1, paddingVertical: 14,
        alignItems: 'center', flexDirection: 'row',
        justifyContent: 'center', gap: 6,
    },
    tabActivo: { borderBottomWidth: 2, borderBottomColor: '#2563EB' },
    tabTxt: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
    tabTxtActivo: { color: '#2563EB' },

    // Botón agregar
    btnAgregar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#2563EB', margin: 16, borderRadius: 14,
        paddingVertical: 13, paddingHorizontal: 20,
        ...Platform.select({
            ios: { shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
            android: { elevation: 4 },
        }),
    },
    btnAgregarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // Lista
    lista: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },

    // Tarjeta
    tarjeta: {
        backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
            android: { elevation: 2 },
        }),
    },
    tarjetaTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    tarjetaTitulo: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
    tarjetaSub: { fontSize: 13, color: '#64748B', fontWeight: '500' },

    // Badge dificultad/rol
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeTxt: { fontSize: 12, fontWeight: '700' },

    // Meta info
    tarjetaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaTxt: { fontSize: 12, color: '#64748B', fontWeight: '500' },

    // Condiciones
    condicionTxt: { fontSize: 12, color: '#475569', marginBottom: 8, fontStyle: 'italic' },

    // Avatar usuario
    avatar: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: '#2563EB22', justifyContent: 'center', alignItems: 'center',
    },
    avatarTxt: { fontSize: 18, fontWeight: '800', color: '#2563EB' },

    // Acciones tarjeta
    tarjetaAcciones: { flexDirection: 'row', gap: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
    btnEditar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 8 },
    btnEditarTxt: { color: '#2563EB', fontSize: 13, fontWeight: '700' },
    btnEliminar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 8 },
    btnEliminarTxt: { color: '#EF4444', fontSize: 13, fontWeight: '700' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTxt: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
    modalCard: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    modalTitulo: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    modalScroll: { paddingHorizontal: 20, paddingTop: 8 },

    // Guardar
    btnGuardar: {
        backgroundColor: '#2563EB', marginHorizontal: 20, marginTop: 16,
        borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    },
    btnDeshabilitado: { backgroundColor: '#94A3B8' },
    btnGuardarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

    // Campos formulario
    campoWrap: { marginBottom: 16 },
    campoLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
    campoInput: {
        borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC',
    },
    campoInputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 10 },

    // Chips selector
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    },
    chipActivo: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
    chipTxt: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    chipTxtActivo: { color: '#2563EB' },
});
