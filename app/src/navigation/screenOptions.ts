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
  // Chevron only. iOS labels the back button with the previous screen's
  // title, and the tabs have none, so it fell back to the route name and
  // read "GroupTabs". Elsewhere the label was a long title like "Ledger —
  // Clemson Boys", which iOS lays out in full and then shrinks to "Back" or
  // drops once it collides with this screen's title: the back button
  // visibly grew, flickered and vanished on every push. Android shows no
  // label either way.
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: color.bg },
};
