import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const MAX_BACKUPS = 10;

/**
 * Format a Date object into a readable date-time string.
 */
function formatTimestamp(date) {
  const opts = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return date.toLocaleString(undefined, opts);
}

/**
 * Capture all relevant state from AsyncStorage for a given user prefix.
 */
async function captureState(storagePrefix) {
  try {
    const economyData = await AsyncStorage.getItem(`${storagePrefix}economy`);
    const tasksData = await AsyncStorage.getItem(`${storagePrefix}tasks`);
    const notesData = await AsyncStorage.getItem(`${storagePrefix}notes`);
    const historyData = await AsyncStorage.getItem(`${storagePrefix}task_history`);
    const routinesData = await AsyncStorage.getItem(`${storagePrefix}routines`);
    
    // Focus related
    const focusEntries = await AsyncStorage.getItem(`${storagePrefix}focus_entries`);
    const focusCats = await AsyncStorage.getItem(`${storagePrefix}focus_cats`);
    const focusGoals = await AsyncStorage.getItem(`${storagePrefix}focus_goals`);
    const timerState = await AsyncStorage.getItem(`${storagePrefix}timer_state`);
    const activeTimerKeys = await AsyncStorage.getItem(`${storagePrefix}active_timer_keys`);
    
    return {
      economy: economyData ? JSON.parse(economyData) : {},
      tasks: tasksData ? JSON.parse(tasksData) : [],
      notes: notesData ? JSON.parse(notesData) : [],
      history: historyData ? JSON.parse(historyData) : [],
      routines: routinesData ? JSON.parse(routinesData) : [],
      focus: {
        entries: focusEntries ? JSON.parse(focusEntries) : [],
        categories: focusCats ? JSON.parse(focusCats) : [],
        goals: focusGoals ? JSON.parse(focusGoals) : {},
        timerState: timerState ? JSON.parse(timerState) : {},
        activeTimerKeys: activeTimerKeys ? JSON.parse(activeTimerKeys) : []
      }
    };
  } catch (e) {
    console.error('BackupManager: Failed to capture state', e);
    return null;
  }
}

/**
 * Retrieve the current array of backups.
 */
export async function getBackups(storagePrefix) {
  try {
    const raw = await AsyncStorage.getItem(`${storagePrefix}auto_backups`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('BackupManager: Failed to get backups', e);
  }
  return [];
}

/**
 * Core function to save a new backup payload to the list and enforce MAX_BACKUPS.
 */
async function saveBackupToList(storagePrefix, newBackup) {
  let backups = await getBackups(storagePrefix);
  backups.unshift(newBackup); // Add to beginning (newest first)
  
  if (backups.length > MAX_BACKUPS) {
    backups = backups.slice(0, MAX_BACKUPS);
  }
  
  try {
    await AsyncStorage.setItem(`${storagePrefix}auto_backups`, JSON.stringify(backups));
  } catch (e) {
    console.error('BackupManager: Failed to save backup list', e);
  }
}

/**
 * Create a safety backup (e.g. before a destructive action).
 */
export async function createSafetyBackup(storagePrefix, actionLabel) {
  const data = await captureState(storagePrefix);
  if (!data) return false;
  
  const now = new Date();
  const backup = {
    id: `safety_${now.getTime()}`,
    timestamp: now.getTime(),
    label: actionLabel || 'Safety Backup',
    dateFormatted: formatTimestamp(now),
    data
  };
  
  await saveBackupToList(storagePrefix, backup);
  return true;
}

/**
 * Create a daily auto-backup (max 1 per day).
 */
export async function createDailyBackup(storagePrefix) {
  const backups = await getBackups(storagePrefix);
  const now = new Date();
  const todayDateString = now.toDateString(); // e.g., "Wed Apr 22 2026"
  
  // Check if we already have an "Auto Backup" for today
  const hasBackupToday = backups.some(b => {
    if (!b.label.includes('Auto Backup')) return false;
    const bDate = new Date(b.timestamp);
    return bDate.toDateString() === todayDateString;
  });
  
  if (hasBackupToday) {
    return false; // Already backed up today
  }
  
  const data = await captureState(storagePrefix);
  if (!data) return false;
  
  const backup = {
    id: `daily_${now.getTime()}`,
    timestamp: now.getTime(),
    label: 'Daily Auto Backup',
    dateFormatted: formatTimestamp(now),
    data
  };
  
  await saveBackupToList(storagePrefix, backup);
  return true;
}

/**
 * Restore a specific backup by writing its data back into the main AsyncStorage keys.
 * If user is provided, it also forcefully overwrites the Supabase cloud state.
 */
export async function restoreBackup(storagePrefix, backupId, user = null) {
  const backups = await getBackups(storagePrefix);
  const backup = backups.find(b => b.id === backupId);
  if (!backup) return false;
  
  try {
    const { economy, tasks, notes, history, routines, focus } = backup.data;
    const nowISO = new Date().toISOString();

    if (economy) {
      await AsyncStorage.setItem(`${storagePrefix}economy`, JSON.stringify(economy));
      if (user) {
        await supabase.from('user_economy').upsert({ user_id: user.id, data: economy, updated_at: nowISO }, { onConflict: 'user_id' });
      }
    }
    if (tasks || history) {
      if (tasks) await AsyncStorage.setItem(`${storagePrefix}tasks`, JSON.stringify(tasks));
      if (history) await AsyncStorage.setItem(`${storagePrefix}task_history`, JSON.stringify(history));
      if (user) {
        const tasksPayload = { tasks: tasks || [], history: history || [], breakTimer: null };
        await supabase.from('user_tasks').upsert({ user_id: user.id, data: tasksPayload, updated_at: nowISO }, { onConflict: 'user_id' });
      }
    }
    if (notes) {
      await AsyncStorage.setItem(`${storagePrefix}notes`, JSON.stringify(notes));
      if (user) {
        await supabase.from('user_notes').upsert({ user_id: user.id, data: notes, updated_at: nowISO }, { onConflict: 'user_id' });
      }
    }
    if (routines) {
      await AsyncStorage.setItem(`${storagePrefix}routines`, JSON.stringify(routines));
      if (user) {
        await supabase.from('user_routines').upsert({ user_id: user.id, data: routines, updated_at: nowISO }, { onConflict: 'user_id' });
      }
    }
    if (focus) {
      if (focus.entries) await AsyncStorage.setItem(`${storagePrefix}focus_entries`, JSON.stringify(focus.entries));
      if (focus.categories) await AsyncStorage.setItem(`${storagePrefix}focus_cats`, JSON.stringify(focus.categories));
      if (focus.goals) await AsyncStorage.setItem(`${storagePrefix}focus_goals`, JSON.stringify(focus.goals));
      if (focus.timerState) await AsyncStorage.setItem(`${storagePrefix}timer_state`, JSON.stringify(focus.timerState));
      if (focus.activeTimerKeys) await AsyncStorage.setItem(`${storagePrefix}active_timer_keys`, JSON.stringify(focus.activeTimerKeys));
      await AsyncStorage.setItem(`${storagePrefix}focus_last_updated`, String(Date.now()));
      
      if (user) {
        await supabase.from('user_focus').upsert({ user_id: user.id, data: focus, updated_at: nowISO }, { onConflict: 'user_id' });
      }
    }
    return true;
  } catch (e) {
    console.error('BackupManager: Failed to restore backup', e);
    return false;
  }
}
