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
import { ReadInService } from '../services/ReadInService';
import type { GroupStackParamList } from '../navigation/types';
import { color, radius } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'ReadInGameName'>;

export default function ReadInGameNameScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a game name.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await ReadInService.setReadInGameName(groupId, trimmed);
      navigation.goBack();
    } catch (e) {
      console.error('[ReadInGameNameScreen] setReadInGameName failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('PERMISSION_DENIED')) {
        setError('You do not have permission to set the game name.');
      } else {
        setError('Failed to set game name. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Read In Game Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter game name"
        placeholderTextColor="#aaa"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      {error !== null && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitBtnText}>Save</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg, padding: 24 },
  label: { fontSize: 16, fontWeight: '600', color: color.text, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: color.border, borderRadius: 8,
    padding: 12, fontSize: 15, color: color.text, marginBottom: 16,
  },
  errorText: { color: color.dangerText, fontSize: 14, marginBottom: 16 },
  submitBtn: {
    backgroundColor: color.accent, padding: 16, borderRadius: radius.sm, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { color: color.accentInk, fontWeight: '700', fontSize: 16 },
});
