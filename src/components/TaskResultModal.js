import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useEconomy } from '../lib/EconomyContext';
import { useTasks } from '../lib/TasksContext';
import { colors } from '../theme';
import Dice3D from './Dice3D';

const OPTIONS = [
  { label: 'Quick Win [Close to No Effort to Finish]', count: 1, mode: 'highest', color: '#10b981', multiDice: 4 },
  { label: 'On-Time [Completed On-Time or started a new hot streak]', count: 2, mode: 'highest', color: '#3b82f6', multiDice: 4 },
  { label: 'Missed or Hot Streak was between 3-6 days', count: 3, mode: 'highest', color: '#8b5cf6', multiDice: 4 },
  { label: 'Missed or Hot Streak was 7-14 days', count: 2, mode: 'sum', color: '#f59e0b', multiDice: 4 },
  { label: 'Missed or Hot Streak was higher than 15 days', count: 3, mode: 'sum', color: '#7c3aed', multiDice: 4 },
  { label: 'Missed or Hot Streak was higher than 30 days', count: 2, mode: 'sum', color: '#ec4899', multiDice: 20 },
];

export default function TaskResultModal({ visible, task, onClose, onComplete }) {
  const { addReward } = useEconomy();
  const { startBreak } = useTasks();
  const [step, setStep] = useState('select'); // select | roll | result
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [baseRoll, setBaseRoll] = useState(1);
  const [rollDetails, setRollDetails] = useState({ r1: 0, r2: 0, r3: 0 });
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
      let r1 = Math.floor(Math.random() * 20) + 1;
      let r2 = opt.count >= 2 ? Math.floor(Math.random() * 20) + 1 : 0;
      let r3 = opt.count >= 3 ? Math.floor(Math.random() * 20) + 1 : 0;
      
      let base;
      if (opt.mode === 'highest') {
        base = Math.max(r1, r2, r3);
      } else {
        base = r1 + r2 + r3;
      }
      
      setRollDetails({ r1, r2, r3 });
      setBaseRoll(base);
      setStep('showBase');
      spinVal.setValue(0);
      
      // Wait to reveal base number
      setTimeout(() => {
        setStep('rollMulti');
        playRollSound();
        
        // Second roll: Multiplier
        Animated.timing(spinVal, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          const multi = Math.floor(Math.random() * (opt.multiDice || 4)) + 1;
          setMultiRoll(multi);
          
          const pts = base * multi;
          const xp = Math.floor(pts / 2);
          
          addReward(pts, xp);
          
          // Wait to reveal multiplier number before showing final aggregate
          setTimeout(() => {
            setStep('result');
            spinVal.setValue(0);
          }, 2000);
        });
      }, 3000);
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
              <Text style={styles.sub}>
                Choose your reward tier: [H] = Highest d20 | [Σ] = Sum of d20s | [xd20] = d20 Multiplier
              </Text>
              {OPTIONS.map((opt, i) => (
                <TouchableOpacity key={i} style={[styles.optBtn, { borderColor: opt.color }]} onPress={() => handleRoll(opt)}>
                  <View style={[styles.diceBadge, { backgroundColor: opt.color }]}>
                    <Text style={styles.diceText}>
                      {opt.count}d20{opt.mode === 'highest' ? ' [H]' : (opt.multiDice === 20 ? ' [xd20]' : ' [Σ]')}
                    </Text>
                  </View>
                  <Text style={[styles.optLabel, { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {step === 'rollBase' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>Rolling {selectedOpt.count}d20 ({selectedOpt.mode === 'highest' ? 'Highest' : 'Total'})...</Text>
              <View style={{ height: 120, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Dice3D size={110} rolling={true} color={selectedOpt.color} />
                {selectedOpt.count >= 2 && <Dice3D size={110} rolling={true} color={selectedOpt.color} />}
                {selectedOpt.count >= 3 && <Dice3D size={110} rolling={true} color={selectedOpt.color} />}
              </View>
            </View>
          )}

          {step === 'showBase' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>
                {selectedOpt.mode === 'highest' && selectedOpt.count > 1
                  ? `Best Roll: ${baseRoll}!` 
                  : selectedOpt.mode === 'sum' 
                    ? `Total: ${baseRoll}!`
                    : `You rolled a ${baseRoll}!`}
              </Text>
              <View style={{ height: 110, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Dice3D size={110} rolling={false} result={rollDetails.r1} color={selectedOpt.color} />
                {selectedOpt.count >= 2 && <Dice3D size={110} rolling={false} result={rollDetails.r2} color={selectedOpt.color} />}
                {selectedOpt.count >= 3 && <Dice3D size={110} rolling={false} result={rollDetails.r3} color={selectedOpt.color} />}
              </View>
              {selectedOpt.count > 1 && (
                <Text style={{ marginTop: 8, color: '#6b7280', fontSize: 13, fontWeight: '600' }}>
                  {selectedOpt.mode === 'highest' 
                    ? `(${rollDetails.r1}, ${rollDetails.r2}${selectedOpt.count === 3 ? `, ${rollDetails.r3}` : ''})`
                    : `(${rollDetails.r1} + ${rollDetails.r2}${selectedOpt.count === 3 ? ` + ${rollDetails.r3}` : ''})`}
                </Text>
              )}
            </View>
          )}

          {step === 'rollMulti' && (
            <View style={styles.rollContainer}>
              <Text style={styles.title}>Rolling Multiplier (d{selectedOpt.multiDice || 4})...</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: selectedOpt.color }}>{baseRoll}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Base</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#d1d5db' }}>x</Text>
                {selectedOpt.multiDice === 20 ? (
                  <View style={{ height: 100, width: 100 }}>
                    <Dice3D size={100} rolling={true} color="#6366f1" />
                  </View>
                ) : (
                  <Animated.View style={{ transform: [{ rotate: spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] }) }] }}>
                    <Ionicons name="dice" size={80} color="#6366f1" />
                  </Animated.View>
                )}
              </View>
            </View>
          )}

          {step === 'result' && (
            <View style={styles.resultContainer}>
              <Text style={styles.title}>Rewards Gained!</Text>
              
              <View style={styles.calcRow}>
                <View style={styles.calcBox}>
                  <Text style={styles.calcLbl}>{selectedOpt.count}d20 ({selectedOpt.mode === 'highest' ? 'Best' : 'Sum'})</Text>
                  <Text style={styles.calcVal}>{baseRoll}</Text>
                </View>
                <Text style={styles.calcMath}>x</Text>
                <View style={styles.calcBox}>
                  <Text style={styles.calcLbl}>Mult (d{selectedOpt.multiDice || 4})</Text>
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
