import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Dimensions, TouchableOpacity, Animated, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTasks, getAppDayKey, getLocalDateKey } from '../lib/TasksContext';
import { useSettings } from '../lib/SettingsContext';
import { useEconomy } from '../lib/EconomyContext';
import { useTheme } from '../lib/ThemeContext';
import ScrollToTop from '../components/ScrollToTop';
import { useFocus } from '../lib/FocusContext';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getDayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function getHourLabel(hour) {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}${ampm}`;
}

// ── Components ───────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, color }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={styles.statLabel}>{title}</Text>
        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
        {!!sub && <Text style={styles.statSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function SectionHeader({ title, icon, color }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeaderWrap}>
      <View style={[styles.sectionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { colors } = useTheme();
  const { taskHistory } = useTasks();
  const { dayStartTime } = useSettings();
  const { economy, updateDailyRecord } = useEconomy();
  
  const { entries: focusEntries } = useFocus();
  
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };
  
  const [period, setPeriod] = useState('week'); // 'week' | 'month'

  const loaded = true; // Data comes from context providers which handle loading state

  // ── Aggregations ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const todayKey = getAppDayKey(dayStartTime);
    
    // Total Focus
    const totalFocusMinutes = focusEntries.reduce((acc, e) => acc + e.minutes, 0);
    
    // Total Tasks (Done or I Did All I Could)
    const successHistory = taskHistory.filter(h => h.status === 'done' || h.status === 'did_my_best');
    const totalTasks = successHistory.length;
    
    // Filter by "App Day"
    // h.timestamp is ISO, but we should convert it to the App Day key it occurred on
    const getEventDayKey = (ts) => {
      const d = new Date(ts);
      if (d.getHours() < dayStartTime) {
        d.setDate(d.getDate() - 1);
      }
      return getLocalDateKey(d);
    };

    const tasksToday = successHistory.filter(h => getEventDayKey(h.timestamp) === todayKey).length;
    
    // For week/month, we'll use simple day diffs for now but based on todayKey
    const nowTs = new Date().getTime();
    const tasksThisWeek = successHistory.filter(h => (nowTs - new Date(h.timestamp).getTime()) < (7 * 86400000)).length;
    const tasksThisMonth = successHistory.filter(h => (nowTs - new Date(h.timestamp).getTime()) < (30 * 86400000)).length;

    // Consistency (Active days)
    const activeDates = new Set([
      ...focusEntries.map(e => e.date), // Focus entries usually use local date keys already
      ...taskHistory.map(h => getEventDayKey(h.timestamp))
    ]);
    
    // Auto-update personal best
    if (tasksToday > (economy.dailyRecord || 0)) {
      setTimeout(() => updateDailyRecord(tasksToday), 0);
    }
    
    return {
      totalFocus: fmtDuration(totalFocusMinutes),
      totalTasks,
      tasksToday,
      tasksThisWeek,
      tasksThisMonth,
      streak: economy.activeStreak || 0,
      activeDays: activeDates.size,
      dailyRecord: economy.dailyRecord || 0
    };
  }, [focusEntries, taskHistory, economy.activeStreak, economy.dailyRecord, updateDailyRecord, dayStartTime]);

  // Hourly Peak Chart Data
  const hourlyData = useMemo(() => {
    const buckets = Array(24).fill(0);
    
    focusEntries.forEach(e => {
      const h = new Date(e.date).getHours();
      buckets[h] += e.minutes;
    });

    taskHistory.forEach(h => {
      if (h.status === 'done' || h.status === 'did_my_best') {
        const hr = new Date(h.timestamp).getHours();
        buckets[hr] += 15; // Assign a weight to a task completion
      }
    });

    return buckets.map((val, hr) => ({
      hour: hr,
      label: hr % 4 === 0 ? getHourLabel(hr) : '',
      value: val
    }));
  }, [focusEntries, taskHistory]);

  const peakHour = useMemo(() => {
    let max = -1;
    let hour = -1;
    hourlyData.forEach(d => {
      if (d.value > max) {
        max = d.value;
        hour = d.hour;
      }
    });
    return hour === -1 ? 'None' : getHourLabel(hour);
  }, [hourlyData]);

  const hourlyMax = Math.max(...hourlyData.map(d => d.value), 1);

  // Periodic Productivity Trend
  const trendData = useMemo(() => {
    const dayCount = period === 'week' ? 7 : 30;
    const lastDays = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (dayCount - 1 - i));
      return d.toDateString();
    });

    const data = lastDays.map(dateStr => {
      const dayTasks = taskHistory.filter(h => 
        new Date(h.timestamp).toDateString() === dateStr && 
        (h.status === 'done' || h.status === 'did_my_best')
      ).length;
      const dayFocus = focusEntries.filter(e => 
        new Date(e.date).toDateString() === dateStr
      ).reduce((acc, e) => acc + e.minutes, 0);
      
      // Efficiency Score: (Tasks * 10) + Minutes
      const score = (dayTasks * 10) + dayFocus;

      return {
        label: period === 'week' ? getDayLabel(new Date(dateStr)) : new Date(dateStr).getDate().toString(),
        value: score,
        tasks: dayTasks,
        focus: dayFocus
      };
    });

    return data;
  }, [focusEntries, taskHistory, period]);

  const trendMax = Math.max(...trendData.map(d => d.value), 1);

  // Tag Distribution (Life Area Balance)
  const tagDistribution = useMemo(() => {
    const tags = {};
    taskHistory.forEach(h => {
      if (h.status === 'done' || h.status === 'did_my_best') {
        const tList = h.tags && h.tags.length > 0 ? h.tags : ['Uncategorized'];
        tList.forEach(t => {
          tags[t] = (tags[t] || 0) + 1;
        });
      }
    });
    return Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));
  }, [taskHistory]);

  const topCategory = tagDistribution[0]?.label || 'None';

  const heatmapData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();

      const tasks = taskHistory.filter(h => 
        new Date(h.timestamp).toDateString() === dateStr && 
        (h.status === 'done' || h.status === 'did_my_best')
      ).length;
      const focus = focusEntries.filter(e => 
        new Date(e.date).toDateString() === dateStr
      ).reduce((acc, e) => acc + e.minutes, 0);

      data.push({
        value: tasks * 5 + focus, // Score per day
        date: d
      });
    }
    return data;
  }, [focusEntries, taskHistory]);

  const heatmapMax = Math.max(...heatmapData.map(d => d.value), 10);


  if (!loaded) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView 
        ref={scrollRef} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        
        <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="bar-chart-outline" size={24} color={colors.primary} />
              <View>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Activity Insights</Text>
                <Text style={styles.headerSub}>Analyze your focus peaks and streaks</Text>
              </View>
            </View>
            <View style={[styles.periodToggle, { backgroundColor: colors.surface }]}>
              <TouchableOpacity 
                style={[styles.periodBtn, period === 'week' && { backgroundColor: colors.primary }]} 
                onPress={() => setPeriod('week')}
              >
                <Text style={[styles.periodBtnText, period === 'week' && { color: '#fff' }]}>Week</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.periodBtn, period === 'month' && { backgroundColor: colors.primary }]} 
                onPress={() => setPeriod('month')}
              >
                <Text style={[styles.periodBtnText, period === 'month' && { color: '#fff' }]}>Month</Text>
              </TouchableOpacity>
            </View>
        </View>

        {/* Hero Metrics */}
        <View style={styles.heroGrid}>
            <StatCard 
                title="Today" 
                value={stats.tasksToday} 
                sub={stats.tasksToday > stats.dailyRecord ? "⭐ NEW RECORD!" : `Best: ${stats.dailyRecord}`}
                icon="today-outline" 
                color="#f59e0b" 
            />
            <StatCard 
                title="This Week" 
                value={stats.tasksThisWeek} 
                sub="Last 7 days"
                icon="calendar-outline" 
                color="#3b82f6" 
            />
            <StatCard 
                title="This Month" 
                value={stats.tasksThisMonth} 
                sub="Last 30 days"
                icon="pie-chart-outline" 
                color="#8b5cf6" 
            />
            <StatCard 
                title="Focus Time" 
                value={stats.totalFocus} 
                sub={`${focusEntries.length} sessions`}
                icon="timer" 
                color={colors.primary} 
            />
            <StatCard 
                title="Tasks Done" 
                value={stats.totalTasks} 
                sub="Completed total"
                icon="checkbox" 
                color={colors.green} 
            />
            <StatCard 
                title="Streak" 
                value={`${stats.streak} Days`} 
                sub="Current consistent"
                icon="flame" 
                color="#ef4444" 
            />
            <StatCard 
                title="Active Days" 
                value={stats.activeDays} 
                sub="Overall history"
                icon="calendar" 
                color={colors.violet} 
            />
        </View>

        {/* Highlights Row */}
        <View style={styles.highlightsRow}>
            <View style={[styles.highlightItem, { backgroundColor: colors.amber + '10' }]}>
                <Ionicons name="flash" size={16} color={colors.amber} />
                <Text style={styles.highlightLabel}>Prime Time</Text>
                <Text style={[styles.highlightValue, { color: colors.amber }]}>{peakHour}</Text>
            </View>
            <View style={[styles.highlightItem, { backgroundColor: colors.violet + '10' }]}>
                <Ionicons name="shapes" size={16} color={colors.violet} />
                <Text style={styles.highlightLabel}>Top Category</Text>
                <Text style={[styles.highlightValue, { color: colors.violet }]}>{topCategory}</Text>
            </View>
        </View>

        {/* Efficiency Trend Line Chart */}
        <View style={styles.chartCard}>
            <SectionHeader title="Efficiency Trend" icon="trending-up" color={colors.primary} />
            <Text style={styles.chartDesc}>Efficiency Score: (Tasks × 10) + Focus Minutes.</Text>
            
            <View style={styles.trendRow}>
                {trendData.map((d, i) => (
                    <View key={i} style={styles.trendCol}>
                        <View style={styles.trendTrack}>
                            <View style={[styles.trendBar, { 
                                height: `${(d.value / trendMax) * 100}%`,
                                backgroundColor: colors.primary + (i === trendData.length - 1 ? '' : '80')
                            }]} />
                        </View>
                        <Text style={styles.trendLabel}>{d.label}</Text>
                    </View>
                ))}
            </View>
        </View>

        {/* Life Area Balance */}
        <View style={styles.chartCard}>
            <SectionHeader title="Life Area Balance" icon="pie-chart" color={colors.violet} />
            <Text style={styles.chartDesc}>Where your energy goes (by task tags).</Text>
            <View style={styles.tagWrap}>
              {tagDistribution.length > 0 ? tagDistribution.map((t, i) => {
                const total = tagDistribution.reduce((acc, curr) => acc + curr.count, 0);
                const pct = (t.count / total) * 100;
                return (
                  <View key={i} style={styles.tagRow}>
                    <Text style={styles.tagName}>{t.label}</Text>
                    <View style={styles.tagBarTrack}>
                      <View style={[styles.tagBarFill, { width: `${pct}%`, backgroundColor: colors.violet }]} />
                    </View>
                    <Text style={styles.tagCount}>{t.count}</Text>
                  </View>
                );
              }) : (
                <Text style={styles.emptyText}>No categorized tasks yet.</Text>
              )}
            </View>
        </View>

        {/* Peak Flow - Hourly Heat Map */}
        <View style={styles.chartCard}>
            <SectionHeader title="Peak Flow Hours" icon="flash" color={colors.amber} />
            <Text style={styles.chartDesc}>When are you most productive during the day?</Text>
            
            <View style={styles.hourGrid}>
                {hourlyData.map((d, i) => {
                    const opacity = d.value > 0 ? 0.2 + (d.value / hourlyMax) * 0.8 : 0.05;
                    return (
                        <View key={i} style={styles.hourCol}>
                            <View style={[styles.hourBox, { 
                                backgroundColor: colors.amber,
                                opacity: opacity
                            }]} />
                            {d.label ? <Text style={styles.hourLabel}>{d.label}</Text> : null}
                        </View>
                    );
                })}
            </View>
        </View>

        {/* 30-Day Activity Heatmap */}
        <View style={styles.chartCard}>
            <SectionHeader title="Productivity Heatmap" icon="grid" color={colors.violet} />
            <Text style={styles.chartDesc}>Intensity of your focus and completions over 30 days.</Text>
            
            <View style={styles.heatmapWrap}>
                {heatmapData.map((d, i) => {
                    const intensity = d.value > 0 ? 0.2 + (d.value / heatmapMax) * 0.8 : 0.05;
                    return (
                        <View key={i} style={[styles.heatBox, { 
                            backgroundColor: colors.violet, 
                            opacity: intensity,
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 0.5
                        }]} />
                    );
                })}
            </View>
            <View style={styles.heatLegend}>
                <Text style={styles.heatLegendText}>Less</Text>
                {[0.05, 0.3, 0.6, 1].map(op => (
                    <View key={op} style={[styles.heatBox, { backgroundColor: colors.violet, opacity: op, width: 10, height: 10 }]} />
                ))}
                <Text style={styles.heatLegendText}>More</Text>
            </View>
        </View>

        {/* Energy Distribution */}
        <View style={styles.chartCard}>
             <SectionHeader title="Energy Distribution" icon="battery-charging" color="#10b981" />
             <Text style={styles.chartDesc}>Task completion frequency by energy level.</Text>
             <View style={{ marginTop: 12 }}>
                 {['high', 'medium', 'low'].map(lvl => {
                     const count = taskHistory.filter(h => h.energy === lvl && (h.status === 'done' || h.status === 'did_my_best')).length;
                     const total = taskHistory.filter(h => h.status === 'done' || h.status === 'did_my_best').length || 1;
                     const pct = (count / total) * 100;
                     const color = lvl === 'high' ? '#ef4444' : lvl === 'medium' ? '#f59e0b' : '#10b981';
                     return (
                         <View key={lvl} style={styles.distRow}>
                            <Text style={styles.distLabel}>{lvl.toUpperCase()}</Text>
                            <View style={styles.distTrack}>
                                <View style={[styles.distFill, { width: `${pct}%`, backgroundColor: color }]} />
                            </View>
                            <Text style={styles.distVal}>{count}</Text>
                         </View>
                     );
                 })}
             </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  periodToggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    gap: 2,
  },
  periodBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
  },

  highlightsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  highlightItem: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    gap: 4,
  },
  highlightLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  highlightValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  heroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: (SCREEN_W - 32 - 12) / 2,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  statSub: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },

  chartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  chartDesc: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    marginBottom: 16,
  },

  sectionHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Trend Chart
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  trendCol: {
    alignItems: 'center',
    flex: 1,
  },
  trendTrack: {
    flex: 1,
    width: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendBar: {
    width: '100%',
    borderRadius: 6,
  },
  trendLabel: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 8,
    fontWeight: '600',
  },

  // Hour Grid
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  hourCol: {
    width: (SCREEN_W - 80) / 12,
    alignItems: 'center',
  },
  hourBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
  },
  hourLabel: {
    fontSize: 8,
    color: '#9ca3af',
    marginTop: 4,
    fontWeight: '700',
    position: 'absolute',
    bottom: -12,
    width: 30,
    textAlign: 'center',
  },

  // Heatmap
  heatmapWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-start',
  },
  heatBox: {
    width: (SCREEN_W - 80 - 24) / 10,
    aspectRatio: 1,
    borderRadius: 3,
  },
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 12,
  },
  heatLegendText: {
    fontSize: 10,
    color: '#9ca3af',
    marginHorizontal: 4,
  },

  // Distribution
  distRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 12,
  },
  distLabel: {
      width: 50,
      fontSize: 10,
      fontWeight: '800',
      color: '#9ca3af',
  },
  distTrack: {
      flex: 1,
      height: 8,
      backgroundColor: '#f3f4f6',
      borderRadius: 4,
      overflow: 'hidden',
  },
  distFill: {
      height: '100%',
      borderRadius: 4,
  },
  distVal: {
      width: 20,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'right',
  },

  tagWrap: {
    marginTop: 12,
    gap: 12,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tagName: {
    width: 80,
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  tagBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tagBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  tagCount: {
    width: 20,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    color: '#4b5563',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 10,
  }
});
