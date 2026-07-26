import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { LiquorCategory } from '../../types';
import { BOTTLE_SIZE_PRESETS } from '../../constants/grog';
import { GrogService } from '../../services/GrogService';
import AddLiquorSheet from './AddLiquorSheet';
import { color } from '../../theme';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeedEntry {
  id: string;
  category: LiquorCategory;
  brand: string;
  amountInput: string;
  unit: 'ml' | 'oz';
}

interface Props {
  groupId: string;
  onSuccess: () => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OZ_TO_ML = 29.5735;

// ── Component ─────────────────────────────────────────────────────────────────

export default function InitializeGrogSheet({ groupId, onSuccess, onClose }: Props) {
  const [sizeInput, setSizeInput] = useState('');
  const [unit, setUnit] = useState<'ml' | 'oz'>('ml');
  const [lastSeedUnit, setLastSeedUnit] = useState<'ml' | 'oz'>('ml');
  const [seedEntries, setSeedEntries] = useState<SeedEntry[]>([]);
  const [showAddLiquor, setShowAddLiquor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const resolvedBottleSizeMl = (): number | null => {
    const parsed = parseFloat(sizeInput);
    if (isNaN(parsed) || parsed <= 0) return null;
    return unit === 'oz' ? parsed * OZ_TO_ML : parsed;
  };

  const handlePreset = (ml: number) => {
    setUnit('ml');
    setSizeInput(String(ml));
    setSizeError(null);
    setError(null);
  };

  const handleUnitToggle = () => {
    const bottleMl = resolvedBottleSizeMl();
    if (bottleMl !== null) {
      setSizeInput(unit === 'ml'
        ? (bottleMl / OZ_TO_ML).toFixed(2)
        : String(Math.round(bottleMl)));
    }
    setUnit((u) => (u === 'ml' ? 'oz' : 'ml'));
    setSizeError(null);
  };

  const handleAddSeed = (category: LiquorCategory, brand: string) => {
    setSeedEntries((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, category, brand, amountInput: '', unit: lastSeedUnit },
    ]);
    setShowAddLiquor(false);
    setError(null);
  };

  const handleSeedAmountChange = (id: string, value: string) => {
    setSeedEntries((prev) => prev.map((e) => e.id === id ? { ...e, amountInput: value } : e));
  };

  const handleSeedUnitToggle = (id: string) => {
    setSeedEntries((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const parsed = parseFloat(e.amountInput);
      let newInput = e.amountInput;
      if (!isNaN(parsed) && parsed > 0) {
        newInput = e.unit === 'ml'
          ? (parsed / OZ_TO_ML).toFixed(2)
          : String(Math.round(parsed * OZ_TO_ML));
      }
      const newUnit: 'ml' | 'oz' = e.unit === 'ml' ? 'oz' : 'ml';
      setLastSeedUnit(newUnit);
      return { ...e, amountInput: newInput, unit: newUnit };
    }));
  };

