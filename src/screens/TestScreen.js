import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, TextInput } from 'react-native';
import { useTheme } from '../lib/ThemeContext';
import Dice3D from '../components/Dice3D';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';

import { useTasks } from '../lib/TasksContext';

export default function TestScreen() {
  const { colors } = useTheme();
  const { gamesPlayCredits, setGamesPlayCredits } = useTasks();
  
  // Calibration State
  const [targetFace, setTargetFace] = useState(1);
  const [rot, setRot] = useState({ x: -1.571, y: 0.785, z: 0 });
  
  // Results mapping storage (Updated with your values)
  const [mappings, setMappings] = useState({
    1: { x: -1.571, y: 0.785, z: 0 },
    2: { x: 0, y: 0.785, z: 0 },
    3: { x: -2.356, y: 6.283, z: 1.571 },
    4: { x: -0.785, y: 0, z: -1.571 },
    5: { x: -6.087, y: 3.927, z: 0 },
    6: { x: 1.571, y: 2.356, z: 0 },
  });

  // Normal Roll Test State
  const [isRolling, setIsRolling] = useState(false);
  const [rollResult, setRollResult] = useState(1);
  const [testMode, setTestMode] = useState('calibrate'); // 'calibrate' or 'roll'

  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));

  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
    } catch (e) {}
  }

  const step = Math.PI / 16; 

  const adjust = (axis, delta) => {
    setRot(prev => ({ ...prev, [axis]: prev[axis] + delta }));
  };

  const saveCurrent = () => {
    const nextMappings = { ...mappings, [targetFace]: { ...rot } };
    setMappings(nextMappings);
    console.log("--- D6 MAPPING UPDATE ---");
    console.log(JSON.stringify(nextMappings, null, 2));
    console.log("-------------------------");
    Alert.alert("Saved", `Face ${targetFace} rotation updated.`);
  };

  const selectFace = (face) => {
    setTargetFace(face);
    setRot(mappings[face] || { x: 0, y: 0, z: 0 });
  };

  const runTestRoll = () => {
    setIsRolling(true);
    setRollResult(null);
    playRollSound();
    setTimeout(() => {
      const res = Math.floor(Math.random() * 6) + 1;
      setRollResult(res);
      setIsRolling(false);
    }, 1500);
  };

  const formatCode = () => {
    let str = "const D6_ROTATIONS = {\n";
    for (let i = 1; i <= 6; i++) {
      const { x, y, z } = mappings[i];
      str += `  ${i}: new THREE.Quaternion().setFromEuler(new THREE.Euler(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})),\n`;
    }
    str += "};";
    return str;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>D6 Test & Calibration</Text>
      
      <View style={styles.modeToggle}>
        <TouchableOpacity 
          onPress={() => setTestMode('calibrate')}
          style={[styles.modeBtn, testMode === 'calibrate' && { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.modeText, testMode === 'calibrate' && { color: '#fff' }]}>Calibration</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setTestMode('roll')}
          style={[styles.modeBtn, testMode === 'roll' && { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.modeText, testMode === 'roll' && { color: '#fff' }]}>Roll Test</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.canvasContainer}>
        <Dice3D 
          size={300} 
          type="d6" 
          rolling={testMode === 'roll' ? isRolling : false} 
          result={testMode === 'roll' ? rollResult : null}
          manualRotation={testMode === 'calibrate' ? rot : null} 
          color={colors.primary}
        />
        {testMode === 'roll' && rollResult && !isRolling && (
           <View style={styles.resultBadge}>
             <Text style={styles.resultText}>ROLLED: {rollResult}</Text>
           </View>
        )}
      </View>

      {testMode === 'calibrate' ? (
        <>
          <View style={styles.faceRow}>
            {[1, 2, 3, 4, 5, 6].map(f => (
              <TouchableOpacity 
                key={f} 
                onPress={() => selectFace(f)}
                style={[styles.faceBtn, targetFace === f && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.faceText, targetFace === f && { color: '#fff' }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.controlsGrid}>
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>X Axis (Pitch)</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('x', -step)}><Ionicons name="remove" size={24} color="#fff" /></TouchableOpacity>
                <Text style={styles.valText}>{rot.x.toFixed(2)}</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('x', step)}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
              </View>
            </View>

            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Y Axis (Yaw)</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('y', -step)}><Ionicons name="remove" size={24} color="#fff" /></TouchableOpacity>
                <Text style={styles.valText}>{rot.y.toFixed(2)}</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('y', step)}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
              </View>
            </View>

            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Z Axis (Roll)</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('z', -step)}><Ionicons name="remove" size={24} color="#fff" /></TouchableOpacity>
                <Text style={styles.valText}>{rot.z.toFixed(2)}</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={() => adjust('z', step)}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveCurrent}>
            <Text style={styles.saveText}>Save Face {targetFace} Mapping</Text>
          </TouchableOpacity>

          <View style={styles.codeOutput}>
            <Text style={styles.codeTitle}>Resulting Code (Select & Copy):</Text>
            <TextInput
              style={styles.codeText}
              multiline
              editable={false}
              value={formatCode()}
              selectTextOnFocus
            />
          </View>
        </>
      ) : (
        <View style={{ width: '100%', alignItems: 'center' }}>
          <TouchableOpacity 
            style={[styles.rollBtn, { backgroundColor: colors.primary }]} 
            onPress={runTestRoll}
            disabled={isRolling}
          >
            <Text style={styles.rollBtnText}>{isRolling ? 'ROLLING...' : 'TEST ROLL'}</Text>
          </TouchableOpacity>
          
          <Text style={[styles.note, { color: colors.textSecondary, marginTop: 30, textAlign: 'center' }]}>
            Verify that the number shown in the badge above matches the face visible on the 3D model.
          </Text>
        </View>
      )}

      {/* Games Hub Debug Section */}
      <View style={{ width: '100%', padding: 20, marginTop: 40, backgroundColor: '#fef3c7', borderRadius: 20, borderWidth: 1, borderColor: '#fde68a' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#92400e', marginBottom: 4 }}>Games Hub Debug</Text>
        <Text style={{ fontSize: 14, color: '#b45309', marginBottom: 16 }}>
          Current: {Math.floor((gamesPlayCredits || 0)/60)}m {(gamesPlayCredits || 0)%60}s
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#f59e0b', padding: 16, borderRadius: 12, alignItems: 'center' }}
          onPress={() => setGamesPlayCredits(prev => (prev || 0) + 1800)}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Add 30m Playtime (Manual)</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeText: {
    fontWeight: '700',
    fontSize: 14,
    color: '#4b5563',
  },
  canvasContainer: {
    width: 300,
    height: 300,
    backgroundColor: '#1f2937',
    borderRadius: 20,
    marginBottom: 30,
    position: 'relative',
  },
  resultBadge: {
    position: 'absolute',
    bottom: -15,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#4f46e5',
    alignSelf: 'center',
  },
  resultText: {
    fontWeight: '900',
    fontSize: 18,
    color: '#1f2937',
  },
  faceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 30,
  },
  faceBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: {
    fontWeight: '700',
    fontSize: 18,
  },
  controlsGrid: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 20,
    marginBottom: 40,
  },
  controlGroup: {
    backgroundColor: '#f3f4f6',
    padding: 15,
    borderRadius: 16,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBtn: {
    width: 50,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valText: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#111827',
    width: 80,
    textAlign: 'center',
  },
  saveBtn: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 15,
    marginBottom: 30,
  },
  saveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  rollBtn: {
    width: '80%',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  rollBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1,
  },
  codeOutput: {
    width: '90%',
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 15,
    marginBottom: 30,
  },
  codeTitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  codeText: {
    color: '#10b981',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    width: '80%',
  }
});
