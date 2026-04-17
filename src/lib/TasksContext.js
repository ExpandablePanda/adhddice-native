import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { useSettings } from './SettingsContext';
import { supabase } from './supabase';

export const STATUSES = {
  first_step:  { label: '1st Step',    color: '#8b5cf6', icon: 'footsteps-outline', next: 'active' },
  upcoming:    { label: 'Upcoming',    color: '#64748b', icon: 'calendar-outline', next: 'pending' },
  pending:     { label: 'Pending',     color: '#f59e0b', icon: 'time-outline', next: 'active' },
  active:      { label: 'In Progress', color: '#eab308', icon: 'play-outline', next: 'did_my_best' },
  did_my_best: { label: 'Did My Best', color: '#0ea5e9', icon: 'star-outline', next: 'missed' },
  missed:      { label: 'Missed',      color: '#ef4444', icon: 'close-circle-outline', next: 'done' },
  done:        { label: 'Done',        color: '#10b981', icon: 'checkmark-circle-outline', next: 'upcoming' },
};

export const STATUS_ORDER = ['first_step', 'active', 'pending', 'missed', 'upcoming', 'done', 'did_my_best'];

const TasksContext = createContext();

export function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes common date formats (MM/DD/YYYY or YYYY-MM-DD) to YYYY-MM-DD
 * This ensures string comparisons (like dueDate <= todayKey) work reliably.
 */
