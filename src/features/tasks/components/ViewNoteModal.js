import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/ThemeContext';
import { useNotes } from '../../../lib/NotesContext';

export default function ViewNoteModal({ note: initialNote, isNew, taskId, onClose }) {
  const { colors } = useTheme();
  const { updateNote, addNote } = useNotes();
  const [isEditing, setIsEditing] = useState(isNew || initialNote?.isInitialEdit || false);
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || '');

  React.useEffect(() => {
    if (initialNote) {
      setTitle(initialNote.title || '');
      setContent(initialNote.content || '');
      setIsEditing(initialNote.isInitialEdit || false);
    } else if (isNew) {
      setTitle('');
      setContent('');
      setIsEditing(true);
    }
  }, [initialNote, isNew]);

  if (!initialNote && !isNew) return null;

  const handleSave = () => {
    if (isNew) {
      addNote(title, content, [], taskId);
    } else {
      updateNote(initialNote.id, { title, content });
    }
    onClose();
  };

  return (
    <View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 10000 }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ width: '100%', maxWidth: 500, alignItems: 'center' }}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          style={{ width: '100%', backgroundColor: colors.background || '#fff', borderRadius: 24, padding: 24, maxHeight: '90%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 }}
        >
           <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
               <Ionicons name="document-text" size={20} color="#f59e0b" />
               {isEditing ? (
                 <TextInput
                   style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary || '#111827', flex: 1, padding: 0 }}
                   value={title}
                   onChangeText={setTitle}
                   placeholder="Note Title"
                   autoFocus
                 />
               ) : (
                 <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary || '#111827', flex: 1 }}>{initialNote?.title || 'Untitled Note'}</Text>
               )}
             </View>
             <View style={{ flexDirection: 'row', gap: 12 }}>
               {isEditing ? (
                 <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#f59e0b', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 }}>
                   <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>
                 </TouchableOpacity>
               ) : (
                 <TouchableOpacity onPress={() => setIsEditing(true)} style={{ padding: 4 }}>
                   <Ionicons name="pencil" size={20} color={colors.textSecondary || '#6b7280'} />
                 </TouchableOpacity>
               )}
               <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                 <Ionicons name="close" size={24} color={colors.textSecondary || '#6b7280'} />
               </TouchableOpacity>
             </View>
           </View>
           <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 20 }}>
             {isEditing ? (
               <TextInput
                 style={{ fontSize: 16, lineHeight: 24, color: colors.textSecondary || '#374151', minHeight: 200 }}
                 value={content}
                 onChangeText={setContent}
                 placeholder="Start writing..."
                 multiline
                 textAlignVertical="top"
               />
             ) : (
               <Text style={{ fontSize: 16, lineHeight: 24, color: colors.textSecondary || '#374151' }}>{initialNote?.content || 'No content.'}</Text>
             )}
           </ScrollView>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}
