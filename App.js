import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, Modal, 
  StatusBar, Alert, Image, Dimensions, TextInput 
} from 'react-native';
import * as FileSystem from 'expo-file-system'; // API Moderna corregida
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Video, ResizeMode } from 'expo-av'; // Soporte para reproducir videos
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const VAULT_DIR = `${FileSystem.documentDirectory}mi_boveda_secreta/`;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [vaultData, setVaultData] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null); 
  
  // Modales
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [secretPin, setSecretPin] = useState(null);
  const [isSetupModalVisible, setIsSetupModalVisible] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

  useEffect(() => {
    const inicializarBoveda = async () => {
      try {
        const pinGuardado = await AsyncStorage.getItem('@pin_seguro');
        if (pinGuardado) setSecretPin(pinGuardado);
        else setIsSetupModalVisible(true);

        const datosGuardados = await AsyncStorage.getItem('@vault_data_v5');
        if (datosGuardados) setVaultData(JSON.parse(datosGuardados));
      } catch (error) {
        console.error("Error inicializando:", error);
      }
    };
    inicializarBoveda();
  }, []);

  const guardarDatos = async (nuevosDatos) => {
    setVaultData(nuevosDatos);
    await AsyncStorage.setItem('@vault_data_v5', JSON.stringify(nuevosDatos));
  };

  const registrarPin = async () => {
    if (newPinInput.length < 4) {
      Alert.alert("Aviso", "El código debe tener al menos 4 números.");
      return;
    }
    await AsyncStorage.setItem('@pin_seguro', newPinInput);
    setSecretPin(newPinInput);
    setIsSetupModalVisible(false);
  };

  const crearCarpeta = async () => {
    if (newFolderName.trim() === '') return;
    const nuevaCarpeta = { id: `folder_${Date.now()}`, name: newFolderName, items: [] };
    await guardarDatos([...vaultData, nuevaCarpeta]);
    setNewFolderName('');
    setIsFolderModalVisible(false);
  };

  // Función corregida para pedir permisos y ocultar archivos
  const ocultarArchivo = async () => {
    if (!currentFolderId) return;

    try {
      // 1. Solicitar permisos EXPLÍCITAMENTE
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert("Permiso Denegado", "Se requieren permisos para poder ocultar tus archivos.");
        return;
      }

      // 2. Abrir selector permitiendo Imágenes y Videos
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        const fileName = `secreto_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
        const destPath = `${VAULT_DIR}${fileName}`;

        // 3. Crear directorio usando la API Moderna de Expo
        const dirInfo = await FileSystem.getInfoAsync(VAULT_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
        }

        // 4. Mover a zona segura
        await FileSystem.copyAsync({ from: asset.uri, to: destPath });

        // 5. Guardar en el estado de la app
        const carpetasActualizadas = vaultData.map(folder => {
          if (folder.id === currentFolderId) {
            return {
              ...folder,
              items: [...folder.items, { 
                id: fileName, uri: destPath, isVideo: isVideo, 
                width: asset.width, height: asset.height, assetId: asset.assetId
              }]
            };
          }
          return folder;
        });

        await guardarDatos(carpetasActualizadas);

        // 6. Eliminar el archivo original de la galería pública
        if (asset.assetId) {
          try {
            await MediaLibrary.deleteAssetsAsync([asset.assetId]);
          } catch (e) {
            console.log("No se pudo borrar automáticamente el original.");
          }
        }
      }
    } catch (error) {
      Alert.alert("Error", "Ocurrió un problema moviendo el archivo.");
      console.error(error);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    setCurrentFolderId(null); // CORRECCIÓN: Evita quedar atrapado en el visor al entrar
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      
      {isAuthenticated ? (
        <VaultScreen 
          vaultData={vaultData}
          currentFolderId={currentFolderId}
          setCurrentFolderId={setCurrentFolderId}
          setIsFolderModalVisible={setIsFolderModalVisible}
          onAddFile={ocultarArchivo}
          onLogout={() => setIsAuthenticated(false)}
        />
      ) : (
        <CalcScreen onAuth={handleLogin} secretPin={secretPin} />
      )}

      {/* MODALES DE CONFIGURACIÓN */}
      <Modal visible={isFolderModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nueva Tarjeta/Carpeta</Text>
            <TextInput 
              style={styles.inputDark} 
              placeholder="Nombre (ej. Privado)" 
              placeholderTextColor="#666"
              value={newFolderName} 
              onChangeText={setNewFolderName}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setIsFolderModalVisible(false)}>
                <Text style={styles.btnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={crearCarpeta}>
                <Text style={styles.btnText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isSetupModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crea tu PIN Secreto</Text>
            <TextInput 
              style={[styles.inputDark, {textAlign: 'center', fontSize: 20, letterSpacing: 5}]} 
              keyboardType="number-pad" maxLength={8} secureTextEntry
              value={newPinInput} onChangeText={setNewPinInput}
            />
            <TouchableOpacity style={styles.btnConfirm} onPress={registrarPin}>
              <Text style={styles.btnText}>Guardar PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ------------------- PANTALLA CALCULADORA (FACHADA FULL SCREEN) -------------------
function CalcScreen({ onAuth, secretPin }) {
  const [display, setDisplay] = useState('');

  const pressBtn = (val) => {
    if (val === 'C') setDisplay('');
    else if (val === '=') {
      if (display === secretPin && secretPin !== null) {
        setDisplay('');
        onAuth();
      } else {
        try { setDisplay(String(eval(display.replace('×', '*').replace('÷', '/')))); } 
        catch { setDisplay('0'); }
      }
    } else {
      setDisplay(prev => prev + val);
    }
  };

  const botones = [
    ['C','(',')','÷'], 
    ['7','8','9','×'], 
    ['4','5','6','-'], 
    ['1','2','3','+'], 
    ['0','.','','=']
  ];

  return (
    <View style={styles.calcScreen}>
      {/* El display toma todo el espacio superior disponible empujando el teclado abajo */}
      <View style={styles.calcDisplayArea}>
        <Text style={styles.calcDisplayText} numberOfLines={1} adjustsFontSizeToFit>
          {display || '0'}
        </Text>
      </View>
      
      <View style={styles.calcKeypad}>
        {botones.map((row, rIdx) => (
          <View key={rIdx} style={styles.calcRow}>
            {row.map((b, bIdx) => (
              b === '' ? <View key={bIdx} style={styles.calcBtnEmpty} /> :
              <TouchableOpacity 
                key={bIdx} 
                style={[styles.calcBtn, b === '=' && {backgroundColor: '#3b82f6'} ]} 
                onPress={() => pressBtn(b)}
              >
                <Text style={styles.calcBtnText}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------- PANTALLA BÓVEDA (GALERÍA Y VISOR) -------------------
function VaultScreen({ vaultData, currentFolderId, setCurrentFolderId, setIsFolderModalVisible, onAddFile, onLogout }) {
  const currentFolder = vaultData.find(f => f.id === currentFolderId);

  return (
    <View style={styles.vaultScreen}>
      <View style={styles.vaultHeader}>
        {currentFolderId ? (
           <TouchableOpacity style={styles.headerBtn} onPress={() => setCurrentFolderId(null)}>
             <Text style={styles.headerBtnText}>← Volver</Text>
           </TouchableOpacity>
        ) : (
           <Text style={styles.headerTitle}>Mis Tarjetas</Text>
        )}
        <TouchableOpacity style={styles.lockBtn} onPress={onLogout}>
           <Text style={{ fontSize: 20 }}>🔒</Text>
        </TouchableOpacity>
      </View>

      {!currentFolderId ? (
        // 1. VISTA DE GALERÍA DE TARJETAS
        <FlatList 
          data={vaultData}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setCurrentFolderId(item.id)}>
              <View style={styles.cardContent}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📁</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardSubtitle}>{item.items.length} ítems</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tienes tarjetas creadas. Presiona el + para empezar.</Text>
          }
        />
      ) : (
        // 2. VISOR TIPO MANHWA / VIDEOS
        <FlatList 
          data={currentFolder.items}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }} 
          renderItem={({ item }) => {
            if (item.isVideo) {
              return (
                <View style={styles.mediaContainer}>
                  <Video
                    source={{ uri: item.uri }}
                    style={styles.mediaVideo}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                  />
                </View>
              );
            } else {
              const ratio = item.width && item.height ? item.height / item.width : 1.5;
              return (
                <View style={styles.mediaContainer}>
                  <Image source={{ uri: item.uri }} style={[styles.mediaImage, { height: width * ratio }]} />
                </View>
              );
            }
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Carpeta vacía. Presiona + para ocultar fotos o videos aquí.</Text>
          }
        />
      )}

      {/* BOTÓN FLOTANTE DINÁMICO */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={currentFolderId ? onAddFile : () => setIsFolderModalVisible(true)}
      >
        <Text style={styles.fabIcon}>{currentFolderId ? '+' : '📁+'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ------------------- ESTILOS GENERALES -------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  
  // Calculadora
  calcScreen: { flex: 1, backgroundColor: '#000000' },
  calcDisplayArea: { flex: 1, justifyContent: 'flex-end', padding: 30 },
  calcDisplayText: { color: '#ffffff', fontSize: 60, fontWeight: '300', textAlign: 'right' },
  calcKeypad: { paddingHorizontal: 15, paddingBottom: 30 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  calcBtn: { width: (width / 4) - 20, height: (width / 4) - 20, borderRadius: 100, backgroundColor: '#1e1e1e', justifyContent: 'center', alignItems: 'center' },
  calcBtnEmpty: { width: (width / 4) - 20, height: (width / 4) - 20 },
  calcBtnText: { color: '#ffffff', fontSize: 28, fontWeight: '400' },

  // Bóveda
  vaultScreen: { flex: 1, backgroundColor: '#0f0f13' },
  vaultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 15, backgroundColor: '#1a1a24' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  headerBtn: { padding: 5 },
  headerBtnText: { color: '#3b82f6', fontSize: 18, fontWeight: '600' },
  lockBtn: { padding: 5 },

  // Tarjetas Modernas
  card: { flex: 1, margin: 8, height: 140, backgroundColor: '#1e1e2d', borderRadius: 20, elevation: 5, overflow: 'hidden' },
  cardContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  cardSubtitle: { color: '#888', fontSize: 12, marginTop: 4 },

  // Visor de Medios (Manhwa/Videos)
  mediaContainer: { width: width, backgroundColor: '#000' },
  mediaImage: { width: '100%', resizeMode: 'cover' },
  mediaVideo: { width: width, height: width * 1.5 }, // Altura por defecto para videos verticales
  
  emptyText: { color: '#666', textAlign: 'center', marginTop: 50, paddingHorizontal: 40, fontSize: 16 },

  // Elementos Flotantes
  fab: { position: 'absolute', bottom: 30, right: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabIcon: { color: '#fff', fontSize: 28, fontWeight: 'bold' },

  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1e1e2d', padding: 20, borderRadius: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  inputDark: { backgroundColor: '#12121a', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btnCancel: { flex: 0.48, backgroundColor: '#333', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnConfirm: { flex: 0.48, backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
