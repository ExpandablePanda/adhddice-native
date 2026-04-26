import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeDateKey, getAppDayKey, STATUSES } from '../../../lib/TasksContext';

export default function MomentumBar({ 
  tasks, 
  stats, 
  momentumMode, 
  setMomentumMode, 
  dayStartTime, 
  onOpenTask 
}) {
  const [showMomentumList, setShowMomentumList] = useState(false);

  return (
    <View>
      {/* ── Momentum Bar (Interactive) ── */}
      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={() => setMomentumMode(prev => {
          if (prev === 'urgent') return 'focus';
          if (prev === 'focus') return 'due';
          if (prev === 'due') return 'recurring';
          if (prev === 'recurring') return 'oneoff';
          return 'urgent';
        })}
        onLongPress={() => setShowMomentumList(true)}
        delayLongPress={500}
        style={{ marginTop: 12, marginBottom: 4 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>
              {momentumMode === 'urgent' ? 'Urgent Momentum' : 
               momentumMode === 'focus' ? 'Focus Momentum' : 
               momentumMode === 'due' ? 'Due Today Momentum' : 
               momentumMode === 'recurring' ? 'Recurring Momentum' : 
               'One & Done Momentum'}
            </Text>
            {(() => {
              let done, total, color, bg;
              if (momentumMode === 'urgent') { done = stats.urgentDone; total = stats.urgentTotal; color = '#ef4444'; bg = '#fee2e2'; }
              else if (momentumMode === 'focus') { done = stats.focusDone; total = stats.focusTotal; color = '#8b5cf6'; bg = '#f5f3ff'; }
              else if (momentumMode === 'due') { done = stats.dueDone; total = stats.dueTotal; color = '#0ea5e9'; bg = '#e0f2fe'; }
              else if (momentumMode === 'recurring') { done = stats.recurringDone; total = stats.recurringTotal; color = '#10b981'; bg = '#d1fae5'; }
              else { done = stats.oneOffDone; total = stats.oneOffTotal; color = '#f59e0b'; bg = '#fef3c7'; }
              
              if (total === 0) return null;
              const pct = Math.round((done / total) * 100);
              return (
                <View style={{ backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: color }}>{pct}%</Text>
                </View>
              );
            })()}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>
            {(() => {
              let done, total, color, label;
              if (momentumMode === 'urgent') { done = stats.urgentDone; total = stats.urgentTotal; color = '#ef4444'; label = 'Urgent'; }
              else if (momentumMode === 'focus') { done = stats.focusDone; total = stats.focusTotal; color = '#10b981'; label = 'Tasks'; }
              else if (momentumMode === 'due') { done = stats.dueDone; total = stats.dueTotal; color = '#0ea5e9'; label = 'Due'; }
              else if (momentumMode === 'recurring') { done = stats.recurringDone; total = stats.recurringTotal; color = '#10b981'; label = 'Recurring'; }
              else { done = stats.oneOffDone; total = stats.oneOffTotal; color = '#f59e0b'; label = 'One & Done'; }

              if (total === 0) return `No ${label} Tasks`;
              return <><Text style={{ color: color }}>{done}</Text> / {total} {label} Done</>;
            })()}
          </Text>
        </View>
        <View style={{ height: 10, backgroundColor: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
          <View 
            style={{ 
              height: '100%', 
              width: `${(() => {
                let done, total;
                if (momentumMode === 'urgent') { done = stats.urgentDone; total = stats.urgentTotal; }
                else if (momentumMode === 'focus') { done = stats.focusDone; total = stats.focusTotal; }
                else if (momentumMode === 'due') { done = stats.dueDone; total = stats.dueTotal; }
                else if (momentumMode === 'recurring') { done = stats.recurringDone; total = stats.recurringTotal; }
                else { done = stats.oneOffDone; total = stats.oneOffTotal; }
                return total > 0 ? (done / total) * 100 : 0;
              })()}%`, 
              backgroundColor: momentumMode === 'urgent' ? '#ef4444' : 
                               momentumMode === 'focus' ? '#8b5cf6' : 
                               momentumMode === 'due' ? '#0ea5e9' : 
                               momentumMode === 'recurring' ? '#10b981' : '#f59e0b',
              borderRadius: 5,
              shadowColor: momentumMode === 'urgent' ? '#ef4444' : 
                           momentumMode === 'focus' ? '#8b5cf6' : 
                           momentumMode === 'due' ? '#0ea5e9' : 
                           momentumMode === 'recurring' ? '#10b981' : '#f59e0b',
              shadowOpacity: 0.5,
              shadowRadius: 4,
            }} 
          />
        </View>
        <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', marginTop: 4, textAlign: 'center', letterSpacing: 0.5 }}>Tap to Switch • Long Press to See List</Text>
      </TouchableOpacity>

      {/* Momentum List Modal */}
      {showMomentumList && (
        <Modal 
          visible={showMomentumList} 
          transparent 
          animationType="slide"
          onRequestClose={() => setShowMomentumList(false)}
        >
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} 
            activeOpacity={1} 
            onPress={() => setShowMomentumList(false)}
          >
            <View style={{ 
              backgroundColor: '#fff', 
              borderTopLeftRadius: 32, 
              borderTopRightRadius: 32, 
              height: '70%', 
              paddingTop: 8
            }}>
              <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 16, marginTop: 4 }} />
              
              <View style={{ paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
                    {momentumMode === 'urgent' ? 'Urgent Tasks' : 
                     momentumMode === 'focus' ? 'Focus Today' : 
                     momentumMode === 'due' ? 'Due Today' : 
                     momentumMode === 'recurring' ? 'Recurring' : 'One & Done'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '600' }}>Tasks contributing to momentum</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMomentumList(false)} style={{ padding: 8, backgroundColor: '#f3f4f6', borderRadius: 20 }}>
                  <Ionicons name="close" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
                {(() => {
                   const todayStr = getAppDayKey(dayStartTime);
                   const list = tasks.filter(t => {
                     const h = t.statusHistory?.[todayStr];
                     const isDoneToday = h === 'done' || h === 'did_my_best';
                     if (momentumMode === 'urgent') return t.isUrgent;
                     if (momentumMode === 'focus') return t.isPriority;
                     if (momentumMode === 'due') return normalizeDateKey(t.dueDate) === todayStr;
                     if (momentumMode === 'recurring') {
                        const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
                        return isRec && (t.status !== 'done' || isDoneToday);
                     }
                     // oneoff
                     const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
                     return !isRec && (t.status !== 'done' || isDoneToday);
                   });

                   if (list.length === 0) return <Text style={{ textAlign: 'center', marginTop: 40, color: '#9ca3af', fontSize: 15 }}>No tasks in this category.</Text>;

                   return list.map(t => {
                     const h = t.statusHistory?.[todayStr];
                     const isDone = t.status === 'done' || t.status === 'did_my_best' || h === 'done' || h === 'did_my_best';
                     return (
                        <TouchableOpacity 
                          key={t.id} 
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                          onPress={() => { setShowMomentumList(false); onOpenTask(t); }}
                        >
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDone ? '#10b981' : (STATUSES[t.status]?.color || '#cbd5e1') }} />
                          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: isDone ? '#9ca3af' : '#374151', textDecorationLine: isDone ? 'line-through' : 'none' }}>
                            {t.title}
                          </Text>
                          {isDone && <Ionicons name="checkmark-circle" size={18} color="#10b981" />}
                        </TouchableOpacity>
                     );
                   });
                })()}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}
