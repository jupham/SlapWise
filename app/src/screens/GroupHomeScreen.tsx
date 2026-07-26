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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { Group, Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

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

  // Tabs stay mounted, so refetch on focus rather than only on mount.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

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

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

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
            <Text style={styles.actionBtnText}>Call Manchester</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('PendingDebts', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>Pending Challenges</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Ledger', { groupId, groupName })}
          >
            <Text style={styles.actionBtnText}>Ledger</Text>
          </TouchableOpacity>

          {/* Read In */}
          <Text style={styles.sectionTitle}>Read In</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ReadIn', { groupId, groupName })}
          >
            <Text style={[styles.actionBtnText, currentMember?.isReadIn && styles.readInDone]}>
              {currentMember?.isReadIn ? 'Read In ✓' : 'Read In'}
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
          <Text style={styles.memberName}>{displayName(item.username ?? item.playerId)}</Text>
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
  container: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: color.bg },
  noGroup: { fontSize: size.body, color: color.textMuted },
  heading: { ...title, marginTop: space.md, marginBottom: space.lg },

  inviteBox: {
    backgroundColor: color.surface, borderLeftWidth: 3, borderLeftColor: color.regalia,
    padding: space.lg, marginBottom: space.sm, alignItems: 'center',
  },
  inviteLabel: { ...label, color: color.textMuted, marginBottom: space.sm },
  inviteCode: {
    fontFamily: font.condensed, fontSize: 34,
    letterSpacing: 6, color: color.text, marginBottom: space.md,
  },
  inviteActions: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  shareBtn: {
    backgroundColor: color.accent, paddingHorizontal: space.xl,
    paddingVertical: space.sm, borderRadius: radius.sm,
  },
  shareBtnText: {
    color: color.accentInk, fontWeight: '700',
    fontSize: size.caption, letterSpacing: 1, textTransform: 'uppercase',
  },
  regenBtn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  regenBtnText: { color: color.textMuted, fontSize: size.caption },

  sectionTitle: { ...label, marginTop: space.xl, marginBottom: space.sm },
  actionBtn: {
    paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border,
  },
  actionBtnText: { color: color.text, fontSize: size.body, fontWeight: '600' },
  readInDone: { color: color.success },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: color.border,
  },
  memberName: { flex: 1, fontSize: size.body, color: color.text },
  badge: {
    backgroundColor: color.regalia, color: color.text, fontSize: 9,
    fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: space.sm,
    paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden',
  },

  // Destructive is an outline, never a fill. On the old screen this was a
  // full-width solid button in the same red as every ordinary action link,
  // sitting exactly where a downward flick lands.
  deleteBtn: {
    marginTop: 48, alignSelf: 'flex-start',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderWidth: 1, borderColor: color.dangerBorder, borderRadius: radius.sm,
  },
  deleteBtnText: {
    color: color.dangerText, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.6 },
});
