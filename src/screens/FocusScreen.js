import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, Alert, ScrollView,
  KeyboardAvoidingView, Platform, Dimensions, Animated,
  useWindowDimensions,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useTheme } from '../lib/ThemeContext';
import ScrollToTop from '../components/ScrollToTop';
import ModalScreen from '../components/ModalScreen';
import { useFocus, DEFAULT_CATEGORIES } from '../lib/FocusContext';
import { useEconomy } from '../lib/EconomyContext';
import Dice3D from '../components/Dice3D';
import FocusRollModal from '../components/FocusRollModal';
import UnproductiveRollModal from '../components/UnproductiveRollModal';





// ── Time formatting ──────────────────────────────────────────────────────────
function fmtTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDuration(minutes) {
  if (!minutes || isNaN(minutes)) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function fmtDateShort(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getMonthStart(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ── Generate sample data for demo ───────────────────────────────────────────
function generateSampleEntries() {
  const entries = [];
  const now = new Date();
  const cats = DEFAULT_CATEGORIES;

  // Generate entries for the past 30 days
  for (let d = 0; d < 14; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const minutes = (Math.floor(Math.random() * 6) + 1) * 15; // 15–90 min
      entries.push({
        id: 'sample_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        category: cat.key,
        minutes,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        note: '',
      });
    }
  }
  return entries;
}

// ═════════════════════════════════════════════════════════════════════════════
// BAR CHART COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

function BarChart({ data, maxVal, barWidth = 28 }) {
  const safeMax = maxVal || 1;
  return (
    <View style={chartStyles.chart}>
      <View style={chartStyles.bars}>
        {data.map((item, i) => {
          const height = Math.max((item.value / safeMax) * 100, 2);
          return (
            <View key={i} style={chartStyles.barCol}>
              <View style={chartStyles.barTrack}>
                <View style={[chartStyles.bar, {
                  height: `${height}%`,
                  backgroundColor: item.color || colors.primary,
                  width: barWidth,
                }]} />
              </View>
              <Text style={chartStyles.barLabel}>{item.label}</Text>
              {item.value > 0 && (
                <Text style={chartStyles.barValue}>{fmtDuration(item.value)}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  chart: { marginTop: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 4 },
  barCol: { alignItems: 'center', flex: 1 },
  barTrack: { height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { borderRadius: 6, minHeight: 4 },
  barLabel: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: '500' },
  barValue: { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
});

// ═════════════════════════════════════════════════════════════════════════════
// GOAL PROGRESS BAR
// ═════════════════════════════════════════════════════════════════════════════

function GoalProgressBar({ label, current, goal, color }) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  return (
    <View style={goalStyles.barContainer}>
      <View style={goalStyles.barHeader}>
        <Text style={goalStyles.barLabel}>{label}</Text>
        <Text style={goalStyles.barValue}>{fmtDuration(current)} / {fmtDuration(goal)}</Text>
      </View>
      <View style={goalStyles.barBg}>
        <View style={[goalStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const goalStyles = StyleSheet.create({
  barContainer: { marginBottom: 10 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  barValue: { fontSize: 11, fontWeight: '700', color: colors.primary },
  barBg: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
});

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY BREAKDOWN
// ═════════════════════════════════════════════════════════════════════════════

function CategoryBreakdown({ entries, period, categories, goals = {}, specificDate = null }) {
  const cats = categories;
  const now = new Date();

  const filtered = entries.filter(e => {
    if (specificDate && period === 'day') return isSameDay(e.date, specificDate);
    if (period === 'today') return isSameDay(e.date, now);
    if (period === 'week') return e.date >= getWeekStart(now);
    if (period === 'month') return e.date >= getMonthStart(now);
    return true;
  });

  const totals = {};
  filtered.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.minutes;
  });

  const sorted = cats
    .map(c => ({ ...c, minutes: totals[c.key] || 0 }))
    .filter(c => (period === 'today' || period === 'day') ? true : c.minutes > 0)
    .sort((a, b) => {
      if (b.minutes !== a.minutes) return b.minutes - a.minutes;
      return a.label.localeCompare(b.label);
    });

  const totalMins = sorted.reduce((acc, c) => acc + c.minutes, 0);

  if (sorted.length === 0) {
    return <Text style={styles.emptyNote}>No time logged for this period.</Text>;
  }

  return (
    <View style={styles.breakdownList}>
      {sorted.map(cat => {
        const catGoals = goals[cat.key];
        let displayGoal = 0;
        let pct = 0;

        if (period === 'today' || period === 'week' || period === 'day') {
          if (period === 'today' || period === 'day') {
            displayGoal = catGoals?.daily || (catGoals?.weekly > 0 ? Math.round(catGoals.weekly / 7) : 0);
          } else {
            displayGoal = catGoals?.weekly || 0;
          }
          pct = displayGoal > 0 ? Math.min((cat.minutes / displayGoal) * 100, 100) : (totalMins > 0 ? (cat.minutes / totalMins) * 100 : 0);
        } else {
          pct = totalMins > 0 ? (cat.minutes / totalMins) * 100 : 0;
        }

        const isUnproductive = cat.subtype === 'unproductive';
        const displayColor = isUnproductive ? '#ef4444' : cat.color;

        return (
          <View key={cat.key} style={styles.breakdownRow}>
            <View style={[styles.breakdownIcon, { backgroundColor: displayColor + '18' }]}>
              <Ionicons name={cat.icon} size={16} color={displayColor} />
            </View>
            <View style={styles.breakdownInfo}>
              <View style={styles.breakdownTop}>
                <Text style={styles.breakdownLabel}>{cat.label}</Text>
                <Text style={styles.breakdownTime}>
                  {fmtDuration(cat.minutes)}
                  {displayGoal > 0 ? ` / ${fmtDuration(displayGoal)}` : ''}
                </Text>
              </View>
              <View style={styles.breakdownBarBg}>
                <View style={[styles.breakdownBarFill, { width: `${pct}%`, backgroundColor: displayColor }]} />
              </View>
            </View>
            <Text style={styles.breakdownPct}>{Math.round(pct)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR PICKER MODAL
// ═════════════════════════════════════════════════════════════════════════════

function FocusCalendarModal({ visible, currentDate, onSelect, onClose }) {
  const [viewDate, setViewDate] = useState(new Date(currentDate));

  const headerDate = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay(); // 0 (Sun) to 6 (Sat)

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const numDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  // Adjust startDay for Monday start (0=Mon...6=Sun)
  const mondayStartIdx = startDay === 0 ? 6 : startDay - 1;

  const calendarDays = [];
  for (let i = 0; i < mondayStartIdx; i++) calendarDays.push(null);
  for (let d = 1; d <= numDays; d++) calendarDays.push(d);

  const changeMonth = (delta) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  const isSelected = (day) => {
    if (!day) return false;
    return currentDate.getFullYear() === year && currentDate.getMonth() === month && currentDate.getDate() === day;
  };

  const isToday = (day) => {
    if (!day) return false;
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: '90%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 24, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>{headerDate}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={{ padding: 8 }}>
              <Ionicons name="chevron-forward" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#9ca3af' }}>{d}</Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {calendarDays.map((day, i) => (
              <TouchableOpacity
                key={i}
                disabled={!day}
                onPress={() => {
                  onSelect(new Date(year, month, day));
                  onClose();
                }}
                style={{
                  width: '14.28%',
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  backgroundColor: isSelected(day) ? colors.primary : 'transparent',
                  borderWidth: isToday(day) && !isSelected(day) ? 1 : 0,
                  borderColor: colors.primary
                }}
              >
                {day && (
                  <Text style={{
                    fontSize: 14,
                    fontWeight: isSelected(day) || isToday(day) ? '700' : '500',
                    color: isSelected(day) ? '#fff' : (day ? '#111827' : 'transparent')
                  }}>
                    {day}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={onClose} style={{ marginTop: 20, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADD / EDIT ENTRY MODAL
// ═════════════════════════════════════════════════════════════════════════════

function EntryModal({ visible, entry, onSave, onDelete, onClose, categories }) {
  const isEdit = entry && entry.id;
  const [category, setCategory] = useState(entry?.category || categories[0]?.key || 'work');
  const [hours, setHours] = useState('');
  const [mins, setMins] = useState('');
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (visible && entry) {
      setCategory(entry.category || 'work');
      const totalMin = entry.minutes || 0;
      setHours(totalMin >= 60 ? String(Math.floor(totalMin / 60)) : '');
      setMins(String(totalMin % 60 || (totalMin < 60 ? totalMin : 0)));
      setDate(entry.date ? new Date(entry.date) : new Date());
      setNote(entry.note || '');
    } else if (visible) {
      setCategory('work');
      setHours('');
      setMins('');
      setDate(new Date());
      setNote('');
    }
  }, [visible, entry]);

  function handleSave() {
    const h = parseInt(hours) || 0;
    const m = parseInt(mins) || 0;
    const totalMin = h * 60 + m;
    if (totalMin <= 0) {
      Alert.alert('Invalid Time', 'Please enter a time greater than 0.');
      return;
    }

    onSave({
      id: entry?.id || 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      category,
      minutes: totalMin,
      date,
      note,
    });
  }

  function confirmDelete() {
    Alert.alert('Delete Entry', 'Delete this time entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry.id) },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ModalScreen style={styles.modalScreen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{isEdit ? 'Edit Entry' : 'Add Time'}</Text>
          {isEdit ? (
            <TouchableOpacity onPress={confirmDelete} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 38 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Category */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.fieldLabel}>Category</Text>
          </View>
          <View style={styles.catGrid}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catChip, category === cat.key && { backgroundColor: cat.color || '#6366f1', borderColor: cat.color || '#6366f1' }]}
                onPress={() => setCategory(cat.key)}
              >
                {cat.icon.indexOf('-') > -1 ? (
                  <Ionicons name={cat.icon} size={14} color={category === cat.key ? '#fff' : (cat.color || '#6366f1')} />
                ) : (
                  <Text style={{ fontSize: 13, marginRight: 4 }}>{cat.icon}</Text>
                )}
                <Text style={[styles.catChipText, category === cat.key && { color: '#fff' }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Duration */}
          <Text style={styles.fieldLabel}>Duration</Text>
          <View style={styles.durationRow}>
            <View style={styles.durationField}>
              <TextInput
                style={styles.durationInput}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                value={hours}
                onChangeText={setHours}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.durationUnit}>hrs</Text>
            </View>
            <View style={styles.durationField}>
              <TextInput
                style={styles.durationInput}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                value={mins}
                onChangeText={setMins}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.durationUnit}>min</Text>
            </View>
          </View>

          {/* Quick durations */}
          <View style={styles.quickDurations}>
            {[15, 30, 45, 60, 90, 120].map(m => (
              <TouchableOpacity key={m} style={styles.quickDurBtn} onPress={() => {
                setHours(m >= 60 ? String(Math.floor(m / 60)) : '');
                setMins(String(m % 60 || (m < 60 ? m : 0)));
              }}>
                <Text style={styles.quickDurText}>{fmtDuration(m)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.fieldInput, { justifyContent: 'center' }]}
            onPress={() => setShowCalendar(true)}
          >
            <Text style={{ color: '#111827' }}>{date.toLocaleDateString()}</Text>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} style={{ position: 'absolute', right: 12 }} />
          </TouchableOpacity>

          <FocusCalendarModal
            visible={showCalendar}
            currentDate={date}
            onSelect={setDate}
            onClose={() => setShowCalendar(false)}
          />

          {/* Note */}
          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput
            style={[styles.fieldInput, { height: 70, textAlignVertical: 'top' }]}
            placeholder="What did you work on?"
            placeholderTextColor="#9ca3af"
            value={note}
            onChangeText={setNote}
            multiline
          />

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveText}>{isEdit ? 'Save Changes' : 'Add Entry'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

// ── Palette for categories ───────────────────────────────────────────────────
const CATEGORY_COLORS = [
  '#4f46e5', '#0891b2', '#7c3aed', '#059669', '#d97706',
  '#ec4899', '#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#6b7280'
];

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY MANAGER MODAL
// ═════════════════════════════════════════════════════════════════════════════

// Curated list of Ionicons for the icon picker
const ICON_PICKER_ICONS = [
  'briefcase-outline', 'book-outline', 'color-palette-outline', 'fitness-outline', 'home-outline',
  'person-outline', 'ellipsis-horizontal-outline', 'heart-outline', 'star-outline', 'flame-outline',
  'musical-notes-outline', 'headset-outline', 'code-slash-outline', 'terminal-outline', 'laptop-outline',
  'phone-portrait-outline', 'camera-outline', 'image-outline', 'videocam-outline', 'mic-outline',
  'chatbubble-outline', 'mail-outline', 'calendar-outline', 'alarm-outline', 'time-outline',
  'bicycle-outline', 'walk-outline', 'barbell-outline', 'basketball-outline', 'football-outline',
  'leaf-outline', 'flower-outline', 'earth-outline', 'water-outline', 'sunny-outline',
  'moon-outline', 'cloudy-outline', 'thunderstorm-outline', 'snow-outline', 'umbrella-outline',
  'car-outline', 'airplane-outline', 'train-outline', 'boat-outline', 'rocket-outline',
  'restaurant-outline', 'cafe-outline', 'pizza-outline', 'beer-outline', 'wine-outline',
  'medkit-outline', 'bandage-outline', 'glasses-outline', 'shirt-outline', 'bag-outline',
  'cart-outline', 'gift-outline', 'trophy-outline', 'ribbon-outline', 'medal-outline',
  'bulb-outline', 'flash-outline', 'battery-charging-outline', 'wifi-outline', 'bluetooth-outline',
  'brush-outline', 'pencil-outline', 'create-outline', 'cut-outline', 'build-outline',
  'construct-outline', 'hammer-outline', 'flask-outline', 'beaker-outline', 'telescope-outline',
  'dice-outline', 'game-controller-outline', 'extension-puzzle-outline',
  'paw-outline', 'bug-outline', 'fish-outline', 'logo-github', 'logo-youtube',
];

function IconPickerModal({ visible, current, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? ICON_PICKER_ICONS.filter(i => i.includes(search.toLowerCase()))
    : ICON_PICKER_ICONS;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#1f2937', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '75%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#f9fafb' }}>Choose Icon</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
          </View>
          <TextInput
            style={{ backgroundColor: '#374151', color: '#f9fafb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, fontSize: 14 }}
            placeholder="Search icons..."
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 }}>
              {filtered.map(iconName => (
                <TouchableOpacity
                  key={iconName}
                  onPress={() => { onSelect(iconName); onClose(); }}
                  style={{
                    width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: current === iconName ? '#4f46e5' : '#374151',
                    borderWidth: current === iconName ? 2 : 0,
                    borderColor: '#818cf8',
                  }}
                >
                  <Ionicons name={iconName} size={24} color={current === iconName ? '#fff' : '#d1d5db'} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CategoryManagerModal({ visible, categories, onClose, onSave }) {
  const [drafts, setDrafts] = useState(categories);
  const [pickerIdx, setPickerIdx] = useState(null);

  useEffect(() => {
    if (visible) setDrafts(categories);
  }, [visible, categories]);

  function addCat() {
    setDrafts([...drafts, { key: 'cat_' + Date.now(), label: 'New Category', icon: 'star-outline', color: '#6366f1' }]);
  }

  function updateCat(idx, field, val) {
    const next = [...drafts];
    next[idx] = { ...next[idx], [field]: val };
    setDrafts(next);
  }

  function removeCat(idx) {
    setDrafts(drafts.filter((_, i) => i !== idx));
  }

  function moveCat(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDrafts(next);
  }

  return (
    <Modal visible={visible} animationType="slide">
      <ModalScreen style={styles.modalScreen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Categories</Text>
          <TouchableOpacity onPress={() => onSave(drafts)} style={styles.iconBtn}>
            <Ionicons name="checkmark" size={22} color="#10b981" />
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.modalBody, { paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
            {drafts.map((cat, idx) => (
              <View key={cat.key || idx} style={{ marginBottom: 20, padding: 12, backgroundColor: '#f9fafb', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <View style={{ gap: 2 }}>
                    <TouchableOpacity onPress={() => moveCat(idx, -1)} style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }} disabled={idx === 0}>
                      <Ionicons name="chevron-up" size={16} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveCat(idx, 1)} style={{ padding: 4, opacity: idx === drafts.length - 1 ? 0.3 : 1 }} disabled={idx === drafts.length - 1}>
                      <Ionicons name="chevron-down" size={16} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={() => setPickerIdx(idx)}
                    style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: cat.color || '#374151', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {ICON_PICKER_ICONS.includes(cat.icon)
                      ? <Ionicons name={cat.icon} size={22} color="#fff" />
                      : <Text style={{ fontSize: 22 }}>{cat.icon || '✨'}</Text>
                    }
                  </TouchableOpacity>

                  <TextInput
                    style={[styles.fieldInput, { flex: 1, height: 44 }]}
                    value={cat.label}
                    onChangeText={(v) => updateCat(idx, 'label', v)}
                    placeholder="Category Name"
                  />

                  <TouchableOpacity onPress={() => removeCat(idx)} style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                <View style={{ paddingLeft: 34, marginTop: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Focus Type</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {[
                      { key: 'productive', label: 'Productive', icon: 'flash', color: '#10b981' },
                      { key: 'paid', label: 'Paid', icon: 'cash', color: '#3b82f6' },
                      { key: 'entertainment', label: 'Entertainment', icon: 'tv', color: '#ef4444' },
                      { key: 'sleep', label: 'Sleep', icon: 'moon', color: '#7c3aed' },
                    ].map(t => (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => updateCat(idx, 'nature', t.key)}
                        style={{
                          paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: cat.nature === t.key ? t.color : '#f3f4f6',
                          flexDirection: 'row', alignItems: 'center', gap: 4
                        }}
                      >
                        <Ionicons name={t.icon} size={10} color={cat.nature === t.key ? '#fff' : t.color} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: cat.nature === t.key ? '#fff' : '#6b7280' }}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {cat.nature === 'entertainment' && (
                    <>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Subtype</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {[
                          { key: null, label: 'Standard', icon: 'star', color: '#6b7280' },
                          { key: 'unproductive', label: 'Unproductive', icon: 'skull', color: '#ef4444' },
                        ].map(s => (
                          <TouchableOpacity
                            key={String(s.key)}
                            onPress={() => updateCat(idx, 'subtype', s.key)}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
                              backgroundColor: (cat.subtype === s.key || (cat.subtype === undefined && s.key === null)) ? s.color : '#f3f4f6',
                              flexDirection: 'row', alignItems: 'center', gap: 4
                            }}
                          >
                            <Ionicons name={s.icon} size={10} color={(cat.subtype === s.key || (cat.subtype === undefined && s.key === null)) ? '#fff' : s.color} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: (cat.subtype === s.key || (cat.subtype === undefined && s.key === null)) ? '#fff' : '#6b7280' }}>{s.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Category Color</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {CATEGORY_COLORS.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => updateCat(idx, 'color', c)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: c,
                          borderWidth: cat.color === c ? 2 : 0,
                          borderColor: '#fff',
                          shadowColor: '#000',
                          shadowOpacity: cat.color === c ? 0.3 : 0,
                          shadowRadius: 3,
                          elevation: cat.color === c ? 3 : 0
                        }}
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={addCat} style={{ marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#6366f1', alignItems: 'center' }}>
              <Text style={{ color: '#6366f1', fontWeight: '600' }}>+ Add Category</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ModalScreen>
      {pickerIdx !== null && (
        <IconPickerModal
          visible={pickerIdx !== null}
          current={drafts[pickerIdx]?.icon}
          onSelect={(iconName) => updateCat(pickerIdx, 'icon', iconName)}
          onClose={() => setPickerIdx(null)}
        />
      )}
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FOCUS REWARD MODAL (D6 doubler)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// FOCUS IMPORT MODAL
// Format (one session per line):  YYYY-MM-DD, minutes, category_key
// Example:  2024-03-15, 45, work
// ─────────────────────────────────────────────────────────────────────────────
function GoalSettingModal({ visible, categories, goals, onSave, onClose }) {
  const [draft, setDraft] = useState(goals);

  useEffect(() => {
    if (visible) {
      const newDraft = { ...goals };
      categories.forEach(cat => {
        if (newDraft[cat.key] && (newDraft[cat.key].daily || 0) === 0 && (newDraft[cat.key].weekly || 0) > 0) {
          newDraft[cat.key] = {
            ...newDraft[cat.key],
            daily: Math.round(newDraft[cat.key].weekly / 7)
          };
        }
      });
      setDraft(newDraft);
    }
  }, [visible, goals]);

  function updateGoalPart(catKey, period, unit, val) {
    const num = parseInt(val, 10) || 0;
    setDraft(prev => {
      const currentTotal = prev[catKey]?.[period] || 0;
      const h = Math.floor(currentTotal / 60);
      const m = currentTotal % 60;
      const newTotal = unit === 'h' ? (num * 60 + m) : (h * 60 + num);

      let next = {
        ...(prev[catKey] || { daily: 0, weekly: 0 }),
        [period]: newTotal
      };

      // If updating weekly, auto-fill daily avg
      if (period === 'weekly') {
        next.daily = Math.round(newTotal / 7);
      }

      return { ...prev, [catKey]: next };
    });
  }

  return (
    <Modal visible={visible} animationType="slide">
      <ModalScreen style={styles.modalScreen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Focus Goals</Text>
          <TouchableOpacity onPress={() => onSave(draft)} style={styles.iconBtn}>
            <Ionicons name="checkmark" size={22} color="#10b981" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20 }}> Set daily and weekly time targets for each category. </Text>

          {categories.map(cat => (
            <View key={cat.key} style={{ marginBottom: 24, padding: 16, backgroundColor: '#f9fafb', borderRadius: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name={cat.icon} size={18} color={cat.color} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{cat.label}</Text>
              </View>

              <View style={{ gap: 12 }}>
                {/* Daily */}
                <View>
                  <Text style={styles.fieldLabel}>Daily Goal</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.fieldInput, { flex: 1, textAlign: 'center' }]}
                        keyboardType="number-pad"
                        placeholder="0"
                        value={String(Math.floor((draft[cat.key]?.daily || 0) / 60) || '')}
                        onChangeText={(v) => updateGoalPart(cat.key, 'daily', 'h', v)}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>H</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.fieldInput, { flex: 1, textAlign: 'center' }]}
                        keyboardType="number-pad"
                        placeholder="0"
                        value={String((draft[cat.key]?.daily || 0) % 60 || '')}
                        onChangeText={(v) => updateGoalPart(cat.key, 'daily', 'm', v)}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>M</Text>
                    </View>
                  </View>
                </View>

                {/* Weekly */}
                <View>
                  <Text style={styles.fieldLabel}>Weekly Goal</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.fieldInput, { flex: 1, textAlign: 'center' }]}
                        keyboardType="number-pad"
                        placeholder="0"
                        value={String(Math.floor((draft[cat.key]?.weekly || 0) / 60) || '')}
                        onChangeText={(v) => updateGoalPart(cat.key, 'weekly', 'h', v)}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>H</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={[styles.fieldInput, { flex: 1, textAlign: 'center' }]}
                        keyboardType="number-pad"
                        placeholder="0"
                        value={String((draft[cat.key]?.weekly || 0) % 60 || '')}
                        onChangeText={(v) => updateGoalPart(cat.key, 'weekly', 'm', v)}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>M</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </ModalScreen>
    </Modal>
  );
}

function FocusImportModal({ visible, categories, onClose, onImport }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) { setText(''); setPreview([]); setError(''); }
  }, [visible]);

  function parse(raw) {
    setError('');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith('#'));
    const parsed = [];
    const errs = [];
    lines.forEach((line, i) => {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) { errs.push(`Line ${i + 1}: need at least date, minutes`); return; }
      const [dateStr, minsStr, catKey] = parts;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) { errs.push(`Line ${i + 1}: invalid date "${dateStr}"`); return; }
      const minutes = parseInt(minsStr, 10);
      if (isNaN(minutes) || minutes <= 0) { errs.push(`Line ${i + 1}: invalid minutes "${minsStr}"`); return; }
      const cat = categories.find(c => c.key === catKey) || categories[0];
      parsed.push({ id: String(Date.now()) + '-' + i, date, minutes, category: cat.key });
    });
    setPreview(parsed);
    if (errs.length) setError(errs.join('\n'));
    return parsed;
  }

  function handleChange(val) {
    setText(val);
    parse(val);
  }

  function handleImport() {
    const entries = parse(text);
    if (!entries.length) { setError('No valid sessions to import.'); return; }
    onImport(entries);
  }

  const catMap = Object.fromEntries(categories.map(c => [c.key, c]));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Import Focus History</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 18 }}>
              One session per line:{'\n'}
              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#374151' }}>YYYY-MM-DD, minutes, category</Text>{'\n'}
              Category keys: {categories.map(c => c.key).join(', ')}{'\n'}
              Example: <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#374151' }}>2024-03-15, 45, work</Text>
            </Text>

            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 13, minHeight: 120, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#111827', textAlignVertical: 'top', marginBottom: 8 }}
              multiline
              placeholder={'2024-01-10, 60, work\n2024-01-11, 30, study\n2024-01-12, 90, exercise'}
              placeholderTextColor="#9ca3af"
              value={text}
              onChangeText={handleChange}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!!error && <Text style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</Text>}

            {preview.length > 0 && (
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 }}>{preview.length} session{preview.length !== 1 ? 's' : ''} ready to import:</Text>
                <ScrollView style={{ maxHeight: 100 }}>
                  {preview.map((e, i) => {
                    const cat = catMap[e.category];
                    return (
                      <Text key={i} style={{ fontSize: 12, color: '#374151' }}>
                        {e.date.toLocaleDateString()} · {e.minutes}m · {cat?.label || e.category}
                      </Text>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={{ backgroundColor: preview.length > 0 ? colors.primary : '#e5e7eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
              onPress={handleImport}
              disabled={preview.length === 0}
            >
              <Text style={{ color: preview.length > 0 ? '#fff' : '#9ca3af', fontWeight: '700', fontSize: 16 }}>
                Import {preview.length > 0 ? `${preview.length} Sessions` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// BankedRollsModal handles the display now

// BankedRollsModal handles the display now

// ═════════════════════════════════════════════════════════════════════════════
// MAIN FOCUS SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function FocusScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const {
    entries, addEntry, deleteEntry, updateEntry,
    categories, setCategories,
    goals, setGoals,
    timerState, setTimerState,
    activeTimerKeys,
    addVisibleTimer, removeVisibleTimer, reorderTimer, bumpTimer,
    adjustTimer,
    startTimer, stopTimer, resetTimer
  } = useFocus();
  const { addReward, removeReward, calculateDiminishingPoints, getFocusDiceCount } = useEconomy();
  const galleryScrolledRef = useRef(false);

  const [timerSeconds, setTimerSeconds] = useState(0); // For display only
  const [pendingLog, setPendingLog] = useState(null); // { category, seconds }
  const [editEntry, setEditEntry] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [adjustingKey, setAdjustingKey] = useState(null);
  const [pendingNote, setPendingNote] = useState('');
  const [statsPeriod, setStatsPeriod] = useState('week');
  const [pendingFocusReward, setPendingFocusReward] = useState(null); // { minutes, basePoints }
  const [pendingPenalty, setPendingPenalty] = useState(null); // { minutes, baseDeduction }
  const intervalRef = useRef(null);
  const mainScrollRef = useRef(null);
  const galleryRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Re-render every second to update all active timers
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasActive = Object.values(timerState).some(s => s?.startTime);
    if (!hasActive) return;

    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerState]);

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.x;
    setShowScrollTop(y > 300);
  };

  const getElapsed = (catKey) => {
    const state = timerState[catKey];
    if (!state) return 0;
    let seconds = state.secondsAtStart || 0;
    if (state.startTime) {
      seconds += Math.floor((new Date() - new Date(state.startTime)) / 1000);
    }
    return Math.max(0, seconds);
  };

  function handleTimerClick(cat) {
    const state = timerState[cat.key];
    if (state?.startTime) {
      const finalSecs = stopTimer(cat.key);
      const minutes = Math.floor(finalSecs / 60);
      if (minutes >= 1) {
        setPendingLog({ category: cat.key, seconds: finalSecs });
      }
    } else {
      startTimer(cat.key);
    }
  }

  function handleLogConfirmed() {
    if (!pendingLog) return;
    const { category, seconds } = pendingLog;
    const minutes = Math.floor(seconds / 60);
    const catObj = categories.find(c => c.key === category);
    const isUnproductive = catObj?.subtype === 'unproductive';

    const newEntry = {
      id: String(Date.now()),
      category,
      minutes,
      date: new Date(),
      note: pendingNote,
    };
    addEntry(newEntry);
    resetTimer(category);
    setPendingLog(null);
    setPendingNote('');

    // Add a short delay to ensure the confirmation modal is closed before showing the 3D dice
    setTimeout(() => {
      const diceCount = getFocusDiceCount(minutes);
      if (isUnproductive) {
        setPendingPenalty({ minutes, diceCount });
      } else {
        setPendingFocusReward({ minutes, diceCount });
      }
    }, 400);
  }

  function saveEntry(entry) {
    const isExisting = entries.some(e => e.id === entry.id);
    const catObj = categories.find(c => c.key === entry.category);
    const isUnproductive = catObj?.subtype === 'unproductive';

    if (isExisting) {
      updateEntry(entry);
    } else {
      addEntry(entry);
      // Add a short delay to ensure the manual entry modal is closed
      setTimeout(() => {
        const diceCount = getFocusDiceCount(entry.minutes);
        if (isUnproductive) {
          setPendingPenalty({ minutes: entry.minutes, diceCount });
        } else {
          setPendingFocusReward({ minutes: entry.minutes, diceCount });
        }
      }, 400);
    }

    setEditEntry(null);
    setShowAddModal(false);
  }

  function handleDeleteEntry(id) {
    deleteEntry(id);
    setEditEntry(null);
  }

  // ── Stats calculations ──────────────────────────────────────────────────
  const now = new Date();

  // Today total
  const todayEntries = entries.filter(e => isSameDay(e.date, now));
  const todayTotal = todayEntries.reduce((acc, e) => acc + e.minutes, 0);

  // Week chart data (Sun–Sat)
  const weekStart = getWeekStart(now);
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const dayEntries = entries.filter(e => isSameDay(e.date, day));
    const total = dayEntries.reduce((acc, e) => acc + e.minutes, 0);
    return { label: fmtDateShort(day), value: total, color: isSameDay(day, now) ? colors.primary : '#c7d2fe' };
  });
  const weekMax = Math.max(...weekData.map(d => d.value), 60);
  const weekTotal = weekData.reduce((acc, d) => acc + d.value, 0);

  // Month data — last 4 weeks
  const monthData = Array.from({ length: 4 }, (_, wi) => {
    const wStart = new Date(now);
    wStart.setDate(wStart.getDate() - (3 - wi) * 7 - wStart.getDay());
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);
    const weekEntries = entries.filter(e => e.date >= wStart && e.date <= wEnd);
    const total = weekEntries.reduce((acc, e) => acc + e.minutes, 0);
    return {
      label: `W${wi + 1}`,
      value: total,
      color: wi === 3 ? colors.primary : '#c7d2fe',
    };
  });
  const monthMax = Math.max(...monthData.map(d => d.value), 60);
  const monthTotal = monthData.reduce((acc, d) => acc + d.value, 0);

  // Recent entries (last 20)
  const recentEntries = [...entries]
    .sort((a, b) => b.date - a.date)
    .slice(0, 20);

  // ── Productivity stats calculation ──────────────────────────────────────
  const getTimeSummary = (periodEntries) => {
    // Group minutes by nature
    const sorted = { productive: 0, paid: 0, entertainment: 0, unproductive: 0, sleep: 0 };

    // 1. Group by day to apply sleep cap
    const dayMap = {};
    periodEntries.forEach(e => {
      const dKey = fmtDate(e.date);
      if (!dayMap[dKey]) dayMap[dKey] = { productive: 0, paid: 0, entertainment: 0, unproductive: 0, sleep: 0 };
      const cat = categories.find(c => c.key === e.category) || { label: 'Deleted', color: '#94a3b8' };
      let nature = cat.nature || (cat.isProductive ? 'productive' : 'entertainment');
      if (cat.subtype === 'unproductive') nature = 'unproductive';
      dayMap[dKey][nature] += Number(e.minutes || 0);
    });

    let totalEffProductive = 0;
    let totalEffWaste = 0;

    Object.values(dayMap).forEach(day => {
      const cappedSleep = Math.min(day.sleep || 0, 480); // 8h
      const overflowSleep = Math.max(0, (day.sleep || 0) - 480);

      totalEffProductive += (day.productive || 0) + (day.paid || 0) + (cappedSleep || 0);
      totalEffWaste += (day.entertainment || 0) + (day.unproductive || 0) + (overflowSleep || 0);

      sorted.productive += (day.productive || 0);
      sorted.paid += (day.paid || 0);
      sorted.entertainment += (day.entertainment || 0);
      sorted.unproductive += (day.unproductive || 0);
      sorted.sleep += (day.sleep || 0);
    });

    const total = totalEffProductive + totalEffWaste;
    return {
      total,
      paidProductiveTotal: sorted.paid + sorted.productive,
      paid: sorted.paid,
      productive: sorted.productive,
      unproductive: sorted.unproductive,
      entertainment: sorted.entertainment,
      sleep: sorted.sleep,
      score: total > 0 ? Math.round((totalEffProductive / total) * 100) : 0
    };
  };

  const todayStats = getTimeSummary(todayEntries);
  const weekStats = getTimeSummary(entries.filter(e => new Date(e.date) >= weekStart));

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="timer-outline" size={24} color={colors.primary} />
            <Text style={styles.headerTitle}>Focus Timer</Text>
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            snapToInterval={140}
            decelerationRate="fast"
          >
            {activeTimerKeys.map(key => {
              const cat = categories.find(c => c.key === key);
              if (!cat) return null; // Strictly honor deletions
              const state = timerState[key] || {};
              const isRunning = !!state.startTime;
              const elapsed = getElapsed(key);

              return (
                <View key={key} style={styles.clockWrapper}>
                  <TouchableOpacity
                    style={[styles.clockCircle, { borderColor: isRunning ? cat.color : colors.border }]}
                    onPress={() => handleTimerClick(cat)}
                    onLongPress={() => setAdjustingKey(key)}
                    delayLongPress={500}
                  >
                    <Ionicons name={cat.icon} size={24} color={isRunning ? cat.color : colors.textMuted} />
                    <Text style={[styles.clockTimer, isRunning && { color: cat.color }]}>
                      {fmtTimer(elapsed)}
                    </Text>
                    <View style={styles.clockLabelContainer}>
                      <Text style={styles.clockLabel} numberOfLines={2}>{cat.label}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.clockControls}>
                    <TouchableOpacity style={styles.smallControlBtn} onPress={() => bumpTimer(key)}>
                      <Ionicons name="arrow-back" size={14} color="#9ca3af" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.smallControlBtn} onPress={() => resetTimer(key)}>
                      <Ionicons name="refresh" size={14} color="#9ca3af" />
                    </TouchableOpacity>

                    {elapsed >= 60 && !isRunning && (
                      <TouchableOpacity
                        style={[styles.smallControlBtn, { backgroundColor: colors.primary + '15' }]}
                        onPress={() => setPendingLog({ category: key, seconds: elapsed })}
                      >
                        <Ionicons name="checkmark" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.smallControlBtn} onPress={() => removeVisibleTimer(key)}>
                      <Ionicons name="close-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity style={styles.addClockBtn} onPress={() => setShowCategoryPicker(true)}>
              <View style={styles.addClockCircle}>
                <Ionicons name="add" size={32} color={colors.primary} />
              </View>
              <Text style={styles.addClockLabel}>Add Timer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Log Confirmation Modal */}
        {pendingLog && (
          <Modal visible transparent animationType="fade">
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmBox}>
                <View style={[styles.confirmHeader, { backgroundColor: categories.find(c => c.key === pendingLog.category)?.color + '15' }]}>
                  <Ionicons 
                    name={categories.find(c => c.key === pendingLog.category)?.icon || 'timer'} 
                    size={28} 
                    color={categories.find(c => c.key === pendingLog.category)?.color || colors.primary} 
                  />
                  <Text style={[styles.confirmTitle, { color: categories.find(c => c.key === pendingLog.category)?.color || colors.primary }]}>
                    Session Complete
                  </Text>
                </View>

                <View style={styles.confirmBody}>
                  <Text style={styles.confirmText}>
                    You focused for <Text style={{ fontWeight: '800', color: '#111827' }}>{fmtDuration(Math.floor(pendingLog.seconds / 60))}</Text> on {categories.find(c => c.key === pendingLog.category)?.label}.
                  </Text>

                  <TextInput
                    style={styles.confirmInput}
                    placeholder="What did you accomplish?"
                    placeholderTextColor="#9ca3af"
                    value={pendingNote}
                    onChangeText={setPendingNote}
                    multiline
                  />
                </View>

                <View style={styles.confirmActions}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setPendingLog(null)}>
                    <Text style={styles.confirmCancelText}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.confirmLog, { backgroundColor: categories.find(c => c.key === pendingLog.category)?.color || colors.primary }]} 
                    onPress={handleLogConfirmed}
                  >
                    <Text style={styles.confirmLogText}>Claim Rewards</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* ── Add manual entry button ── */}
        <TouchableOpacity style={styles.addManualBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addManualText}>Add Time Manually</Text>
        </TouchableOpacity>

        {/* ── Daily History Gallery ── */}
        <View style={styles.galleryContainer}>
          <View style={styles.galleryHeader}>
            <Text style={styles.sectionTitle}>Daily History</Text>
            <TouchableOpacity
              style={styles.jumpBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.jumpBtnText}>Jump to Date</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryList}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum={Platform.OS === 'web'}
            ref={galleryRef}
            style={Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : null}
          >
            {Array.from({ length: 30 }, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - i); // Now 0 is today, 1 is yesterday, etc.
              date.setHours(0, 0, 0, 0);
              const dayEntries = entries.filter(e => isSameDay(e.date, date));
              const stats = getTimeSummary(dayEntries);
              const isToday = i === 0;

              return (
                <View 
                  key={i} 
                  style={[
                    styles.historyCard, 
                    { width: windowWidth - 40 },
                    Platform.OS === 'web' && { scrollSnapAlign: 'center' }
                  ]}
                >
                  <View style={styles.todayTop}>
                    <View>
                      <Text style={styles.todayLabel}>{isToday ? 'Today' : fmtDate(date)}</Text>
                      <Text style={styles.todayTotal}>{fmtDuration(stats.paidProductiveTotal)}</Text>
                    </View>
                    <View style={styles.todaySummaryRow}>
                      <View style={styles.scoreCircleSmall}>
                        <Text style={styles.scoreValSmall}>{stats.score}%</Text>
                        <Text style={styles.scoreLabelSmall}>Eff.</Text>
                      </View>
                      <View style={styles.todaySummaryBreakdown}>
                        <View style={styles.todaySummaryItem}>
                          <View style={[styles.summaryDot, { backgroundColor: '#3b82f6' }]} />
                          <Text style={styles.summaryText}>Paid: {fmtDuration(stats.paid)}</Text>
                        </View>
                        <View style={styles.todaySummaryItem}>
                          <View style={[styles.summaryDot, { backgroundColor: '#10b981' }]} />
                          <Text style={styles.summaryText}>Productive: {fmtDuration(stats.productive)}</Text>
                        </View>
                        <View style={styles.todaySummaryItem}>
                          <View style={[styles.summaryDot, { backgroundColor: '#ef4444' }]} />
                          <Text style={styles.summaryText}>Unproductive: {fmtDuration(stats.unproductive)}</Text>
                        </View>
                        <View style={styles.todaySummaryItem}>
                          <View style={[styles.summaryDot, { backgroundColor: '#7c3aed' }]} />
                          <Text style={styles.summaryText}>Sleep: {fmtDuration(stats.sleep)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <CategoryBreakdown
                      entries={entries}
                      period="day"
                      specificDate={date}
                      categories={categories}
                      goals={goals}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Goals & Progress Tracking ── */}
        {Object.keys(goals).length === 0 ? (
          <View style={styles.promptCard}>
            <Ionicons name="trophy-outline" size={32} color="#8b5cf6" />
            <Text style={styles.promptTitle}>Set Your Focus Goals!</Text>
            <Text style={styles.promptText}>Stay consistent by setting daily or weekly time targets for your favorite categories.</Text>
            <TouchableOpacity style={styles.promptBtn} onPress={() => setShowGoalsModal(true)}>
              <Text style={styles.promptBtnText}>Setup Goals</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.goalCard}>
            <View style={styles.goalCardHeader}>
              <Text style={styles.goalCardTitle}>Category Goals</Text>
              <TouchableOpacity style={styles.goalEditBtn} onPress={() => setShowGoalsModal(true)}>
                <Ionicons name="create-outline" size={14} color={colors.primary} />
                <Text style={styles.goalEditBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            {categories.filter(c => goals[c.key] && (goals[c.key].daily > 0 || goals[c.key].weekly > 0)).map(cat => {
              const catEntries = entries.filter(e => e.category === cat.key);

              const dayItems = catEntries.filter(e => isSameDay(new Date(e.date), new Date()));
              const dayMin = dayItems.reduce((acc, curr) => acc + curr.minutes, 0);

              const weekStart = getWeekStart(new Date());
              const weekItems = catEntries.filter(e => new Date(e.date) >= weekStart);
              const weekMin = weekItems.reduce((acc, curr) => acc + curr.minutes, 0);

              const catGoals = goals[cat.key];

              return (
                <View key={cat.key} style={styles.categoryGoalRow}>
                  <View style={styles.categoryGoalHeader}>
                    <Ionicons name={cat.icon} size={14} color={cat.color} />
                    <Text style={styles.categoryGoalLabel}>{cat.label}</Text>
                  </View>

                  {catGoals.weekly > 0 && (
                    <GoalProgressBar
                      label="This Week"
                      current={weekMin}
                      goal={catGoals.weekly}
                      color={cat.color}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Productivity Score Card ── */}
        <View style={styles.productivityCard}>
          <View style={styles.productivityHeader}>
            <View>
              <Text style={styles.productivityTitle}>Productivity Score</Text>
              <Text style={styles.productivitySub}>{statsPeriod === 'week' ? 'This Week' : 'Today'}</Text>
            </View>
            <View style={styles.productivityBadge}>
              <Text style={styles.productivityBadgeText}>
                {statsPeriod === 'week' ? weekStats.score : todayStats.score}%
              </Text>
            </View>
          </View>

          <View style={styles.productivityBarBg}>
            <View
              style={[
                styles.productivityBarFill,
                {
                  width: `${statsPeriod === 'week' ? weekStats.score : todayStats.score}%`,
                  backgroundColor: colors.primary
                }
              ]}
            />
          </View>

          <View style={styles.productivityStatsRow}>
            <View style={styles.productivityStat}>
              <Text style={styles.productivityStatVal}>
                {fmtDuration(statsPeriod === 'week' ? weekStats.productive : todayStats.productive)}
              </Text>
              <Text style={styles.productivityStatLabel}>Focus</Text>
            </View>
            <View style={styles.productivityStatDivider} />
            <View style={styles.productivityStat}>
              <Text style={styles.productivityStatVal}>
                {fmtDuration(statsPeriod === 'week' ? weekStats.entertainment : todayStats.entertainment)}
              </Text>
              <Text style={styles.productivityStatLabel}>Entertainment</Text>
            </View>
            <View style={styles.productivityStatDivider} />
            <View style={styles.productivityStat}>
              <Text style={styles.productivityStatVal}>
                {fmtDuration(statsPeriod === 'week' ? weekStats.sleep : todayStats.sleep)}
              </Text>
              <Text style={styles.productivityStatLabel}>Rest</Text>
            </View>
          </View>
        </View>

        {/* ── Stats Period Selector ── */}
        <View style={styles.statsTabs}>
          {[
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.statsTab, statsPeriod === tab.key && styles.statsTabActive]}
              onPress={() => setStatsPeriod(tab.key)}
            >
              <Text style={[styles.statsTabText, statsPeriod === tab.key && styles.statsTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Weekly Chart ── */}
        {statsPeriod === 'week' && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Weekly Overview</Text>
              <Text style={styles.chartTotal}>{fmtDuration(weekTotal)} total</Text>
            </View>
            <BarChart data={weekData} maxVal={weekMax} barWidth={30} />
            <View style={styles.divider} />
            <Text style={styles.breakdownTitle}>By Category</Text>
            <CategoryBreakdown entries={entries} period="week" categories={categories} />
          </View>
        )}

        {/* ── Monthly Chart ── */}
        {statsPeriod === 'month' && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Monthly Overview</Text>
              <Text style={styles.chartTotal}>{fmtDuration(monthTotal)} total</Text>
            </View>
            <BarChart data={monthData} maxVal={monthMax} barWidth={44} />
            <View style={styles.divider} />
            <Text style={styles.breakdownTitle}>By Category</Text>
            <CategoryBreakdown entries={entries} period="month" categories={categories} />
          </View>
        )}


        {/* ── Recent Entries ── */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Entries</Text>
          {recentEntries.length === 0 ? (
            <Text style={styles.emptyNote}>No entries yet.</Text>
          ) : (
            recentEntries.map(entry => {
              const cat = categories.find(c => c.key === entry.category) || { label: 'Deleted', color: '#94a3b8' };
              return (
                <TouchableOpacity key={entry.id} style={styles.entryRow} onPress={() => setEditEntry(entry)}>
                  <View style={[styles.entryCatIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={cat.icon} size={16} color={cat.color} />
                  </View>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryCategory}>{cat.label}</Text>
                    <Text style={styles.entryMeta}>
                      {fmtDate(entry.date)} · {fmtDuration(entry.minutes)}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.entryDuration, { color: cat.color }]}>{fmtDuration(entry.minutes)}</Text>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                    style={{ padding: 6, marginLeft: 4 }}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#d1d5db" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setEditEntry(entry); }}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <EntryModal
        visible={showAddModal || !!editEntry}
        entry={editEntry}
        onSave={(data) => {
          if (editEntry) {
            updateEntry({ ...editEntry, ...data });
            setEditEntry(null);
          } else {
            saveEntry(data);
            setShowAddModal(false);
          }
        }}
        onDelete={(id) => {
          deleteEntry(id);
          setEditEntry(null);
        }}
        onClose={() => {
          setShowAddModal(false);
          setEditEntry(null);
        }}
        categories={categories}
      />

      {/* Settings menu */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSettings(false)}>
          <View style={styles.settingsMenu}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Focus Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowSettings(false); setShowImport(true); }}
            >
              <Ionicons name="download-outline" size={22} color={colors.primary} />
              <Text style={styles.menuItemText}>Import History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowSettings(false); setShowCatModal(true); }}
            >
              <Ionicons name="list-outline" size={22} color={colors.primary} />
              <Text style={styles.menuItemText}>Manage Categories</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowSettings(false); setShowReorder(true); }}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
              <Text style={styles.menuItemText}>Reorder Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowSettings(false); setShowGoalsModal(true); }}
            >
              <Ionicons name="trophy-outline" size={22} color={colors.primary} />
              <Text style={styles.menuItemText}>Set Focus Goals</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Adjust Time Modal */}
      <Modal visible={!!adjustingKey} animationType="fade" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAdjustingKey(null)}>
          <View style={styles.adjustBox}>
            <Text style={styles.adjustTitle}>Adjust Minutes</Text>
            <View style={styles.adjustRow}>
              {[-15, -5, -1, 1, 5, 15].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.adjustBtn, { backgroundColor: m > 0 ? colors.primary + '15' : '#fee2e2' }]}
                  onPress={() => adjustTimer(adjustingKey, m * 60)}
                >
                  <Text style={[styles.adjustBtnText, { color: m > 0 ? colors.primary : '#ef4444' }]}>{m > 0 ? '+' : ''}{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.adjustClose} onPress={() => setAdjustingKey(null)}>
              <Text style={styles.adjustCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reorder Modal */}
      <Modal visible={showReorder} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReorder(false)}>
          <View style={styles.reorderContent}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Dashboard Order</Text>
              <TouchableOpacity onPress={() => setShowReorder(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>

            <View style={styles.reorderList}>
              {activeTimerKeys.map((key, index) => {
                const cat = categories.find(c => c.key === key) || { label: key, color: '#94a3b8' };
                return (
                  <View key={key} style={styles.reorderItem}>
                    <View style={[styles.reorderIcon, { backgroundColor: cat.color + '20' }]}>
                      <Ionicons name={cat.icon} size={18} color={cat.color} />
                    </View>
                    <Text style={styles.reorderLabel}>{cat.label}</Text>
                    <View style={styles.reorderActions}>
                      {index > 0 && (
                        <TouchableOpacity onPress={() => reorderTimer(key, -1)} style={styles.reorderBtn}>
                          <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      {index < activeTimerKeys.length - 1 && (
                        <TouchableOpacity onPress={() => reorderTimer(key, 1)} style={styles.reorderBtn}>
                          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity style={styles.adjustClose} onPress={() => setShowReorder(false)}>
              <Text style={styles.adjustCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Picker modal */}
      <Modal visible={showCategoryPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.pickerItem}
                  onPress={() => {
                    addVisibleTimer(cat.key);
                    setShowCategoryPicker(false);
                  }}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: cat.color + '15' }]}>
                    <Ionicons name={cat.icon} size={24} color={cat.color} />
                  </View>
                  <Text style={styles.pickerLabel}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerClose} onPress={() => setShowCategoryPicker(false)}>
              <Text style={styles.pickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={[styles.pickerContent, { maxHeight: '60%' }]}>
            <Text style={styles.pickerTitle}>Jump to Date</Text>
            <ScrollView style={{ paddingHorizontal: 20 }}>
              {Array.from({ length: 30 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (29 - i));
                return d;
              }).reverse().map((date, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                  onPress={() => {
                    if (galleryRef.current) {
                      galleryRef.current.scrollTo({ x: idx * (windowWidth - 20), animated: true });
                    }
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={{ fontSize: 16, color: colors.textPrimary }}>{fmtDate(date)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cat Manager */}
      <CategoryManagerModal
        visible={showCatModal}
        categories={categories}
        onSave={(newCats) => { setCategories(newCats); setShowCatModal(false); }}
        onClose={() => setShowCatModal(false)}
      />
      {showScrollTop && <ScrollToTop scrollRef={mainScrollRef} />}

      <FocusImportModal
        visible={showImport}
        categories={categories}
        onClose={() => setShowImport(false)}
        onImport={(newEntries) => {
          newEntries.forEach(e => addEntry(e));
          setShowImport(false);
        }}
      />

      <FocusRollModal
        visible={!!pendingFocusReward}
        rolls={pendingFocusReward?.diceCount || 0}
        mode="reward"
        onClose={() => setPendingFocusReward(null)}
        onFinish={() => setPendingFocusReward(null)}
      />

      <UnproductiveRollModal
        visible={!!pendingPenalty}
        rolls={pendingPenalty?.diceCount || 0}
        onClose={() => setPendingPenalty(null)}
        onFinish={() => setPendingPenalty(null)}
      />

      <GoalSettingModal
        visible={showGoalsModal}
        categories={categories}
        goals={goals}
        onSave={(newGoals) => { setGoals(newGoals); setShowGoalsModal(false); }}
        onClose={() => setShowGoalsModal(false)}
      />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 8, marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827', marginLeft: 10 },

  // Section title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Dashboard
  dashboardSection: { marginBottom: 20 },
  carouselContent: { paddingLeft: 20, paddingRight: 8, paddingBottom: 10 },

  clockWrapper: { alignItems: 'center', width: 110, marginRight: 16 },
  clockCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  clockTimer: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  clockLabelContainer: {
    height: 24,
    width: '85%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  clockLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 10,
  },
  clockControls: {
    flexDirection: 'row',
    marginTop: 8,
  },
  smallControlBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 2,
  },

  addClockBtn: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addClockCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  addClockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 10,
  },

  // Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  pickerGrid: {
    paddingBottom: 10,
  },
  pickerItem: {
    alignItems: 'center',
    width: 80,
    marginRight: 12,
  },
  pickerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pickerClose: {
    marginTop: 20,
    backgroundColor: '#f3f4f6',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // Confirmation Modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginBottom: 8,
  },
  confirmBody: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  confirmText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  confirmInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  confirmBox: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  confirmLog: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmLogText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  settingsBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  settingsMenu: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: 12,
  },
  adjustBox: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  adjustTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  adjustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  adjustBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  adjustBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  adjustClose: {
    marginTop: 10,
    width: '100%',
    padding: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    alignItems: 'center',
  },
  adjustCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  reorderContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
  },
  reorderList: {
    marginBottom: 20,
  },
  reorderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  reorderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reorderLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  reorderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reorderBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  // Add manual
  addManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addManualText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },

  // Today card
  todayCard: {
    margin: 20,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#fafafa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  todayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  todayTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 2,
  },
  todaySummaryBreakdown: {
    alignItems: 'flex-end',
    gap: 4,
  },
  todaySummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todaySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // Stats tabs
  statsTabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 3,
  },
  statsTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  statsTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statsTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  statsTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },

  // Chart card
  chartCard: {
    margin: 20,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#fafafa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chartTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Category breakdown
  breakdownList: {
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  breakdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  breakdownInfo: {
    flex: 1,
    marginRight: 10,
  },
  breakdownTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  breakdownTime: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  breakdownBarBg: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
  },
  breakdownBarFill: {
    height: 6,
    borderRadius: 3,
    minWidth: 4,
  },
  breakdownPct: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    width: 44,
    textAlign: 'right',
  },

  // Empty note
  emptyNote: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Recent entries
  recentSection: {
    marginTop: 8,
    paddingBottom: 20,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryCatIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryCategory: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  entryMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  entryDuration: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Modal
  modalScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  modalBody: {
    padding: 20,
    paddingBottom: 60,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: '#fafafa',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  catChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  durationField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
  },
  durationInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  durationUnit: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  quickDurations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickDurBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  quickDurText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  goalCard: {
    margin: 20,
    marginTop: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  goalEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addManualText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },

  // Productivity Card
  productivityCard: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  productivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  productivityTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  productivitySub: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  productivityBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  productivityBadgeText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  productivityBarBg: {
    height: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },
  productivityBarFill: {
    height: 10,
    borderRadius: 5,
  },
  productivityStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  productivityStat: {
    flex: 1,
    alignItems: 'center',
  },
  productivityStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#f3f4f6',
  },
  productivityStatVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 2,
  },
  productivityStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryGoalRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryGoalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryGoalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  promptCard: {
    margin: 20,
    marginTop: 10,
    padding: 20,
    backgroundColor: '#f5f3ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    alignItems: 'center',
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5b21b6',
  },
  promptText: {
    fontSize: 13,
    color: '#7c3aed',
    textAlign: 'center',
    lineHeight: 18,
  },
  promptBtn: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  promptBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  // History Gallery
  galleryContainer: { marginVertical: 20 },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  jumpBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  jumpBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  galleryList: { paddingHorizontal: 10 },
  historyCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginHorizontal: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 15, elevation: 3, borderWidth: 1, borderColor: '#f3f4f6' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 15 },
  scoreCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 10 },
  scoreVal: { fontSize: 20, fontWeight: '800', color: colors.primary },
  scoreLabel: { fontSize: 8, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreCircleSmall: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginRight: 14, // Pushes it further left from the category text
    marginTop: 15,   // Moves it down
  },
  scoreValSmall: { fontSize: 14, fontWeight: '900', color: colors.primary },
  scoreLabelSmall: { fontSize: 6, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: -2 },
});
