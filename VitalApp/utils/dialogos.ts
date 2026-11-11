import { Alert, Platform } from 'react-native';

// En react-native-web Alert.alert no muestra nada; en web se usan los diálogos del navegador.

export function avisar(titulo: string, mensaje = '', onOk?: () => void) {
    if (Platform.OS === 'web') {
        window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
        onOk?.();
    } else {
        Alert.alert(titulo, mensaje, [{ text: 'Entendido', onPress: onOk }]);
    }
}

export function confirmar(titulo: string, mensaje: string, textoConfirmar: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
        if (window.confirm(`${titulo}\n\n${mensaje}`)) onConfirm();
    } else {
        Alert.alert(titulo, mensaje, [
            { text: 'Cancelar', style: 'cancel' },
            { text: textoConfirmar, style: 'destructive', onPress: onConfirm },
        ]);
    }
}
