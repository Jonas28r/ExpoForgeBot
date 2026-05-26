import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, Modal, 
  StatusBar, Alert, Switch, Image, Dimensions, AppState, TextInput 
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as ScreenCapture from 'expo-screen-capture';
// SOLUCIÓN 1: Usar la API legacy de FileSystem que Expo 54 pide
import * as FileSystem from 'expo-file-system/legacy'; 
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const COLUMN_SIZE = width / 3 - 15;

const VAULT_DIR = `${FileSystem.documentDirectory}.boveda_secreta/`;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [antiScreenshot, setAntiScreenshot] = useState(false);
  const [faceDownLock, setFaceDownLock] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [vaultData, setVaultData] = useState({ items: [] });
  
  const [secretPin, setSecretPin] = useState(null);
  const [isSetupModalVisible, setIsSetupModalVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

  // SOLUCIÓN 2: Bandera para saber si estamos abriendo la galería a propósito
  const isPickingMedia = useRef(false);

  useEffect(() => {
    const inicializarApp = async () => {
      try {
        const pinGuardado = await AsyncStorage.getItem('@secret_pin');
        if (pinGuardado) {
          setSecretPin(pinGuardado);
        } else {
          setIsSetupModalVisible(true);
        }

        const savedData = await AsyncStorage.getItem('@vault_db');
        if (savedData) setVaultData(JSON.parse(savedData));

        const savedAntiScreenshot = await AsyncStorage.getItem('@setting_screenshot');
        const savedFaceDown = await AsyncStorage.getItem('@setting_facedown');
        if (savedAntiScreenshot) setAntiScreenshot(JSON.parse(savedAntiScreenshot));
        if (savedFaceDown) setFaceDownLock(JSON.parse(savedFaceDown));

      } catch (error) {
        console.error("Error inicializando:", error);
      }
    };
    inicializarApp();
  }, []);

  // SEGURIDAD: BLOQUEO AL MINIMIZAR LA APP
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // Solo bloqueamos si va a segundo plano Y NO estamos eligiendo una foto
      if (nextAppState.match(/inactive|background/) && !isPickingMedia.current) {
        setIsAuthenticated(false);
        setSettingsVisible(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const guardarDatosEnMemoria = async (nuevosDatos) => {
    setVaultData(nuevosDatos);
    await AsyncStorage.setItem('@vault_db', JSON.stringify(nuevosDatos));
  };

  const configurarNuevoPin = async () => {
    if (newPinInput.length < 4) {
      Alert.alert("Error", "El PIN debe tener al menos 4 números.");
      return;
    }
    await AsyncStorage.setItem('@secret_pin', newPinInput);
    setSecretPin(newPinInput);
    setIsSetupModalVisible(false);
    setNewPinInput('');
    Alert.alert("Éxito", "PIN configurado. Úsalo en la calculadora y presiona '=' para entrar.");
  };

  useEffect(() => {
    if (antiScreenshot) ScreenCapture.preventScreenCaptureAsync();
    else ScreenCapture.allowScreenCaptureAsync();
    AsyncStorage.setItem('@setting_screenshot', JSON.stringify(antiScreenshot));
  }, [antiScreenshot]);

  useEffect(() => {
    let subscription;
    if (faceDownLock) {
      subscription = Accelerometer.addListener(({ z }) => {
        if (z < -0.85) setIsAuthenticated(false);
      });
      Accelerometer.setUpdateInterval(300);
    }
    AsyncStorage.setItem('@setting_facedown', JSON.stringify(faceDownLock));
    return () => subscription && subscription.remove();
  }, [faceDownLock]);

  const ocultarNuevoArchivo = async () => {
    const pickerPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const libraryPermission = await MediaLibrary.requestPermissionsAsync();

    if (!pickerPermission.granted || !libraryPermission.granted) {
      Alert.alert("Permisos", "Se requieren permisos para acceder a la galería.");
      return;
    }

    // Le decimos a la app que vamos a abrir la galería, que NO cierre la bóveda
    isPickingMedia.current = true;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
    });

    // Ya regresamos de la galería, reactivamos la seguridad
    isPickingMedia.current = false;

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const assetOriginal = result.assets[0];
      const nuevoNombre = `enc_${Date.now()}.dat`; 
      const destinoOculto = `${VAULT_DIR}${nuevoNombre}`;

      try {
        const folderInfo = await FileSystem.getInfoAsync(VAULT_DIR);
        if (!folderInfo.exists) {
          await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(`${VAULT_DIR}.nomedia`, '');

        await FileSystem.copyAsync({
          from: assetOriginal.uri,
          to: destinoOculto,
        });

        const nuevosItems = [...vaultData.items, { 
          id: nuevoNombre, name: assetOriginal.uri.split('/').pop(), uri: destinoOculto 
        }];
        await guardarDatosEnMemoria({ items: nuevosItems });

        if (assetOriginal.assetId) {
          try {
            await MediaLibrary.deleteAssetsAsync([assetOriginal.assetId]);
          } catch (e) {
            console.log("No se pudo borrar automático de la galería pública.");
          }
        }
      } catch (error) {
        Alert.alert("Error Crítico", `Detalle técnico: ${error.message}`);
      }
    }
  };

  const eliminarArchivoFisico = async (item) => {
    Alert.alert("Eliminar", "¿Borrar permanentemente este archivo de la bóveda?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            await FileSystem.deleteAsync(item.uri, { idempotent: true });
            const filtrados = vaultData.items.filter(i => i.id !== item.id);
            await guardarDatosEnMemoria({ items: filtrados });
          } catch (error) {
            Alert.alert("Error", "No se pudo borrar el archivo del almacenamiento.");
          }
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      
      {isAuthenticated ? (
        <VaultScreen 
          vaultData={vaultData}
          setSettingsVisible={setSettingsVisible}
          onAddFile={ocultarNuevoArchivo}
          onDeleteFile={eliminarArchivoFisico}
          onLogout={() => setIsAuthenticated(false)}
        />
      ) : (
        <CalcScreen onAuth={() => setIsAuthenticated(true)} secretPin={secretPin} />
      )}

      <Modal visible={isSetupModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configura tu PIN secreto</Text>
            <Text style={styles.settingSubtext}>Este será el código que ingresarás en la calculadora para abrir la bóveda.</Text>
            <TextInput 
              style={styles.inputPin}
              keyboardType="number-pad"
              maxLength={8}
              secureTextEntry
              placeholder="Ej. 1234"
              placeholderTextColor="#64748b"
              value={newPinInput}
              onChangeText={setNewPinInput}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={configurarNuevoPin}>
              <Text style={styles.primaryBtnText}>Guardar PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSettingsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajustes de Seguridad</Text>
            
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.settingText}>Anti-Screenshot</Text>
                <Text style={styles.settingSubtext}>Bloquea capturas de pantalla.</Text>
              </View>
              <Switch value={antiScreenshot} onValueChange={setAntiScreenshot} trackColor={{ false: '#262626', true: '#ffffff' }} thumbColor="#a3a3a3"/>
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.settingText}>Sensor Panic Lock</Text>
                <Text style={styles.settingSubtext}>Bloquea al voltear el teléfono.</Text>
              </View>
              <Switch value={faceDownLock} onValueChange={setFaceDownLock} trackColor={{ false: '#262626', true: '#ffffff' }} thumbColor="#a3a3a3"/>
            </View>

            <TouchableOpacity 
              style={styles.secondaryBtn} 
              onPress={() => {
                setNewPinInput('');
                setIsSetupModalVisible(true);
                setSettingsVisible(false);
              }}
            >
              <Text style={styles.secondaryBtnText}>Cambiar PIN Secreto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.primaryBtnText}>Cerrar Ajustes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CalcScreen({ onAuth, secretPin }) {
  const [display, setDisplay] = useState('');

  const pressBotón = (val) => {
    if (val === 'C') {
      setDisplay('');
    } else if (val === '=') {
      if (display === secretPin && secretPin !== null) {
        setDisplay('');
        onAuth();
      } else {
        try {
          const resultado = eval(display.replace('×', '*').replace('÷', '/'));
          setDisplay(String(resultado));
        } catch {
          setDisplay('Error');
        }
      }
    } else {
      setDisplay(prev => prev + val);
    }
  };

  const botones = [
    ['C', '(', ')', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '', '=']
  ];

  return (
    <View style={styles.calcContainer}>
      <View style={styles.calcHeader}>
        <Text style={styles.calcHeaderText}>Calculadora</Text>
      </View>
      
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1}>{display || '0'}</Text>
      </View>

      <View style={styles.keyboardContainer}>
        {botones.map((row, rIdx) => (
          <View key={rIdx} style={styles.calcRow}>
            {row.map((b, bIdx) => (
              b === '' ? <View key={bIdx} style={styles.calcButtonEmpty} /> :
              <TouchableOpacity 
                key={bIdx} 
                style={[
                  styles.calcButton, 
                  b === '=' ? { backgroundColor: '#e5e5e5' } : 
                  ['÷','×','-','+','C'].includes(b) ? { backgroundColor: '#171717' } : {}
                ]} 
                onPress={() => pressBotón(b)}
              >
                <Text style={[
                  styles.calcButtonText,
                  b === '=' ? { color: '#000000' } : 
                  ['÷','×','-','+','C'].includes(b) ? { color: '#a3a3a3' } : {}
                ]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function VaultScreen({ vaultData, setSettingsVisible, onAddFile, onDeleteFile, onLogout }) {
  return (
    <View style={styles.vaultContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bóveda Secreta</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setSettingsVisible(true)}>
            <Text style={{ color: '#fff', fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onLogout}>
            <Text style={{ color: '#ff4444', fontSize: 18 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {vaultData.items.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Sin archivos protegidos</Text>
          <Text style={styles.emptySubtext}>Toca el botón [+] para encriptar fotos o videos</Text>
        </View>
      ) : (
        <FlatList 
          data={vaultData.items}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10 }}
          renderItem={({ item }) => (
            <View style={styles.fileCard}>
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              <TouchableOpacity style={styles.deleteBadge} onPress={() => onDeleteFile(item)}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={onAddFile}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  calcContainer: { flex: 1, backgroundColor: '#050505' },
  calcHeader: { paddingTop: 60, paddingHorizontal: 25, alignItems: 'center' },
  calcHeaderText: { color: '#404040', fontSize: 18, fontWeight: '500', letterSpacing: 1 },
  displayContainer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 30, paddingBottom: 30 },
  displayText: { color: '#ffffff', fontSize: 70, fontWeight: '200', textAlign: 'right' },
  keyboardContainer: { paddingHorizontal: 15, paddingBottom: 40 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  calcButton: { width: width/4 - 20, height: width/4 - 20, borderRadius: Math.round(width/4), backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#171717' },
  calcButtonEmpty: { width: width/4 - 20, height: width/4 - 20 },
  calcButtonText: { color: '#ffffff', fontSize: 28, fontWeight: '300' },
  vaultContainer: { flex: 1, backgroundColor: '#050505' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#171717' },
  headerTitle: { fontSize: 22, fontWeight: '600', color: '#ffffff', letterSpacing: 0.5 },
  iconButton: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#171717' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#a3a3a3', fontSize: 16, fontWeight: '500', textAlign: 'center' },
  emptySubtext: { color: '#525252', fontSize: 14, textAlign: 'center', marginTop: 10 },
  fileCard: { width: COLUMN_SIZE, height: COLUMN_SIZE, margin: 5, borderRadius: 8, backgroundColor: '#171717', overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
  deleteBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', bottom: 40, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabText: { color: '#000000', fontSize: 32, fontWeight: '300', marginTop: -4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#0a0a0a', padding: 25, borderRadius: 16, borderWidth: 1, borderColor: '#262626' },
  modalTitle: { fontSize: 20, color: '#ffffff', fontWeight: '600', marginBottom: 15 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#171717' },
  settingText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
  settingSubtext: { color: '#737373', fontSize: 12, marginTop: 4 },
  inputPin: { backgroundColor: '#171717', color: '#ffffff', fontSize: 20, padding: 15, borderRadius: 10, textAlign: 'center', marginVertical: 20, borderWidth: 1, borderColor: '#262626' },
  primaryBtn: { marginTop: 15, backgroundColor: '#ffffff', padding: 15, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#000000', fontWeight: '600', fontSize: 15 },
  secondaryBtn: { marginTop: 25, backgroundColor: '#171717', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#262626' },
  secondaryBtnText: { color: '#ffffff', fontWeight: '500', fontSize: 15 }
});
