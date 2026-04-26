import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  StyleSheet,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/ThemeContext';
import { STATUSES } from '../lib/TasksContext';

export default function IconSetStatusMenu({ visible, task, onConfirm, onClose }) {
  const { colors } = useTheme();
  if (!task) return null;

  const targetStatus = task.status || 'pending';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Set Status</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{task.title}</Text>
          
          <View style={styles.grid}>
            {Object.entries(STATUSES).filter(([key]) => key !== 'advance_board').map(([key, cfg]) => {
              const isActive = targetStatus === key;
              return (
                <TouchableOpacity 
                  key={key} 
                  style={[
                    styles.statusOption,
                    { 
                      backgroundColor: isActive ? cfg.color : '#f3f4f6',
                      borderColor: isActive ? cfg.color : 'transparent'
                    }
                  ]}
                  onPress={() => {
                    onConfirm(task, key);
                    onClose();
                  }}
                >
                  <Ionicons name={cfg.icon} size={20} color={isActive ? '#fff' : cfg.color} />
                  <Text style={[styles.optionText, { color: isActive ? '#fff' : '#1f2937' }]}>{cfg.label}</Text>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color="#fff" style={styles.checkIcon} />}
                </TouchableOpacity>
              );
            })}
          </View>
          
          <TouchableOpacity 
            style={styles.cancelBtn} 
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 32,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  grid: {
    gap: 10,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '800',
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  cancelBtn: {
    marginTop: 20,
    padding: 16,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '800',
    fontSize: 15,
  }
});
