import { Stack, usePathname } from 'expo-router';
import { useWindowDimensions, Platform, View } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { sesionTerminada } from '../utils/api';

// Pantallas que se pueden ver sin haber iniciado sesión
const RUTAS_PUBLICAS = ['/', '/login'];

// Mismos fondos que hooks/useTheme.ts (claro / oscuro)
const FONDO_CLARO = '#F8FAFC';
const FONDO_OSCURO = '#0F172A';

export default function RootLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const pathname = usePathname();
  // En pantallas anchas el contenido se centra (máx. 1200 px); los costados toman
  // el color del tema para que no queden franjas blancas en modo oscuro
  const [fondo, setFondo] = useState(FONDO_CLARO);

  useEffect(() => {
    AsyncStorage.getItem('darkMode')
      .then((v) => setFondo(v === 'true' ? FONDO_OSCURO : FONDO_CLARO))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = fondo;
    }
  }, [fondo]);

  // Sin sesión no se muestran pantallas privadas: se vuelve al login con un aviso
  useEffect(() => {
    if (RUTAS_PUBLICAS.includes(pathname)) return;
    AsyncStorage.getItem('jwtToken')
      .then((token) => { if (!token) setTimeout(() => sesionTerminada(), 0); })
      .catch(() => {});
  }, [pathname]);

  // En la web, si se cierra sesión en otra pestaña, esta pestaña también vuelve al login
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const alCambiar = (e: StorageEvent) => {
      if (e.key === 'jwtToken' && !e.newValue && !RUTAS_PUBLICAS.includes(window.location.pathname)) {
        sesionTerminada();
      }
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log(
        '%c¡DETENTE!',
        'color: red; font-size: 50px; font-weight: bold; text-shadow: 1px 1px 2px black;'
      );
      console.log(
        '%c¡CUIDA TU CUENTA!',
        'color: #dc2626; font-size: 32px; font-weight: bold; background-color: #facc15; border: 8px solid #3730a3; border-radius: 12px; padding: 10px 20px; font-family: monospace;'
      );
      console.log(
        '%cSi usas esta consola, podrían robarte tu\ncuenta y datos personales.\nNo introduzcas códigos o scripts que no\ncomprendas.',
        'color: #ef4444; font-size: 16px; font-family: monospace;'
      );
    }
  }, []);

  return (
    <ThemeProvider value={{
      ...(fondo === FONDO_OSCURO ? DarkTheme : DefaultTheme),
      colors: { ...(fondo === FONDO_OSCURO ? DarkTheme : DefaultTheme).colors, background: fondo },
    }}>
    <View style={{ flex: 1, backgroundColor: fondo }}>
    <Stack 
      screenOptions={{ 
        headerShown: false,
        contentStyle: {
          maxWidth: isDesktop ? 1200 : '100%',
          alignSelf: 'center',
          width: '100%',
        }
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen 
        name="login" 
        options={{
          contentStyle: {
            maxWidth: '100%',
            width: '100%',
            alignSelf: 'stretch',
          }
        }}
      />
      <Stack.Screen name="consentimiento" />
      <Stack.Screen name="valoracion" />
      <Stack.Screen name="mis-datos" />
      <Stack.Screen name="cuidador" />
      <Stack.Screen name="home" />
      <Stack.Screen name="ejercicios" />
      <Stack.Screen name="estadisticas" />
      <Stack.Screen name="perfil" />
      <Stack.Screen name="detalle-ejercicio" />
      <Stack.Screen name="recordatorios" />
      <Stack.Screen 
        name="modal" 
        options={{ presentation: 'modal' }} 
      />
    </Stack>
    </View>
    </ThemeProvider>
  );
}