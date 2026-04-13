import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { colors } from '../theme';

const ITEM_HEIGHT = 46;

// Native scroll-wheel picker (iOS/Android only)
function Wheel({ data, selectedValue, onValueChange }) {
  const scrollViewRef = useRef(null);
  
  useEffect(() => {
    const idx = data.indexOf(selectedValue);
    if (idx >= 0 && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, []);

  const handleMomentumScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    if (data[idx]) {
      onValueChange(data[idx]);
    }
  };

  return (
    <View style={styles.wheelContainer}>
      <View style={styles.selectionHighlight} pointerEvents="none" />
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }} // center padding
      >
        {data.map((item, i) => (
          <View key={i} style={styles.wheelItem}>
            <Text style={[styles.wheelText, selectedValue === item && styles.wheelTextSelected]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Web-friendly stepper picker (▲/▼ buttons)
function WebStepper({ data, selectedValue, onValueChange, label }) {
  const currentIdx = data.indexOf(selectedValue);

  function stepUp() {
    const next = (currentIdx + 1) % data.length;
    onValueChange(data[next]);
  }

  function stepDown() {
    const prev = (currentIdx - 1 + data.length) % data.length;
    onValueChange(data[prev]);
  }

  return (
    <View style={webStyles.stepper}>
      <TouchableOpacity onPress={stepUp} style={webStyles.stepBtn}>
        <Text style={webStyles.stepArrow}>▲</Text>
      </TouchableOpacity>
      <View style={webStyles.stepValueBox}>
        <Text style={webStyles.stepValue}>{selectedValue}</Text>
      </View>
      <TouchableOpacity onPress={stepDown} style={webStyles.stepBtn}>
        <Text style={webStyles.stepArrow}>▼</Text>
      </TouchableOpacity>
      {label && <Text style={webStyles.stepLabel}>{label}</Text>}
    </View>
  );
}

export default function TimePickerModal({ visible, onClose, onSelect, initialTime = '' }) {
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  // Parse initial
  let initH = '12';
  let initM = '00';
  let initP = 'PM';

  if (initialTime) {
    const match = initialTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      initH = String(Number(match[1])); // normalize 09 to 9
      initM = match[2];
      initP = match[3].toUpperCase();
    }
  }

  const [h, setH] = useState(initH);
  const [m, setM] = useState(initM);
  const [p, setP] = useState(initP);

  // Re-sync if modal opens
  useEffect(() => {
    if (visible && initialTime) {
      const match = initialTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        setH(String(Number(match[1])));
        setM(match[2]);
        setP(match[3].toUpperCase());
      }
    }
  }, [visible]);

  function handleSave() {
    onSelect(`${h}:${m} ${p}`);
    onClose();
  }

  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.modalCard, isWeb && { maxWidth: 400, alignSelf: 'center', width: '100%' }]}>
          <Text style={styles.title}>Select Time</Text>
          
          {isWeb ? (
            <View style={webStyles.stepperRow}>
              <WebStepper data={hours} selectedValue={h} onValueChange={setH} label="Hour" />
              <Text style={styles.colon}>:</Text>
              <WebStepper data={minutes} selectedValue={m} onValueChange={setM} label="Min" />
              <View style={{ width: 16 }} />
              <WebStepper data={periods} selectedValue={p} onValueChange={setP} label="" />
            </View>
          ) : (
            <View style={styles.pickerRow}>
              <Wheel data={hours} selectedValue={h} onValueChange={setH} />
              <Text style={styles.colon}>:</Text>
              <Wheel data={minutes} selectedValue={m} onValueChange={setM} />
              <View style={{ width: 10 }} />
              <Wheel data={periods} selectedValue={p} onValueChange={setP} />
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveTxt}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const webStyles = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  stepper: {
    alignItems: 'center',
    gap: 4,
  },
  stepBtn: {
    width: 48,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  stepArrow: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '700',
  },
  stepValueBox: {
    width: 56,
    height: 48,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  stepLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    marginTop: 2,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1, 
    justifyContent: 'flex-end', 
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40, // safe area padding
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  pickerRow: {
    flexDirection: 'row',
    height: ITEM_HEIGHT * 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginHorizontal: 20,
  },
  colon: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginHorizontal: 10,
  },
  wheelContainer: {
    height: ITEM_HEIGHT * 5,
    width: 60,
    position: 'relative',
    overflow: 'hidden',
  },
  selectionHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelText: {
    fontSize: 22,
    color: '#9ca3af',
    fontWeight: '500',
  },
  wheelTextSelected: {
    fontSize: 26,
    color: '#111827',
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelTxt: { color: '#6b7280', fontSize: 16, fontWeight: '600' },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
