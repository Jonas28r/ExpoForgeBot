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

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [antiScreenshot, setAntiScreenshot] = useState(false);
  const [faceDownLock, setFaceDownLock] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  
  // Carpetas Dinámicas (Empieza vacío para dar libertad)
  const [vaultData, setVaultData] = useState([]);
  
  const [currentFolderId, setCurrentFolderId] = useState(null); 
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [secretPin, setSecretPin] = useState(null);
  const [isSetupModalVisible, setIsSetupModalVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

  const isPickingMedia = useRef(false);

  useEffect(() => {
    const inicializarBoveda = async () => {
      try {
        const pinGuardado = await AsyncStorage.getItem('@secret_pin');
        if (pinGuardado) setSecretPin(pinGuardado);
        else setIsSetupModalVisible(true);

        const datosGuardados = await AsyncStorage.getItem('@vault_folders_v3');
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState.match(/inactive|background/) && !isPickingMedia.current) {
        setIsAuthenticated(false);
        setSettingsVisible(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const guardarEstructura = async (nuevosDatos) => {
    setVaultData(nuevosDatos);
    await AsyncStorage.setItem('@vault_folders_v3', JSON.stringify(nuevosDatos));
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

  useEffect(() => {
    let subscription;
    if (faceDownLock && isAuthenticated && !isPickingMedia.current) {
      subscription = Accelerometer.addListener(({ z }) => {
        if (z < -0.85) setIsAuthenticated(false);
      });
      Accelerometer.setUpdateInterval(300);
    }
    AsyncStorage.setItem('@setting_facedown', JSON.stringify(faceDownLock));
    return () => subscription && subscription.remove();
  }, [faceDownLock, isAuthenticated]);

  const importarArchivoMagico = async () => {
    if (!currentFolderId) return;

    // Aquí se pide el permiso total (MANAGE_EXTERNAL_STORAGE lo maneja el OS)
    const pickerPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const mediaPermission = await MediaLibrary.requestPermissionsAsync();

    if (!pickerPermission.granted || !mediaPermission.granted) {
      Alert.alert("Acceso Denegado", "Se requieren permisos para hacer la magia.");
      return;
    }

    isPickingMedia.current = true; 

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
    });

    setTimeout(() => { isPickingMedia.current = false; }, 1500);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const assetSeleccionado = result.assets[0];
      const nombreEncriptado = `enc_${Date.now()}.dat`; 
      const rutaDestino = `${VAULT_DIR}${nombreEncriptado}`;

      try {
        const folderInfo = await FileSystem.getInfoAsync(VAULT_DIR);
        if (!folderInfo.exists) {
          await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(`${VAULT_DIR}.nomedia`, '');

        // Mover archivo al núcleo de la app
        await FileSystem.copyAsync({
          from: assetSeleccionado.uri,
          to: rutaDestino,
        });

        // Actualizar la interfaz Manhwa
        const carpetasActualizadas = vaultData.map(folder => {
          if (folder.id === currentFolderId) {
            return {
              ...folder,
              // Mantener las proporciones reales para el lector vertical
              items: [...folder.items, { 
                id: nombreEncriptado, 
                uri: rutaDestino, 
                width: assetSeleccionado.width, 
                height: assetSeleccionado.height 
              }]
            };
          }
          return folder;
        });

        await guardarEstructura(carpetasActualizadas);

        // BORRADO SILENCIOSO PROFESIONAL (Requiere que Android haya concedido el Super Permiso)
        if (assetSeleccionado.uri) {
           await FileSystem.deleteAsync(assetSeleccionado.uri, { idempotent: true });
        }

      } catch (error) {
        Alert.alert("Error Mágico", `Algo falló en la encriptación: ${error.message}`);
      }
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
              placeholder="Nombre (ej. hana)" 
              placeholderTextColor="#64748b"
              value={newFolderName} 
              onChangeText={setNewFolderName}
            />
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#1C2331', flex: 0.48}]} onPress={() => setIsFolderModalVisible(false)}>
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
            <Text style={styles.modalTitle}>Código Maestro</Text>
            <TextInput 
              style={[styles.inputDark, {textAlign: 'center', fontSize: 22}]} 
              keyboardType="number-pad" maxLength={8} secureTextEntry
              placeholder="Escribe tu PIN" placeholderTextColor="#64748b"
              value={newPinInput} onChangeText={setNewPinInput}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={registrarPin}>
              <Text style={styles.primaryBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL AJUSTES */}
      <Modal visible={isSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seguridad Avanzada</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Bloquear Capturas</Text>
              <Switch value={antiScreenshot} onValueChange={setAntiScreenshot} trackColor={{ true: '#4F46E5' }} />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Bloqueo Invertido (Sensor)</Text>
              <Switch value={faceDownLock} onValueChange={setFaceDownLock} trackColor={{ true: '#4F46E5' }} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.primaryBtnText}>Hecho</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- PANTALLAS ---

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
        catch { setDisplay('Error'); }
      }
    } else setDisplay(prev => prev + val);
  };

  const botones = [['C','(',')','÷'], ['7','8','9','×'], ['4','5','6','-'], ['1','2','3','+'], ['0','.','','=']];

  return (
    <View style={styles.calcContainer}>
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1}>{display || '0'}</Text>
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
      {/* HEADER DINÁMICO */}
      <View style={styles.header}>
        {currentFolderId ? (
           <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentFolderId(null)}>
             <Text style={styles.backBtnText}>← {currentFolder.name}</Text>
           </TouchableOpacity>
        ) : (
           <Text style={styles.headerTitle}>GhostVault</Text>
        )}
        
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setSettingsVisible(true)}>
             <Text style={{ color: '#fff', fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onLogout}>
             <Text style={{ color: '#fff', fontSize: 18 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!currentFolderId ? (
        // VISTA DE CARPETAS (Libres)
        vaultData.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>Bóveda vacía. Crea una carpeta.</Text>
          </View>
        ) : (
          <FlatList 
            data={vaultData}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={{ padding: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.folderCard} onPress={() => setCurrentFolderId(item.id)}>
                <Text style={styles.folderIcon}>📁</Text>
                <Text style={styles.folderName}>{item.name}</Text>
                <Text style={styles.folderCount}>{item.items.length} archivos</Text>
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        // VISTA TIPO MANHWA (Scroll vertical sin bordes)
        currentFolder.items.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>Carpeta vacía. Agrega contenido.</Text>
          </View>
        ) : (
          <FlatList 
            data={currentFolder.items}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }} // Espacio para el FAB
            renderItem={({ item }) => {
              // Calcular altura proporcional para que ocupe todo el ancho sin deformarse
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

      {/* BOTÓN FLOTANTE DINÁMICO */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E14' },
  
  // Calculadora Premium
  calcContainer: { flex: 1, backgroundColor: '#0B0E14' },
  displayContainer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 25, paddingBottom: 25 },
  displayText: { color: '#4F46E5', fontSize: 75, fontWeight: '200', textAlign: 'right' },
  keyboardContainer: { paddingHorizontal: 12, paddingBottom: 35 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  calcButton: { width: width/4 - 18, height: width/4 - 18, borderRadius: 50, backgroundColor: '#1C2331', justifyContent: 'center', alignItems: 'center' },
  calcButtonEmpty: { width: width/4 - 18, height: width/4 - 18 },
  calcButtonText: { color: '#ffffff', fontSize: 26, fontWeight: '300' },

  // Bóveda Interna
  vaultContainer: { flex: 1, backgroundColor: '#0B0E14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 55, paddingBottom: 15 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  backBtn: { paddingVertical: 5 },
  backBtnText: { color: '#4F46E5', fontSize: 18, fontWeight: '600' },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#1C2331', justifyContent: 'center', alignItems: 'center' },
  
  // Carpetas Libres
  folderCard: { flex: 1, margin: 8, backgroundColor: '#1C2331', borderRadius: 18, padding: 20, alignItems: 'center', justifyContent: 'center' },
  folderIcon: { fontSize: 36, marginBottom: 8 },
  folderName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  folderCount: { color: '#64748b', fontSize: 12, marginTop: 4 },

  // Lector Manhwa (Scroll vertical continuo)
  manhwaFrame: { width: width, backgroundColor: '#0B0E14', marginBottom: 2 }, 
  manhwaImage: { width: '100%', resizeMode: 'cover' },
  
  fab: { position: 'absolute', bottom: 35, right: 25, width: 60, height: 60, borderRadius: 20, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', elevation: 6 },
  fabText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 15 },

  // Modales Estilizados
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,8,13,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1C2331', padding: 22, borderRadius: 22 },
  modalTitle: { fontSize: 18, color: '#ffffff', fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  settingText: { color: '#ffffff', fontSize: 15 },
  inputDark: { backgroundColor: '#0B0E14', color: '#ffffff', fontSize: 16, padding: 15, borderRadius: 12, marginBottom: 20 },
  primaryBtn: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 }
});
