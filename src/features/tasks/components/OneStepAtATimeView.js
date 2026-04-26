import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { STATUSES } from '../../../lib/TasksContext';
import IconSetStatusMenu from '../../../components/IconSetStatusMenu';

export default function OneStepAtATimeView({ queue, index, onStatusChange, onExit, onSkip, onBreakDown }) {
  const [breakVisible, setBreakVisible] = useState(false);
  const [breakText, setBreakText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTask, setPickerTask] = useState(null);
  const [showBankedAnim, setShowBankedAnim] = useState(false);


  const step = queue[index];

  if (!step) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={80} color="#10b981" />
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 20, textAlign: 'center' }}>All Steps Complete!</Text>
          <Text style={{ fontSize: 16, color: '#6b7280', marginTop: 8, textAlign: 'center', marginBottom: 32 }}>You've cleared your focus queue. Great work!</Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#8b5cf6', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 }}
            onPress={onExit}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Back to Tasks</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const currentStatus = step.status || 'pending';
  const cfg = STATUSES[currentStatus] || STATUSES.pending;

  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={onExit} style={{ width: 40 }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
              <Ionicons name="close" size={28} color="#4b5563" />
            </TouchableOpacity>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 1 }}>One Step at a Time</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Body */}
          <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ marginBottom: 60, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 }}>Step {index + 1} of {queue.length}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {queue.map((_, i) => (
                  <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? '#8b5cf6' : (i < index ? '#10b981' : '#f3f4f6') }} />
                ))}
              </View>
            </View>

            {step.parentTitle && (
              <View style={{ backgroundColor: '#f5f3ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase' }}>{step.parentTitle}</Text>
              </View>
            )}
            
            <Text style={{ fontSize: 32, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 20, lineHeight: 40 }}>{step.title}</Text>

            {(() => {
              const allSubs = [];
              function collect(subs, depth = 0) {
                subs.forEach(s => {
                  allSubs.push({ ...s, depth });
                  if (s.subtasks && s.subtasks.length > 0) {
                    collect(s.subtasks, depth + 1);
                  }
                });
              }
              collect(step.subtasks || []);

              if (allSubs.length === 0) return null;

              return (
                <View style={{ width: '100%', marginBottom: 30, backgroundColor: '#f9fafb', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 }}>Sub-Steps</Text>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {allSubs.map(sub => {
                      const isDone = sub.status === 'done' || sub.status === 'did_my_best';
                      const subCfg = STATUSES[sub.status || 'pending'] || STATUSES.pending;
                      return (
                        <View 
                          key={sub.id} 
                          style={{ 
                            flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, 
                            borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                            marginLeft: sub.depth * 20
                          }}
                        >
                          <TouchableOpacity 
                            style={{ 
                              flexDirection: 'row', alignItems: 'center', gap: 6, 
                              backgroundColor: subCfg.color + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                              borderWidth: 1, borderColor: subCfg.color + '30'
                            }}
                            onPress={() => setPickerTask(sub)}
                          >
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: subCfg.color }} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: subCfg.color, textTransform: 'uppercase' }}>{subCfg.label}</Text>
                          </TouchableOpacity>
                          
                          <Text style={{ flex: 1, fontSize: 15, color: isDone ? "#9ca3af" : "#374151", textDecorationLine: isDone ? 'line-through' : 'none' }}>{sub.title}</Text>
                          
                          {!isDone && (
                            <TouchableOpacity 
                              onPress={() => {
                                onStatusChange(sub, 'done', true);
                                setShowBankedAnim(true);
                                setTimeout(() => setShowBankedAnim(false), 2000);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons name="checkmark-circle-outline" size={22} color="#d1d5db" />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}

            {/* Banked Reward Feedback */}
            {showBankedAnim && (
              <View style={{ position: 'absolute', top: 100, backgroundColor: '#10b981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }}>
                <Ionicons name="dice" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Roll Banked!</Text>
              </View>
            )}

            {/* Status Button (Opens Picker) */}
            <TouchableOpacity 
              style={{ 
                backgroundColor: cfg.color, width: '100%', paddingVertical: 24, borderRadius: 30, alignItems: 'center', 
                shadowColor: cfg.color, shadowOpacity: 0.2, shadowRadius: 15, elevation: 5,
                flexDirection: 'row', justifyContent: 'center', gap: 12
              }}
              onPress={() => setShowPicker(true)}
            >
              <Ionicons name={cfg.icon} size={24} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }}>{cfg.label}</Text>
              <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 16, marginTop: 24, width: '100%' }}>
              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={() => setBreakVisible(true)}
              >
                <Ionicons name="git-branch-outline" size={22} color="#4b5563" />
                <Text style={styles.actionBtnText}>Break it Down</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={onSkip}
              >
                <Ionicons name="arrow-forward-outline" size={22} color="#4b5563" />
                <Text style={styles.actionBtnText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        <IconSetStatusMenu 
          visible={showPicker || !!pickerTask}
          task={pickerTask || step}
          onClose={() => { setShowPicker(false); setPickerTask(null); }}
          onConfirm={(task, key) => {
            const isSub = !!pickerTask;
            onStatusChange(task, key, isSub);
            if (key === 'done' || key === 'did_my_best') {
              setShowBankedAnim(true);
              setTimeout(() => setShowBankedAnim(false), 2000);
            }
          }}
        />

        {/* Breakdown Overlay */}
        {breakVisible && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }]}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Break it Down</Text>
              <Text style={styles.modalSub}>What's the very first tiny step to get this moving?</Text>
              <TextInput 
                style={styles.modalInput}
                placeholder="e.g. Open the document..."
                autoFocus
                value={breakText}
                onChangeText={setBreakText}
                onSubmitEditing={() => {
                  if (!breakText) return;
                  onBreakDown(breakText);
                  setBreakText('');
                  setBreakVisible(false);
                }}
              />
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setBreakVisible(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.confirmBtn} 
                  onPress={() => {
                    if (!breakText) return;
                    onBreakDown(breakText);
                    setBreakText('');
                    setBreakVisible(false);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Add Step</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionBtn: { 
    flex: 1, 
    backgroundColor: '#f9fafb', 
    paddingVertical: 18, 
    borderRadius: 20, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#f3f4f6' 
  },
  actionBtnText: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#4b5563', 
    marginTop: 6 
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  modalInput: { 
    width: '100%', 
    marginBottom: 20,
    borderWidth: 1, 
    borderColor: '#e5e7eb', 
    borderRadius: 10, 
    padding: 12, 
    fontSize: 15, 
    color: '#111827', 
    backgroundColor: '#f9fafb' 
  },
  cancelBtn: { 
    flex: 1, 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#e5e7eb' 
  },
  cancelText: { color: '#6b7280', fontWeight: '700' },
  confirmBtn: { 
    flex: 1, 
    backgroundColor: '#8b5cf6', 
    borderRadius: 12, 
    padding: 14, 
    alignItems: 'center' 
  },
  pickerContent: {
    backgroundColor: '#fff',
    width: '100%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
    paddingBottom: 50,
  },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  pickerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 16, 
    borderWidth: 1.5,
    minWidth: '45%'
  },
  statusChipText: { fontSize: 14, fontWeight: '700' }
});
