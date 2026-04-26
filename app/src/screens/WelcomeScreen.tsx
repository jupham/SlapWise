import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthService } from '../services/AuthService';
import { useStore } from '../store';
import type { RootStackParamList } from '../navigation/types';

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
  container: { flex: 1, backgroundColor: '#fff', padding: 32, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 16, color: '#555', marginBottom: 4 },
  body: { fontSize: 16, color: '#666', marginBottom: 48, textAlign: 'center' },
  primaryBtn: { backgroundColor: '#007AFF', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12, marginBottom: 16, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#34C759', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12, width: '100%', alignItems: 'center' },
  secondaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  logoutBtn: { marginRight: 8 },
  logoutText: { color: '#FF3B30', fontWeight: '600' },
});
