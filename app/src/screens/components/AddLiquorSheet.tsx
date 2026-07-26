import React, { useState, useMemo } from 'react';
import {
  FlatList,
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
import { LIQUOR_BRANDS } from '../../constants/grog';
import { color } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: LiquorCategory[] = [
  'vodka', 'whiskey', 'bourbon', 'scotch',
  'irish_whiskey', 'canadian_whiskey', 'rum',
  'gin', 'tequila', 'brandy', 'other',
];

const CATEGORY_LABELS: Record<LiquorCategory, string> = {
  vodka: 'Vodka',
  whiskey: 'Whiskey',
  bourbon: 'Bourbon',
  scotch: 'Scotch',
  irish_whiskey: 'Irish Whiskey',
  canadian_whiskey: 'Canadian Whiskey',
  rum: 'Rum',
  gin: 'Gin',
  tequila: 'Tequila',
  brandy: 'Brandy',
  other: 'Other',
};

const MAX_SUGGESTIONS = 8;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (category: LiquorCategory, brand: string) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddLiquorSheet({ onSubmit, onClose }: Props) {
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<LiquorCategory | null>(null);
  const [errors, setErrors] = useState<{ brand?: string; category?: string }>({});
  // Track whether the user picked from typeahead (suppresses suggestions after selection)
  const [suggestionPicked, setSuggestionPicked] = useState(false);

  // Typeahead: case-insensitive includes filter, capped at MAX_SUGGESTIONS
  const suggestions = useMemo(() => {
    const trimmed = brand.trim();
    if (suggestionPicked || trimmed.length === 0) return [];
    const lower = trimmed.toLowerCase();
    return LIQUOR_BRANDS.filter((b) =>
      b.brand.toLowerCase().includes(lower),
    ).slice(0, MAX_SUGGESTIONS);
  }, [brand, suggestionPicked]);

  const handleBrandChange = (text: string) => {
    setBrand(text);
    setSuggestionPicked(false);
    setErrors((e) => ({ ...e, brand: undefined }));
  };

  const handleSuggestionSelect = (item: { brand: string; category: LiquorCategory }) => {
    setBrand(item.brand);
    setCategory(item.category);
    setSuggestionPicked(true);
    setErrors({});
  };

  const handleCategorySelect = (cat: LiquorCategory) => {
    setCategory(cat);
    setErrors((e) => ({ ...e, category: undefined }));
  };

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!brand.trim()) errs.brand = 'Brand name is required';
    if (!category) errs.category = 'Select a category';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit(category!, brand.trim());
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>Add Liquor</Text>

          {/* Brand input */}
          <Text style={styles.label}>Brand</Text>
          {errors.brand && <Text style={styles.error}>{errors.brand}</Text>}
          <TextInput
            style={[styles.input, errors.brand ? styles.inputError : null]}
            placeholder="e.g. Maker's Mark"
            placeholderTextColor="#aaa"
            value={brand}
            onChangeText={handleBrandChange}
            autoCorrect={false}
            autoCapitalize="words"
          />

          {/* Typeahead suggestions */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => `${item.category}:${item.brand}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.suggestionRow}
                    onPress={() => handleSuggestionSelect(item)}
                  >
                    <Text style={styles.suggestionBrand}>{item.brand}</Text>
                    <Text style={styles.suggestionCategory}>
                      {CATEGORY_LABELS[item.category]}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Category selector */}
          <Text style={[styles.label, styles.categoryLabel]}>Category</Text>
          {errors.category && <Text style={styles.error}>{errors.category}</Text>}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            keyboardShouldPersistTaps="handled"
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, category === cat && styles.categoryChipSelected]}
                onPress={() => handleCategorySelect(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextSelected,
                  ]}
                >
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: color.borderStrong,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: color.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: color.textMuted,
    marginBottom: 6,
  },
  categoryLabel: {
    marginTop: 16,
  },
  error: {
    color: color.accent,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: color.text,
  },
  inputError: {
    borderColor: color.accent,
  },
  suggestionsContainer: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  suggestionBrand: {
    fontSize: 14,
    color: color.text,
    flex: 1,
  },
  suggestionCategory: {
    fontSize: 12,
    color: color.textMuted,
    marginLeft: 8,
  },
  categoryScroll: {
    flexGrow: 0,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.borderStrong,
    marginRight: 8,
    backgroundColor: color.surfaceRaised,
  },
  categoryChipSelected: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  categoryChipText: {
    fontSize: 13,
    color: color.textMuted,
  },
  categoryChipTextSelected: {
    color: color.text,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: color.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: color.accent,
    alignItems: 'center',
  },
  submitBtnText: {
    color: color.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
