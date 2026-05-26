import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, Modal, 
  StatusBar, Alert, Switch, Image, Dimensions, AppState, TextInput 
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as ScreenCapture from 'expo-screen-capture';
import * as FileSystem from 'expo-file-system/legacy'; 
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const VAULT_DIR = `${FileSystem.documentDirectory}.ghost_vault/`;
const BTN_SIZE = width * 0.175; // Tamaño de botón estilizado y más compacto

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [antiScreenshot, setAntiScreenshot] = useState(false);
  const [faceDownLock, setFaceDownLock] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  
  // Bóveda dinámica completamente libre para el usuario
  const [vaultData, setVaultData] = useState([]);
  
  const [currentFolderId, setCurrentFolderId] = useState(null); 
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [secretPin, setSecretPin] = useState(null);
  const [isSetupModalVisible, setIsSetupModalVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

  // ESCUDO TOTAL: Bloquea cualquier intento de desautenticación deliberada
  const isPickingMedia = useRef(false);

  useEffect(() => {
    const inicializarBoveda = async () => {
      try {
        const pinGuardado = await AsyncStorage.getItem('@secret_pin');
        if (pinGuardado) setSecretPin(pinGuardado);
        else setIsSetupModalVisible(true);

        const datosGuardados = await AsyncStorage.getItem('@vault_folders_v4');
        if (datosGuardados) setVaultData(JSON.parse(datosGuardados));

        const savedAntiScreenshot = await AsyncStorage.getItem('@setting_screenshot');
        const savedFaceDown = await AsyncStorage.getItem('@setting_facedown');
        if (savedAntiScreenshot) setAntiScreenshot(JSON.parse(savedAntiScreenshot));
        if (savedFaceDown) setFaceDownLock(JSON.parse(savedFaceDown));

      } catch (error) {
        console.error("Error al inicializar:", error);
      }
    };
    inicializarBoveda();
  }, []);

  // Control de estado de la aplicación con escudo blindado
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState.match(/inactive|background/)) {
        if (isPickingMedia.current) {
          // Si estamos eligiendo fotos, ignoramos por completo el cierre de fondo
          return;
        }
        setIsAuthenticated(false);
        setSettingsVisible(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const guardarEstructura = async (nuevosDatos) => {
    setVaultData(nuevosDatos);
    await AsyncStorage.setItem('@vault_folders_v4', JSON.stringify(nuevosDatos));
  };

  const registrarPin = async () => {
    if (newPinInput.length < 4) {
      Alert.alert("Error", "El código debe tener mínimo 4 números.");
      return;
    }
    await AsyncStorage.setItem('@secret_pin', newPinInput);
    setSecretPin(newPinInput);
    setIsSetupModalVisible(false);
    setNewPinInput('');
  };

  const crearCarpeta = async () => {
    if (newFolderName.trim() === '') return;
    const nuevaCarpeta = {
      id: `folder_${Date.now()}`,
      name: newFolderName,
      items: []
    };
    const nuevaEstructura = [...vaultData, nuevaCarpeta];
    await guardarEstructura(nuevaEstructura);
    setNewFolderName('');
    setIsFolderModalVisible(false);
  };

  useEffect(() => {
    if (antiScreenshot) ScreenCapture.preventScreenCaptureAsync();
    else ScreenCapture.allowScreenCaptureAsync();
    AsyncStorage.setItem('@setting_screenshot', JSON.stringify(antiScreenshot));
  }, [antiScreenshot]);

  // ESCUDO DEL ACELERÓMETRO: Verificación dinámica en tiempo real
  useEffect(() => {
    let subscription;
    if (faceDownLock && isAuthenticated) {
      subscription = Accelerometer.addListener(({ z }) => {
        // Si el escudo está activo, el sensor no puede bloquear la pantalla
        if (!isPickingMedia.current && z < -0.85) {
          setIsAuthenticated(false);
        }
      });
      Accelerometer.setUpdateInterval(300);
    }
    AsyncStorage.setItem('@setting_facedown', JSON.stringify(faceDownLock));
    return () => subscription && subscription.remove();
  }, [faceDownLock, isAuthenticated]);

  const importarArchivoMagico = async () => {
    if (!currentFolderId) return;

    // Levantar el escudo antes de invocar cualquier interfaz nativa del teléfono
    isPickingMedia.current = true; 

    try {
      const pickerPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const mediaPermission = await MediaLibrary.requestPermissionsAsync();

      if (!pickerPermission.granted || !mediaPermission.granted) {
        Alert.alert("Permiso Requerido", "Necesitamos acceso para ocultar tus fotos de forma profesional.");
        isPickingMedia.current = false;
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assetSeleccionado = result.assets[0];
        const nombreEncriptado = `enc_${Date.now()}.dat`; 
        const rutaDestino = `${VAULT_DIR}${nombreEncriptado}`;

        const folderInfo = await FileSystem.getInfoAsync(VAULT_DIR);
        if (!folderInfo.exists) {
          await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(`${VAULT_DIR}.nomedia`, '');

        // Mover a la zona segura oculta
        await FileSystem.copyAsync({
          from: assetSeleccionado.uri,
          to: rutaDestino,
        });

        const carpetasActualizadas = vaultData.map(folder => {
          if (folder.id === currentFolderId) {
            return {
              ...folder,
              items: [...folder.items, { 
                id: nombreEncriptado, 
                uri: rutaDestino, 
                width: assetSeleccionado.width, 
                height: assetSeleccionado.height,
                assetId: assetSeleccionado.assetId
              }]
            };
          }
          return folder;
        });

        await guardarEstructura(carpetasActualizadas);

        // BORRADO SEGURO
        if (assetSeleccionado.assetId) {
          try {
            await MediaLibrary.deleteAssetsAsync([assetSeleccionado.assetId]);
          } catch (e) {
            console.log("Bypass de eliminación silenciosa nativa activa.");
          }
        }
      }
    } catch (error) {
      Alert.alert("Error de proceso", error.message);
    } {
      // Mantenemos el escudo levantado un instante extra para dar estabilidad al regreso de la app
      setTimeout(() => { isPickingMedia.current = false; }, 2000);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E14" />
      
      {isAuthenticated ? (
        <VaultScreen 
          vaultData={vaultData}
          currentFolderId={currentFolderId}
          setCurrentFolderId={setCurrentFolderId}
          setSettingsVisible={setSettingsVisible}
          setIsFolderModalVisible={setIsFolderModalVisible}
          onAddFile={importarArchivoMagico}
          onLogout={() => setIsAuthenticated(false)}
        />
      ) : (
        <CalcScreen onAuth={() => setIsAuthenticated(true)} secretPin={secretPin} />
      )}

      {/* MODAL CREAR CARPETA */}
      <Modal visible={isFolderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nueva Carpeta</Text>
            <TextInput 
              style={styles.inputDark} 
              placeholder="Nombre de la carpeta (ej. hana)" 
              placeholderTextColor="#475569"
              value={newFolderName} 
              onChangeText={setNewFolderName}
            />
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#1E293B', flex: 0.48}]} onPress={() => setIsFolderModalVisible(false)}>
                <Text style={styles.primaryBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, {flex: 0.48}]} onPress={crearCarpeta}>
                <Text style={styles.primaryBtnText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CONFIGURACIÓN PIN */}
      <Modal visible={isSetupModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Código de Acceso Inicial</Text>
            <TextInput 
              style={[styles.inputDark, {textAlign: 'center', fontSize: 18, letterSpacing: 4}]} 
              keyboardType="number-pad" maxLength={8} secureTextEntry
              placeholder="Crea tu PIN secreto" placeholderTextColor="#475569"
              value={newPinInput} onChangeText={setNewPinInput}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={registrarPin}>
              <Text style={styles.primaryBtnText}>Confirmar PIN de Seguridad</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL AJUSTES */}
      <Modal visible={isSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajustes de Privacidad</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Prevenir Capturas de Pantalla</Text>
              <Switch value={antiScreenshot} onValueChange={setAntiScreenshot} trackColor={{ true: '#4F46E5' }} />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Panic Lock (Bloqueo al Voltear)</Text>
              <Switch value={faceDownLock} onValueChange={setFaceDownLock} trackColor={{ true: '#4F46E5' }} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.primaryBtnText}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- RENDERS MINIMALISTAS (DISEÑO CORPORATIVO SLIM) ---

function CalcScreen({ onAuth, secretPin }) {
  const [display, setDisplay] = useState('');

  const pressBotón = (val) => {
    if (val === 'C') setDisplay('');
    else if (val === '=') {
      if (display === secretPin && secretPin !== null) {
        setDisplay('');
        onAuth();
      } else {
        try { setDisplay(String(eval(display.replace('×', '*').replace('÷', '/')))); } 
        catch { setDisplay('0'); }
      }
    } else setDisplay(prev => prev + val);
  };

  const botones = [['C','(',')','÷'], ['7','8','9','×'], ['4','5','6','-'], ['1','2','3','+'], ['0','.','','=']];

  return (
    <View style={styles.calcContainer}>
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{display || '0'}</Text>
      </View>
      <View style={styles.keyboardContainer}>
        {botones.map((row, rIdx) => (
          <View key={rIdx} style={styles.calcRow}>
            {row.map((b, bIdx) => (
              b === '' ? <View key={bIdx} style={styles.calcButtonEmpty} /> :
              <TouchableOpacity key={bIdx} style={styles.calcButton} onPress={() => pressBotón(b)}>
                <Text style={[styles.calcButtonText, b === '=' && { color: '#4F46E5', fontWeight: 'bold' }]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function VaultScreen({ vaultData, currentFolderId, setCurrentFolderId, setSettingsVisible, setIsFolderModalVisible, onAddFile, onLogout }) {
  const currentFolder = vaultData.find(f => f.id === currentFolderId);

  return (
    <View style={styles.vaultContainer}>
      <View style={styles.header}>
        {currentFolderId ? (
           <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentFolderId(null)}>
             <Text style={styles.backBtnText}>← {currentFolder.name}</Text>
           </TouchableOpacity>
        ) : (
           <Text style={styles.headerTitle}>Bóveda Oculta</Text>
        )}
        
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setSettingsVisible(true)}>
             <Text style={{ color: '#fff', fontSize: 14 }}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { marginLeft: 8 }]} onPress={onLogout}>
             <Text style={{ color: '#fff', fontSize: 14 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!currentFolderId ? (
        // LISTA DE CARPETAS SLIM
        vaultData.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>No hay carpetas activas. Crea una para empezar.</Text>
          </View>
        ) : (
          <FlatList 
            data={vaultData}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.folderCard} onPress={() => setCurrentFolderId(item.id)}>
                <Text style={styles.folderIcon}>📁</Text>
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.folderCount}>{item.items.length} ítems</Text>
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        // EXPERIENCIA PREMIUM MANHWA (Scroll vertical infinito y fluido sin cortes)
        currentFolder.items.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>Esta carpeta está vacía. Añade contenido privado.</Text>
          </View>
        ) : (
          <FlatList 
            data={currentFolder.items}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 90 }} 
            renderItem={({ item }) => {
              const ratio = item.width && item.height ? item.height / item.width : 1.5;
              return (
                <View style={styles.manhwaFrame}>
                  <Image source={{ uri: item.uri }} style={[styles.manhwaImage, { height: width * ratio }]} />
                </View>
              );
            }}
          />
        )
      )}

      {/* FAB ESTILIZADO */}
      {!currentFolderId ? (
        <TouchableOpacity style={styles.fab} onPress={() => setIsFolderModalVisible(true)}>
          <Text style={styles.fabText}>📁+</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.fab} onPress={onAddFile}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- ESTILOS COMPACTOS, EQUILIBRADOS Y SOFISTICADOS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  
  // Contenedor Calculadora Minimalista
  calcContainer: { flex: 1, backgroundColor: '#0B0E14', justifyContent: 'flex-end', paddingBottom: 15 },
  displayContainer: { paddingHorizontal: 32, paddingBottom: 10 },
  displayText: { color: '#4F46E5', fontSize: 44, fontWeight: '300', textAlign: 'right' },
  keyboardContainer: { paddingHorizontal: 20 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  calcButton: { width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2, backgroundColor: '#1C2331', justifyContent: 'center', alignItems: 'center' },
  calcButtonEmpty: { width: BTN_SIZE, height: BTN_SIZE },
  calcButtonText: { color: '#ffffff', fontSize: 19, fontWeight: '300' },

  // Estructura de la Bóveda
  vaultContainer: { flex: 1, backgroundColor: '#0B0E14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 45, paddingBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 0.3 },
  backBtn: { paddingVertical: 4 },
  backBtnText: { color: '#4F46E5', fontSize: 15, fontWeight: '600' },
  iconButton: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1C2331', justifyContent: 'center', alignItems: 'center' },
  
  // Tarjetas de Carpeta Equilibradas
  folderCard: { flex: 1, margin: 5, backgroundColor: '#1C2331', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  folderIcon: { fontSize: 22, marginBottom: 4 },
  folderName: { color: '#ffffff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  folderCount: { color: '#64748b', fontSize: 10, marginTop: 1 },

  // Lienzo Continuo Lector Manhwa Real
  manhwaFrame: { width: width, backgroundColor: '#0B0E14', marginBottom: 0 }, 
  manhwaImage: { width: '100%', resizeMode: 'cover' },
  
  // Elementos Flotantes y Emergentes
  fab: { position: 'absolute', bottom: 25, right: 20, width: 48, height: 48, borderRadius: 14, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', elevation: 3 },
  fabText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { color: '#475569', fontSize: 12, textAlign: 'center', lineHeight: 16 },

  // Modales Limpios
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,8,13,0.92)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#1C2331', padding: 18, borderRadius: 14 },
  modalTitle: { fontSize: 15, color: '#ffffff', fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingText: { color: '#ffffff', fontSize: 13 },
  inputDark: { backgroundColor: '#0B0E14', color: '#ffffff', fontSize: 14, padding: 10, borderRadius: 8, marginBottom: 14 },
  primaryBtn: { backgroundColor: '#4F46E5', padding: 11, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 }
});
