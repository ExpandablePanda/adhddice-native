import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const TasksContext = createContext();

export function TasksProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [tasks, setTasks] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
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
          setTaskHistory(event.data.history);
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
      
      // A. Load from Local Storage immediately
      const storedTasks = await AsyncStorage.getItem(`${storagePrefix}tasks`);
      const storedHistory = await AsyncStorage.getItem(`${storagePrefix}task_history`);
      
      let initialTasks = [];
      let initialHistory = [];
      
      if (storedTasks) initialTasks = JSON.parse(storedTasks);
      if (storedHistory) initialHistory = JSON.parse(storedHistory);
      
      // Set local state quickly for better UX
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
            // Only update if cloud has content
            isRemoteUpdateRef.current = true;
            if (Array.isArray(data.data)) {
              setTasks(data.data);
            } else if (data.data.tasks) {
              setTasks(data.data.tasks);
              if (data.data.history) setTaskHistory(data.data.history);
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
              setTasks(payload.new.data);
            } else if (payload.new.data.tasks) {
              setTasks(payload.new.data.tasks);
              if (payload.new.data.history) setTaskHistory(payload.new.data.history);
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // 2. Save Data (Debounced)
  useEffect(() => {
    if (!loaded || !user) return;

    // If this update came from the cloud or broadcast, don't trigger a re-save
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    // Mark that we have changed something locally
    lastLocalChangeRef.current = Date.now();

    // Broadcast to other tabs immediately
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        type: 'TASKS_UPDATE',
        tasks,
        history: taskHistory,
        storagePrefix
      });
    }

    const saveData = async () => {
      const dataToSave = tasks;
      const historyToSave = taskHistory;
      
      // Save local
      await AsyncStorage.setItem(`${storagePrefix}tasks`, JSON.stringify(dataToSave));
      await AsyncStorage.setItem(`${storagePrefix}task_history`, JSON.stringify(historyToSave));

      // Push to cloud
      setIsSyncing(true);
      try {
        const { error } = await supabase
          .from('user_tasks')
          .upsert({ 
            user_id: user.id, 
            data: { tasks: dataToSave, history: historyToSave },
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        
        if (error) throw error;
      } catch (e) {
        console.error('Tasks cloud save failed', e);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(saveData, 1500); // 1.5s debounce for multi-device stability
    
    // Add a backup "Save on Exit" for web
    const handleUnload = () => saveData();
    if (Platform.OS === 'web') window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearTimeout(timeoutId);
      if (Platform.OS === 'web') window.removeEventListener('beforeunload', handleUnload);
    };
  }, [tasks, taskHistory, loaded, user, storagePrefix]);

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

  if (!loaded) return null;

  return (
    <TasksContext.Provider value={{ tasks, setTasks, taskHistory, logTaskEvent, isSyncing }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used within TasksProvider');
  return context;
}

