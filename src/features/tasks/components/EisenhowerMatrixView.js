import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Modal, 
  StyleSheet,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/ThemeContext';
import { STATUSES, ENERGY, getAppDayKey } from '../../../lib/TasksContext';
import IconSetStatusMenu from '../../../components/IconSetStatusMenu';

const SCREEN_W = Dimensions.get('window').width;


function MatrixQuadrant({ title, subtitle, color, tasks, onOpen, onConfirmStatus, onHistory }) {
  const [pickerTask, setPickerTask] = useState(null);

  return (
    <View style={{ flex: 1, height: 320, padding: 8, backgroundColor: color + '05', borderRadius: 16, borderWidth: 1, borderColor: color + '15' }}>
      <IconSetStatusMenu 
        visible={!!pickerTask} 
        task={pickerTask} 
        onConfirm={(task, key) => onConfirmStatus(task.id, key)} 
        onClose={() => setPickerTask(null)} 
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: color }}>{title}</Text>
          <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase' }}>{subtitle}</Text>
        </View>
        <View style={{ backgroundColor: color + '20', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: color }}>{tasks.length}</Text>
        </View>
      </View>
      
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {tasks.map(t => (
            <TouchableOpacity 
              key={t.id} 
              activeOpacity={0.7}
              onPress={() => onOpen(t)}
              onLongPress={() => onHistory && onHistory(t)}
              delayLongPress={300}
              style={{ 
                backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, 
                borderWidth: 1, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity 
                  onPress={() => setPickerTask(t)}
                  style={{ padding: 4 }}
                >
                  <View style={[styles.matrixDot, { backgroundColor: STATUSES[t.status || 'pending']?.color || '#cbd5e1' }]} />
                </TouchableOpacity>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' }} numberOfLines={2}>{t.title}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                {t.energy && ENERGY[t.energy] && (
                  <View style={{ backgroundColor: ENERGY[t.energy].bg, paddingHorizontal: 4, borderRadius: 4 }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: ENERGY[t.energy].color }}>{ENERGY[t.energy].label}</Text>
                  </View>
                )}
                {t.dueDate && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="calendar-outline" size={10} color="#9ca3af" />
                    <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '600' }}>{t.dueDate}</Text>
                  </View>
                )}
                {t.link && <Ionicons name="link-outline" size={10} color="#6366f1" />}
              </View>
            </TouchableOpacity>
          ))}
          {tasks.length === 0 && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, opacity: 0.3 }}>
              <Ionicons name="cafe-outline" size={32} color={color} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: color, marginTop: 4 }}>Clear</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export default function EisenhowerMatrixView({ tasks, onOpen, onConfirmStatus, onHistory, dayStartTime }) {
  const todayKey = getAppDayKey(dayStartTime);
  const [ty, tm, td] = todayKey.split('-');
  const mdy = `${tm}/${td}/${ty}`;

  const activeTasks = tasks.filter(t => {
    const s = t.status || 'pending';
    if (s === 'done' || s === 'did_my_best') return false;
    if (s === 'upcoming') {
      const taskDue = t.dueDate ? t.dueDate.split('/').map(p => p.padStart(2, '0')).join('/') : null;
      return taskDue === mdy;
    }
    return true;
  });

  const sortAlgo = (a, b) => {
    const energyVal = { low: 0, medium: 1, high: 2 };
    const ea = energyVal[a.energy] ?? 1;
    const eb = energyVal[b.energy] ?? 1;
    if (ea !== eb) return ea - eb;
    return (a.estimatedMinutes || 0) - (b.estimatedMinutes || 0);
  };

  const q1 = activeTasks.filter(t => t.isImportant && t.isUrgent).sort(sortAlgo);
  const q3 = activeTasks.filter(t => !t.isImportant && t.isUrgent).sort(sortAlgo);
  const q2 = activeTasks.filter(t => t.isImportant && !t.isUrgent).sort(sortAlgo);
  const q4 = activeTasks.filter(t => !t.isImportant && !t.isUrgent).sort(sortAlgo);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <MatrixQuadrant title="Do First" subtitle="Urgent & Important" color="#ef4444" tasks={q1} onOpen={onOpen} onConfirmStatus={onConfirmStatus} onHistory={onHistory} />
        <MatrixQuadrant title="Do Later" subtitle="Urgent but Not Important" color="#f59e0b" tasks={q3} onOpen={onOpen} onConfirmStatus={onConfirmStatus} onHistory={onHistory} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <MatrixQuadrant title="Do If You Have Time" subtitle="Not Urgent but Important" color="#8b5cf6" tasks={q2} onOpen={onOpen} onConfirmStatus={onConfirmStatus} onHistory={onHistory} />
        <MatrixQuadrant title="Do Eventually" subtitle="Neither" color="#64748b" tasks={q4} onOpen={onOpen} onConfirmStatus={onConfirmStatus} onHistory={onHistory} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matrixDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