export function normalizeDateKey(d) {
  if (!d || typeof d !== 'string') return d;
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length === 3) {
      // Handle both M/D/YYYY and MM/DD/YYYY
      const m = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${day}`;
    }
  }
  return d;
}

export function isSameDay(d1, d2) {
  return getLocalDateKey(d1) === getLocalDateKey(d2);
}

export function calculateTaskMissedStreak(history = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    const s = history[key];
    
    // If today is not marked yet, we don't count it for MISSED streak yet
    if (i === 0 && !s) continue;

    if (s === 'missed') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function calculateTaskStreak(history = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    const s = history[key];
    
    if (s === 'done' || s === 'did_my_best') {
      streak++;
    } else if (i === 0) {
      // today might not be done yet, skip it but DON'T break
      continue;
    } else {
      // Any other status (missed, pending, etc) on a past day breaks the streak
      break;
    }
  }
  return streak;
}

export function TasksProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [tasks, setTasks] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Break Timer State
  const [breakTimer, setBreakTimer] = useState(null); // { remainingSeconds: number, totalSeconds: number }
  
  // Track the timestamp of the last local change and the last saved state hash
  const lastLocalChangeRef = useRef(0);
  const isRemoteUpdateRef  = useRef(false);
  const broadcastRef       = useRef(null);

  // Initialize BroadcastChannel for web multi-tab sync
  useEffect(() => {
    if (Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
      const channelName = `tasks_sync_${user?.id || 'anon'}`;
      broadcastRef.current = new BroadcastChannel(channelName);
      
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'TASKS_UPDATE' && event.data.storagePrefix === storagePrefix) {
          isRemoteUpdateRef.current = true;
          setTasks(event.data.tasks);
          if (event.data.history) setTaskHistory(event.data.history);
          if (event.data.breakTimer !== undefined) setBreakTimer(event.data.breakTimer);
        }
      };
    }
    return () => {
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, [user?.id, storagePrefix]);

  // 1. Initial Load (Local + Cloud merge)
  useEffect(() => {
    async function loadData() {
      setLoaded(false);
      
      let initialTasks = [];
      let initialHistory = [];
      
      // A. Load local state first
      try {
        const storedTasks = await AsyncStorage.getItem(`${storagePrefix}tasks`);
        const storedHistory = await AsyncStorage.getItem(`${storagePrefix}task_history`);
        const storedBreak = await AsyncStorage.getItem(`${storagePrefix}break_timer`);
        
        if (storedTasks) {
          const parsed = JSON.parse(storedTasks);
          if (Array.isArray(parsed)) initialTasks = parsed.filter(Boolean);
        }
        if (storedHistory) {
          const parsed = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) initialHistory = parsed.filter(Boolean);
        }
        if (storedBreak) {
          try {
            const parsed = JSON.parse(storedBreak);
            if (parsed && parsed.endTime) {
              const remaining = Math.max(0, Math.floor((parsed.endTime - Date.now()) / 1000));
              if (remaining > 0) {
                setBreakTimer({ ...parsed, remainingSeconds: remaining });
              } else {
                setBreakTimer(null);
              }
            } else if (parsed && parsed.remainingSeconds > 0) {
              // Legacy fallback
              setBreakTimer(parsed);
            }
          } catch (e) {}
        }
      } catch (e) {
        console.error('Failed to load local tasks', e);
      }
      
      setTasks(initialTasks);
      setTaskHistory(initialHistory);

      // B. Cloud sync (Cloud is the source of truth on startup)
      if (user) {
        try {
          const { data, error } = await supabase
            .from('user_tasks')
            .select('data, updated_at')
            .eq('user_id', user.id)
            .single();

          if (data?.data) {
            isRemoteUpdateRef.current = true;
            const cloud = data.data;
            if (Array.isArray(cloud)) {
              setTasks(cloud.filter(Boolean));
            } else if (cloud.tasks) {
              setTasks(cloud.tasks.filter(Boolean));
              if (cloud.history) setTaskHistory(cloud.history.filter(Boolean));
              
              // Handle break timer from cloud
              if (cloud.breakTimer && cloud.breakTimer.endTime) {
                const remaining = Math.max(0, Math.floor((cloud.breakTimer.endTime - Date.now()) / 1000));
                if (remaining > 0) {
                  setBreakTimer({ ...cloud.breakTimer, remainingSeconds: remaining });
                } else {
                  setBreakTimer(null);
                }
              } else if (cloud.breakTimer === null) {
                // cloud explicitly says it's empty
                setBreakTimer(null);
              }
            }
          }
        } catch (e) {
          console.log('Tasks initial cloud sync skipped or failed', e);
        }
      }
      
      setLoaded(true);
    }
    loadData();
  }, [storagePrefix, user]);

  // 1b. Real-time Subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`rt:user_tasks:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_tasks', filter: `user_id=eq.${user.id}` }, 
      (payload) => {
        if (payload.new?.data) {
          const remoteTime = new Date(payload.new.updated_at).getTime();
          
          // Only apply if the remote change is newer than our last LOCAL change
          // We allow a small 1s buffer for clock skew
          if (remoteTime > lastLocalChangeRef.current + 1000) {
            isRemoteUpdateRef.current = true;
            if (Array.isArray(payload.new.data)) {
              setTasks(payload.new.data.filter(Boolean));
            } else if (payload.new.data.tasks) {
              setTasks(payload.new.data.tasks.filter(Boolean));
              if (payload.new.data.history) setTaskHistory(payload.new.data.history.filter(Boolean));
              
              const remoteTimer = payload.new.data.breakTimer;
              if (remoteTimer && remoteTimer.endTime) {
                const remaining = Math.max(0, Math.floor((remoteTimer.endTime - Date.now()) / 1000));
                if (remaining > 0) {
                  setBreakTimer({ ...remoteTimer, remainingSeconds: remaining });
                } else {
                  setBreakTimer(null);
                }
              } else {
                // If remote says null (or undefined), stop local timer
                setBreakTimer(null);
              }
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Track state in refs for immediate sync access
  const stateRef = useRef({ tasks, taskHistory, breakTimer });
  useEffect(() => {
    stateRef.current = { tasks, taskHistory, breakTimer };
  }, [tasks, taskHistory, breakTimer]);

  const saveTasksData = useCallback(async () => {
    if (!loaded) return;
    const { tasks: t, taskHistory: th, breakTimer: bt } = stateRef.current;
    
    const timerToSave = bt ? { ...bt, lastUpdated: Date.now() } : null;

    // Broadcast to other tabs immediately
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        type: 'TASKS_UPDATE',
        tasks: t,
        history: th,
        breakTimer: timerToSave,
        storagePrefix
      });
    }

    // Always save locally
    await AsyncStorage.setItem(`${storagePrefix}tasks`, JSON.stringify(t));
    await AsyncStorage.setItem(`${storagePrefix}task_history`, JSON.stringify(th));
    if (timerToSave) {
      await AsyncStorage.setItem(`${storagePrefix}break_timer`, JSON.stringify(timerToSave));
    } else {
      await AsyncStorage.removeItem(`${storagePrefix}break_timer`);
    }

    // Push to cloud only when logged in
    if (user) {
      setIsSyncing(true);
      try {
        const { error } = await supabase
          .from('user_tasks')
          .upsert({
            user_id: user.id,
            data: { tasks: t, history: th, breakTimer: timerToSave },
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) throw error;
      } catch (err) {
        console.error('Tasks cloud save failed', err);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [loaded, user, storagePrefix]);

  const syncTimeoutRef = useRef(null);
  const triggerTasksSync = useCallback((immediate = false) => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    if (immediate) {
      saveTasksData();
    } else {
      syncTimeoutRef.current = setTimeout(saveTasksData, 1500);
    }
  }, [saveTasksData]);

  // 2. Save Data (Auto-debounced for general state changes)
  useEffect(() => {
    if (!loaded) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    lastLocalChangeRef.current = Date.now();
    triggerTasksSync(false); // Debounce by default

    const handleUnload = () => saveTasksData();
    if (Platform.OS === 'web') window.addEventListener('pagehide', handleUnload);

    return () => {
      if (Platform.OS === 'web') window.removeEventListener('pagehide', handleUnload);
    };
  }, [tasks, taskHistory, breakTimer, loaded, user, storagePrefix, triggerTasksSync, saveTasksData]);

  // 3. Day-Start Transition Logic
  const { dayStartTime } = useSettings();
  useEffect(() => {
    if (!loaded) return;

    function processTransitions() {
      const now = new Date();
      const hour = now.getHours();
      const todayKey = getLocalDateKey(now);
      
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getLocalDateKey(yesterday);

      let changed = false;
      const nextTasks = tasks.map(t => {
        let newTask = { ...t };
        const hist = t.statusHistory || {};
        const lowFreq = t.frequency?.toLowerCase() || '';
        
        // A. Catch missed tasks from yesterday
        if (!hist[yesterdayKey]) {
          const wasDaily = lowFreq === 'daily';
          const normalizedDue = normalizeDateKey(t.dueDate);
          const wasWeeklyToday = lowFreq === 'weekly' && (t.weeklyMode === 'fixed_day' || !t.weeklyMode) && t.weeklyDay === yesterday.getDay();
          const wasDueYesterday = normalizedDue && normalizedDue <= yesterdayKey;

          if (wasDaily || wasWeeklyToday || wasDueYesterday) {
             const updatedHist = { ...hist, [yesterdayKey]: 'missed' };
             newTask.statusHistory = updatedHist;
             changed = true;
          }
        }

        // B. 6 AM (or dayStartTime) transition for today
        if (hour >= dayStartTime) {
          if (newTask.status === 'upcoming') {
            const isDoneToday = hist[todayKey] === 'done' || hist[todayKey] === 'did_my_best';
            
            // Check if it's due today by schedule
            const isDaily = lowFreq === 'daily';
            const isWeeklyToday = lowFreq === 'weekly' && (t.weeklyMode === 'fixed_day' || !t.weeklyMode) && t.weeklyDay === now.getDay();
            
            const normalizedDue = normalizeDateKey(t.dueDate);
            const isDueByDate = normalizedDue && normalizedDue <= todayKey;

            // Only auto-activate if it matches a schedule OR an explicit due date
            const isDueToday = isDaily || isWeeklyToday || isDueByDate;
            
            if (isDueToday && !isDoneToday) {
               newTask.status = 'pending';
               changed = true;
            }
          }
        }
        
        return newTask;
      });

      if (changed) {
        setTasks(nextTasks);
      }
    }

    processTransitions();
    // Check every hour
    const interval = setInterval(processTransitions, 1000 * 60 * 60);
    return () => clearInterval(interval);
  }, [loaded, tasks, dayStartTime]);

  const logTaskEvent = (task, status) => {
    const event = {
      id: Date.now().toString(),
      taskId: task.id,
      title: task.title,
      status: status,
      energy: task.energy,
      tags: task.tags || [],
      timestamp: new Date().toISOString()
    };
    setTaskHistory(prev => [event, ...prev].slice(0, 1000));
  };

  const startBreak = (minutes, prizeInfo = null) => {
    const seconds = Math.floor(minutes * 60);
    const endTime = Date.now() + (seconds * 1000);
    setBreakTimer({ 
      remainingSeconds: seconds, 
      endTime: endTime,
      totalSeconds: seconds, 
      linkedPrize: prizeInfo 
    });
    triggerTasksSync(true); // Immediate sync for start
  };

  const adjustBreakTime = (deltaSeconds) => {
    setBreakTimer(prev => {
      if (!prev) return null;
      const newRemaining = Math.max(0, prev.remainingSeconds + deltaSeconds);
      if (newRemaining <= 0) return null;
      return { 
        ...prev, 
        remainingSeconds: newRemaining, 
        endTime: Date.now() + (newRemaining * 1000),
        totalSeconds: Math.max(prev.totalSeconds, newRemaining) 
      };
    });
    triggerTasksSync(true); // Immediate sync for adjust
  };

  const linkPrizeToBreak = (prizeInfo) => {
    setBreakTimer(prev => {
      if (!prev) return null;
      // prizeInfo can be { name: string, count: number } or null
      return { ...prev, linkedPrize: prizeInfo };
    });
    triggerTasksSync(true); // Immediate sync for link
  };

  // Removed global ticking to allow stable state for persistence.
  // Remaining time is now calculated by UI components from endTime.
  useEffect(() => {
    if (breakTimer && breakTimer.endTime) {
      const now = Date.now();
      if (now >= breakTimer.endTime) {
         setBreakTimer(null);
         triggerTasksSync(true); // Immediate sync for auto-finish
      }
    }
  }, [breakTimer?.endTime, triggerTasksSync]);

  if (!loaded) return null;

  return (
    <TasksContext.Provider value={{ 
      tasks, setTasks, 
      taskHistory, logTaskEvent, 
      isSyncing,
      breakTimer, setBreakTimer, startBreak,
      adjustBreakTime, linkPrizeToBreak
    }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used within TasksProvider');
  return context;
}

