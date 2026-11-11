import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Text, Linking, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface VideoPlayerProps {
    videoId: string;
    playing?: boolean;
    onEnd?: () => void;
    onProgress?: (seconds: number) => void;
    onReady?: () => void;
}

// ---------- Web: iframe nativo de YouTube ----------
function VideoPlayerWeb({ videoId, playing = true, onReady, onEnd, onProgress }: VideoPlayerProps) {
    const cleanId = getCleanId(videoId);
    const [error, setError] = useState(false);
    const iframeRef = useRef<any>(null);

    useEffect(() => {
        // Llamar onReady tras un breve delay (el iframe tarda en montarse)
        const t = setTimeout(() => { if (onReady) onReady(); }, 800);
        return () => clearTimeout(t);
    }, []);

    // Pausa / Continuar desde el botón propio de la app (YouTube IFrame API)
    useEffect(() => {
        try {
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: playing ? 'playVideo' : 'pauseVideo', args: [] }),
                '*'
            );
        } catch (_) {}
    }, [playing]);

    // Rastrear progreso vía postMessage de la YouTube IFrame API
    useEffect(() => {
        if (!onProgress) return;
        let interval: any;
        const listener = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data?.info?.currentTime !== undefined) {
                    onProgress(data.info.currentTime);
                }
                if (data?.event === 'onStateChange' && data?.info === 0 && onEnd) {
                    onEnd();
                }
            } catch (_) {}
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('message', listener);
            // Polling de respaldo cada 2s
            interval = setInterval(() => {
                try {
                    iframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'getVideoData', args: [] }),
                        '*'
                    );
                } catch (_) {}
            }, 2000);
        }
        return () => {
            if (typeof window !== 'undefined') window.removeEventListener('message', listener);
            clearInterval(interval);
        };
    }, [onProgress, onEnd]);

    if (!cleanId || error) {
        return (
            <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color="#FF3B30" />
                <Text style={styles.errorText}>Video no disponible</Text>
                <TouchableOpacity
                    style={styles.openYoutubeBtn}
                    onPress={() => { if (typeof window !== 'undefined') window.open(`https://www.youtube.com/watch?v=${cleanId || videoId}`, '_blank'); }}
                >
                    <Ionicons name="logo-youtube" size={20} color="#FFFFFF" />
                    <Text style={styles.openYoutubeText}>Ver en YouTube</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const embedUrl = `https://www.youtube.com/embed/${cleanId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;

    return (
        <View style={[styles.container, { height: 220 }]}>
            {/* @ts-ignore — iframe solo existe en web */}
            <iframe
                ref={iframeRef}
                src={embedUrl}
                width="100%"
                height="220"
                style={{ border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                title="Exercise Video"
                onError={() => setError(true)}
            />
        </View>
    );
}

// ---------- Mobile: react-native-youtube-iframe ----------
function VideoPlayerNative({ videoId, playing = true, onEnd, onProgress, onReady }: VideoPlayerProps) {
    // Importación diferida para evitar errores en web
    const YoutubePlayer = require('react-native-youtube-iframe').default;
    const cleanId = getCleanId(videoId);
    const playerRef = useRef<any>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);

    const onReadyInternal = useCallback(() => {
        setCargando(false);
        if (onReady) onReady();
    }, [onReady]);

    const onError = useCallback((e: any) => {
        const errCode = String(e);
        if (cleanId.length !== 11 || errCode === '150' || errCode === '101' || errCode === '100') {
            setError(true);
        }
        setCargando(false);
    }, [cleanId]);

    const onStateChange = useCallback((state: string) => {
        if (state === 'ended' && onEnd) onEnd();
    }, [onEnd]);

    useEffect(() => {
        let interval: any;
        if (playing && !cargando && !error) {
            interval = setInterval(async () => {
                if (playerRef.current && onProgress) {
                    try {
                        const currentTime = await playerRef.current.getCurrentTime();
                        onProgress(currentTime);
                    } catch (_) {}
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [playing, cargando, error, onProgress]);

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color="#FF3B30" />
                <Text style={styles.errorText}>Video no disponible</Text>
                <TouchableOpacity
                    style={styles.openYoutubeBtn}
                    onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${cleanId || videoId}`)}
                >
                    <Ionicons name="logo-youtube" size={20} color="#FFFFFF" />
                    <Text style={styles.openYoutubeText}>Ver en YouTube</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {cargando && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF3B30" />
                    <Text style={styles.loadingText}>Cargando video...</Text>
                </View>
            )}
            <YoutubePlayer
                ref={playerRef}
                height={220}
                width={width}
                videoId={cleanId}
                play={playing}
                forceAndroidAutoplay={true}
                baseUrl="https://www.youtube.com"
                onReady={onReadyInternal}
                onError={onError}
                onChangeState={onStateChange}
                volume={50}
                playbackRate={1}
                webViewProps={{
                    allowsFullscreenVideo: true,
                    androidLayerType: 'hardware',
                }}
            />
        </View>
    );
}

// ---------- Utilidad compartida ----------
function getCleanId(id: string): string {
    if (!id) return '';
    const trimmedId = id.trim();
    if (trimmedId.length === 11) return trimmedId;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = trimmedId.match(regExp);
    if (match && match[2].length === 11) return match[2];
    if (trimmedId.includes('v=')) return trimmedId.split('v=')[1].split('&')[0].substring(0, 11);
    if (trimmedId.includes('youtu.be/')) return trimmedId.split('youtu.be/')[1].split('?')[0].substring(0, 11);
    if (trimmedId.includes('embed/')) return trimmedId.split('embed/')[1].split('?')[0].substring(0, 11);
    return trimmedId;
}

// ---------- Exportación principal ----------
export default function VideoPlayer(props: VideoPlayerProps) {
    if (Platform.OS === 'web') {
        return <VideoPlayerWeb {...props} />;
    }
    return <VideoPlayerNative {...props} />;
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#000000',
    },
    loadingContainer: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        zIndex: 10,
    },
    loadingText: {
        marginTop: 10,
        color: '#FFFFFF',
        fontSize: 18,
    },
    errorContainer: {
        height: 220,
        backgroundColor: '#1A1A1A',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    errorText: {
        color: '#FF3B30',
        fontSize: 18,
        marginBottom: 8,
    },
    openYoutubeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF0000',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    openYoutubeText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 18,
    },
});
