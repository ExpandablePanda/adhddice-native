import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useEconomy } from '../lib/EconomyContext';
import { useTasks } from '../lib/TasksContext';
import { colors } from '../theme';

const OPTIONS = [
  { label: 'Easy (Quick win, low effort)', dice: 4, color: '#10b981' },
  { label: 'On Time (Completed on time)', dice: 6, color: '#3b82f6' },
  { label: 'Restarted Streak (Back on track)', dice: 8, color: '#8b5cf6' },
  { label: 'Procrastinated Few Days (2-6 days)', dice: 10, color: '#f59e0b' },
  { label: 'Procrastinated a Week+ (>1 week)', dice: 12, color: '#f97316' },
  { label: 'Procrastinated Months (Finally!)', dice: 20, color: '#ef4444' },
];

export default function TaskResultModal({ visible, task, onClose, onComplete }) {
  const { addReward } = useEconomy();
  const { startBreak } = useTasks();
  const [step, setStep] = useState('select'); // select | roll | result
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [baseRoll, setBaseRoll] = useState(1);
  const [multiRoll, setMultiRoll] = useState(1);
  
  const spinVal = useRef(new Animated.Value(0)).current;
  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));

  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
    } catch (e) {}
  }

  useEffect(() => {
    if (visible) {
      setStep('select');
      setSelectedOpt(null);
    }
  }, [visible]);

  function handleRoll(opt) {
    setSelectedOpt(opt);
    setStep('rollBase');
    playRollSound();
    
    // First roll: Base dice
    Animated.timing(spinVal, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const base = Math.floor(Math.random() * opt.dice) + 1;
      setBaseRoll(base);
      setStep('showBase');
      spinVal.setValue(0);
      
      // Wait to reveal base number
      setTimeout(() => {
        setStep('rollMulti');
        playRollSound();
        
        // Second roll: d20 Multiplier
        Animated.timing(spinVal, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          const multi = Math.floor(Math.random() * 4) + 1; // Multiplier is always d4
          setMultiRoll(multi);
          
          const pts = base * multi;
          const xp = Math.floor(pts / 2);
          
          addReward(pts, xp);
          setStep('result');
          spinVal.setValue(0);
        });
      }, 1500);
    });
  }

  function handleClose() {
    if (task) {
      // onComplete → handleTaskCompleting → setCompletingTask(null) hides the modal
      onComplete(task.id, { points: baseRoll * multiRoll, xp: Math.floor((baseRoll * multiRoll) / 2) });
    } else {
      onClose();
    }
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalBody}>
          {step === 'select' && (
            <>
              <TouchableOpacity style={styles.xBtn} onPress={onClose}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
              <Text style={styles.title}>
                {task._isBulk ? `Bulk Collection (${task.rewardsCount})` : 'Task Complete!'}
              </Text>
              <Text style={styles.sub}>How did it go? Choose the option that best fits.</Text>
              {OPTIONS.map((opt, i) => (
                <TouchableOpacity key={i} style={[styles.optBtn, { borderColor: opt.color }]} onPress={() => handleRoll(opt)}>
                  <View style={[styles.diceBadge, { backgroundColor: opt.color }]}>
                    <Text style={styles.diceText}>d{opt.dice}</Text>
                  </View>
                  <Text style={[styles.optLabel, { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {step === 'rollBase' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>Rolling Initial (d{selectedOpt.dice})...</Text>
              <Animated.View style={{ transform: [{ rotate: spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] }) }] }}>
                <Ionicons name="dice" size={80} color={selectedOpt.color} />
              </Animated.View>
            </View>
          )}

          {step === 'showBase' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>You rolled a {baseRoll}!</Text>
              <Ionicons name="dice" size={80} color={selectedOpt.color} />
            </View>
          )}

          {step === 'rollMulti' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>Rolling Multiplier (d4)...</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: selectedOpt.color }}>{baseRoll}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Base</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#d1d5db' }}>x</Text>
                <Animated.View style={{ transform: [{ rotate: spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] }) }] }}>
                  <Ionicons name="dice" size={80} color="#6366f1" />
                </Animated.View>
              </View>
            </View>
          )}

          {step === 'result' && (
            <View style={styles.resultContainer}>
              <Text style={styles.title}>Rewards Gained!</Text>
              
              <View style={styles.calcRow}>
                <View style={styles.calcBox}>
                  <Text style={styles.calcLbl}>d{selectedOpt.dice}</Text>
                  <Text style={styles.calcVal}>{baseRoll}</Text>
                </View>
                <Text style={styles.calcMath}>x</Text>
                <View style={styles.calcBox}>
                  <Text style={styles.calcLbl}>Mult (d4)</Text>
                  <Text style={styles.calcVal}>{multiRoll}</Text>
                </View>
              </View>


              <View style={styles.finalBox}>
                <Text style={styles.finalPts}>+{baseRoll * multiRoll} Points</Text>
                <Text style={styles.finalXp}>+{Math.floor((baseRoll * multiRoll) / 2)} XP</Text>
              </View>

              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Awesome!</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBody: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  xBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  optBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  diceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 12,
  },
  diceText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  optLabel: {
    flex: 1,
    fontWeight: '600',
    fontSize: 14,
  },
  rollContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  resultContainer: {
    alignItems: 'center',
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 20,
  },
  calcBox: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 16,
    minWidth: 80,
  },
  calcLbl: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 4,
  },
  calcVal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  calcMath: {
    fontSize: 24,
    fontWeight: '800',
    color: '#d1d5db',
  },
  finalBox: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  finalPts: {
    fontSize: 24,
    fontWeight: '800',
    color: '#059669',
    marginBottom: 4,
  },
  finalXp: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
