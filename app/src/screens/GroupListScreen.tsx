import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { AuthService } from '../services/AuthService';
import { useStore } from '../store';
import { Group } from '../types';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme';


// GroupListScreen is kept for reference but replaced by DrawerContent + GroupTabNavigator in the new nav.
// It uses RootStackParamList which no longer has GroupList/GroupDetail — suppress with a local type.
type LegacyParamList = RootStackParamList & {
  GroupList: undefined;
  GroupDetail: { groupId: string; groupName: string };
  Login: undefined;
};

type Props = NativeStackScreenProps<LegacyParamList, 'GroupList'>;

export default function GroupListScreen({ navigation }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setPlayer = useStore((s) => s.setPlayer);

  const handleLogout = useCallback(async () => {
    await AuthService.logout();
    setPlayer(null);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [navigation, setPlayer]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await GroupService.getGroups();
      setGroups(data);
    } catch (err: unknown) {
      const e = err as Error;
      console.error('getGroups error:', JSON.stringify(err), e?.message);
      setError(`Failed to load groups: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Re-fetch when navigating back to this screen
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void load(); });
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={{ marginRight: 8 }}>
          <Text style={{ color: color.textMuted, fontWeight: '600' }}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleLogout]);

  if (loading) {
    return <ActivityIndicator style={styles.center} />;
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={groups}
        keyExtractor={(g) => g.groupId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('GroupDetail', { groupId: item.groupId, groupName: item.name })}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.sub}>Created {new Date(item.createdAt).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No groups yet</Text>}
      />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('CreateGroup')}>
          <Text style={styles.btnText}>Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('JoinGroup')}>
          <Text style={styles.btnText}>Join Group</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1 },
  row: { padding: 16, borderBottomWidth: 1, borderColor: color.border },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12, color: color.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: color.textDim },
  error: { color: 'red', padding: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', padding: 16, gap: 12 },
  btn: { flex: 1, backgroundColor: color.accent, padding: 14, borderRadius: 8, alignItems: 'center' },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borderStrong },
  btnText: { color: color.accentInk, fontWeight: '600' },
});
