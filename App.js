import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, Modal, TextInput, StatusBar, Alert, Switch } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as ScreenCapture from 'expo-screen-capture';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [themeName, setThemeName] = useState('darkBlue');
      
        // Ajustes
          const [antiScreenshot, setAntiScreenshot] = useState(false);
            const [faceDownLock, setFaceDownLock] = useState(false);
              const [isSettingsVisible, setSettingsVisible] = useState(false);

                // Datos
                  const [vaultData, setVaultData] = useState({ root: { items: ['Privado'] }, trash: [] });

                    // --- LÓGICA DE SENSORES Y SEGURIDAD ---
                      useEffect(() => {
                          // Protección contra capturas
                              if (antiScreenshot) ScreenCapture.preventScreenCaptureAsync();
                                  else ScreenCapture.allowScreenCaptureAsync();
                                    }, [antiScreenshot]);

                                      useEffect(() => {
                                          let subscription;
                                              if (faceDownLock) {
                                                    subscription = Accelerometer.addListener(({ z }) => {
                                                            // Si el teléfono se pone boca abajo (Z negativo cerca de -1)
                                                                    if (z < -0.8) setIsAuthenticated(false);
                                                                          });
                                                                              }
                                                                                  return () => subscription && subscription.remove();
                                                                                    }, [faceDownLock]);

                                                                                      // --- LÓGICA DE PAPELERA ---
                                                                                        const moveToTrash = (item) => {
                                                                                            const deletedAt = new Date();
                                                                                                setVaultData(prev => ({
                                                                                                      ...prev,
                                                                                                            root: { ...prev.root, items: prev.root.items.filter(i => i !== item) },
                                                                                                                  trash: [...prev.trash, { name: item, deletedAt }]
                                                                                                                      }));
                                                                                                                        };

                                                                                                                          const deletePermanently = (item) => {
                                                                                                                              setVaultData(prev => ({ ...prev, trash: prev.trash.filter(i => i.name !== item.name) }));
                                                                                                                                };

                                                                                                                                  // --- UI ---
                                                                                                                                    return (
                                                                                                                                        <View style={styles.container}>
                                                                                                                                              {isAuthenticated ? (
                                                                                                                                                      <VaultScreen 
                                                                                                                                                                vaultData={vaultData}
                                                                                                                                                                          setSettingsVisible={setSettingsVisible}
                                                                                                                                                                                    moveToTrash={moveToTrash}
                                                                                                                                                                                            />
                                                                                                                                                                                                  ) : (
                                                                                                                                                                                                          <CalcScreen onAuth={() => setIsAuthenticated(true)} />
                                                                                                                                                                                                                )}

                                                                                                                                                                                                                      {/* Modal Ajustes */}
                                                                                                                                                                                                                            <Modal visible={isSettingsVisible} transparent animationType="fade">
                                                                                                                                                                                                                                    <View style={styles.modalOverlay}>
                                                                                                                                                                                                                                              <View style={styles.modalContent}>
                                                                                                                                                                                                                                                          <Text style={styles.title}>Ajustes de Seguridad</Text>
                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                                  <View style={styles.switchRow}>
                                                                                                                                                                                                                                                                                                <Text style={{color: '#fff'}}>Evitar captura pantalla</Text>
                                                                                                                                                                                                                                                                                                              <Switch value={antiScreenshot} onValueChange={setAntiScreenshot} />
                                                                                                                                                                                                                                                                                                                          </View>

                                                                                                                                                                                                                                                                                                                                      <View style={styles.switchRow}>
                                                                                                                                                                                                                                                                                                                                                    <Text style={{color: '#fff'}}>Bloquear boca abajo</Text>
                                                                                                                                                                                                                                                                                                                                                                  <Switch value={faceDownLock} onValueChange={setFaceDownLock} />
                                                                                                                                                                                                                                                                                                                                                                              </View>

                                                                                                                                                                                                                                                                                                                                                                                          <TouchableOpacity onPress={() => setSettingsVisible(false)} style={styles.btnSave}><Text>Cerrar</Text></TouchableOpacity>
                                                                                                                                                                                                                                                                                                                                                                                                    </View>
                                                                                                                                                                                                                                                                                                                                                                                                            </View>
                                                                                                                                                                                                                                                                                                                                                                                                                  </Modal>
                                                                                                                                                                                                                                                                                                                                                                                                                      </View>
                                                                                                                                                                                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                                                                                                                                                        // (Componentes CalcScreen y VaultScreen simplificados para brevedad...)
                                                                                                                                                                                                                                                                                                                                                                                                                        // Nota: Aquí irían tus funciones de renderizado con los estilos que ya definimos.
                                                                                                                                                                                                                                                                                                                                                                                                                        
