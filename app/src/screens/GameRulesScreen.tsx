import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GameService } from '../services/GameService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import type { GroupStackParamList } from '../navigation/types';
import { gameName } from '../copy/game';
import { builtInRules } from '../copy/gameRules';
import { color, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, 'GameRules'>;

/**
 * The read-in game's rules: the app's mechanics, which ship with the app, then
 * the group's house rules, which its admins write and the server serves to
 * read-in players only. Admins edit the house rules in place.
 *
 * Opened straight after reading in (`justReadIn`), and from the call screens
 * and Group home afterwards.
 */
export default function GameRulesScreen({ route, navigation }: Props) {
  const { groupId, justReadIn } = route.params;
  const me = useStore((s) => s.player?.playerId ?? '');

  const [game, setGame] = useState('Game');
  const [house, setHouse] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [group, rules] = await Promise.all([
        GroupService.getGroup(groupId),
        GameService.getReadInRules(groupId),
      ]);
      setGame(gameName(group.readInGameName));
      setIsAdmin(group.creatorId === me || (group.adminIds ?? []).includes(me));
      setHouse(rules.text);
    } catch (e) {
      console.error('[GameRulesScreen] load failed:', e);
      setError('Failed to load the rules');
    } finally {
      setLoading(false);
    }
  }, [groupId, me]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    navigation.setOptions({ title: `${game} rules` });
  }, [navigation, game]);

  const startEdit = () => {
    setDraft(house);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await GameService.setReadInRules(groupId, draft);
      setHouse(saved.text);
      setEditing(false);
    } catch (e) {
      console.error('[GameRulesScreen] save failed:', e);
      setError('Failed to save the house rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
    >
      {justReadIn ? (
        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>You&rsquo;re in.</Text>
          <Text style={styles.welcomeBody}>
            No take-backs. Here&rsquo;s what you just agreed to.
          </Text>
        </View>
      ) : null}

      {builtInRules(game).map((r) => (
        <View key={r.heading} style={styles.section}>
          <Text style={styles.heading}>{r.heading}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}

      <View style={styles.houseHeader}>
        <Text style={styles.houseLabel}>House rules</Text>
        {isAdmin && !editing ? (
          <TouchableOpacity onPress={startEdit} accessibilityRole="button">
            <Text style={styles.editLink}>{house ? 'Edit' : 'Write them'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {editing ? (
        <View>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            multiline
            textAlignVertical="top"
            maxLength={4000}
            placeholder="What counts as the mark? When is a call fair? Anything else the group has agreed."
            placeholderTextColor={color.textDim}
            autoFocus
          />
          <View style={styles.editActions}>
            <TouchableOpacity onPress={() => setEditing(false)} disabled={saving}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={color.text} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : house ? (
        <Text style={styles.houseText}>{house}</Text>
      ) : (
        <Text style={styles.houseEmpty}>
          {isAdmin
            ? 'None yet. Write down what counts as the mark so nobody can argue about it.'
            : 'None yet. Ask an admin to write down what counts as the mark.'}
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: color.bg },

  welcome: {
    backgroundColor: color.surface, borderLeftWidth: 3, borderLeftColor: color.regalia,
    padding: space.lg, marginBottom: space.xl,
  },
  welcomeTitle: { ...title, fontSize: size.title },
  welcomeBody: { fontSize: size.body, color: color.textMuted, marginTop: space.xs },

  section: { marginBottom: space.xl },
  heading: { fontFamily: font.condensed, fontSize: size.heading, color: color.text, marginBottom: space.xs },
  body: { fontSize: size.body, color: color.textMuted, lineHeight: 22 },

  houseHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.xl, marginBottom: space.sm,
  },
  houseLabel: { ...label, color: color.regalia },
  editLink: { ...label, color: color.accent },
  houseText: { fontSize: size.body, color: color.text, lineHeight: 22 },
  houseEmpty: { fontSize: size.body, color: color.textDim, lineHeight: 22 },

  input: {
    borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md,
    backgroundColor: color.surface, color: color.text,
    padding: space.md, fontSize: size.body, minHeight: 160, lineHeight: 22,
  },
  editActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: space.lg, marginTop: space.md,
  },
  cancel: { ...label, color: color.textMuted },
  saveBtn: {
    backgroundColor: color.regalia, paddingHorizontal: space.xl,
    paddingVertical: space.sm + 2, borderRadius: radius.sm,
  },
  saveText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.5 },
  error: { color: color.dangerText, fontSize: size.caption, marginTop: space.lg },
});