  const handleRemoveSeed = (id: string) => {
    setSeedEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const validate = (): boolean => {
    const bottleMl = resolvedBottleSizeMl();
    if (bottleMl === null) {
      setSizeError('Enter a valid bottle size');
      return false;
    }
    setSizeError(null);

    for (const entry of seedEntries) {
      const parsed = parseFloat(entry.amountInput);
      if (isNaN(parsed) || parsed <= 0) {
        setError(`Enter a valid amount for ${entry.brand}`);
        return false;
      }
    }

    const totalSeedMl = seedEntries.reduce((sum, e) => {
      const parsed = parseFloat(e.amountInput);
      return sum + (e.unit === 'oz' ? parsed * OZ_TO_ML : parsed);
    }, 0);

    if (totalSeedMl > bottleMl) {
      setError(`Seed entries total ${totalSeedMl.toFixed(1)} mL but bottle is only ${bottleMl.toFixed(1)} mL.`);
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const bottleMl = resolvedBottleSizeMl()!;
    setSubmitting(true);
    setError(null);
    try {
      await GrogService.initializeGrog(
        groupId,
        bottleMl,
        seedEntries.length > 0
          ? seedEntries.map(({ category, brand, amountInput, unit: u }) => {
              const parsed = parseFloat(amountInput);
              return { category, brand, amountMl: u === 'oz' ? parsed * OZ_TO_ML : parsed };
            })
          : undefined,
      );
      onSuccess();
    } catch (err) {
      console.error('[InitializeGrogSheet] initializeGrog:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('ConditionalCheckFailed')) {
        setError('A grog already exists for this group.');
      } else {
        setError('Failed to initialize grog. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetWrapper}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Initialize Grog</Text>

              {/* Bottle size */}
              <Text style={styles.label}>Bottle Size</Text>
              {sizeError && <Text style={styles.error}>{sizeError}</Text>}
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.inputFlex, sizeError ? styles.inputError : null]}
                  placeholder={unit === 'ml' ? 'e.g. 750' : 'e.g. 25.4'}
                  placeholderTextColor="#aaa"
                  value={sizeInput}
                  onChangeText={(t) => { setSizeInput(t); setSizeError(null); setError(null); }}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={styles.unitToggle} onPress={handleUnitToggle}>
                  <Text style={styles.unitToggleText}>{unit.toUpperCase()}</Text>
                </TouchableOpacity>
              </View>

              {/* Presets */}
              <View style={styles.presetRow}>
                {BOTTLE_SIZE_PRESETS.map((ml) => (
                  <TouchableOpacity
                    key={ml}
                    style={[styles.presetBtn, unit === 'ml' && sizeInput === String(ml) && styles.presetBtnActive]}
                    onPress={() => handlePreset(ml)}
                  >
                    <Text style={styles.presetBtnText}>{ml} mL</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Seed liquors */}
              <View style={styles.seedHeader}>
                <Text style={styles.label}>Seed Liquors (optional)</Text>
                <TouchableOpacity onPress={() => setShowAddLiquor(true)}>
                  <Text style={styles.addSeedBtn}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {seedEntries.length === 0 ? (
                <Text style={styles.emptySeeds}>No seed liquors added yet.</Text>
              ) : (
                seedEntries.map((entry) => (
                  <View key={entry.id} style={styles.seedRow}>
                    <View style={styles.seedMeta}>
                      <Text style={styles.seedBrand}>{entry.brand}</Text>
                      <Text style={styles.seedCategory}>{entry.category.replace(/_/g, ' ')}</Text>
                    </View>
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, styles.amountInput]}
                        placeholder={entry.unit === 'ml' ? 'mL' : 'oz'}
                        placeholderTextColor="#666"
                        value={entry.amountInput}
                        onChangeText={(v) => handleSeedAmountChange(entry.id, v)}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity style={styles.unitToggleSmall} onPress={() => handleSeedUnitToggle(entry.id)}>
                        <Text style={styles.unitToggleText}>{entry.unit.toUpperCase()}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveSeed(entry.id)}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {error && <Text style={[styles.error, styles.globalError]}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  <Text style={styles.submitBtnText}>{submitting ? 'Initializing…' : 'Initialize'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showAddLiquor && (
        <AddLiquorSheet
          onSubmit={handleAddSeed}
          onClose={() => setShowAddLiquor(false)}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: color.borderStrong,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: color.text, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: color.textMuted, marginBottom: 6 },
  error: { color: color.accent, fontSize: 12, marginBottom: 4 },
  globalError: { marginTop: 12, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  input: {
    backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.borderStrong,
    borderRadius: 8, padding: 12, fontSize: 15, color: color.text,
  },
  inputFlex: { flex: 1 },
  inputError: { borderColor: color.accent },
  amountInput: { width: 80 },
  unitToggle: {
    backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.borderStrong,
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  unitToggleSmall: {
    backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.borderStrong,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  unitToggleText: { color: color.text, fontWeight: '700', fontSize: 13 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  presetBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.surfaceRaised,
  },
  presetBtnActive: { backgroundColor: color.accent, borderColor: color.accent },
  presetBtnText: { color: color.textMuted, fontSize: 13 },
  seedHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  addSeedBtn: { color: color.accent, fontSize: 14, fontWeight: '600' },
  emptySeeds: { color: color.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 16 },
  seedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: color.surfaceRaised, borderRadius: 8, padding: 10, marginBottom: 8,
  },
  seedMeta: { flex: 1, marginRight: 8 },
  seedBrand: { color: color.text, fontSize: 14, fontWeight: '600' },
  seedCategory: { color: color.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  removeBtn: {
    backgroundColor: color.surfaceRaised, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  removeBtnText: { color: color.accent, fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', marginTop: 24, gap: 12 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 8,
    borderWidth: 1, borderColor: color.borderStrong, alignItems: 'center',
  },
  cancelBtnText: { color: color.textMuted, fontSize: 15, fontWeight: '600' },
  submitBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: color.accent, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: color.text, fontSize: 15, fontWeight: '700' },
});
