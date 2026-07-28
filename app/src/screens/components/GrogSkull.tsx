import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { GrogEntry } from '../../types';
import { CATEGORY_COLORS } from '../../constants/grog';
import { color } from '../../theme';

// ── Geometry ──────────────────────────────────────────────────────────────────
// A faceted glass skull, cut rather than moulded — straight edges only, to match
// the condensed type and the 2px radii the rest of the app is built from. The
// previous silhouette was CC0 clipart (a circle with a rectangular jaw) and was
// the one soft-cornered thing in a hard-cornered app.

/** The space the paths below are authored in. */
const CANVAS_W = 240;
const CANVAS_H = 300;
/** Visible window, trimmed to the ink so the skull isn't floating in padding. */
const VIEW = { x: 20, y: 0, w: 200, h: 296 };

/** The liquid lives between these two y values — crown to chin. */
const INNER_TOP = 44;
const INNER_BOTTOM = 292;
const INNER_H = INNER_BOTTOM - INNER_TOP;

/** Never fill to the very crown; a full skull should still read as glass. */
const LIQUID_MAX_FILL = 0.9;

// ── Slosh animation tuning ────────────────────────────────────────────────────
// How far the liquid surface tilts side to side (in SVG units)
const MAX_TILT = 18;
// Spring physics — adjust these to tune the slosh feel:
//   damping:  lower = more oscillations before settling (try 3–8)
//   stiffness: lower = slower oscillation frequency (try 10–30)
//   mass:     higher = heavier/slower feel (try 1–5)
const SLOSH_DAMPING = 2;
const SLOSH_STIFFNESS = 25;
const SLOSH_MASS = 2;

// ── Paths ─────────────────────────────────────────────────────────────────────

/** Outer silhouette. Right side is authored, left is its mirror about x=120. */
const PATH_SKULL =
  'M120,44L168,54L206,88L216,132' + // crown to the parietal, the widest point
  'L208,176L192,196' + // temple, pinched in
  'L204,212L196,232' + // zygomatic arch, back out
  'L170,246L162,262L146,292' + // and in hard to the chin
  'L94,292L78,262L70,246' +
  'L44,232L36,212' +
  'L48,196L32,176' +
  'L24,132L34,88L72,54Z';

/**
 * The right-hand plane, darkened. This is what sells "cut" — a faceted solid
 * reads from the change in value between planes, not from lines drawn on it.
 * Facet edges drawn as strokes look like cracks instead.
 */
const PATH_FACET = 'M120,44L168,54L206,88L216,132L208,176L192,196L120,150Z';

/** Sockets are asymmetric and tilted toward the nose. Regular polygons read as
 *  polygons; the taper is the whole difference between a socket and a pentagon. */
const PATH_EYE_LEFT = 'M34,138L74,116L118,142L114,170L96,196L58,182Z';
const PATH_EYE_RIGHT = 'M206,138L166,116L122,142L126,170L144,196L182,182Z';

/** Nasal aperture — the inverted heart, cut straight. */
const PATH_NOSE = 'M120,202L141,240L126,236L120,244L114,236L99,240Z';

/**
 * The mouth is engraved, not applied: the divisions between teeth are cut into
 * the glass and nothing is filled, so the liquid layers run through unbroken.
 * Solid teeth sit on top of the liquid and read as dentures.
 */
const PATH_MOUTH =
  'M84,252L156,252' +
  'M96,252L96,266M108,252L108,270M120,252L120,272M132,252L132,270M144,252L144,266';

/** Cork, cut to match. */
const PATH_CORK = 'M92,2L148,2L152,10L148,30L92,30L88,10Z';
const PATH_CORK_GRAIN = 'M94,12L146,12M95,21L145,21';
const PATH_NECK = 'M98,26L142,26L146,62L94,62Z';

/** Sheen down the upper-left plane. Sells the glass in one shape. */
const PATH_SHEEN = 'M42,150L48,96L92,58L74,102L58,152Z';

// ── Colours ───────────────────────────────────────────────────────────────────
// All derived from the theme. This file used to be the app's worst hex-literal
// offender (#ffffff / #111111 / #cccccc), which meant the skull drifted off the
// palette every time the palette moved.

const BONE = color.text;
const BONE_RIM = 'rgba(244,245,246,0.55)';
// Strong enough to hold up over a dark layer — the rum browns swallowed a
// hairline etch on device even though it read fine against the empty glass.
const ETCH = 'rgba(244,245,246,0.85)';
const SHEEN = 'rgba(244,245,246,0.10)';
const FACET = 'rgba(0,0,0,0.22)';
const MENISCUS = 'rgba(244,245,246,0.45)';
const SEAM = 'rgba(0,0,0,0.28)';

