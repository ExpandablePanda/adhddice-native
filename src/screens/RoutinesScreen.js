import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, TextInput,
  Alert, Platform, FlatList, KeyboardAvoidingView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoutines, getRoutineProgress, getRoutineStreak } from '../lib/RoutinesContext';
import { useTasks, STATUSES, STATUS_ORDER, getLocalDateKey } from '../lib/TasksContext';
import { useTheme } from '../lib/ThemeContext';
import ModalScreen from '../components/ModalScreen';

// ─── Constants ───────────────────────────────────────────────────────────────

const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16'];
const ICONS   = ['🎯','🏃','🧼','💊','💪','📚','🍎','💰','🎵','🧘','☀️','🌙','🧹','💻','✍️','🎮','🔥','⚡','🌿','🧠'];



// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ pct, color, height = 8 }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
      <View style={{ height, width: `${Math.min(100, pct)}%`, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

// ─── Routine Card ─────────────────────────────────────────────────────────────

function RoutineCard({ routine, tasks, onPress, colors }) {
  const { done, total, pct } = useMemo(() => getRoutineProgress(routine, tasks), [routine, tasks]);
  const { streak, perfectStreak } = useMemo(() => getRoutineStreak(routine, tasks), [routine, tasks]);
  const isPerfect = pct === 100;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.cardIconBox, { backgroundColor: routine.color + '22' }]}>
        <Text style={{ fontSize: 26 }}>{routine.icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>{routine.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {perfectStreak > 0 && (
              <View style={[styles.badgePill, { backgroundColor: '#fef3c7' }]}>
                <Text style={{ fontSize: 11 }}>⭐</Text>
                <Text style={[styles.badgeNum, { color: '#d97706' }]}>{perfectStreak}</Text>
              </View>
            )}
            {streak > 0 && (
              <View style={[styles.badgePill, { backgroundColor: routine.color + '20' }]}>
                <Text style={{ fontSize: 11 }}>🔥</Text>
                <Text style={[styles.badgeNum, { color: routine.color }]}>{streak}</Text>
              </View>
            )}
          </View>
        </View>
        <ProgressBar pct={pct} color={isPerfect ? '#f59e0b' : routine.color} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
            {total === 0 ? 'No tasks yet' : `${done} / ${total} done today`}
          </Text>
          {total > 0 && (
            <Text style={[styles.cardPct, { color: isPerfect ? '#f59e0b' : routine.color }]}>{pct}%</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Routine Task Row ─────────────────────────────────────────────────────────

function RoutineTaskRow({ task, index, total, onMoveUp, onMoveDown, onRemove, onStatusChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const todayKey = getLocalDateKey();
  const status = task.statusHistory?.[todayKey] || task.status || 'pending';
  const color = STATUSES[status]?.color || '#94a3b8';

  return (
    <View style={styles.taskRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Text style={styles.taskIndex}>{index + 1}</Text>
        <TouchableOpacity
          onPress={() => setShowPicker(p => !p)}
          style={[styles.statusDot, { backgroundColor: color }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
          {(task.streak || 0) >= 1 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <Ionicons name="flame" size={10} color="#ef4444" />
              <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '700' }}>{task.streak}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <TouchableOpacity onPress={onMoveUp} disabled={index === 0} style={styles.arrowBtn}>
          <Ionicons name="chevron-up" size={16} color={index === 0 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onMoveDown} disabled={index === total - 1} style={styles.arrowBtn}>
          <Ionicons name="chevron-down" size={16} color={index === total - 1 ? '#d1d5db' : '#6b7280'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} style={styles.arrowBtn}>
          <Ionicons name="close" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
      {showPicker && (
        <View style={styles.chipRow}>
          {STATUS_ORDER.map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => { onStatusChange(task.id, s); setShowPicker(false); }}
              style={[styles.chip, { backgroundColor: STATUSES[s].color, opacity: s === status ? 1 : 0.75 }]}
            >
              <Text style={styles.chipText}>{STATUSES[s].label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Inner screens (rendered inside one Modal) ────────────────────────────────

function DetailScreen({ routine, tasks, onUpdateRoutine, onDeleteRoutine, onUpdateTask, onGoEdit, onGoPicker, onClose }) {
  const routineTasks = useMemo(
    () => routine.taskIds.map(id => tasks.find(t => t.id === id)).filter(Boolean),
    [routine.taskIds, tasks]
  );
  const { done, total, pct } = useMemo(() => getRoutineProgress(routine, tasks), [routine, tasks]);
  const { streak, perfectStreak } = useMemo(() => getRoutineStreak(routine, tasks), [routine, tasks]);
  const isPerfect = pct === 100;

  const moveTask = (index, dir) => {
    const ids = [...routine.taskIds];
    const swap = index + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    onUpdateRoutine(routine.id, { taskIds: ids });
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${routine.name}"?`)) { onDeleteRoutine(routine.id); onClose(); }
      return;
    }
    Alert.alert('Delete Routine', `Delete "${routine.name}"? Tasks won't be affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { onDeleteRoutine(routine.id); onClose(); } },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
          <Ionicons name="close" size={22} color="#6b7280" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={onGoEdit} style={styles.editBtn}>
            <Ionicons name="pencil" size={15} color="#6366f1" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Ionicons name="trash" size={15} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <View style={[styles.detailIconBox, { backgroundColor: routine.color + '22' }]}>
            <Text style={{ fontSize: 32 }}>{routine.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>{routine.name}</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Streak threshold: {routine.streakThreshold ?? 75}%
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <View style={[styles.statCard, { backgroundColor: isPerfect ? '#fef3c7' : '#f0fdf4' }]}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: isPerfect ? '#d97706' : '#059669' }}>
              {total === 0 ? '–' : `${done}/${total}`}
            </Text>
            <Text style={{ fontSize: 11, color: isPerfect ? '#d97706' : '#059669', fontWeight: '600', textTransform: 'uppercase' }}>Today</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#fef3c7' }]}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#d97706' }}>⭐ {perfectStreak}</Text>
            <Text style={{ fontSize: 11, color: '#d97706', fontWeight: '600', textTransform: 'uppercase' }}>Perfect</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: routine.color + '15' }]}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: routine.color }}>🔥 {streak}</Text>
            <Text style={{ fontSize: 11, color: routine.color, fontWeight: '600', textTransform: 'uppercase' }}>Streak</Text>
          </View>
        </View>

        {total > 0 && (
          <View style={{ marginBottom: 24 }}>
            <ProgressBar pct={pct} color={isPerfect ? '#f59e0b' : routine.color} height={10} />
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, textAlign: 'right' }}>{pct}% complete</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={styles.sectionLabel}>Tasks ({routineTasks.length})</Text>
          <TouchableOpacity onPress={onGoPicker} style={[styles.addTaskBtn, { backgroundColor: routine.color }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add Task</Text>
          </TouchableOpacity>
        </View>

        {routineTasks.length === 0 ? (
          <View style={styles.emptyTasks}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
            <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
              No tasks yet.{'\n'}Tap Add Task to build your routine.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            {routineTasks.map((task, i) => (
              <RoutineTaskRow
                key={task.id}
                task={task}
                index={i}
                total={routineTasks.length}
                onMoveUp={() => moveTask(i, -1)}
                onMoveDown={() => moveTask(i, 1)}
                onRemove={() => onUpdateRoutine(routine.id, { taskIds: routine.taskIds.filter(id => id !== task.id) })}
                onStatusChange={(taskId, newStatus) => onUpdateTask(taskId, newStatus)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function EditScreen({ routine, onSave, onBack }) {
  const [name, setName] = useState(routine?.name || '');
  const [icon, setIcon] = useState(routine?.icon || '🎯');
  const [color, setColor] = useState(routine?.color || '#6366f1');
  const [threshold, setThreshold] = useState(String(routine?.streakThreshold ?? 75));

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const t = parseInt(threshold);
    onSave({ name: name.trim(), icon, color, streakThreshold: isNaN(t) ? 75 : Math.max(1, Math.min(100, t)) });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={[styles.detailHeader, { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }]}>
        <TouchableOpacity onPress={onBack} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
          {routine ? 'Edit Routine' : 'New Routine'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: color }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Morning Routine"
          value={name}
          onChangeText={setName}
          maxLength={40}
        />

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Icon</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
          {ICONS.map(e => (
            <TouchableOpacity
              key={e}
              onPress={() => setIcon(e)}
              style={[styles.iconOption, icon === e && { borderColor: color, borderWidth: 2, backgroundColor: color + '15' }]}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Color</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
          {PALETTE.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
            />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Streak Threshold (%)</Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
          How many tasks must be done to count as a complete day (1–100)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[50, 75, 100].map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => setThreshold(String(v))}
              style={[styles.thresholdChip, threshold === String(v) && { backgroundColor: color, borderColor: color }]}
            >
              <Text style={[styles.thresholdChipText, threshold === String(v) && { color: '#fff' }]}>{v}%</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.thresholdInput}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="Custom"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PickerScreen({ tasks, existingIds, onAdd, onBack }) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allTags = useMemo(() => {
    const tagSet = new Set();
    tasks.forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)));
    return [...tagSet].sort();
  }, [tasks]);

  const filtered = useMemo(() => tasks.filter(t => {
    if (existingIds.includes(t.id)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedTag && !(t.tags || []).includes(selectedTag)) return false;
    return true;
  }), [tasks, existingIds, search, selectedTag]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={[styles.detailHeader, { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }]}>
        <TouchableOpacity onPress={onBack} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
          Add Tasks{selected.size > 0 ? ` (${selected.size})` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => selected.size > 0 && onAdd([...selected])}
          style={[styles.saveBtn, { backgroundColor: selected.size > 0 ? '#6366f1' : '#e5e7eb' }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
      {allTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={() => { setTagsExpanded(e => !e); if (tagsExpanded) setSelectedTag(null); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
              backgroundColor: tagsExpanded ? '#6366f1' : '#f3f4f6',
              borderWidth: 1.5, borderColor: tagsExpanded ? '#6366f1' : '#e5e7eb',
            }}
          >
            <Ionicons name="pricetag" size={13} color={tagsExpanded ? '#fff' : '#374151'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: tagsExpanded ? '#fff' : '#374151' }}>
              Tags{selectedTag ? `: #${selectedTag}` : ''}
            </Text>
            <Ionicons name={tagsExpanded ? 'chevron-up' : 'chevron-down'} size={13} color={tagsExpanded ? '#fff' : '#374151'} />
          </TouchableOpacity>
          {tagsExpanded && allTags.map(tag => {
            const active = selectedTag === tag;
            return (
              <TouchableOpacity
                key={tag}
                onPress={() => setSelectedTag(active ? null : tag)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
                  backgroundColor: active ? '#6366f1' : '#f3f4f6',
                  borderWidth: 1.5, borderColor: active ? '#6366f1' : '#e5e7eb',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#fff' : '#374151' }}>
                  #{tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const checked = selected.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.pickerRow, checked && { backgroundColor: '#eef2ff', borderWidth: 1.5, borderColor: '#6366f1' }]}
              onPress={() => toggleSelect(item.id)}
              activeOpacity={0.7}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                borderColor: checked ? '#6366f1' : '#d1d5db',
                backgroundColor: checked ? '#6366f1' : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <View style={[styles.statusDot, { backgroundColor: STATUSES[item.status]?.color || '#94a3b8' }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }} numberOfLines={1}>{item.title}</Text>
                {item.tags?.length > 0 && (
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{item.tags.join(', ')}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>No tasks found</Text>}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// nav states: null | 'detail' | 'edit' | 'new' | 'picker'

export default function RoutinesScreen() {
  const { routines, addRoutine, updateRoutine, deleteRoutine } = useRoutines();
  const { tasks, setTasks, completeTask } = useTasks();
  const { colors } = useTheme();

  const [openRoutineId, setOpenRoutineId] = useState(null);
  const [navScreen, setNavScreen] = useState(null); // 'detail' | 'edit' | 'new' | 'picker'

  const liveRoutine = useMemo(
    () => openRoutineId ? routines.find(r => r.id === openRoutineId) || null : null,
    [openRoutineId, routines]
  );

  const openDetail = (routineId) => { setOpenRoutineId(routineId); setNavScreen('detail'); };
  const closeAll  = () => { setNavScreen(null); setOpenRoutineId(null); };

  const handleUpdateTask = useCallback((taskId, newStatus) => {
    completeTask(taskId, newStatus);
  }, [completeTask]);

  const handleAddTask = (taskIds) => {
    if (liveRoutine) {
      const toAdd = taskIds.filter(id => !liveRoutine.taskIds.includes(id));
      if (toAdd.length > 0) {
        updateRoutine(liveRoutine.id, { taskIds: [...liveRoutine.taskIds, ...toAdd] });
      }
    }
    setNavScreen('detail');
  };

  const dynamicStyles = {
    container: { flex: 1, backgroundColor: colors.background },
    headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  };

  const modalVisible = navScreen !== null;

  return (
    <View style={dynamicStyles.container}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 12 : 16, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="list-circle-outline" size={26} color={colors.primary} />
            <Text style={dynamicStyles.headerTitle}>Routines</Text>
          </View>
          <TouchableOpacity
            onPress={() => setNavScreen('new')}
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New</Text>
          </TouchableOpacity>
        </View>

        {routines.length === 0 ? (
          <View style={styles.emptyScreen}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>📋</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 }}>No Routines Yet</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Create a routine to group your tasks like a playlist and track your daily completion streak.
            </Text>
            <TouchableOpacity
              onPress={() => setNavScreen('new')}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create First Routine</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {routines.map(r => (
              <RoutineCard
                key={r.id}
                routine={r}
                tasks={tasks}
                colors={colors}
                onPress={() => openDetail(r.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Single Modal — inner screen controlled by navScreen state */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => {
        if (navScreen === 'detail' || navScreen === 'new') closeAll();
        else setNavScreen('detail');
      }}>
        <ModalScreen style={{ flex: 1, backgroundColor: '#fff' }}>
          {navScreen === 'detail' && liveRoutine && (
            <DetailScreen
              routine={liveRoutine}
              tasks={tasks}
              onUpdateRoutine={updateRoutine}
              onDeleteRoutine={deleteRoutine}
              onUpdateTask={handleUpdateTask}
              onGoEdit={() => setNavScreen('edit')}
              onGoPicker={() => setNavScreen('picker')}
              onClose={closeAll}
            />
          )}
          {navScreen === 'edit' && liveRoutine && (
            <EditScreen
              routine={liveRoutine}
              onSave={(fields) => { updateRoutine(liveRoutine.id, fields); setNavScreen('detail'); }}
              onBack={() => setNavScreen('detail')}
            />
          )}
          {navScreen === 'new' && (
            <EditScreen
              routine={null}
              onSave={(fields) => { addRoutine(fields); closeAll(); }}
              onBack={closeAll}
            />
          )}
          {navScreen === 'picker' && liveRoutine && (
            <PickerScreen
              tasks={tasks}
              existingIds={liveRoutine.taskIds}
              onAdd={handleAddTask}
              onBack={() => setNavScreen('detail')}
            />
          )}
        </ModalScreen>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 16, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 16, fontWeight: '700', flex: 1 },
  cardSub: { fontSize: 12, fontWeight: '500' },
  cardPct: { fontSize: 13, fontWeight: '800' },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeNum: { fontSize: 12, fontWeight: '800' },

  taskRow: { borderRadius: 12, backgroundColor: '#f9fafb', padding: 12, marginBottom: 2 },
  taskIndex: { width: 18, fontSize: 12, fontWeight: '700', color: '#9ca3af', textAlign: 'center' },
  taskTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  arrowBtn: { padding: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingLeft: 28 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 8 : 12, paddingBottom: 12 },
  detailIconBox: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  editBtn: { padding: 8, backgroundColor: '#eef2ff', borderRadius: 10 },
  deleteBtn: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  addTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  emptyTasks: { alignItems: 'center', paddingVertical: 40 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 12, padding: 14 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  nameInput: { backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  iconOption: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: 'transparent' },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  thresholdChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#d1d5db' },
  thresholdChipText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  thresholdInput: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: '#111827', textAlign: 'center' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },

  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  emptyScreen: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 20 },
  emptyBtn: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
});
