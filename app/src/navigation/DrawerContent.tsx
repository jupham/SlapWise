import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { AuthService } from '../services/AuthService';
import { useStore } from '../store';

export default function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const player = useStore((s) => s.player);
  const groups = useStore((s) => s.groups);
  const activeGroup = useStore((s) => s.activeGroup);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const setPlayer = useStore((s) => s.setPlayer);

  const handleSelectGroup = useCallback(
    (groupId: string, groupName: string) => {
      setActiveGroup({ groupId, groupName });
      navigation.closeDrawer();
    },
    [setActiveGroup, navigation]
  );

  const handleLogout = useCallback(async () => {
    try {
      await AuthService.logout();
    } catch (err: unknown) {
      console.error('[DrawerContent] logout:', err);
    }
    setPlayer(null);
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Auth' }] });
  }, [navigation, setPlayer]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>SlapWise</Text>
        {player?.username ? (
          <Text style={styles.username}>{player.username}</Text>
        ) : null}
      </View>

      {/* Group list */}
      <ScrollView style={styles.groupList} contentContainerStyle={styles.groupListContent}>
        <Text style={styles.sectionLabel}>YOUR GROUPS</Text>
        {groups.map((g) => {
          const isActive = g.groupId === activeGroup?.groupId;
          return (
            <TouchableOpacity
              key={g.groupId}
              style={[styles.groupRow, isActive && styles.groupRowActive]}
              onPress={() => handleSelectGroup(g.groupId, g.name)}
            >
              <Text style={[styles.groupName, isActive && styles.groupNameActive]}>
                {g.name}
              </Text>
              {isActive && <Text style={styles.activeIndicator}>●</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            navigation.closeDrawer();
            navigation.getParent()?.navigate('CreateGroup' as never);
          }}
        >
          <Text style={styles.actionBtnText}>+ Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            navigation.closeDrawer();
            navigation.getParent()?.navigate('JoinGroup' as never);
          }}
        >
          <Text style={styles.actionBtnText}>+ Join Group</Text>
        </TouchableOpacity>
      </View>

      {/* Divider + Logout */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#1a1a1a' },
  appName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  username: { fontSize: 14, color: '#aaa' },
  groupList: { flex: 1 },
  groupListContent: { paddingTop: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', paddingHorizontal: 20, marginBottom: 8, letterSpacing: 1 },
  groupRow: { paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  groupRowActive: { backgroundColor: '#f0f7ff' },
  groupName: { flex: 1, fontSize: 16, color: '#333' },
  groupNameActive: { color: '#007AFF', fontWeight: '700' },
  activeIndicator: { color: '#007AFF', fontSize: 10 },
  actions: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderColor: '#eee' },
  actionBtn: { paddingVertical: 12 },
  actionBtnText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingBottom: 32 },
  divider: { height: 1, backgroundColor: '#eee', marginBottom: 12 },
  logoutBtn: { paddingVertical: 12 },
  logoutText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
});
