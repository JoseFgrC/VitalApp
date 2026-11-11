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
const CONDITION_OPTIONS = [
  'Diabetes',
  'Hipertensión',
  'Cáncer',
  'Problemas de corazón',
  'Artritis',
  'Osteoporosis',
  'Ninguna'
];

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

  const toggleCondition = (condition: string) => {
    if (condition === 'Ninguna') {
      setSelectedConditions(['Ninguna']);
      return;
    }

    setSelectedConditions((prev) => {
      if (prev.includes('Ninguna')) {
        return [condition];
      }

      if (prev.includes(condition)) {
        return prev.filter((item) => item !== condition);
      }

      return [...prev, condition];
    });
  };

  const guardarCondiciones = async () => {
    const condiciones = selectedConditions.length > 0 ? selectedConditions : ['Ninguna'];
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

  const renderConditionChip = (condition: string) => {
    const active = selectedConditions.includes(condition);
    return (
      <TouchableOpacity
        key={condition}
        style={[
          styles.conditionChip,
          active && { backgroundColor: colors.gradientStart, borderColor: colors.gradientStart }
        ]}
        onPress={() => toggleCondition(condition)}
        activeOpacity={0.8}
      >
        <Text style={[styles.conditionText, active && { color: '#FFF' }]}>{condition}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}> 
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.gradientStart} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
          <Text style={[styles.title, { color: colors.text }]}>Enfermedades</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Marca las condiciones de salud que aplican para adaptar tus ejercicios de forma más segura.</Text>

          <View style={styles.conditionsContainer}>
            {CONDITION_OPTIONS.map(renderConditionChip)}
          </View>

          <View style={styles.infoBox}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>¿Por qué es importante?</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>Seleccionar tus condiciones permite que la pantalla de inicio muestre rutinas y ejercicios más adecuados para ti.</Text>
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.gradientStart }]} onPress={guardarCondiciones} activeOpacity={0.8}>
            <Ionicons name="save" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Guardar condiciones</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.backButton, { borderColor: colors.cardBorder }]} onPress={() => router.push('/home')} activeOpacity={0.8}>
            <Text style={[styles.backButtonText, { color: colors.text }]}>Volver a inicio</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <MenuInferior />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 20,
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
    borderRadius: 24,
    paddingVertical: 16,
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  backButton: {
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
