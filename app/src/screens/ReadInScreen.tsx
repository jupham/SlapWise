import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ReadInService } from '../services/ReadInService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import type { GroupStackParamList } from '../navigation/types';
import { color, radius } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'ReadIn'>;

export default function ReadInScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const player = useStore((s) => s.player);

  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyReadIn, setAlreadyReadIn] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!player) return;
    try {
      const members = await GroupService.getGroupMembers(groupId);
      const me = members.find((m) => m.playerId === player.playerId);
      if (me?.isReadIn) setAlreadyReadIn(true);
    } catch (e) {
      console.error('[ReadInScreen] checkStatus failed:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, player]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  if (!player) return null;

  if (loading) return <ActivityIndicator style={styles.center} />;

  const handleConfirm = async () => {
    if (!checked) {
      setError('You must check the box to confirm.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await ReadInService.confirmReadIn(groupId);
      navigation.goBack();
    } catch (e) {
      console.error('[ReadInScreen] confirmReadIn failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ALREADY_READ_IN')) {
        setAlreadyReadIn(true);
      } else {
        setError('Failed to confirm read in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyReadIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.alreadyText}>You are already read in.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Read In</Text>
      <Text style={styles.prompt}>
        By checking this, you permanently and irrevocably agree to abide by the rules of this game
        even if you don't know what they are. This cannot be undone.
      </Text>

      <TouchableOpacity
        style={styles.checkRow}
        onPress={() => setChecked((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkLabel}>I understand and agree</Text>
      </TouchableOpacity>

      {error !== null && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.confirmBtn, (!checked || submitting) && styles.btnDisabled]}
        onPress={handleConfirm}
        disabled={!checked || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.confirmBtnText}>Confirm Read In</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg, padding: 24 },
  center: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: color.text },
  prompt: { fontSize: 15, color: color.textMuted, lineHeight: 22, marginBottom: 32 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  checkbox: {
    width: 24, height: 24, borderWidth: 2, borderColor: color.accent,
    borderRadius: 4, marginRight: 12, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: color.accent },
  checkmark: { color: color.accentInk, fontWeight: '700', fontSize: 14 },
  checkLabel: { fontSize: 15, color: color.text, flex: 1 },
  errorText: { color: color.dangerText, fontSize: 14, marginBottom: 16 },
  confirmBtn: {
    backgroundColor: color.accent, padding: 16, borderRadius: radius.sm, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: color.accentInk, fontWeight: '700', fontSize: 16 },
  alreadyText: { fontSize: 16, color: color.textMuted, marginBottom: 24 },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { color: color.accent, fontSize: 15 },
});
