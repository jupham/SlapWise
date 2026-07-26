import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { color, font, size } from '../theme';


/**
 * Header chrome for every screen pushed above the tabs.
 *
 * Without this the native stack falls back to the platform's white header, so
 * tapping into a detail screen from a dark tab flashed a white bar and a blue
 * back chevron.
 *
 * `contentStyle` sets the dark ground on the screen container itself, which
 * means a screen whose own styles haven't been themed yet still lands on the
 * right background instead of default white.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: color.bg },
  headerTintColor: color.accent,
  headerTitleStyle: {
    fontFamily: font.condensed,
    fontSize: size.title,
    color: color.text,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: color.bg },
};
