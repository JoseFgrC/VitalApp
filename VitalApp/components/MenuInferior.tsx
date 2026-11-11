import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { factorTamanoLetra } from '../utils/tamanoLetra';

// Barra inferior accesible (WCAG 2.2): etiquetas de 16 px, contraste ≥ 4.5:1,
// pestaña activa marcada con fondo y negritas (no solo con color) y áreas táctiles ≥ 48×48.
// Las rutas no cambian; solo los nombres visibles.
const ITEMS = [
  { nombre: 'Inicio', ruta: '/home', icono: (c: string, a: boolean) => <Ionicons name={a ? 'home' : 'home-outline'} size={26} color={c} /> },
  { nombre: 'Ejercicios', ruta: '/ejercicios', icono: (c: string) => <MaterialCommunityIcons name="dumbbell" size={26} color={c} /> },
  { nombre: 'Mi progreso', ruta: '/estadisticas', icono: (c: string, a: boolean) => <Ionicons name={a ? 'stats-chart' : 'stats-chart-outline'} size={26} color={c} /> },
  { nombre: 'Mi salud', ruta: '/enfermedades', icono: (c: string, a: boolean) => <Ionicons name={a ? 'heart' : 'heart-outline'} size={26} color={c} /> },
  { nombre: 'Perfil', ruta: '/perfil', icono: (c: string, a: boolean) => <Ionicons name={a ? 'person' : 'person-outline'} size={26} color={c} /> },
];

export default function MenuInferior() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  // Ampliación de «Tamaño de letra» (web). width es el ancho real de la pantalla, sin ampliar.
  const [factor, setFactor] = useState(factorTamanoLetra());
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const alCambiar = () => setFactor(factorTamanoLetra());
    window.addEventListener('tamanoLetra', alCambiar);
    return () => window.removeEventListener('tamanoLetra', alCambiar);
  }, []);
  const isDesktop = width >= 768;
  // Ancho real de cada botón; la etiqueta más larga de una palabra («Ejercicios») mide ~4.4 veces
  // el tamaño de letra. La letra crece con la ampliación, pero nunca baja de 16 px reales ni
  // excede lo que cabe sin partir la palabra.
  const anchoBoton = (isDesktop ? 560 : width) / ITEMS.length;
  const letraReal = Math.max(16, Math.min(16 * factor, (anchoBoton - 6) / 4.4));
  const letraCss = letraReal / factor;
  const angosto = letraReal * 4.6 > anchoBoton - 6;

  // Colores con contraste ≥ 4.5:1 sobre su fondo (claro: #FFFFFF / #DBEAFE; oscuro: #1E293B / #1E3A8A)
  const colorInactivo = colors.isDark ? '#CBD5E1' : '#475569';
  const colorActivo = colors.isDark ? '#FFFFFF' : '#1E3A8A';
  const fondoActivo = colors.isDark ? '#1E3A8A' : '#DBEAFE';

  return (
    <View
      style={[styles.container, angosto && styles.containerAngosto, isDesktop && styles.desktopContainer, { backgroundColor: colors.card, borderTopColor: colors.cardBorder }]}
      accessibilityRole="tablist"
    >
      {ITEMS.map((item) => {
        const activo = pathname === item.ruta;
        const color = activo ? colorActivo : colorInactivo;
        return (
          <TouchableOpacity
            key={item.ruta}
            style={[styles.menuItem, activo && { backgroundColor: fondoActivo }]}
            accessibilityRole="tab"
            accessibilityLabel={item.nombre}
            accessibilityState={{ selected: activo }}
            aria-selected={activo}
            onPress={() => router.replace(item.ruta as any)}
          >
            {item.icono(color, activo)}
            <Text style={[styles.menuText, angosto && styles.menuTextAngosto, { color, fontSize: letraCss, lineHeight: letraCss * 1.2 }, activo && styles.menuTextActivo]} numberOfLines={2}>
              {item.nombre}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'ios' ? 22 : 6,
    paddingTop: 6,
    paddingHorizontal: 4,
    gap: 2,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 8 },
      web: { boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)' },
    }),
  },
  containerAngosto: {
    paddingHorizontal: 0,
    gap: 0,
  },
  desktopContainer: {
    alignSelf: 'center',
    borderRadius: 30,
    marginBottom: 24,
    width: 560,
    left: '50%',
    right: 'auto',
    transform: [{ translateX: -280 }],
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...Platform.select({
      ios: { shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 12 },
      web: { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)' },
    }),
  },
  // flex: 1 reparte el ancho en partes iguales; minHeight/minWidth garantizan ≥ 48×48
  menuItem: {
    flex: 1,
    minWidth: 48,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderRadius: 16,
  },
  menuText: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  menuTextAngosto: {
    letterSpacing: -0.6,
  },
  menuTextActivo: {
    fontWeight: '800',
  },
});
