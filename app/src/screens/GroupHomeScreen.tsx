import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { DrawerActions, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { enterGroups } from '../navigation/enterGroups';
import { useStore } from '../store';
import { Group, Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

export default function GroupHomeScreen({ navigation }: { navigation: Props['navigation'] }) {
  const activeGroup = useStore((s) => s.activeGroup);
  const player = useStore((s) => s.player);

  const groupId = activeGroup?.groupId ?? '';
  const groupName = activeGroup?.groupName ?? '';

  const [members, setMembers] = useState<Member[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Spinner only for the first load of a group. Tabs refetch on every focus,
  // so an unconditional setLoading(true) blanked the whole screen to a spinner
  // each time you came back from a pushed screen.
  const loadedGroupRef = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (!groupId) return;
    if (loadedGroupRef.current !== groupId) setLoading(true);
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
      loadedGroupRef.current = groupId;
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
              // Lands on the next group, or Welcome if that was the last one.
              await enterGroups({ drop: groupId });
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

  const handleLeave = () => {
    Alert.alert(
      'Leave Group',
      `Leave "${groupName}"? Any Manchester you haven't settled is wiped, and the group will remember you as a quitter.`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await GroupService.leaveGroup(groupId);
              // Lands on the next group, or Welcome if that was the last one.
              await enterGroups({ drop: groupId });
            } catch (err: unknown) {
              console.error('[GroupHomeScreen] leave:', err);
              Alert.alert('Error', 'Failed to leave group');
            } finally {
              setLeaving(false);
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

  // The top inset goes on a wrapper, not the list content, so the list starts
  // below the status bar and rows clip there instead of scrolling under it.
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        style={styles.container}
        data={members}
        keyExtractor={(m) => m.playerId}
        ListHeaderComponent={
          <View>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>{groupName}</Text>
              {/* The only way into the drawer. It has no header and nothing else
                  calls openDrawer, so the edge-swipe gesture was the sole entry —
                  and the tab navigator's own horizontal swipe wins over it, which
                  left Logout, the name editor and Delete Account unreachable. */}
              <TouchableOpacity
                style={styles.accountBtn}
                // Dispatched rather than called on a getParent() chain: the action
                // bubbles up until a navigator handles it, so this does not care
                // how many navigators sit between this screen and the drawer.
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
                accessibilityRole="button"
                accessibilityLabel="Account"
              >
                <Text style={styles.accountBtnText}>Account</Text>
              </TouchableOpacity>
            </View>

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
            {/* Rules are read-in only; the server would refuse anyone else anyway. */}
            {currentMember?.isReadIn && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('GameRules', { groupId, groupName })}
              >
                <Text style={styles.actionBtnText}>Rules</Text>
              </TouchableOpacity>
            )}
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
          ) : (
            // The creator cannot leave — they are the one admin the grog is
            // guaranteed to have — so they get Delete Group instead.
            <TouchableOpacity
              style={[styles.deleteBtn, leaving && styles.btnDisabled]}
              onPress={handleLeave}
              disabled={leaving}
            >
              <Text style={styles.deleteBtnText}>{leaving ? 'Leaving…' : 'Leave Group'}</Text>
            </TouchableOpacity>
          )
        }
        // Padding on a scroll view's own style shifts its content down without
        // making it any taller, so the bottom of the list — Delete Group — could
        // never scroll clear of the tab bar. Hence the wrapper above for the top
        // inset, and content padding for the rest.
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: color.bg },
  noGroup: { fontSize: size.body, color: color.textMuted },
  headingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space.md, marginBottom: space.lg,
  },
  heading: { ...title, flexShrink: 1 },
  accountBtn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  accountBtnText: { color: color.accent, fontSize: size.body, fontWeight: '600' },

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
