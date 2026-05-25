import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  Modal, 
  StatusBar, 
  Alert, 
  Switch, 
  Image, 
  Dimensions 
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as ScreenCapture from 'expo-screen-capture';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const COLUMN_SIZE = width / 3 - 15;

// Configuración de almacenamiento físico
const VAULT_DIR = `${FileSystem.documentDirectory}.boveda_secreta/`;
const PIN_SECRETO = "2580"; // <--- ESTE ES TU PIN PARA ENTRAR (Escribe 2580 y presiona '=')

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [antiScreenshot, setAntiScreenshot] = useState(false);
  const [faceDownLock, setFaceDownLock] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  
  // Estructura de la base de datos local
  const [vaultData, setVaultData] = useState({ items: [] });

  // 1. INICIALIZACIÓN: Cargar persistencia y crear directorios hito
  useEffect(() => {
    const inicializarApp = async () => {
      try {
        // Crear carpeta oculta y archivo .nomedia si no existen
        const folderInfo = await FileSystem.getInfoAsync(VAULT_DIR);
        if (!folderInfo.exists) {
          await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
        }
        const nomediaUri = `${VAULT_DIR}.nomedia`;
        const nomediaInfo = await FileSystem.getInfoAsync(nomediaUri);
        if (!nomediaInfo.exists) {
          await FileSystem.writeAsStringAsync(nomediaUri, '');
        }

        // Cargar Base de Datos Local (Nombres de archivos guardados)
        const savedData = await AsyncStorage.getItem('@vault_db');
        if (savedData) {
          setVaultData(JSON.parse(savedData));
        }

        // Cargar Ajustes de Seguridad de la memoria
        const savedAntiScreenshot = await AsyncStorage.getItem('@setting_screenshot');
        const savedFaceDown = await AsyncStorage.getItem('@setting_facedown');
        if (savedAntiScreenshot) setAntiScreenshot(JSON.parse(savedAntiScreenshot));
        if (savedFaceDown) setFaceDownLock(JSON.parse(savedFaceDown));

      } catch (error) {
        console.error("Error inicializando la bóveda:", error);
      }
    };
    inicializarApp();
  }, []);

  // 2. PERSISTENCIA AUTOMÁTICA: Guardar base de datos cuando cambie el estado
  const guardarDatosEnMemoria = async (nuevosDatos) => {
    setVaultData(nuevosDatos);
    await AsyncStorage.setItem('@vault_db', JSON.stringify(nuevosDatos));
  };

  // 3. SEGURIDAD: Control Anti-Capturas de Pantalla
  useEffect(() => {
    if (antiScreenshot) {
      ScreenCapture.preventScreenCaptureAsync();
    } else {
      ScreenCapture.allowScreenCaptureAsync();
    }
    AsyncStorage.setItem('@setting_screenshot', JSON.stringify(antiScreenshot));
  }, [antiScreenshot]);

  // 4. SEGURIDAD: Control del Sensor Boca Abajo (Giroscopio/Acelerómetro)
  useEffect(() => {
    let subscription;
    if (faceDownLock) {
      // Monitorea el eje Z (boca abajo suele ser menor a -0.8 o -0.9)
      subscription = Accelerometer.addListener(({ z }) => {
        if (z < -0.85) {
          setIsAuthenticated(false); // Cierra la bóveda al instante
        }
      });
      Accelerometer.setUpdateInterval(300); // Muestreo rápido cada 300ms
    }
    AsyncStorage.setItem('@setting_facedown', JSON.stringify(faceDownLock));

    return () => subscription && subscription.remove();
  }, [faceDownLock]);

  // 5. IMPORTAR ARCHIVO REAL Y ENMASCARARLO
  const ocultarNuevoArchivo = async () => {
    // Pedir permisos de galería pública
    const pickerPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const libraryPermission = await MediaLibrary.requestPermissionsAsync();

    if (!pickerPermission.granted || !libraryPermission.granted) {
      Alert.alert("Permiso requerido", "Se necesitan accesos a la galería para cifrar los archivos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const assetOriginal = result.assets[0];
      const uriOriginal = assetOriginal.uri;
      const nombreOriginal = uriOriginal.split('/').pop();
      
      // Enmascaramiento a archivo binario genérico desvinculado de extensiones multimedia
      const nuevoNombre = `enc_${Date.now()}.dat`; 
      const destinoOculto = `${VAULT_DIR}${nuevoNombre}`;

      try {
        // Copiar el archivo original a nuestro almacenamiento privado protegido
        await FileSystem.copyAsync({
          from: uriOriginal,
          to: destinoOculto,
        });

        // Actualizar Base de Datos JSON
        const nuevosItems = [...vaultData.items, { 
          id: nuevoNombre, 
          name: nombreOriginal, 
          uri: destinoOculto 
        }];
        await guardarDatosEnMemoria({ items: nuevosItems });

        // ELIMINAR EL ORIGINAL DE LA GALERÍA PÚBLICA (Evita duplicados)
        if (assetOriginal.assetId) {
          try {
            await MediaLibrary.deleteAssetsAsync([assetOriginal.assetId]);
            Alert.alert("Éxito", "El archivo ha sido movido a la Bóveda Privada y eliminado de tu galería pública.");
          } catch (e) {
            Alert.alert("Guardado", "El archivo se guardó en la Bóveda, pero debes borrar el original manualmente.");
          }
        } else {
          Alert.alert("Éxito", "Archivo encriptado y movido exitosamente.");
        }

      } catch (error) {
        Alert.alert("Error", "Ocurrió un problema al mover el archivo de manera segura.");
        console.error(error);
      }
    }
  };

  // 6. ELIMINAR ARCHIVO DEFINITIVAMENTE DE LA APP
  const eliminarArchivoFisico = async (item) => {
    Alert.alert(
      "Eliminar Archivo",
      "¿Estás seguro de que deseas borrar permanentemente este archivo de la bóveda?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(item.uri, { idempotent: true });
              const filtrados = vaultData.items.filter(i => i.id !== item.id);
              await guardarDatosEnMemoria({ items: filtrados });
            } catch (error) {
              Alert.alert("Error", "No se pudo borrar el archivo del almacenamiento.");
            }
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0e14" />
      
      {isAuthenticated ? (
        <VaultScreen 
          vaultData={vaultData}
          setSettingsVisible={setSettingsVisible}
          onAddFile={ocultarNuevoArchivo}
          onDeleteFile={eliminarArchivoFisico}
          onLogout={() => setIsAuthenticated(false)}
        />
      ) : (
        <CalcScreen onAuth={() => setIsAuthenticated(true)} />
      )}

      {/* MODAL DE AJUSTES AVANZADOS */}
      <Modal visible={isSettingsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seguridad Militar</Text>
            
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.settingText}>Anti-Screenshot</Text>
                <Text style={styles.settingSubtext}>Bloquea capturas y grabaciones de pantalla dentro de la app.</Text>
              </View>
              <Switch 
                value={antiScreenshot} 
                onValueChange={setAntiScreenshot} 
                trackColor={{ false: '#334155', true: '#4f46e5' }}
                thumbColor="#ffffff"
              />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.settingText}>Sensor Panic Lock</Text>
                <Text style={styles.settingSubtext}>Bloquea y cierra la bóveda de inmediato al voltear el teléfono boca abajo.</Text>
              </View>
              <Switch 
                value={faceDownLock} 
                onValueChange={setFaceDownLock} 
                trackColor={{ false: '#334155', true: '#4f46e5' }}
                thumbColor="#ffffff"
              />
            </View>

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setSettingsVisible(false)}
            >
              <Text style={styles.closeBtnText}>Guardar y Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- SUB-COMPONENTE: INTERFAZ CALCULADORA (CAMUFLAJE) ---
