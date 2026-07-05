import { useEffect, useRef } from 'react'
import { useSpring } from 'framer-motion'
import type { GrogEntry } from '@/types'
import { CATEGORY_COLORS } from '@/constants/grog'

// ── Constants ─────────────────────────────────────────────────────────────────

const SKULL_VB = 226.452
const SKULL_OFFSET = 48
const VB_WIDTH = SKULL_VB
const VB_HEIGHT = SKULL_VB + SKULL_OFFSET
const LIQUID_MAX_FILL = 0.9
const MAX_TILT = 18

// ── Skull paths ───────────────────────────────────────────────────────────────

const PATH_OUTER_CLIP =
  'M113.226,0C58.74,0,14.411,43.405,14.411,96.757c0,36.036,20.92,69.514,53.525,86.017' +
  'v39.561c0,2.274,1.842,4.117,4.117,4.117h86.463c2.276,0,4.117-1.844,4.117-4.117' +
  'v-41.766c30.542-17.287,49.408-49.175,49.408-83.812C212.041,43.405,167.712,0,113.226,0z'

const PATH_LEFT_EYE =
  'M104.899,101.552c-1.347-6.942-5.686-13.544-11.897-18.116' +
  'c-6.409-4.716-14.065-6.65-20.973-5.303c-9.831,1.91-17.149,12.364-19.835,16.771' +
  'c-5.464,8.946-7.929,18.373-6.598,25.212c0.985,5.087,4.536,11.377,15.826,12.466' +
  'c1.222,0.119,2.481,0.173,3.76,0.173c5.476,0,11.387-0.979,17.056-2.083' +
  'c7.121-1.383,13.361-4.869,17.571-9.815C104.452,115.403,106.262,108.546,104.899,101.552z' +
  'M93.536,115.52c-3.004,3.53-7.575,6.041-12.867,7.071' +
  'c-6.389,1.241-13.04,2.314-18.46,1.795c-6.642-0.641-8.042-3.311-8.532-5.84' +
  'c-0.921-4.732,1.255-12.33,5.541-19.352c4.286-7.018,9.931-12.113,14.378-12.979' +
  'c0.933-0.181,1.886-0.269,2.859-0.269c3.892,0,8.014,1.437,11.668,4.123' +
  'c4.564,3.359,7.732,8.118,8.693,13.054C97.935,108.871,95.651,113.037,93.536,115.52z'

const PATH_RIGHT_EYE =
  'M174.258,94.903c-2.686-4.407-10.004-14.861-19.835-16.771' +
  'c-6.912-1.355-14.563,0.587-20.973,5.303c-6.212,4.572-10.551,11.174-11.897,18.114' +
  'c-1.363,6.996,0.446,13.854,5.09,19.308c4.21,4.946,10.45,8.432,17.571,9.815' +
  'c5.67,1.104,11.58,2.083,17.056,2.083c1.278,0,2.537-0.054,3.76-0.173' +
  'c11.29-1.089,14.841-7.38,15.826-12.464C182.187,113.276,179.722,103.85,174.258,94.903z' +
  'M172.774,118.548c-0.49,2.527-1.89,5.197-8.532,5.838' +
  'c-5.42,0.515-12.07-0.555-18.46-1.795c-5.292-1.029-9.863-3.54-12.867-7.071' +
  'c-2.115-2.483-4.399-6.648-3.281-12.4c0.961-4.933,4.129-9.692,8.693-13.051' +
  'c4.568-3.361,9.859-4.76,14.527-3.854c4.447,0.866,10.092,5.961,14.378,12.979' +
  'C171.52,106.216,173.695,113.813,172.774,118.548z'

const PATH_NOSE1 = 'M100.874,135.871h8.235v16.469h-8.235z'
const PATH_NOSE2 = 'M117.343,135.871h8.235v16.469h-8.235z'
const PATH_TOOTH1 =
  'M92.639,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117' +
  'c2.275,0,4.117-1.844,4.117-4.117v-20.587C96.757,187.122,94.915,185.279,92.639,185.279z'
const PATH_TOOTH2 =
  'M133.812,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117' +
  's4.117-1.844,4.117-4.117v-20.587C137.93,187.122,136.088,185.279,133.812,185.279z'
const PATH_TOOTH3 =
  'M113.226,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117' +
  'c2.275,0,4.117-1.844,4.117-4.117v-20.587C117.343,187.122,115.502,185.279,113.226,185.279z'

const CX = 113.226
const SPOUT_W = 20
const SPOUT_TOP = 22
const SPOUT_BOT = SKULL_OFFSET
const CAP_W = 40
const CAP_TOP = 2
const CAP_BOT = 24
const CAP_R = 4

// ── Layer computation ─────────────────────────────────────────────────────────

interface SkullLayer {
  category: GrogEntry['category']
  heightFraction: number
  yFromBottom: number
}

function computeLayers(entries: GrogEntry[], bottleSize: number): SkullLayer[] {
  if (entries.length === 0 || bottleSize <= 0) return []
  const totalAmountMl = entries.reduce((s, e) => s + e.amountMl, 0)
  if (totalAmountMl <= 0) return []
  const fillLevel = Math.min(totalAmountMl / bottleSize, 1) * LIQUID_MAX_FILL
  let yFromBottom = 0
  return entries.map((entry) => {
    const layerFraction = (entry.amountMl / totalAmountMl) * fillLevel
    const layer: SkullLayer = { category: entry.category, heightFraction: layerFraction, yFromBottom }
    yFromBottom += layerFraction * SKULL_VB
    return layer
  })
}

