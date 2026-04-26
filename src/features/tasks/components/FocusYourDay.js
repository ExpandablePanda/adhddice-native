import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../lib/ThemeContext';
import { useSettings } from '../../../lib/SettingsContext';
import { 
  STATUSES, 
  ENERGY, 
  calculateTaskMissedStreak, 
  normalizeDateKey, 
  getAppDayKey 
} from '../../../lib/TasksContext';

export default function FocusYourDay({ tasks, onComplete, onStartOneStep, selectionMode, forceOpen = false }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(forceOpen ? 1 : 0); // 0 (start), 1 (must do), 2 (procrastinating), 3 (bonus), 4 (final)
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [filterEnergy, setFilterEnergy] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [filterMissedOnly, setFilterMissedOnly] = useState(false);
  const [filterDueToday, setFilterDueToday] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const { dayStartTime } = useSettings();
  
  const today = new Date().toLocaleDateString();
  const [lastReset, setLastReset] = useState(null);

  useEffect(() => {
    const loadReset = async () => {
      const stored = await AsyncStorage.getItem('@ADHD_last_reset');
      setLastReset(stored);
    };
    loadReset();
  }, []);

  useEffect(() => {
    if (forceOpen) setStep(1);
  }, [forceOpen]);

  function handleFullReset() {
    onComplete([], true); // true = force clear priorities
    setSelectedIds([]);
    setLastReset(today);
    AsyncStorage.setItem('@ADHD_last_reset', today);
    setStep(1);
  }

  const undone = tasks.filter(t => t.status !== 'done' && t.status !== 'did_my_best' && !t.isUrgent);
  const todayStr = getAppDayKey(dayStartTime);

  let filtered = undone;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
  }
  if (filterEnergy.length > 0) {
    filtered = filtered.filter(t => filterEnergy.includes(t.energy));
  }
  if (filterTags.length > 0) {
    filtered = filtered.filter(t => (t.tags || []).some(tag => filterTags.includes(tag)));
  }
  if (filterMissedOnly) {
    filtered = filtered.filter(t => calculateTaskMissedStreak(t.statusHistory || {}, dayStartTime, !!t.frequency) > 0);
  }
  if (filterDueToday) {
    filtered = filtered.filter(t => normalizeDateKey(t.dueDate) === todayStr);
  }

  // Tasks disappear as they are checked
  filtered = filtered.filter(t => !selectedIds.includes(t.id));

  const allTags = Array.from(new Set(tasks.flatMap(t => (t.tags || [])))).sort();

  const questions = [
    { id: 1, q: "What tasks must be done today?", multiple: true },
    { id: 2, q: "What tasks are causing you stress?", multiple: true },
    { id: 3, q: "One task if you had nothing else to do?", multiple: true }
  ];

  function toggleTask(id) {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  }

  // Detect New Day (Only between dayStartTime and Noon)
  const hour = new Date().getHours();
  if (lastReset && lastReset !== today && step === 0 && hour >= dayStartTime && hour < 12) {
    return (
      <View style={[styles.fydBox, { borderColor: '#8b5cf6', borderWidth: 2, backgroundColor: colors.background }]}>
        <Text style={[styles.fydQuestion, { color: colors.textPrimary }]}>It's a New Day! 🌅</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>Ready to reset your focus and build fresh momentum?</Text>
        <TouchableOpacity style={styles.fydNext} onPress={handleFullReset}>
          <Text style={styles.fydNextText}>Start New Day</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 0) {
    const hasPriorities = tasks.some(t => t.isPriority);
    return (
        <TouchableOpacity 
          activeOpacity={0.9} 
          style={[styles.fydStart, { flex: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' }]} 
          onPress={() => setStep(1)}
        >
          <Ionicons name="sparkles" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={[styles.fydStartTitle, { fontSize: 13, textAlign: 'center' }]}>
            {hasPriorities ? 'Refocus' : 'Focus'}
          </Text>
        </TouchableOpacity>
    );
  }

  if (step <= 3) {
    const q = questions[step-1];
    return (
      <View style={[styles.fydBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.fydHeader}>
          <Text style={styles.fydStepText}>Step {step} of 3</Text>
          <TouchableOpacity onPress={() => setStep(0)}><Ionicons name="close" size={20} color={colors.textMuted}/></TouchableOpacity>
        </View>
        <Text style={[styles.fydQuestion, { color: colors.textPrimary }]}>{q.q}</Text>
        
        <View style={[styles.fydSelector, { backgroundColor: colors.surface }]}>
          <View style={[styles.searchBoxSmall, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput 
              style={[styles.searchInner, { color: colors.textPrimary }]} 
              placeholder="Search tasks..." 
              placeholderTextColor={colors.textMuted}
              value={search} 
              onChangeText={setSearch} 
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips */}
          <View style={{ marginBottom: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              <TouchableOpacity 
                style={[styles.metaChip, filterDueToday && { backgroundColor: '#6366f1', borderColor: '#4f46e5', borderWidth: 1 }]}
                onPress={() => setFilterDueToday(!filterDueToday)}
              >
                <Ionicons name="calendar-outline" size={12} color={filterDueToday ? "#fff" : "#6366f1"} />
                <Text style={[styles.metaChipText, { color: filterDueToday ? "#fff" : colors.textSecondary }]}>Due Today</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.metaChip, filterMissedOnly && { backgroundColor: '#1f2937', borderColor: '#000', borderWidth: 1 }]}
                onPress={() => setFilterMissedOnly(!filterMissedOnly)}
              >
                <Text style={{ fontSize: 10 }}>💀</Text>
                <Text style={[styles.metaChipText, { color: filterMissedOnly ? "#fff" : colors.textSecondary }]}>Missed Streak</Text>
              </TouchableOpacity>

              {Object.entries(ENERGY).map(([key, cfg]) => {
                const active = filterEnergy.includes(key);
                return (
                  <TouchableOpacity 
                    key={key} 
                    style={[styles.metaChip, active && { backgroundColor: cfg.color, borderColor: cfg.color, borderWidth: 1 }]}
                    onPress={() => setFilterEnergy(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])}
                  >
                    <Text style={[styles.metaChipText, { color: active ? "#fff" : cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}

              {allTags.length > 0 && (
                <View style={{ position: 'relative' }}>
                  <TouchableOpacity 
                    style={[styles.metaChip, filterTags.length > 0 && { backgroundColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 1 }]}
                    onPress={() => setShowTagMenu(!showTagMenu)}
                  >
                    <Ionicons name="pricetag-outline" size={12} color={filterTags.length > 0 ? "#fff" : "#8b5cf6"} />
                    <Text style={[styles.metaChipText, { color: filterTags.length > 0 ? "#fff" : colors.textSecondary }]}>
                      {filterTags.length === 0 ? "All Tags" : `${filterTags.length} Filtered`}
                    </Text>
                    <Ionicons name={showTagMenu ? "chevron-up" : "chevron-down"} size={10} color={filterTags.length > 0 ? "#fff" : colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {showTagMenu && (
              <View style={{ 
                marginTop: 8,
                backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
              }}>
                <ScrollView style={{ maxHeight: 150 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {allTags.map(tag => {
                      const active = filterTags.includes(tag);
                      return (
                        <TouchableOpacity 
                          key={tag} 
                          style={[{ 
                            flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, 
                            borderRadius: 16, backgroundColor: active ? colors.surface : colors.background, borderWidth: 1, borderColor: active ? '#8b5cf6' : colors.border
                          }]}
                          onPress={() => setFilterTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag])}
                        >
                          <Text style={{ fontSize: 12, color: active ? "#8b5cf6" : colors.textPrimary }}>#{tag}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {filterTags.length > 0 && (
                    <TouchableOpacity 
                      style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' }}
                      onPress={() => { setFilterTags([]); setShowTagMenu(false); }}
                    >
                      <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '700' }}>Clear All Tags</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>
            )}
          </View>

          <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled={true}>
            {filtered.length === 0 ? (
              <Text style={{ textAlign: 'center', color: colors.textMuted, paddingVertical: 20 }}>No tasks match your filters</Text>
            ) : (
              filtered.map(t => {
                const isSelected = selectedIds.includes(t.id);
                const isRecurring = !!t.frequency;
                const ms = calculateTaskMissedStreak(t.statusHistory || {}, dayStartTime, isRecurring);
                const isDueToday = normalizeDateKey(t.dueDate) === todayStr;
                
                return (
                  <TouchableOpacity key={t.id} style={[styles.fydItem, { borderBottomColor: colors.border }]} onPress={() => toggleTask(t.id)}>
                    <Ionicons 
                      name={isSelected ? 'checkbox' : 'square-outline'} 
                      size={20} 
                      color={isSelected ? '#8b5cf6' : colors.textMuted} 
                    />
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.fydItemText, { color: colors.textPrimary }, isSelected && { color: '#8b5cf6', fontWeight: '600' }]}>{t.title}</Text>
                      {t.isUrgent && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' }} />}
                      {ms > 0 && <Text style={{ fontSize: 10, color: colors.textSecondary }}>💀 {ms}</Text>}
                      {isDueToday && <Ionicons name="calendar-outline" size={10} color="#6366f1" />}
                    </View>
                    {t.energy && (
                      <View style={[styles.metaChip, { backgroundColor: ENERGY[t.energy]?.bg || colors.surface, paddingHorizontal: 4 }]}>
                        <Text style={[styles.metaChipText, { fontSize: 9, color: ENERGY[t.energy]?.color || colors.textSecondary }]}>{ENERGY[t.energy]?.label}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        <TouchableOpacity 
          style={[styles.fydNext, selectedIds.length === 0 && { opacity: 0.5 }]} 
          onPress={() => {
            if (selectedIds.length > 0) {
              if (step === 3) {
                onComplete(selectedIds);
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
    <View style={[styles.fydDone, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.fydDoneTitle, { color: colors.textPrimary }]}>Today's Focus List Ready!</Text>
      <TouchableOpacity onPress={() => setStep(1)} style={styles.fydReset}>
        <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '600' }}>Adjust Focus</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  fydDoneTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  fydReset: { paddingVertical: 4, paddingHorizontal: 8 },
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
  metaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, gap: 3 },
  metaChipText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
});
