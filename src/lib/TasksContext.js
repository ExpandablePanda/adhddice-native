import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { useSettings } from './SettingsContext';
import { supabase } from './supabase';
import { useEconomy } from './EconomyContext';

export const STATUSES = {
  first_step:  { label: '1st Step',    color: '#8b5cf6', icon: 'footsteps-outline', next: 'active' },
  upcoming:    { label: 'Upcoming',    color: '#64748b', icon: 'calendar-outline', next: 'pending' },
  pending:     { label: 'Pending',     color: '#f97316', icon: 'time-outline', next: 'active' },
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
 * Returns the "App Day" key based on dayStartTime (default 6 AM).
 * If it's 2 AM, it returns yesterday's date key.
 */
export function getAppDayKey(dayStartTime = 6) {
  const now = new Date();
  if (now.getHours() < dayStartTime) {
    now.setDate(now.getDate() - 1);
  }
  return getLocalDateKey(now);
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

export function calculateTaskMissedStreak(history = {}, dayStartTime = 6) {
  const today = new Date();
  if (today.getHours() < dayStartTime) {
    today.setDate(today.getDate() - 1);
  }
  today.setHours(0, 0, 0, 0);
  
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    const s = history[key];
    
    if (i === 0 && !s) continue;

    if (s === 'missed') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function calculateTaskStreak(history = {}, dayStartTime = 6) {
  const today = new Date();
  if (today.getHours() < dayStartTime) {
    today.setDate(today.getDate() - 1);
  }
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    const s = history[key];
    
    if (i === 0 && !s) continue;

    if (s === 'done' || s === 'did_my_best') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── Shared Task Helpers ──────────────────────────────────────────────────────

export function mapSubtasks(subtasks = [], fn) {
  return subtasks.map(s => fn({ ...s, subtasks: mapSubtasks(s.subtasks || [], fn) }));
}

export function calcNextDueDate(task, dayStartTime = 6) {
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

export function TasksProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const { unlockPrizeByTaskId } = useEconomy();
  const [tasks, setTasks] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Break Timer State
  const [breakTimer, setBreakTimer] = useState(null); // { remainingSeconds: number, totalSeconds: number }
  const [gamesUnlockEndTime, setGamesUnlockEndTime] = useState(0);
  
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
          if (event.data.gamesUnlockEndTime !== undefined) setGamesUnlockEndTime(event.data.gamesUnlockEndTime);
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
        const storedUnlock = await AsyncStorage.getItem(`${storagePrefix}games_unlock_end_time`);
        
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
        if (storedUnlock) {
          setGamesUnlockEndTime(parseInt(storedUnlock));
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
              if (cloud.gamesUnlockEndTime) {
                setGamesUnlockEndTime(cloud.gamesUnlockEndTime);
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
              if (payload.new.data.gamesUnlockEndTime !== undefined) {
                setGamesUnlockEndTime(payload.new.data.gamesUnlockEndTime);
              }
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Track state in refs for immediate sync access
  const stateRef = useRef({ tasks, taskHistory, breakTimer, gamesUnlockEndTime });
  const needsImmediateSyncRef = useRef(false);

  useEffect(() => {
    stateRef.current = { tasks, taskHistory, breakTimer, gamesUnlockEndTime };
  }, [tasks, taskHistory, breakTimer, gamesUnlockEndTime]);

  const saveTasksData = useCallback(async () => {
    if (!loaded) return;
    const { tasks: t, taskHistory: th, breakTimer: bt, gamesUnlockEndTime: guet } = stateRef.current;
    
    const timerToSave = bt ? { ...bt, lastUpdated: Date.now() } : null;

    // Broadcast to other tabs immediately
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        type: 'TASKS_UPDATE',
        tasks: t,
        history: th,
        breakTimer: timerToSave,
        gamesUnlockEndTime: guet,
        storagePrefix
      });
    }

    // Always save locally
    await AsyncStorage.setItem(`${storagePrefix}tasks`, JSON.stringify(t));
    await AsyncStorage.setItem(`${storagePrefix}task_history`, JSON.stringify(th));
    await AsyncStorage.setItem(`${storagePrefix}games_unlock_end_time`, String(guet));
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
            data: { tasks: t, history: th, breakTimer: timerToSave, gamesUnlockEndTime: guet },
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
    
    // Check if any action requested an immediate sync (e.g., timer start/stop)
    if (needsImmediateSyncRef.current) {
      needsImmediateSyncRef.current = false;
      triggerTasksSync(true);
    } else {
      triggerTasksSync(false); // Debounce by default (1.5s)
    }

    const handleUnload = () => saveTasksData();
    if (Platform.OS === 'web') window.addEventListener('pagehide', handleUnload);

    return () => {
      if (Platform.OS === 'web') window.removeEventListener('pagehide', handleUnload);
    };
  }, [tasks, taskHistory, breakTimer, gamesUnlockEndTime, loaded, user, storagePrefix, triggerTasksSync, saveTasksData]);

  // 3. Day-Start Transition Logic
  const { dayStartTime } = useSettings();
  useEffect(() => {
    if (!loaded) return;

    function processTransitions() {
      const now = new Date();
      const hour = now.getHours();
      
      // Calculate keys based on Day Start logic
      // If hour < dayStartTime, "today" is actually yesterday calendar-wise.
      // The "active day" that just ended is "day before yesterday".
      // But for marking MISSED tasks from the day that just passed:
      // If we are at 1 AM (and dayStartTime is 6), the "active day" is still today's calendar date - 1.
      // We only want to close the book on that day when we hit 6 AM.
      
      const appTodayKey = getAppDayKey(dayStartTime);
      
      // Calendar-wise yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getLocalDateKey(yesterday);

      let changed = false;
      const nextTasks = tasks.map(t => {
        let newTask = { ...t };
        const hist = t.statusHistory || {};
        const lowFreq = t.frequency?.toLowerCase() || '';
        
        // A. Catch missed tasks from yesterday calendar-date
        // ONLY if we have hit the dayStartTime. 
        // If it's 1 AM, we shouldn't be auto-marking yesterday as missed yet.
        if (hour >= dayStartTime && !hist[yesterdayKey]) {
          const wasDaily = lowFreq === 'daily';
          const normalizedDue = normalizeDateKey(t.dueDate);
          const wasWeeklyToday = lowFreq === 'weekly' && (t.weeklyMode === 'fixed_day' || !t.weeklyMode) && t.weeklyDay === yesterday.getDay();
          const wasDueYesterday = normalizedDue && normalizedDue <= yesterdayKey;

          if (wasDaily || wasWeeklyToday || wasDueYesterday) {
             const updatedHist = { ...hist, [yesterdayKey]: 'missed' };
             newTask.statusHistory = updatedHist;
             newTask.streak = calculateTaskStreak(updatedHist, dayStartTime);
             changed = true;
          }
        }

        // B. 6 AM (or dayStartTime) transition for today
        if (hour >= dayStartTime) {
          if (newTask.status === 'upcoming') {
            const isDoneToday = hist[appTodayKey] === 'done' || hist[appTodayKey] === 'did_my_best';
            
            // Check if it's due today by schedule
            const isDaily = lowFreq === 'daily';
            const isWeeklyToday = lowFreq === 'weekly' && (t.weeklyMode === 'fixed_day' || !t.weeklyMode) && t.weeklyDay === now.getDay();
            
            const normalizedDue = normalizeDateKey(t.dueDate);
            const isDueByDate = normalizedDue && normalizedDue <= appTodayKey;

            // Only auto-activate if it matches a schedule OR an explicit due date
            const isDueToday = isDaily || isWeeklyToday || isDueByDate;
            
            if (isDueToday && !isDoneToday) {
               newTask.status = 'pending';
               newTask.subtasks = mapSubtasks(t.subtasks || [], s => {
                 if (s.status === 'upcoming') return { ...s, status: 'pending' };
                 return s;
               });
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
    needsImmediateSyncRef.current = true;
    setBreakTimer({ 
      remainingSeconds: seconds, 
      endTime: endTime,
      totalSeconds: seconds, 
      linkedPrize: prizeInfo 
    });
  };

  const adjustBreakTime = (deltaSeconds) => {
    needsImmediateSyncRef.current = true;
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
  };

  const linkPrizeToBreak = (prizeInfo) => {
    needsImmediateSyncRef.current = true;
    setBreakTimer(prev => {
      if (!prev) return null;
      // prizeInfo can be { name: string, count: number } or null
      return { ...prev, linkedPrize: prizeInfo };
    });
  };

  // Removed global ticking to allow stable state for persistence.
  // Remaining time is now calculated by UI components from endTime.
  useEffect(() => {
    if (breakTimer && breakTimer.endTime) {
      const now = Date.now();
      if (now >= breakTimer.endTime) {
         needsImmediateSyncRef.current = true;
         setBreakTimer(null);
      }
    }
  }, [breakTimer?.endTime]);

  const completeTask = useCallback((taskId, intentStatus = 'done', dateKey = null, reward = null) => {
    const today = getAppDayKey(dayStartTime);
    const historyKey = dateKey || today;
    const isCompletion = intentStatus === 'done' || intentStatus === 'did_my_best';

    setTasks(prev => prev.map(t => {
      if (String(t.id) !== String(taskId)) return t;

      const updatedHistory = { ...(t.statusHistory || {}), [historyKey]: intentStatus };
      const newStreak = calculateTaskStreak(updatedHistory, dayStartTime);
      
      let nextData = {};
      if (isCompletion && t.frequency) {
        // RECURRING ROLLOVER
        const nextDate = calcNextDueDate(t, dayStartTime);
        nextData = {
          status: 'upcoming',
          dueDate: nextDate,
          completedAt: null,
          gainedReward: null,
          subtasks: mapSubtasks(t.subtasks || [], s => ({ ...s, status: 'upcoming' }))
        };
      } else if (isCompletion) {
        // ONE-OFF COMPLETION
        nextData = {
          status: intentStatus,
          completedAt: new Date().toISOString(),
          gainedReward: reward
        };
      } else {
        // STATUS CHANGE ONLY
        nextData = {
          status: intentStatus
        };
        // Propagate 'missed' or 'pending' status to subtasks if they aren't done
        if (intentStatus === 'missed' || intentStatus === 'pending') {
          nextData.subtasks = mapSubtasks(t.subtasks || [], s => {
            if (s.status !== 'done' && s.status !== 'did_my_best') {
              return { ...s, status: intentStatus };
            }
            return s;
          });
        }
      }

      const updated = {
        ...t,
        ...nextData,
        statusHistory: updatedHistory,
        streak: newStreak
      };

      if (isCompletion) {
        unlockPrizeByTaskId(t.id, tasks);
        if (t.energy === 'low') {
          setGamesUnlockEndTime(Date.now() + 3600000);
          needsImmediateSyncRef.current = true;
        }
      }

      logTaskEvent(updated, intentStatus);
      return updated;
    }));
  }, [dayStartTime, setTasks, logTaskEvent]);

  if (!loaded) return null;

  return (
    <TasksContext.Provider value={{ 
      tasks, setTasks, 
      taskHistory, logTaskEvent, 
      isSyncing,
      breakTimer, setBreakTimer, startBreak,
      adjustBreakTime, linkPrizeToBreak,
      gamesUnlockEndTime, setGamesUnlockEndTime,
      completeTask
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

