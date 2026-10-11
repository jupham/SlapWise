import React from 'react';
import { Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { color } from '../../theme';

// The root of every screen with a text field. iOS does not move content out
// from under the keyboard, and its number pads have no return key, so a plain
// View leaves the keyboard covering whatever sits below the field — the Sign
// In screen's Register link, for one — with no way to put it away. Android's
// window resizes for the keyboard on its own, which is why this went unseen
// until the first TestFlight build.
//
// automaticallyAdjustKeyboardInsets (iOS) pads the scroll by the keyboard's
// height, so anything it covers can be scrolled to. "handled" lets a tap on a
// button land first time while a tap anywhere else dismisses the keyboard, and
// dragging the content pulls it down.
//
// Give the screen's container style as contentContainerStyle, with flexGrow: 1
// in place of flex: 1 — flex: 1 pins the content to the viewport and it can
// never scroll.
export default function FormScroll({ style, contentContainerStyle, children, ...rest }: ScrollViewProps) {
  return (
    <ScrollView
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1 },
});
