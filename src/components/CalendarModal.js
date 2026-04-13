import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, SafeAreaView, Platform, Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const isWeb = Platform.OS === 'web';
const CALENDAR_MAX = isWeb ? Math.min(SCREEN_W * 0.9, 400) : undefined;
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function CalendarModal({ visible, onClose, onSelect }) {
  const [date, setDate] = useState(new Date());

  const year = date.getFullYear();
  const month = date.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  function prevMonth() { setDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setDate(new Date(year, month + 1, 1)); }

  function handleDayPress(day) {
    const formatted = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    onSelect(formatted);
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.calendarCard}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={prevMonth} style={styles.arrowBtn}>
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.title}>{monthNames[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.arrowBtn}>
              <Ionicons name="chevron-forward" size={24} color="#111827" />
            </TouchableOpacity>
          </View>

          {/* Weekdays */}
          <View style={styles.weekRow}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <Text key={i} style={styles.weekday}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {blanks.map(b => (
              <View key={`b-${b}`} style={styles.dayCell} />
            ))}
            {days.map(d => {
              const matchesToday = new Date().toDateString() === new Date(year, month, d).toDateString();
              return (
                <TouchableOpacity key={d} style={[styles.dayCell, matchesToday && styles.todayCell]} onPress={() => handleDayPress(d)}>
                  <Text style={[styles.dayText, matchesToday && styles.todayText]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: CALENDAR_MAX || '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  arrowBtn: {
    padding: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekday: {
    width: 32,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: isWeb ? 40 : 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayCell: {
    backgroundColor: colors.primary,
    borderRadius: 16,
  },
  dayText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  todayText: {
    color: '#fff',
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 16,
  },
});
