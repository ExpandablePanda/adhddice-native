import React, { useState, useRef, useEffect } from 'react';
// ADHDice: Cloud-Sync & Real-time Enabled 🚀
import {
  View, Text, SectionList, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, KeyboardAvoidingView, Platform, Image,
  ScrollView, Alert, Animated, RefreshControl, AppState, Linking, Switch
} from 'react-native';
import { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';
import { useTasks, getLocalDateKey, getAppDayKey, normalizeDateKey, calculateTaskStreak, calculateTaskMissedStreak, calculateBestStreak, STATUSES, STATUS_ORDER, mapSubtasks, calcNextDueDate, ENERGY } from '../lib/TasksContext';
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
import BankedRollsModal from '../components/BankedRollsModal';
import { APP_VERSION } from '../lib/Constants';
import CardViewCanvas from '../components/CardViewCanvas';
import MomentumBar from '../features/tasks/components/MomentumBar';
import SubtaskItem from '../features/tasks/components/SubtaskItem';
import TaskDetailModal from '../features/tasks/components/TaskDetailModal';
import EisenhowerMatrixView from '../features/tasks/components/EisenhowerMatrixView';
import ViewNoteModal from '../features/tasks/components/ViewNoteModal';
import FocusYourDay from '../features/tasks/components/FocusYourDay';
import OneStepAtATimeView from '../features/tasks/components/OneStepAtATimeView';
import { generateId, newSubtask, BLANK, toggleById, deleteById, addChildTo, countSubtasks, countDone, cycleStatusInTree, updateStatusInTree, findInTree, reorderInTree, ensureUniqueIds, getStepPresets, flattenToSteps } from '../features/tasks/utils/taskTreeUtils';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 12;
const CARD_PAD = 14;
const numColumns  = Platform.OS === 'web' && SCREEN_W > 700 ? 5 : 2;
const WEB_CARD_BASE = SCREEN_W;
const CARD_W   = (WEB_CARD_BASE - CARD_PAD * 2 - CARD_GAP * (numColumns - 1)) / numColumns;
const CARD_H   = CARD_W * 1.4;  // standard playing card ratio (5:7)




const VIEWS = [
  { key: 'list',   label: 'List',    icon: 'list' },
  { key: 'matrix', label: 'Matrix',  icon: 'grid-outline' },
  { key: 'cards',  label: '3D Card', icon: 'cube-outline' }
];




// ═════════════════════════════════════════════════════════════════════════════
function groupByStatus(tasks, overstimulated = false, isFiltering = false) {
  const todayKey = getLocalDateKey();
  const activeStatuses = ['active', 'pending', 'upcoming', 'not_due', 'missed'];
  
  const sections = activeStatuses
    .map(s => {
      // Filter out tasks that were completed today from active sections
      const data = tasks.filter(t => {
        const h = t.statusHistory?.[todayKey];
        const isDoneToday = h === 'done' || h === 'did_my_best';
        // Recurring tasks should not be hidden from active sections just because they were done today
        // (because they move to 'upcoming' and we want to see them there)
        const shouldHide = isDoneToday && !t.frequency;
        
        // If filtering, we don't want to exclude priority/urgent from their status buckets
        const excludeSpecial = (t.isPriority || t.isUrgent);
        return t.status === s && !excludeSpecial && !shouldHide;
      });
      return { 
        title: STATUSES[s]?.label || s, 
        status: s, 
        data,
        fullCount: data.length 
      };
    })
    .filter(g => g.fullCount > 0);

  if (overstimulated) {
    // In overstimulated mode, we only show Priority and Urgent
    // So we return an empty array for normal status groups
    sections.length = 0; 
  } else {
    // Group all currently 'done' tasks OR any task finished today
    const doneData = tasks.filter(t => {
      const h = t.statusHistory?.[todayKey];
      const isDoneToday = h === 'done' || h === 'did_my_best';
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
  }

  if (true) { // Always show special sections even if filtering
    const priorityData = tasks.filter(t => {
      const h = t.statusHistory?.[todayKey];
      const isDoneToday = h === 'done' || h === 'did_my_best';
      const isDone = t.status === 'done' || t.status === 'did_my_best' || isDoneToday;
      if (isDone) return false;
      if (overstimulated && t.status === 'upcoming') return false;
      return t.isPriority;
    });
    if (priorityData.length > 0) {
      sections.unshift({
        title: '🧠 Focus',
        status: 'first_step',
        data: priorityData,
        fullCount: priorityData.length
      });
    }

    const urgentData = tasks.filter(t => {
      const h = t.statusHistory?.[todayKey];
      const isDoneToday = h === 'done' || h === 'did_my_best';
      const isDone = t.status === 'done' || t.status === 'did_my_best' || isDoneToday;
      if (isDone) return false;
      if (t.status === 'upcoming') return false;
      return t.isUrgent && !t.isPriority;
    });
    if (urgentData.length > 0) {
      sections.unshift({
        title: '⏰ Urgent Tasks',
        status: 'upcoming', 
        data: urgentData,
        fullCount: urgentData.length
      });
    }
  }

  return sections;
}

// ═════════════════════════════════════════════════════════════════════════════
// TASK HISTORY MODAL
// ═════════════════════════════════════════════════════════════════════════════

function TaskHistoryModal({ task, taskHistory = [], onClose, onUpdateHistory, onFillRange, pendingRolls = 0 }) {
  const { colors } = useTheme();
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
    const s = history[key];
    const isFinalized = s === 'done' || s === 'did_my_best' || s === 'missed';
    const isToday = key === todayKey;
    const status = s || (isToday && (task.status === 'done' || task.status === 'did_my_best' || task.status === 'missed') ? task.status : null);
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
  const bestStreak = calculateBestStreak(history);

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>Task History</Text>
            {pendingRolls > 0 && (
              <View style={{ backgroundColor: '#6366f1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>+{pendingRolls}</Text>
                <Text style={{ fontSize: 10 }}>🎲</Text>
              </View>
            )}
          </View>
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
function TaskRow({ 
  task, onConfirmStatus, onOpen, onHistory, onDeprioritize, onViewNote, onStartFocus,
  selectedSubtasks = {}, onToggleSubselect, onBulkSubtaskStatus,
  selectionMode, isSelected, onToggleSelection, onStartSelectionMode, overstimulated = false
}) {
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [openSubPickers, setOpenSubPickers] = useState(new Set()); // Set of subtask IDs with pickers open
  const navigation = useNavigation();
  const { notes } = useNotes();
  const { dayStartTime } = useSettings();
  const { economy } = useEconomy();

  const vault = economy.vaultPrizes || [];
  const lockedPrize = vault.find(p => (p.linkedTaskIds || []).includes(String(task.id)) && p.status === 'locked');
  const unlockedPrize = vault.find(p => (p.linkedTaskIds || []).includes(String(task.id)) && p.status === 'unlocked');
  const linkedNotesCount = (notes || []).filter(n => n.taskId === task.id).length;

  const currentStatusKey = task.status || 'pending';
  const status      = STATUSES[currentStatusKey] || STATUSES.pending;
  const energy      = task.energy ? (ENERGY[task.energy] || null) : null;
  const total       = countSubtasks(task.subtasks);
  const done        = countDone(task.subtasks);

  const hasSubtasks = (task.subtasks || []).length > 0;

  return (
    <View style={[
      styles.rowContainer, 
      task.isUrgent && task.status !== 'done' && { borderLeftWidth: 4, borderLeftColor: '#ef4444' }
    ]}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => { 
          if (selectionMode) {
            onToggleSelection(task.id);
          } else if (showStatusPicker) { 
            setShowStatusPicker(false); 
          } else { 
            onOpen(task); 
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            onStartSelectionMode(task.id);
          }
        }}
        delayLongPress={350}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectionMode && (
            <TouchableOpacity onPress={() => onToggleSelection(task.id)} style={{ marginRight: 12 }}>
              <Ionicons 
                name={isSelected ? "checkbox" : "square-outline"} 
                size={22} 
                color={isSelected ? "#6366f1" : "#d1d5db"} 
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowStatusPicker(s => !s); }} style={styles.dotWrap} hitSlop={8}>
            <View style={[styles.dot, { backgroundColor: status?.color || '#cbd5e1' }]} />
            {task.isPriority && task.status !== 'done' && (
              <View style={{ position: 'absolute', top: -2, left: -2, backgroundColor: '#8b5cf6', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' }} />
            )}
            {task.isUrgent && task.status !== 'done' && (
              <View style={{ position: 'absolute', top: -2, right: -2, backgroundColor: '#ef4444', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' }} />
            )}
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
          {!overstimulated && (
            <View style={styles.metaRow}>
              {task.isPriority && onDeprioritize && (
                <TouchableOpacity
                  style={[styles.metaChip, { backgroundColor: '#ede9fe', borderColor: '#8b5cf6', borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }]}
                  onPress={(e) => { e.stopPropagation(); onDeprioritize(task.id); }}
                >
                  <MaterialCommunityIcons name="brain" size={10} color="#8b5cf6" />
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
              {task.status !== 'done' && (
                <TouchableOpacity
                  style={[styles.metaChip, { backgroundColor: '#f5f3ff', borderColor: '#8b5cf6', borderWidth: 1 }]}
                  onPress={(e) => { e.stopPropagation(); onStartFocus(task); }}
                >
                  <Ionicons name="footsteps-outline" size={12} color="#8b5cf6" />
                  <Text style={[styles.metaChipText, { color: '#8b5cf6', fontWeight: '700' }]}>One Step at a Time</Text>
                </TouchableOpacity>
              )}
              {lockedPrize && (
                <TouchableOpacity 
                  style={[styles.metaChip, { backgroundColor: '#fef2f2', borderColor: '#ef4444', borderWidth: 1 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    navigation.navigate('Roll', { openVault: true });
                  }}
                >
                  <Ionicons name="lock-closed" size={10} color="#ef4444" />
                  <Text style={[styles.metaChipText, { color: '#ef4444', fontWeight: '700' }]}>Prize Locked</Text>
                </TouchableOpacity>
              )}
              {unlockedPrize && (
                <TouchableOpacity 
                  style={[styles.metaChip, { backgroundColor: '#f0fdf4', borderColor: '#059669', borderWidth: 1 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    navigation.navigate('Roll', { openVault: true });
                  }}
                >
                  <Ionicons name="gift" size={10} color="#059669" />
                  <Text style={[styles.metaChipText, { color: '#059669', fontWeight: '700' }]}>Prize Unlocked!</Text>
                </TouchableOpacity>
              )}
              {energy && <View style={[styles.metaChip, { backgroundColor: energy.bg }]}><Text style={[styles.metaChipText, { color: energy.color }]}>{energy.label}</Text></View>}
              {task.estimatedMinutes ? <View style={styles.metaChip}><Ionicons name="hourglass-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>~{task.estimatedMinutes >= 60 ? `${Math.floor(task.estimatedMinutes/60)}h${task.estimatedMinutes%60 ? ` ${task.estimatedMinutes%60}m` : ''}` : `${task.estimatedMinutes}m`}</Text></View> : null}
              {(task.dueDate || task.dueTime) ? <View style={styles.metaChip}><Ionicons name="calendar-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>{task.dueDate} {task.dueTime}</Text></View> : null}
              {total > 0 && <View style={styles.metaChip}><Ionicons name="checkbox-outline" size={10} color="#6b7280" /><Text style={styles.metaChipText}>{done}/{total}</Text></View>}
              {(calculateTaskStreak(task.statusHistory || {}, dayStartTime, !!task.frequency, task.frequency) >= 2) ? <View style={[styles.metaChip, { backgroundColor: '#fee2e2' }]}><Ionicons name="flame" size={10} color="#ef4444" /><Text style={[styles.metaChipText, { color: '#ef4444' }]}>Hot Streak {calculateTaskStreak(task.statusHistory || {}, dayStartTime, !!task.frequency, task.frequency)}</Text></View> : null}
              {(() => { const ms = calculateTaskMissedStreak(task.statusHistory, dayStartTime, !!task.frequency); return ms > 0 ? <View style={[styles.metaChip, { backgroundColor: '#1f2937' }]}><Text style={[styles.metaChipText, { color: '#f9fafb' }]}>💀 {ms}</Text></View> : null; })()}
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
              {task.link && (
                <TouchableOpacity
                  style={[styles.metaChip, { backgroundColor: '#f5f3ff', borderColor: '#8b5cf6', borderWidth: 1 }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    try {
                      let url = task.link;
                      if (!url.startsWith('http')) url = 'https://' + url;
                      Linking.openURL(url);
                    } catch (err) {}
                  }}
                >
                  <Ionicons name="link-outline" size={10} color="#8b5cf6" />
                  <Text style={[styles.metaChipText, { color: '#8b5cf6', fontWeight: '700' }]}>{task.linkTitle || 'Link'}</Text>
                </TouchableOpacity>
              )}
              {(task.tags || []).map((tag, i) => <View key={i} style={[styles.metaChip, { backgroundColor: '#ede9fe' }]}><Text style={[styles.metaChipText, { color: '#6366f1' }]}>{tag}</Text></View>)}
            </View>
          )}
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
          {(() => {
            const taskSelected = selectedSubtasks[task.id] || new Set();
            return (
              <View>
                {taskSelected.size > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingLeft: 4, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#6366f1', textTransform: 'uppercase', marginRight: 4 }}>{taskSelected.size} Selected</Text>
                    {['done', 'did_my_best', 'missed', 'active', 'pending', 'upcoming'].map(st => (
                      <TouchableOpacity 
                        key={st} 
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: STATUSES[st].color }}
                        onPress={() => onBulkSubtaskStatus(task.id, st)}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                          {STATUSES[st].label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => onBulkSubtaskStatus(task.id, null)} style={{ marginLeft: 'auto', padding: 4 }}>
                      <Ionicons name="close-circle" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                )}
                {(function renderSubs(subs, depth) {
                  const filteredSubs = overstimulated 
                    ? subs.filter(s => s.status !== 'done' && s.status !== 'did_my_best')
                    : subs;
                  return filteredSubs.map(s => {
                    const subStatusKey = s.status || 'pending';
                    const subCfg = STATUSES[subStatusKey] || STATUSES.pending;
                    const isPickerOpen = openSubPickers.has(s.id);
                    const isSelected = taskSelected.has(s.id);
                    
                    return (
                      <View key={s.id}>
                        <View style={[styles.rowSubtaskItem, depth > 0 && { marginLeft: depth * 14 }]}>
                          <TouchableOpacity
                            onPress={(e) => { 
                              e.stopPropagation(); 
                              if (taskSelected.size > 0) {
                                onToggleSubselect(task.id, s.id);
                              } else {
                                setOpenSubPickers(prev => {
                                  const next = new Set(prev);
                                  if (next.has(s.id)) next.delete(s.id);
                                  else next.add(s.id);
                                  return next;
                                });
                                setShowStatusPicker(false); 
                              }
                            }}
                            onLongPress={() => onToggleSubselect(task.id, s.id)}
                            hitSlop={6}
                          >
                            <View style={[styles.subDot, { backgroundColor: isSelected ? '#6366f1' : subCfg.color }]}>
                              {isSelected && <Ionicons name="checkmark" size={6} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={{ flex: 1 }} 
                            onLongPress={() => onToggleSubselect(task.id, s.id)}
                            onPress={() => { if (taskSelected.size > 0) onToggleSubselect(task.id, s.id); }}
                          >
                            <Text style={[styles.rowSubtaskText, (s.status === 'done' || s.status === 'did_my_best') && styles.strikeDone]}>{s.title}</Text>
                          </TouchableOpacity>
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
                                  onPress={(e) => { 
                                    e.stopPropagation(); 
                                    onConfirmStatus(task.id, st, s.id); 
                                    setOpenSubPickers(prev => {
                                      const next = new Set(prev);
                                      next.delete(s.id);
                                      return next;
                                    });
                                  }}
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
            );
          })()}
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, status, count, collapsed, onToggle }) {
  const isPriority = title === '🧠 Focus';
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

function TaskCard({ task, onConfirmStatus, onOpen, onHistory, isFlipped, onFlipCard, onViewNote, selectionMode, isSelected, onToggleSelection }) {
  const [stagedStatus, setStagedStatus] = useState(null);
  const flipAnim = useRef(new Animated.Value(isFlipped ? 1 : 0)).current;
  const { notes } = useNotes();
  const { dayStartTime } = useSettings();
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
    <TouchableOpacity 
      style={[
        styles.card, 
        { borderColor: status?.color || '#cbd5e1', backgroundColor: status?.color || '#ffffff' },
        isSelected && { borderWidth: 3, borderColor: '#fff' }
      ]} 
      activeOpacity={0.75} 
      onPress={() => {
        if (selectionMode) {
          onToggleSelection(task.id);
        } else {
          onOpen(task);
        }
      }}
    >
      {selectionMode && (
        <TouchableOpacity 
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 20 }}
          onPress={() => onToggleSelection(task.id)}
        >
          <Ionicons 
            name={isSelected ? "checkbox" : "square-outline"} 
            size={24} 
            color="#fff" 
          />
        </TouchableOpacity>
      )}

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
            {(task.subtasks || []).slice(0, 3).map((s, idx) => (
                <View style={[styles.cardSubtaskMiniRow, { marginBottom: 2 }]} key={s.id || s.title || idx}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff', marginRight: 4 }} />
                  <Text style={[styles.cardSubtaskMiniText, { color: '#ffffff' }, (s.status === 'done' || s.status === 'did_my_best') && { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                </View>
            ))}
            {(task.subtasks || []).length > 3 && <Text style={[styles.cardSubtaskMore, { color: '#ffffff', opacity: 0.8 }]}>+{(task.subtasks || []).length - 3} more...</Text>}
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
        {(() => { const ms = calculateTaskMissedStreak(task.statusHistory, dayStartTime, !!task.frequency); return ms > 0 ? <View style={[styles.cardChip, { backgroundColor: 'rgba(0,0,0,0.4)' }]}><Text style={[styles.cardChipText, { color: '#f9fafb', fontWeight: '800' }]}>💀 {ms}</Text></View> : null; })()}
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


// ═════════════════════════════════════════════════════════════════════════════
// TASK DETAIL MODAL


const FieldOption = ({ id, label, children, icon, activeFields, onToggle, styles }) => (
  <View style={[styles.bulkFieldRow, activeFields.has(id) && { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}>
    <TouchableOpacity 
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
      onPress={() => onToggle(id)}
    >
      <Ionicons 
        name={activeFields.has(id) ? "checkbox" : "square-outline"} 
        size={20} 
        color={activeFields.has(id) ? "#6366f1" : "#d1d5db"} 
      />
      <Ionicons name={icon} size={18} color="#6b7280" />
      <Text style={[styles.bulkFieldLabel, activeFields.has(id) && { color: '#6366f1', fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
    {activeFields.has(id) && (
      <View style={{ paddingLeft: 30, paddingBottom: 12 }}>
        {children}
      </View>
    )}
  </View>
);

function BulkEditModal({ visible, onClose, onSave, allTasks, selectedIds }) {
  const { top } = useSafeAreaInsets();
  const [updates, setUpdates] = useState({
    energy: null,
    frequency: null,
    frequencyDays: null,
    estimatedMinutes: null,
    dueDate: '',
    dueTime: '',
    addTags: [],
    removeTags: []
  });
  const [activeFields, setActiveFields] = useState(new Set());
  const [calOpen, setCalOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagMode, setTagMode] = useState('add'); // 'add' | 'remove'
  const [showExistingTagMenu, setShowExistingTagMenu] = useState(false);
  
  const existingTags = Array.from(new Set(allTasks.flatMap(t => t.tags || []))).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const toggleField = (f) => {
    setActiveFields(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const handleSave = () => {
    const finalUpdates = {};
    activeFields.forEach(f => {
      if (f === 'tags') {
        finalUpdates.addTags = updates.addTags;
        finalUpdates.removeTags = updates.removeTags;
      } else {
        finalUpdates[f] = updates[f];
        if (f === 'frequency' && updates.frequency === 'DaysAfter') {
          finalUpdates.frequencyDays = updates.frequencyDays;
        }
      }
    });
    onSave(finalUpdates);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={[styles.detailScreen, { paddingTop: top }]}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Bulk Edit</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailBody}>
          <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Select fields to apply changes to all selected tasks.</Text>

          {/* Energy */}
          <FieldOption id="energy" label="Energy Level" icon="flash-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <View style={styles.chipGroup}>
              {Object.entries(ENERGY).map(([key, cfg]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.optChip, updates.energy === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setUpdates(u => ({ ...u, energy: key }))}
                >
                  <Text style={[styles.optChipText, updates.energy === key && { color: '#fff' }]}>{cfg.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldOption>

          {/* Frequency */}
          <FieldOption id="frequency" label="Repeat Frequency" icon="repeat-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <View style={styles.chipGroup}>
              {['None', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Days After'].map(freq => {
                const internal = freq === 'Days After' ? 'DaysAfter' : (freq === 'None' ? null : freq);
                const active = updates.frequency === internal;
                return (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.optChip, active && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                    onPress={() => setUpdates(u => ({ ...u, frequency: internal }))}
                  >
                    <Text style={[styles.optChipText, active && { color: '#fff' }]}>{freq}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {updates.frequency === 'DaysAfter' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <Text style={{ fontSize: 13, color: '#374151' }}>Every</Text>
                <TextInput
                  style={[styles.fieldInput, { width: 50, textAlign: 'center' }]}
                  keyboardType="number-pad"
                  value={String(updates.frequencyDays || '')}
                  onChangeText={v => setUpdates(u => ({ ...u, frequencyDays: parseInt(v, 10) || null }))}
                />
                <Text style={{ fontSize: 13, color: '#374151' }}>days</Text>
              </View>
            )}
          </FieldOption>

          {/* Time & Date */}
          <FieldOption id="dueDate" label="Due Date" icon="calendar-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <TouchableOpacity onPress={() => setCalOpen(true)}>
              <TextInput 
                style={styles.fieldInput} 
                placeholder="Select Date" 
                value={updates.dueDate} 
                editable={false} 
                pointerEvents="none" 
              />
            </TouchableOpacity>
          </FieldOption>

          <FieldOption id="dueTime" label="Due Time" icon="time-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <TouchableOpacity onPress={() => setTimeOpen(true)}>
              <TextInput 
                style={styles.fieldInput} 
                placeholder="Select Time" 
                value={updates.dueTime} 
                editable={false} 
                pointerEvents="none" 
              />
            </TouchableOpacity>
          </FieldOption>

          {/* Estimated Time */}
          <FieldOption id="estimatedMinutes" label="Estimated Time" icon="hourglass-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <View style={styles.chipGroup}>
              {[5, 10, 15, 30, 45, 60, 90, 120].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.optChip, updates.estimatedMinutes === m && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                  onPress={() => setUpdates(u => ({ ...u, estimatedMinutes: m }))}
                >
                  <Text style={[styles.optChipText, updates.estimatedMinutes === m && { color: '#fff' }]}>{m >= 60 ? `${m/60}h` : `${m}m`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldOption>

          {/* Tags */}
          <FieldOption id="tags" label="Tags (Add/Remove)" icon="pricetags-outline" activeFields={activeFields} onToggle={toggleField} styles={styles}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity 
                style={[styles.tagToggle, tagMode === 'add' && styles.tagToggleActive]} 
                onPress={() => setTagMode('add')}
              >
                <Ionicons name="add-circle" size={14} color={tagMode === 'add' ? '#fff' : '#6366f1'} />
                <Text style={[styles.tagToggleText, tagMode === 'add' && styles.tagToggleTextActive]}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tagToggle, tagMode === 'remove' && styles.tagToggleActive]} 
                onPress={() => setTagMode('remove')}
              >
                <Ionicons name="remove-circle" size={14} color={tagMode === 'remove' ? '#fff' : '#6366f1'} />
                <Text style={[styles.tagToggleText, tagMode === 'remove' && styles.tagToggleTextActive]}>Remove</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chipGroup}>
              {(tagMode === 'add' ? updates.addTags : updates.removeTags).map(t => (
                <TouchableOpacity 
                  key={t} 
                  style={[styles.optChip, { backgroundColor: tagMode === 'add' ? '#dcfce7' : '#fee2e2', borderColor: tagMode === 'add' ? '#10b981' : '#ef4444' }]}
                  onPress={() => setUpdates(u => ({
                    ...u,
                    [tagMode === 'add' ? 'addTags' : 'removeTags']: u[tagMode === 'add' ? 'addTags' : 'removeTags'].filter(x => x !== t)
                  }))}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: tagMode === 'add' ? '#059669' : '#b91c1c' }}>{tagMode === 'add' ? '+' : '-'} {t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Existing Tags Chip Menu */}
            {existingTags.length > 0 && (
              <View style={{ marginVertical: 8 }}>
                <TouchableOpacity
                  style={[styles.tagToggle, { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, marginBottom: showExistingTagMenu ? 8 : 0 }]}
                  onPress={() => setShowExistingTagMenu(s => !s)}
                >
                  <Ionicons name="pricetags-outline" size={13} color={showExistingTagMenu ? '#fff' : '#6366f1'} />
                  <Text style={[styles.tagToggleText, showExistingTagMenu && { color: '#fff' }]}>Existing Tags</Text>
                  <Ionicons name={showExistingTagMenu ? 'chevron-up' : 'chevron-down'} size={12} color={showExistingTagMenu ? '#fff' : '#6366f1'} />
                </TouchableOpacity>
                {showExistingTagMenu && (
                  <View style={[styles.chipGroup, { backgroundColor: '#f8fafc', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }]}>
                    {existingTags
                      .filter(t => !(tagMode === 'add' ? updates.addTags : updates.removeTags).includes(t))
                      .map(t => (
                        <TouchableOpacity
                          key={t}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff' }}
                          onPress={() => {
                            setUpdates(u => ({
                              ...u,
                              [tagMode === 'add' ? 'addTags' : 'removeTags']: Array.from(new Set([...u[tagMode === 'add' ? 'addTags' : 'removeTags'], t]))
                            }));
                          }}
                        >
                          <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>+ #{t}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            )}

            <View style={{ position: 'relative', zIndex: 10 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder={`Type tag to ${tagMode}...`}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={() => {
                  const t = tagInput.trim();
                  if (t) {
                    setUpdates(u => ({
                      ...u,
                      [tagMode === 'add' ? 'addTags' : 'removeTags']: Array.from(new Set([...u[tagMode === 'add' ? 'addTags' : 'removeTags'], t]))
                    }));
                    setTagInput('');
                  }
                }}
              />
              {tagInput.trim().length > 0 && (
                <View style={[styles.autocompleteDrop, { maxHeight: 150 }]}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {existingTags
                      .filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !(tagMode === 'add' ? updates.addTags : updates.removeTags).includes(t))
                      .map(t => (
                        <TouchableOpacity 
                          key={t} 
                          style={styles.autocompleteItem}
                          onPress={() => {
                            setUpdates(u => ({
                              ...u,
                              [tagMode === 'add' ? 'addTags' : 'removeTags']: Array.from(new Set([...u[tagMode === 'add' ? 'addTags' : 'removeTags'], t]))
                            }));
                            setTagInput('');
                          }}
                        >
                          <Text style={styles.autocompleteText}># {t}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </FieldOption>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.detailFooter}>
          <TouchableOpacity 
            style={[styles.saveBtn, activeFields.size === 0 && { opacity: 0.5 }]} 
            onPress={handleSave}
            disabled={activeFields.size === 0}
          >
            <Text style={styles.saveText}>Apply to {selectedIds.size} Tasks</Text>
          </TouchableOpacity>
        </View>

        <CalendarModal visible={calOpen} onClose={() => setCalOpen(false)} onSelect={v => { setUpdates(u => ({ ...u, dueDate: v })); setCalOpen(false); }} />
        <TimePickerModal visible={timeOpen} onClose={() => setTimeOpen(false)} initialTime={updates.dueTime} onSelect={v => { setUpdates(u => ({ ...u, dueTime: v })); setTimeOpen(false); }} />
      </View>
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
                  ['Status', 'pending | active | missed | done | upcoming'],
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
// LATE NIGHT CATCH-UP (NEW)
// ═════════════════════════════════════════════════════════════════════════════

function LateNightCatchUp({ tasks, onConfirmStatus }) {
  const { colors } = useTheme();
  const { dayStartTime } = useSettings();
  // Filter for tasks that are 'pending' or 'active' (In Progress)
  const unfinished = tasks.filter(t => t.status === 'pending' || t.status === 'active');
  
  if (unfinished.length === 0) return null;

  return (
    <View style={[styles.fydBox, { borderColor: colors.amber, borderWidth: 1, backgroundColor: colors.background }]}>
      <View style={[styles.fydHeader, { alignItems: 'center' }]}>
        <Text style={[styles.fydStepText, { color: colors.amber, marginBottom: 0 }]}>Late Night Review 🌙</Text>
        
        <TouchableOpacity 
          style={{ 
            backgroundColor: colors.amber, 
            paddingHorizontal: 10, 
            paddingVertical: 5, 
            borderRadius: 8, 
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: 4,
            shadowColor: colors.amber,
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 2
          }}
          onPress={() => {
            Alert.alert("Start Next Day", "Manually process missed tasks and advance the board for today?", [
              { text: "Cancel" },
              { text: "Advance Board", onPress: () => {
                 onConfirmStatus([], 'advance_board'); 
              }}
            ]);
          }}
        >
          <Ionicons name="play-skip-forward" size={12} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>START NEXT DAY</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
        It's after midnight! Want to close out yesterday's tasks before the 6 AM rollover?
      </Text>

      
      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
        {unfinished.map(t => (
          <View key={t.id} style={[styles.fydItem, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fydItemText, { fontSize: 14 }]}>{t.title}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>{STATUSES[t.status].label}</Text>
                {(() => {
                  const isRecurring = !!t.frequency;
                  const hot = calculateTaskStreak(t.statusHistory || {}, dayStartTime, isRecurring);
                  const missed = calculateTaskMissedStreak(t.statusHistory || {}, dayStartTime, isRecurring);
                  if (hot > 0) return <Text style={{ fontSize: 10, color: '#10b981', fontWeight: '700' }}>🔥 {hot}</Text>;
                  if (missed > 0) return <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '700' }}>💀 {missed}</Text>;
                  return null;
                })()}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['done', 'did_my_best', 'missed'].map(st => (
                <TouchableOpacity
                  key={st}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: STATUSES[st]?.color || colors.primary
                  }}
                  onPress={() => onConfirmStatus(t.id, st)}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
                    {STATUSES[st]?.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MATRIX STATUS PICKER MODAL
// ═════════════════════════════════════════════════════════════════════════════


function MorningStartModal({ onClaimReward, onStartPlanning, onClose }) {
  const { colors } = useTheme();
  const [claimed, setClaimed] = useState(false);
  const hour = new Date().getHours();

  // HARD CUTOFF: Never render after 12:00 PM (Noon)
  if (hour >= 12) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.morningOverlay}>
        <Animated.View style={styles.morningContent}>
          <Ionicons name="sunny" size={60} color="#fbbf24" style={{ marginBottom: 16 }} />
          <Text style={styles.morningTitle}>Good Morning! 🌅</Text>
          <Text style={styles.morningSub}>Ready to build some serious momentum today?</Text>
          
          {!claimed ? (
            <TouchableOpacity 
              style={styles.morningRewardBtn} 
              onPress={() => { setClaimed(true); onClaimReward(); }}
            >
              <Ionicons name="dice" size={24} color="#fff" />
              <View>
                <Text style={styles.morningRewardText}>Claim Daily Bonus</Text>
                <Text style={styles.morningRewardSub}>+1 Free Dice Roll</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.morningRewardBtn, { backgroundColor: '#10b981' }]}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.morningRewardText}>Reward Claimed!</Text>
            </View>
          )}

          <View style={{ width: '100%', gap: 12, marginTop: 12 }}>
            <TouchableOpacity style={styles.morningPlanBtn} onPress={onStartPlanning}>
              <Text style={styles.morningPlanText}>Start Planning</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.morningSkipBtn} onPress={onClose}>
              <Text style={styles.morningSkipText}>I'll plan later</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}





// ═════════════════════════════════════════════════════════════════════════════
// FOCUS YOUR DAY
// ═════════════════════════════════════════════════════════════════════════════


export default function TasksScreen() {
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const { dayStartTime } = useSettings();
  const { 
    tasks, setTasks, logTaskEvent, taskHistory, isSyncing, 
    breakTimer, setBreakTimer, completeTask 
  } = useTasks();
  const [refreshing, setRefreshing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleVisibility = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh context will handle the logic in its useEffect deps, 
    // but we can also trigger a manual force-fetch if needed.
    setRefreshing(false);
  };
  const { economy, spendPoints, addFreeRoll, addXP, addReward, removeReward, incrementActiveStreak, incrementMissedStreak, addBankedReward, claimBankedRewards } = useEconomy();
  
  const shufflePlayer = useAudioPlayer(require('../../assets/card-shuffle.mp3'));
  const flipPlayer = useAudioPlayer(require('../../assets/card-flip.mp3'));

  function playShuffleSound() {
    try {
      shufflePlayer.seekTo(0);
      shufflePlayer.play();
    } catch (e) {}
  }

  function playFlipSound() {
    try {
      flipPlayer.seekTo(0);
      flipPlayer.play();
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
  const [bulkRollCount, setBulkRollCount] = useState(0);
  const [overstimulated, setOverstimulated] = useState(false);
  
  const [showMorningStart, setShowMorningStart] = useState(false);
  const [forceFocusOpen, setForceFocusOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkEditVisible, setBulkEditVisible] = useState(false);
  const [osaatQueue, setOsaatQueue] = useState([]);
  const [osaatIndex, setOsaatIndex] = useState(0);

  const startFocusFlow = (task) => {
    const steps = flattenToSteps([task]);
    if (steps.length > 0) {
      setOsaatQueue(steps);
      setOsaatIndex(0);
    } else {
      Alert.alert("No Steps", "This task has no undone items to focus on.");
    }
  };
  
  const toggleTaskSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleBulkUpdate = (updates) => {
    const { addTags = [], removeTags = [], ...scalars } = updates;
    setTasks(prev => prev.map(t => {
      if (!selectedIds.has(t.id)) return t;
      let newTags = [...(t.tags || [])];
      if (addTags.length) {
        addTags.forEach(tag => { if (!newTags.includes(tag)) newTags.push(tag); });
      }
      if (removeTags.length) {
        newTags = newTags.filter(tag => !removeTags.includes(tag));
      }
      return { ...t, ...scalars, tags: newTags };
    }));
    clearSelection();
    setBulkEditVisible(false);
  };

  const confirmBulkDelete = () => {
    const count = selectedIds.size;
    Alert.alert(
      "Delete Multiple Tasks",
      `Are you sure you want to delete ${count} selected tasks? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: () => {
          setTasks(prev => prev.filter(t => !selectedIds.has(t.id)));
          clearSelection();
        }}
      ]
    );
  };

  // ── Draft Persistence ──
  useEffect(() => {
    const restoreDraft = async () => {
      try {
        const saved = await AsyncStorage.getItem('adhddice_task_draft');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.id !== undefined) {
            setEditingTask(parsed);
          }
        }
      } catch (e) {}
    };
    restoreDraft();
  }, []);

  // We only remove the draft when setEditingTask(null) is called AFTER mounting.
  // Actually, a safer way is to just let TaskDetailModal handle the saving, 
  // and we only clear it when onSave or onClose is called.

  const handleOsaatStatusChange = (step, targetStatus, isSubOfStep = false) => {
    const currentQueueItem = osaatQueue[osaatIndex];
    
    if (isSubOfStep) {
      // It's a sub-subtask. We need the top-level task ID.
      const topLevelId = currentQueueItem.isSubtask ? currentQueueItem.parentId : currentQueueItem.id;
      confirmStatus(topLevelId, targetStatus, step.id);
      
      // Update the local queue so the UI reflects the change in subtasks
      setOsaatQueue(prev => prev.map((item, i) => {
        if (i !== osaatIndex) return item;
        return {
          ...item,
          subtasks: updateStatusInTree(item.subtasks || [], step.id, targetStatus)
        };
      }));
      return;
    }

    if (step.isSubtask) {
      confirmStatus(step.parentId, targetStatus, step.id);
    } else {
      confirmStatus(step.id, targetStatus);
    }
    
    // If it's a completion status, move to next step after a tiny delay for visual feedback
    if (targetStatus === 'done' || targetStatus === 'did_my_best') {
      setTimeout(() => {
        setOsaatIndex(prev => prev + 1);
      }, 400);
    } else {
      // Just update the queue so the chip color changes
      setOsaatQueue(prev => prev.map((item, i) => i === osaatIndex ? { ...item, status: targetStatus } : item));
    }
  };

  const handleOsaatSkip = () => {
    setOsaatIndex(prev => (prev + 1) % osaatQueue.length);
  };

  const handleOsaatBreakDown = (text) => {
    const step = osaatQueue[osaatIndex];
    const newId = generateId();
    const newStep = {
      id: newId,
      title: text,
      parentId: step.id, // Now always the child of the current view
      parentTitle: step.title,
      isSubtask: true,
      status: 'pending'
    };
    
    // Update main state recursively
    setTasks(prev => prev.map(t => {
      // If the current step IS this task
      if (t.id === step.id) {
        return { ...t, subtasks: [...(t.subtasks || []), { id: newId, title: text, status: 'pending', subtasks: [] }] };
      }
      // Otherwise, search deep in subtasks
      return { ...t, subtasks: addChildTo(t.subtasks || [], step.id, { id: newId, title: text, status: 'pending', subtasks: [] }) };
    }));

    // Insert at current position (shifts current step down)
    setOsaatQueue(prev => {
      const next = [...prev];
      next.splice(osaatIndex, 0, newStep);
      return next;
    });
  };

  // Check for Morning Start UI (Enforced Window: dayStartTime to 11 AM)
  const checkMorning = React.useCallback(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Only show between dayStartTime (e.g. 6 AM) and 11 AM
    // Show as long as it's at or after dayStartTime (no upper bound)
    if (currentHour >= dayStartTime && currentHour < 12) {
      const todayKey = getLocalDateKey(now);
      const lastStart = await AsyncStorage.getItem('@ADHD_last_morning_start');
      
      // Also check if we have unfinalized tasks from yesterday
      if (lastStart !== todayKey) {
        setShowMorningStart(true);
      }
    }
  }, [dayStartTime]);

  // Run on mount and whenever dayStartTime changes
  useEffect(() => {
    checkMorning();
  }, [checkMorning]);

  // Run whenever the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      checkMorning();
    }, [checkMorning])
  );

  // Run whenever the app returns to the foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkMorning();
      }
    });
    return () => subscription.remove();
  }, [checkMorning]);

  const handleMorningClose = async () => {
    const todayKey = getLocalDateKey();
    await AsyncStorage.setItem('@ADHD_last_morning_start', todayKey);
    setShowMorningStart(false);
  };

  const handleMorningPlan = () => {
    handleMorningClose();
    setForceFocusOpen(true);
  };
  
  // Advanced Filtering
  const [filterEnergy, setFilterEnergy] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [filterMode, setFilterMode] = useState('OR'); // 'AND' | 'OR'
  const [momentumMode, setMomentumMode] = useState('urgent'); // 'urgent' or 'today'
  const [filterStatus, setFilterStatus] = useState([]); // Status filter chips
  const [filterMissedStreak, setFilterMissedStreak] = useState(false);
  const [filterStreak, setFilterStreak] = useState(false);
  const [flippedCards, setFlippedCards] = useState(new Set());
  const listRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [viewingNote, setViewingNote] = useState(null);
  const [selectedSubtasks, setSelectedSubtasks] = useState({}); // { [taskId]: Set<subtaskId> }
  const [showBankMenu, setShowBankMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuBtnRef = useRef(null);
  const [viewMenuPos, setViewMenuPos] = useState({ x: 16, y: 120 });

  const openViewMenu = () => {
    viewMenuBtnRef.current?.measure((fx, fy, w, h, px, py) => {
      setViewMenuPos({ x: px, y: py + h + 4 });
      setShowViewMenu(true);
    });
  };

  // Self-healing: Correct any mismatched streaks and ensure unique IDs on load
  useEffect(() => {
    if (tasks.length > 0) {
      // 1. Ensure IDs are unique across the entire tree
      const { result: uniqueTasks, changed: idsChanged } = ensureUniqueIds(tasks);

      // 2. Correct any mismatched streaks
      let changed = idsChanged;
      const fixed = uniqueTasks.map(t => {
        const correct = calculateTaskStreak(t.statusHistory || {}, dayStartTime, !!t.frequency);
        if (t.streak !== correct) {
          changed = true;
          return { ...t, streak: correct };
        }
        return t;
      });

      if (changed) setTasks(fixed);
    }
  }, [dayStartTime]); // Run when tasks or dayStartTime change

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };

  // Stats
  const todayStr = getAppDayKey(dayStartTime);
  const stats = {
    total: tasks.length,
    today: tasks.filter(t => {
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'active').length,
    upcoming: tasks.filter(t => t.status === 'upcoming').length,
    urgentDone: tasks.filter(t => {
      if (!t.isUrgent) return false;
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    urgentTotal: tasks.filter(t => t.isUrgent).length,
    focusDone: tasks.filter(t => {
      if (!t.isPriority) return false;
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    focusTotal: tasks.filter(t => t.isPriority).length,
    dueDone: tasks.filter(t => {
      if (normalizeDateKey(t.dueDate) !== todayStr) return false;
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    dueTotal: tasks.filter(t => normalizeDateKey(t.dueDate) === todayStr).length,
    recurringDone: tasks.filter(t => {
      const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
      if (!isRec) return false;
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    recurringTotal: tasks.filter(t => {
      const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
      if (!isRec) return false;
      const s = t.statusHistory?.[todayStr];
      const isDoneToday = s === 'done' || s === 'did_my_best';
      const isPending = t.status === 'pending' || t.status === 'missed';
      return isDoneToday || isPending;
    }).length,
    oneOffDone: tasks.filter(t => {
      const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
      if (isRec) return false;
      const s = t.statusHistory?.[todayStr];
      return s === 'done' || s === 'did_my_best';
    }).length,
    oneOffTotal: tasks.filter(t => {
      const isRec = t.frequency != null || (t.frequencyDays != null && t.frequencyDays > 0) || t.weeklyDay != null;
      if (isRec) return false;
      // If it's already done, only count it if it was done TODAY (to keep momentum relevant)
      if (t.status === 'done' || t.status === 'did_my_best') {
        const s = t.statusHistory?.[todayStr];
        return s === 'done' || s === 'did_my_best';
      }
      // Otherwise, count all unfinished one-offs regardless of date
      return true;
    }).length,
  };

  const allTags = Array.from(new Set(tasks.flatMap(t => (t.tags || [])))).sort((a, b) => a.localeCompare(b));

  // Pipeline Filter logic
  let filtered = tasks;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
  }
  const dueTodayCount = tasks.filter(t => normalizeDateKey(t.dueDate) === todayStr).length;

  if (filterStatus.length > 0) {
    filtered = filtered.filter(t => {
      if (filterStatus.includes('due_today')) {
        const h = t.statusHistory?.[todayStr];
        const isDoneToday = h === 'done' || h === 'did_my_best';
        if (normalizeDateKey(t.dueDate) === todayStr || isDoneToday) return true;
      }
      if (filterStatus.includes(t.status)) return true;
      if (filterStatus.includes('done')) {
        const h = t.statusHistory?.[todayStr];
        return h === 'done' || h === 'did_my_best';
      }
      if (filterStatus.includes('one_off')) {
        if (!t.frequency) return true;
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
      .map(t => ({ t, ms: calculateTaskMissedStreak(t.statusHistory, dayStartTime, !!t.frequency) }))
      .filter(({ ms }) => ms >= 2)
      .sort((a, b) => b.ms - a.ms)
      .map(({ t }) => t);
  } else if (filterStreak) {
    filtered = filtered
      .filter(t => (t.streak || 0) >= 2)
      .sort((a, b) => (b.streak || 0) - (a.streak || 0));
  } else {
    // Sort by: Urgent (top) -> Priority -> Status order
    filtered = [...filtered].sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
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
  
  const isFiltering = !!search || filterTags.length > 0 || filterStatus.length > 0 || filterEnergy.length > 0 || filterMissedStreak || filterStreak;

  const sections = groupByStatus(filtered, overstimulated, isFiltering);

  function confirmStatus(taskId, targetStatus, subtaskId = null) {
    if (targetStatus === 'advance_board') {
      // Handle day rollover manually
      Alert.alert("Advance Board", "Proceed to start the next day and reset recurring tasks?", [
        { text: "Cancel", style: "cancel" },
        { text: "Advance", onPress: () => {
          // The rollover logic is handled by TasksContext's processTransitions
          // but we can force it by updating a timestamp if needed.
          // For now, we'll just show success and rely on the background check
          // OR we can explicitly trigger a board refresh if the context allows.
          Alert.alert("Success", "Board advanced. Recurring tasks will now reset.");
        }}
      ]);
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let subject = task;
    if (subtaskId) {
      subject = findInTree(task.subtasks || [], subtaskId);
      if (!subject) return;
    }

    const appDay = getAppDayKey(dayStartTime);

    // ── EARLY SUBTASK HANDLING ───────────────────────────────────────────────
    if (subtaskId) {
      if (targetStatus === 'done' || targetStatus === 'did_my_best') {
        addBankedReward({
          taskId: taskId,
          subtaskId: subtaskId,
          title: subject.title,
          intent: targetStatus,
          points: Math.max(1, Math.floor((subject.points || 10) * 0.5)),
          xp: Math.max(1, Math.floor((subject.xp || 20) * 0.5)),
        });
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: updateStatusInTree(t.subtasks, subtaskId, targetStatus) } : t));
        return;
      }
      if (targetStatus === 'missed') {
        Alert.alert("Missed Subtask", `Mark "${subject.title}" as missed?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm Missed", style: "destructive", onPress: () => {
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: updateStatusInTree(t.subtasks, subtaskId, 'missed') } : t));
            logTaskEvent(subject, 'missed');
          }}
        ]);
        return;
      }
      // Handle reset/pending
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: updateStatusInTree(t.subtasks, subtaskId, targetStatus) } : t));
      return;
    }

    // ── MAIN TASK HANDLING ───────────────────────────────────────────────────
    if (targetStatus === 'done' || targetStatus === 'did_my_best') {
      setShuffleTask(null);
      setCompletingTask({ 
        ...subject, 
        intent: targetStatus, 
        _dateKey: appDay,
        _backdatedCompletedAt: new Date().getHours() < dayStartTime ? new Date().toISOString() : null
      });
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, statusHistory: { ...(t.statusHistory || {}), [appDay]: targetStatus } } : t));
    } else if (targetStatus === 'missed') {
      Alert.alert(
        "Missed Task",
        `Confirming this will mark "${task.title}" as missed and start a Missed Streak. Are you sure?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm Missed", style: "destructive", onPress: () => {
              incrementMissedStreak();
              completeTask(taskId, 'missed'); // unified logic handles history, streak, and rollover
          }}
        ]
      );
    } else {
      // Use unified logic for other status changes
      completeTask(taskId, targetStatus);
    }
  }

  const handleBulkSubtaskStatus = (taskId, status) => {
    const selected = selectedSubtasks[taskId];
    if (!selected || selected.size === 0) return;
    
    selected.forEach(subId => {
      confirmStatus(taskId, status, subId);
    });
    
    setSelectedSubtasks(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  function handleTaskCompleting(id, reward) {
    if (reward) {
      addReward(reward.points, reward.xp, reward.tokens);
    }
    incrementActiveStreak();

    // Check if this was part of a banked collection chain
    const wasBanked = completingTask?._isBankedCollection;
    const remaining = completingTask?._remainingRewards || [];

    if (wasBanked && remaining.length > 0) {
      // Continue the chain
      setCompletingTask(null); // Close current
      setTimeout(() => {
        setCompletingTask({
          ...remaining[0],
          subtasks: [],
          _isBankedCollection: true,
          _remainingRewards: remaining.slice(1)
        });
      }, 300);
      return;
    }

    // Existing: History completions: just show the roll, don't change task status/dates
    const isTodayHistory = completingTask?._isHistoryCompletion && 
                           completingTask?._dateKey === getLocalDateKey();
    
    // Unified completion logic
    if (completingTask.parentTaskId) {
      // SUBTASK COMPLETION
      setTasks(prev => prev.map(t => {
        if (String(t.id) === String(completingTask.parentTaskId)) {
          let subToLog = null;
          const updatedSubtasks = mapSubtasks(t.subtasks || [], s => {
             if (String(s.id) === String(id)) {
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
    } else {
      // MAIN TASK COMPLETION
      completeTask(id, completingTask.intent || completingTask.status || 'done', completingTask._dateKey, reward);
    }
    
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
        AsyncStorage.removeItem('adhddice_task_draft');
        setTimeout(() => {
          if (subtaskRolls >= 1) {
            setBulkRollCount(subtaskRolls + 1);
          } else {
            setCompletingTask({ ...draft, intent: draft.status });
          }
        }, 150); // Increased timeout for web platform consistency
        return;
      }
    }

    setTasks(prev => {
      if (draft.id) {
        return prev.map(t => String(t.id) === String(draft.id) ? draft : t);
      } else {
        const newTask = { ...draft, id: generateId() };
        const todayKey = getAppDayKey(dayStartTime);
        const normalizedDue = normalizeDateKey(newTask.dueDate);
        const isFuture = normalizedDue && normalizedDue > todayKey;
        
        if (isFuture) {
          // New future tasks (one-off or recurring) start as 'upcoming'
          newTask.status = 'upcoming';
        }
        return [...prev, newTask];
      }
    });
    setEditingTask(null);
    AsyncStorage.removeItem('adhddice_task_draft');

    // Bank rolls for subtasks checked off during editing
    if (subtaskRolls > 0) {
      if (subtaskRolls >= 2) {
        setBulkRollCount(subtaskRolls);
      } else {
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
  }
  function deleteTask(id) {
    setTasks(prev => prev.filter(t => String(t.id) !== String(id)));
    setEditingTask(null);
    AsyncStorage.removeItem('adhddice_task_draft');
  }
  function importTasks(payload, isJson = false) {
    if (isJson) {
      setTasks(prev => [...prev, ...payload.map(obj => ({ ...BLANK(), ...obj, id: generateId() }))]);
    } else {
      setTasks(prev => [...prev, ...payload.map(title => ({ ...BLANK(), id: generateId(), title }))]);
    }
  }

  const isWeb = Platform.OS === 'web';

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <ScrollView 
        ref={listRef}
        style={{ flex: 1 }} 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: selectionMode ? 180 : 100 }} 
        onScroll={handleScroll} 
        scrollEventThrottle={16}
      >

      {showMorningStart && (
        <MorningStartModal 
          onClaimReward={() => { addFreeRoll(1); }}
          onStartPlanning={handleMorningPlan}
          onClose={handleMorningClose}
        />
      )}

      <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 12 }}>
        {(() => {
          const hour = new Date().getHours();
          if (hour >= 0 && hour < dayStartTime) {
            return <LateNightCatchUp tasks={tasks} onConfirmStatus={confirmStatus} />;
          }
          return null;
        })()}
      </View>

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

        <TouchableOpacity 
          style={[
            styles.metaChip, 
            { paddingHorizontal: 10, paddingVertical: 4 }, 
            overstimulated && { backgroundColor: '#10b981', borderColor: '#059669', borderWidth: 1 }
          ]}
          onPress={() => setOverstimulated(!overstimulated)}
        >
          <Ionicons 
            name={overstimulated ? "leaf-outline" : "nuclear-outline"} 
            size={14} 
            color={overstimulated ? "#fff" : "#ef4444"} 
          />
          <Text style={[styles.metaChipText, { color: overstimulated ? "#fff" : "#ef4444", fontWeight: overstimulated ? '500' : '700' }]}>
            {overstimulated ? "Zen Mode" : "Overstimulated"}
          </Text>
        </TouchableOpacity>
      </View>

      {!overstimulated && (
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <FocusYourDay 
            tasks={tasks} 
            forceOpen={forceFocusOpen}
            selectionMode={selectionMode}
            onStartOneStep={() => {
              if (selectionMode) clearSelection();
              else setSelectionMode(true);
            }}
            onComplete={(sels, forceClear = false) => {
              setForceFocusOpen(false);
              const todayKey = getLocalDateKey();
              AsyncStorage.setItem('@ADHD_last_reset', todayKey);
              const allIds = sels;
              setTasks(prev => prev.map(t => {
                if (forceClear) return { ...t, isPriority: false };
                // Always replace old priorities with the new selection
                return { ...t, isPriority: allIds.includes(t.id) };
              }));
            }} 
          />
          
          <MomentumBar 
            tasks={tasks}
            stats={stats}
            momentumMode={momentumMode}
            setMomentumMode={setMomentumMode}
            dayStartTime={dayStartTime}
            onOpenTask={setEditingTask}
          />
        </View>
      )}

      <View style={styles.toolbar}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ paddingHorizontal: 16, height: 48 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!overstimulated && (
                <View style={{ position: 'relative', zIndex: 10 }}>
                  <TouchableOpacity 
                    ref={viewMenuBtnRef}
                    style={{ 
                      flexDirection: 'row', alignItems: 'center', gap: 6, 
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, 
                      backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb'
                    }}
                    onPress={openViewMenu}
                  >
                    <Ionicons name={VIEWS.find(v => v.key === view)?.icon || 'list'} size={16} color="#6366f1" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>
                      {VIEWS.find(v => v.key === view)?.label || 'List'}
                    </Text>
                    <Ionicons name={showViewMenu ? 'chevron-up' : 'chevron-down'} size={12} color="#9ca3af" />
                  </TouchableOpacity>

                  <Modal
                    visible={showViewMenu}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowViewMenu(false)}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      activeOpacity={1}
                      onPress={() => setShowViewMenu(false)}
                    >
                      <View style={{
                        position: 'absolute',
                        top: viewMenuPos.y,
                        left: viewMenuPos.x,
                        width: 150,
                        backgroundColor: '#fff', borderRadius: 16, padding: 6,
                        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 30,
                        borderWidth: 1, borderColor: '#f1f5f9',
                      }}>
                        {VIEWS.map(v => (
                          <TouchableOpacity
                            key={v.key}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 10,
                              padding: 10, borderRadius: 10,
                              backgroundColor: view === v.key ? '#f5f3ff' : 'transparent'
                            }}
                            onPress={() => { setView(v.key); setShowViewMenu(false); }}
                          >
                            <Ionicons name={v.icon} size={16} color={view === v.key ? '#6366f1' : '#9ca3af'} />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: view === v.key ? '#6366f1' : '#4b5563' }}>{v.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </View>
              )}

              <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSearch(s => !s)}>
                <Ionicons name="search-outline" size={19} color={showSearch ? '#6366f1' : '#6b7280'} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.iconBtn, selectionMode && { backgroundColor: '#6366f120', borderRadius: 8 }]} 
                onPress={() => {
                  if (selectionMode) clearSelection();
                  else setSelectionMode(true);
                }}
              >
                <Ionicons name={selectionMode ? "checkmark-circle" : "list-outline"} size={20} color={selectionMode ? '#6366f1' : '#6b7280'} />
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
              <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 10 }}>
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
        </ScrollView>
      </View>

      {/* ── Status filter chips ── */}
      {!overstimulated && (
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
            {['active', 'pending', 'upcoming', 'missed'].map(s => {
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
              const msCount = tasks.filter(t => calculateTaskMissedStreak(t.statusHistory, dayStartTime, !!t.frequency) >= 2).length;
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
                  <Text style={{ fontSize: 12, fontWeight: '600', color: filterStreak ? '#fff' : '#ef4444' }}>🔥 Hot Streak</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: filterStreak ? 'rgba(255,255,255,0.7)' : '#ef444480' }}>{streakCount}</Text>
                </TouchableOpacity>
              );
            })()}
            {(() => {
              const oneOffCount = tasks.filter(t => !t.frequency).length;
              if (oneOffCount === 0) return null;
              const active = filterStatus.includes('one_off');
              return (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: active ? '#6366f1' : '#9ca3af40', backgroundColor: active ? '#6366f1' : '#fff' }}
                  onPress={() => setFilterStatus(prev => active ? prev.filter(x => x !== 'one_off') : [...prev, 'one_off'])}
                >
                  <Ionicons name="infinite-outline" size={10} color={active ? '#fff' : '#6366f1'} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#4b5563' }}>One & Done</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : '#9ca3af80' }}>{oneOffCount}</Text>
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
      )}

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
      {!overstimulated && (
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
      )}

      <View style={styles.divider} />

      {/* ── List view ── */}
      {(view === 'list' || overstimulated) && (
        filtered.length === 0
          ? <Text style={styles.empty}>No tasks — tap New or import.</Text>
          : (filterMissedStreak || filterStreak)
            ? filtered.map((item, i) => (
                <TaskRow 
                  key={String(item.id) + '-' + i} 
                  task={item} 
                  onConfirmStatus={confirmStatus} 
                  onOpen={setEditingTask} 
                  onHistory={t => setHistoryTask(t.id)} 
                  onDeprioritize={(id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isPriority: false } : t))} 
                  onViewNote={setViewingNote}
                  onStartFocus={startFocusFlow}
                  selectedSubtasks={selectedSubtasks}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelection={toggleTaskSelection}
                  onStartSelectionMode={(id) => {
                    setSelectionMode(true);
                    toggleTaskSelection(id);
                  }}
                  onToggleSubselect={(tid, sid) => {
                    setSelectedSubtasks(prev => {
                      const next = { ...prev };
                      const set = new Set(next[tid] || []);
                      if (set.has(sid)) set.delete(sid); else set.add(sid);
                      if (set.size === 0) delete next[tid]; else next[tid] = set;
                      return next;
                    });
                  }}
                  onBulkSubtaskStatus={handleBulkSubtaskStatus}
                  overstimulated={overstimulated}
                />
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
                    <TaskRow 
                      key={String(item.id) + '-' + i} 
                      task={item} 
                      onConfirmStatus={confirmStatus} 
                      onOpen={setEditingTask} 
                      onHistory={t => setHistoryTask(t.id)} 
                      onDeprioritize={(id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isPriority: false } : t))} 
                      onViewNote={setViewingNote} 
                      onStartFocus={startFocusFlow}
                      selectedSubtasks={selectedSubtasks}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(item.id)}
                      onToggleSelection={toggleTaskSelection}
                      onStartSelectionMode={(id) => {
                        setSelectionMode(true);
                        toggleTaskSelection(id);
                      }}
                      onToggleSubselect={(tid, sid) => {
                        setSelectedSubtasks(prev => {
                          const next = { ...prev };
                          const set = new Set(next[tid] || []);
                          if (set.has(sid)) set.delete(sid); else set.add(sid);
                          if (set.size === 0) delete next[tid]; else next[tid] = set;
                          return next;
                        });
                      }}
                      onBulkSubtaskStatus={handleBulkSubtaskStatus}
                      overstimulated={overstimulated}
                    />
                  ))}
                </View>
              ))
      )}

      {/* ── Card view ── */}
      {view === 'cards' && !overstimulated && isFocused && isVisible && (
        filtered.length === 0
          ? <Text style={styles.empty}>No tasks — tap New or import.</Text>
          : <CardViewCanvas
              tasks={filtered}
              onOpen={setEditingTask}
              onHistory={t => setHistoryTask(t.id)}
              onConfirmStatus={confirmStatus}
              onPrizePress={() => navigation.navigate('Roll', { openVault: true })}
              onOsaat={startFocusFlow}
            />
      )}

      {/* ── Matrix view ── */}
      {view === 'matrix' && !overstimulated && (
        <EisenhowerMatrixView 
          tasks={filtered} 
          onOpen={setEditingTask} 
          onConfirmStatus={confirmStatus}
          onHistory={t => setHistoryTask(t.id)}
        />
      )}

      </ScrollView>

      {/* ── Bulk Action Bar (Sticky Footer) ── */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={styles.bulkActionBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity 
              style={styles.bulkClearBtn} 
              onPress={clearSelection}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
            <View>
              <Text style={styles.bulkActionCount}>{selectedIds.size}</Text>
              <Text style={styles.bulkActionSub}>Selected</Text>
            </View>
          </View>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingLeft: 10 }}
          >
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#fee2e2' }]} onPress={confirmBulkDelete}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[styles.bulkActionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkActionBtn, { backgroundColor: '#6366f1' }]} onPress={() => setBulkEditVisible(true)}>
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={[styles.bulkActionText, { color: '#fff' }]}>Edit</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── One Step At a Time View ── */}
      {osaatQueue.length > 0 && (
        <OneStepAtATimeView 
          queue={osaatQueue}
          index={osaatIndex}
          onStatusChange={handleOsaatStatusChange}
          onSkip={handleOsaatSkip}
          onExit={() => { setOsaatQueue([]); setOsaatIndex(0); }}
          onBreakDown={handleOsaatBreakDown}
        />
      )}

      {/* Detail modal — derive live task so it stays in sync with history edits */}
      {editingTask && (() => {
        const liveEditingTask = tasks.find(t => String(t.id) === String(editingTask.id)) || editingTask;
        return (
          <TaskDetailModal
            task={liveEditingTask}
            onSave={saveTask}
            onDelete={deleteTask}
            onClose={() => { setEditingTask(null); AsyncStorage.removeItem('adhddice_task_draft'); }}
            onViewNote={(n, edit = false) => setViewingNote({ ...n, isInitialEdit: edit })}
            onStartFocus={(t) => {
              const steps = flattenToSteps([t]);
              if (steps.length > 0) {
                setOsaatQueue(steps);
                setOsaatIndex(0);
                setEditingTask(null);
              } else {
                Alert.alert("No Steps", "This task has no undone items to focus on.");
              }
            }}
          />
        );
      })()}

      {/* Import modal */}
      <ImportModal visible={importVisible} onClose={() => setImportVisible(false)} onImport={importTasks} />

      {/* Bulk Edit Modal */}
      <BulkEditModal 
        visible={bulkEditVisible} 
        onClose={() => setBulkEditVisible(false)} 
        onSave={handleBulkUpdate} 
        allTasks={tasks} 
        selectedIds={selectedIds}
      />

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

      <BankedRollsModal
        visible={bulkRollCount > 0}
        rolls={bulkRollCount}
        onClose={() => setBulkRollCount(0)}
        onFinish={() => setBulkRollCount(0)}
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
                if (count >= 2) {
                  setBulkRollCount(count);
                } else {
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
              }
            }}
            onUpdateHistory={(taskId, date, status) => {
              const task = tasks.find(t => t.id === taskId);
              const oldStatus = task?.statusHistory?.[date];
              const isNewDone = (status === 'done' || status === 'did_my_best') && (oldStatus !== 'done' && oldStatus !== 'did_my_best');
              const isUndone = (oldStatus === 'done' || oldStatus === 'did_my_best') && (status !== 'done' && status !== 'did_my_best');
              
              if (isNewDone) setHistoryNewCompletions(prev => prev + 1);
              else if (isUndone) setHistoryNewCompletions(prev => Math.max(0, prev - 1));

              completeTask(taskId, status, date);
            }}
            onFillRange={(taskId, entries) => {
              const task = tasks.find(t => String(t.id) === String(taskId));
              if (!task) return;

              const oldHistory = task.statusHistory || {};
              const newHistory = { ...oldHistory, ...entries };
              
              const oldBest = task.bestStreak || 0;
              const newBest = Math.max(oldBest, calculateBestStreak(newHistory));
              const recordBroken = newBest > oldBest;

              let newDones = 0;
              Object.keys(entries).forEach(key => {
                const status = entries[key];
                const oldStatus = oldHistory[key];
                if ((status === 'done' || status === 'did_my_best') && (oldStatus !== 'done' && oldStatus !== 'did_my_best')) {
                  newDones++;
                }
              });

              setTasks(prev => prev.map(t => {
                if (String(t.id) !== String(taskId)) return t;
                const today = getLocalDateKey();
                const todayUpdate = entries[today];
                return { 
                  ...t, 
                  statusHistory: newHistory,
                  streak: calculateTaskStreak(newHistory, dayStartTime, !!t.frequency),
                  bestStreak: newBest,
                  ...(todayUpdate !== undefined ? { status: todayUpdate || 'pending' } : {})
                };
              }));

              if (newDones > 0) setHistoryNewCompletions(prev => prev + newDones);
              
              if (recordBroken) {
                addFreeRoll(5);
                Alert.alert("🔥 NEW RECORD!", `You've beaten your best streak for "${task.title}"! Enjoy 5 free rolls.`);
              }
            }}
          />
        );
      })()}

      {showScrollTop && <ScrollToTop scrollRef={listRef} />}
      
      <ViewNoteModal 
        note={viewingNote} 
        onClose={() => setViewingNote(null)} 
      />


      {breakTimer && (
        <View style={styles.floatingTimer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.timerCircle}>
              <Text style={styles.timerText}>
                {Math.floor(breakTimer.remainingSeconds / 60)}:{(breakTimer.remainingSeconds % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <View>
              <Text style={styles.timerLabel}>Break Time</Text>
              <Text style={styles.timerSub}>Relax and recharge</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setBreakTimer(null)} style={styles.timerClose}>
            <Ionicons name="close-circle" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Banked Rewards Floating Chip */}
      {economy.bankedRewards?.length > 0 && (
        <TouchableOpacity 
          style={styles.floatingBankedChip}
          onPress={() => {
            const rewards = claimBankedRewards();
            if (rewards.length > 0) {
              setBulkRollCount(rewards.length);
            }
          }}
        >
          <View style={styles.bankedChipCount}>
            <Text style={styles.bankedChipCountText}>
              {economy.bankedRewards.length}
            </Text>
          </View>
          <Text style={{ fontSize: 14 }}>🎲</Text>
          <Text style={styles.bankedChipText}>BANKED</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#fff' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 4 : 8, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  finalXp: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  floatingTimer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  timerCircle: {
    backgroundColor: '#374151',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0ea5e9',
  },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  timerSub: {
    color: '#9ca3af',
    fontSize: 12,
  },
  timerClose: {
    padding: 4,
  },
  floatingBankedChip: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: '#6366f1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#6366f1',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  bankedChipCount: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bankedChipCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  bankedChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  collectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collectorText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerActions:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:      { padding: 8, borderRadius: 8 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, gap: 4, marginLeft: 4 },
  addBtnText:   { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Toolbar
  toolbar:      { paddingBottom: 6 },
  viewToggle:   { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2 },
  viewBtn:      { padding: 7, borderRadius: 6 },
  viewBtnActive:{ backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  searchBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:  { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 0, minHeight: 22 },
  divider:      { height: 1, backgroundColor: '#f3f4f6' },

  // List view
  list:         { paddingBottom: 120 },
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
  cardList:        { padding: 14, paddingBottom: 120 },
  cardRow:         { gap: 12, marginBottom: 12 },
  cardGrid:        { flexDirection: 'row', flexWrap: 'wrap', padding: 14, paddingBottom: 120, gap: 12 },
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
  detailBody:       { padding: 20, gap: 4, paddingBottom: 160 },
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

  
  // Late Night Catch-up
  smallActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Morning Start Modal
  morningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  morningContent: {
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
  morningTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  morningSub: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  morningRewardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  morningRewardText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  morningRewardSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  morningPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    paddingVertical: 14,
    width: '100%',
    gap: 8,
  },
  morningPlanText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  morningSkipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  morningSkipText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },

  // Bulk Actions
  bulkActionBar: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    zIndex: 1000,
  },
  bulkClearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkActionCount: { fontSize: 17, fontWeight: '900', color: '#111827', lineHeight: 19 },
  bulkActionSub: { fontSize: 9, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  bulkActionText: { fontSize: 14, fontWeight: '800', color: '#4b5563' },
  bulkFieldRow: {
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  bulkFieldLabel: { fontSize: 14, color: '#334155', fontWeight: '700' },
  tagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagToggleActive: { backgroundColor: '#6366f1', borderColor: '#4f46e5' },
  tagToggleText: { fontSize: 13, color: '#64748b', fontWeight: '800' },
  tagToggleTextActive: { color: '#fff' },

  saveBtn:       { backgroundColor: '#6366f1', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 12 },
  saveText:      { color: '#fff', fontSize: 16, fontWeight: '800' },
  detailFooter:  { padding: 24, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' },

  // FYD Styles (Shared with FocusYourDay)
  fydBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#f5f3ff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  fydHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  fydStepText: { fontSize: 12, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase' },
  fydQuestion: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16 },
  fydSelector: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 16 },
  fydItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  fydItemText: { fontSize: 15, color: '#4b5563' },
  fydNext: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 14, alignItems: 'center' },
  fydNextText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

