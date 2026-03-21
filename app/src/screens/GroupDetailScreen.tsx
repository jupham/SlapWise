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
import { Member } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail' | 'PendingDebts' | 'CreateChallenge'>;

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await GroupService.getGroupMembers(groupId);
      setMembers(data);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

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
});