function layerPath(layer: SkullLayer, tilt: number): string {
  const heightPx = layer.heightFraction * SKULL_VB
  const baseY = SKULL_OFFSET + SKULL_VB - layer.yFromBottom
  const topY = baseY - heightPx
  const extendedBottom = VB_HEIGHT + Math.abs(tilt) + 10
  return `M0,${extendedBottom} L${VB_WIDTH},${extendedBottom} L${VB_WIDTH},${topY + tilt} L0,${topY - tilt} Z`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  entries: GrogEntry[]
  bottleSize: number
  sloshTrigger?: number
  size?: number
}

export default function GrogSkull({ entries, bottleSize, sloshTrigger = 0, size = 260 }: Props) {
  const layerRefs = useRef<(SVGPathElement | null)[]>([])
  const layers = computeLayers(entries, bottleSize)
  const layersRef = useRef(layers)
  layersRef.current = layers

  // Framer Motion spring — same physics params as original RN component
  const tilt = useSpring(0, { damping: 2, stiffness: 25, mass: 2 })

  // Subscribe to spring changes and update SVG paths directly (no React re-render)
  useEffect(() => {
    return tilt.on('change', (value) => {
      layerRefs.current.forEach((el, i) => {
        const layer = layersRef.current[i]
        if (el && layer) {
          el.setAttribute('d', layerPath(layer, value))
        }
      })
    })
  }, [tilt])

  // Trigger slosh on prop change
  const prevTrigger = useRef(sloshTrigger)
  useEffect(() => {
    if (sloshTrigger !== prevTrigger.current) {
      prevTrigger.current = sloshTrigger
      tilt.set(MAX_TILT)
      setTimeout(() => tilt.set(0), 80)
    }
  }, [sloshTrigger, tilt])

  // Small slosh on mount so animation is visible immediately
  useEffect(() => {
    const id = setTimeout(() => {
      tilt.set(MAX_TILT * 0.5)
      setTimeout(() => tilt.set(0), 80)
    }, 300)
    return () => clearTimeout(id)
  }, [tilt])

  const skullT = `translate(0, ${SKULL_OFFSET})`
  const sx1 = CX - SPOUT_W / 2
  const sx2 = CX + SPOUT_W / 2
  const cx1 = CX - CAP_W / 2
  const cx2 = CX + CAP_W / 2
  const displayHeight = size * (VB_HEIGHT / VB_WIDTH)

  return (
    <svg
      width={size}
      height={displayHeight}
      viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <clipPath id="skull-clip">
          <path transform={skullT} d={PATH_OUTER_CLIP} />
        </clipPath>
      </defs>

      {/* Spout */}
      <path
        d={`M${sx1},${SPOUT_TOP} L${sx1},${SPOUT_BOT} L${sx2},${SPOUT_BOT} L${sx2},${SPOUT_TOP} Z`}
        fill="#1e1e1e" stroke="#ffffff" strokeWidth={1.5}
      />

      {/* Cap */}
      <path
        d={`M${cx1 + CAP_R},${CAP_TOP} L${cx2 - CAP_R},${CAP_TOP} Q${cx2},${CAP_TOP} ${cx2},${CAP_TOP + CAP_R} L${cx2},${CAP_BOT - CAP_R} Q${cx2},${CAP_BOT} ${cx2 - CAP_R},${CAP_BOT} L${cx1 + CAP_R},${CAP_BOT} Q${cx1},${CAP_BOT} ${cx1},${CAP_BOT - CAP_R} L${cx1},${CAP_TOP + CAP_R} Q${cx1},${CAP_TOP} ${cx1 + CAP_R},${CAP_TOP} Z`}
        fill="#2a2a2a" stroke="#ffffff" strokeWidth={1.5}
      />
      <path
        d={`M${cx1 + 7},${CAP_TOP + 3} L${cx1 + 7},${CAP_BOT - 3} M${cx2 - 7},${CAP_TOP + 3} L${cx2 - 7},${CAP_BOT - 3}`}
        stroke="rgba(255,255,255,0.25)" strokeWidth={1} fill="none"
      />

      {/* Skull base */}
      <path transform={skullT} d={PATH_OUTER_CLIP} fill="#111111" />

      {/* Liquid layers — refs updated directly by spring subscriber */}
      <g clipPath="url(#skull-clip)">
        {[...layers].reverse().map((layer, ri) => {
          const i = layers.length - 1 - ri
          return (
            <path
              key={`${layer.category}-${i}`}
              ref={(el) => { layerRefs.current[i] = el }}
              d={layerPath(layer, 0)}
              fill={CATEGORY_COLORS[layer.category]}
            />
          )
        })}
      </g>

      {/* Skull detail on top */}
      <path transform={skullT} d={PATH_OUTER_CLIP} stroke="#ffffff" strokeWidth={2} fill="none" />
      <path transform={skullT} d={PATH_LEFT_EYE}  fill="#111111" stroke="#cccccc" strokeWidth={0.5} />
      <path transform={skullT} d={PATH_RIGHT_EYE} fill="#111111" stroke="#cccccc" strokeWidth={0.5} />
      <path transform={skullT} d={PATH_NOSE1} fill="#111111" />
      <path transform={skullT} d={PATH_NOSE2} fill="#111111" />
      <path transform={skullT} d={PATH_TOOTH1} fill="#111111" stroke="#cccccc" strokeWidth={0.5} />
      <path transform={skullT} d={PATH_TOOTH2} fill="#111111" stroke="#cccccc" strokeWidth={0.5} />
      <path transform={skullT} d={PATH_TOOTH3} fill="#111111" stroke="#cccccc" strokeWidth={0.5} />
    </svg>
  )
}
