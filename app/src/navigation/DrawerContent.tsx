import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { AuthService } from '../services/AuthService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { color, label, radius, size, space, title } from '../theme';


export default function DrawerContent({ navigation }: DrawerContentComponentProps) {
  const player = useStore((s) => s.player);
  const groups = useStore((s) => s.groups);
  const activeGroup = useStore((s) => s.activeGroup);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const setPlayer = useStore((s) => s.setPlayer);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const openNameEditor = useCallback(() => {
    setDraftName(player?.username ?? '');
    setNameError(null);
    setEditingName(true);
  }, [player]);

  const handleSaveName = useCallback(async () => {
    const trimmed = draftName.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setNameError('Display name must be between 2 and 24 characters.');
      return;
    }
    if (trimmed === player?.username) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    setNameError(null);
    try {
      await GroupService.updateUsername(trimmed);
      if (player) setPlayer({ ...player, username: trimmed });
      setEditingName(false);
    } catch (err: unknown) {
      console.error('[DrawerContent] updateUsername:', err);
      setNameError("Couldn't save that name. Try again.");
    } finally {
      setSavingName(false);
    }
  }, [draftName, player, setPlayer]);

  const handleSelectGroup = useCallback(
    (groupId: string, groupName: string) => {
      setActiveGroup({ groupId, groupName });
      navigation.closeDrawer();
    },
    [setActiveGroup, navigation]
  );

  /**
   * Deletion is never blocked, including mid-Manchester. The guideline asks
   * that it be easy to find and not obstructed, and gating it behind settling
   * up would be exactly that. The Alert says plainly what survives, because
   * "anonymised" is not what people picture when they tap delete.
   */
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'Your login and profile are deleted for good. Manchesters you were part of stay in the group, with your name replaced — they are the other player’s history too. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await AuthService.deleteAccount();
              } catch (err: unknown) {
                console.error('[DrawerContent] deleteAccount:', err);
                setDeleting(false);
                Alert.alert(
                  'Could not delete account',
                  'Nothing has been deleted. Check your connection and try again.'
                );
                return;
              }
              setPlayer(null);
              navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Auth' }] });
            })();
          },
        },
      ]
    );
  }, [navigation, setPlayer]);

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
          <TouchableOpacity onPress={openNameEditor} accessibilityRole="button">
            <Text style={styles.username}>
              {player.username} <Text style={styles.editHint}>Edit</Text>
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingName(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Display name</Text>
            <Text style={styles.modalHelp}>This is what your groups see.</Text>
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={color.textDim}
              value={draftName}
              onChangeText={setDraftName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              autoFocus
              editable={!savingName}
            />
            {nameError ? <Text style={styles.modalError}>{nameError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setEditingName(false)}
                disabled={savingName}
              >
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => void handleSaveName()}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* Divider + Logout + Delete Account */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
        {/* App Store guideline 5.1.1(v): an app that creates accounts has to let
            people delete them from inside it, and the control has to be easy to
            find — so this sits beside Logout rather than behind a settings
            screen the app does not otherwise have. */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          disabled={deleting}
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>
            {deleting ? 'Deleting…' : 'Delete Account'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  header: {
    paddingTop: 60, paddingHorizontal: space.xl, paddingBottom: space.xl,
    backgroundColor: color.surface,
    borderBottomWidth: 1, borderBottomColor: color.border,
  },
  appName: { ...title, fontSize: size.title, marginBottom: space.xs },
  username: { fontSize: size.body, color: color.textMuted },
  editHint: {
    fontSize: size.label, color: color.accent, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: color.surface, borderRadius: radius.md, padding: space.xl,
    borderWidth: 1, borderColor: color.border,
  },
  modalTitle: { fontSize: size.heading, fontWeight: '700', color: color.text },
  modalHelp: {
    fontSize: size.caption, color: color.textMuted,
    marginTop: space.xs, marginBottom: space.lg,
  },
  modalInput: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 1, borderColor: color.border, borderRadius: radius.sm,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontSize: size.body, color: color.text,
  },
  modalError: { color: color.dangerText, fontSize: size.caption, marginTop: space.sm },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: space.xl, marginTop: space.lg,
  },
  modalBtn: { paddingVertical: space.sm, paddingHorizontal: space.sm, minWidth: 60, alignItems: 'center' },
  modalCancel: { color: color.textMuted, fontSize: size.body, fontWeight: '600' },
  modalSave: {
    color: color.accent, fontSize: size.body, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  groupList: { flex: 1 },
  groupListContent: { paddingTop: space.lg },
  sectionLabel: { ...label, paddingHorizontal: space.xl, marginBottom: space.sm },
  groupRow: {
    paddingVertical: space.md, paddingHorizontal: space.xl,
    flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  groupRowActive: { backgroundColor: color.surface, borderLeftColor: color.accent },
  groupName: { flex: 1, fontSize: size.body, color: color.textMuted },
  groupNameActive: { color: color.text, fontWeight: '700' },
  activeIndicator: { color: color.accent, fontSize: 10 },
  actions: {
    paddingHorizontal: space.xl, paddingVertical: space.md,
    borderTopWidth: 1, borderTopColor: color.border,
  },
  actionBtn: { paddingVertical: space.md },
  actionBtnText: { color: color.text, fontSize: size.body, fontWeight: '600' },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  divider: { height: 1, backgroundColor: color.border, marginBottom: space.md },
  logoutBtn: { paddingVertical: space.md },
  logoutText: { color: color.textMuted, fontSize: size.body, fontWeight: '600' },
  // Destructive is an outline, never a fill — same treatment as Delete Group.
  deleteBtn: {
    marginTop: space.md, alignSelf: 'flex-start',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderWidth: 1, borderColor: color.dangerBorder, borderRadius: radius.sm,
  },
  deleteText: {
    color: color.dangerText, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});
