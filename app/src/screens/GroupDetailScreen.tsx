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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { Group, Member } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const [members, setMembers] = useState<Member[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const player = useStore((s) => s.player);
  const groups = useStore((s) => s.groups);
  const setGroups = useStore((s) => s.setGroups);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, groupDetail] = await Promise.all([
        GroupService.getGroupMembers(groupId),
        GroupService.getGroup(groupId),
      ]);
      setMembers(data);
      setGroup(groupDetail);
      if (groupDetail.inviteCode) setInviteCode(groupDetail.inviteCode);
    } finally {
      setLoading(false);
    }
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const handleShare = async () => {
    if (!inviteCode) return;
    await Share.share({ message: `Join my SlapWise group "${groupName}" with code: ${inviteCode}` });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const code = await GroupService.regenerateInviteCode(groupId);
      setInviteCode(code);
    } catch {
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
              navigation.goBack();
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to delete group';
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

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{groupName}</Text>

      {inviteCode && (
        <View style={styles.inviteBox}>
          <Text style={styles.inviteLabel}>Invite Code</Text>
          <Text style={styles.inviteCode}>{inviteCode}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} disabled={regenerating}>
        <Text style={styles.regenBtnText}>{regenerating ? 'Regenerating…' : 'New Invite Code'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.manchesterBtn}
        onPress={() => navigation.navigate('PendingDebts', { groupId, groupName })}
      >
        <Text style={styles.manchesterBtnText}>Pending Challenges</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.manchesterBtn}
        onPress={() => navigation.navigate('MySlate', { groupId, groupName })}
      >
        <Text style={styles.manchesterBtnText}>My Slate</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.manchesterBtn}
        onPress={() => navigation.navigate('GroupFeed', { groupId, groupName })}
      >
        <Text style={styles.manchesterBtnText}>Group Feed</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.manchesterBtn}
        onPress={() => navigation.navigate('RecordGameCall', { groupId, groupName })}
      >
        <Text style={styles.manchesterBtnText}>Record Game Call</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Members ({members.length})</Text>
      <FlatList
        data={members}
        keyExtractor={(m) => m.playerId}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Text style={styles.memberName}>{item.username ?? item.playerId}</Text>
            {item.isReadIn && <Text style={styles.badge}>Read In</Text>}
          </View>
        )}
      />

      {isCreator && (
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.btnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete Group'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  inviteBox: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 16, marginBottom: 12, alignItems: 'center' },
  inviteLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  inviteCode: { fontSize: 28, fontWeight: '700', letterSpacing: 4, marginBottom: 8 },
  shareBtn: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6 },
  shareBtnText: { color: '#fff', fontWeight: '600' },
  regenBtn: { alignSelf: 'flex-start', marginBottom: 12 },
  regenBtnText: { color: '#007AFF', fontSize: 14 },
  manchesterBtn: { alignSelf: 'flex-start', marginBottom: 20 },
  manchesterBtnText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  memberName: { flex: 1, fontSize: 15 },
  badge: { backgroundColor: '#FF9500', color: '#fff', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  deleteBtn: { marginTop: 24, backgroundColor: '#FF3B30', padding: 14, borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
});
