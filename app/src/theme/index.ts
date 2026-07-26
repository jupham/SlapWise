import { Platform } from 'react-native';

/**
 * "Scoreboard" — the SlapWise visual direction.
 *
 * Clemson orange and regalia purple, because the group is Clemson Boys: the
 * accent carries a real signal rather than being a picked colour. Debts read
 * as a stat line — condensed caps, dark ground, one hot accent.
 */

export const color = {
  // Grounds, darkest to lightest.
  bg: '#0B0C0E',
  surface: '#111417',
  surfaceRaised: '#15181C',
  border: '#1D2126',
  borderStrong: '#2A3037',

  // Text.
  text: '#F4F5F6',
  textMuted: '#7E858E',
  textDim: '#565C64',

  // Accents.
  accent: '#F56600', // Clemson orange — primary actions, active state
  accentInk: '#0B0C0E', // text on an orange fill
  regalia: '#522D80', // Clemson purple — secondary marker

  // Semantic. Deliberately not orange-adjacent fills: destructive is an
  // outline treatment, so it never competes with the accent for attention.
  success: '#5BD08A',
  dangerText: '#E06666',
  dangerBorder: '#4A2020',
} as const;

export const font = {
  // Oswald, bundled via @expo-google-fonts/oswald and loaded in App.tsx, so
  // Android and iOS render identically. It replaced the previous per-platform
  // stand-ins (`sans-serif-condensed` / Avenir Next Condensed), which differed
  // noticeably in width and had no iOS equivalent at the right weight.
  //
  // Weight lives in the family name, not in fontWeight: React Native on Android
  // resolves a custom family plus a fontWeight by looking for a matching
  // synthetic variant, doesn't find one, and silently falls back to the system
  // face. Never pair these with fontWeight.
  condensed: 'Oswald_700Bold',
  condensedMedium: 'Oswald_600SemiBold',
  body: Platform.select({
    android: 'sans-serif',
    ios: 'System',
    default: 'System',
  }),
} as const;

export const size = {
  display: 30,
  title: 22,
  heading: 17,
  body: 15,
  caption: 12,
  label: 11,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  pill: 999,
} as const;

/** Section labels: small, tracked, uppercase — so they stop out-shouting content. */
export const label = {
  fontFamily: font.body,
  fontSize: size.label,
  fontWeight: '700' as const,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
  color: color.accent,
};

/** Screen titles: condensed caps, the scoreboard voice. */
export const title = {
  fontFamily: font.condensed,
  fontSize: size.display,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
  color: color.text,
};

/**
 * Stored usernames are email addresses (AuthService signs up with
 * `username: email`), which is what makes member lists hard to scan. Showing
 * the local part is a display-side stopgap; a real display-name field on the
 * player record is the actual fix.
 */
export function displayName(nameOrId: string | null | undefined): string {
  if (!nameOrId) return 'Unknown';
  const at = nameOrId.indexOf('@');
  return at > 0 ? nameOrId.slice(0, at) : nameOrId;
}
