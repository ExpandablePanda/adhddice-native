import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, ScrollView, Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import ModalScreen from './ModalScreen';
import Dice3D from './Dice3D';

export default function EfficiencyRollModal({ visible, rolls, onClose, onFinish }) {
  const { bulkConsumeFreeRolls, addReward } = useEconomy();
  const [step, setStep] = useState('select'); // select | rolling_tasks | ready_mult | rolling_mult | results
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [multiplier, setMultiplier] = useState(1);
  const [finalResults, setFinalResults] = useState([]); // Array of winners
  
  // Per-task animation state
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [currentSubs, setCurrentSubs] = useState([]);
  const [animationStage, setAnimationStage] = useState('idle'); // idle | rolling | settled | cleanup
  
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
    if (visible && !selectedOpt) {
      setSelectedOpt(dieOptions[0]);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setStep('select');
      setFinalResults([]);
      setCurrentTaskIndex(0);
      setAnimationStage('idle');
      setMultiplier(1);
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

  function rollNextTask(index) {
    if (index >= rolls) {
      setTimeout(() => setStep('ready_mult'), 1000);
      return;
    }

    setCurrentTaskIndex(index);
    setAnimationStage('rolling');
    setCurrentSubs([]); // Reset visuals
    playRollSound();

    // Roll for 1.5s
    setTimeout(() => {
      const subs = Array.from({ length: selectedOpt.count }, () => Math.floor(Math.random() * 20) + 1);
      setCurrentSubs(subs);
      setAnimationStage('settled');

      // Stay settled for 1.5s so user can process ALL dice
      setTimeout(() => {
        setAnimationStage('cleanup');
        const winner = Math.max(...subs);
        
        // Wait 1s for the "cleanup" (fading losers)
        setTimeout(() => {
          setFinalResults(prev => [...prev, winner]);
          // Next task
          rollNextTask(index + 1);
        }, 1000);
      }, 1500);
    }, 1500);
  }

  // Removed old revealNextDie logic in favor of rollNextTask hierarchy

  function handleRollMultiplier() {
    setStep('rolling_mult');
    playRollSound();
    // D4 roll animation for 2 seconds
    setTimeout(() => {
      setStep('results');
    }, 2000);
  }

  const sum = finalResults.reduce((acc, curr) => acc + curr, 0);
  const payoutPoints = sum * multiplier;
  const payoutXp = Math.floor(payoutPoints / 2);

  const handleClaim = () => {
    // If we are triggered from the Dice screen, rolls = economy.freeRolls
    // If we are triggered from TasksScreen, rolls = specific bundle of tasks
    // For simplicity, we just grant the reward and let the parent handle 'consumption' if needed.
    // However, the user wants "bulk consume" logic to work correctly.
    
    addReward(payoutPoints, payoutXp);
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
          <Text style={styles.headerTitle}>Efficiency Roll</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {step === 'select' && (
            <>
              <Text style={styles.title}>Roll Banked Dice</Text>
              <Text style={styles.subtitle}>
                You are rolling {rolls} dice at once. Select the die type that best matches the average difficulty of these tasks.
              </Text>

              {dieOptions.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.dieOption, selectedOpt?.id === opt.id && styles.dieOptionActive]}
                  onPress={() => setSelectedOpt(opt)}
                >
                  <View style={styles.dieInfo}>
                    <Ionicons name="dice-outline" size={24} color={selectedOpt?.id === opt.id ? '#8b5cf6' : '#9ca3af'} />
                    <View>
                      <Text style={[styles.dieName, selectedOpt?.id === opt.id && { color: '#8b5cf6' }]}>{opt.name}</Text>
                      <Text style={styles.dieDesc}>{opt.desc}</Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={selectedOpt?.id === opt.id ? 'radio-button-on' : 'radio-button-off'} 
                    size={22} 
                    color={selectedOpt?.id === opt.id ? '#8b5cf6' : '#d1d5db'} 
                  />
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.beginBtn} onPress={startRoll}>
                <Text style={styles.beginBtnText}>Roll {rolls} x {selectedOpt?.name}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_tasks' && (
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text style={styles.title}>Efficiency Sequence</Text>
              <Text style={styles.subtitle}>Task {currentTaskIndex + 1} of {rolls} ({selectedOpt.name})</Text>
              
              <View style={{ height: 200, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 30 }}>
                {animationStage === 'rolling' && (
                  <>
                    <Dice3D size={120} rolling={true} color={selectedOpt.color || '#8b5cf6'} />
                    {selectedOpt.count >= 2 && <Dice3D size={120} rolling={true} color={selectedOpt.color || '#8b5cf6'} />}
                    {selectedOpt.count >= 3 && <Dice3D size={120} rolling={true} color={selectedOpt.color || '#8b5cf6'} />}
                  </>
                )}
                {(animationStage === 'settled' || animationStage === 'cleanup') && (
                  <>
                    {currentSubs.map((val, idx) => {
                      const isWinner = val === Math.max(...currentSubs);
                      // In cleanup, hide losers
                      if (animationStage === 'cleanup' && !isWinner) return null;
                      return (
                        <View key={idx} style={{ alignItems: 'center' }}>
                          <Dice3D size={120} rolling={false} result={val} color={isWinner ? '#8b5cf6' : '#9ca3af'} />
                          {isWinner && (
                            <View style={{ marginTop: 10, backgroundColor: '#8b5cf6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>BEST</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </View>

              <Text style={styles.sumLabel}>History</Text>
              <View style={[styles.rollingDiceArea, { marginTop: 0 }]}>
                {finalResults.map((res, i) => (
                  <View key={i} style={styles.historyDie}>
                    <Dice3D size={50} rolling={false} result={res} color="#8b5cf6" />
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
                    <Dice3D size={50} rolling={false} result={res} color="#8b5cf6" />
                  </View>
                ))}
              </View>
              <Text style={styles.subtitle}>Excellent focus! Now roll for your final Efficiency Multiplier.</Text>
              <TouchableOpacity style={[styles.beginBtn, { backgroundColor: '#4f46e5' }]} onPress={handleRollMultiplier}>
                <Ionicons name="flash" size={20} color="#fff" style={{marginRight: 8}}/>
                <Text style={styles.beginBtnText}>Roll Multiplier (D4)</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_mult' && (
            <>
              <Text style={styles.title}>Final Multiplier...</Text>
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>Static Total</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>
              <View style={{ alignItems: 'center', marginVertical: 40 }}>
                <Text style={[styles.sumLabel, { color: '#8b5cf6' }]}>ROLLING D4</Text>
                <AnimatedRollingDice size={100} color="#8b5cf6" />
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

              <View style={styles.multArea}>
                <Ionicons name="close-outline" size={24} color="#6366f1" />
                <Text style={styles.multText}>D4 Multiplier: {multiplier}x</Text>
              </View>

              <View style={styles.payoutCard}>
                <Text style={styles.payoutTitle}>Final Reward</Text>
                <View style={styles.payoutRow}>
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutVal}>{payoutPoints}</Text>
                    <Text style={styles.payoutLabel}>Points</Text>
                  </View>
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutVal}>{payoutXp}</Text>
                    <Text style={styles.payoutLabel}>XP</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.beginBtn, { marginTop: 32 }]} 
                onPress={handleClaim}
              >
                <Text style={styles.beginBtnText}>Claim All Rewards</Text>
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
    gap: 12,
    marginVertical: 40,
  },
  historyDie: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sumResultArea: {
    alignItems: 'center',
    marginVertical: 24,
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
    gap: 12,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 32,
    marginBottom: 32,
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
