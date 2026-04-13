import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Modal, Alert, Dimensions,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNotes } from '../lib/NotesContext';
import { useTasks } from '../lib/TasksContext';
import { useTheme } from '../lib/ThemeContext';
import ScrollToTop from '../components/ScrollToTop';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Components ───────────────────────────────────────────────────────────────

function NoteCard({ note, onPress }) {
  const { colors } = useTheme();
  
  // Basic multi-column logic: calculate a random height for masonry feel 
  // without needing a heavy library.
  const hash = note.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const minHeight = 100;
  const extraHeight = (hash % 60); // Variation
  const height = minHeight + extraHeight + (note.content.length / 5);

  return (
    <TouchableOpacity 
      style={[styles.noteCard, { backgroundColor: colors.surface, height: Math.min(height, 220) }]} 
      onPress={() => onPress(note)}
      activeOpacity={0.7}
    >
      <View style={styles.noteHeader}>
        {note.isPinned && <Ionicons name="pin" size={14} color={colors.primary} style={{ marginRight: 4 }} />}
        <Text style={[styles.noteTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {note.title || 'Untitled'}
        </Text>
      </View>
      <Text style={[styles.noteContent, { color: colors.textSecondary }]} numberOfLines={6}>
        {note.content}
      </Text>
      {note.tags && note.tags.length > 0 && (
        <View style={styles.noteTagRow}>
          {note.tags.slice(0, 2).map((tag, i) => (
            <View key={i} style={styles.noteTagSmall}><Text style={styles.noteTagTextSmall}>#{tag}</Text></View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotesScreen() {
  const { colors } = useTheme();
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  const { setTasks } = useTasks();
  
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };
  
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const [editingNote, setEditingNote] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  // ── Logic ───────────────────────────────────────────────────────────────────

  const allTags = useMemo(() => {
    const tags = new Set(['All']);
    notes.forEach(n => n.tags?.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let list = [...notes];
    if (activeTag !== 'All') {
      list = list.filter(n => n.tags?.includes(activeTag));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.content.toLowerCase().includes(q)
      );
    }
    // Sort pinned to top
    return list.sort((a,b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [notes, activeTag, search]);

  const handleAddQuick = () => {
    if (!quickTitle.trim()) return;
    addNote(quickTitle, '', []);
    setQuickTitle('');
  };

  const handleSaveNote = (title, content, tags) => {
    if (editingNote) {
      updateNote(editingNote.id, { title, content, tags });
    } else {
      addNote(title, content, tags);
    }
    setShowEditor(false);
    setEditingNote(null);
  };

  const handleConvertToTask = (note) => {
    Alert.alert(
      "Convert to Task",
      "This will create a new task from this note and delete the original note. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Convert", onPress: () => {
             const newTask = {
               id: Date.now().toString(),
               title: note.title || note.content.slice(0, 30),
               status: 'pending',
               energy: null,
               dueDate: '',
               nextDueDate: '',
               tags: note.tags || [],
               subtasks: [],
               streak: 0
             };
             setTasks(prev => [...prev, newTask]);
             deleteNote(note.id);
             setShowEditor(false);
             setEditingNote(null);
             Alert.alert("Success", "Task created! Check the Tasks tab.");
        }}
      ]
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      
      {/* Main Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="document-text-outline" size={24} color={colors.primary} />
          <Text style={styles.headerTitle}>Notes</Text>
        </View>
      </View>

      {/* Quick Capture & Search */}
      <View style={styles.searchHeader}>
        <View style={[styles.captureBox, { backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.captureInput, { color: colors.textPrimary }]}
            placeholder="Quick Capture..."
            placeholderTextColor="#9ca3af"
            value={quickTitle}
            onChangeText={setQuickTitle}
            onSubmitEditing={handleAddQuick}
          />
          <TouchableOpacity onPress={handleAddQuick} style={[styles.captureBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search notes..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Tag Filters */}
      <View style={{ height: 48 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScroll}>
          {allTags.map(tag => (
            <TouchableOpacity 
              key={tag} 
              style={[styles.tagChip, activeTag === tag && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTag(tag)}
            >
              <Text style={[styles.tagText, activeTag === tag && { color: '#fff' }]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        ref={scrollRef} 
        contentContainerStyle={styles.mainScroll} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* 2-Column Grid */}
        <View style={styles.gridContainer}>
          <View style={styles.gridColumn}>
            {filteredNotes.filter((_, i) => i % 2 === 0).map(note => (
              <NoteCard key={note.id} note={note} onPress={(n) => { setEditingNote(n); setShowEditor(true); }} />
            ))}
          </View>
          <View style={styles.gridColumn}>
            {filteredNotes.filter((_, i) => i % 2 !== 0).map(note => (
              <NoteCard key={note.id} note={note} onPress={(n) => { setEditingNote(n); setShowEditor(true); }} />
            ))}
          </View>
        </View>
        {filteredNotes.length === 0 && (
          <View style={styles.emptyWrap}>
             <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
             <Text style={styles.emptyText}>Empty Brain Dump. Capture something!</Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]} 
        onPress={() => { setEditingNote(null); setShowEditor(true); }}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <NoteEditorModal 
        visible={showEditor}
        note={editingNote}
        onSave={handleSaveNote}
        onDelete={(id) => { deleteNote(id); setShowEditor(false); setEditingNote(null); }}
        onConvert={handleConvertToTask}
        onClose={() => { setShowEditor(false); setEditingNote(null); }}
      />

      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </SafeAreaView>
  );
}

// ── Note Editor Modal ────────────────────────────────────────────────────────

function NoteEditorModal({ visible, note, onSave, onDelete, onConvert, onClose }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  React.useEffect(() => {
    if (visible) {
      setTitle(note?.title || '');
      setContent(note?.content || '');
      setTags(note?.tags || []);
    }
  }, [visible, note]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (t) => setTags(tags.filter(tg => tg !== t));

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={[styles.editorScreen, { backgroundColor: colors.background }]}>
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {note && (
              <TouchableOpacity onPress={() => onConvert(note)} style={styles.iconBtn}>
                <Ionicons name="checkbox-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            {note && (
              <TouchableOpacity onPress={() => onDelete(note.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onSave(title, content, tags)} style={styles.editorSaveBtn}>
              <Text style={styles.editorSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.editorBody} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.titleInput, { color: colors.textPrimary }]}
            placeholder="Note Title"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            multiline
          />
          
          <View style={styles.editorTagRow}>
            {tags.map(t => (
              <TouchableOpacity key={t} style={styles.tagChipActive} onPress={() => removeTag(t)}>
                <Text style={{ color: '#fff', fontSize: 11 }}>#{t}</Text>
                <Ionicons name="close-circle" size={12} color="#fff" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.tagInput}
              placeholder="+ add tag"
              placeholderTextColor="#9ca3af"
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={handleAddTag}
              autoCapitalize="none"
            />
          </View>

          <TextInput
            style={[styles.contentInput, { color: colors.textSecondary }]}
            placeholder="Start writing..."
            placeholderTextColor="#9ca3af"
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  searchHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
    marginBottom: 10,
  },
  captureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingLeft: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  captureInput: { flex: 1, fontSize: 16, fontWeight: '500' },
  captureBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  tagScroll: { paddingHorizontal: 20, gap: 8, height: 40, alignItems: 'center' },
  tagChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  tagText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },

  mainScroll: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 },
  gridContainer: { flexDirection: 'row', gap: 12 },
  gridColumn: { flex: 1, gap: 12 },

  noteCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'space-between',
  },
  noteHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  noteTitle: { fontSize: 15, fontWeight: '700' },
  noteContent: { fontSize: 13, lineHeight: 18, flex: 1 },
  noteTagRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  noteTagSmall: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  noteTagTextSmall: { fontSize: 9, color: '#9ca3af', fontWeight: '700' },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  emptyWrap: { alignItems: 'center', marginTop: 100, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 14 },

  // Editor
  editorScreen: { flex: 1 },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorSaveBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editorSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  editorBody: { flex: 1, padding: 20 },
  titleInput: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  editorTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' },
  tagChipActive: { backgroundColor: '#6366f1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagInput: { fontSize: 13, color: '#9ca3af', width: 100 },
  contentInput: { fontSize: 16, lineHeight: 24, minHeight: 400 },
});