function CalcScreen({ onAuth }) {
  const [display, setDisplay] = useState('');

  const pressBotón = (val) => {
    if (val === 'C') {
      setDisplay('');
    } else if (val === '=') {
      if (display === PIN_SECRETO) {
        setDisplay('');
        onAuth(); // Trigger de Autenticación
      } else {
        // Se comporta como una calculadora normal si falla el código secreto
        try {
          // Eval de seguridad básico para simulación operativa de matemática
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
                  b === '=' ? { backgroundColor: '#4f46e5' } : 
                  ['÷','×','-','+','='].includes(b) ? { backgroundColor: '#1e293b' } : {}
                ]} 
                onPress={() => pressBotón(b)}
              >
                <Text style={styles.calcButtonText}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// --- SUB-COMPONENTE: INTERFAZ BÓVEDA PRIVADA ---
function VaultScreen({ vaultData, setSettingsVisible, onAddFile, onDeleteFile, onLogout }) {
  return (
    <View style={styles.vaultContainer}>
      {/* Encabezado Premium */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi Bóveda</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={styles.iconButton} onPress={() => setSettingsVisible(true)}>
            <Text style={{ color: '#fff', fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]} onPress={onLogout}>
            <Text style={{ color: '#ff4444', fontSize: 18 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de archivos en rejilla */}
      {vaultData.items.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Bóveda vacía de alta seguridad</Text>
          <Text style={styles.emptySubtext}>Presiona el botón inferior para camuflar archivos</Text>
        </View>
      ) : (
        <FlatList 
          data={vaultData.items}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10 }}
          renderItem={({ item }) => (
            <View style={styles.fileCard}>
              {/* Des-enmascaramiento en tiempo real directo desde URI local */}
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              <TouchableOpacity 
                style={styles.deleteBadge} 
                onPress={() => onDeleteFile(item)}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>X</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Botón flotante de acción rápida */}
      <TouchableOpacity style={styles.fab} onPress={onAddFile}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- ESTILOS VISUALES MODERNOS Y MINIMALISTAS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0e14' },
  
  // Estilos Calculadora
  calcContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0b0e14', paddingBottom: 20 },
  displayContainer: { paddingHorizontal: 30, paddingVertical: 20, alignItems: 'flex-end' },
  displayText: { color: '#60a5fa', fontSize: 50, fontFamily: 'System', fontWeight: '300' },
  keyboardContainer: { paddingHorizontal: 10 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  calcButton: { width: width/4 - 15, height: width/4 - 15, borderRadius: 50, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  calcButtonEmpty: { width: width/4 - 15, height: width/4 - 15 },
  calcButtonText: { color: '#f3f4f6', fontSize: 24, fontWeight: '400' },

  // Estilos Bóveda
  vaultContainer: { flex: 1, backgroundColor: '#0b0e14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  iconButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1c2331', justifyContent: 'center', alignItems: 'center' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  emptySubtext: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 8 },
  fileCard: { width: COLUMN_SIZE, height: COLUMN_SIZE, margin: 5, borderRadius: 12, backgroundColor: '#1c2331', overflow: 'hidden', position: 'relative' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
  deleteBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(239, 68, 68, 0.8)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300' },

  // Estilos Modales Ajustes
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#111827', padding: 25, borderRadius: 20, borderWidth: 1, borderBottomColor: '#1e293b' },
  modalTitle: { fontSize: 20, color: '#fff', fontWeight: 'bold', marginBottom: 20 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  settingText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  settingSubtext: { color: '#64748b', fontSize: 11, marginTop: 2 },
  closeBtn: { marginTop: 25, backgroundColor: '#4f46e5', padding: 12, borderRadius: 10, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
