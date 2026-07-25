import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { Group, Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

export default function GroupHomeScreen({ navigation }: { navigation: Props['navigation'] }) {
  const activeGroup = useStore((s) => s.activeGroup);
  const player = useStore((s) => s.player);
  const groups = useStore((s) => s.groups);
  const setGroups = useStore((s) => s.setGroups);
  const setActiveGroup = useStore((s) => s.setActiveGroup);

  const groupId = activeGroup?.groupId ?? '';
  const groupName = activeGroup?.groupName ?? '';

  const [members, setMembers] = useState<Member[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [data, groupDetail] = await Promise.all([
        GroupService.getGroupMembers(groupId),
        GroupService.getGroup(groupId),
      ]);
      setMembers(data);
      setGroup(groupDetail);
      if (groupDetail.inviteCode) setInviteCode(groupDetail.inviteCode);
    } catch (err: unknown) {
      console.error('[GroupHomeScreen] load:', err);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const handleShare = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({ message: `Join my SlapWise group "${groupName}" with code: ${inviteCode}` });
    } catch (err: unknown) {
      console.error('[GroupHomeScreen] share:', err);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const code = await GroupService.regenerateInviteCode(groupId);
      setInviteCode(code);
    } catch (err: unknown) {
      console.error('[GroupHomeScreen] regenerate:', err);
      Alert.alert('Error', 'Failed to regenerate invite code');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await GroupService.deleteGroup(groupId);
              const updated = groups.filter((g) => g.groupId !== groupId);
              setGroups(updated);
              const next = updated[0] ?? null;
              setActiveGroup(next ? { groupId: next.groupId, groupName: next.name } : null);
            } catch (err: unknown) {
              console.error('[GroupHomeScreen] delete:', err);
              const msg = err instanceof Error ? err.message : 'Failed to delete group';
              Alert.alert('Error', msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const isCreator = player?.playerId === group?.creatorId;
  const isAdmin = isCreator || (group?.adminIds ?? []).includes(player?.playerId ?? '');
  const currentMember = members.find((m) => m.playerId === player?.playerId);
  const insets = useSafeAreaInsets();

  if (!activeGroup) {
    return (
      <View style={styles.center}>
        <Text style={styles.noGroup}>No active group selected</Text>
      </View>
    );
  }

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <FlatList
      style={[styles.container, { paddingTop: insets.top }]}
      data={members}
      keyExtractor={(m) => m.playerId}
      ListHeaderComponent={
        <View>
          <Text style={styles.heading}>{groupName}</Text>

          {/* Invite card */}
          {inviteCode && (
            <View style={styles.inviteBox}>
              <Text style={styles.inviteLabel}>Invite Code</Text>
              <Text style={styles.inviteCode}>{inviteCode}</Text>
              <View style={styles.inviteActions}>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} disabled={regenerating}>
                  <Text style={styles.regenBtnText}>{regenerating ? 'Regenerating…' : 'New Code'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Quick actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('CreateChallenge', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>🎯 Call Manchester</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('PendingDebts', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>⏳ Pending Challenges</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Ledger', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>📒 Ledger</Text>
          </TouchableOpacity>

          {/* Read In */}
          <Text style={styles.sectionTitle}>Read In</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ReadIn', { groupId, groupName })}
          >
            <Text style={[styles.actionBtnText, currentMember?.isReadIn && styles.readInDone]}>
              {currentMember?.isReadIn ? '✓ Read In' : 'Read In'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ReadInPlayers', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>Read In Players</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('ReadInGameName', { groupId, groupName })}
            >
              <Text style={styles.actionBtnText}>Set Game Name</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <Text style={styles.memberName}>{item.username ?? item.playerId}</Text>
          {item.isReadIn && <Text style={styles.badge}>Read In</Text>}
        </View>
      )}
      ListFooterComponent={
        isCreator ? (
          <TouchableOpacity
            style={[styles.deleteBtn, deleting && styles.btnDisabled]}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete Group'}</Text>
          </TouchableOpacity>
        ) : null
      }
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noGroup: { fontSize: 16, color: '#888' },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  inviteBox: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 16, alignItems: 'center' },
  inviteLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  inviteCode: { fontSize: 28, fontWeight: '700', letterSpacing: 4, marginBottom: 12 },
  inviteActions: { flexDirection: 'row', gap: 12 },
  shareBtn: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6 },
  shareBtnText: { color: '#fff', fontWeight: '600' },
  regenBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  regenBtnText: { color: '#007AFF', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  actionBtn: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  actionBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  readInDone: { color: '#34C759' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  memberName: { flex: 1, fontSize: 15 },
  badge: { backgroundColor: '#FF9500', color: '#fff', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  deleteBtn: { marginTop: 32, backgroundColor: '#FF3B30', padding: 14, borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
});
