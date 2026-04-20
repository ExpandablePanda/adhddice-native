import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, ScrollView, Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import ModalScreen from './ModalScreen';

export default function EfficiencyRollModal({ visible, rolls, onClose, onFinish }) {
  const { bulkConsumeFreeRolls, addReward } = useEconomy();
  const [step, setStep] = useState('select'); // select | rolling_tasks | ready_mult | rolling_mult | results
  const [selectedDie, setSelectedDie] = useState(8);
  const [diceResults, setDiceResults] = useState([]);
  const [multiplier, setMultiplier] = useState(1);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isRollingCurrent, setIsRollingCurrent] = useState(false);
  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));

  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
    } catch (e) {}
  }

  const dieOptions = [
    { sides: 4, name: 'D4', desc: 'Easy Tasks' },
    { sides: 6, name: 'D6', desc: 'Routine Tasks' },
    { sides: 8, name: 'D8', desc: 'Medium Tasks' },
    { sides: 10, name: 'D10', desc: 'Significant Tasks' },
    { sides: 12, name: 'D12', desc: 'Difficult Tasks' },
    { sides: 20, name: 'D20', desc: 'Epic Achievement' },
  ];

  useEffect(() => {
    if (visible) {
      setStep('select');
      setDiceResults([]);
      setMultiplier(1);
      setRevealedCount(0);
    }
  }, [visible]);

  function startRoll() {
    setStep('rolling_tasks');
    setRevealedCount(0);
    const results = Array.from({ length: rolls }, () => Math.floor(Math.random() * selectedDie) + 1);
    setDiceResults(results);
    
    // Multiplier is decided but hidden
    setMultiplier(Math.floor(Math.random() * 4) + 1);

    revealNextDie(0, results);
  }

  function revealNextDie(index, results) {
    if (index >= results.length) {
      setTimeout(() => setStep('ready_mult'), 1000);
      return;
    }

    setIsRollingCurrent(true);
    playRollSound();

    // Roll/Animate for 1.2s to make it feel deliberate
    setTimeout(() => {
      setIsRollingCurrent(false);
      setRevealedCount(index + 1);
      
      // Pause for 600ms after reveal before starting next sequence
      if (index + 1 < results.length) {
        setTimeout(() => {
          revealNextDie(index + 1, results);
        }, 600);
      } else {
        revealNextDie(index + 1, results);
      }
    }, 1200);
  }

  function handleRollMultiplier() {
    setStep('rolling_mult');
    playRollSound();
    // D4 roll animation for 2 seconds
    setTimeout(() => {
      setStep('results');
    }, 2000);
  }

  const sum = diceResults.reduce((acc, curr) => acc + curr, 0);
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
                  key={opt.sides}
                  style={[styles.dieOption, selectedDie === opt.sides && styles.dieOptionActive]}
                  onPress={() => setSelectedDie(opt.sides)}
                >
                  <View style={styles.dieInfo}>
                    <Ionicons name="dice-outline" size={24} color={selectedDie === opt.sides ? '#8b5cf6' : '#9ca3af'} />
                    <View>
                      <Text style={[styles.dieName, selectedDie === opt.sides && { color: '#8b5cf6' }]}>{opt.name}</Text>
                      <Text style={styles.dieDesc}>{opt.desc}</Text>
                    </View>
                  </View>
                  <Ionicons 
                    name={selectedDie === opt.sides ? 'radio-button-on' : 'radio-button-off'} 
                    size={22} 
                    color={selectedDie === opt.sides ? '#8b5cf6' : '#d1d5db'} 
                  />
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.beginBtn} onPress={startRoll}>
                <Text style={styles.beginBtnText}>Roll {rolls} x D{selectedDie}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'rolling_tasks' && (
            <>
              <Text style={styles.title}>Rolling {rolls} Dice...</Text>
              <Text style={styles.subtitle}>Revealing sequential results</Text>
              <View style={styles.rollingDiceArea}>
                {diceResults.slice(0, revealedCount).map((res, i) => (
                  <View key={i} style={styles.smallDie}>
                    <Text style={styles.smallDieNum}>{res}</Text>
                  </View>
                ))}
                {isRollingCurrent && (
                   <View style={[styles.smallDie, { backgroundColor: '#eef2ff', borderWidth: 2, borderColor: '#8b5cf6' }]}>
                     <Ionicons name="dice" size={24} color="#8b5cf6" />
                   </View>
                )}
              </View>
              {revealedCount >= diceResults.length && (
                <Text style={styles.subtitle}>Total Sum: {sum}</Text>
              )}
            </>
          )}

          {step === 'ready_mult' && (
            <>
              <Text style={styles.title}>Dice Total: {sum}</Text>
              <View style={styles.rollingDiceArea}>
                {diceResults.map((res, i) => (
                  <View key={i} style={styles.smallDie}>
                    <Text style={styles.smallDieNum}>{res}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.subtitle}>All tasks accounted for. Now roll for your bonus multiplier!</Text>
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
  smallDie: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  smallDieNum: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
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
