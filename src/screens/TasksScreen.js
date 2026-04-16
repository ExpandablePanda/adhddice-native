import React, { useState, useRef, useEffect } from 'react';
// ADHDice: Cloud-Sync & Real-time Enabled 🚀
import {
  View, Text, SectionList, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, KeyboardAvoidingView, Platform, Image,
  ScrollView, Alert, Animated, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import { useTasks, getLocalDateKey, calculateTaskStreak, calculateTaskMissedStreak, STATUSES, STATUS_ORDER } from '../lib/TasksContext';
import { useEconomy } from '../lib/EconomyContext';
import { useTheme } from '../lib/ThemeContext';
import { useSettings } from '../lib/SettingsContext';
import { useNotes } from '../lib/NotesContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TaskResultModal from '../components/TaskResultModal';
import CalendarModal from '../components/CalendarModal';
import TimePickerModal from '../components/TimePickerModal';
import ScrollToTop from '../components/ScrollToTop';
import ModalScreen from '../components/ModalScreen';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 12;
const CARD_PAD = 14;
const numColumns  = Platform.OS === 'web' && SCREEN_W > 700 ? 5 : 2;
const WEB_CARD_BASE = SCREEN_W;
const CARD_W   = (WEB_CARD_BASE - CARD_PAD * 2 - CARD_GAP * (numColumns - 1)) / numColumns;
const CARD_H   = CARD_W * 1.4;  // standard playing card ratio (5:7)



const ENERGY = {
  low:    { label: 'Low',    color: '#10b981', bg: '#d1fae5' },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7' },
  high:   { label: 'High',   color: '#ef4444', bg: '#fee2e2' },
};

const VIEWS = [
  { key: 'list',  icon: 'list-outline'   },
  { key: 'cards', icon: 'albums-outline' },
];

// ── ID helpers ────────────────────────────────────────────────────────────────
let nextTaskId    = 5;
let nextSubtaskId = 30;
const newSubtask  = title => ({ id: String(nextSubtaskId++), title, status: 'pending', subtasks: [] });
const BLANK       = () => ({ id: null, title: '', status: 'pending', energy: null, dueDate: '', tags: [], subtasks: [], streak: 0, isPriority: false, statusHistory: {}, frequencyDays: null, estimatedMinutes: null, weeklyDay: null, weeklyMode: null });

// ── Frequency / next-due-date helper ─────────────────────────────────────────
function calcNextDueDate(task, dayStartTime = 6) {
  if (!task.frequency) return null;
  const useToday = task.frequency === 'DaysAfter' || task.weeklyMode === 'days_after';
  let base;
  if (useToday) {
    base = new Date();
  } else {
    base = task.dueDate ? new Date(task.dueDate) : new Date();
    if (isNaN(base.valueOf())) base = new Date();
    
    // If the due date is in the past, catch up to today
    const today = new Date();
    // If current time is < dayStartTime, "today" for task purposes is still yesterday
    if (today.getHours() < dayStartTime) {
      today.setDate(today.getDate() - 1);
    }
    today.setHours(0,0,0,0);
    if (base < today) {
      base = today;
    }
  }
  if (task.frequency === 'Daily') {
    base.setDate(base.getDate() + 1);
  } else if (task.frequency === 'Weekly') {
    if (task.weeklyMode === 'days_after') {
      base.setDate(base.getDate() + 7);
    } else if (task.weeklyDay != null) {
      const targetDay = task.weeklyDay;
      let daysAhead = (targetDay - base.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      base.setDate(base.getDate() + daysAhead);
    } else {
      base.setDate(base.getDate() + 7);
    }
  } else if (task.frequency === 'Monthly') {
    base.setMonth(base.getMonth() + 1);
  } else if (task.frequency === 'Yearly') {
    base.setFullYear(base.getFullYear() + 1);
  } else if (task.frequency === 'DaysAfter') {
    base.setDate(base.getDate() + (task.frequencyDays || 1));
  }
  return getLocalDateKey(base);
}

// ── Recursive subtask helpers ─────────────────────────────────────────────────
function mapSubtasks(subtasks, fn) {
  return subtasks.map(s => fn({ ...s, subtasks: mapSubtasks(s.subtasks || [], fn) }));
}
function toggleById(subtasks, id, targetStatus) {
  return mapSubtasks(subtasks, s => {
    if (s.id !== id) return s;
    if (targetStatus) {
      const isDone = targetStatus === 'done' || targetStatus === 'did_my_best';
      return { ...s, done: isDone, status: targetStatus };
    }
    const nowDone = !s.done;
    return { ...s, done: nowDone, status: nowDone ? 'done' : 'pending' };
  });
}
function deleteById(subtasks, id) {
  return subtasks
    .filter(s => s.id !== id)
    .map(s => ({ ...s, subtasks: deleteById(s.subtasks || [], id) }));
}
function addChildTo(subtasks, parentId, child) {
  return mapSubtasks(subtasks, s =>
    s.id === parentId ? { ...s, subtasks: [...(s.subtasks || []), child] } : s
  );
}
function countSubtasks(subtasks) {
  if (!subtasks) return 0;
  return subtasks.reduce((acc, s) => acc + 1 + countSubtasks(s.subtasks || []), 0);
}
function countDone(subtasks) {
  if (!subtasks) return 0;
  return subtasks.reduce((acc, s) => acc + ((s.status === 'done' || s.status === 'did_my_best') ? 1 : 0) + countDone(s.subtasks || []), 0);
}
function cycleStatusInTree(subtasks, id) {
  return mapSubtasks(subtasks, s => {
    if (s.id === id) {
      const nextKey = STATUSES[s.status || 'pending'].next;
      return { ...s, status: nextKey, done: nextKey === 'done' || nextKey === 'did_my_best' };
    }
    return s;
  });
}
function updateStatusInTree(subtasks, id, status) {
  return mapSubtasks(subtasks || [], s =>
    s.id === id ? { ...s, status, done: status === 'done' || status === 'did_my_best' } : s
  );
}

function findInTree(subtasks, id) {
  for (const s of subtasks) {
    if (s.id === id) return s;
    const found = findInTree(s.subtasks || [], id);
    if (found) return found;
  }
  return null;
}


function getStepPresets(title = '') {
  const t = title.toLowerCase();
  const presets = {
    read:     ['Open book to page', 'Set 10m timer', 'Find bookmark', 'Clear space'],
    write:    ['Open document', 'Title the file', 'Draft 1 sentence', 'Outlining'],
    clean:    ['Pick up 3 items', 'Put on music', 'Grab trash bag', 'Set 5m timer'],
    call:     ['Find phone number', 'Set phone on desk', 'Script first sentence'],
    code:     ['Open IDE', 'Read task ticket', 'Write 1 test', 'Branch check'],
    study:    ['Open notes', 'Clear desk', 'Focus music on', 'Review 1 slide'],
    buy:      ['Check inventory', 'Find store hours', 'Grab reusable bag'],
    email:    ['Draft subject line', 'Find recipient address', 'Write greeting'],
    workout:  ['Put on shoes', 'Roll out mat', 'Fill water bottle', 'Choose playlist'],
    generic:  ['Deep breath', 'Prep workspace', 'Set 5m timer', 'Clear 1 item']
  };

  if (t.includes('read'))   return presets.read;
  if (t.includes('write'))  return presets.write;
  if (t.includes('clean'))  return presets.clean;
  if (t.includes('call'))   return presets.call;
  if (t.includes('code'))   return presets.code;
  if (t.includes('study'))  return presets.study;
  if (t.includes('buy'))    return presets.buy;
  if (t.includes('email'))  return presets.email;
  if (t.includes('workou')) return presets.workout;
  return presets.generic;
}

// ═════════════════════════════════════════════════════════════════════════════
function groupByStatus(tasks) {
  const todayKey = getLocalDateKey();
  const activeStatuses = ['first_step', 'active', 'pending', 'missed', 'upcoming'];
  
  const sections = activeStatuses
    .map(s => {
      // Filter out tasks that were completed today from active sections
      const data = tasks.filter(t => {
        const h = t.statusHistory?.[todayKey];
        const isDoneToday = h === 'done' || h === 'did_my_best';
        // Recurring tasks should not be hidden from active sections just because they were done today
        // (because they move to 'upcoming' and we want to see them there)
        const shouldHide = isDoneToday && !t.frequency;
        return t.status === s && !t.isPriority && !shouldHide;
      });
      return { 
        title: STATUSES[s].label, 
        status: s, 
        data,
        fullCount: data.length 
      };
    })
    .filter(g => g.fullCount > 0);

  // Group all currently 'done' tasks OR any task finished today
  const doneData = tasks.filter(t => {
    const h = t.statusHistory?.[todayKey];
    const isDoneToday = h === 'done' || h === 'did_my_best';
    // Recurring tasks that rolled over to 'upcoming' should NOT be in the 'Done' section
    if (t.frequency && t.status === 'upcoming') return false;
    return t.status === 'done' || t.status === 'did_my_best' || isDoneToday;
  });

  if (doneData.length > 0) {
    const sortedDone = [...doneData].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    sections.push({
      title: 'Done',
      status: 'done',
      data: sortedDone,
      fullCount: sortedDone.length
    });
  }

  const priorityData = tasks.filter(t => {
    const h = t.statusHistory?.[todayKey];
    const isDoneToday = h === 'done' || h === 'did_my_best';
    return t.isPriority && t.status !== 'done' && t.status !== 'did_my_best' && !isDoneToday;
  });
  if (priorityData.length > 0) {
    sections.unshift({
      title: '🔥 Priority Focus',
      status: 'first_step',
      data: priorityData,
      fullCount: priorityData.length
    });
  }

  return sections;
}

// ═════════════════════════════════════════════════════════════════════════════
// TASK HISTORY MODAL
// ═════════════════════════════════════════════════════════════════════════════

function TaskHistoryModal({ task, taskHistory = [], onClose, onUpdateHistory, onFillRange, pendingRolls = 0 }) {
  const history = task.statusHistory || {};
  const [selectedDay, setSelectedDay] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelected, setMultiSelected] = useState(new Set());
  const [showFillRange, setShowFillRange] = useState(false);
  const CAL_DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
  const [calDaysIndex, setCalDaysIndex] = useState(4); // default 90
  const [fillStatus, setFillStatus] = useState('done');
  const [fillStart, setFillStart] = useState('');
  const [fillEnd, setFillEnd] = useState('');
  const [fillError, setFillError] = useState('');

  function applyFillRange() {
    setFillError('');
    const parseDate = (str) => {
      // Accept MM/DD/YYYY or YYYY-MM-DD
      if (!str) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T12:00:00');
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [m, d, y] = str.split('/');
        return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T12:00:00`);
      }
      return null;
    };
    const start = parseDate(fillStart);
    const end = parseDate(fillEnd);
    if (!start || isNaN(start)) { setFillError('Invalid start date. Use MM/DD/YYYY.'); return; }
    if (!end || isNaN(end)) { setFillError('Invalid end date. Use MM/DD/YYYY.'); return; }
    if (end < start) { setFillError('End date must be after start date.'); return; }
    const dayCount = Math.round((end - start) / 86400000) + 1;
    if (dayCount > 1000) { setFillError('Range too large (max 1000 days).'); return; }
    const entries = {};
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      entries[getLocalDateKey(d)] = fillStatus;
    }
    onFillRange(task.id, entries);
    setShowFillRange(false);
    setFillStart('');
    setFillEnd('');
    setFillError('');
  }

  // Generate calendar days
  const calDays = CAL_DAY_OPTIONS[calDaysIndex];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = getLocalDateKey(today);
  const days = [];
  for (let i = calDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    // For today, fall back to the task's live status if no history entry yet
    const status = history[key] || (key === todayKey ? task.status || null : null);
    days.push({ date: d, key, status });
  }

  // Stats
  const trackedDays = Object.keys(history).length;
  const doneDays = Object.values(history).filter(s => s === 'done' || s === 'did_my_best').length;
  const doneRate = trackedDays > 0 ? Math.round((doneDays / trackedDays) * 100) : 0;

  // Current streak (consecutive done/did_my_best ending today or yesterday)
  // Search all history, not just last 90 days
  let currentStreak = 0;
  const maxStreakDays = Math.max(Object.keys(history).length + 1, 400);
  for (let i = 0; i <= maxStreakDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    const s = history[key];
    if (s === 'done' || s === 'did_my_best') currentStreak++;
    else if (i === 0) continue; // today might not be recorded yet
    else break;
  }

  // Best streak
  let bestStreak = 0, tempStreak = 0;
  const sortedKeys = Object.keys(history).sort();
  for (const key of sortedKeys) {
    if (history[key] === 'done' || history[key] === 'did_my_best') {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  function getColor(status) {
    if (!status) return '#f3f4f6';
    return STATUSES[status]?.color || '#e5e7eb';
  }

  // Week labels
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Organize into weeks (columns)
  const weeks = [];
  let currentWeek = [];
  // Pad the first week
  const firstDay = days[0].date.getDay();
  for (let i = 0; i < firstDay; i++) currentWeek.push(null);
  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const CELL = 18;
  const GAP = 3;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ModalScreen style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 8 : 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>Task History</Text>
          <TouchableOpacity
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: multiSelectMode ? '#6366f1' : '#f3f4f6' }}
            onPress={() => { setMultiSelectMode(m => !m); setMultiSelected(new Set()); setSelectedDay(null); }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: multiSelectMode ? '#fff' : '#6b7280' }}>
              {multiSelectMode ? `${multiSelected.size} selected` : 'Select'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Task title */}
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 }}>{task.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUSES[task.status]?.color || '#94a3b8' }} />
            <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500' }}>{STATUSES[task.status]?.label || task.status}</Text>
          </View>

          {/* Stats cards */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#059669' }}>{doneDays}</Text>
              <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600', textTransform: 'uppercase' }}>Done Days</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#3b82f6' }}>{doneRate}%</Text>
              <Text style={{ fontSize: 11, color: '#3b82f6', fontWeight: '600', textTransform: 'uppercase' }}>Done Rate</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#fef3c7', borderRadius: 12, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#d97706' }}>{currentStreak}</Text>
              <Text style={{ fontSize: 11, color: '#d97706', fontWeight: '600', textTransform: 'uppercase' }}>Streak</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#fce7f3', borderRadius: 12, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#db2777' }}>{bestStreak}</Text>
              <Text style={{ fontSize: 11, color: '#db2777', fontWeight: '600', textTransform: 'uppercase' }}>Best</Text>
            </View>
          </View>

          {/* Calendar grid */}
          <TouchableOpacity
            onPress={() => setCalDaysIndex(i => (i + 1) % CAL_DAY_OPTIONS.length)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, alignSelf: 'flex-start' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.5 }}>Last {calDays} Days</Text>
            <Ionicons name="swap-horizontal" size={13} color="#6366f1" />
          </TouchableOpacity>
          <View style={{ backgroundColor: '#f9fafb', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <View style={{ flexDirection: 'row' }}>
              {/* Day labels */}
              <View style={{ marginRight: 6, justifyContent: 'space-between', paddingVertical: 1 }}>
                {dayLabels.map((l, i) => (
                  <Text key={i} style={{ fontSize: 9, color: '#9ca3af', fontWeight: '600', height: CELL + GAP, lineHeight: CELL + GAP, textAlign: 'right' }}>{l}</Text>
                ))}
              </View>
              {/* Weeks */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: GAP }}>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={{ gap: GAP }}>
                      {week.map((day, di) => {
                        if (!day) return <View key={`e${di}`} style={{ width: CELL, height: CELL }} />;
                        const isToday = day.key === getLocalDateKey();
                        const isSelected = multiSelectMode ? multiSelected.has(day.key) : selectedDay === day.key;
                        return (
                          <TouchableOpacity
                            key={day.key}
                            onPress={() => {
                              if (multiSelectMode) {
                                setMultiSelected(prev => {
                                  const next = new Set(prev);
                                  next.has(day.key) ? next.delete(day.key) : next.add(day.key);
                                  return next;
                                });
                              } else {
                                setSelectedDay(isSelected ? null : day.key);
                              }
                            }}
                            style={{
                              width: CELL, height: CELL, borderRadius: 3,
                              backgroundColor: getColor(day.status),
                              borderWidth: isToday ? 1.5 : isSelected ? 2 : 0,
                              borderColor: isToday ? '#111827' : '#6366f1',
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Legend */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f3f4f6' }} />
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>No Data</Text>
              </View>
              {STATUS_ORDER.map(s => (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: STATUSES[s].color }} />
                  <Text style={{ fontSize: 10, color: '#6b7280' }}>{STATUSES[s].label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Multi-select apply toolbar */}
          {multiSelectMode && multiSelected.size > 0 && (
            <View style={{ marginTop: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#6366f1' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                Apply to {multiSelected.size} day{multiSelected.size > 1 ? 's' : ''}
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 }}>Set Status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <TouchableOpacity
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1f2937' }}
                  onPress={() => { multiSelected.forEach(d => onUpdateHistory(task.id, d, null)); setMultiSelected(new Set()); setMultiSelectMode(false); }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Clear</Text>
                </TouchableOpacity>
                {STATUS_ORDER.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: STATUSES[s].color }}
                    onPress={() => { multiSelected.forEach(d => onUpdateHistory(task.id, d, s)); setMultiSelected(new Set()); setMultiSelectMode(false); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{STATUSES[s].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Selected day editor (single-select mode) */}
          {!multiSelectMode && selectedDay && (
            <View style={{ marginTop: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 }}>Set Status</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <TouchableOpacity
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: !history[selectedDay] ? '#111827' : '#f3f4f6' }}
                  onPress={() => { onUpdateHistory(task.id, selectedDay, null); setSelectedDay(null); }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: !history[selectedDay] ? '#fff' : '#6b7280' }}>Clear</Text>
                </TouchableOpacity>
                {STATUS_ORDER.map(s => {
                  const active = history[selectedDay] === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? STATUSES[s].color : '#f3f4f6' }}
                      onPress={() => onUpdateHistory(task.id, selectedDay, s)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : STATUSES[s].color }}>{STATUSES[s].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Recent history entries */}
          {/* Fill Range */}
          <View style={{ marginTop: 20 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: showFillRange ? '#6366f1' : '#f3f4f6', borderWidth: 1, borderColor: showFillRange ? '#6366f1' : '#e5e7eb' }}
              onPress={() => { setShowFillRange(s => !s); setFillError(''); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-number-outline" size={16} color={showFillRange ? '#fff' : '#6366f1'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: showFillRange ? '#fff' : '#6366f1' }}>Fill Date Range</Text>
              </View>
              <Text style={{ fontSize: 11, color: showFillRange ? 'rgba(255,255,255,0.8)' : '#9ca3af' }}>Backfill a streak from another app</Text>
            </TouchableOpacity>

            {showFillRange && (
              <View style={{ marginTop: 10, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#6366f1' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Status to apply</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {STATUS_ORDER.map(s => {
                    const active = fillStatus === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? STATUSES[s].color : '#f3f4f6' }}
                        onPress={() => setFillStatus(s)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : STATUSES[s].color }}>{STATUSES[s].label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>Start Date</Text>
                    <TextInput
                      style={{ borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor="#9ca3af"
                      value={fillStart}
                      onChangeText={v => { setFillStart(v); setFillError(''); }}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>End Date</Text>
                    <TextInput
                      style={{ borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827' }}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor="#9ca3af"
                      value={fillEnd}
                      onChangeText={v => { setFillEnd(v); setFillError(''); }}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>

                {fillError ? <Text style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{fillError}</Text> : null}

                {fillStart && fillEnd && (() => {
                  const parseDate = (str) => {
                    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
                      const [m, d, y] = str.split('/');
                      return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T12:00:00`);
                    }
                    return null;
                  };
                  const s = parseDate(fillStart), e = parseDate(fillEnd);
                  if (s && e && e >= s) {
                    const days = Math.round((e - s) / 86400000) + 1;
                    return <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Will fill {days} day{days > 1 ? 's' : ''} as "{STATUSES[fillStatus]?.label}"</Text>;
                  }
                  return null;
                })()}

                <TouchableOpacity
                  style={{ backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                  onPress={applyFillRange}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Apply Range</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {trackedDays > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Recent Activity</Text>
              {Object.entries(history)
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 10)
                .map(([date, status]) => {
                  // Find the most recent taskHistory event for this task on this date
                  const event = taskHistory.find(e => {
                    if (e.taskId !== task.id) return false;
                    const eDate = getLocalDateKey(new Date(e.timestamp));
                    return eDate === date && e.status === status;
                  });
                  const timeStr = event
                    ? new Date(event.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                    : null;
                  return (
                    <View key={date} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUSES[status]?.color || '#e5e7eb', flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, color: '#111827' }}>
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </Text>
                        {timeStr && <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500', marginTop: 1 }}>{timeStr}</Text>}
                      </View>
                      <Text style={{ fontSize: 13, color: STATUSES[status]?.color || '#6b7280', fontWeight: '600', marginRight: 4 }}>{STATUSES[status]?.label || status}</Text>
                      <TouchableOpacity onPress={() => onUpdateHistory(task.id, date, null)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={16} color="#d1d5db" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
            </View>
          )}
        </ScrollView>

        {/* Sticky collect rewards banner */}
        {pendingRolls > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={onClose}
            >
              <Ionicons name="dice" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Collect {pendingRolls} Roll{pendingRolls > 1 ? 's' : ''}!</Text>
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
      </ModalScreen>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═════════════════════════════════════════════════════════════════════════════

function TaskRow({ task, onConfirmStatus, onOpen, onHistory, onDeprioritize, onViewNote }) {
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [openSubPicker, setOpenSubPicker] = useState(null); // subtask id with picker open
  const { notes } = useNotes();

  const linkedNotesCount = (notes || []).filter(n => n.taskId === task.id).length;

  const currentStatusKey = task.status || 'pending';
  const status      = STATUSES[currentStatusKey] || STATUSES.pending;
  const energy      = task.energy ? (ENERGY[task.energy] || null) : null;
  const total       = countSubtasks(task.subtasks);
  const done        = countDone(task.subtasks);

  const hasSubtasks = (task.subtasks || []).length > 0;

  return (
    <View style={[styles.rowContainer, task.isPriority && task.status !== 'done' && { borderLeftWidth: 4, borderLeftColor: '#8b5cf6', backgroundColor: '#f5f3ff' }]}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => { if (showStatusPicker) { setShowStatusPicker(false); } else { onOpen(task); } }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowStatusPicker(s => !s); }} style={styles.dotWrap} hitSlop={8}>
            <View style={[styles.dot, { backgroundColor: status?.color || '#cbd5e1' }]} />
          </TouchableOpacity>
        </View>
        <View style={styles.rowBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.rowTitle, task.status === 'done' && styles.strikeDone]}>{task.title}</Text>
            {hasSubtasks && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setExpanded(!expanded); }} hitSlop={10}>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.metaRow}>
            {task.isPriority && onDeprioritize && (
              <TouchableOpacity
                style={[styles.metaChip, { backgroundColor: '#ede9fe', borderColor: '#8b5cf6', borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }]}
                onPress={(e) => { e.stopPropagation(); onDeprioritize(task.id); }}
              >
                <Ionicons name="flame" size={10} color="#8b5cf6" />
                <Text style={[styles.metaChipText, { color: '#8b5cf6', fontWeight: '700' }]}>Focus</Text>
                <Ionicons name="close" size={10} color="#8b5cf6" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.metaChip, { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc', borderWidth: 1 }]}
              onPress={(e) => { e.stopPropagation(); onHistory(task); }}
            >
              <Ionicons name="time-outline" size={10} color="#0284c7" />
              <Text style={[styles.metaChipText, { color: '#0284c7', fontWeight: '700' }]}>History</Text>
            </TouchableOpacity>
            {task.status !== 'done' && task.status !== 'first_step' && (
              <TouchableOpacity
                style={[styles.metaChip, { backgroundColor: '#f5f3ff', borderColor: '#8b5cf6', borderWidth: 1 }]}
                onPress={(e) => { e.stopPropagation(); onOpen({ ...task, is1stStepTrigger: true }); }}
              >
                <Ionicons name="rocket-outline" size={10} color="#8b5cf6" />
                <Text style={[styles.metaChipText, { color: '#8b5cf6', fontWeight: '700' }]}>1st Step</Text>
              </TouchableOpacity>
            )}
            {energy && <View style={[styles.metaChip, { backgroundColor: energy.bg }]}><Text style={[styles.metaChipText, { color: energy.color }]}>{energy.label}</Text></View>}
            {task.estimatedMinutes ? <View style={styles.metaChip}><Ionicons name="hourglass-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>~{task.estimatedMinutes >= 60 ? `${Math.floor(task.estimatedMinutes/60)}h${task.estimatedMinutes%60 ? ` ${task.estimatedMinutes%60}m` : ''}` : `${task.estimatedMinutes}m`}</Text></View> : null}
            {(task.dueDate || task.dueTime) ? <View style={styles.metaChip}><Ionicons name="calendar-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>{task.dueDate} {task.dueTime}</Text></View> : null}
            {total > 0 && <View style={styles.metaChip}><Ionicons name="checkbox-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>{done}/{total}</Text></View>}
            {(task.streak && task.streak > 0) ? <View style={[styles.metaChip, { backgroundColor: '#fee2e2' }]}><Ionicons name="flame" size={10} color="#ef4444" /><Text style={[styles.metaChipText, { color: '#ef4444' }]}>{task.streak}</Text></View> : null}
            {(() => { const ms = calculateTaskMissedStreak(task.statusHistory); return ms > 0 ? <View style={[styles.metaChip, { backgroundColor: '#1f2937' }]}><Text style={[styles.metaChipText, { color: '#f9fafb' }]}>💀 {ms}</Text></View> : null; })()}
            {linkedNotesCount > 0 && (
              <TouchableOpacity 
                style={[styles.metaChip, { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 0.5 }]}
                onPress={(e) => {
                  e.stopPropagation();
                  const linkedNotes = notes.filter(n => String(n.taskId) === String(task.id));
                  if (linkedNotes.length === 1) {
                    onViewNote(linkedNotes[0]);
                  } else {
                    onOpen(task); // Go to edit window to choose from list
                  }
                }}
              >
                <Ionicons name="document-text-outline" size={10} color="#d97706" />
                <Text style={[styles.metaChipText, { color: '#d97706' }]}>Notes ({linkedNotesCount})</Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); const ln = notes.filter(n => String(n.taskId) === String(task.id)); onViewNote(ln[0], true); }} style={{ marginLeft: 4 }}>
                  <Ionicons name="pencil" size={10} color="#d97706" />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            {(task.tags || []).map((tag, i) => <View key={i} style={[styles.metaChip, { backgroundColor: '#ede9fe' }]}><Text style={[styles.metaChipText, { color: '#6366f1' }]}>{tag}</Text></View>)}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
      </TouchableOpacity>

      {/* Status picker chips */}
      {showStatusPicker && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2 }}>
          {STATUS_ORDER.map(s => {
            const cfg = STATUSES[s];
            const active = currentStatusKey === s;
            return (
              <TouchableOpacity
                key={s}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: active ? cfg.color : '#f3f4f6' }}
                onPress={() => { onConfirmStatus(task.id, s); setShowStatusPicker(false); }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : cfg.color }}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {expanded && hasSubtasks && (
        <View style={styles.rowSubtasks}>
          {(function renderSubs(subs, depth) {
            return subs.map(s => {
              const subStatusKey = s.status || 'pending';
              const subCfg = STATUSES[subStatusKey] || STATUSES.pending;
              const isPickerOpen = openSubPicker === s.id;
              return (
                <View key={s.id}>
                  <View style={[styles.rowSubtaskItem, depth > 0 && { marginLeft: depth * 14 }]}>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setOpenSubPicker(isPickerOpen ? null : s.id); setShowStatusPicker(false); }}
                      hitSlop={6}
                    >
                      <View style={[styles.subDot, { backgroundColor: subCfg.color }]} />
                    </TouchableOpacity>
                    <Text style={[styles.rowSubtaskText, (s.status === 'done' || s.status === 'did_my_best') && styles.strikeDone]}>{s.title}</Text>
                  </View>
                  {isPickerOpen && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginLeft: depth * 14 + 20, marginBottom: 6 }}>
                      {STATUS_ORDER.map(st => {
                        const cfg = STATUSES[st];
                        const active = subStatusKey === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: active ? cfg.color : '#f3f4f6' }}
                            onPress={(e) => { e.stopPropagation(); onConfirmStatus(task.id, st, s.id); setOpenSubPicker(null); }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : cfg.color }}>{cfg.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {(s.subtasks || []).length > 0 && renderSubs(s.subtasks, depth + 1)}
                </View>
              );
            });
          })(task.subtasks, 0)}
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, status, count, collapsed, onToggle }) {
  const isPriority = title === '🔥 Priority Focus';
  return (
    <TouchableOpacity 
      style={[styles.sectionHeader, isPriority && { backgroundColor: '#f5f3ff', borderBottomWidth: 1, borderBottomColor: '#ddd6fe' }]} 
      activeOpacity={0.7} 
      onPress={() => onToggle(title)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Ionicons 
          name={collapsed ? 'chevron-forward' : 'chevron-down'} 
          size={16} 
          color={isPriority ? '#8b5cf6' : "#9ca3af"} 
          style={{ marginRight: 6 }} 
        />
        <View style={[styles.sectionDot, { backgroundColor: isPriority ? '#8b5cf6' : (STATUSES[status]?.color || '#94a3b8'), marginRight: 10 }]} />
        <Text style={[styles.sectionTitle, isPriority && { color: '#8b5cf6', fontWeight: '800' }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionCount, isPriority && { color: '#8b5cf6' }]}>{count}</Text>
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD VIEW
// ═════════════════════════════════════════════════════════════════════════════

function TaskCard({ task, onConfirmStatus, onOpen, onHistory, isFlipped, onFlipCard, onViewNote }) {
  const [stagedStatus, setStagedStatus] = useState(null);
  const flipAnim = useRef(new Animated.Value(isFlipped ? 1 : 0)).current;
  const { notes } = useNotes();
  const linkedNotes = (notes || []).filter(n => String(n.taskId) === String(task.id));
  const linkedNotesCount = linkedNotes.length;

  useEffect(() => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 1 : 0,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [isFlipped]);

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  const currentStatusKey = stagedStatus || task.status || 'pending';
  const status = STATUSES[currentStatusKey] || STATUSES.pending;
  const energy = task.energy ? (ENERGY[task.energy] || null) : null;
  const total  = countSubtasks(task.subtasks);
  const done   = countDone(task.subtasks);

  function handleCornerPress() {
    setStagedStatus(STATUSES[currentStatusKey].next);
  }

  function handleConfirm() {
    onConfirmStatus(task.id, stagedStatus);
    setStagedStatus(null);
  }

  return (
    <View style={{ width: CARD_W, height: CARD_H }}>
      {/* Card Back */}
      <Animated.View
        style={[styles.card, styles.cardBack, { transform: [{ rotateY: backRotate }], opacity: backOpacity, position: 'absolute', top: 0, left: 0 }]}
      >
        <TouchableOpacity style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.8} onPress={() => onFlipCard && onFlipCard(task.id)}>
          <Image source={require('../../assets/logo.png')} style={{ width: 175, height: 175, resizeMode: 'contain' }} />
        </TouchableOpacity>
      </Animated.View>

      {/* Card Front */}
      <Animated.View style={{ transform: [{ rotateY: frontRotate }], opacity: frontOpacity }}>
    <TouchableOpacity style={[styles.card, { borderColor: status?.color || '#cbd5e1', backgroundColor: status?.color || '#ffffff' }]} activeOpacity={0.75} onPress={() => onOpen(task)}>

      {/* Top-left corner — status (like a card rank) */}
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity style={styles.cardCorner} onPress={handleCornerPress}>
          <View style={[styles.cardCornerDot, { backgroundColor: '#ffffff' }]} />
          <Text style={[styles.cardCornerLabel, { color: '#ffffff' }]}>{status?.label || 'Task'}</Text>
        </TouchableOpacity>
        
        {stagedStatus && (
          <TouchableOpacity style={styles.cardConfirmBtn} onPress={handleConfirm}>
            <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Center — title & subtasks */}
      <View style={styles.cardCenter}>
        <Text style={[styles.cardTitle, { color: '#ffffff' }, task.status === 'done' && { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>
          {task.title}
        </Text>
        {(task.subtasks || []).length > 0 && (
          <View style={styles.cardSubtaskPreview}>
            {task.subtasks.slice(0, 3).map((s, idx) => (
                <View style={[styles.cardSubtaskMiniRow, { marginBottom: 2 }]} key={s.id || s.title || idx}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff', marginRight: 4 }} />
                  <Text style={[styles.cardSubtaskMiniText, { color: '#ffffff' }, (s.status === 'done' || s.status === 'did_my_best') && { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                </View>
            ))}
            {task.subtasks.length > 3 && <Text style={[styles.cardSubtaskMore, { color: '#ffffff', opacity: 0.8 }]}>+{task.subtasks.length - 3} more...</Text>}
          </View>
        )}
      </View>

      {/* Bottom — chips */}
      <View style={styles.cardBottom}>
        <TouchableOpacity 
          style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }]}
          onPress={(e) => { e.stopPropagation(); onHistory(task); }}
        >
          <Ionicons name="time-outline" size={9} color="#ffffff" />
          <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '800' }]}>History</Text>
        </TouchableOpacity>
        {linkedNotesCount > 0 && (
          <TouchableOpacity 
            style={[styles.cardChip, { backgroundColor: 'rgba(251,191,36,0.3)', borderColor: '#f59e0b', borderWidth: 0.5 }]}
            onPress={(e) => {
              e.stopPropagation();
              if (linkedNotes.length === 1) {
                onViewNote(linkedNotes[0]);
              } else {
                onOpen(task);
              }
            }}
          >
            <Ionicons name="document-text" size={9} color="#ffffff" />
            <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '800' }]}>{linkedNotesCount}</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onViewNote(linkedNotes[0], true); }} style={{ marginLeft: 3 }}>
              <Ionicons name="pencil" size={9} color="#ffffff" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        {energy && (
          <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '600' }]}>{energy.label}</Text>
          </View>
        )}
        {task.estimatedMinutes && (
          <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="hourglass-outline" size={9} color="#ffffff" />
            <Text style={[styles.cardChipText, { color: '#ffffff' }]}>{task.estimatedMinutes >= 60 ? `${Math.floor(task.estimatedMinutes/60)}h${task.estimatedMinutes%60 ? ` ${task.estimatedMinutes%60}m` : ''}` : `${task.estimatedMinutes}m`}</Text>
          </View>
        )}
        {(task.dueDate || task.dueTime) && (
          <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="calendar-outline" size={9} color="#ffffff" />
            <Text style={[styles.cardChipText, { color: '#ffffff' }]}>{task.dueDate} {task.dueTime}</Text>
          </View>
        )}
        {total > 0 && (
          <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="checkbox-outline" size={9} color="#ffffff" />
            <Text style={[styles.cardChipText, { color: '#ffffff' }]}>{done}/{total}</Text>
          </View>
        )}
        {(task.streak && task.streak > 0) ? (
          <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
            <Ionicons name="flame" size={9} color="#ffffff" />
            <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '800' }]}>{task.streak}</Text>
          </View>
        ) : null}
        {(() => { const ms = calculateTaskMissedStreak(task.statusHistory); return ms > 0 ? <View style={[styles.cardChip, { backgroundColor: 'rgba(0,0,0,0.4)' }]}><Text style={[styles.cardChipText, { color: '#f9fafb', fontWeight: '800' }]}>💀 {ms}</Text></View> : null; })()}
        {task.tags.slice(0, 1).map(tag => (
          <View key={tag} style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '600' }]}>{tag}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBTASK ITEM (recursive)
// ═════════════════════════════════════════════════════════════════════════════

function SubtaskItem({ subtask, depth, onToggle, onDelete, onAddChild }) {
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
      {(subtask.subtasks || []).map(child => (
        <SubtaskItem
          key={child.id}
          subtask={child}
          depth={depth + 1}
          onToggle={onToggle}
          onDelete={onDelete}
          onAddChild={onAddChild}
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

// ═════════════════════════════════════════════════════════════════════════════
// TASK DETAIL MODAL
// ═════════════════════════════════════════════════════════════════════════════

function TaskDetailModal({ task, onSave, onDelete, onClose, onViewNote }) {
  const { top } = useSafeAreaInsets();
  const { tasks: allTasks } = useTasks();
  const existingTags = Array.from(new Set(allTasks.flatMap(t => t.tags || []))).filter(Boolean);
  const is1stStep = task.is1stStepTrigger;
  const initialState = { 
    ...task, 
    subtasks: task.subtasks || [], 
    tags: task.tags || [], 
    frequency: task.frequency || null,
    status: is1stStep ? 'first_step' : task.status
  };
  const [draft, setDraft]       = useState(initialState);
  const [subInput, setSubInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [calOpenFor, setCalOpenFor] = useState(null); // 'dueDate' | null
  const [timeOpen, setTimeOpen] = useState(false);
  const [pendingSubRolls, setPendingSubRolls] = useState(0);
  const [showExistingTagMenu, setShowExistingTagMenu] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const { notes, updateNote, addNote } = useNotes();
  const isNew = !task.id;

  // noteEditorState: null | { isNew: true, taskId: string } | { note: NoteObject }
  const [noteEditorState, setNoteEditorState] = useState(null);

  const handleCreateNote = () => {
    setNoteEditorState({ isNew: true, taskId: draft.id });
  };
  
  // Sync draft state with live task prop updates (e.g. from history edits)
  React.useEffect(() => {
    if (!isNew) {
      setDraft(d => ({
        ...d,
        status: task.status,
        dueDate: task.dueDate,
        statusHistory: task.statusHistory,
        subtasks: task.subtasks,
        streak: task.streak,
        completedAt: task.completedAt
      }));
    }
  }, [task.status, task.dueDate, task.statusHistory, task.subtasks]);

  const titleSuggestions = React.useMemo(() => {
    const q = draft.title.trim().toLowerCase();
    if (q.length < 1) return [];
    const activeStatuses = ['first_step', 'active', 'pending', 'missed', 'upcoming'];
    return allTasks
      .filter(t => t.id !== task.id && activeStatuses.includes(t.status) && t.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [draft.title, allTasks, task.id]);

  const tagSuggestions = React.useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (q.length < 1) return [];
    return existingTags
      .filter(t => !draft.tags.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 6);
  }, [tagInput, existingTags, draft.tags]);

  function field(key, val) { setDraft(d => ({ ...d, [key]: val })); }

  // Top-level subtask actions (recursive helpers do the rest)
  function toggleSub(id, targetStatus) {
    setDraft(d => {
      const existing = findInTree(d.subtasks, id);
      const currentlyChecked = existing && (existing.done || existing.status === 'done' || existing.status === 'did_my_best');
      const willBeChecked = targetStatus
        ? (targetStatus === 'done' || targetStatus === 'did_my_best')
        : !currentlyChecked;
      if (!currentlyChecked && willBeChecked) {
        // Going unchecked → checked: bank a roll
        setPendingSubRolls(r => r + 1);
      } else if (currentlyChecked && !willBeChecked) {
        // Going checked → unchecked: remove banked roll
        setPendingSubRolls(r => Math.max(0, r - 1));
      }
      return { ...d, subtasks: toggleById(d.subtasks, id, targetStatus) };
    });
  }
  function deleteSub(id)           { setDraft(d => ({ ...d, subtasks: deleteById(d.subtasks, id) })); }
  function addChildSub(pid, child) { setDraft(d => ({ ...d, subtasks: addChildTo(d.subtasks, pid, child) })); }

  function addTopSubtasks() {
    const lines = subInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setDraft(d => ({ ...d, subtasks: [...d.subtasks, ...lines.map(newSubtask)] }));
    setSubInput('');
  }

  function handleTagSubmit() {
    const t = tagInput.trim();
    if (t && !draft.tags.includes(t)) {
      setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    }
    setTagInput('');
  }

  function removeTag(tagToRemove) {
    setDraft(d => ({ ...d, tags: d.tags.filter(t => t !== tagToRemove) }));
  }

  function confirmDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this task?')) {
        onDelete(task.id);
      }
    } else {
      Alert.alert('Delete Task', 'Delete this task?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.id) },
      ]);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.detailScreen, { paddingTop: top }]}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>{isNew ? 'New Task' : 'Edit Task'}</Text>
          {!isNew
            ? <TouchableOpacity onPress={confirmDelete} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>
            : <View style={{ width: 36 }} />
          }
        </View>
        <ScrollView
          contentContainerStyle={styles.detailBody}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {/* Title */}
          <TextInput
            style={styles.titleInput}
            placeholder="Task name"
            placeholderTextColor="#9ca3af"
            value={draft.title}
            onChangeText={v => { field('title', v); setShowTitleSuggestions(true); }}
            onFocus={() => setShowTitleSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
            autoFocus={isNew}
          />
          {showTitleSuggestions && titleSuggestions.length > 0 && (
            <View style={styles.autocompleteDrop}>
              {titleSuggestions.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.autocompleteItem}
                  onPress={() => { field('title', t.title); setShowTitleSuggestions(false); }}
                >
                  <Text style={styles.autocompleteText} numberOfLines={1}>{t.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Status */}
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.chipGroup}>
            {Object.entries(STATUSES).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[styles.optChip, draft.status === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => field('status', key)}
              >
                <Text style={[styles.optChipText, draft.status === key && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Frequency */}
          <Text style={styles.fieldLabel}>Repeat Frequency</Text>
          <View style={[styles.chipGroup, { paddingBottom: 6 }]}>
            {['None', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Days After'].map(freq => (
              <TouchableOpacity
                key={freq}
                style={[styles.optChip, 
                  (draft.frequency === freq || (!draft.frequency && freq === 'None') || (draft.frequency === 'DaysAfter' && freq === 'Days After')) 
                  && { backgroundColor: '#6366f1', borderColor: '#6366f1' }
                ]}
                onPress={() => {
                  if (freq === 'None') { field('frequency', null); setDraft(d => ({ ...d, frequencyDays: null })); }
                  else if (freq === 'Days After') field('frequency', 'DaysAfter');
                  else { field('frequency', freq); setDraft(d => ({ ...d, frequencyDays: null })); }
                }}
              >
                <Text style={[styles.optChipText, 
                  (draft.frequency === freq || (!draft.frequency && freq === 'None') || (draft.frequency === 'DaysAfter' && freq === 'Days After')) 
                  && { color: '#fff' }
                ]}>{freq}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {draft.frequency === 'DaysAfter' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>Every</Text>
              <TextInput
                style={[styles.fieldInput, { width: 60, textAlign: 'center', paddingVertical: 8, fontWeight: '700', fontSize: 16 }]}
                keyboardType="number-pad"
                placeholder="#"
                placeholderTextColor="#9ca3af"
                value={draft.frequencyDays ? String(draft.frequencyDays) : ''}
                onChangeText={v => {
                  const num = parseInt(v, 10);
                  setDraft(d => ({ ...d, frequencyDays: isNaN(num) ? null : Math.max(1, num) }));
                }}
              />
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>days after completion</Text>
            </View>
          )}
          {draft.frequency === 'Weekly' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Weekly Schedule</Text>
              <View style={[styles.chipGroup, { marginBottom: 8 }]}>
                {[
                  { key: 'fixed_day', label: 'Fixed Day of Week' },
                  { key: 'days_after', label: '7 Days After Completion' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.optChip, (draft.weeklyMode || 'fixed_day') === opt.key && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                    onPress={() => setDraft(d => ({ ...d, weeklyMode: opt.key }))}
                  >
                    <Text style={[styles.optChipText, (draft.weeklyMode || 'fixed_day') === opt.key && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(draft.weeklyMode || 'fixed_day') === 'fixed_day' && (
                <View style={styles.chipGroup}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.optChip, draft.weeklyDay === i && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                      onPress={() => setDraft(d => ({ ...d, weeklyDay: d.weeklyDay === i ? null : i }))}
                    >
                      <Text style={[styles.optChipText, draft.weeklyDay === i && { color: '#fff' }]}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {draft.weeklyMode === 'days_after' && (
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Next due date will be set 7 days after you mark it complete.</Text>
              )}
            </View>
          )}

          {/* Energy */}
          <Text style={styles.fieldLabel}>Energy Level</Text>
          <View style={styles.chipGroup}>
            {Object.entries(ENERGY).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[styles.optChip, draft.energy === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => field('energy', draft.energy === key ? null : key)}
              >
                <Text style={[styles.optChipText, draft.energy === key && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Estimated Time */}
          <Text style={styles.fieldLabel}>Estimated Time</Text>
          <View style={styles.chipGroup}>
            {[5, 10, 15, 30, 45, 60, 90, 120].map(m => {
              const label = m >= 60 ? `${m / 60}h` : `${m}m`;
              const isActive = draft.estimatedMinutes === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.optChip, isActive && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                  onPress={() => field('estimatedMinutes', isActive ? null : m)}
                >
                  <Text style={[styles.optChipText, isActive && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[styles.fieldInput, { marginTop: 6 }]}
            placeholder="Custom minutes (e.g. 25)"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={draft.estimatedMinutes && ![5,10,15,30,45,60,90,120].includes(draft.estimatedMinutes) ? String(draft.estimatedMinutes) : ''}
            onChangeText={v => {
              const num = parseInt(v, 10);
              field('estimatedMinutes', isNaN(num) ? null : Math.max(1, num));
            }}
          />

          {/* Dates & Time */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Due Date</Text>
              <TouchableOpacity onPress={() => setCalOpenFor('dueDate')}>
                <View pointerEvents="none">
                  <TextInput style={styles.fieldInput} placeholder="MM/DD/YYYY" placeholderTextColor="#9ca3af" value={draft.dueDate} editable={false} />
                </View>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Due Time</Text>
              <TouchableOpacity onPress={() => setTimeOpen(true)}>
                <View pointerEvents="none">
                  <TextInput style={styles.fieldInput} placeholder="e.g. 2:00 PM" placeholderTextColor="#9ca3af" value={draft.dueTime || ''} editable={false} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          

          {/* Tags */}
          <Text style={styles.fieldLabel}>Tags</Text>
          {/* Active tags on this task */}
          {draft.tags.length > 0 && (
            <View style={styles.chipGroup}>
              {draft.tags.map(tag => (
                <TouchableOpacity key={tag} style={[styles.optChip, { backgroundColor: '#ede9fe', paddingRight: 8, gap: 4, flexDirection: 'row', alignItems: 'center' }]} onPress={() => removeTag(tag)}>
                  <Text style={[styles.optChipText, { color: '#6366f1' }]}>{tag}</Text>
                  <Ionicons name="close-circle" size={14} color="#6366f1" />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Existing tags menu (collapsed by default) */}
          {existingTags.filter(t => !draft.tags.includes(t)).length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff', marginBottom: showExistingTagMenu ? 8 : 0 }}
                onPress={() => setShowExistingTagMenu(s => !s)}
              >
                <Ionicons name="pricetags-outline" size={13} color="#7c3aed" />
                <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '700' }}>Existing Tags</Text>
                <Ionicons name={showExistingTagMenu ? 'chevron-up' : 'chevron-down'} size={12} color="#7c3aed" />
              </TouchableOpacity>
              {showExistingTagMenu && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {existingTags.filter(t => !draft.tags.includes(t)).map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff' }}
                      onPress={() => { setDraft(d => ({ ...d, tags: [...d.tags, tag] })); }}
                    >
                      <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>+ #{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          <View style={{ position: 'relative', zIndex: 10 }}>
            <TextInput
              style={[styles.fieldInput, { marginTop: 4 }]}
              placeholder="New tag — press Enter to add"
              placeholderTextColor="#9ca3af"
              value={tagInput}
              onChangeText={v => { setTagInput(v); setShowTagSuggestions(true); }}
              onSubmitEditing={handleTagSubmit}
              onFocus={() => setShowTagSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
              blurOnSubmit={false}
            />
            {showTagSuggestions && tagSuggestions.length > 0 && (
              <View style={styles.autocompleteDrop}>
                {tagSuggestions.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.autocompleteItem}
                    onPress={() => {
                      setDraft(d => ({ ...d, tags: [...d.tags, tag] }));
                      setTagInput('');
                      setShowTagSuggestions(false);
                    }}
                  >
                    <Text style={styles.autocompleteText} numberOfLines={1}># {tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Linked Notes */}
          {!isNew && (
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.fieldLabel}>Linked Notes</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={handleCreateNote} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="add" size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase' }}>New Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowNotePicker(!showNotePicker)}>
                    <Ionicons name={showNotePicker ? "close-circle" : "link-outline"} size={20} color="#f59e0b" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {showNotePicker && (
                <View style={[styles.taskPickerContainer, { backgroundColor: '#fffbeb', borderColor: '#fde68a', marginBottom: 12, marginTop: 4 }]}>
                  <View style={styles.taskPickerSearch}>
                    <Ionicons name="search" size={14} color="#9ca3af" />
                    <TextInput
                      style={[styles.taskSearchInput, { color: '#1f2937' }]}
                      placeholder="Search notes to link..."
                      placeholderTextColor="#9ca3af"
                      value={noteSearch}
                      onChangeText={setNoteSearch}
                    />
                  </View>
                  <View style={{ maxHeight: 200 }}>
                    <ScrollView nestedScrollEnabled={true}>
                      {notes
                        .filter(n => !n.taskId || String(n.taskId) !== String(draft.id))
                        .filter(n => (n.title || n.content).toLowerCase().includes(noteSearch.toLowerCase()))
                        .map(n => (
                          <TouchableOpacity 
                            key={n.id} 
                            style={styles.taskResultItem}
                            onPress={() => {
                              updateNote(n.id, { taskId: draft.id });
                              setNoteSearch('');
                              setShowNotePicker(false);
                            }}
                          >
                            <Ionicons name="document-text-outline" size={16} color="#d97706" />
                            <Text style={[styles.taskResultText, { color: '#1f2937' }]} numberOfLines={1}>{n.title || n.content.slice(0, 30)}</Text>
                          </TouchableOpacity>
                        ))}
                      {notes.length === 0 && <Text style={styles.noResultsText}>No notes found.</Text>}
                    </ScrollView>
                  </View>
                </View>
              )}

              <View style={{ gap: 6, marginBottom: 8 }}>
                {notes.filter(n => String(n.taskId) === String(draft.id)).map(n => (
                  <TouchableOpacity 
                    key={n.id} 
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef3c7', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a' }}
                    onPress={() => setNoteEditorState({ note: n })}
                  >
                    <Ionicons name="document-text" size={16} color="#d97706" />
                    <Text style={{ flex: 1, fontSize: 13, color: '#92400e', fontWeight: '600' }} numberOfLines={1}>{n.title || 'Untitled Note'}</Text>
                    <TouchableOpacity 
                      onPress={(e) => { e.stopPropagation(); updateNote(n.id, { taskId: null }); }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="bag-remove" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Localized Note Editor Overlay (Inside the modal stack for visibility) */}
          {noteEditorState && (
            <ViewNoteModal 
              note={noteEditorState.note} 
              isNew={noteEditorState.isNew}
              taskId={noteEditorState.taskId}
              onClose={() => setNoteEditorState(null)} 
            />
          )}

          {/* Subtasks */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 }}>
            <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>Subtasks</Text>
            {pendingSubRolls > 0 && (
              <View style={{ backgroundColor: '#6366f1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{pendingSubRolls}</Text>
                <Text style={{ fontSize: 12 }}>🎲</Text>
                <Text style={{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Banked</Text>
              </View>
            )}
          </View>
          
          {is1stStep && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 8 }}>Suggested 1st Steps</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                {getStepPresets(draft.title).map(suggestion => (
                  <TouchableOpacity 
                    key={suggestion} 
                    style={{ backgroundColor: '#f5f3ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe' }}
                    onPress={() => setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(suggestion)] }))}
                  >
                    <Text style={{ fontSize: 12, color: '#8b5cf6', fontWeight: '600' }}>+ {suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, paddingVertical: 8 }]}
                  placeholder="Write your own 1st step..."
                  placeholderTextColor="#9ca3af"
                  value={subInput}
                  onChangeText={setSubInput}
                  onSubmitEditing={() => {
                    if (subInput.trim()) {
                      setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(subInput.trim())] }));
                      setSubInput('');
                    }
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity 
                  style={{ backgroundColor: '#8b5cf6', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}
                  onPress={() => {
                    if (subInput.trim()) {
                      setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(subInput.trim())] }));
                      setSubInput('');
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {draft.subtasks.map(sub => (
            <SubtaskItem
              key={sub.id}
              subtask={sub}
              depth={0}
              onToggle={toggleSub}
              onDelete={deleteSub}
              onAddChild={addChildSub}
            />
          ))}
          <TextInput
            style={[styles.fieldInput, styles.multilineInput]}
            placeholder={'Add subtasks — one per line\nPress Enter between each'}
            placeholderTextColor="#9ca3af"
            value={subInput}
            onChangeText={setSubInput}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.addSubBtn} onPress={addTopSubtasks}>
            <Ionicons name="add" size={16} color="#6366f1" />
            <Text style={styles.addSubText}>Add Subtasks</Text>
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, !draft.title.trim() && { opacity: 0.4 }]}
            onPress={() => draft.title.trim() && onSave(draft, pendingSubRolls)}
          >
            <Text style={styles.saveText}>{isNew ? 'Create Task' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <CalendarModal
        visible={!!calOpenFor} 
        onClose={() => setCalOpenFor(null)} 
        onSelect={(date) => { field(calOpenFor, date); setCalOpenFor(null); }}
      />
      
      <TimePickerModal
        visible={timeOpen}
        onClose={() => setTimeOpen(false)}
        initialTime={draft.dueTime}
        onSelect={(time) => { field('dueTime', time); setTimeOpen(false); }}
      />
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// IMPORT MODAL
// ═════════════════════════════════════════════════════════════════════════════

function ImportModal({ visible, onClose, onImport }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('list'); // 'list' | 'json' | 'csv'

  // CSV column order (skip header row if present):
  // 0: Title
  // 1: Status        (first_step | active | pending | missed | done | did_my_best | upcoming)
  // 2: Frequency     (daily | weekly | monthly | yearly | daysafter | <number for DaysAfter>)
  // 3: Energy        (low | medium | high)
  // 4: Due Date      (MM/DD/YYYY)
  // 5: Due Time      (e.g. 2:00 PM)
  // 6: Est. Minutes  (number)
  // 7: Tags          (dash-separated, e.g. work-home)
  // 8: Subtasks      (dash-separated, e.g. step1-step2)
  // Use 0 or leave blank to skip any field.
  const CSV_TEMPLATE_HEADER = 'Title,Status,Frequency,Energy,Due Date,Due Time,Est. Minutes,Tags,Subtasks';

  function parseCSV(csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    const validStatuses = Object.keys(STATUSES);
    const validEnergy = ['low', 'medium', 'high'];
    const validFreq = ['daily', 'weekly', 'monthly', 'yearly', 'daysafter'];
    return lines
      .filter(line => !line.toLowerCase().startsWith('title,')) // skip header row
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        const val = (v) => (v && v !== '0') ? v : null;

        const title = parts[0] || 'Untitled Task';
        const rawStatus = val(parts[1]);
        const status = rawStatus && validStatuses.includes(rawStatus.toLowerCase()) ? rawStatus.toLowerCase() : 'pending';
        const rawFreq = val(parts[2]);
        let frequency = null;
        let frequencyDays = null;
        if (rawFreq) {
          const numDays = parseInt(rawFreq, 10);
          if (!isNaN(numDays) && numDays > 0) {
            frequency = 'DaysAfter';
            frequencyDays = numDays;
          } else if (validFreq.includes(rawFreq.toLowerCase())) {
            frequency = rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1).toLowerCase();
            if (frequency === 'Daysafter') frequency = 'DaysAfter';
          }
        }
        const rawEnergy = val(parts[3]);
        const energy = rawEnergy && validEnergy.includes(rawEnergy.toLowerCase()) ? rawEnergy.toLowerCase() : null;
        const dueDate = val(parts[4]) || '';
        const dueTime = val(parts[5]) || '';
        const rawMins = val(parts[6]);
        const estimatedMinutes = rawMins && !isNaN(parseInt(rawMins, 10)) ? parseInt(rawMins, 10) : null;
        const rawTags = val(parts[7]);
        const tags = rawTags ? rawTags.split('-').map(t => t.trim()).filter(Boolean) : [];
        const rawSubs = val(parts[8]);
        const subtasks = rawSubs ? rawSubs.split('-').map(t => t.trim()).filter(Boolean).map(t => newSubtask(t)) : [];

        return { title, status, frequency, frequencyDays, energy, dueDate, dueTime, estimatedMinutes, tags, subtasks };
      });
  }

  function handleImport() {
    if (!text.trim()) return;

    if (mode === 'json') {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          onImport(parsed, true);
          setText('');
          onClose();
        } else {
          Alert.alert("Invalid Format", "JSON must be an array of task objects.");
        }
      } catch (e) {
        Alert.alert("Parse Error", "The text provided is not valid JSON.");
      }
      return;
    }

    if (mode === 'csv') {
      const parsed = parseCSV(text);
      if (parsed.length) {
        onImport(parsed, true);
        setText('');
        onClose();
      }
      return;
    }

    // List mode
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    onImport(lines, false);
    setText('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Import Tasks</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.importTabs}>
            <TouchableOpacity onPress={() => setMode('list')} style={[styles.importTab, mode === 'list' && styles.importTabActive]}>
              <Text style={[styles.importTabText, mode === 'list' && styles.importTabTextActive]}>Line List</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('csv')} style={[styles.importTab, mode === 'csv' && styles.importTabActive]}>
              <Text style={[styles.importTabText, mode === 'csv' && styles.importTabTextActive]}>CSV / Sheets</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('json')} style={[styles.importTab, mode === 'json' && styles.importTabActive]}>
              <Text style={[styles.importTabText, mode === 'json' && styles.importTabTextActive]}>Advanced JSON</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.hint}>
            {mode === 'list' && "Paste tasks line-by-line."}
            {mode === 'csv' && "Columns: Title, Status, Frequency, Energy, Due Date, Due Time, Est. Minutes, Tags (-sep), Subtasks (-sep). Use 0 or leave blank to skip a field. Header row is optional."}
            {mode === 'json' && "Paste a JSON array of task objects."}
          </Text>

          {mode === 'csv' && (
            <>
              {/* Column reference */}
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Column Order</Text>
                {[
                  ['Title', 'e.g. Clean House'],
                  ['Status', 'first_step | active | pending | missed | done | upcoming'],
                  ['Frequency', 'daily | weekly | monthly | yearly | daysafter | <days>'],
                  ['Energy', 'low | medium | high'],
                  ['Due Date', 'MM/DD/YYYY'],
                  ['Due Time', 'e.g. 2:00 PM'],
                  ['Est. Minutes', 'e.g. 30'],
                  ['Tags', 'dash-separated: work-home'],
                  ['Subtasks', 'dash-separated: step1-step2'],
                ].map(([col, hint], i) => (
                  <View key={col} style={{ flexDirection: 'row', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366f1', width: 100 }}>{i + 1}. {col}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>{hint}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd' }}
                  onPress={async () => {
                    try {
                      const DocumentPicker = require('expo-document-picker');
                      const FileSystem = require('expo-file-system');
                      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv'], copyToCacheDirectory: true });
                      if (!result.canceled && result.assets && result.assets[0]) {
                        const fileUri = result.assets[0].uri;
                        const content = await FileSystem.readAsStringAsync(fileUri);
                        setText(content);
                      }
                    } catch (e) {
                      Alert.alert('Install Required', 'Run `npx expo install expo-document-picker expo-file-system` in your project to enable file uploads. For now, paste your CSV content directly.');
                    }
                  }}
                >
                  <Ionicons name="document-outline" size={16} color="#6366f1" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#6366f1' }}>Choose CSV File</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' }}
                  onPress={() => setText(CSV_TEMPLATE_HEADER + '\n')}
                >
                  <Ionicons name="copy-outline" size={16} color="#6b7280" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280' }}>Insert Header Row</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TextInput
            style={[styles.fieldInput, { height: 180 }]}
            placeholder={mode === 'csv'
              ? 'Title,Status,Frequency,Energy,Due Date,Due Time,Est. Minutes,Tags,Subtasks\nClean House,pending,weekly,low,0,0,0,chores-home,sweep-mop\nStudy Math,active,0,high,04/15/2026,2:00 PM,30,school,0'
              : 'Paste content here...'}
            placeholderTextColor="#9ca3af"
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
          />
          <View style={[styles.sheetBtns, { marginTop: 12 }]}>
            <TouchableOpacity style={[{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' }]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#6366f1', alignItems: 'center' }]} onPress={handleImport}>
              <Text style={styles.saveText}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHUFFLE MODAL
// ═════════════════════════════════════════════════════════════════════════════

function ShuffleModal({ task, onClose, onShuffle, onOpen, onCycleStatus }) {
  const [phase, setPhase]           = useState('shuffle');
  const [current, setCurrent]       = useState(task); // local copy so status updates reflect immediately
  const [stagedStatus, setStagedStatus] = useState(null);

  // Ghost card animations
  const rot1  = useRef(new Animated.Value(0)).current;
  const rot2  = useRef(new Animated.Value(0)).current;
  const rot3  = useRef(new Animated.Value(0)).current;
  // Reveal animation
  const scale = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setPhase('shuffle');
    setCurrent(task);
    scale.setValue(0);
    fade.setValue(1);
    rot1.setValue(0);
    rot2.setValue(0);
    rot3.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(rot1, { toValue: -1, duration: 100, useNativeDriver: true }),
        Animated.timing(rot3, { toValue:  1, duration: 100, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(rot1, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(rot3, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setPhase('reveal');
      setStagedStatus(null);
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }).start();
    });
  }, [task]);

  const currentStatusKey = stagedStatus || current.status || 'pending';
  const status = STATUSES[currentStatusKey] || STATUSES.pending;
  const energy = current.energy ? ENERGY[current.energy] : null;
  const total  = countSubtasks(current.subtasks);
  const done   = countDone(current.subtasks);

  function handleCycleStatus() {
    setStagedStatus(STATUSES[currentStatusKey].next);
  }

  function handleConfirm() {
    onCycleStatus(current.id, stagedStatus);
    setStagedStatus(null);
    const next = { ...current, status: stagedStatus };
    setCurrent(next);
  }

  const mkRotate = (anim) => ({
    transform: [{ rotate: anim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-25deg', '0deg', '25deg'] }) }],
  });

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.shuffleOverlay}>

        {phase === 'shuffle' && (
          <Animated.View style={{ opacity: fade, alignItems: 'center', justifyContent: 'center' }}>
            <View style={styles.deckWrap}>
              <Animated.View style={[styles.ghostCard, { position: 'absolute' }, mkRotate(rot1)]} />
              <Animated.View style={[styles.ghostCard, { position: 'absolute' }, mkRotate(rot2)]} />
              <Animated.View style={[styles.ghostCard, mkRotate(rot3)]} />
            </View>
            <Text style={styles.shuffleHint}>Shuffling…</Text>
          </Animated.View>
        )}

        {phase === 'reveal' && (
          <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
            {/* Interactive card */}
            <TouchableOpacity
              style={[styles.revealCard, { backgroundColor: status.color, borderColor: status.color }]}
              activeOpacity={0.85}
              onPress={() => onOpen(current)}
            >
              {/* Top-left: tap to cycle status */}
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity style={styles.cardCorner} onPress={handleCycleStatus} hitSlop={12}>
                  <View style={[styles.cardCornerDot, { backgroundColor: '#ffffff' }]} />
                  <Text style={[styles.cardCornerLabel, { color: '#ffffff' }]}>{status.label}</Text>
                  <Ionicons name="chevron-forward" size={11} color="#ffffff" style={{ opacity: 0.7 }} />
                </TouchableOpacity>

                {stagedStatus && (
                  <TouchableOpacity style={[styles.cardConfirmBtn, { marginLeft: 8 }]} onPress={handleConfirm}>
                    <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Center: title */}
              <View style={styles.cardCenter}>
                <Text style={[styles.revealTitle, { color: '#ffffff' }, current.status === 'done' && { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.8)' }]} numberOfLines={5}>
                  {current.title}
                </Text>
              </View>

              {/* Bottom-left: chips */}
              <View style={styles.cardBottom}>
                {energy && (
                  <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '600' }]}>{energy.label}</Text>
                  </View>
                )}
                {current.dueDate ? (
                  <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Ionicons name="calendar-outline" size={9} color="#ffffff" />
                    <Text style={[styles.cardChipText, { color: '#ffffff' }]}>{current.dueDate}</Text>
                  </View>
                ) : null}
                {total > 0 && (
                  <View style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Ionicons name="checkbox-outline" size={9} color="#ffffff" />
                    <Text style={[styles.cardChipText, { color: '#ffffff' }]}>{done}/{total}</Text>
                  </View>
                )}
                {(current.tags || []).slice(0, 2).map(tag => (
                  <View key={tag} style={[styles.cardChip, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[styles.cardChipText, { color: '#ffffff', fontWeight: '600' }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 }}>
              Tap card to open · Tap status to change
            </Text>

            {/* Actions */}
            <View style={styles.shuffleActions}>
              <TouchableOpacity style={styles.shuffleActionBtn} onPress={onShuffle}>
                <Ionicons name="shuffle" size={18} color="#6366f1" />
                <Text style={styles.shuffleActionText}>Shuffle Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shuffleActionBtn, { backgroundColor: '#6366f1' }]} onPress={() => onOpen(current)}>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={[styles.shuffleActionText, { color: '#fff' }]}>Open Task</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FOCUS YOUR DAY (NEW)
// ═════════════════════════════════════════════════════════════════════════════

function FocusYourDay({ tasks, onComplete }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(0); // 0 (start), 1 (must do), 2 (procrastinating), 3 (bonus), 4 (final)
  const [selections, setSelections] = useState({ 1: [], 2: [], 3: [] });
  const [search, setSearch] = useState('');
  
  const today = new Date().toLocaleDateString();
  const [lastReset, setLastReset] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('@ADHD_last_reset').then(val => {
      if (val) setLastReset(val);
      else setLastReset(today);
    });
  }, []);

  function handleFullReset() {
    onComplete({ 1: [], 2: [], 3: [] }, true); // true = force clear priorities
    setSelections({ 1: [], 2: [], 3: [] });
    setLastReset(today);
    AsyncStorage.setItem('@ADHD_last_reset', today);
    setStep(1);
  }

  const undone = tasks.filter(t => t.status !== 'done' && t.status !== 'did_my_best');
  const filtered = undone.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));

  const questions = [
    { id: 1, q: "What tasks must be done today?", multiple: true },
    { id: 2, q: "What tasks are causing you stress?", multiple: true },
    { id: 3, q: "One task if you had nothing else to do?", multiple: false }
  ];

  function toggleTask(id) {
    setSelections(prev => {
      const current = prev[step];
      const isMulti = questions[step-1].multiple;
      if (current.includes(id)) {
        return { ...prev, [step]: current.filter(x => x !== id) };
      }
      return { ...prev, [step]: isMulti ? [...current, id] : [id] };
    });
  }

  // Detect New Day
  if (lastReset && lastReset !== today && step === 0) {
    return (
      <View style={[styles.fydBox, { borderColor: '#8b5cf6', borderWidth: 2 }]}>
        <Text style={styles.fydQuestion}>It's a New Day! 🌅</Text>
        <Text style={{ color: '#6b7280', marginBottom: 16 }}>Ready to reset your focus and build fresh momentum?</Text>
        <TouchableOpacity style={styles.fydNext} onPress={handleFullReset}>
          <Text style={styles.fydNextText}>Start New Day</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 0) {
    return (
      <TouchableOpacity activeOpacity={0.9} style={styles.fydStart} onPress={() => setStep(1)}>
        <Ionicons name="sparkles" size={24} color="#fff" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.fydStartTitle}>Focus Your Day</Text>
          <Text style={styles.fydStartSub}>Take 1 minute to plan your momentum</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#fff" style={{ opacity: 0.8 }} />
      </TouchableOpacity>
    );
  }

  if (step <= 3) {
    const q = questions[step-1];
    return (
      <View style={styles.fydBox}>
        <View style={styles.fydHeader}>
          <Text style={styles.fydStepText}>Step {step} of 3</Text>
          <TouchableOpacity onPress={() => setStep(0)}><Ionicons name="close" size={20} color="#9ca3af"/></TouchableOpacity>
        </View>
        <Text style={styles.fydQuestion}>{q.q}</Text>
        
        <View style={styles.fydSelector}>
          <View style={styles.searchBoxSmall}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput 
              style={styles.searchInner} 
              placeholder="Search tasks..." 
              value={search} 
              onChangeText={setSearch} 
            />
          </View>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {filtered.map(t => (
              <TouchableOpacity key={t.id} style={styles.fydItem} onPress={() => toggleTask(t.id)}>
                <Ionicons 
                  name={selections[step].includes(t.id) ? 'checkbox' : 'square-outline'} 
                  size={20} 
                  color={selections[step].includes(t.id) ? '#8b5cf6' : '#d1d5db'} 
                />
                <Text style={[styles.fydItemText, selections[step].includes(t.id) && { color: '#8b5cf6', fontWeight: '600' }]}>{t.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity 
          style={[styles.fydNext, selections[step].length === 0 && { opacity: 0.5 }]} 
          onPress={() => {
            if (selections[step].length > 0) {
              if (step === 3) {
                onComplete(selections);
                setStep(4);
              } else {
                setStep(step + 1);
                setSearch('');
              }
            }
          }}
        >
          <Text style={styles.fydNextText}>{step === 3 ? 'Finish' : 'Next Question'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fydDone}>
      <Text style={styles.fydDoneTitle}>Today's Focus List Ready!</Text>
      <TouchableOpacity onPress={() => setStep(1)} style={styles.fydReset}>
        <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '600' }}>Adjust Focus</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TasksScreen() {
  const { colors } = useTheme();
  const { dayStartTime } = useSettings();
  const { tasks, setTasks, logTaskEvent, taskHistory, isSyncing } = useTasks();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh context will handle the logic in its useEffect deps, 
    // but we can also trigger a manual force-fetch if needed.
    setRefreshing(false);
  };
  const { spendPoints, addFreeRoll, removeReward, incrementActiveStreak, incrementMissedStreak } = useEconomy();
  
  // Audio — use ref to avoid stale-closure unload bug
  const shuffleSoundRef = useRef(null);
  const flipSoundRef = useRef(null);

  useEffect(() => {
    async function setupAudio() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        // Pre-load flip sound so it fires instantly on first tap
        const { sound: flip } = await Audio.Sound.createAsync(require('../../assets/card-flip.mp3'));
        flipSoundRef.current = flip;
      } catch (e) {}
    }
    setupAudio();
    return () => {
      if (shuffleSoundRef.current) shuffleSoundRef.current.unloadAsync();
      if (flipSoundRef.current) flipSoundRef.current.unloadAsync();
    };
  }, []);

  async function playShuffleSound() {
    try {
      if (shuffleSoundRef.current) {
        await shuffleSoundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/card-shuffle.mp3'));
        shuffleSoundRef.current = sound;
        await sound.playAsync();
      }
    } catch (e) {}
  }

  async function playFlipSound() {
    try {
      if (flipSoundRef.current) {
        await flipSoundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(require('../../assets/card-flip.mp3'));
        flipSoundRef.current = sound;
        await sound.playAsync();
      }
    } catch (e) {}
  }

  const [editingTask,   setEditingTask]   = useState(null);
  const [importVisible, setImportVisible] = useState(false);
  const [search,        setSearch]        = useState('');
  const [showSearch,    setShowSearch]    = useState(false);
  const [view,          setView]          = useState('list');
  const [shuffleTask,   setShuffleTask]   = useState(null);
  const [completingTask, setCompletingTask] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [historyTask, setHistoryTask] = useState(null);
  const [historyNewCompletions, setHistoryNewCompletions] = useState(0); // count of new done/did_my_best entries
  const [rewardQueue, setRewardQueue] = useState([]); // queue of {task, intent} for sequential rolls
  
  // Advanced Filtering
  const [filterEnergy, setFilterEnergy] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [filterMode, setFilterMode] = useState('OR'); // 'AND' | 'OR'
  const [filterStatus, setFilterStatus] = useState([]); // Status filter chips
  const [filterMissedStreak, setFilterMissedStreak] = useState(false);
  const [filterStreak, setFilterStreak] = useState(false);
  const [flippedCards, setFlippedCards] = useState(new Set());
  const listRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [viewingNote, setViewingNote] = useState(null);

  // Self-healing: Correct any mismatched streaks on load
  useEffect(() => {
    if (tasks.length > 0) {
      let changed = false;
      const fixed = tasks.map(t => {
        const correct = calculateTaskStreak(t.statusHistory || {});
        if (t.streak !== correct) {
          changed = true;
          return { ...t, streak: correct };
        }
        return t;
      });
      if (changed) setTasks(fixed);
    }
  }, []); // Run once on mount

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };

  // Stats
  const todayStr = getLocalDateKey();
  const stats = {
    total: tasks.length,
    today: tasks.filter(t => {
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'active').length,
    upcoming: tasks.filter(t => t.status === 'upcoming').length,
  };

  const allTags = Array.from(new Set(tasks.flatMap(t => (t.tags || []))));

  // Pipeline Filter logic
  let filtered = tasks;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
  }
  // todayStr is YYYY-MM-DD; task.dueDate is MM/DD/YYYY — build both formats
  const [tyear, tmonth, tday] = todayStr.split('-');
  const todayMDY = `${tmonth}/${tday}/${tyear}`;
  const dueTodayCount = tasks.filter(t => t.dueDate === todayMDY).length;

  if (filterStatus.length > 0) {
    filtered = filtered.filter(t => {
      if (filterStatus.includes('due_today')) {
        if (t.dueDate === todayMDY) return true;
      }
      if (filterStatus.includes(t.status)) return true;
      if (filterStatus.includes('done')) {
        const h = t.statusHistory?.[todayStr];
        return h === 'done' || h === 'did_my_best';
      }
      return false;
    });
  }
  if (filterEnergy.length > 0) {
    if (filterMode === 'AND') {
      filtered = filtered.filter(t => filterEnergy.includes(t.energy || 'unset'));
    } else {
      filtered = filtered.filter(t => filterEnergy.includes(t.energy || 'unset'));
    }
  }
  if (filterTags.length > 0) {
    if (filterMode === 'AND') {
      filtered = filtered.filter(t => filterTags.every(tag => (tag === 'untagged' ? t.tags.length === 0 : t.tags.includes(tag))));
    } else {
      filtered = filtered.filter(t => filterTags.some(tag => (tag === 'untagged' ? t.tags.length === 0 : t.tags.includes(tag))));
    }
  }

  if (filterMissedStreak) {
    filtered = filtered
      .map(t => ({ t, ms: calculateTaskMissedStreak(t.statusHistory) }))
      .filter(({ ms }) => ms >= 2)
      .sort((a, b) => b.ms - a.ms)
      .map(({ t }) => t);
  } else if (filterStreak) {
    filtered = filtered
      .filter(t => (t.streak || 0) >= 2)
      .sort((a, b) => (b.streak || 0) - (a.streak || 0));
  } else {
    // Sort by status order
    filtered = [...filtered].sort((a, b) => {
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    });
  }

  // allFlipped derived after filtered is ready
  const allFlipped = filtered.length > 0 && filtered.every(t => flippedCards.has(t.id));

  function flipAllCards() {
    playFlipSound();
    if (allFlipped) {
      setFlippedCards(new Set());
    } else {
      setFlippedCards(new Set(filtered.map(t => t.id)));
    }
  }

  function flipCard(id) {
    playFlipSound();
    setFlippedCards(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const triggerShuffle = () => {
    const pool = filtered.filter(t => t.status === 'pending' || t.status === 'active');
    if (pool.length === 0) return;
    playShuffleSound();

    if (pool.length === 1) {
       setShuffleTask(pool[0]);
       return;
    }
    
    let next;
    let attempts = 0;
    do {
      next = pool[Math.floor(Math.random() * pool.length)];
      attempts++;
    } while (next.id === shuffleTask?.id && attempts < 10);
    setShuffleTask(next);
  };
  
  const sections = groupByStatus(filtered);

  function confirmStatus(taskId, targetStatus, subtaskId = null) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let subject = task;
    if (subtaskId) {
      subject = findInTree(task.subtasks || [], subtaskId);
      if (!subject) return;
    }

    if (!targetStatus) targetStatus = STATUSES[subject.status || 'pending'].next;
    
    if (targetStatus === 'done' || targetStatus === 'did_my_best') {
      // Only stamp the parent's statusHistory when completing the main task itself,
      // not when a subtask is completed — subtasks are independent of the parent status
      if (!subtaskId) {
        const todayKey = getLocalDateKey();
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            return { ...t, statusHistory: { ...(t.statusHistory || {}), [todayKey]: targetStatus } };
          }
          return t;
        }));
      }
      setShuffleTask(null);
      setCompletingTask({ ...subject, intent: targetStatus, parentTaskId: subtaskId ? taskId : null });
    } else if (targetStatus === 'missed') {
      const isSub = !!subtaskId;
      Alert.alert(
        isSub ? "Missed Subtask" : "Missed Task",
        isSub 
          ? `Mark "${subject.title}" as missed?`
          : `Confirming this will mark "${task.title}" as missed and start a Missed Streak. Are you sure?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm Missed", style: "destructive", onPress: () => {
              if (isSub) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: updateStatusInTree(t.subtasks, subtaskId, 'missed') } : t));
                logTaskEvent(subject, 'missed');
              } else {
                incrementMissedStreak();
                logTaskEvent(task, 'missed');
                const updatedHistory = { ...(task.statusHistory || {}), [getLocalDateKey()]: 'missed' };
                const nextDue = calcNextDueDate(task);
                setTasks(prev => prev.map(t => t.id === taskId ? {
                  ...t,
                  status: 'missed',
                  streak: calculateTaskStreak(updatedHistory),
                  statusHistory: updatedHistory,
                  ...(nextDue ? { dueDate: nextDue } : {}),
                } : t));
              }
          }}
        ]
      );
    } else {
      if ((task.status === 'done' || task.status === 'did_my_best') && task.gainedReward) {
        removeReward(task.gainedReward.points, task.gainedReward.xp);
        const updatedHistory = { ...(task.statusHistory || {}), [getLocalDateKey()]: targetStatus };
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: targetStatus, gainedReward: null, completedAt: null, streak: calculateTaskStreak(updatedHistory), statusHistory: updatedHistory } : t));
        logTaskEvent(task, targetStatus);
      } else {
        const existing = tasks.find(t => t.id === taskId);
        if (existing && existing.status === 'first_step' && (targetStatus === 'done' || targetStatus === 'did_my_best')) {
          addFreeRoll(1);
          Alert.alert("Momentum Reward!", "You completed your 1st Step! Here's a free Dice Roll.");
        }

        if (subtaskId) {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: updateStatusInTree(t.subtasks, subtaskId, targetStatus) } : t));
          logTaskEvent(subject, targetStatus);
        } else {
          const updatedHistory = { ...(existing.statusHistory || {}), [getLocalDateKey()]: targetStatus };
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: targetStatus, streak: calculateTaskStreak(updatedHistory), statusHistory: updatedHistory } : t));
          logTaskEvent(existing, targetStatus);
        }
      }
    }
  }

  function handleTaskCompleting(id, reward) {
    incrementActiveStreak();

    // History completions: just show the roll, don't change task status/dates
    // EXCEPT if it's for today — then we want it to act like a normal completion
    const isTodayHistory = completingTask?._isHistoryCompletion && 
                           completingTask?._dateKey === getLocalDateKey();
    
    if (completingTask?._isHistoryCompletion && !isTodayHistory) {
      setCompletingTask(null);
      if (rewardQueue.length > 0) {
        const [next, ...rest] = rewardQueue;
        setRewardQueue(rest);
        setTimeout(() => setCompletingTask(next), 400);
      }
      return;
    }

    if (completingTask?.isSubtaskRoll) {
      setCompletingTask(null);
      if (rewardQueue.length > 0) {
        const [next, ...rest] = rewardQueue;
        setRewardQueue(rest);
        setTimeout(() => setCompletingTask(next), 400);
      }
      return;
    }

    const today = getLocalDateKey();

    setTasks(prev => prev.map(t => {
      // Use loose equality (==) or cast to String to prevent numeric ID mismatches
      if (!completingTask.parentTaskId && String(t.id) === String(id)) {
        let nextData = {};
        if (t.frequency) {
          // Safety: ensure next data is calculated correctly for recurring rollovers
          const formatted = calcNextDueDate(t);
          nextData.dueDate = formatted;
          nextData.status = 'upcoming';
          nextData.gainedReward = null;
          nextData.completedAt = null;
          nextData.subtasks = mapSubtasks(t.subtasks || [], s => ({ ...s, status: 'upcoming' }));
        }
        // For recurring tasks nextData overrides status/gainedReward/completedAt; for one-off tasks use completion intent
        const intent = completingTask.intent || completingTask.status || 'done';
        const finalStatus = nextData.status || intent;
        const finalReward = nextData.status ? null : reward; // recurring tasks don't hold a reward
        // Use backdated timestamp if provided (e.g. midnight confirm "done")
        const finalCompletedAt = nextData.status ? null : (completingTask._backdatedCompletedAt || new Date().toISOString());
        // Use the backdated date key if available
        const historyKey = completingTask._backdatedCompletedAt
          ? getLocalDateKey(new Date(completingTask._backdatedCompletedAt))
          : today;
        const updatedHistory = { ...(t.statusHistory || {}), [historyKey]: intent };
        const updated = {
          ...t,
          gainedReward: finalReward,
          completedAt: finalCompletedAt,
          ...nextData,
          status: finalStatus,
          statusHistory: updatedHistory,
          streak: calculateTaskStreak(updatedHistory),
        };
        logTaskEvent(updated, intent);
        return updated;
      }
      
      // If completing a subtask inside this parent task
      if (completingTask.parentTaskId && t.id === completingTask.parentTaskId) {
        let subToLog = null;
        const updatedSubtasks = mapSubtasks(t.subtasks || [], s => {
           if (s.id === id) {
             const updatedSub = { ...s, status: completingTask.intent, gainedReward: reward, completedAt: new Date().toISOString() };
             subToLog = updatedSub;
             return updatedSub;
           }
           return s;
        });
        if (subToLog) logTaskEvent(subToLog, completingTask.intent);
        return { ...t, subtasks: updatedSubtasks };
      }

      return t;
    }));
    setCompletingTask(null);

    // Process next in reward queue if any
    setTimeout(() => {
      setRewardQueue(prev => {
        if (prev.length > 0) {
          const [next, ...rest] = prev;
          setTimeout(() => setCompletingTask(next), 200);
          return rest;
        }
        return prev;
      });
    }, 300);
  }

  function saveTask(draft, subtaskRolls = 0) {
    if (draft.id) {
      const existing = tasks.find(t => String(t.id) === String(draft.id));

      // Moving out of done states -> Deduct
      if (existing && (existing.status === 'done' || existing.status === 'did_my_best') && (draft.status !== 'done' && draft.status !== 'did_my_best')) {
        if (existing.gainedReward) {
          removeReward(existing.gainedReward.points, existing.gainedReward.xp);
        }
        draft.gainedReward = null;
        draft.completedAt = null;
      }

      // Moving into done states -> Trigger overlay
      if (existing && (existing.status !== 'done' && existing.status !== 'did_my_best') && (draft.status === 'done' || draft.status === 'did_my_best')) {
        // Save all changes EXCEPT status, then trigger completion modal
        setTasks(prev => prev.map(t => String(t.id) === String(draft.id) ? { ...draft, status: existing.status } : t));
        setEditingTask(null);
        setTimeout(() => setCompletingTask({ ...draft, intent: draft.status }), 100); // Pass intent so rewards/history work
        return;
      }
    }

    setTasks(prev => draft.id
      ? prev.map(t => String(t.id) === String(draft.id) ? draft : t)
      : [...prev, { ...draft, id: String(nextTaskId++) }]
    );
    setEditingTask(null);

    // Bank rolls for subtasks checked off during editing
    if (subtaskRolls > 0) {
      const rollItems = Array.from({ length: subtaskRolls }, () => ({
        ...draft,
        intent: 'done',
        parentTaskId: null,
        isSubtaskRoll: true,
      }));
      setTimeout(() => {
        setCompletingTask(rollItems[0]);
        if (rollItems.length > 1) setRewardQueue(rollItems.slice(1));
      }, 150);
    }
  }
  function deleteTask(id) {
    setTasks(prev => prev.filter(t => String(t.id) !== String(id)));
    setEditingTask(null);
  }
  function importTasks(payload, isJson = false) {
    if (isJson) {
      setTasks(prev => [...prev, ...payload.map(obj => ({ ...BLANK(), ...obj, id: String(nextTaskId++) }))]);
    } else {
      setTasks(prev => [...prev, ...payload.map(title => ({ ...BLANK(), id: String(nextTaskId++), title }))]);
    }
  }

  const isWeb = Platform.OS === 'web';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>

      {/* ── Main header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="checkbox-outline" size={24} color="#6366f1" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.headerTitle}>Tasks</Text>
            {isSyncing ? (
              <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 6 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' }}>Syncing...</Text>
              </View>
            ) : (
              <View style={{ 
                backgroundColor: colors.green + '15', 
                paddingHorizontal: 10, 
                paddingVertical: 3, 
                borderRadius: 20, 
                flexDirection: 'row', 
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.green + '30'
              }}>
                <Ionicons name="cloud-done" size={12} color={colors.green} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.green, textTransform: 'uppercase', letterSpacing: 0.5 }}>Synced</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Top Stats Banner ── */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <FocusYourDay tasks={tasks} onComplete={(sels, forceClear = false) => {
          const allIds = [...sels[1], ...sels[2], ...sels[3]];
          setTasks(prev => prev.map(t => {
            if (forceClear) return { ...t, isPriority: false };
            // Always replace old priorities with the new selection
            return { ...t, isPriority: allIds.includes(t.id) };
          }));
        }} />
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginTop: 12 }}>
          <View style={[styles.statBox, { backgroundColor: '#f9fafb', padding: 12, borderRadius: 12, alignItems: 'center', width: 90 }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>{stats.total}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Total</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#d1fae5', padding: 12, borderRadius: 12, alignItems: 'center', width: 90 }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>{stats.today}</Text>
            <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600', textTransform: 'uppercase' }}>Done</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#fef3c7', padding: 12, borderRadius: 12, alignItems: 'center', width: 90 }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#d97706' }}>{stats.pending}</Text>
            <Text style={{ fontSize: 11, color: '#d97706', fontWeight: '600', textTransform: 'uppercase' }}>Pending</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#e2e8f0', padding: 12, borderRadius: 12, alignItems: 'center', width: 90 }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#475569' }}>{stats.upcoming}</Text>
            <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>Upcoming</Text>
          </View>
        </ScrollView>
      </View>

      {/* ── Toolbar: view switcher + status chips + shuffle ── */}
      <View style={styles.toolbar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.viewToggle}>
            {VIEWS.map(v => (
              <TouchableOpacity
                key={v.key}
                style={[styles.viewBtn, view === v.key && styles.viewBtnActive]}
                onPress={() => setView(v.key)}
              >
                <Ionicons name={v.icon} size={17} color={view === v.key ? '#6366f1' : '#9ca3af'} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSearch(s => !s)}>
            <Ionicons name="search-outline" size={19} color={showSearch ? '#6366f1' : '#6b7280'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setImportVisible(true)}>
            <Ionicons name="download-outline" size={19} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { paddingHorizontal: 12, height: 32 }]} onPress={() => setEditingTask(BLANK())}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={[styles.addBtnText, { fontSize: 13 }]}>New</Text>
          </TouchableOpacity>
        </View>

        {view === 'cards' && filtered.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.shuffleBtn} onPress={triggerShuffle}>
              <Ionicons name="shuffle" size={15} color="#6366f1" />
              <Text style={styles.shuffleBtnText}>Shuffle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shuffleBtn, allFlipped && { backgroundColor: '#6366f1' }]} onPress={flipAllCards}>
              <Ionicons name="albums" size={15} color={allFlipped ? '#fff' : '#6366f1'} />
              <Text style={[styles.shuffleBtnText, allFlipped && { color: '#fff' }]}>
                {allFlipped ? 'Reveal All' : 'Flip All'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Status filter chips ── */}
      <View style={{ height: 36, marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center', height: 36 }}>
          {(filterStatus.length > 0 || filterMissedStreak || filterStreak) && (
            <TouchableOpacity
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }}
              onPress={() => { setFilterStatus([]); setFilterMissedStreak(false); setFilterStreak(false); }}
            >
              <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '700' }}>Clear</Text>
            </TouchableOpacity>
          )}
          {dueTodayCount > 0 && (() => {
            const active = filterStatus.includes('due_today');
            return (
              <TouchableOpacity
                key="due_today"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: active ? '#0ea5e9' : '#bae6fd', backgroundColor: active ? '#0ea5e9' : '#fff' }}
                onPress={() => setFilterStatus(prev => active ? prev.filter(x => x !== 'due_today') : [...prev, 'due_today'])}
              >
                <Ionicons name="calendar" size={10} color={active ? '#fff' : '#0ea5e9'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#0ea5e9' }}>Due Today</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : '#0ea5e980' }}>{dueTodayCount}</Text>
              </TouchableOpacity>
            );
          })()}
          {['first_step', 'active', 'pending', 'missed'].map(s => {
            const cfg = STATUSES[s];
            const active = filterStatus.includes(s);
            const count = tasks.filter(t => t.status === s).length;
            if (count === 0) return null;
            return (
              <TouchableOpacity
                key={s}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: cfg.color + '40', backgroundColor: active ? cfg.color : '#fff' }}
                onPress={() => setFilterStatus(prev => active ? prev.filter(x => x !== s) : [...prev, s])}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#fff' : cfg.color }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : cfg.color }}>{cfg.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : cfg.color + '80' }}>{count}</Text>
              </TouchableOpacity>
            );
          })}
          {(() => {
            const msCount = tasks.filter(t => calculateTaskMissedStreak(t.statusHistory) >= 2).length;
            if (msCount === 0) return null;
            return (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: filterMissedStreak ? '#1f2937' : '#9ca3af40', backgroundColor: filterMissedStreak ? '#1f2937' : '#fff' }}
                onPress={() => setFilterMissedStreak(v => !v)}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: filterMissedStreak ? '#f9fafb' : '#374151' }}>💀 Missed Streak</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: filterMissedStreak ? 'rgba(249,250,251,0.7)' : '#37415180' }}>{msCount}</Text>
              </TouchableOpacity>
            );
          })()}
          {(() => {
            const streakCount = tasks.filter(t => (t.streak || 0) >= 2).length;
            if (streakCount === 0) return null;
            return (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: filterStreak ? '#ef4444' : '#ef444440', backgroundColor: filterStreak ? '#ef4444' : '#fff' }}
                onPress={() => setFilterStreak(v => !v)}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: filterStreak ? '#fff' : '#ef4444' }}>🔥 Streak</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: filterStreak ? 'rgba(255,255,255,0.7)' : '#ef444480' }}>{streakCount}</Text>
              </TouchableOpacity>
            );
          })()}
          {['upcoming', 'done'].map(s => {
            const cfg = STATUSES[s];
            const active = filterStatus.includes(s);
            const count = s === 'done' ? stats.today : tasks.filter(t => t.status === s).length;
            if (count === 0) return null;
            return (
              <TouchableOpacity
                key={s}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: cfg.color + '40', backgroundColor: active ? cfg.color : '#fff' }}
                onPress={() => setFilterStatus(prev => active ? prev.filter(x => x !== s) : [...prev, s])}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#fff' : cfg.color }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : cfg.color }}>{cfg.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : cfg.color + '80' }}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Expanded Search & Filters ── */}
      {/* ── Search Bar (only text input now) ── */}
      {showSearch && (
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tasks..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Persistent Filter Dashboard ── */}
      <View style={{ marginBottom: 12 }}>
        {/* Row 1: Tag controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
          {(filterTags.length > 0 || filterEnergy.length > 0) && (
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }}
              onPress={() => { setFilterTags([]); setFilterEnergy([]); setShowTagMenu(false); }}
            >
              <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '800' }}>Clear</Text>
            </TouchableOpacity>
          )}
          {/* Untagged chip */}
          {(() => {
            const active = filterTags.includes('untagged');
            return (
              <TouchableOpacity
                style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe' }, active && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}
                onPress={() => setFilterTags(prev => active ? prev.filter(x => x !== 'untagged') : [...prev, 'untagged'])}
              >
                <Text style={[{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }, active && { color: '#fff' }]}>Untagged</Text>
              </TouchableOpacity>
            );
          })()}
          {/* Tags menu button */}
          {allTags.length > 0 && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: filterTags.filter(t => t !== 'untagged').length > 0 ? '#8b5cf6' : '#f5f3ff', borderWidth: 1, borderColor: filterTags.filter(t => t !== 'untagged').length > 0 ? '#8b5cf6' : '#ddd6fe' }}
              onPress={() => setShowTagMenu(s => !s)}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: filterTags.filter(t => t !== 'untagged').length > 0 ? '#fff' : '#7c3aed' }}>
                Tags{filterTags.filter(t => t !== 'untagged').length > 0 ? ` (${filterTags.filter(t => t !== 'untagged').length})` : ''}
              </Text>
              <Ionicons name={showTagMenu ? 'chevron-up' : 'chevron-down'} size={12} color={filterTags.filter(t => t !== 'untagged').length > 0 ? '#fff' : '#7c3aed'} />
            </TouchableOpacity>
          )}
        </View>
        {/* Tag menu dropdown */}
        {showTagMenu && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
            {allTags.map(tag => {
              const active = filterTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe' }, active && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}
                  onPress={() => setFilterTags(prev => active ? prev.filter(x => x !== tag) : [...prev, tag])}
                >
                  <Text style={[{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }, active && { color: '#fff' }]}>#{tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Row 2: Energy & AND/OR */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
          <TouchableOpacity 
            style={{ backgroundColor: filterMode === 'AND' ? '#111827' : '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginRight: 10 }}
            onPress={() => setFilterMode(m => m === 'AND' ? 'OR' : 'AND')}
          >
            <Text style={{ fontSize: 10, fontWeight: '900', color: filterMode === 'AND' ? '#fff' : '#6b7280', textTransform: 'uppercase' }}>
              {filterMode}
            </Text>
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {['low', 'medium', 'high', 'unset'].map(e => {
              const active = filterEnergy.includes(e);
              const label = e === 'unset' ? 'No Energy' : ENERGY[e].label;
              return (
                <TouchableOpacity 
                  key={e} 
                  style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' }, active && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                  onPress={() => setFilterEnergy(prev => active ? prev.filter(x => x !== e) : [...prev, e])}
                >
                  <Text style={[{ fontSize: 11, fontWeight: '600' }, active ? { color: '#fff' } : { color: '#6b7280' }]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── List view ── */}
      {view === 'list' && (
        filtered.length === 0
          ? <Text style={styles.empty}>No tasks — tap New or import.</Text>
          : (filterMissedStreak || filterStreak)
            ? filtered.map((item, i) => (
                <TaskRow key={String(item.id) + '-' + i} task={item} onConfirmStatus={confirmStatus} onOpen={setEditingTask} onHistory={t => setHistoryTask(t.id)} onDeprioritize={(id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isPriority: false } : t))} />
              ))
            : sections.map(section => (
                <View key={section.title}>
                  <SectionHeader
                    title={section.title}
                    status={section.status}
                    count={section.fullCount}
                    collapsed={!!collapsedSections[section.title]}
                    onToggle={(t) => setCollapsedSections(prev => ({ ...prev, [t]: !prev[t] }))}
                  />
                  {!collapsedSections[section.title] && section.data.map((item, i) => (
                    <TaskRow key={String(item.id) + '-' + i} task={item} onConfirmStatus={confirmStatus} onOpen={setEditingTask} onHistory={t => setHistoryTask(t.id)} onDeprioritize={(id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isPriority: false } : t))} onViewNote={setViewingNote} />
                  ))}
                </View>
              ))
      )}

      {/* ── Card view ── */}
      {view === 'cards' && (
        filtered.length === 0
          ? <Text style={styles.empty}>No tasks — tap New or import.</Text>
          : <View style={styles.cardGrid}>
              {filtered.map((item, i) => (
                <TaskCard key={String(item.id) + '-' + i} task={item} onConfirmStatus={confirmStatus} onOpen={setEditingTask} onHistory={t => setHistoryTask(t.id)} isFlipped={flippedCards.has(item.id)} onFlipCard={flipCard} onViewNote={setViewingNote} />
              ))}
            </View>
      )}

      </ScrollView>

      {/* Detail modal — derive live task so it stays in sync with history edits */}
      {editingTask && (() => {
        const liveEditingTask = tasks.find(t => String(t.id) === String(editingTask.id)) || editingTask;
        return (
          <TaskDetailModal
            task={liveEditingTask}
            onSave={saveTask}
            onDelete={deleteTask}
            onClose={() => setEditingTask(null)}
            onViewNote={(n, edit = false) => setViewingNote({ ...n, isInitialEdit: edit })}
          />
        );
      })()}

      {/* Import modal */}
      <ImportModal visible={importVisible} onClose={() => setImportVisible(false)} onImport={importTasks} />

      {/* Shuffle modal */}
      {shuffleTask && (
        <ShuffleModal
          task={shuffleTask}
          onClose={() => setShuffleTask(null)}
          onShuffle={triggerShuffle}
          onOpen={task => { setShuffleTask(null); setEditingTask(task); }}
          onCycleStatus={(id, targetStatus) => confirmStatus(id, targetStatus)}
        />
      )}

      {/* Task Result Modal */}
      <TaskResultModal
        visible={!!completingTask}
        task={completingTask}
        onClose={() => {
          // Even if user dismisses without rolling, still log the event and advance dueDate
          if (completingTask) handleTaskCompleting(completingTask.id, null);
        }}
        onComplete={handleTaskCompleting}
      />

      {/* History modal — derive live task from tasks state so statusHistory is always fresh */}
      {historyTask && (() => {
        const liveHistoryTask = tasks.find(t => t.id === historyTask);
        if (!liveHistoryTask) return null;
        return (
          <TaskHistoryModal
            task={liveHistoryTask}
            taskHistory={taskHistory}
            pendingRolls={historyNewCompletions}
            onClose={() => {
              const count = historyNewCompletions;
              const taskRef = liveHistoryTask;
              setHistoryTask(null);
              setHistoryNewCompletions(0);
              if (count > 0) {
                const items = Array.from({ length: count }, () => ({
                  ...taskRef,
                  intent: 'done',
                  parentTaskId: null,
                  _isHistoryCompletion: true,
                  _dateKey: getLocalDateKey(),
                }));
                setCompletingTask(items[0]);
                if (items.length > 1) setRewardQueue(items.slice(1));
              }
            }}
            onUpdateHistory={(taskId, date, status) => {
              const existingTask = tasks.find(t => String(t.id) === String(taskId));
              const oldStatus = existingTask?.statusHistory?.[date];
              const wasCompleted = oldStatus === 'done' || oldStatus === 'did_my_best';
              const isNowCompleted = status === 'done' || status === 'did_my_best';
              if (!wasCompleted && isNowCompleted) {
                setHistoryNewCompletions(prev => prev + 1);
              } else if (wasCompleted && !isNowCompleted) {
                setHistoryNewCompletions(prev => Math.max(0, prev - 1));
              }
              setTasks(prev => prev.map(t => {
                if (String(t.id) !== String(taskId)) return t;
                const h = { ...(t.statusHistory || {}) };
                if (status === null) { delete h[date]; } else { h[date] = status; }
                const today = getLocalDateKey();
                const isToday = date === today;
                const isDone = status === 'done' || status === 'did_my_best';

                let next = { 
                  ...t, 
                  statusHistory: h,
                  streak: calculateTaskStreak(h)
                };

                if (isToday) {
                  if (isDone && t.frequency) {
                    // ATOMIC SYNC: Rollover immediately for today's history edits
                    const nextDate = calcNextDueDate(t, dayStartTime);
                    next.status = 'upcoming';
                    next.dueDate = nextDate;
                    next.completedAt = new Date().toISOString();
                    if (t.subtasks && t.subtasks.length > 0) {
                      const resetSubs = (list) => list.map(s => ({
                        ...s,
                        status: 'upcoming',
                        subtasks: s.subtasks ? resetSubs(s.subtasks) : []
                      }));
                      next.subtasks = resetSubs(t.subtasks);
                    }
                  } else {
                    next.status = status || 'pending';
                  }
                }
                return next;
              }));
            }}
            onFillRange={(taskId, entries) => {
              setTasks(prev => prev.map(t => {
                if (String(t.id) !== String(taskId)) return t;
                const newHistory = { ...(t.statusHistory || {}), ...entries };
                const today = getLocalDateKey();
                const todayUpdate = entries[today];
                return { 
                  ...t, 
                  statusHistory: newHistory,
                  streak: calculateTaskStreak(newHistory),
                  ...(todayUpdate !== undefined ? { status: todayUpdate || 'pending' } : {})
                };
              }));
            }}
          />
        );
      })()}

      {showScrollTop && <ScrollToTop scrollRef={listRef} />}
      
      <ViewNoteModal note={viewingNote} onClose={() => setViewingNote(null)} />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#fff' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  headerActions:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:      { padding: 8, borderRadius: 8 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, gap: 4, marginLeft: 4 },
  addBtnText:   { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Toolbar
  toolbar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 10 },
  viewToggle:   { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2 },
  viewBtn:      { padding: 7, borderRadius: 6 },
  viewBtnActive:{ backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  searchBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:  { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 0, minHeight: 22 },
  divider:      { height: 1, backgroundColor: '#f3f4f6' },

  // List view
  list:         { paddingBottom: 40 },
  empty:        { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 15 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, gap: 8 },
  sectionDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  sectionCount: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  rowContainer: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  rowSubtasks:  { paddingLeft: 34, paddingRight: 20, paddingBottom: 12, gap: 4 },
  rowSubtaskItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  rowSubtaskText: { fontSize: 13, color: '#6b7280', flex: 1 },
  subDot:       { width: 8, height: 8, borderRadius: 4 },
  dotWrap:      { padding: 4, marginRight: 4 },
  dot:          { width: 12, height: 12, borderRadius: 6 },
  rowBody:      { flex: 1, gap: 5 },
  rowTitle:     { fontSize: 15, color: '#111827' },
  strikeDone:   { color: '#9ca3af', textDecorationLine: 'line-through' },
  metaRow:      { flexDirection: 'row', gap: 5, flexWrap: 'wrap', alignItems: 'center' },
  metaChip:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  metaChipText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },

  // Card view — poker card proportions (2.5 : 3.5 ratio)
  cardList:        { padding: 14, paddingBottom: 40 },
  cardRow:         { gap: 12, marginBottom: 12 },
  cardGrid:        { flexDirection: 'row', flexWrap: 'wrap', padding: 14, paddingBottom: 40, gap: 12 },
  cardBack:        { backgroundColor: '#ffffff', borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  card:            { width: CARD_W, height: CARD_H, backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5, justifyContent: 'space-between', backfaceVisibility: 'hidden' },
  cardCorner:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCornerDot:   { width: 7, height: 7, borderRadius: 4 },
  cardCornerLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardCenter:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 6 },
  cardTitle:       { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },
  cardSubtaskPreview: { width: '100%', gap: 2, marginTop: 4 },
  cardSubtaskMiniRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardSubtaskMiniText: { fontSize: 10, color: '#6b7280' },
  cardSubtaskMore: { fontSize: 9, color: '#9ca3af', marginLeft: 14, fontStyle: 'italic' },
  cardBottom:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cardChip:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, gap: 3 },
  cardChipText:    { fontSize: 10, color: '#6b7280', fontWeight: '500' },

  // Detail modal
  detailScreen:     { flex: 1, backgroundColor: '#fff' },
  detailHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 8 : 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', position: 'relative', zIndex: 10, elevation: 4, backgroundColor: '#fff' },
  detailHeaderTitle:{ fontSize: 17, fontWeight: '600', color: '#111827' },
  detailBody:       { padding: 20, gap: 4, paddingBottom: 120 },
  titleInput:       { fontSize: 22, fontWeight: '600', color: '#111827', paddingVertical: 8, marginBottom: 0, borderBottomWidth: 2, borderBottomColor: '#6366f1' },
  autocompleteDrop: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 4, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  autocompleteItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  autocompleteText: { fontSize: 15, color: '#111827' },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  fieldInput:       { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb' },
  multilineInput:   { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  dateRow:          { flexDirection: 'row', gap: 12 },
  chipGroup:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optChip:          { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  optChipText:      { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  // Subtasks
  subtaskRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  subtaskCheck:  { padding: 2 },
  subtaskText:   { flex: 1, fontSize: 15, color: '#111827' },
  subtaskDone:   { color: '#9ca3af', textDecorationLine: 'line-through' },
  subtaskAction: { padding: 4 },
  addSubBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
  addSubText:    { fontSize: 14, color: '#6366f1', fontWeight: '600' },
  inlineInput:   { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb' },
  inlineCancel:  { padding: 6 },
  inlineAdd:     { padding: 6 },

  // Save / modals
  saveBtn:   { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet:     { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12 },
  sheetTitle:{ fontSize: 17, fontWeight: '700', color: '#111827' },
  hint:      { fontSize: 13, color: '#9ca3af' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  cancelText:{ color: '#6b7280', fontWeight: '600', fontSize: 15 },
  
  // Import tabs
  importTabs: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  importTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  importTabActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  importTabText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  importTabTextActive: { color: '#fff' },

  // Shuffle button in toolbar
  shuffleBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#6366f1' },
  shuffleBtnText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },

  // Shuffle modal
  shuffleOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  deckWrap:        { width: CARD_W * 1.3, height: CARD_H * 1.3, alignItems: 'center', justifyContent: 'center' },
  ghostCard:       { width: CARD_W * 1.2, height: CARD_H * 1.2, borderRadius: 16, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.08)' },
  shuffleHint:     { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 24 },
  revealCard:      { width: CARD_W * 1.4, height: CARD_H * 1.4, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2.5, padding: 16, justifyContent: 'space-between' },
  revealTitle:     { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  shuffleActions:  { flexDirection: 'row', gap: 12, marginTop: 24 },
  shuffleActionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, backgroundColor: '#fff' },
  shuffleActionText:{ fontSize: 15, fontWeight: '600', color: '#6366f1' },

  // Focus Your Day
  fydStart: {
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fydStartTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  fydStartSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  
  fydBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#f5f3ff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  fydHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  fydStepText: { fontSize: 12, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase' },
  fydQuestion: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  fydSelector: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 16 },
  searchBoxSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 6, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInner: { flex: 1, fontSize: 14, color: '#111827' },
  fydItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  fydItemText: { fontSize: 15, color: '#4b5563' },
  fydNext: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 14, alignItems: 'center' },
  fydNextText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  
  fydDone: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
});

function ViewNoteModal({ note: initialNote, isNew, taskId, onClose }) {
  const { colors } = useTheme();
  const { updateNote, addNote } = useNotes();
  const [isEditing, setIsEditing] = useState(isNew || initialNote?.isInitialEdit || false);
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || '');

  React.useEffect(() => {
    if (initialNote) {
      setTitle(initialNote.title || '');
      setContent(initialNote.content || '');
      setIsEditing(initialNote.isInitialEdit || false);
    } else if (isNew) {
      setTitle('');
      setContent('');
      setIsEditing(true);
    }
  }, [initialNote, isNew]);

  if (!initialNote && !isNew) return null;

  const handleSave = () => {
    if (isNew) {
      addNote(title, content, [], taskId);
    } else {
      updateNote(initialNote.id, { title, content });
    }
    onClose();
  };

  return (
    <View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 10000 }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ width: '100%', maxWidth: 500, alignItems: 'center' }}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          style={{ width: '100%', backgroundColor: colors.background || '#fff', borderRadius: 24, padding: 24, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 }}
        >
           <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
               <Ionicons name="document-text" size={20} color="#f59e0b" />
               {isEditing ? (
                 <TextInput
                   style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary || '#111827', flex: 1, padding: 0 }}
                   value={title}
                   onChangeText={setTitle}
                   placeholder="Note Title"
                   autoFocus
                 />
               ) : (
                 <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary || '#111827', flex: 1 }}>{initialNote?.title || 'Untitled Note'}</Text>
               )}
             </View>
             <View style={{ flexDirection: 'row', gap: 12 }}>
               {isEditing ? (
                 <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#f59e0b', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 }}>
                   <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>
                 </TouchableOpacity>
               ) : (
                 <TouchableOpacity onPress={() => setIsEditing(true)} style={{ padding: 4 }}>
                   <Ionicons name="pencil" size={20} color={colors.textSecondary || '#6b7280'} />
                 </TouchableOpacity>
               )}
               <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                 <Ionicons name="close" size={24} color={colors.textSecondary || '#6b7280'} />
               </TouchableOpacity>
             </View>
           </View>
           <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 20 }}>
             {isEditing ? (
               <TextInput
                 style={{ fontSize: 16, lineHeight: 24, color: colors.textSecondary || '#374151', minHeight: 200 }}
                 value={content}
                 onChangeText={setContent}
                 placeholder="Start writing..."
                 multiline
                 textAlignVertical="top"
               />
             ) : (
               <Text style={{ fontSize: 16, lineHeight: 24, color: colors.textSecondary || '#374151' }}>{initialNote?.content || 'No content.'}</Text>
             )}
           </ScrollView>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}
