import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  ScrollView, 
  Alert, 
  Platform, 
  Linking, 
  Switch,
  StyleSheet,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTasks, STATUSES, ENERGY } from '../../../lib/TasksContext';
import { useNotes } from '../../../lib/NotesContext';
import { 
  findInTree, 
  toggleById, 
  deleteById, 
  reorderInTree, 
  addChildTo, 
  newSubtask, 
  getStepPresets 
} from '../utils/taskTreeUtils';

import SubtaskItem from './SubtaskItem';
import ViewNoteModal from './ViewNoteModal';
import CalendarModal from '../../../components/CalendarModal';
import TimePickerModal from '../../../components/TimePickerModal';

const SCREEN_W = Dimensions.get('window').width;

export default function TaskDetailModal({ task, onSave, onDelete, onClose, onViewNote, onStartFocus }) {
  const { top, bottom } = useSafeAreaInsets();
  const { tasks: allTasks } = useTasks();
  const existingTags = Array.from(new Set(allTasks.flatMap(t => t.tags || []))).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const initialState = { 
    ...task, 
    subtasks: task.subtasks || [], 
    tags: task.tags || [], 
    frequency: task.frequency || null,
    status: task.status,
    isUrgent: !!task.isUrgent,
  };
  const [draft, setDraft]       = useState(initialState);
  const [subInput, setSubInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [calOpenFor, setCalOpenFor] = useState(null); // 'dueDate' | null
  const [timeOpen, setTimeOpen] = useState(false);
  const [pendingSubRolls, setPendingSubRolls] = useState(0);
  const [showExistingTagMenu, setShowExistingTagMenu] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const { notes, updateNote, addNote } = useNotes();

  // Persist draft to storage so reloads don't lose work
  useEffect(() => {
    if (draft && (draft.title || draft.subtasks?.length > 0)) {
      AsyncStorage.setItem('adhddice_task_draft', JSON.stringify(draft));
    }
  }, [draft]);

  const isNew = !task.id;

  // noteEditorState: null | { isNew: true, taskId: string } | { note: NoteObject }
  const [noteEditorState, setNoteEditorState] = useState(null);

  const handleCreateNote = () => {
    setNoteEditorState({ isNew: true, taskId: draft.id });
  };
  
  // Sync draft state with live task prop updates (e.g. from history edits)
  React.useEffect(() => {
    if (!isNew) {
      setDraft(d => ({
        ...d,
        status: task.status,
        dueDate: task.dueDate,
        statusHistory: task.statusHistory,
        subtasks: task.subtasks,
        streak: task.streak,
        completedAt: task.completedAt,
        isUrgent: task.isUrgent
      }));
    }
  }, [task.status, task.dueDate, task.statusHistory, task.subtasks, task.isUrgent]);

  const titleSuggestions = useMemo(() => {
    const q = draft.title.trim().toLowerCase();
    if (q.length < 1) return [];
    const activeStatuses = ['pending', 'active', 'missed', 'upcoming'];
    return allTasks
      .filter(t => t.id !== task.id && activeStatuses.includes(t.status) && t.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [draft.title, allTasks, task.id]);

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (q.length < 1) return [];
    return existingTags
      .filter(t => !draft.tags.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 6);
  }, [tagInput, existingTags, draft.tags]);

  function field(key, val) { setDraft(d => ({ ...d, [key]: val })); }

  // Top-level subtask actions (recursive helpers do the rest)
  function toggleSub(id, targetStatus) {
    setDraft(d => {
      const existing = findInTree(d.subtasks, id);
      const currentlyChecked = existing && (existing.done || existing.status === 'done' || existing.status === 'did_my_best');
      const willBeChecked = targetStatus
        ? (targetStatus === 'done' || targetStatus === 'did_my_best')
        : !currentlyChecked;
      if (!currentlyChecked && willBeChecked) {
        // Going unchecked → checked: bank a roll
        setPendingSubRolls(r => r + 1);
      } else if (currentlyChecked && !willBeChecked) {
        // Going checked → unchecked: remove banked roll
        setPendingSubRolls(r => Math.max(0, r - 1));
      }
      return { ...d, subtasks: toggleById(d.subtasks, id, targetStatus) };
    });
  }
  function deleteSub(id)           { setDraft(d => ({ ...d, subtasks: deleteById(d.subtasks, id) })); }
  function reorderSub(id, dir)      { setDraft(d => ({ ...d, subtasks: reorderInTree(d.subtasks, id, dir) })); }
  function addChildSub(pid, child) { setDraft(d => ({ ...d, subtasks: addChildTo(d.subtasks, pid, child) })); }

  function addTopSubtasks() {
    const lines = subInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setDraft(d => ({ ...d, subtasks: [...d.subtasks, ...lines.map(newSubtask)] }));
    setSubInput('');
  }

  function handleTagSubmit() {
    const t = tagInput.trim();
    if (t && !draft.tags.includes(t)) {
      setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    }
    setTagInput('');
  }

  function removeTag(tagToRemove) {
    setDraft(d => ({ ...d, tags: d.tags.filter(t => t !== tagToRemove) }));
  }

  function confirmDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this task?')) {
        onDelete(task.id);
      }
    } else {
      Alert.alert('Delete Task', 'Delete this task?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.id) },
      ]);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.detailScreen, { paddingTop: top }]}>
        <View style={styles.detailHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>{isNew ? 'New Task' : 'Edit Task'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!isNew && onStartFocus && (
              <TouchableOpacity 
                onPress={() => onStartFocus(task)} 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe' }}
              >
                <Ionicons name="footsteps-outline" size={16} color="#8b5cf6" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#8b5cf6', textTransform: 'uppercase' }}>One Step at a Time</Text>
              </TouchableOpacity>
            )}
            {!isNew
              ? <TouchableOpacity onPress={confirmDelete} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>
              : <View style={{ width: 36 }} />
            }
          </View>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.detailBody, { paddingBottom: 220 }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {/* Title */}
          <TextInput
            style={styles.titleInput}
            placeholder="Task name"
            placeholderTextColor="#9ca3af"
            value={draft.title}
            onChangeText={v => { field('title', v); setShowTitleSuggestions(true); }}
            onFocus={() => setShowTitleSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
            autoFocus={isNew}
            autoCorrect={false}
            spellCheck={false}
          />
          {showTitleSuggestions && titleSuggestions.length > 0 && (
            <View style={styles.autocompleteDrop}>
              {titleSuggestions.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.autocompleteItem}
                  onPress={() => { field('title', t.title); setShowTitleSuggestions(false); }}
                >
                  <Text style={styles.autocompleteText} numberOfLines={1}>{t.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Status */}
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.chipGroup}>
            {Object.entries(STATUSES).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[styles.optChip, draft.status === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => field('status', key)}
              >
                <Text style={[styles.optChipText, draft.status === key && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: draft.isUrgent ? '#fee2e2' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="alert-circle" size={20} color={draft.isUrgent ? '#ef4444' : '#9ca3af'} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Urgent</Text>
                  <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>Needs attention now</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.optChip, { minWidth: 80 }, draft.isUrgent && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}
                onPress={() => field('isUrgent', !draft.isUrgent)}
              >
                <Text style={[styles.optChipText, draft.isUrgent && { color: '#fff' }]}>{draft.isUrgent ? 'YES' : 'No'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: draft.isImportant ? '#fff7ed' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="diamond" size={18} color={draft.isImportant ? '#f97316' : '#9ca3af'} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Important</Text>
                  <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>High value goal</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.optChip, { minWidth: 80 }, draft.isImportant && { backgroundColor: '#f97316', borderColor: '#f97316' }]}
                onPress={() => field('isImportant', !draft.isImportant)}
              >
                <Text style={[styles.optChipText, draft.isImportant && { color: '#fff' }]}>{draft.isImportant ? 'YES' : 'No'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: draft.isPriority ? '#f5f3ff' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="star" size={18} color={draft.isPriority ? '#8b5cf6' : '#9ca3af'} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Focus Today</Text>
                  <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500' }}>Add to daily priority list</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.optChip, { minWidth: 80 }, draft.isPriority && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}
                onPress={() => field('isPriority', !draft.isPriority)}
              >
                <Text style={[styles.optChipText, draft.isPriority && { color: '#fff' }]}>{draft.isPriority ? 'YES' : 'No'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Frequency */}
          <Text style={styles.fieldLabel}>Repeat Frequency</Text>
          <View style={[styles.chipGroup, { paddingBottom: 6 }]}>
            {['None', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Days After'].map(freq => (
              <TouchableOpacity
                key={freq}
                style={[styles.optChip, 
                  (draft.frequency === freq || (!draft.frequency && freq === 'None') || (draft.frequency === 'DaysAfter' && freq === 'Days After')) 
                  && { backgroundColor: '#6366f1', borderColor: '#6366f1' }
                ]}
                onPress={() => {
                  if (freq === 'None') { field('frequency', null); setDraft(d => ({ ...d, frequencyDays: null })); }
                  else if (freq === 'Days After') field('frequency', 'DaysAfter');
                  else { field('frequency', freq); setDraft(d => ({ ...d, frequencyDays: null })); }
                }}
              >
                <Text style={[styles.optChipText, 
                  (draft.frequency === freq || (!draft.frequency && freq === 'None') || (draft.frequency === 'DaysAfter' && freq === 'Days After')) 
                  && { color: '#fff' }
                ]}>{freq}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {draft.frequency === 'DaysAfter' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>Every</Text>
              <TextInput
                style={[styles.fieldInput, { width: 60, textAlign: 'center', paddingVertical: 8, fontWeight: '700', fontSize: 16 }]}
                keyboardType="number-pad"
                placeholder="#"
                placeholderTextColor="#9ca3af"
                value={draft.frequencyDays ? String(draft.frequencyDays) : ''}
                onChangeText={v => {
                  const num = parseInt(v, 10);
                  setDraft(d => ({ ...d, frequencyDays: isNaN(num) ? null : Math.max(1, num) }));
                }}
              />
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>days after completion</Text>
            </View>
          )}
          {draft.frequency === 'Weekly' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Weekly Schedule</Text>
              <View style={[styles.chipGroup, { marginBottom: 8 }]}>
                {[
                  { key: 'fixed_day', label: 'Fixed Day of Week' },
                  { key: 'days_after', label: '7 Days After Completion' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.optChip, (draft.weeklyMode || 'fixed_day') === opt.key && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                    onPress={() => setDraft(d => ({ ...d, weeklyMode: opt.key }))}
                  >
                    <Text style={[styles.optChipText, (draft.weeklyMode || 'fixed_day') === opt.key && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(draft.weeklyMode || 'fixed_day') === 'fixed_day' && (
                <View style={styles.chipGroup}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.optChip, draft.weeklyDay === i && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                      onPress={() => setDraft(d => ({ ...d, weeklyDay: d.weeklyDay === i ? null : i }))}
                    >
                      <Text style={[styles.optChipText, draft.weeklyDay === i && { color: '#fff' }]}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {draft.weeklyMode === 'days_after' && (
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Next due date will be set 7 days after you mark it complete.</Text>
              )}
            </View>
          )}

          {/* Energy */}
          <Text style={styles.fieldLabel}>Energy Level</Text>
          <View style={styles.chipGroup}>
            {Object.entries(ENERGY).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[styles.optChip, draft.energy === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                onPress={() => field('energy', draft.energy === key ? null : key)}
              >
                <Text style={[styles.optChipText, draft.energy === key && { color: '#fff' }]}>{cfg.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Estimated Time */}
          <Text style={styles.fieldLabel}>Estimated Time</Text>
          <View style={styles.chipGroup}>
            {[5, 10, 15, 30, 45, 60, 90, 120].map(m => {
              const label = m >= 60 ? `${m / 60}h` : `${m}m`;
              const isActive = draft.estimatedMinutes === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.optChip, isActive && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
                  onPress={() => field('estimatedMinutes', isActive ? null : m)}
                >
                  <Text style={[styles.optChipText, isActive && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[styles.fieldInput, { marginTop: 6 }]}
            placeholder="Custom minutes (e.g. 25)"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={draft.estimatedMinutes && ![5,10,15,30,45,60,90,120].includes(draft.estimatedMinutes) ? String(draft.estimatedMinutes) : ''}
            onChangeText={v => {
              const num = parseInt(v, 10);
              field('estimatedMinutes', isNaN(num) ? null : Math.max(1, num));
            }}
          />

          {/* Dates & Time */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Due Date</Text>
              <TouchableOpacity onPress={() => setCalOpenFor('dueDate')}>
                <View pointerEvents="none">
                  <TextInput style={styles.fieldInput} placeholder="MM/DD/YYYY" placeholderTextColor="#9ca3af" value={draft.dueDate} editable={false} />
                </View>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Due Time</Text>
              <TouchableOpacity onPress={() => setTimeOpen(true)}>
                <View pointerEvents="none">
                  <TextInput style={styles.fieldInput} placeholder="e.g. 2:00 PM" placeholderTextColor="#9ca3af" value={draft.dueTime || ''} editable={false} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          

          {/* Tags */}
          <Text style={styles.fieldLabel}>Tags</Text>
          {/* Active tags on this task */}
          {draft.tags.length > 0 && (
            <View style={styles.chipGroup}>
              {draft.tags.map(tag => (
                <TouchableOpacity key={tag} style={[styles.optChip, { backgroundColor: '#ede9fe', paddingRight: 8, gap: 4, flexDirection: 'row', alignItems: 'center' }]} onPress={() => removeTag(tag)}>
                  <Text style={[styles.optChipText, { color: '#6366f1' }]}>{tag}</Text>
                  <Ionicons name="close-circle" size={14} color="#6366f1" />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Existing tags menu (collapsed by default) */}
          {existingTags.filter(t => !draft.tags.includes(t)).length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff', marginBottom: showExistingTagMenu ? 8 : 0 }}
                onPress={() => setShowExistingTagMenu(s => !s)}
              >
                <Ionicons name="pricetags-outline" size={13} color="#7c3aed" />
                <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '700' }}>Existing Tags</Text>
                <Ionicons name={showExistingTagMenu ? 'chevron-up' : 'chevron-down'} size={12} color="#7c3aed" />
              </TouchableOpacity>
              {showExistingTagMenu && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {existingTags.filter(t => !draft.tags.includes(t)).map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff' }}
                      onPress={() => { setDraft(d => ({ ...d, tags: [...d.tags, tag] })); }}
                    >
                      <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>+ #{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          <View style={{ position: 'relative', zIndex: 10 }}>
            <TextInput
              style={[styles.fieldInput, { marginTop: 4 }]}
              placeholder="New tag — press Enter to add"
              placeholderTextColor="#9ca3af"
              value={tagInput}
              onChangeText={v => { setTagInput(v); setShowTagSuggestions(true); }}
              onSubmitEditing={handleTagSubmit}
              onFocus={() => setShowTagSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
              blurOnSubmit={false}
            />
            {showTagSuggestions && tagSuggestions.length > 0 && (
              <View style={styles.autocompleteDrop}>
                {tagSuggestions.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.autocompleteItem}
                    onPress={() => {
                      setDraft(d => ({ ...d, tags: [...d.tags, tag] }));
                      setTagInput('');
                      setShowTagSuggestions(false);
                    }}
                  >
                    <Text style={styles.autocompleteText} numberOfLines={1}># {tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Link */}
          <Text style={styles.fieldLabel}>External Link</Text>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Label (e.g. Doc, Site, Music)"
                  placeholderTextColor="#9ca3af"
                  value={draft.linkTitle || ''}
                  onChangeText={v => field('linkTitle', v)}
                />
              </View>
              {draft.link ? (
                <TouchableOpacity 
                  style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd6fe' }}
                  onPress={() => {
                    try {
                      let url = draft.link;
                      if (!url.startsWith('http')) url = 'https://' + url;
                      Linking.openURL(url);
                    } catch (e) {
                      Alert.alert('Error', 'Could not open link. Please check the URL.');
                    }
                  }}
                >
                  <Ionicons name="open-outline" size={20} color="#6366f1" />
                </TouchableOpacity>
              ) : <View style={{ width: 44 }} />}
            </View>
            <TextInput
              style={styles.fieldInput}
              placeholder="URL (e.g. https://google.com)"
              placeholderTextColor="#9ca3af"
              value={draft.link || ''}
              onChangeText={v => field('link', v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Linked Notes */}
          {!isNew && (
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.fieldLabel}>Linked Notes</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={handleCreateNote} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="add" size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase' }}>New Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowNotePicker(!showNotePicker)}>
                    <Ionicons name={showNotePicker ? "close-circle" : "link-outline"} size={20} color="#f59e0b" />
                  </TouchableOpacity>
                </View>
              </View>
              
              {showNotePicker && (
                <View style={[styles.taskPickerContainer, { backgroundColor: '#fffbeb', borderColor: '#fde68a', marginBottom: 12, marginTop: 4 }]}>
                  <View style={styles.taskPickerSearch}>
                    <Ionicons name="search" size={14} color="#9ca3af" />
                    <TextInput
                      style={[styles.taskSearchInput, { color: '#1f2937' }]}
                      placeholder="Search notes to link..."
                      placeholderTextColor="#9ca3af"
                      value={noteSearch}
                      onChangeText={setNoteSearch}
                    />
                  </View>
                  <View style={{ maxHeight: 200 }}>
                    <ScrollView nestedScrollEnabled={true}>
                      {notes
                        .filter(n => !n.taskId || String(n.taskId) !== String(draft.id))
                        .filter(n => (n.title || n.content).toLowerCase().includes(noteSearch.toLowerCase()))
                        .map(n => (
                          <TouchableOpacity 
                            key={n.id} 
                            style={styles.taskResultItem}
                            onPress={() => {
                              updateNote(n.id, { taskId: draft.id });
                              setNoteSearch('');
                              setShowNotePicker(false);
                            }}
                          >
                            <Ionicons name="document-text-outline" size={16} color="#d97706" />
                            <Text style={[styles.taskResultText, { color: '#1f2937' }]} numberOfLines={1}>{n.title || n.content.slice(0, 30)}</Text>
                          </TouchableOpacity>
                        ))}
                      {notes.length === 0 && <Text style={styles.noResultsText}>No notes found.</Text>}
                    </ScrollView>
                  </View>
                </View>
              )}

              <View style={{ gap: 6, marginBottom: 8 }}>
                {notes.filter(n => String(n.taskId) === String(draft.id)).map(n => (
                  <TouchableOpacity 
                    key={n.id} 
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef3c7', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a' }}
                    onPress={() => setNoteEditorState({ note: n })}
                  >
                    <Ionicons name="document-text" size={16} color="#d97706" />
                    <Text style={{ flex: 1, fontSize: 13, color: '#92400e', fontWeight: '600' }} numberOfLines={1}>{n.title || 'Untitled Note'}</Text>
                    <TouchableOpacity 
                      onPress={(e) => { e.stopPropagation(); updateNote(n.id, { taskId: null }); }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="bag-remove" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Localized Note Editor Overlay (Inside the modal stack for visibility) */}
          {noteEditorState && (
            <ViewNoteModal 
              note={noteEditorState.note} 
              isNew={noteEditorState.isNew}
              taskId={noteEditorState.taskId}
              onClose={() => setNoteEditorState(null)} 
            />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.fieldLabel}>Subtasks</Text>
              {pendingSubRolls > 0 && (
                <View style={{ backgroundColor: '#6366f1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{pendingSubRolls}</Text>
                  <Text style={{ fontSize: 12 }}>🎲</Text>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Banked</Text>
                </View>
              )}
            </View>
            
            {/* Per-task Subtask Reset Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600' }}>Auto Reset</Text>
              <Switch 
                value={draft.resetSubtasksOnParentReset ?? true}
                onValueChange={(val) => field('resetSubtasksOnParentReset', val)}
                trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                thumbColor="#fff"
                ios_backgroundColor="#e5e7eb"
                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
              />
            </View>
          </View>
          
          {false && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 8 }}>Suggested 1st Steps</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                {getStepPresets(draft.title).map(suggestion => (
                  <TouchableOpacity 
                    key={suggestion} 
                    style={{ backgroundColor: '#f5f3ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#ddd6fe' }}
                    onPress={() => setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(suggestion)] }))}
                  >
                    <Text style={{ fontSize: 12, color: '#8b5cf6', fontWeight: '600' }}>+ {suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, paddingVertical: 8 }]}
                  placeholder="Write your own 1st step..."
                  placeholderTextColor="#9ca3af"
                  value={subInput}
                  onChangeText={setSubInput}
                  onSubmitEditing={() => {
                    if (subInput.trim()) {
                      setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(subInput.trim())] }));
                      setSubInput('');
                    }
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity 
                  style={{ backgroundColor: '#8b5cf6', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}
                  onPress={() => {
                    if (subInput.trim()) {
                      setDraft(d => ({ ...d, subtasks: [...d.subtasks, newSubtask(subInput.trim())] }));
                      setSubInput('');
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(draft.subtasks || []).map((sub, idx) => (
            <SubtaskItem
              key={sub.id}
              subtask={sub}
              depth={0}
              onToggle={toggleSub}
              onDelete={deleteSub}
              onReorder={reorderSub}
              onAddChild={addChildSub}
              isFirst={idx === 0}
              isLast={idx === draft.subtasks.length - 1}
            />
          ))}
          <TextInput
            style={[styles.fieldInput, styles.multilineInput]}
            placeholder={'Add subtasks — one per line\nPress Enter between each'}
            placeholderTextColor="#9ca3af"
            value={subInput}
            onChangeText={setSubInput}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            spellCheck={false}
          />
          <TouchableOpacity style={styles.addSubBtn} onPress={addTopSubtasks}>
            <Ionicons name="add" size={16} color="#6366f1" />
            <Text style={styles.addSubText}>Add Subtasks</Text>
          </TouchableOpacity>

        </ScrollView>

        <View style={{ 
          position: 'absolute', bottom: 0, left: 0, right: 0, 
          padding: 16, paddingBottom: bottom + 16, 
          backgroundColor: 'rgba(255,255,255,0.9)', 
          borderTopWidth: 1, borderTopColor: '#f3f4f6',
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
        }}>
          <TouchableOpacity
            style={[styles.saveBtn, { width: '100%', marginBottom: 0 }, !draft.title.trim() && { opacity: 0.4 }]}
            onPress={() => draft.title.trim() && onSave(draft, pendingSubRolls)}
          >
            <Text style={styles.saveText}>{isNew ? 'Create Task' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CalendarModal
        visible={!!calOpenFor} 
        onClose={() => setCalOpenFor(null)} 
        onSelect={(date) => { field(calOpenFor, date); setCalOpenFor(null); }}
      />
      
      <TimePickerModal
        visible={timeOpen}
        onClose={() => setTimeOpen(false)}
        initialTime={draft.dueTime}
        onSelect={(time) => { field('dueTime', time); setTimeOpen(false); }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  detailScreen:     { flex: 1, backgroundColor: '#fff' },
  detailHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 8 : 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', position: 'relative', zIndex: 10, elevation: 4, backgroundColor: '#fff' },
  detailHeaderTitle:{ fontSize: 17, fontWeight: '600', color: '#111827' },
  detailBody:       { padding: 20, gap: 4, paddingBottom: 160 },
  titleInput:       { fontSize: 22, fontWeight: '600', color: '#111827', paddingVertical: 8, marginBottom: 0, borderBottomWidth: 2, borderBottomColor: '#6366f1' },
  autocompleteDrop: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 4, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  autocompleteItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  autocompleteText: { fontSize: 15, color: '#111827' },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  fieldInput:       { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb' },
  multilineInput:   { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  dateRow:          { flexDirection: 'row', gap: 12 },
  chipGroup:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optChip:          { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  optChipText:      { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  iconBtn:          { padding: 8, borderRadius: 8 },
  saveBtn:          { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveText:         { color: '#fff', fontWeight: '700', fontSize: 16 },
  addSubBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
  addSubText:       { fontSize: 14, color: '#6366f1', fontWeight: '600' },
  taskPickerContainer: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 16, padding: 12, backgroundColor: '#fff' },
  taskPickerSearch:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 12 },
  taskSearchInput:     { flex: 1, fontSize: 14, color: '#111827' },
  taskResultItem:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  taskResultText:      { fontSize: 14, color: '#4b5563', flex: 1 },
  noResultsText:       { textAlign: 'center', color: '#9ca3af', paddingVertical: 20, fontSize: 13 },
});
