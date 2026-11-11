import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    SafeAreaView,
    TextInput,
    StatusBar,
    Platform,
    Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { textoIntensidad, colorIntensidad } from '../utils/textos';
import { evaluarEjercicio, cargarCondiciones as cargarCondicionesUsuario } from '../utils/condiciones';
import MenuInferior from '../components/MenuInferior';
import { useTheme } from '../hooks/useTheme';
import { getVideoIdForExercise } from '../constants/exercises';

interface Ejercicio {
    id: number;
    nombre: string;
    descripcion: string;
    duracion: number;
    dificultad: string;
    categoria: string;
    url?: string;
    contraindicaciones?: string;
    fuente?: string;
}

export default function EjerciciosScreen() {
    const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
    const [filtrados, setFiltrados] = useState<Ejercicio[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);
    const [userConditions, setUserConditions] = useState<string[]>([]);
    const [showOnlyRecommended, setShowOnlyRecommended] = useState(false);
    // Aviso cuando no hay ejercicios por falta de valoración o por nivel 0
    const [avisoNivel, setAvisoNivel] = useState<{ requiereValoracion: boolean; mensaje: string } | null>(null);
    const router = useRouter();
    const { colors } = useTheme();

    useEffect(() => {
        cargarEjercicios();
        cargarCondiciones();
    }, []);

    const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todas');

    const categorias = ['Todas', 'Cardio', 'Zumba', 'Baile', 'Fuerza', 'Flexibilidad', 'Equilibrio', 'Movilidad', 'Silla', 'Relajación', 'Respiración', 'Pilates', 'Yoga'];

    useEffect(() => {
        let filtradosTemp = ejercicios;

        // Filtrar por búsqueda
        if (busqueda.trim() !== '') {
            filtradosTemp = filtradosTemp.filter(e =>
                e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                e.categoria.toLowerCase().includes(busqueda.toLowerCase())
            );
        }

        // Filtrar por categoría
        if (categoriaSeleccionada !== 'Todas') {
            filtradosTemp = filtradosTemp.filter(e =>
                e.categoria.toLowerCase() === categoriaSeleccionada.toLowerCase()
            );
        }

        setFiltrados(filtradosTemp);
    }, [busqueda, categoriaSeleccionada, ejercicios]);

    // Las condiciones se leen de la BD (cifradas) para que sean las de esta cuenta
    const cargarCondiciones = async () => {
        setUserConditions(await cargarCondicionesUsuario());
    };

    const cargarEjercicios = async () => {
        try {
            // RN03: solo se muestran ejercicios del nivel funcional asignado o inferiores
            const userId = await AsyncStorage.getItem('userId');
            const response = await fetchSeguro(`${API_URL}/exercises/user/${userId}`);
            const data = await response.json();

            if (data.requiere_valoracion) {
                setAvisoNivel({ requiereValoracion: true, mensaje: 'Antes de ver ejercicios necesitamos conocer tu nivel. Responde la valoración inicial.' });
            } else if (data.nivel === 0) {
                setAvisoNivel({ requiereValoracion: false, mensaje: data.message });
            } else {
                setAvisoNivel(null);
            }

            // Map the backend data structure to match the frontend Ejercicio interface
            const ejerciciosMapeados = (data.exercises || []).map((e: any) => ({
                id: e.id_video || e.id,
                nombre: e.nombre_video || e.nombre,
                descripcion: e.descripcion,
                duracion: e.duracion_min ? e.duracion_min * 60 : (e.duracion || 0),
                dificultad: e.dificultad,
                categoria: e.categoria || 'Variado',
                url: e.link_video || e.url || '',
                contraindicaciones: e.contraindicaciones || '',
                fuente: e.fuente_documental || ''
            }));

            setEjercicios(ejerciciosMapeados);
            setFiltrados(ejerciciosMapeados);
        } catch (error) {
            // Sin conexión no se muestran ejercicios: no hay forma de comprobar el nivel del usuario
            console.error('Error:', error);
            setEjercicios([]);
            setFiltrados([]);
        } finally {
            setCargando(false);
        }
    };

    const verDetalle = (ejercicio: Ejercicio) => {
        router.push({
            pathname: '/detalle-ejercicio',
            params: {
                id: ejercicio.id.toString(),
                nombre: ejercicio.nombre,
                descripcion: ejercicio.descripcion || 'Sin descripción',
                duracion: ejercicio.duracion.toString(),
                dificultad: ejercicio.dificultad,
                url: encodeURIComponent(ejercicio.url || ''),
                id_video: ejercicio.id.toString(),
                contraindicaciones: ejercicio.contraindicaciones || '',
                fuente: ejercicio.fuente || ''
            }
        });
    };

    // Extract YouTube video ID from a URL or exercise name
    const getVideoId = (ejercicio: Ejercicio): string => {
        const url = ejercicio.url || '';
        if (url) {
            if (url.includes('v=')) return url.split('v=')[1].split('&')[0].substring(0, 11);
            if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0].substring(0, 11);
            if (url.includes('embed/')) return url.split('embed/')[1].split('?')[0].substring(0, 11);
        }
        return getVideoIdForExercise(ejercicio.nombre);
    };

    const getCategoryIcon = (categoria: string) => {
        switch ((categoria || '').toLowerCase()) {
            case 'cardio': return 'heart-outline';
            case 'zumba': return 'musical-notes-outline';
            case 'baile': return 'musical-note-outline';
            case 'fuerza': return 'barbell-outline';
            case 'flexibilidad': return 'body-outline';
            case 'estiramiento': return 'leaf-outline';
            case 'equilibrio': return 'accessibility-outline';
            case 'movilidad': return 'walk-outline';
            case 'respiracion': return 'leaf-outline';
            case 'piernas': return 'walk-outline';
            case 'abdominales': return 'body-outline';
            case 'silla': return 'person-outline';
            default: return 'fitness-outline';
        }
    };

    const conditionSummary = userConditions.length > 0
        ? userConditions.join(', ')
        : 'Ninguna condición registrada';

    // Mismas reglas que Inicio (utils/condiciones.ts)
    const getExerciseAdvice = (ejercicio: Ejercicio) => evaluarEjercicio(ejercicio.categoria, userConditions).aviso;

    // Colores con contraste ≥ 4.5:1 (utils/textos.ts)
    const getDificultadColor = (dificultad: string) => {
        const c = colorIntensidad(dificultad, colors.isDark);
        return { bg: c.fondo, text: c.texto };
    };

    const visibleEjercicios = showOnlyRecommended
        ? filtrados.filter((ej) => !evaluarEjercicio(ej.categoria, userConditions).evitar)
        : filtrados;

    if (cargando) {
        return (
            <View style={styles.centeredContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Preparando tus rutinas...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />
            
            <ScrollView 
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Cabecera Premium */}
                <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    style={styles.headerGradient}
                >
                <View style={styles.headerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => router.push('/home')} style={{ marginRight: 16 }}>
                            <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Explorar</Text>
                    </View>
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{visibleEjercicios.length} {visibleEjercicios.length === 1 ? 'ejercicio' : 'ejercicios'}</Text>
                    </View>
                </View>
                <View style={styles.conditionBanner}>
                    <Text style={styles.conditionBannerText} numberOfLines={2}>
                        {userConditions.length > 0 ? `Condiciones registradas: ${conditionSummary}` : 'Marca tus condiciones en «Mi salud» para ver recomendaciones y ejercicios no recomendados.'}
                    </Text>
                </View>
                
                <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
                    <Ionicons name="search" size={24} color={colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Buscar por nombre..."
                        placeholderTextColor={colors.textSecondary}
                        value={busqueda}
                        onChangeText={setBusqueda}
                        clearButtonMode="while-editing"
                    />
                </View>

                {/* Filtro de Categorías */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryScroll}
                    contentContainerStyle={styles.categoryContent}
                >
                    {categorias.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            style={[
                                styles.categoryChip,
                                categoriaSeleccionada === cat && styles.categoryChipActive,
                                { backgroundColor: categoriaSeleccionada === cat ? '#FFFFFF' : 'rgba(255,255,255,0.15)' }
                            ]}
                            onPress={() => setCategoriaSeleccionada(cat)}
                        >
                            <Text style={[
                                styles.categoryChipText,
                                categoriaSeleccionada === cat && styles.categoryChipTextActive
                            ]}>
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={styles.recommendToggleRow}>
                    <TouchableOpacity
                        style={[
                            styles.recommendToggle,
                            showOnlyRecommended && styles.recommendToggleActive,
                        ]}
                        onPress={() => setShowOnlyRecommended((prev) => !prev)}
                    >
                        <Ionicons
                            name={showOnlyRecommended ? 'eye-off' : 'eye'}
                            size={18}
                            color={showOnlyRecommended ? '#FFFFFF' : '#2563EB'}
                        />
                        <Text style={[
                            styles.recommendToggleText,
                            showOnlyRecommended && { color: '#FFFFFF' }
                        ]}>
                            {showOnlyRecommended ? 'Solo recomendados' : 'Mostrar no recomendados'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>

                {avisoNivel ? (
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconCircle}>
                            <Ionicons name={avisoNivel.requiereValoracion ? 'clipboard-outline' : 'medkit-outline'} size={60} color="#2563EB" />
                        </View>
                        <Text style={styles.emptyText}>{avisoNivel.requiereValoracion ? 'Falta tu valoración' : 'Consulta a tu médico'}</Text>
                        <Text style={styles.emptySubtext}>{avisoNivel.mensaje}</Text>
                        <TouchableOpacity
                            style={{ marginTop: 20, backgroundColor: '#1D4ED8', borderRadius: 16, minHeight: 60, paddingHorizontal: 28, justifyContent: 'center' }}
                            onPress={() => router.push('/valoracion')}
                        >
                            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
                                {avisoNivel.requiereValoracion ? 'Hacer la valoración' : 'Repetir la valoración'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : visibleEjercicios.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconCircle}>
                            <Ionicons name="search-outline" size={60} color="#94A3B8" />
                        </View>
                        <Text style={styles.emptyText}>No encontramos nada</Text>
                        <Text style={styles.emptySubtext}>Prueba buscando con otras palabras</Text>
                    </View>
                ) : (
                    visibleEjercicios.map((ejercicio, index) => {
                        const videoId = getVideoId(ejercicio);
                        const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

                        return (
                            <TouchableOpacity
                                key={ejercicio.id}
                                style={[styles.tarjetaEjercicio, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                                onPress={() => verDetalle(ejercicio)}
                                activeOpacity={0.9}
                            >
                                {/* Video Thumbnail */}
                                {thumbnailUrl && (
                                    <View style={styles.thumbnailContainer}>
                                        <Image
                                            source={{ uri: thumbnailUrl }}
                                            style={styles.thumbnailImage}
                                            resizeMode="cover"
                                        />
                                        {/* Play button overlay */}
                                        <View style={styles.playOverlay}>
                                            <View style={styles.playButton}>
                                                <Ionicons name="play" size={32} color="#FFFFFF" />
                                            </View>
                                        </View>
                                        {/* Duration badge */}
                                        <View style={styles.durationBadge}>
                                            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
                                            <Text style={styles.durationBadgeText}>
                                                {Math.floor(ejercicio.duracion / 60)} min
                                            </Text>
                                        </View>
                                        {/* Category badge */}
                                        <View style={styles.categoryBadge}>
                                            <Ionicons name={getCategoryIcon(ejercicio.categoria)} size={12} color="#FFFFFF" />
                                            <Text style={styles.categoryBadgeText}>{ejercicio.categoria}</Text>
                                        </View>
                                    </View>
                                )}

                                {/* Card content */}
                                <View style={styles.cardContent}>
                                    <View style={styles.tarjetaHeader}>
                                        <View style={[styles.tarjetaIconContainer, { backgroundColor: colors.settingIconBg }]}>
                                            <Ionicons
                                                name={getCategoryIcon(ejercicio.categoria)}
                                                size={28}
                                                color={colors.isDark ? '#60A5FA' : '#2563EB'}
                                            />
                                        </View>
                                        <View style={styles.tarjetaInfo}>
                                            <Text style={[styles.ejercicioNombre, { color: colors.text }]} numberOfLines={2}>{ejercicio.nombre}</Text>
                                            <Text style={[styles.ejercicioDescripcion, { color: colors.textSecondary }]} numberOfLines={2}>
                                                {ejercicio.descripcion}
                                            </Text>
                                        </View>
                                    </View>
                                    
                                    {getExerciseAdvice(ejercicio) ? (
                                        <View style={[styles.warningBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}> 
                                            <Ionicons name="warning-outline" size={16} color="#B91C1C" />
                                            <Text style={styles.warningText}>{getExerciseAdvice(ejercicio)}</Text>
                                        </View>
                                    ) : null}

                                    {getExerciseAdvice(ejercicio) ? (
                                        <View style={[styles.warningBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA', marginTop: 12, marginHorizontal: 0 }]}> 
                                            <Ionicons name="warning-outline" size={16} color="#B91C1C" />
                                            <Text style={styles.warningText}>{getExerciseAdvice(ejercicio)}</Text>
                                        </View>
                                    ) : null}

                                    <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

                                    <View style={styles.ejercicioFooter}>
                                        {/* Tiempo */}
                                        <View style={[styles.footerBadge, { backgroundColor: colors.bg }]}>
                                            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                                {Math.floor(ejercicio.duracion / 60)} min
                                            </Text>
                                        </View>
                                        {/* Dificultad */}
                                        <View style={[styles.footerBadge, { backgroundColor: getDificultadColor(ejercicio.dificultad).bg }]}>
                                            <Ionicons name="bar-chart-outline" size={16} color={getDificultadColor(ejercicio.dificultad).text} />
                                            <Text style={[styles.dificultad, { color: getDificultadColor(ejercicio.dificultad).text }]}>
                                                {textoIntensidad(ejercicio.dificultad)}
                                            </Text>
                                        </View>
                                        {/* Ver video */}
                                        <View style={styles.verVideoBadge}>
                                            <Ionicons name="play-circle" size={16} color="#FFFFFF" />
                                            <Text style={styles.verVideoText}>Ver video</Text>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            <MenuInferior />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC'
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
        color: '#1E293B',
    },
    headerGradient: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 40,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        ...Platform.select({
            ios: {
                shadowColor: '#1E3A8A',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: '0 8px 16px rgba(30, 58, 138, 0.15)',
            }
        }),
    },
    headerTop: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 8,
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    countText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 18,
        color: '#DBEAFE',
        marginBottom: 24,
        fontWeight: '500',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        paddingHorizontal: 20,
        height: 60,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
            },
            android: {
                elevation: 5,
            },
            web: {
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }
        }),
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 18,
        color: '#1E293B',
        fontWeight: '500',
        height: '100%',
    },
    container: {
        flex: 1,
        marginTop: 16,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    emptyIconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 16,
        color: '#64748B',
    },
    conditionBanner: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        marginBottom: 16,
    },
    conditionBannerText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        marginHorizontal: 20,
        marginBottom: 14,
    },
    warningText: {
        color: '#991B1B',
        fontSize: 13,
        fontWeight: '700',
        flex: 1,
    },
    recommendToggleRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 12,
    },
    recommendToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#2563EB',
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    recommendToggleActive: {
        backgroundColor: '#2563EB',
    },
    recommendToggleText: {
        color: '#2563EB',
        fontSize: 13,
        fontWeight: '700',
    },
    tarjetaEjercicio: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 24, 
        padding: 20, 
        marginBottom: 16,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
            },
            android: {
                elevation: 4,
            },
            web: {
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
            }
        }),
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    thumbnailContainer: {
        width: '100%',
        height: 200,
        position: 'relative',
        backgroundColor: '#0F172A',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(37, 99, 235, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 4,
        ...Platform.select({
            ios: {
                shadowColor: '#2563EB',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
            }
        }),
    },
    durationBadge: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
    },
    durationBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    categoryBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
    },
    categoryBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    cardContent: {
        padding: 20,
    },
    verVideoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563EB',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6,
    },
    verVideoText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    tarjetaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    tarjetaIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    tarjetaInfo: {
        flex: 1,
    },
    ejercicioNombre: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 6,
    },
    ejercicioDescripcion: {
        fontSize: 15,
        color: '#64748B',
        lineHeight: 22,
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 16,
    },
    ejercicioFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        gap: 6,
    },
    footerText: {
        fontSize: 14,
        color: '#475569',
        fontWeight: '600',
    },
    dificultad: {
        fontSize: 14,
        fontWeight: '700',
    },
    categoryScroll: {
        marginTop: 10,
        marginHorizontal: -24,
    },
    categoryContent: {
        paddingLeft: 24,
        paddingRight: 100,
        gap: 12,
        alignItems: 'center',
        paddingVertical: 12, // Give room for chips and shadows
    },
    categoryChip: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    categoryChipActive: {
        backgroundColor: '#FFFFFF',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
            web: {
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
            }
        }),
    },
    categoryChipText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#DBEAFE',
    },
    categoryChipTextActive: {
        color: '#1E3A8A',
    },
});