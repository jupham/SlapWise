import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ReadInService } from '../services/ReadInService';
import { Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<GroupStackParamList, 'ReadInPlayers'>;

export default function ReadInPlayersScreen({ route }: Props) {
  const { groupId } = route.params;
  const [players, setPlayers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ReadInService.getReadInPlayers(groupId);
      setPlayers(data);
    } catch (e) {
      console.error('[ReadInPlayersScreen] getReadInPlayers failed:', e);
      setError('Failed to load read-in players.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.count}>
        {players.length} {players.length === 1 ? 'player' : 'players'} read in
      </Text>
      {error !== null && <Text style={styles.errorText}>{error}</Text>}
      <FlatList
        data={players}
        keyExtractor={(m) => m.playerId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.username ?? item.playerId}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No players are read in yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1 },
  count: { fontSize: 14, color: '#888', marginBottom: 12 },
  row: {
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee',
  },
  name: { fontSize: 15, color: '#333' },
  emptyText: { fontSize: 14, color: '#888', marginTop: 24, textAlign: 'center' },
  errorText: { color: '#FF3B30', fontSize: 14, marginBottom: 12 },
});