// ── Layer computation ─────────────────────────────────────────────────────────

/**
 * Fixed band order, so the stack doesn't reshuffle as amounts move around. The
 * palette's own key order does the job and keeps the two in step.
 */
const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS) as Array<GrogEntry['category']>;

/**
 * A band thinner than this is mostly its own seam line — you see the divider
 * without ever seeing the colour, which is what turned the old per-entry stack
 * into hatching. Such bands are dropped and the rest renormalised, so the
 * surface still lands at the right height.
 *
 * Nothing is lost by this: the contents list is the record of what is in the
 * grog, down to the last trace. The skull is only the picture of it.
 */
const MIN_BAND_UNITS = 1.5;

export interface SkullLayer {
  category: GrogEntry['category'];
  /** Share of the vessel's inner height this layer occupies, 0–1. */
  heightFraction: number;
  /** Where the layer's underside sits, as a fraction of inner height from the chin. */
  yFromBottomFraction: number;
}

/**
 * One band per liquor type, not per entry. `CATEGORY_COLORS` is keyed by
 * category, so two bourbons were already the same colour — splitting them drew
 * a seam through the middle of what looks like a single band.
 */
export function computeLayers(entries: GrogEntry[], bottleSize: number): SkullLayer[] {
  if (entries.length === 0 || bottleSize <= 0) return [];
  const totalAmountMl = entries.reduce((s, e) => s + e.amountMl, 0);
  if (totalAmountMl <= 0) return [];

  const byCategory = new Map<GrogEntry['category'], number>();
  for (const entry of entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amountMl);
  }
  const present = CATEGORY_ORDER.map((category) => ({
    category,
    amountMl: byCategory.get(category) ?? 0,
  })).filter((c) => c.amountMl > 0);
  if (present.length === 0) return [];

  const fillLevel = Math.min(totalAmountMl / bottleSize, 1) * LIQUID_MAX_FILL;
  const minShare = MIN_BAND_UNITS / (fillLevel * INNER_H);
  let visible = present.filter((c) => c.amountMl / totalAmountMl >= minShare);
  // A grog holding one trace liquor still has to draw something.
  if (visible.length === 0) {
    visible = [present.reduce((a, b) => (b.amountMl > a.amountMl ? b : a))];
  }

  const visibleMl = visible.reduce((s, c) => s + c.amountMl, 0);
  let yFromBottomFraction = 0;
  return visible.map(({ category, amountMl }) => {
    const heightFraction = (amountMl / visibleMl) * fillLevel;
    const layer: SkullLayer = { category, heightFraction, yFromBottomFraction };
    yFromBottomFraction += heightFraction;
    return layer;
  });
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── Liquid ────────────────────────────────────────────────────────────────────
// Each layer is its own component rather than a `useAnimatedProps` call inside a
// `.map()`. The old shape changed the hook count whenever an entry was added or
// removed, which React refuses to re-render through.

/** Top edge of a layer, tilted by `tilt`. Shared by the fill and the surface line. */
function surfaceEdge(layer: SkullLayer, tilt: number): { left: number; right: number } {
  'worklet';
  const topY = INNER_BOTTOM - (layer.yFromBottomFraction + layer.heightFraction) * INNER_H;
  return { left: topY - tilt, right: topY + tilt };
}

function LiquidLayer({ layer, tilt }: { layer: SkullLayer; tilt: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    const { left, right } = surfaceEdge(layer, tilt.value);
    // Extend well past the chin so tilted layers never leave a seam beneath them.
    const bottom = CANVAS_H + Math.abs(tilt.value) + 10;
    return { d: `M0,${bottom} L${CANVAS_W},${bottom} L${CANVAS_W},${right} L0,${left} Z` };
  });
  return <AnimatedPath animatedProps={animatedProps} fill={CATEGORY_COLORS[layer.category]} />;
}

/**
 * The line along a layer's top edge. On the topmost layer it's a bright
 * meniscus; below that it's a dark seam, which is the only thing keeping five
 * adjacent whiskies from merging into one brown block.
 */
