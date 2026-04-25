import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, ScrollView, Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import ModalScreen from './ModalScreen';
import Dice3D from './Dice3D';

export default function UnproductiveRollModal({ visible, rolls, onClose, onFinish }) {
  const { removeReward } = useEconomy();
  const [step, setStep] = useState('rolling_tasks'); // skip selection
  const [multiplier, setMultiplier] = useState(1);
  const [finalResults, setFinalResults] = useState([]); 
  
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [currentSubs, setCurrentSubs] = useState([]);
  const [animationStage, setAnimationStage] = useState('idle'); // idle | rolling | sub_settled | settled | cleanup
  const [currentSubRollingIndex, setCurrentSubRollingIndex] = useState(-1);
  
  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));

  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
    } catch (e) {}
  }

  const dieOptions = [
    { id: 'easy', count: 1, name: 'Easy Tasks', desc: '1d20 per task' },
    { id: 'medium', count: 2, name: 'Medium Tasks', desc: 'Best of 2d20 per task' },
    { id: 'hard', count: 3, name: 'Hard Tasks', desc: 'Best of 3d20 per task' },
  ];

  useEffect(() => {
    if (visible) {
      setStep('rolling_tasks'); // Auto-start for penalties
      setFinalResults([]);
      setCurrentTaskIndex(0);
      setAnimationStage('idle');
      setMultiplier(1);
      
      // Auto-decide multiplier
      const r = Math.floor(Math.random() * 4) + 1;
      const mults = [1, 0.75, 0.5, 0.25];
      setMultiplier(mults[r - 1]);
      
      // Start rolling after a short delay
      setTimeout(() => rollNextTask(0), 500);
    }
  }, [visible]);

  function startRoll() {
    setStep('rolling_tasks');
    setFinalResults([]);
    setCurrentTaskIndex(0);
    
    // Multiplier is decided but hidden
    setMultiplier(Math.floor(Math.random() * 4) + 1);

    rollNextTask(0);
  }

  function rollNextTask(taskIdx) {
    if (taskIdx >= rolls) {
      setTimeout(() => setStep('ready_mult'), 600);
      return;
    }

    setCurrentTaskIndex(taskIdx);
    setCurrentSubs([]); 
    rollNextSub(taskIdx, 0, []);
  }

  function rollNextSub(taskIdx, subIdx, accumulatedSubs) {
    if (subIdx >= 1) { // Distractions always 1 die per slot
      // All subs for this task are done
      setAnimationStage('settled');
      setCurrentSubRollingIndex(-1);
      
      setTimeout(() => {
        setAnimationStage('cleanup');
        const winner = Math.max(...accumulatedSubs);
        
        setTimeout(() => {
          setFinalResults(prev => [...prev, winner]);
          rollNextTask(taskIdx + 1);
        }, 250);
      }, 400);
      return;
    }

    // Roll one specific die
    setAnimationStage('rolling');
    setCurrentSubRollingIndex(subIdx);
    playRollSound();

    // Roll duration
    setTimeout(() => {
      const result = Math.floor(Math.random() * 20) + 1;
      const newSubs = [...accumulatedSubs, result];
      setCurrentSubs(newSubs);
      setAnimationStage('sub_settled');

      // Pause to show result
      setTimeout(() => {
        rollNextSub(taskIdx, subIdx + 1, newSubs);
      }, 250);
    }, 500);
  }

  // Removed old revealNextDie logic in favor of rollNextTask hierarchy

  function handleRollMultiplier() {
    setStep('rolling_mult');
    playRollSound();
    // D4 roll animation for 2 seconds
    setTimeout(() => {
      setStep('results');
    }, 1000);
  }

  const sum = finalResults.reduce((acc, curr) => acc + curr, 0);
  const payoutPoints = sum * multiplier;
  const payoutXp = Math.floor(payoutPoints / 2);

  const handleClaim = () => {
    removeReward(payoutPoints, 0); 
    onFinish();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <ModalScreen style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Distraction Penalty</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Skip selection UI */}

          {step === 'rolling_tasks' && (
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text style={styles.title}>Focus Sequence</Text>
              <Text style={styles.subtitle}>Roll {currentTaskIndex + 1} of {rolls}</Text>
              
              <View style={{ height: 200, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 30 }}>
                {/* 1. Show already settled subs */}
                {currentSubs.map((val, idx) => {
                  const isWinner = val === Math.max(...currentSubs);
                  const isLoser = animationStage === 'cleanup' && !isWinner;
                  if (isLoser) return null;

                  return (
                    <View key={idx} style={{ alignItems: 'center' }}>
                      <Dice3D size={120} rolling={false} result={val} color="#ef4444" />
                      {(isWinner && (animationStage === 'settled' || animationStage === 'cleanup')) && (
                        <View style={{ marginTop: 10, backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>WORST</Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* 2. Show the currently rolling sub */}
                {animationStage === 'rolling' && (
                  <View style={{ alignItems: 'center' }}>
                    <Dice3D size={120} rolling={true} color="#ef4444" />
                  </View>
                )}
              </View>

              <Text style={styles.sumLabel}>History</Text>
              <View style={[styles.rollingDiceArea, { marginTop: 0 }]}>
                {finalResults.map((res, i) => (
                  <View key={i} style={styles.historyDie}>
                    <Dice3D size={50} rolling={false} result={res} color="#ef4444" />
                  </View>
                ))}
              </View>
            </View>
          )}

          {step === 'ready_mult' && (
            <>
              <Text style={styles.title}>All Results Collected</Text>
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>Total Face Sum</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>
              <View style={styles.rollingDiceArea}>
                {finalResults.map((res, i) => (
                  <View key={i} style={styles.historyDie}>
                    <Dice3D size={50} rolling={false} result={res} color="#ef4444" />
                  </View>
                ))}
              </View>
              <Text style={styles.subtitle}>
                Stay strong! Now roll for your final Efficiency Mitigation.
              </Text>
              <TouchableOpacity style={[styles.beginBtn, { backgroundColor: '#111827' }]} onPress={handleRollMultiplier}>
                <Ionicons name="shield-checkmark" size={20} color="#fff" style={{marginRight: 8}}/>
                <Text style={styles.beginBtnText}>Roll Mitigation (D4)</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_mult' && (
            <>
              <Text style={styles.title}>Calculating Mitigation...</Text>
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>Gross Penalty</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>
              <View style={{ alignItems: 'center', marginVertical: 40 }}>
                <Text style={[styles.sumLabel, { color: '#ef4444' }]}>ROLLING D4</Text>
                <AnimatedRollingDice size={100} color="#ef4444" />
              </View>
            </>
          )}

          {step === 'results' && (
            <>
              <Text style={styles.title}>Big Payout!</Text>
              
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>Total Face Sum</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>

              <View style={styles.rollingDiceArea}>
                {finalResults.map((res, i) => (
                  <View key={i} style={styles.historyDie}>
                    <Dice3D size={50} rolling={false} result={res} color="#8b5cf6" />
                  </View>
                ))}
              </View>

              <View style={[styles.multArea, { backgroundColor: '#fff1f2' }]}>
                <Ionicons name="remove-circle-outline" size={24} color="#ef4444" />
                <Text style={[styles.multText, { color: '#ef4444' }]}>
                  D4 Mitigation: {multiplier}x factor
                </Text>
              </View>

              <View style={[styles.payoutCard, { borderColor: '#ef444410', backgroundColor: '#fffbfb' }]}>
                <Text style={[styles.payoutTitle, { color: '#ef4444' }]}>Final Deduction</Text>
                <View style={styles.payoutRow}>
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutVal}>{payoutPoints}</Text>
                    <Text style={styles.payoutLabel}>Points</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.beginBtn, { marginTop: 32, backgroundColor: '#111827' }]} 
                onPress={handleClaim}
              >
                <Text style={styles.beginBtnText}>Accept Penalty</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

function AnimatedRollingDice({ size, color }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="dice" size={size} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth:1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  iconBtn: {
    padding: 8,
  },
  body: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  dieOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#f3f4f6',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  dieOptionActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#8b5cf6',
  },
  dieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dieName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  dieDesc: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  beginBtn: {
    width: '100%',
    backgroundColor: '#8b5cf6',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  beginBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  rollingDiceArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 20,
  },
  historyDie: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sumResultArea: {
    alignItems: 'center',
    marginVertical: 12,
  },
  sumLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  sumVal: {
    fontSize: 64,
    fontWeight: '900',
    color: '#111827',
  },
  multArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 32,
    marginBottom: 20,
  },
  multText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4f46e5',
  },
  payoutCard: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#8b5cf610',
    alignItems: 'center',
    backgroundColor: '#faf9ff',
  },
  payoutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  payoutRow: {
    flexDirection: 'row',
    gap: 40,
  },
  payoutItem: {
    alignItems: 'center',
  },
  payoutVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#111827',
  },
  payoutLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
    marginTop: 4,
  },
});
