import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import { useTasks } from '../lib/TasksContext';
import { useTheme } from '../lib/ThemeContext';
import { useProfile } from '../lib/ProfileContext';
import { useSettings } from '../lib/SettingsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScrollToTop from '../components/ScrollToTop';
import { APP_VERSION } from '../lib/Constants';
import { getBackups, createSafetyBackup, restoreBackup } from '../lib/BackupManager';

export default function SettingsScreen() {
  const { resetEconomy, cheatEconomy } = useEconomy();
  const { setTasks, advanceBoard } = useTasks();
  const { isDark, toggleTheme, colors } = useTheme();
  const { logout, user, storagePrefix } = useProfile();
  const { dayStartTime, resetSubtasksOnParentReset, highlightColor, updateSettings } = useSettings();
  const [exportedData, setExportData] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importDataText, setImportDataText] = useState('');
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };

  const handleResetEconomy = () => {
    console.log("Reset button clicked");
    if (Platform.OS === 'web') {
      const ok = window.confirm("Reset all RPG stats to zero?");
      if (ok) resetEconomy();
      return;
    }
    Alert.alert("Reset Stats", "Reset everything?", [
      { text: "Cancel" },
      { text: "Reset", onPress: () => resetEconomy() }
    ]);
  };

  const handleNukeTasks = async () => {
    console.log("Nuke button clicked");
    if (Platform.OS === 'web') {
      const ok = window.confirm("Delete all tasks permanently?");
      if (ok) {
        await createSafetyBackup(storagePrefix, 'Before Nuke Board');
        setTasks([]);
      }
      return;
    }
    Alert.alert("Nuke Board", "Delete all tasks?", [
      { text: "Cancel" },
      { text: "Delete", onPress: async () => {
          await createSafetyBackup(storagePrefix, 'Before Nuke Board');
          setTasks([]);
        } 
      }
    ]);
  };

  const handleDemoData = async () => {
    if (Platform.OS === 'web') {
      const ok = window.confirm("Replace all tasks with demo data? This cannot be undone.");
      if (!ok) return;
    }

    const loadDemo = async () => {
      await createSafetyBackup(storagePrefix, 'Before Demo Data');
      const categories = ['work', 'health', 'finance', 'chores', 'social', 'hobby', 'studies', 'self-care'];
      const energyLevels = ['low', 'medium', 'high'];
      const statuses = ['pending', 'done', 'missed', 'did_my_best'];
      const titles = [
        'Take out trash', 'Walk dog', 'Review budget', 'Clean kitchen', 'Read 1 chapter',
        'Morning yoga', 'Refill water bottle', 'Respond to email', 'Draft project plan', 'Buy groceries',
        'Pay rent', 'Call mom', 'Brush teeth', 'Do laundry', 'Fix leaky tap', 'Water plants',
        'Check mail', 'Log finances', 'Mediate 10 mins', 'Stretch', 'Study coding', 'Complete level 1',
        'Cook dinner', 'Clear desk', 'Organize files', 'Update portfolio', 'Schedule dentist',
        'Prepare lunch', 'Change bedsheets', 'Clean bathroom', 'Wipe windows', 'Vacuum house',
        'Wash car', 'Mow lawn', 'Prune garden', 'Paint wall', 'Build shelf', 'Sand table',
        'Reply to Slack', 'Meeting prep', 'Submit report', 'Review PR', 'Fix bug #42', 'Deploy site',
        'Update LinkedIn', 'Apply for job', 'Work on CV', 'Learn React', 'Learn Native', 'Learn SQL',
        'Practice guitar', 'Draw sketch', 'Write poem', 'Sing song', 'Dance', 'Stretch session',
        'Drink water', 'Eat fruit', 'Vitamin check', 'Sunlight exposure', 'Step count check',
        'Sleep 8 hours', 'Screen-off hour', 'No caffeine', 'Write in journal', 'Gratitude log',
        'Plan tomorrow', 'Inventory check', 'Car oil change', 'Tire pressure check', 'Gas up',
        'Visit friend', 'Send text', 'Email grandma', 'Update calendar', 'Sync tasks', 'File away',
        'Unload dishwasher', 'Scrub floor', 'Dust shelves', 'Polish shoes', 'Iron shirt',
        'Repair shirt', 'Knit row', 'Play 1 game', 'Watch movie', 'Listen to podcast', 'Go for run'
      ];

      const demoTasks = Array.from({ length: 100 }, (_, i) => {
        const cat = categories[i % categories.length];
        const energy = energyLevels[i % 3];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const isQuest = Math.random() > 0.8;
        const streak = (status === 'done' || status === 'active') ? Math.floor(Math.random() * 6) : 0;
        const title = titles[i % titles.length] + (i > titles.length ? ` #${i}` : '');

        return {
          id: String(Date.now() + i),
          title,
          status,
          energy: (status === 'pending' || status === 'active') ? energy : (Math.random() > 0.5 ? energy : null),
          isQuest,
          tags: [cat],
          streak,
          dateCreated: new Date().toISOString(),
          subtasks: [],
          dueDate: '',
          nextDueDate: '',
          dueTime: '',
          frequency: null,
          frequencyDays: null,
          estimatedMinutes: null,
          isPriority: false,
          statusHistory: {},
        };
      });

      setTasks(demoTasks);
      Alert.alert("100 Tasks Loaded", "Your board has been populated with 100 diversified tasks for full testing!");
    };

    if (Platform.OS !== 'web') {
      Alert.alert("Load Demo Data", "This will replace ALL your existing tasks with demo data. This cannot be undone. Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Load Demo", style: "destructive", onPress: loadDemo }
      ]);
    } else {
      loadDemo();
    }
  };

  const handleAdvanceBoard = () => {
    const runAdvance = () => {
      advanceBoard();
      Alert.alert("Board Advanced! 🚀", "Priority markers cleared and day reset. Your board is ready for a fresh start.");
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Advance Board? This will reset your day and clear all priority markers.")) {
        runAdvance();
      }
      return;
    }

    Alert.alert(
      "Advance Board",
      "This will manually roll over your board to the next day and clear all current priority markers. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Advance 🚀", style: "destructive", onPress: runAdvance }
      ]
    );
  };

  const handleExportData = async () => {
    try {
      const economyData = await AsyncStorage.getItem(`${storagePrefix}economy`);
      const tasksData = await AsyncStorage.getItem(`${storagePrefix}tasks`);
      const notesData = await AsyncStorage.getItem(`${storagePrefix}notes`);
      const historyData = await AsyncStorage.getItem(`${storagePrefix}task_history`);
      const payload = {
        economy: economyData ? JSON.parse(economyData) : {},
        tasks: tasksData ? JSON.parse(tasksData) : [],
        notes: notesData ? JSON.parse(notesData) : [],
        history: historyData ? JSON.parse(historyData) : [],
      };
      // Using inline selectable text instead of native clipboard
      setExportData(JSON.stringify(payload, null, 2));
      setShowImport(false);
      Alert.alert("Backup Generated", "Scroll down to see the JSON. Long press the text to copy your backup.");
    } catch (e) {
      Alert.alert("Export Failed", "Could not export local storage.");
    }
  };

  const handleImportData = async () => {
    if (!importDataText.trim()) {
      Alert.alert("Empty input", "Please paste your exported JSON data first.");
      return;
    }
    try {
      const parsed = JSON.parse(importDataText);
      if (parsed.economy) await AsyncStorage.setItem(`${storagePrefix}economy`, JSON.stringify(parsed.economy));
      if (parsed.tasks) await AsyncStorage.setItem(`${storagePrefix}tasks`, JSON.stringify(parsed.tasks));
      if (parsed.history) await AsyncStorage.setItem(`${storagePrefix}task_history`, JSON.stringify(parsed.history));
      if (parsed.notes) await AsyncStorage.setItem(`${storagePrefix}notes`, JSON.stringify(parsed.notes));
      
      Alert.alert("Import Successful!", "Please switch profiles and switch back, or restart your app to load the new data.");
      setShowImport(false);
      setImportDataText('');
    } catch (e) {
      Alert.alert("Import Failed", "Invalid JSON format. Make sure you copied the entire block.");
    }
  };

  // Dynamic Styles
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollPad: { padding: 20, paddingBottom: 100 },
    sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 24 },
    firstSection: { marginTop: 0 },
    card: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    cardRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    cardRowLast: { borderBottomWidth: 0 },
    iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    rowDesc: { fontSize: 13, color: colors.textSecondary },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 8, paddingTop: Platform.OS === 'ios' ? 12 : 20 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  });

  return (
    <View style={styles.container}>
      <ScrollView 
        ref={scrollRef}
        contentContainerStyle={styles.scrollPad}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="settings-outline" size={24} color={colors.primary} />
            <View>
              <Text style={styles.headerTitle}>Settings</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: -2 }}>
                {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {currentTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.firstSection]}>App Settings</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Day Start Time</Text>
              <Text style={styles.rowDesc}>When 'Upcoming' tasks move to 'Pending'.</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                {[4, 5, 6, 7, 8, 9].map(h => (
                  <TouchableOpacity 
                    key={h} 
                    onPress={() => updateSettings({ dayStartTime: h })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: dayStartTime === h ? colors.primary : colors.background,
                      borderWidth: 1, borderColor: dayStartTime === h ? colors.primary : colors.border
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: dayStartTime === h ? '#fff' : colors.textPrimary }}>{h} AM</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.cardRow, styles.cardRowLast]}>
            <View style={[styles.iconBox, { backgroundColor: '#f5f3ff' }]}>
              <Ionicons name="list-outline" size={20} color="#8b5cf6" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Reset Subtasks</Text>
              <Text style={styles.rowDesc}>Return subtasks to 'Upcoming' when parent resets.</Text>
            </View>
            <Switch
              value={resetSubtasksOnParentReset}
              onValueChange={(val) => updateSettings({ resetSubtasksOnParentReset: val })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === 'ios' ? '#fff' : (resetSubtasksOnParentReset ? colors.primary : '#f4f3f4')}
            />
          </View>

          <View style={[styles.cardRow, styles.cardRowLast]}>
            <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Highlight Mode</Text>
              <Text style={styles.rowDesc}>Choose your primary theme color.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {[
                  { label: 'Default', value: null, color: isDark ? '#818cf8' : '#4f46e5' },
                  { label: 'Purple', value: '#6d28d9', color: '#6d28d9' },
                  { label: 'Deep', value: '#4c1d95', color: '#4c1d95' },
                  { label: 'Teal', value: '#0d9488', color: '#0d9488' },
                  { label: 'Emerald', value: '#059669', color: '#059669' },
                  { label: 'Rose', value: '#e11d48', color: '#e11d48' },
                  { label: 'Amber', value: '#d97706', color: '#d97706' },
                  { label: 'Sky', value: '#0284c7', color: '#0284c7' },
                ].map(c => (
                  <TouchableOpacity 
                    key={c.label}
                    onPress={() => updateSettings({ highlightColor: c.value })}
                    style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: c.color,
                      borderWidth: highlightColor === c.value ? 3 : 0,
                      borderColor: colors.textPrimary,
                      alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {highlightColor === c.value && <Ionicons name="checkmark" size={20} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.firstSection]}>Game Master Tools</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardRow} onPress={handleResetEconomy}>
            <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="skull" size={20} color={colors.red} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Reset RPG Stats</Text>
              <Text style={styles.rowDesc}>Lose all Level, XP, and Point progress.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.border} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.cardRow, styles.cardRowLast]} onPress={cheatEconomy}>
            <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="flash" size={20} color={colors.amber} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Give Dev Cheats</Text>
              <Text style={styles.rowDesc}>Instantly adds +1000 points and +10 Free Rolls.</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Data Management</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardRow} onPress={handleAdvanceBoard}>
            <View style={[styles.iconBox, { backgroundColor: '#f5f3ff' }]}>
              <Ionicons name="rocket" size={20} color="#8b5cf6" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Advance Board</Text>
              <Text style={styles.rowDesc}>Manually reset for the new day & clear Focus pins.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.border} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardRow} onPress={handleNukeTasks}>
            <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="trash" size={20} color={colors.red} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Nuke Task Board</Text>
              <Text style={styles.rowDesc}>Delete every single task permanently.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardRow} onPress={handleDemoData}>
            <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
              <Ionicons name="flask" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Load Demo Data</Text>
              <Text style={styles.rowDesc}>Populate your task lists with fake testing tasks.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardRow} onPress={handleExportData}>
            <View style={[styles.iconBox, { backgroundColor: '#d1fae5' }]}>
              <Ionicons name="download" size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Export Backup</Text>
              <Text style={styles.rowDesc}>Extracts a JSON block of your local save state.</Text>
            </View>
            <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardRow} onPress={() => { setShowImport(!showImport); setExportData(''); setShowBackups(false); }}>
            <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="push" size={20} color={colors.teal} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Import Backup</Text>
              <Text style={styles.rowDesc}>Paste a JSON block to restore your data.</Text>
            </View>
            <Ionicons name={showImport ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.cardRow, styles.cardRowLast]} onPress={async () => { 
            if (!showBackups) {
              const bks = await getBackups(storagePrefix);
              setBackups(bks);
            }
            setShowBackups(!showBackups);
            setExportData(''); 
            setShowImport(false);
          }}>
            <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
              <Ionicons name="time" size={20} color={colors.blue} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Restore Auto-Backup</Text>
              <Text style={styles.rowDesc}>Revert to a previous local save state.</Text>
            </View>
            <Ionicons name={showBackups ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {showImport && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionLabel}>Paste Backup Payload</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <TextInput
                style={{ color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13, minHeight: 120 }}
                multiline
                placeholder="Paste backup json here..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={importDataText}
                onChangeText={setImportDataText}
              />
            </View>
            <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 }} onPress={handleImportData}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Restore Data</Text>
            </TouchableOpacity>
          </View>
        )}

        {showBackups && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionLabel}>Available Auto-Backups</Text>
            {backups.length === 0 ? (
              <Text style={{ color: colors.textSecondary, marginLeft: 10 }}>No backups available yet. Auto-backups are created daily on launch.</Text>
            ) : (
              <View style={styles.card}>
                {backups.map((b, i) => (
                  <TouchableOpacity 
                    key={b.id}
                    style={[styles.cardRow, i === backups.length - 1 && styles.cardRowLast]}
                    onPress={() => {
                      const doRestore = async () => {
                        const success = await restoreBackup(storagePrefix, b.id, user);
                        if (success) {
                          Alert.alert("Restored!", "Please switch profiles and switch back, or restart your app to load the backup data.");
                          setShowBackups(false);
                        } else {
                          Alert.alert("Error", "Failed to restore backup.");
                        }
                      };
                      if (Platform.OS === 'web') {
                        if (window.confirm(`Restore ${b.label} from ${b.dateFormatted}?`)) doRestore();
                      } else {
                        Alert.alert("Restore Backup", `Restore ${b.label} from ${b.dateFormatted}? This will overwrite current data.`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Restore", style: "destructive", onPress: doRestore }
                        ]);
                      }
                    }}
                  >
                    <View style={[styles.iconBox, { backgroundColor: '#f3f4f6' }]}>
                      <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{b.label}</Text>
                      <Text style={styles.rowDesc}>{b.dateFormatted}</Text>
                    </View>
                    <Ionicons name="refresh" size={20} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {!!exportedData && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionLabel}>Raw JSON Payload</Text>
            <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, maxHeight: 300 }}>
              <ScrollView nestedScrollEnabled>
                <Text selectable={true} style={{ color: '#10b981', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 }}>
                  {exportedData}
                </Text>
              </ScrollView>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.iconBox, { backgroundColor: '#f3f4f6' }]}>
              <Ionicons name="moon" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Dark Mode</Text>
              <Text style={styles.rowDesc}>{isDark ? "Dark theme active" : "Light theme active"}</Text>
            </View>
            <Switch 
              value={isDark} 
              onValueChange={toggleTheme} 
              trackColor={{ false: '#d1d5db', true: colors.primary }}
            />
          </View>
          
          <TouchableOpacity style={[styles.cardRow, styles.cardRowLast]} onPress={() => {
            if (Platform.OS === 'web') {
              const ok = window.confirm("Sign out? Your progress stays synced in the cloud.");
              if (ok) logout();
              return;
            }
            Alert.alert(
              "Sign Out",
              "Are you sure you want to sign out? Your progress will stay synced in the cloud.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: logout }
              ]
            );
          }}>
            <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="log-out" size={20} color={colors.red} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Sign Out</Text>
              <Text style={styles.rowDesc}>Logged in as {user?.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Credits & License</Text>
        <View style={styles.card}>
          <View style={[styles.cardRow, styles.cardRowLast]}>
            <View style={[styles.iconBox, { backgroundColor: '#f3f4f6' }]}>
              <Ionicons name="cube-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>3D Dice Model</Text>
              <Text style={styles.rowDesc}>"D20 Dice" by VertexDon</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Licensed under CC BY-SA 4.0</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { textAlign: 'center', marginTop: 40, color: colors.textMuted }]}>
          {APP_VERSION}{'\n'}Local Storage Build
        </Text>

      </ScrollView>
      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </View>
  );
}