function LiquidSurface({
  layer,
  tilt,
  isTop,
}: {
  layer: SkullLayer;
  tilt: SharedValue<number>;
  isTop: boolean;
}) {
  const animatedProps = useAnimatedProps(() => {
    const { left, right } = surfaceEdge(layer, tilt.value);
    return { d: `M0,${left} L${CANVAS_W},${right}` };
  });
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke={isTop ? MENISCUS : SEAM}
      strokeWidth={isTop ? 2.5 : 1}
      fill="none"
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface GrogSkullRef {
  /** Trigger a slosh with intensity 0–1 (1 = full MAX_TILT) */
  slosh: (intensity: number) => void;
}

interface Props {
  entries: GrogEntry[];
  bottleSize: number;
  /** When true: skull drops in with spring animation on mount */
  animate: boolean;
  /** When true: liquid sloshes and settles on mount */
  slosh?: boolean;
}

const GrogSkull = forwardRef<GrogSkullRef, Props>(
  function GrogSkull({ entries, bottleSize, animate, slosh = true }, ref) {
  const { width: screenWidth } = useWindowDimensions();
  // Sized to leave the grog history below it room to breathe — the history is
  // the part of this screen that grows.
  const displayWidth = Math.min(screenWidth * 0.55, 240);
  const displayHeight = displayWidth * (VIEW.h / VIEW.w);

  // Drop animation
  const dropY = useSharedValue(animate ? -displayHeight * 1.5 : 0);

  // Tilt: kicked to MAX_TILT, springs to 0 (liquid settling)
  // Positive = left side higher, negative = right side higher
  const tilt = useSharedValue(0);

  // Expose slosh() so parent screens can trigger it from scroll events
  useImperativeHandle(ref, () => ({
    slosh: (intensity: number) => {
      const clampedIntensity = Math.min(Math.max(intensity, 0), 1);
      tilt.value = MAX_TILT * clampedIntensity;
      tilt.value = withSpring(0, {
        damping: SLOSH_DAMPING,
        stiffness: SLOSH_STIFFNESS,
        mass: SLOSH_MASS,
      });
    },
  }));

  const layers = computeLayers(entries, bottleSize);

  useEffect(() => {
    if (animate) {
      dropY.value = withSpring(0, { damping: 12, stiffness: 100 });
    } else {
      dropY.value = 0;
    }
  }, [animate, dropY]);

  useEffect(() => {
    if (slosh) {
      // Kick the tilt to MAX_TILT, spring back to 0 with low damping so it oscillates
      tilt.value = MAX_TILT;
      tilt.value = withSpring(0, {
        damping: SLOSH_DAMPING,
        stiffness: SLOSH_STIFFNESS,
        mass: SLOSH_MASS,
      });
    } else {
      tilt.value = 0;
    }
  }, [slosh, tilt]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dropY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Svg
        width={displayWidth}
        height={displayHeight}
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      >
        <Defs>
          <ClipPath id="grog-skull-clip">
            <Path d={PATH_SKULL} />
          </ClipPath>
          <LinearGradient id="grog-glass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.border} />
            <Stop offset="0.55" stopColor={color.surface} />
            <Stop offset="1" stopColor={color.bg} />
          </LinearGradient>
        </Defs>

        {/* Neck, drawn first so the cranium covers where the two meet */}
        <Path d={PATH_NECK} fill={color.surface} stroke={BONE_RIM} strokeWidth={1.5} />

        {/* Cork */}
        <Path d={PATH_CORK} fill={color.surfaceRaised} stroke={BONE_RIM} strokeWidth={1.5} />
        <Path
          d={PATH_CORK_GRAIN}
          stroke="rgba(244,245,246,0.18)"
          strokeWidth={1}
          fill="none"
        />

        {/* Empty vessel */}
        <Path d={PATH_SKULL} fill="url(#grog-glass)" />

        {/* Liquid. Fills first, bottom layer painted last so it sits over the
            ones above it — each layer's path runs from its own surface all the
            way down. Then every surface line on top of every fill. Sheen and
            facet last, so the glass reads over the liquid rather than under. */}
        <G clipPath="url(#grog-skull-clip)">
          {[...layers].reverse().map((layer, i) => (
            <LiquidLayer key={`fill-${layers.length - 1 - i}`} layer={layer} tilt={tilt} />
          ))}
          {layers.map((layer, i) => (
            <LiquidSurface
              key={`surface-${i}`}
              layer={layer}
              tilt={tilt}
              isTop={i === layers.length - 1}
            />
          ))}
          <Path d={PATH_SHEEN} fill={SHEEN} />
          <Path d={PATH_FACET} fill={FACET} />
        </G>

        {/* Bone. Everything below is opaque or engraved, so it reads at any fill. */}
        <Path d={PATH_SKULL} fill="none" stroke={BONE} strokeWidth={2.5} opacity={0.85} />
        <Path d={PATH_EYE_LEFT} fill={color.bg} stroke={BONE_RIM} strokeWidth={2} />
        <Path d={PATH_EYE_RIGHT} fill={color.bg} stroke={BONE_RIM} strokeWidth={2} />
        <Path d={PATH_NOSE} fill={color.bg} stroke={BONE_RIM} strokeWidth={1.5} />
        <Path d={PATH_MOUTH} stroke={ETCH} strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});

export default GrogSkull;
