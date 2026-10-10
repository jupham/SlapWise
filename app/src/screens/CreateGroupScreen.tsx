import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { enterGroups } from '../navigation/enterGroups';
import type { GroupStackParamList } from '../navigation/types';
import { color, label, radius, size, space } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await GroupService.createGroup(name.trim());
      // Refetch and reset rather than goBack(): from Welcome, going back lands on
      // Welcome again, and neither path ever told the store about the new group.
      await enterGroups({ open: created.groupId });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor={color.textDim}
        placeholder="e.g. Friday Night Crew"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color={color.accentInk} /> : <Text style={styles.btnText}>Create</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg, padding: space.xl },
  label: { ...label, marginBottom: space.sm },
  input: {
    borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md,
    backgroundColor: color.surface, color: color.text,
    padding: space.md, fontSize: size.body, marginBottom: space.md,
  },
  error: { color: color.dangerText, marginBottom: space.md, fontSize: size.caption },
  btn: {
    backgroundColor: color.accent, padding: space.md + 2, borderRadius: radius.sm,
    alignItems: 'center', marginTop: space.sm,
  },
  btnText: {
    color: color.accentInk, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});
