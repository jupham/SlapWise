import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GroupStackParamList } from '../navigation/types';
import { GrogService } from '../services/GrogService';
import { GroupService } from '../services/GroupService';
import type { Grog, LiquorCategory } from '../types';
import GrogSkull from './components/GrogSkull';
import AddLiquorSheet from './components/AddLiquorSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_COLORS } from '../constants/grog';
import { color } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'InfinityGrogSentence'>;

const OZ_PER_ML = 1 / 29.5735;

export default function InfinityGrogSentenceScreen({ route, navigation }: Props) {
  const { debtId, groupId, groupName } = route.params;
  const insets = useSafeAreaInsets();

  const [grog, setGrog] = useState<Grog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLiquor, setShowAddLiquor] = useState(false);
  const [taking, setTaking] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  // Two-phase shot flow state
  const [shotTaken, setShotTaken] = useState(false);
  const [showPostShotDialog, setShowPostShotDialog] = useState(false);

  // Drawer
  const DRAWER_WIDTH = Dimensions.get('window').width * 0.72;
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => {
    const toValue = drawerOpen ? DRAWER_WIDTH : 0;
    Animated.spring(drawerAnim, { toValue, useNativeDriver: true, damping: 20, stiffness: 120 }).start();
    setDrawerOpen(!drawerOpen);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedGrog] = await Promise.all([
        GrogService.getGrog(groupId),
        GroupService.getGroupMembers(groupId),
      ]);
      setGrog(fetchedGrog);
    } catch (err) {
      console.error('[InfinityGrogSentenceScreen] load:', err);
      setError('Failed to load grog data.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  // Phase 1: take the shot
  const handleTakeTheShot = async () => {
    setTaking(true);
    setError(null);
    try {
      await GrogService.takeGrogShot(groupId, debtId);
      setShotTaken(true);
      setShowPostShotDialog(true);
    } catch (err) {
      console.error('[InfinityGrogSentenceScreen] takeGrogShot:', err);
      setError('Failed to record shot. Please try again.');
    } finally {
      setTaking(false);
    }
  };

  // Phase 2: add back now — submit from AddLiquorSheet
  const handleAddLiquorSubmit = async (category: LiquorCategory, brand: string) => {
    setShowAddLiquor(false);
    setRedeeming(true);
    setError(null);
    try {
      await GrogService.redeemAddBack(groupId, debtId, category, brand);
      navigation.goBack();
    } catch (err) {
      console.error('[InfinityGrogSentenceScreen] redeemAddBack:', err);
      setError('Failed to add back liquor. Please try again.');
      setRedeeming(false);
    }
  };

  // Phase 2: close AddLiquorSheet without submitting → add-back deferred, navigate back
  const handleAddLiquorClose = () => {
    setShowAddLiquor(false);
    navigation.goBack();
  };

  // Post-shot dialog: "Add Back Now"
  const handleAddBackNow = () => {
    setShowPostShotDialog(false);
    setShowAddLiquor(true);
  };

  // Post-shot dialog: "Add Back Later"
  const handleAddBackLater = () => {
    setShowPostShotDialog(false);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF3B30" />
      </View>
    );
  }

  if (error && !taking && grog === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const entries = grog?.entries ?? [];
  const bottleSize = grog?.bottleSize ?? 750;

  return (
    <>
      <View style={styles.root}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.groupName}>{groupName}</Text>
          <Text style={styles.heading}>Your Sentence</Text>
          <Text style={styles.subheading}>You must take a shot from the Grog.</Text>
          <View style={styles.skullContainer}>
            <GrogSkull entries={entries} bottleSize={bottleSize} animate={true} />
          </View>
          {error != null && <Text style={styles.inlineError}>{error}</Text>}
          <TouchableOpacity
            style={[styles.shotBtn, (taking || shotTaken) && styles.shotBtnDisabled]}
            onPress={() => void handleTakeTheShot()}
            disabled={taking || shotTaken}
            activeOpacity={0.8}
          >
            <Text style={styles.shotBtnText}>
              {taking ? 'Recording...' : 'Take the Shot'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.takeLaterBtn}
            onPress={() => navigation.goBack()}
            disabled={taking}
            activeOpacity={0.7}
          >
            <Text style={styles.takeLaterBtnText}>Take Later</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Drawer tab */}
        {entries.length > 0 && (
          <TouchableOpacity style={[styles.drawerTab, { top: insets.top + 8 }]} onPress={toggleDrawer}>
            <Text style={styles.drawerTabText}>{drawerOpen ? '› Contents' : '‹ Contents'}</Text>
          </TouchableOpacity>
        )}

        {/* Slide-in drawer */}
        <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
          <ScrollView contentContainerStyle={[styles.drawerContent, { paddingTop: insets.top + 16 }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.drawerTitle}>Contents</Text>
            {entries.map((entry) => {
              const color = CATEGORY_COLORS[entry.category];
              return (
                <View key={entry.entryId} style={[styles.entryRow, { borderLeftColor: color }]}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryBrand} numberOfLines={1}>{entry.brand}</Text>
                    <Text style={styles.entryCategory}>{entry.category.replace(/_/g, ' ')}</Text>
                    <Text style={styles.entryVolume}>
                      {entry.amountMl.toFixed(1)} mL / {(entry.amountMl * OZ_PER_ML).toFixed(2)} oz
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Post-shot dialog */}
      <Modal
        visible={showPostShotDialog}
        transparent
        animationType="fade"
        onRequestClose={handleAddBackLater}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>Shot Taken!</Text>
            <Text style={styles.dialogBody}>
              You're entitled to add one liquor back to the Grog. Do you want to add it now?
            </Text>
            {error != null && <Text style={styles.inlineError}>{error}</Text>}
            <TouchableOpacity
              style={styles.dialogPrimaryBtn}
              onPress={handleAddBackNow}
              activeOpacity={0.8}
            >
              <Text style={styles.dialogPrimaryBtnText}>Add Back Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dialogSecondaryBtn}
              onPress={handleAddBackLater}
              activeOpacity={0.7}
            >
              <Text style={styles.dialogSecondaryBtnText}>Add Back Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add liquor sheet — shown after "Add Back Now" */}
      {showAddLiquor && (
        <AddLiquorSheet
          onSubmit={(category, brand) => void handleAddLiquorSubmit(category, brand)}
          onClose={handleAddLiquorClose}
        />
      )}

      {/* Redeeming overlay */}
      {redeeming && (
        <View style={styles.redeemingOverlay}>
          <ActivityIndicator size="large" color="#FF3B30" />
          <Text style={styles.redeemingText}>Adding back...</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 60, alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: color.bg },
  groupName: {
    fontSize: 13, fontWeight: '600', color: color.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 60,
  },
  heading: { fontSize: 32, fontWeight: '800', color: color.text, textAlign: 'center', marginBottom: 8 },
  subheading: { fontSize: 16, color: color.textMuted, textAlign: 'center', marginBottom: 32 },
  skullContainer: { alignItems: 'center', marginBottom: 40 },
  shotBtn: {
    backgroundColor: color.accent, paddingVertical: 18, paddingHorizontal: 48,
    borderRadius: 12, alignItems: 'center', marginBottom: 16,
    shadowColor: color.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  shotBtnDisabled: { opacity: 0.5 },
  shotBtnText: { color: color.accentInk, fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  takeLaterBtn: {
    paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 10, alignItems: 'center', marginBottom: 40,
    borderWidth: 1, borderColor: color.borderStrong,
  },
  takeLaterBtnText: { color: color.textMuted, fontSize: 15, fontWeight: '600' },
  inlineError: { color: color.accent, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  errorText: { color: color.accent, fontSize: 15, marginBottom: 16, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { backgroundColor: color.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: color.accentInk, fontWeight: '600', fontSize: 14 },
  // Drawer
  drawerTab: {
    position: 'absolute', right: 0, top: 8,
    backgroundColor: color.surfaceRaised, borderTopLeftRadius: 6, borderBottomLeftRadius: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderRightWidth: 0, borderColor: color.borderStrong, zIndex: 10,
  },
  drawerTabText: { color: color.textDim, fontSize: 13, fontWeight: '600' },
  drawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: '72%',
    backgroundColor: color.surface, borderLeftWidth: 1, borderLeftColor: color.border,
    shadowColor: '#000', shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 16,
  },
  drawerContent: { padding: 16, paddingTop: 20, paddingBottom: 40 },
  drawerTitle: { fontSize: 16, fontWeight: '700', color: color.text, marginBottom: 12 },
  entryRow: {
    backgroundColor: color.surface, borderRadius: 6, borderLeftWidth: 3,
    padding: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  colorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  entryInfo: { flex: 1, minWidth: 0 },
  entryBrand: { color: color.text, fontSize: 12, fontWeight: '600' },
  entryCategory: { color: color.textMuted, fontSize: 10, marginTop: 1, textTransform: 'capitalize' },
  entryVolume: { color: color.textDim, fontSize: 10, marginTop: 1 },
  // Post-shot dialog
  dialogBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  dialogBox: {
    backgroundColor: color.surface, borderRadius: 16, padding: 24,
    width: '100%', borderWidth: 1, borderColor: color.border,
  },
  dialogTitle: {
    fontSize: 22, fontWeight: '800', color: color.text,
    textAlign: 'center', marginBottom: 12,
  },
  dialogBody: {
    fontSize: 15, color: color.textDim, textAlign: 'center', marginBottom: 24, lineHeight: 22,
  },
  dialogPrimaryBtn: {
    backgroundColor: color.accent, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center', marginBottom: 12,
  },
  dialogPrimaryBtnText: { color: color.accentInk, fontSize: 16, fontWeight: '700' },
  dialogSecondaryBtn: {
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: color.borderStrong,
  },
  dialogSecondaryBtnText: { color: color.textMuted, fontSize: 15, fontWeight: '600' },
  // Redeeming overlay
  redeemingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  redeemingText: { color: color.text, fontSize: 15, marginTop: 12, fontWeight: '600' },
});
