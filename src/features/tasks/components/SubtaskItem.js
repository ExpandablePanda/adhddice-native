import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { STATUSES, STATUS_ORDER } from '../../../lib/TasksContext';
import { newSubtask } from '../utils/taskTreeUtils';

export default function SubtaskItem({ 
  subtask, 
  depth, 
  onToggle, 
  onDelete, 
  onReorder, 
  onAddChild, 
  isFirst, 
  isLast 
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [input, setInput]     = useState('');
  const MAX_DEPTH = 3;

  function handleAdd() {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(title => onAddChild(subtask.id, newSubtask(title)));
    setInput('');
    setShowAdd(false);
  }

  const currentStatus = subtask.status || (subtask.done ? 'done' : 'pending');
  const statusCfg = STATUSES[currentStatus] || STATUSES.pending;
  const isDone = currentStatus === 'done' || currentStatus === 'did_my_best';

  return (
    <View style={{ marginLeft: depth * 18 }}>
      <View style={styles.subtaskRow}>
        <View style={{ flexDirection: 'column', gap: 2, marginRight: 2 }}>
          {!isFirst && (
            <TouchableOpacity onPress={() => onReorder(subtask.id, 'up')} hitSlop={5}>
              <Ionicons name="chevron-up" size={12} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {!isLast && (
            <TouchableOpacity onPress={() => onReorder(subtask.id, 'down')} hitSlop={5}>
              <Ionicons name="chevron-down" size={12} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowStatusPicker(s => !s)} style={styles.subtaskCheck}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: statusCfg.color }} />
        </TouchableOpacity>
        <Text style={[styles.subtaskText, isDone && styles.subtaskDone]}>{subtask.title}</Text>
        {depth < MAX_DEPTH && (
          <TouchableOpacity onPress={() => setShowAdd(s => !s)} style={styles.subtaskAction}>
            <Ionicons name="add-circle-outline" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => onDelete(subtask.id)} style={styles.subtaskAction}>
          <Ionicons name="close" size={15} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      {/* Status picker */}
      {showStatusPicker && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 34, marginBottom: 6 }}>
          {STATUS_ORDER.map(s => {
            const cfg = STATUSES[s];
            const active = currentStatus === s;
            return (
              <TouchableOpacity
                key={s}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: active ? cfg.color : '#f3f4f6' }}
                onPress={() => {
                  onToggle(subtask.id, s);
                  setShowStatusPicker(false);
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : cfg.color }}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Nested children */}
      {(subtask.subtasks || []).map((child, idx) => (
        <SubtaskItem
          key={child.id}
          subtask={child}
          depth={depth + 1}
          onToggle={onToggle}
          onDelete={onDelete}
          onReorder={onReorder}
          onAddChild={onAddChild}
          isFirst={idx === 0}
          isLast={idx === (subtask.subtasks || []).length - 1}
        />
      ))}

      {/* Inline add sub-subtask */}
      {showAdd && (
        <View style={{ marginLeft: 18, marginBottom: 4 }}>
          <TextInput
            style={styles.inlineInput}
            placeholder="Sub-task (one per line)..."
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            multiline
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.inlineCancel}>
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAdd} style={styles.inlineAdd}>
              <Text style={{ color: '#6366f1', fontSize: 13, fontWeight: '600' }}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subtaskRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  subtaskCheck:  { padding: 2 },
  subtaskText:   { flex: 1, fontSize: 15, color: '#111827' },
  subtaskDone:   { color: '#9ca3af', textDecorationLine: 'line-through' },
  subtaskAction: { padding: 4 },
  inlineInput:   { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb' },
  inlineCancel:  { padding: 6 },
  inlineAdd:     { padding: 6 },
});
