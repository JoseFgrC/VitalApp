import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Alert,
  Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MenuInferior from '../components/MenuInferior';
import { useTheme } from '../hooks/useTheme';
import { API_URL } from '../constants/config';
import { fetchSeguro } from '../utils/api';
import { cargarCondiciones as cargarCondicionesUsuario } from '../utils/condiciones';

import { avisar } from '../utils/dialogos';
// "valor" es lo que se guarda (no cambia: lo usan utils/condiciones.ts y los datos existentes);
// "nombre" y "detalle" son el texto sencillo que ve la persona
const CONDICIONES_SALUD = [
  { valor: 'Hipertensión', nombre: 'Presión alta', detalle: 'También llamada hipertensión', icono: 'pulse' },
  { valor: 'Problemas de corazón', nombre: 'Problemas del corazón', detalle: 'Por ejemplo, infarto, arritmia o insuficiencia', icono: 'heart' },
  { valor: 'Diabetes', nombre: 'Azúcar alta en la sangre', detalle: 'También llamada diabetes', icono: 'water' },
  { valor: 'Artritis', nombre: 'Dolor e inflamación de articulaciones', detalle: 'También llamada artritis', icono: 'hand-left' },
  { valor: 'Osteoporosis', nombre: 'Huesos frágiles', detalle: 'También llamada osteoporosis', icono: 'body' },
  { valor: 'Cáncer', nombre: 'Cáncer', detalle: 'En tratamiento o en recuperación', icono: 'medkit' },
];
// Condiciones del corazón y la circulación: se recomienda consultar al médico (RD06)
const CONDICIONES_CARDIACAS = ['Hipertensión', 'Problemas de corazón'];

