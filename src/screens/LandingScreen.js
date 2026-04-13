import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfile } from '../lib/ProfileContext';

const { width } = Dimensions.get('window');

export default function LandingScreen() {
  const { profiles, selectProfile } = useProfile();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrapper}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
          />
          <Text style={styles.tagline}>Gamify Your Focus</Text>
        </View>

        {/* Profile chooser */}
        <View style={styles.profileSection}>
          <Text style={styles.chooseLabel}>Who's Playing?</Text>
          <View style={styles.profileGrid}>
            {profiles.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.profileCard, { borderColor: p.color + '40' }]}
                activeOpacity={0.7}
                onPress={() => selectProfile(p.id)}
              >
                <View style={[styles.avatarCircle, { backgroundColor: p.color + '18' }]}>
                  <Text style={styles.avatarEmoji}>{p.icon}</Text>
                </View>
                <Text style={styles.profileName}>{p.name}</Text>
                <Text style={styles.profileDesc}>{p.desc}</Text>
                <View style={[styles.playBtn, { backgroundColor: p.color }]}>
                  <Text style={styles.playBtnText}>Play</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Version */}
        <Text style={styles.version}>ADHDice v1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: width * 0.7,
    height: 80,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
    letterSpacing: 1,
  },
  profileSection: {
    width: '100%',
    alignItems: 'center',
  },
  chooseLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  profileGrid: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  profileCard: {
    flex: 1,
    maxWidth: 170,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarEmoji: {
    fontSize: 30,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  profileDesc: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 16,
  },
  playBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  version: {
    position: 'absolute',
    bottom: 30,
    fontSize: 12,
    color: '#d1d5db',
    fontWeight: '600',
  },
});
