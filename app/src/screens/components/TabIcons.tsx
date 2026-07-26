import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Tab bar icons. These replace the emoji the tab bar used to render: emoji
 * ignore tintColor, so the active tab could not take the accent, and they sit
 * on their own baseline against condensed labels.
 */

type IconProps = { color: string; size?: number };

const STROKE = 1.7;

export function FeedIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v14H4z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M7 9h6M7 13h10M7 16h7" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function SlateIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h12v18H6z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M9 8h6M9 12h6M9 16h3" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function GrogIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9h12l-1 11H7z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path
        d="M18 11h2a2 2 0 010 4h-2M9 9V5h6v4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CrewIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3} stroke={color} strokeWidth={STROKE} />
      <Circle cx={17} cy={9} r={2.4} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15.5 19c0-2 1.4-3.4 3.2-3.4S22 17 22 19"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}
