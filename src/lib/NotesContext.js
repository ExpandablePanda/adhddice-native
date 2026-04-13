import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const NotesContext = createContext();

export function NotesProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  
  const lastLocalChangeRef = useRef(0);
  const isRemoteUpdateRef  = useRef(false);
  const broadcastRef       = useRef(null);

  // BroadcastChannel for web multi-tab sync
  useEffect(() => {
    if (Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
      const channelName = `notes_sync_${user?.id || 'anon'}`;
      broadcastRef.current = new BroadcastChannel(channelName);
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'NOTES_UPDATE' && event.data.storagePrefix === storagePrefix) {
          isRemoteUpdateRef.current = true;
          setNotes(event.data.notes);
        }
      };
    }
    return () => { if (broadcastRef.current) broadcastRef.current.close(); };
  }, [user?.id, storagePrefix]);

  // 1. Initial Load
  useEffect(() => {
    async function loadData() {
      setLoaded(false);
      const stored = await AsyncStorage.getItem(`${storagePrefix}notes`);
      if (stored) {
        try { setNotes(JSON.parse(stored)); } catch(e) {}
      }

      if (user) {
        try {
          const { data } = await supabase
            .from('user_notes')
            .select('data, updated_at')
            .eq('user_id', user.id)
            .single();

          if (data?.data) {
            isRemoteUpdateRef.current = true;
            setNotes(data.data);
          }
        } catch (e) {
          console.log('Notes sync skipped', e);
        }
      }
      setLoaded(true);
    }
    loadData();
  }, [storagePrefix, user]);

  // 1b. Real-time
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt:user_notes:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notes', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new?.data) {
            const remoteTime = new Date(payload.new.updated_at).getTime();
            if (remoteTime > lastLocalChangeRef.current + 1000) {
              isRemoteUpdateRef.current = true;
              setNotes(payload.new.data);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // 2. Save
  useEffect(() => {
    if (!loaded || !user) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    lastLocalChangeRef.current = Date.now();

    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ type: 'NOTES_UPDATE', notes, storagePrefix });
    }

    const saveData = async () => {
      const dataToSave = notes;
      await AsyncStorage.setItem(`${storagePrefix}notes`, JSON.stringify(dataToSave));

      try {
        const { error } = await supabase
          .from('user_notes')
          .upsert({ user_id: user.id, data: dataToSave, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (e) {
        console.error('Notes cloud save failed', e);
      }
    };

    const timeoutId = setTimeout(saveData, 1500);
    const handleUnload = () => saveData();
    if (Platform.OS === 'web') window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearTimeout(timeoutId);
      if (Platform.OS === 'web') window.removeEventListener('beforeunload', handleUnload);
    };
  }, [notes, loaded, user, storagePrefix]);

  const addNote = (title, content, tags = []) => {
    const newNote = {
      id: Date.now().toString(),
      title,
      content,
      tags,
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: '#ffffff'
    };
    setNotes(prev => [newNote, ...prev]);
    return newNote;
  };

  const updateNote = (id, updates) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n));
  };

  const deleteNote = (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  if (!loaded) return null;

  return (
    <NotesContext.Provider value={{ notes, setNotes, addNote, updateNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) throw new Error('useNotes must be used within NotesProvider');
  return context;
}

