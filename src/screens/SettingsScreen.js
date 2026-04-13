import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEconomy } from '../lib/EconomyContext';
import { useTasks } from '../lib/TasksContext';
import { useTheme } from '../lib/ThemeContext';
import { useProfile } from '../lib/ProfileContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScrollToTop from '../components/ScrollToTop';

export default function SettingsScreen() {
  const { resetEconomy, cheatEconomy } = useEconomy();
  const { setTasks } = useTasks();
  const { isDark, toggleTheme, colors } = useTheme();
  const { logout, user, storagePrefix } = useProfile();
  const [exportedData, setExportData] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importDataText, setImportDataText] = useState('');
  
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

  const handleNukeTasks = () => {
    console.log("Nuke button clicked");
    if (Platform.OS === 'web') {
      const ok = window.confirm("Delete all tasks permanently?");
      if (ok) setTasks([]);
      return;
    }
    Alert.alert("Nuke Board", "Delete all tasks?", [
      { text: "Cancel" },
      { text: "Delete", onPress: () => setTasks([]) }
    ]);
  };

  const handleDemoData = () => {
    const categories = ['work', 'health', 'finance', 'chores', 'social', 'hobby', 'studies', 'self-care'];
    const energyLevels = ['low', 'medium', 'high'];
    const statuses = ['pending', 'active', 'done', 'missed', 'did_my_best', 'upcoming', 'first_step'];
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
        isPriority: false,
      };
    });

    setTasks(demoTasks);
    Alert.alert("100 Tasks Loaded", "Your board has been populated with 100 diversified tasks for full testing!");
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
    scrollPad: { padding: 20, paddingBottom: 60 },
    sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 24 },
    firstSection: { marginTop: 0 },
    card: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    cardRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    cardRowLast: { borderBottomWidth: 0 },
    iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
    rowDesc: { fontSize: 13, color: colors.textSecondary },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 8 },
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
            <Text style={styles.headerTitle}>Settings</Text>
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

          <TouchableOpacity style={[styles.cardRow, styles.cardRowLast]} onPress={() => { setShowImport(!showImport); setExportData(''); }}>
            <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="push" size={20} color={colors.teal} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Import Backup</Text>
              <Text style={styles.rowDesc}>Paste a JSON block to restore your data.</Text>
            </View>
            <Ionicons name={showImport ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
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

        <Text style={[styles.sectionLabel, { textAlign: 'center', marginTop: 40, color: colors.textMuted }]}>
          ADH'DICE v1.0{'\n'}Local Storage Build
        </Text>

      </ScrollView>
      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </View>
  );
}
