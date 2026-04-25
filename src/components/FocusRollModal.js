import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, ScrollView, Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import ModalScreen from './ModalScreen';
import Dice3D from './Dice3D';

export default function FocusRollModal({ visible, rolls, mode = 'reward', onClose, onFinish }) {
  const { bulkConsumeFreeRolls, addReward, removeReward } = useEconomy();
  const [step, setStep] = useState('select'); // select | rolling_tasks | ready_mult | rolling_mult | results
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [multiplier, setMultiplier] = useState(1);
  const [finalResults, setFinalResults] = useState([]); // Array of winners
  const [earnedTokens, setEarnedTokens] = useState(0);
  
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
    { id: 'easy', count: 1, name: 'Light Focus', desc: '1d20 per slot' },
    { id: 'medium', count: 2, name: 'Deep Focus', desc: 'Best of 2d20 per slot' },
    { id: 'hard', count: 3, name: 'Flow State', desc: 'Best of 3d20 per slot' },
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
      setEarnedTokens(0);
    }
  }, [visible]);

  function startRoll() {
    setStep('rolling_tasks');
    setFinalResults([]);
    setCurrentTaskIndex(0);
    
    // Multiplier is decided but hidden
    setMultiplier(Math.floor(Math.random() * 6) + 1);

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
    if (subIdx >= selectedOpt.count) {
      // All subs for this task are done
      setAnimationStage('settled');
      setCurrentSubRollingIndex(-1);
      
      const winner = Math.max(...accumulatedSubs);
      
      setTimeout(() => {
        setAnimationStage('cleanup');
        setTimeout(() => {
          if (winner > 15) setEarnedTokens(prev => prev + 1);
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
    // D6 roll animation for 1.2 second
    setTimeout(() => {
      setStep('show_mult');
      // Show result face for 1.2s
      setTimeout(() => {
        setStep('results');
      }, 1200);
    }, 1200);
  }

  const sum = finalResults.reduce((acc, curr) => acc + curr, 0);
  const payoutPoints = sum * multiplier;
  const payoutXp = Math.floor(payoutPoints / 2);

  const handleClaim = () => {
    if (mode === 'reward') {
      addReward(payoutPoints, payoutXp, earnedTokens);
    } else {
      removeReward(payoutPoints, 0); // No XP deduction
    }
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
          <Text style={styles.headerTitle}>{mode === 'reward' ? 'Focus Roll' : 'Distraction Penalty'}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {step === 'select' && (
            <>
              <Text style={styles.title}>{mode === 'reward' ? 'Focus Reward' : 'Calculate Penalty'}</Text>
              <Text style={styles.subtitle}>
                {mode === 'reward' 
                  ? `You logged ${rolls} focus slots. Select the intensity of your focus to roll for points.`
                  : `You incurred a ${rolls}-die penalty. Select the distraction severity to calculate the deduction.`
                }
              </Text>

              {dieOptions.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.dieOption, selectedOpt?.id === opt.id && { backgroundColor: mode === 'reward' ? '#f5f3ff' : '#fef2f2', borderColor: mode === 'reward' ? '#6d28d9' : '#ef4444' }]}
                  onPress={() => setSelectedOpt(opt)}
                >
                  <View style={styles.dieInfo}>
                    <Ionicons name="dice-outline" size={24} color={selectedOpt?.id === opt.id ? (mode === 'reward' ? '#6d28d9' : '#ef4444') : '#9ca3af'} />
                    <View>
                      <Text style={[styles.dieName, selectedOpt?.id === opt.id && { color: '#8b5cf6' }]}>{opt.name}</Text>
                      <Text style={styles.dieDesc}>{opt.desc}</Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={selectedOpt?.id === opt.id ? 'radio-button-on' : 'radio-button-off'} 
                    size={22} 
                    color={selectedOpt?.id === opt.id ? (mode === 'reward' ? '#6d28d9' : '#ef4444') : '#d1d5db'} 
                  />
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={[styles.beginBtn, { backgroundColor: mode === 'reward' ? '#6d28d9' : '#ef4444', shadowColor: mode === 'reward' ? '#6d28d9' : '#ef4444' }]} onPress={startRoll}>
                <Text style={styles.beginBtnText}>{mode === 'reward' ? 'Roll' : 'Incur'} {rolls} x {selectedOpt?.name}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_tasks' && (
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text style={styles.title}>Focus Sequence</Text>
              <Text style={styles.subtitle}>Slot {currentTaskIndex + 1} of {rolls}</Text>
              
              <View style={{ height: 200, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 30 }}>
                {/* 1. Show already settled subs */}
                {currentSubs.map((val, idx) => {
                  const isWinner = val === Math.max(...currentSubs);
                  const isLoser = animationStage === 'cleanup' && !isWinner;
                  if (isLoser) return null;

                  return (
                    <View key={idx} style={{ alignItems: 'center' }}>
                      <Dice3D size={120} rolling={false} result={val} color={mode === 'reward' ? '#6d28d9' : '#ef4444'} />
                      {(isWinner && (animationStage === 'settled' || animationStage === 'cleanup')) && (
                        <View style={{ marginTop: 10, backgroundColor: mode === 'reward' ? '#6d28d9' : '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{mode === 'reward' ? 'BEST' : 'WORST'}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* 2. Show the currently rolling sub */}
                {animationStage === 'rolling' && (
                  <View style={{ alignItems: 'center' }}>
                    <Dice3D size={120} rolling={true} color={mode === 'reward' ? '#6d28d9' : '#ef4444'} />
                  </View>
                )}
              </View>

              <Text style={styles.sumLabel}>History</Text>
              <View style={[styles.rollingDiceArea, { marginTop: 0 }]}>
                {finalResults.map((res, i) => (
                  <View key={i} style={styles.historyDie}>
                    <Dice3D size={50} rolling={false} result={res} color={mode === 'reward' ? '#8b5cf6' : '#ef4444'} />
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
                    <Dice3D size={50} rolling={false} result={res} color={mode === 'reward' ? '#8b5cf6' : '#ef4444'} />
                  </View>
                ))}
              </View>
              <Text style={styles.subtitle}>
                {mode === 'reward' ? 'Excellent focus!' : 'Stay strong!'} Now roll for your final Focus {mode === 'reward' ? 'Multiplier' : 'Mitigation'}.
              </Text>
              <TouchableOpacity style={[styles.beginBtn, { backgroundColor: mode === 'reward' ? '#4f46e5' : '#111827' }]} onPress={handleRollMultiplier}>
                <Ionicons name={mode === 'reward' ? 'flash' : 'shield-checkmark'} size={20} color="#fff" style={{marginRight: 8}}/>
                <Text style={styles.beginBtnText}>Roll {mode === 'reward' ? 'Multiplier' : 'Mitigation'} (D6)</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_mult' && (
            <>
              <Text style={styles.title}>{mode === 'reward' ? 'Final Multiplier...' : 'Calculating Mitigation...'}</Text>
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>{mode === 'reward' ? 'Static Total' : 'Gross Penalty'}</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>
              <View style={{ alignItems: 'center', marginVertical: 40 }}>
                <Text style={[styles.sumLabel, { color: mode === 'reward' ? '#6d28d9' : '#ef4444' }]}>ROLLING D6</Text>
                <Dice3D size={140} rolling={true} color={mode === 'reward' ? '#6d28d9' : '#ef4444'} type="d6" />
              </View>
            </>
          )}

          {step === 'show_mult' && (
            <>
              <Text style={styles.title}>{mode === 'reward' ? 'Multiplier Result!' : 'Mitigation Result!'}</Text>
              <View style={styles.sumResultArea}>
                <Text style={styles.sumLabel}>{mode === 'reward' ? 'Static Total' : 'Gross Penalty'}</Text>
                <Text style={styles.sumVal}>{sum}</Text>
              </View>
              <View style={{ alignItems: 'center', marginVertical: 40 }}>
                <Text style={[styles.sumLabel, { color: mode === 'reward' ? '#6d28d9' : '#ef4444' }]}>{multiplier}x</Text>
                <Dice3D size={140} rolling={false} result={multiplier} color={mode === 'reward' ? '#6d28d9' : '#ef4444'} type="d6" />
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

              <View style={[styles.multArea, { backgroundColor: mode === 'reward' ? '#eef2ff' : '#fff1f2' }]}>
                <Ionicons name={mode === 'reward' ? 'close-outline' : 'remove-circle-outline'} size={24} color={mode === 'reward' ? '#6366f1' : '#ef4444'} />
                <Text style={[styles.multText, { color: mode === 'reward' ? '#4f46e5' : '#ef4444' }]}>
                  {mode === 'reward' ? `D6 Multiplier: ${multiplier}x` : `D6 Mitigation: ${multiplier}x factor`}
                </Text>
              </View>

              <View style={[styles.payoutCard, { borderColor: mode === 'reward' ? '#8b5cf610' : '#ef444410', backgroundColor: mode === 'reward' ? '#faf9ff' : '#fffbfb' }]}>
                <Text style={[styles.payoutTitle, { color: mode === 'reward' ? '#8b5cf6' : '#ef4444' }]}>
                  {mode === 'reward' ? 'Final Reward' : 'Final Deduction'}
                </Text>
                <View style={styles.payoutRow}>
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutVal}>{payoutPoints}</Text>
                    <Text style={styles.payoutLabel}>Points</Text>
                  </View>
                  {mode === 'reward' && (
                    <View style={styles.payoutItem}>
                      <Text style={styles.payoutVal}>{payoutXp}</Text>
                      <Text style={styles.payoutLabel}>XP</Text>
                    </View>
                  )}
                  {mode === 'reward' && earnedTokens > 0 && (
                    <View style={styles.payoutItem}>
                      <Text style={[styles.payoutVal, { color: '#8b5cf6' }]}>{earnedTokens}</Text>
                      <Text style={styles.payoutLabel}>Tokens</Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.beginBtn, { marginTop: 32, backgroundColor: mode === 'reward' ? '#6d28d9' : '#111827' }]} 
                onPress={handleClaim}
              >
                <Text style={styles.beginBtnText}>
                  {mode === 'reward' ? 'Claim All Rewards' : 'Accept Penalty'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </ModalScreen>
    </Modal>
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
    borderColor: '#6d28d9',
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
    backgroundColor: '#6d28d9',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#6d28d9',
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
    borderColor: '#6d28d910',
    alignItems: 'center',
    backgroundColor: '#faf9ff',
  },
  payoutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#a855f7',
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