export default function EnfermedadesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      cargarCondiciones();
    }, [])
  );

  const cargarCondiciones = async () => {
    setLoading(true);
    try {
      const idUsuario = await AsyncStorage.getItem('userId');
      setUserId(idUsuario);
      // Se leen de la BD para mostrar las condiciones de esta cuenta (no las de otra sesión)
      setSelectedConditions(await cargarCondicionesUsuario());
    } catch (error) {
      console.log('Error cargando condiciones:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sí agrega la condición; No la quita. Todas en No equivale a "Ninguna".
  const responder = (valor: string, tiene: boolean) => {
    setSelectedConditions((prev) => {
      const sinNinguna = prev.filter((c) => c !== 'Ninguna');
      if (tiene) return sinNinguna.includes(valor) ? sinNinguna : [...sinNinguna, valor];
      return sinNinguna.filter((c) => c !== valor);
    });
  };
  const tieneCardiaca = selectedConditions.some((c) => CONDICIONES_CARDIACAS.includes(c));

  const guardarCondiciones = async () => {
    const elegidas = selectedConditions.filter((c) => c !== 'Ninguna');
    const condiciones = elegidas.length > 0 ? elegidas : ['Ninguna'];
    try {
      await AsyncStorage.setItem('userConditions', JSON.stringify(condiciones));
      if (userId) {
        try {
          const res = await fetchSeguro(`${API_URL}/user/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ condiciones_medicas: condiciones.join(', ') })
          });
          const data = await res.json();
          // RN01: sin consentimiento el backend no guarda datos de salud
          if (!data.success) {
            avisar('No se guardó', data.message || 'No se pudieron guardar tus condiciones.');
            return;
          }
        } catch (error) {
          console.log('No se pudo sincronizar condiciones con el backend:', error);
        }
      }
      if (Platform.OS === 'web') {
        window.alert('Tus condiciones de salud han sido actualizadas.');
        router.push('/home');
      } else {
        Alert.alert(
          'Guardado', 
          'Tus condiciones de salud han sido actualizadas.',
          [{ text: 'OK', onPress: () => router.push('/home') }]
        );
      }
    } catch (error) {
      console.log('Error guardando condiciones:', error);
      avisar('Error', 'No se pudieron guardar tus condiciones. Intenta de nuevo.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Mi salud</Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            Responde Sí o No. Así te recomendaremos ejercicios más seguros para ti.
          </Text>

          {/* Privacidad: el cuidador no ve estos datos; el admin sí puede (server.js /api/admin/usuarios) */}
          <View style={[styles.privacidad, { backgroundColor: colors.isDark ? '#1E293B' : '#F1F5F9' }]}>
            <Ionicons name="lock-closed" size={26} color={colors.text} />
            <Text style={[styles.privacidadTexto, { color: colors.text }]}>
              Tu cuidador no ve esta información; se guarda protegida.
            </Text>
          </View>

          {CONDICIONES_SALUD.map((c) => {
            const tiene = selectedConditions.includes(c.valor);
            return (
              <View key={c.valor} style={[styles.fila, { borderColor: colors.cardBorder }]} accessibilityRole="radiogroup" accessibilityLabel={c.nombre}>
                <View style={styles.filaEncabezado}>
                  <Ionicons name={c.icono as any} size={28} color={colors.isDark ? '#93C5FD' : '#1D4ED8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filaNombre, { color: colors.text }]}>{c.nombre}</Text>
                    <Text style={[styles.filaDetalle, { color: colors.textSecondary }]}>{c.detalle}</Text>
                  </View>
                </View>
                <View style={styles.filaBotones}>
                  {[true, false].map((opcion) => {
                    const elegido = tiene === opcion;
                    return (
                      <TouchableOpacity
                        key={String(opcion)}
                        style={[
                          styles.botonSiNo,
                          { borderColor: colors.isDark ? '#64748B' : '#94A3B8', backgroundColor: colors.card },
                          elegido && (opcion ? styles.botonSiElegido : styles.botonNoElegido),
                        ]}
                        onPress={() => responder(c.valor, opcion)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: elegido }}
                        aria-checked={elegido}
                        accessibilityLabel={`${c.nombre}: ${opcion ? 'Sí' : 'No'}`}
                      >
                        {elegido && <Ionicons name="checkmark" size={26} color="#FFFFFF" />}
                        <Text style={[styles.textoSiNo, { color: elegido ? '#FFFFFF' : colors.text }]}>{opcion ? 'Sí' : 'No'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* RD06: ante condiciones del corazón o presión alta, consultar al médico */}
          {tieneCardiaca && (
            <View style={styles.avisoMedico} accessibilityRole="alert">
              <Ionicons name="medical" size={30} color="#7F1D1D" />
              <Text style={styles.avisoMedicoTexto}>
                Por tu presión o tu corazón, consulta a tu médico antes de hacer ejercicio y pregúntale qué esfuerzo es seguro para ti. Si sientes dolor en el pecho, mareo o falta de aire, detente.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveButton} onPress={guardarCondiciones} activeOpacity={0.8} accessibilityRole="button">
            <Ionicons name="save" size={28} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Guardar mis respuestas</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.backButton, { borderColor: colors.cardBorder }]} onPress={() => router.push('/home')} activeOpacity={0.8} accessibilityRole="button">
            <Text style={[styles.backButtonText, { color: colors.text }]}>Volver a inicio</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <MenuInferior />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  privacidad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginBottom: 16 },
  privacidadTexto: { flex: 1, fontSize: 18, lineHeight: 25, fontWeight: '600' },
  fila: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  filaEncabezado: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  filaNombre: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  filaDetalle: { fontSize: 18, lineHeight: 24 },
  filaBotones: { flexDirection: 'row', gap: 12 },
  botonSiNo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 60, borderRadius: 16, borderWidth: 2,
  },
  botonSiElegido: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  botonNoElegido: { backgroundColor: '#334155', borderColor: '#334155' },
  textoSiNo: { fontSize: 22, fontWeight: '800' },
  avisoMedico: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 16,
    backgroundColor: '#FEE2E2', borderWidth: 2, borderColor: '#FCA5A5', marginBottom: 16,
  },
  avisoMedicoTexto: { flex: 1, fontSize: 18, lineHeight: 26, color: '#7F1D1D', fontWeight: '700' },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
    marginBottom: 16,
  },
  conditionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  conditionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  infoBox: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: '#047857',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 2,
    marginTop: 12,
  },
  backButtonText: {
    fontSize: 19,
    fontWeight: '700',
  },
});
