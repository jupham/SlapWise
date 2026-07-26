import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthService } from '../services/AuthService';
import { useStore } from '../store';
import type { RootStackParamList } from '../navigation/types';
import { color, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const setPlayer = useStore((s) => s.setPlayer);
  const player = useStore((s) => s.player);

  const handleLogout = useCallback(async () => {
    try {
      await AuthService.logout();
    } catch (err: unknown) {
      console.error('[WelcomeScreen] logout:', err);
    }
    setPlayer(null);
    navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
  }, [navigation, setPlayer]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleLogout]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome to SlapWise</Text>
      {player?.username ? (
        <Text style={styles.sub}>Hey {player.username}</Text>
      ) : null}
      <Text style={styles.body}>Create a group or join one to get started</Text>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('CreateGroup')}
      >
        <Text style={styles.primaryBtnText}>Create Group</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('JoinGroup')}
      >
        <Text style={styles.secondaryBtnText}>Join Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: color.bg, padding: space.xxl,
    justifyContent: 'center', alignItems: 'center',
  },
  heading: { ...title, textAlign: 'center', marginBottom: space.sm },
  sub: { fontSize: size.body, color: color.textMuted, marginBottom: space.xs },
  body: {
    fontSize: size.body, color: color.textMuted,
    marginBottom: 48, textAlign: 'center', lineHeight: 22,
  },
  // Only one filled button on the screen: create is the primary path, join is
  // the alternative. Two solid fills would make them read as equal weight.
  primaryBtn: {
    backgroundColor: color.accent, paddingVertical: space.lg,
    borderRadius: radius.sm, marginBottom: space.md,
    width: '100%', alignItems: 'center',
  },
  primaryBtnText: {
    color: color.accentInk, fontSize: size.body, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  secondaryBtn: {
    borderWidth: 1, borderColor: color.borderStrong, paddingVertical: space.lg,
    borderRadius: radius.sm, width: '100%', alignItems: 'center',
  },
  secondaryBtnText: {
    color: color.text, fontSize: size.body, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  logoutBtn: { marginRight: space.sm },
  logoutText: { color: color.textMuted, fontWeight: '600' },
});
