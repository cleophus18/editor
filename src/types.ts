export type MediaKind = 'video' | 'image' | 'audio'
export type TrackKind = 'video' | 'overlay' | 'text' | 'subtitle' | 'audio'
export type FilterPresetId = string
export type FilterCategory =
  | 'Cinematic' | 'Hollywood' | 'Vintage and Retro' | 'Film Grain' | 'Dark and Moody'
  | 'Bright and Clean' | 'Warm Tones' | 'Cool Tones' | 'Black and White' | 'Anime Inspired'
  | 'Gaming and Neon' | 'Street and Urban' | 'Portrait' | 'Nature' | 'Sunset' | 'Night'
  | 'VHS and Analog' | 'Social Media' | 'Custom User Presets'

export type TransitionKind = string

export interface FilterParameters {
  brightness: number
  contrast: number
  saturation: number
  exposure: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  fade: number
  vignette: number
  grain: number
  sepia: number
  grayscale: number
  hue: number
}

export interface FilterPreset {
  id: FilterPresetId
  name: string
  description: string
  category: FilterCategory
  parameters: FilterParameters
  packId?: string
  thumbnail?: string
}

export interface AppliedFilter {
  id: string
  presetId: FilterPresetId
  enabled: boolean
  intensity: number
  parameters: FilterParameters
  packId?: string
}

export type TransitionCategory =
  | 'Basic' | 'Cinematic' | 'Camera Movement' | 'Zoom' | 'Motion Blur' | 'Glitch'
  | 'Light Leaks' | 'Flash' | 'Swipe' | 'Spin' | 'Distortion' | 'Retro' | 'Social Media' | 'Creative'

export interface TransitionPreset {
  id: TransitionKind
  name: string
  description: string
  category: TransitionCategory
  effect: string
  packId?: string
  thumbnail?: string
}

export interface ClipTransition {
  kind: TransitionKind
  effect?: string
  packId?: string
  duration: number
  direction?: 'left' | 'right' | 'up' | 'down'
  intensity?: number
  speed?: number
  easing?: EasingType
}

export interface EffectPackAsset {
  id: string
  kind: 'thumbnail' | 'overlay' | 'texture' | 'audio' | 'lut'
  mime: string
  license: string
  data?: string
  externalUrl?: string
}

export interface EffectPack {
  format: 'frameforge-effect-pack'
  schemaVersion: 1
  id: string
  version: string
  name: string
  description: string
  thumbnail: string
  author: string
  license: string
  compatibleAppVersion: string
  requiredAssets: EffectPackAsset[]
  filters?: FilterPreset[]
  transitions?: TransitionPreset[]
}

export interface ProjectFont {
  id: string
  name: string
  family: string
  blob: Blob
  addedAt: number
}

export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  mime: string
  size: number
  duration: number
  width: number
  height: number
  addedAt: number
  blob: Blob
  url?: string
}

export interface StickerAsset extends MediaAsset {
  sticker?: true
  stickerCategory?: StickerCategory
}

export type AnimatableProperty = 'positionX' | 'positionY' | 'scale' | 'rotation' | 'opacity' | 'volume'
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier'

export interface ClipKeyframe {
  id: string
  /** Seconds from the clip start (timeline position is clip.start + time). */
  time: number
  value: number
  easing: EasingType
}

export interface ClipKeyframes {
  properties?: Partial<Record<AnimatableProperty, ClipKeyframe[]>>
}

export interface Sticker {
  id: string
  name: string
  category: 'emoji' | 'shape' | 'arrow' | 'heart' | 'decorative' | 'animated' | 'custom'
  url: string
  type: 'image' | 'gif'
  width: number
  height: number
}

export type StickerCategory = 'emoji' | 'shape' | 'arrow' | 'heart' | 'decorative' | 'animated' | 'custom'

export interface TimelineClip {
  id: string
  mediaId?: string
  track: TrackKind
  name: string
  start: number
  inPoint: number
  duration: number
  speed: number
  volume: number
  muted: boolean
  keyframes?: ClipKeyframes
  /** Audio fade in/out in seconds, applied to the clip's own volume envelope. */
  fadeIn?: number
  fadeOut?: number
  /** Group id for grouped clip editing (multi-clip selection as one unit). */
  groupId?: string
  positionX?: number
  positionY?: number
  scale?: number
  rotation?: number
  opacity?: number
  /** Image/sticker crop in percent (0-100). Inset from each edge. */
  cropLeft?: number
  cropTop?: number
  cropRight?: number
  cropBottom?: number
  overlayLayoutConfigured?: boolean
  overlayLayer?: number
  text?: string
  color?: string
  fontSize?: number
  fontFamily?: string
  transitionIn?: ClipTransition
  filters?: AppliedFilter[]
  /** Extended keyframes with Bézier curve support (Phase 2). */
  keyframesExtended?: ClipKeyframesExtended
  /** Speed ramp for variable-speed playback (Phase 2). */
  speedRamp?: SpeedRamp
  /** Masks applied to this clip (Phase 3). */
  masks?: TimelineMask[]
  /** Chroma key settings (Phase 3). */
  chromaKey?: ChromaKeySettings
  /** Blend mode for compositing (Phase 3). */
  blendMode?: BlendModeSettings
  /** Color grade for this clip (Phase 3). */
  colorGrade?: ColorGrade
  /** Audio effects for this clip/track (Phase 4). */
  audioEffects?: AudioEffect[]
  /** Typography controls for text clips (Phase 4). */
  typography?: TypographyControls
  /** Text decoration (outline, shadow, background, gradient) (Phase 4). */
  textDecoration?: TextDecoration
  /** Text animation preset (Phase 4). */
  textAnimation?: TextAnimation
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  color?: string
}

export interface EditorProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  fps: number
  clips: TimelineClip[]
  media: MediaAsset[]
  stickers: StickerAsset[]
  fonts: ProjectFont[]
  customFilterPresets?: FilterPreset[]
  effectPacks?: EffectPack[]
  favoriteEffectIds?: string[]
  recentEffectIds?: string[]
  markers?: TimelineMarker[]
  hiddenTracks?: TrackKind[]
  mutedTracks?: TrackKind[]
  settings: {
    brightness: number
    contrast: number
    saturation: number
    blur: number
    aspectRatio: string
    filterPreset?: FilterPresetId
    filterIntensity?: number
    filterStack?: AppliedFilter[]
  }
  tracks?: TimelineTrack[]
  speedRamps?: Record<string, SpeedRamp>
  masks?: Record<string, TimelineMask[]>
  chromaKey?: Record<string, ChromaKeySettings>
  blendModes?: Record<string, BlendModeSettings>
  colorGrades?: Record<string, ColorGrade>
  audioEffects?: Record<string, AudioEffect[]>
  audioTrackStates?: AudioTrackState[]
  typography?: Record<string, TypographyControls>
  textDecoration?: Record<string, TextDecoration>
  textAnimation?: Record<string, TextAnimation>
  motionGraphicsTemplates?: MotionGraphicsTemplate[]
  silentRegions?: SilenceRegion[]
  beatMarkers?: BeatMarker[]
  exportQueue?: ExportJob[]
  autosaveEnabled?: boolean
  version?: number
  customKeyboardShortcuts?: Record<string, string>
  workspaceLayout?: string
  proxyMedia?: Record<string, string>
}

const neutral: FilterParameters = {
  brightness: 100, contrast: 100, saturation: 100, exposure: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0, sepia: 0, grayscale: 0, hue: 0,
}

const filter = (
  id: string, name: string, category: FilterCategory, description: string,
  values: Partial<FilterParameters>,
): FilterPreset => ({ id, name, category, description, parameters: { ...neutral, ...values } })

export const FILTER_CATEGORIES: FilterCategory[] = [
  'Cinematic', 'Hollywood', 'Vintage and Retro', 'Film Grain', 'Dark and Moody', 'Bright and Clean',
  'Warm Tones', 'Cool Tones', 'Black and White', 'Anime Inspired', 'Gaming and Neon',
  'Street and Urban', 'Portrait', 'Nature', 'Sunset', 'Night', 'VHS and Analog', 'Social Media',
  'Custom User Presets',
]

export const FILTER_PRESETS: FilterPreset[] = [
  filter('none', 'Original', 'Bright and Clean', 'Unaltered source color', {}),
  filter('cinematic', 'Midnight Cinema', 'Cinematic', 'Restrained color with rich film contrast', { brightness: 97, contrast: 119, saturation: 86, temperature: -5, highlights: -18, shadows: -8, vignette: 16 }),
  filter('golden-hour', 'Golden Hour', 'Sunset', 'Honeyed sunlight and warm highlights', { brightness: 104, contrast: 106, saturation: 118, temperature: 28, highlights: 17, shadows: 8, sepia: 12 }),
  filter('teal-orange', 'Teal and Orange', 'Hollywood', 'Cool shadows balanced with warm skin tones', { contrast: 115, saturation: 111, temperature: 5, tint: 8, highlights: 18, shadows: -12, hue: -5 }),
  filter('vintage', 'Vintage Film', 'Vintage and Retro', 'Soft contrast and gently faded color', { brightness: 104, contrast: 88, saturation: 78, temperature: 13, fade: 18, grain: 14, sepia: 16 }),
  filter('retro-vhs', 'Retro VHS', 'VHS and Analog', 'Muted analog color with a worn tape finish', { contrast: 91, saturation: 82, temperature: 7, tint: 8, fade: 14, grain: 25, hue: 5 }),
  filter('dreamy-glow', 'Dreamy Glow', 'Portrait', 'Soft highlights and airy pastels', { brightness: 108, contrast: 91, saturation: 92, temperature: 8, highlights: 24, fade: 10 }),
  filter('cold-blue', 'Cold Blue', 'Cool Tones', 'Steel-blue temperature with crisp detail', { brightness: 102, contrast: 108, saturation: 90, temperature: -28, tint: -4, hue: 6 }),
  filter('warm-skin', 'Warm Skin', 'Portrait', 'Flattering warmth with controlled saturation', { brightness: 103, contrast: 98, saturation: 105, temperature: 17, tint: 5, highlights: 8, shadows: 8 }),
  filter('moody-shadows', 'Moody Shadows', 'Dark and Moody', 'Dense shadows and subdued highlights', { brightness: 94, contrast: 123, saturation: 83, exposure: -0.2, highlights: -21, shadows: -22, vignette: 21 }),
  filter('neon-nights', 'Neon Nights', 'Gaming and Neon', 'Electric color and luminous contrast', { brightness: 104, contrast: 124, saturation: 145, temperature: -8, tint: 20, hue: 8 }),
  filter('soft-portrait', 'Soft Portrait', 'Portrait', 'Gentle skin-friendly lift and soft contrast', { brightness: 105, contrast: 94, saturation: 96, temperature: 7, highlights: 9, shadows: 12 }),
  filter('noir', 'Noir', 'Black and White', 'Deep monochrome with sculpted contrast', { contrast: 140, grayscale: 100, highlights: -10, shadows: -8, vignette: 18 }),
  filter('sunset-glow', 'Sunset Glow', 'Sunset', 'Amber light with rosy tint', { brightness: 106, contrast: 103, saturation: 126, temperature: 32, tint: 11, highlights: 24, sepia: 13 }),
  filter('urban-contrast', 'Urban Contrast', 'Street and Urban', 'Hard city contrast and gritty color', { contrast: 132, saturation: 91, temperature: -4, shadows: -18, grain: 8 }),
  filter('faded-memories', 'Faded Memories', 'Vintage and Retro', 'Low contrast with nostalgic warmth', { brightness: 106, contrast: 82, saturation: 72, temperature: 16, fade: 27, grain: 10, sepia: 9 }),
  filter('clean-commercial', 'Clean Commercial', 'Bright and Clean', 'Bright neutral color for polished product footage', { brightness: 105, contrast: 103, saturation: 105, highlights: 9, shadows: 8 }),
  filter('film-camera', 'Film Camera', 'Film Grain', 'Organic grain and classic film response', { contrast: 106, saturation: 92, temperature: 5, highlights: -8, fade: 8, grain: 18 }),
  filter('cyberpunk', 'Cyberpunk', 'Gaming and Neon', 'High-energy magenta and cyan night color', { contrast: 128, saturation: 151, temperature: -14, tint: 28, hue: 13, vignette: 14 }),
  filter('pastel-dream', 'Pastel Dream', 'Anime Inspired', 'Light, soft color with pastel lift', { brightness: 110, contrast: 88, saturation: 112, temperature: 10, tint: 7, fade: 13 }),
  filter('high-contrast-sport', 'High Contrast Sport', 'Street and Urban', 'Punchy detail and bold saturated color', { contrast: 133, saturation: 122, brightness: 103, highlights: 7, shadows: -14 }),
  filter('hollywood-gold', 'Hollywood Gold', 'Hollywood', 'Classic rich warmth and luminous highlights', { contrast: 116, saturation: 108, temperature: 20, highlights: 20, shadows: -6, sepia: 6 }),
  filter('blockbuster', 'Blockbuster', 'Cinematic', 'Large-format depth with bold cool shadows', { contrast: 122, saturation: 103, temperature: -8, highlights: 12, shadows: -13, vignette: 12 }),
  filter('silver-screen', 'Silver Screen', 'Black and White', 'Smooth neutral monochrome', { contrast: 109, grayscale: 100, highlights: 5, shadows: 7 }),
  filter('grainy-16mm', 'Grainy 16mm', 'Film Grain', 'Visible fine grain and lifted film blacks', { contrast: 92, saturation: 88, fade: 12, grain: 38, temperature: 4 }),
  filter('deep-shadow', 'Deep Shadow', 'Dark and Moody', 'Low-key image with cool, dense blacks', { brightness: 91, contrast: 128, saturation: 88, exposure: -0.35, temperature: -9, shadows: -28, vignette: 24 }),
  filter('high-key', 'High Key', 'Bright and Clean', 'Bright exposure and soft shadow detail', { brightness: 112, contrast: 94, exposure: 0.25, highlights: 11, shadows: 20 }),
  filter('amber-glass', 'Amber Glass', 'Warm Tones', 'Amber-tinted warmth with gentle contrast', { temperature: 30, saturation: 106, contrast: 102, sepia: 15 }),
  filter('arctic-glass', 'Arctic Glass', 'Cool Tones', 'Clean icy palette and open highlights', { temperature: -32, tint: -3, saturation: 91, highlights: 13 }),
  filter('mono-matte', 'Mono Matte', 'Black and White', 'Matte monochrome with softened blacks', { grayscale: 100, contrast: 91, fade: 17 }),
  filter('anime-pop', 'Anime Pop', 'Anime Inspired', 'Vivid clean color with crisp contrast', { brightness: 106, contrast: 118, saturation: 137, hue: -3 }),
  filter('arcade-80s', 'Arcade 80s', 'Gaming and Neon', 'Retro arcade color with violet energy', { contrast: 118, saturation: 138, tint: 23, hue: 12, grain: 8 }),
  filter('concrete-jungle', 'Concrete Jungle', 'Street and Urban', 'Desaturated city grit with firm blacks', { contrast: 124, saturation: 76, temperature: -7, shadows: -16, grain: 12 }),
  filter('porcelain', 'Porcelain', 'Portrait', 'Soft neutral portrait tones', { brightness: 107, contrast: 90, saturation: 88, temperature: 6, highlights: 11, shadows: 11 }),
  filter('forest-mist', 'Forest Mist', 'Nature', 'Gentle greens and atmospheric lifted shadows', { contrast: 95, saturation: 94, temperature: -5, tint: -8, fade: 10, shadows: 13 }),
  filter('verdant', 'Verdant', 'Nature', 'Rich foliage and warm natural light', { contrast: 109, saturation: 119, temperature: 8, tint: -9, highlights: 8 }),
  filter('blue-hour', 'Blue Hour', 'Night', 'Deep blue dusk and subtle cinematic contrast', { brightness: 92, contrast: 113, saturation: 91, temperature: -27, exposure: -0.2, vignette: 13 }),
  filter('city-after-dark', 'City After Dark', 'Night', 'Cool nighttime blacks with neon-friendly color', { contrast: 126, saturation: 113, temperature: -15, shadows: -19, vignette: 18 }),
  filter('tape-static', 'Tape Static', 'VHS and Analog', 'Faded tape color and prominent grain', { brightness: 103, contrast: 87, saturation: 75, temperature: 3, hue: 4, fade: 19, grain: 32 }),
  filter('social-bright', 'Social Bright', 'Social Media', 'Bright saturated look for small-screen viewing', { brightness: 108, contrast: 111, saturation: 123, highlights: 8, shadows: 9 }),
  filter('creator-warmth', 'Creator Warmth', 'Social Media', 'Warm, lively color for creator footage', { brightness: 105, contrast: 104, saturation: 116, temperature: 14, tint: 4 }),
]

export const TRANSITION_CATEGORIES: TransitionCategory[] = [
  'Basic', 'Cinematic', 'Camera Movement', 'Zoom', 'Motion Blur', 'Glitch', 'Light Leaks',
  'Flash', 'Swipe', 'Spin', 'Distortion', 'Retro', 'Social Media', 'Creative',
]

const transition = (
  id: TransitionKind, name: string, category: TransitionCategory, effect: string, description: string,
): TransitionPreset => ({ id, name, category, effect, description })

export const TRANSITION_PRESETS: TransitionPreset[] = [
  transition('dissolve', 'Cross Dissolve', 'Basic', 'dissolve', 'Blend the outgoing and incoming frames'),
  transition('fade', 'Fade Through Black', 'Basic', 'fade-black', 'Dip to black between clips'),
  transition('fade-white', 'Fade Through White', 'Flash', 'fade-white', 'Bright dip between clips'),
  transition('zoom-in', 'Smooth Zoom In', 'Zoom', 'zoom-in', 'Scale into the incoming shot'),
  transition('zoom-out', 'Smooth Zoom Out', 'Zoom', 'zoom-out', 'Pull back to reveal the incoming shot'),
  transition('whip-pan', 'Whip Pan', 'Camera Movement', 'whip', 'Fast directional camera sweep'),
  transition('motion-blur', 'Motion Blur Swipe', 'Motion Blur', 'motion-blur', 'Swipe with a directional blur'),
  transition('camera-shake', 'Camera Shake', 'Camera Movement', 'shake', 'Brief handheld camera impact'),
  transition('glitch', 'Glitch Cut', 'Glitch', 'glitch', 'Digital stepped reveal'),
  transition('rgb-split', 'RGB Split', 'Glitch', 'rgb', 'Chromatic edge split into the next shot'),
  transition('flash', 'Flash Transition', 'Flash', 'flash', 'Bright camera flash reveal'),
  transition('light-leak', 'Light Leak', 'Light Leaks', 'light-leak', 'Warm light leak sweeps across frame'),
  transition('film-burn', 'Film Burn', 'Light Leaks', 'film-burn', 'Warm film-burn style flash'),
  transition('spin', 'Spin Transition', 'Spin', 'spin', 'Rotate into the incoming shot'),
  transition('wipe', 'Directional Wipe', 'Swipe', 'wipe-left', 'Reveal from left to right'),
  transition('push-left', 'Push Left', 'Swipe', 'push-left', 'Push the outgoing image to the left'),
  transition('push-right', 'Push Right', 'Swipe', 'push-right', 'Push the outgoing image to the right'),
  transition('push-up', 'Push Up', 'Swipe', 'push-up', 'Push the outgoing image upward'),
  transition('push-down', 'Push Down', 'Swipe', 'push-down', 'Push the outgoing image downward'),
  transition('blur-dissolve', 'Blur Dissolve', 'Cinematic', 'blur-dissolve', 'Soft focus blend between images'),
  transition('radial-zoom', 'Radial Zoom', 'Zoom', 'radial-zoom', 'Zoom through the center of the frame'),
  transition('digital-distortion', 'Digital Distortion', 'Distortion', 'distortion', 'Color-shifted digital reveal'),
  transition('split-reveal', 'Split Screen Reveal', 'Creative', 'split', 'Open the shot from the center'),
  transition('lens-zoom', 'Lens Zoom', 'Zoom', 'lens-zoom', 'Optical-style zoom with a soft focus edge'),
  transition('film-reel', 'Film Reel', 'Retro', 'film-reel', 'Projector-inspired rotating reveal'),
  transition('vhs-glitch', 'VHS Glitch', 'Retro', 'vhs', 'Analog color glitch reveal'),
  transition('mask-reveal', 'Mask Reveal', 'Creative', 'mask', 'Clean horizontal mask reveal'),
  transition('circle-reveal', 'Circle Reveal', 'Creative', 'circle', 'Expand a circular reveal from center'),
  transition('speed-ramp', 'Smooth Speed Ramp', 'Social Media', 'speed-ramp', 'Accelerate through a soft transition'),
  transition('cinematic-reveal', 'Cinematic Reveal', 'Cinematic', 'cinematic', 'Reveal through a cinematic letterbox mask'),
  transition('wipe-right', 'Wipe Right to Left', 'Swipe', 'wipe-right', 'Reveal from right to left'),
  transition('wipe-up', 'Wipe Up', 'Swipe', 'wipe-up', 'Reveal from bottom to top'),
  transition('wipe-down', 'Wipe Down', 'Swipe', 'wipe-down', 'Reveal from top to bottom'),
  transition('slide', 'Slide In', 'Swipe', 'push-left', 'Slide the incoming clip in from the right'),
]

export const FILTER_PRESET_BY_ID = new Map(FILTER_PRESETS.map((preset) => [preset.id, preset]))
export const TRANSITION_PRESET_BY_ID = new Map(TRANSITION_PRESETS.map((preset) => [preset.id, preset]))

export const makeAppliedFilter = (preset: FilterPreset, intensity = 100): AppliedFilter => ({
  id: crypto.randomUUID(),
  presetId: preset.id,
  enabled: true,
  intensity,
  parameters: { ...preset.parameters },
  packId: preset.packId,
})

export const effectiveFilters = (settings: EditorProject['settings'], clipFilters: AppliedFilter[] = []) => {
  const projectFilters = settings.filterStack?.length
    ? settings.filterStack
    : settings.filterPreset && settings.filterPreset !== 'none'
      ? [makeLegacyFilter(settings.filterPreset, settings.filterIntensity ?? 100)]
      : []
  return [...projectFilters, ...clipFilters].filter((item) => item.enabled)
}

const makeLegacyFilter = (presetId: string, intensity: number): AppliedFilter => {
  const preset = FILTER_PRESET_BY_ID.get(presetId) ?? FILTER_PRESETS[0]
  return { id: `legacy-${presetId}`, presetId, enabled: true, intensity, parameters: preset.parameters, packId: preset.packId }
}

export const filterCss = (settings: EditorProject['settings'], clipFilters: AppliedFilter[] = []) => {
  const filters = effectiveFilters(settings, clipFilters)
  let brightness = settings.brightness
  let contrast = settings.contrast
  let saturation = settings.saturation
  let sepia = 0
  let grayscale = 0
  let hue = 0
  for (const applied of filters) {
    const mix = Math.max(0, Math.min(100, applied.intensity)) / 100
    const p = applied.parameters
    const exp = Math.max(0, Math.min(5, p.exposure))
    brightness *= 1 + ((p.brightness / 100) * 2 ** exp - 1) * mix
    const curve = 1 + (p.contrast / 100) * mix
    contrast = 1 + (contrast - 1) * curve
    saturation *= 1 + ((p.saturation / 100) - 1) * mix
    sepia += p.sepia * mix
    grayscale += p.grayscale * mix
    hue += (p.hue + p.tint * 0.14) * mix
    brightness *= 1 + (p.shadows + p.highlights * 0.25) / 100 * mix
  }
  return [
    `brightness(${brightness}%)`, `contrast(${contrast}%)`, `saturate(${saturation}%)`,
    `sepia(${Math.min(100, sepia)}%)`, `grayscale(${Math.min(100, grayscale)}%)`,
    `hue-rotate(${hue}deg)`, `blur(${settings.blur}px)`,
  ].join(' ')
}

export const filterOverlayStyle = (settings: EditorProject['settings'], clipFilters: AppliedFilter[] = []) => {
  const filters = effectiveFilters(settings, clipFilters)
  let temperature = 0
  let tint = 0
  let vignette = 0
  let grain = 0
  for (const applied of filters) {
    const mix = Math.max(0, Math.min(100, applied.intensity)) / 100
    temperature += applied.parameters.temperature * mix
    tint += applied.parameters.tint * mix
    vignette = Math.max(vignette, applied.parameters.vignette * mix)
    grain = Math.max(grain, applied.parameters.grain * mix)
  }
  const overlays: string[] = []
  if (temperature > 0) overlays.push(`linear-gradient(rgba(255,155,58,${Math.min(0.22, temperature / 500)}), rgba(255,155,58,${Math.min(0.22, temperature / 500)}))`)
  if (temperature < 0) overlays.push(`linear-gradient(rgba(48,126,255,${Math.min(0.22, -temperature / 500)}), rgba(48,126,255,${Math.min(0.22, -temperature / 500)}))`)
  if (tint !== 0) {
    const color = tint > 0 ? '255,55,173' : '57,235,163'
    overlays.push(`linear-gradient(rgba(${color},${Math.min(0.16, Math.abs(tint) / 600)}), rgba(${color},${Math.min(0.16, Math.abs(tint) / 600)}))`)
  }
  if (vignette > 0) overlays.push(`radial-gradient(ellipse, transparent 42%, rgba(0,0,0,${Math.min(0.78, vignette / 100)}) 100%)`)
  if (grain > 0) overlays.push('url("data:image/svg+xml,%3Csvg viewBox=%270 0 160 160%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%270.5%27/%3E%3C/svg%3E")')
  return overlays.length ? { backgroundImage: overlays.join(', '), opacity: grain > 0 ? Math.max(0.15, Math.min(0.55, grain / 100)) : 1, mixBlendMode: grain > 0 ? 'soft-light' as const : 'multiply' as const } : {}
}

let grainTexture: HTMLCanvasElement | undefined

export const drawFilterOverlays = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: EditorProject['settings'],
  clipFilters: AppliedFilter[] = [],
  time = 0,
) => {
  const filters = effectiveFilters(settings, clipFilters)
  let temperature = 0
  let tint = 0
  let vignette = 0
  let grain = 0
  for (const applied of filters) {
    const mix = Math.max(0, Math.min(100, applied.intensity)) / 100
    temperature += applied.parameters.temperature * mix
    tint += applied.parameters.tint * mix
    vignette = Math.max(vignette, applied.parameters.vignette * mix)
    grain = Math.max(grain, applied.parameters.grain * mix)
  }
  context.save()
  if (temperature !== 0 || tint !== 0) {
    context.globalCompositeOperation = 'soft-light'
    context.globalAlpha = Math.min(0.3, Math.abs(temperature) / 350 + Math.abs(tint) / 550)
    context.fillStyle = temperature > 0 ? '#ff9b3a' : temperature < 0 ? '#307eff' : tint > 0 ? '#ff37ad' : '#39eba3'
    context.fillRect(0, 0, width, height)
  }
  if (vignette > 0) {
    context.globalCompositeOperation = 'multiply'
    context.globalAlpha = Math.min(0.85, vignette / 100)
    const gradient = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.72)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,1)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }
  if (grain > 0) {
    if (!grainTexture) {
      grainTexture = document.createElement('canvas')
      grainTexture.width = 256
      grainTexture.height = 256
      const noiseContext = grainTexture.getContext('2d')
      if (noiseContext) {
        const noise = noiseContext.createImageData(256, 256)
        for (let i = 0; i < noise.data.length; i += 4) {
          const value = Math.random() * 255
          noise.data[i] = value
          noise.data[i + 1] = value
          noise.data[i + 2] = value
          noise.data[i + 3] = 255
        }
        noiseContext.putImageData(noise, 0, 0)
      }
    }
    context.globalCompositeOperation = 'soft-light'
    context.globalAlpha = Math.min(0.5, grain / 100)
    const scroll = (time * 30) % grainTexture.height
    context.save()
    context.translate(0, scroll)
    context.fillStyle = context.createPattern(grainTexture, 'repeat') ?? '#808080'
    context.fillRect(0, -scroll, width, height + scroll)
    context.restore()
  }
  context.restore()
}

export const transitionProgress = (clip: TimelineClip, time: number) => {
  if (!clip.transitionIn || clip.transitionIn.duration <= 0) return 1
  const speed = Math.max(0.1, clip.transitionIn.speed ?? 1)
  const raw = Math.max(0, Math.min(1, (time - clip.start) / clip.transitionIn.duration * speed))
  const easing = clip.transitionIn.easing ?? 'ease-in-out'
  return easeAt(raw, easing)
}

export const activeTransitionPairs = (clips: TimelineClip[], time: number) => clips.flatMap((incoming) => {
  const transition = incoming.transitionIn
  if (!transition || !['video', 'overlay'].includes(incoming.track) || time < incoming.start || time >= incoming.start + transition.duration) return []
  const previous = clips
    .filter((clip) => clip.track === incoming.track
      && (incoming.track !== 'overlay' || (clip.overlayLayer ?? 1) === (incoming.overlayLayer ?? 1))
      && clip.id !== incoming.id && clipEnd(clip) <= incoming.start + 0.001)
    .sort((a, b) => clipEnd(b) - clipEnd(a))[0]
  return [{ incoming, previous }]
})

export const transitionStyle = (clip: TimelineClip, time: number) => {
  const transition = clip.transitionIn
  if (!transition || time < clip.start || time >= clip.start + transition.duration) return {}
  const progress = transitionProgress(clip, time)
  const preset = TRANSITION_PRESET_BY_ID.get(transition.kind)
  const effect = transition.effect ?? preset?.effect ?? 'dissolve'
  const direction = transition.direction ?? 'left'
  const intensity = Math.max(0, Math.min(100, transition.intensity ?? 100)) / 100
  const eased = progress * progress * (3 - 2 * progress)
  if (effect === 'fade-black' || effect === 'fade-white' || effect === 'dissolve' || effect === 'flash') return { opacity: progress }
  if (effect === 'zoom-in' || effect === 'radial-zoom' || effect === 'lens-zoom') return { opacity: progress, transform: `scale(${1.28 - eased * 0.28})`, filter: `blur(${(1 - progress) * (effect === 'lens-zoom' ? 12 : 4)}px)` }
  if (effect === 'zoom-out') return { opacity: progress, transform: `scale(${0.72 + eased * 0.28})` }
  if (effect === 'spin' || effect === 'film-reel') return { opacity: progress, transform: `rotate(${(1 - eased) * (effect === 'film-reel' ? -180 : 90)}deg) scale(${0.82 + eased * 0.18})` }
  if (effect === 'push-left' || effect === 'push-right' || effect === 'push-up' || effect === 'push-down' || effect === 'whip' || effect === 'motion-blur') {
    const sign = effect === 'push-left' || (effect === 'whip' && direction === 'left') ? 1 : -1
    if (effect === 'push-up' || effect === 'push-down' || direction === 'up' || direction === 'down') {
      const verticalSign = effect === 'push-up' || direction === 'up' ? 1 : -1
      return { opacity: progress, transform: `translateY(${verticalSign * (1 - eased) * 100}%)`, filter: `blur(${effect === 'motion-blur' || effect === 'whip' ? (1 - progress) * 14 * intensity : 0}px)` }
    }
    return { opacity: progress, transform: `translateX(${sign * (1 - eased) * 100}%)`, filter: `blur(${effect === 'motion-blur' || effect === 'whip' ? (1 - progress) * 14 * intensity : 0}px)` }
  }
  if (effect === 'wipe-left' || effect === 'wipe-right' || effect === 'wipe-up' || effect === 'wipe-down' || effect === 'mask') {
    const clipped = effect === 'wipe-right' ? `inset(0 0 0 ${(1 - progress) * 100}%)`
      : effect === 'wipe-up' ? `inset(${(1 - progress) * 100}% 0 0 0)`
        : effect === 'wipe-down' ? `inset(0 0 ${(1 - progress) * 100}% 0)`
          : `inset(0 ${(1 - progress) * 100}% 0 0)`
    return { clipPath: clipped }
  }
  if (effect === 'circle') return { clipPath: `circle(${progress * 75}% at 50% 50%)` }
  if (effect === 'split') return { clipPath: `inset(0 ${50 - progress * 50}% 0 ${50 - progress * 50}%)` }
  if (effect === 'cinematic') return { opacity: progress, clipPath: `inset(${(1 - progress) * 45}% 0 ${(1 - progress) * 45}% 0)` }
  if (effect === 'blur-dissolve') return { opacity: progress, filter: `blur(${(1 - progress) * 18}px)` }
  if (effect === 'shake') return { opacity: progress, transform: `translate(${Math.sin(progress * 26) * (1 - progress) * 12 * intensity}px, ${Math.cos(progress * 31) * (1 - progress) * 8 * intensity}px)` }
  if (effect === 'glitch' || effect === 'rgb' || effect === 'distortion' || effect === 'vhs') return { opacity: progress, filter: `saturate(${effect === 'vhs' ? 1.7 : 1.4}) hue-rotate(${(1 - progress) * 18}deg) contrast(1.2)`, clipPath: progress < 0.8 ? `inset(${(Math.sin(progress * 88) + 1) * 8}% 0)` : undefined }
  if (effect === 'light-leak' || effect === 'film-burn') return { opacity: progress, filter: `sepia(${Math.round((1 - progress) * 35)}%) brightness(${100 + (1 - progress) * (effect === 'film-burn' ? 70 : 35)}%)` }
  if (effect === 'speed-ramp') return { opacity: progress, transform: `scale(${1 + Math.sin(progress * Math.PI) * 0.12 * intensity})`, filter: `blur(${Math.sin(progress * Math.PI) * 5 * intensity}px)` }
  return { opacity: progress }
}

export const transitionOverlayStyle = (clip: TimelineClip, time: number) => {
  const transition = clip.transitionIn
  if (!transition || time < clip.start || time >= clip.start + transition.duration) return {}
  const progress = transitionProgress(clip, time)
  const effect = transition.effect ?? TRANSITION_PRESET_BY_ID.get(transition.kind)?.effect
  if (effect === 'fade-black' || effect === 'fade-white' || effect === 'flash' || effect === 'light-leak' || effect === 'film-burn') {
    const alpha = effect === 'flash' ? Math.max(0, 1 - Math.abs(progress - 0.35) * 3) * 0.9
      : effect === 'light-leak' || effect === 'film-burn' ? Math.sin(progress * Math.PI) * 0.42
        : Math.max(0, 1 - Math.abs(progress - 0.5) * 2)
    const color = effect === 'fade-black' ? '0,0,0' : effect === 'light-leak' || effect === 'film-burn' ? '255,133,54' : '255,255,255'
    const sweepX = effect === 'light-leak' || effect === 'film-burn' ? progress * 100 : 0
    const sweepY = effect === 'light-leak' || effect === 'film-burn' ? Math.sin(progress * Math.PI * 2) * 20 : 0
    return {
      background: `radial-gradient(circle at ${sweepX}% ${50 + sweepY}%, rgba(${color},${alpha}) 0%, rgba(${color},0) 60%)`,
    }
  }
  return {}
}

export const applyCanvasTransition = (context: CanvasRenderingContext2D, clip: TimelineClip, time: number, width: number, height: number) => {
  const transition = clip.transitionIn
  if (!transition || time < clip.start || time >= clip.start + transition.duration) return
  const progress = transitionProgress(clip, time)
  const eased = progress * progress * (3 - 2 * progress)
  const effect = transition.effect ?? TRANSITION_PRESET_BY_ID.get(transition.kind)?.effect ?? 'dissolve'
  const intensity = Math.max(0, Math.min(100, transition.intensity ?? 100)) / 100
  const addFilter = (filter: string) => { context.filter = `${context.filter} ${filter}` }
  if (['dissolve', 'fade-black', 'fade-white', 'flash', 'light-leak', 'film-burn', 'blur-dissolve', 'rgb', 'distortion', 'vhs', 'glitch', 'cinematic'].includes(effect)) context.globalAlpha = progress
  if (effect === 'zoom-in' || effect === 'radial-zoom' || effect === 'lens-zoom') {
    const scale = 1.28 - eased * 0.28
    context.translate(width / 2, height / 2)
    context.scale(scale, scale)
    context.translate(-width / 2, -height / 2)
    if (effect === 'lens-zoom') addFilter(`blur(${(1 - progress) * 8}px)`)
  } else if (effect === 'zoom-out') {
    const scale = 0.72 + eased * 0.28
    context.translate(width / 2, height / 2)
    context.scale(scale, scale)
    context.translate(-width / 2, -height / 2)
  } else if (effect === 'spin' || effect === 'film-reel') {
    context.translate(width / 2, height / 2)
    context.rotate((1 - eased) * Math.PI * (effect === 'film-reel' ? -1 : 0.5))
    context.scale(0.82 + eased * 0.18, 0.82 + eased * 0.18)
    context.translate(-width / 2, -height / 2)
  } else if (effect.startsWith('push-') || effect === 'whip' || effect === 'motion-blur') {
    const direction = transition.direction ?? (effect === 'push-right' ? 'right' : effect === 'push-up' ? 'up' : effect === 'push-down' ? 'down' : 'left')
    const distance = (1 - eased) * (direction === 'left' || direction === 'right' ? width : height)
    context.translate(direction === 'left' ? distance : direction === 'right' ? -distance : 0, direction === 'up' ? height - distance : direction === 'down' ? distance - height : 0)
    if (effect === 'whip' || effect === 'motion-blur') addFilter(`blur(${(1 - progress) * 12 * intensity}px)`)
  } else if (effect === 'shake') {
    context.translate(Math.sin(progress * 26) * (1 - progress) * 12 * intensity, Math.cos(progress * 31) * (1 - progress) * 8 * intensity)
  } else if (effect === 'wipe-left' || effect === 'wipe-right' || effect === 'wipe-up' || effect === 'wipe-down' || effect === 'mask') {
    const direction = transition.direction ?? (effect === 'wipe-right' ? 'right' : effect === 'wipe-up' ? 'up' : effect === 'wipe-down' ? 'down' : 'left')
    context.beginPath()
    if (direction === 'right') context.rect(width * (1 - progress), 0, width * progress, height)
    else if (direction === 'up') context.rect(0, height * (1 - progress), width, height * progress)
    else if (direction === 'down') context.rect(0, 0, width, height * progress)
    else context.rect(0, 0, width * progress, height)
    context.clip()
  } else if (effect === 'circle') {
    context.beginPath()
    context.arc(width / 2, height / 2, Math.hypot(width, height) * progress * 0.52, 0, Math.PI * 2)
    context.clip()
  } else if (effect === 'split') {
    context.beginPath()
    context.rect(width * (0.5 - progress * 0.5), 0, width * progress, height)
    context.clip()
  } else if (effect === 'cinematic') {
    context.beginPath()
    context.rect(0, height * (1 - progress) * 0.45, width, height * (0.1 + progress * 0.9))
    context.clip()
  } else if (effect === 'blur-dissolve') {
    addFilter(`blur(${(1 - progress) * 18}px)`)
  } else if (effect === 'glitch' || effect === 'rgb' || effect === 'distortion' || effect === 'vhs') {
    addFilter(`saturate(${effect === 'vhs' ? 1.7 : 1.4}) hue-rotate(${(1 - progress) * 18}deg) contrast(1.2)`)
    if (progress < 0.8) {
      const cut = (Math.sin(progress * 88) + 1) * height * 0.08
      context.beginPath()
      context.rect(0, cut, width, height - cut * 2)
      context.clip()
    }
  } else if (effect === 'light-leak' || effect === 'film-burn') {
    addFilter(`sepia(${Math.round((1 - progress) * 35)}%) brightness(${100 + (1 - progress) * (effect === 'film-burn' ? 70 : 35)}%)`)
  } else if (effect === 'speed-ramp') {
    const scale = 1 + Math.sin(progress * Math.PI) * 0.12 * intensity
    context.translate(width / 2, height / 2)
    context.scale(scale, scale)
    context.translate(-width / 2, -height / 2)
    addFilter(`blur(${Math.sin(progress * Math.PI) * 5 * intensity}px)`)
  }
}

export const drawTransitionOverlay = (context: CanvasRenderingContext2D, clip: TimelineClip, time: number, width: number, height: number) => {
  const style = transitionOverlayStyle(clip, time)
  if (!style.background) return
  context.save()
  context.fillStyle = String(style.background)
  context.fillRect(0, 0, width, height)
  context.restore()
}

export const createProject = (): EditorProject => ({
  id: crypto.randomUUID(),
  name: 'Untitled project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  width: 1920,
  height: 1080,
  fps: 30,
  clips: [],
  media: [],
  stickers: [],
  fonts: [],
  markers: [],
  hiddenTracks: [],
  mutedTracks: [],
  tracks: [...DEFAULT_TRACKS],
  customFilterPresets: [],
  effectPacks: [],
  settings: { brightness: 100, contrast: 100, saturation: 100, blur: 0, aspectRatio: '16:9', filterPreset: 'none', filterIntensity: 100, filterStack: [] },
})

export const clipEnd = (clip: TimelineClip) => clip.start + clip.duration

export const ANIMATABLE_PROPERTIES: { id: AnimatableProperty; label: string; min: number; max: number; step: number; tracks: TrackKind[] }[] = [
  { id: 'positionX', label: 'Position X', min: -100, max: 100, step: 1, tracks: ['video', 'overlay', 'text'] },
  { id: 'positionY', label: 'Position Y', min: -100, max: 100, step: 1, tracks: ['video', 'overlay', 'text'] },
  { id: 'scale', label: 'Scale', min: 10, max: 300, step: 1, tracks: ['video', 'overlay'] },
  { id: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, tracks: ['video', 'overlay', 'text'] },
  { id: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, tracks: ['video', 'overlay', 'text'] },
  { id: 'volume', label: 'Volume', min: 0, max: 100, step: 1, tracks: ['audio'] },
]

export const staticPropertyValue = (clip: TimelineClip, property: AnimatableProperty): number => {
  switch (property) {
    case 'positionX': return clip.positionX ?? 0
    case 'positionY': return clip.positionY ?? 0
    case 'scale': return clip.scale ?? 100
    case 'rotation': return clip.rotation ?? 0
    case 'opacity': return clip.opacity ?? 100
    // Volume is stored 0..1 on the clip but animated in a 0..100 domain.
    case 'volume': return (clip.volume ?? 1) * 100
  }
}

export const easeAt = (t: number, easing: EasingType): number => {
  const clamped = Math.max(0, Math.min(1, t))
  switch (easing) {
    case 'ease-in': return clamped * clamped
    case 'ease-out': return 1 - (1 - clamped) * (1 - clamped)
    case 'ease-in-out': return clamped < 0.5 ? 2 * clamped * clamped : 1 - 2 * (1 - clamped) * (1 - clamped)
    case 'bezier': return clamped * clamped * (3 - 2 * clamped)
    default: return clamped
  }
}

export const motionBlurOffsets = (clip: TimelineClip, time: number, canvasWidth: number, canvasHeight: number, count = 6): { x: number; y: number; alpha: number }[] => {
  const transition = clip.transitionIn
  if (!transition || time < clip.start || time >= clip.start + transition.duration) return []
  const effect = transition.effect ?? TRANSITION_PRESET_BY_ID.get(transition.kind)?.effect ?? 'dissolve'
  if (!['whip', 'motion-blur', 'push-left', 'push-right', 'push-up', 'push-down'].includes(effect)) return []
  const progress = transitionProgress(clip, time)
  const direction = transition.direction ?? (effect === 'push-right' ? 'right' : effect === 'push-up' ? 'up' : effect === 'push-down' ? 'down' : 'left')
  const samples: { x: number; y: number; alpha: number }[] = []
  const axis = direction === 'left' || direction === 'right' ? canvasWidth : canvasHeight
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const sampleProgress = Math.max(0, Math.min(1, progress + (t - 0.5) * 0.15))
    const sampleEased = sampleProgress * sampleProgress * (3 - 2 * sampleProgress)
    const distance = (1 - sampleEased) * axis
    const signX = direction === 'left' ? -1 : direction === 'right' ? 1 : 0
    const signY = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
    const alpha = 1 - Math.abs(t - 0.5) * 1.4
    samples.push({
      x: signX * distance,
      y: signY * distance,
      alpha: Math.max(0, alpha),
    })
  }
  return samples
}

/** Evaluate an animated property at a clip-local time (seconds from clip start). */
export const evaluatePropertyAt = (clip: TimelineClip, property: AnimatableProperty, clipTime: number): number => {
  const keyframes = clip.keyframes?.properties?.[property]
  if (!keyframes?.length) return staticPropertyValue(clip, property)
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (clipTime <= sorted[0].time) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (clipTime >= last.time) return last.value
  const index = sorted.findIndex((frame) => frame.time > clipTime)
  const from = sorted[Math.max(0, index - 1)]
  const to = sorted[index]
  const span = to.time - from.time
  const progress = span <= 0 ? 1 : (clipTime - from.time) / span
  return from.value + (to.value - from.value) * easeAt(progress, to.easing)
}

/** Evaluate an animated property at an absolute timeline time.
 *  Supports two calling conventions:
 *  - evaluateProperty(clip, property, time) — clip-based evaluation
 *  - evaluateProperty(keyframes, time, defaultValue) — keyframe array evaluation
 */
export const evaluateProperty = (clip: TimelineClip | ClipKeyframe[], propertyOrTime: AnimatableProperty | number, timeOrDefault: number): number => {
  if (Array.isArray(clip)) {
    const keyframes = [...clip].sort((a, b) => a.time - b.time)
    const time = propertyOrTime as number
    const defaultValue = timeOrDefault
    if (!keyframes.length) return defaultValue
    if (time <= keyframes[0].time) return defaultValue
    if (time >= keyframes[keyframes.length - 1].time) return defaultValue
    const index = keyframes.findIndex((frame) => frame.time > time)
    const from = keyframes[Math.max(0, index - 1)]
    const to = keyframes[index]
    const span = to.time - from.time
    const progress = span <= 0 ? 1 : (time - from.time) / span
    return from.value + (to.value - from.value) * easeAt(progress, to.easing)
  }
  return evaluatePropertyAt(clip, propertyOrTime as AnimatableProperty, timeOrDefault - clip.start)
}

/** Audio volume envelope at an absolute timeline time: keyframes × clip volume × fade in/out.
 * Volume keyframes may be stored on a 0–1 or 0–100 scale; values above 1 are treated as percentages. */
export const audioGainAt = (clip: TimelineClip, time: number): number => {
  if (clip.muted) return 0
  const clipTime = time - clip.start
  // Outside clip bounds → silence
  if (clipTime < 0 || clipTime > clip.duration) return 0
  const keyframes = clip.keyframes?.properties?.volume
  const staticGain = Math.max(0, Math.min(1, clip.volume ?? 1))
  const keyedGain = keyframes?.length
    ? (() => {
        const v = evaluatePropertyAt(clip, 'volume', clipTime)
        // Volume keyframes are stored on a 0–100 scale (matching the keyframe editor).
        return Math.max(0, Math.min(1, v / 100))
      })()
    : 1
  let gain = staticGain * keyedGain
  const fadeIn = Math.max(0, clip.fadeIn ?? 0)
  const fadeOut = Math.max(0, clip.fadeOut ?? 0)
  if (fadeIn > 0 && clipTime < fadeIn) gain *= Math.max(0, clipTime / fadeIn)
  if (fadeOut > 0 && clipTime > clip.duration - fadeOut) gain *= Math.max(0, (clip.duration - clipTime) / fadeOut)
  return gain
}

/** Animation-aware static settings for preview rendering. */
export const animatedClipSettings = (clip: TimelineClip, time: number) => ({
  positionX: evaluateProperty(clip, 'positionX', time),
  positionY: evaluateProperty(clip, 'positionY', time),
  scale: evaluateProperty(clip, 'scale', time),
  opacity: evaluateProperty(clip, 'opacity', time),
  rotation: evaluateProperty(clip, 'rotation', time),
})

/** Timeline-position keyframes for a property (absolute time for markers). */
export const keyframesForProperty = (clip: TimelineClip, property: AnimatableProperty): ClipKeyframe[] =>
  [...(clip.keyframes?.properties?.[property] ?? [])].sort((a, b) => a.time - b.time)

export const makeKeyframe = (time: number, value: number, easing: EasingType = 'ease-in-out'): ClipKeyframe =>
  ({ id: crypto.randomUUID(), time, value, easing })

export const setKeyframeValue = (clip: TimelineClip, property: AnimatableProperty, time: number, value: number, easing?: EasingType): TimelineClip => {
  const clipTime = Math.max(0, Math.min(clip.duration, time - clip.start))
  const existing = keyframesForProperty(clip, property)
  const nearest = existing.find((frame) => Math.abs(frame.time - clipTime) < 0.05)
  const frames = nearest
    ? existing.map((frame) => frame.id === nearest.id ? { ...frame, value, ...(easing ? { easing } : {}) } : frame)
    : [...existing, makeKeyframe(clipTime, value, easing ?? 'ease-in-out')]
  return { ...clip, keyframes: { ...clip.keyframes, properties: { ...clip.keyframes?.properties, [property]: frames } } }
}

export const removeKeyframe = (clip: TimelineClip, property: AnimatableProperty, keyframeId: string): TimelineClip => {
  const frames = keyframesForProperty(clip, property).filter((frame) => frame.id !== keyframeId)
  const properties = { ...clip.keyframes?.properties, [property]: frames }
  if (!frames.length) delete properties[property]
  return { ...clip, keyframes: { properties } }
}

export const addKeyframeToClip = setKeyframeValue
export const removeKeyframeFromClip = removeKeyframe

/** Move a keyframe to a new clip-local time, keeping frames sorted. */
export const moveKeyframe = (clip: TimelineClip, property: AnimatableProperty, keyframeId: string, time: number): TimelineClip => {
  const bounded = Math.max(0, Math.min(clip.duration, time))
  const frames = keyframesForProperty(clip, property).map((frame) => frame.id === keyframeId ? { ...frame, time: bounded } : frame)
    .sort((a, b) => a.time - b.time)
  return { ...clip, keyframes: { ...clip.keyframes, properties: { ...clip.keyframes?.properties, [property]: frames } } }
}

/** Group clips so they move and select together. */
export const groupClips = (clips: TimelineClip[]): TimelineClip[] => {
  const groupId = crypto.randomUUID()
  return clips.map((clip) => ({ ...clip, groupId }))
}

/** Remove group membership from clips. */
export const ungroupClips = (clips: TimelineClip[]): TimelineClip[] =>
  clips.map((clip) => {
    const { groupId: _groupId, ...rest } = clip
    return rest as TimelineClip
  })

export const clearKeyframes = (clip: TimelineClip, property: AnimatableProperty): TimelineClip => {
  const properties = { ...clip.keyframes?.properties }
  delete properties[property]
  return { ...clip, keyframes: { properties } }
}

export const clearKeyframesFromClip = clearKeyframes

/** Roll edit: move the cut point between a clip and its previous neighbour, keeping total span. */
export const MARKER_COLORS = ['#f5a524', '#3ddc97', '#4f8cff', '#ef476f', '#b57bff'] as const

export const rollEdit = (previous: TimelineClip, next: TimelineClip, newBoundary: number): TimelineClip[] => {
  const minBoundary = previous.start + 0.1
  const maxBoundary = clipEnd(next) - 0.1
  const boundary = Math.max(minBoundary, Math.min(maxBoundary, newBoundary))
  const delta = boundary - next.start
  return [
    { ...previous, duration: boundary - previous.start },
    { ...next, start: boundary, duration: clipEnd(next) - boundary, inPoint: Math.max(0, next.inPoint + delta * next.speed) },
  ]
}

/** Slip edit: change the source section without moving the clip on the timeline. */
export const slipEdit = (clip: TimelineClip, offsetSeconds: number): TimelineClip => ({
  ...clip,
  inPoint: Math.max(0, clip.inPoint + offsetSeconds * clip.speed),
})

/** Slide edit: move the clip and close the gap by trimming its neighbours. */
export const slideEdit = (previous: TimelineClip | null, clip: TimelineClip, next: TimelineClip | null, newStart: number): TimelineClip[] => {
  const minStart = previous ? previous.start + 0.1 : Math.max(0, newStart)
  const maxStart = next ? clipEnd(next) - clip.duration - 0.1 : newStart
  const start = Math.max(minStart, Math.min(maxStart, newStart))
  const result: TimelineClip[] = []
  if (previous) result.push({ ...previous, duration: Math.max(0.1, start - previous.start) })
  result.push({ ...clip, start })
  if (next) result.push({ ...next, start: start + clip.duration })
  return result
}

export const DEFAULT_OVERLAY_LAYOUT = {
  positionX: 28,
  positionY: -26,
  scale: 35,
  opacity: 100,
} as const

export const normalizeOverlayClip = (clip: TimelineClip): TimelineClip => {
  if (clip.track !== 'overlay') return clip
  const overlayLayer = Number.isFinite(clip.overlayLayer) ? Math.max(1, Math.floor(clip.overlayLayer!)) : 1
  if (clip.overlayLayoutConfigured) return { ...clip, overlayLayer }
  const usesDefaultLayout = (clip.positionX ?? 0) === 0
    && (clip.positionY ?? 0) === 0
    && (clip.scale ?? 100) === 100
  return {
    ...clip,
    ...(usesDefaultLayout ? { ...DEFAULT_OVERLAY_LAYOUT, opacity: clip.opacity ?? DEFAULT_OVERLAY_LAYOUT.opacity } : {}),
    overlayLayer,
    overlayLayoutConfigured: true,
  }
}

export const visualClipOrder = (a: TimelineClip, b: TimelineClip) => {
  if (a.track !== b.track) return a.track === 'video' ? -1 : b.track === 'video' ? 1 : 0
  if (a.track === 'overlay' && b.track === 'overlay' && a.overlayLayer !== b.overlayLayer) {
    return (a.overlayLayer ?? 1) - (b.overlayLayer ?? 1)
  }
  return a.start - b.start
}

export const visualClipSettings = (clip: TimelineClip) => ({
  positionX: Math.max(-100, Math.min(100, clip.positionX ?? 0)),
  positionY: Math.max(-100, Math.min(100, clip.positionY ?? 0)),
  scale: Math.max(10, Math.min(300, clip.scale ?? 100)) / 100,
  rotation: ((clip.rotation ?? 0) % 360 + 360) % 360,
  opacity: Math.max(0, Math.min(100, clip.opacity ?? 100)) / 100,
})

export const visualClipLayout = (clip: TimelineClip, canvasWidth: number, canvasHeight: number, sourceWidth: number, sourceHeight: number) => {
  const settings = visualClipSettings(clip)
  const fitScale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
  const width = sourceWidth * fitScale * settings.scale
  const height = sourceHeight * fitScale * settings.scale
  return {
    x: canvasWidth / 2 + settings.positionX * canvasWidth / 100,
    y: canvasHeight / 2 + settings.positionY * canvasHeight / 100,
    width,
    height,
    opacity: settings.opacity,
  }
}

export const projectDuration = (clips: TimelineClip[]) =>
  clips.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0)

export const formatTime = (seconds: number, fps = 30) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const remainder = Math.floor(safe % 60)
  const frames = Math.floor((safe % 1) * Math.max(1, fps))
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

/* ============================================================================
   Phase 1+: Track management (unlimited tracks, locking, soloing, renaming)
   ============================================================================ */

export type TimelineTrackKind = 'video' | 'audio' | 'text' | 'subtitle' | 'overlay'

export interface TimelineTrack {
  id: string
  name: string
  kind: TimelineTrackKind
  locked: boolean
  muted: boolean
  hidden: boolean
  soloed: boolean
  color: string
  overlayLayer?: number
}

export const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'track-video-1', name: 'Video 1', kind: 'video', locked: false, muted: false, hidden: false, soloed: false, color: '#b9f35a' },
  { id: 'track-video-2', name: 'Video 2', kind: 'video', locked: false, muted: false, hidden: false, soloed: false, color: '#a4c63a' },
  { id: 'track-overlay-1', name: 'Overlay 1', kind: 'overlay', overlayLayer: 1, locked: false, muted: false, hidden: false, soloed: false, color: '#ff6b9d' },
  { id: 'track-overlay-2', name: 'Overlay 2', kind: 'overlay', overlayLayer: 2, locked: false, muted: false, hidden: false, soloed: false, color: '#ff8fa3' },
  { id: 'track-overlay-3', name: 'Overlay 3', kind: 'overlay', overlayLayer: 3, locked: false, muted: false, hidden: false, soloed: false, color: '#ffb3c1' },
  { id: 'track-audio-1', name: 'Audio 1', kind: 'audio', locked: false, muted: false, hidden: false, soloed: false, color: '#f1a552' },
  { id: 'track-audio-2', name: 'Audio 2', kind: 'audio', locked: false, muted: false, hidden: false, soloed: false, color: '#e08c42' },
  { id: 'track-text-1', name: 'Text 1', kind: 'text', locked: false, muted: false, hidden: false, soloed: false, color: '#64d9e9' },
]

export const trackForClip = (clip: TimelineClip): TimelineTrackKind =>
  clip.track === 'overlay' ? 'overlay' : clip.track

/* ============================================================================
   Phase 2+: Keyframe interpolation (Bézier) and keyframe markers on timeline
   ============================================================================ */

export interface BezierControlPoint {
  x: number
  y: number
}

export interface BezierCurve {
  cp1: BezierControlPoint
  cp2: BezierControlPoint
}

export interface ClipKeyframeBezier {
  id: string
  time: number
  value: number
  easing: EasingType
  bezier?: BezierCurve
}

export interface ClipKeyframesExtended {
  properties?: Partial<Record<AnimatableProperty, ClipKeyframeBezier[]>>
}

export const easeBezier = (t: number, cp1: BezierControlPoint, cp2: BezierControlPoint): number => {
  const clamped = Math.max(0, Math.min(1, t))
  // Newton-Raphson solve for x on cubic Bézier, then evaluate y
  const x = (t: number) => 3 * (1 - t) * (1 - t) * t * cp1.x + 3 * (1 - t) * t * t * cp2.x + t * t * t
  const y = (t: number) => 3 * (1 - t) * (1 - t) * t * cp1.y + 3 * (1 - t) * t * t * cp2.y + t * t * t
  let t0 = 0, t1 = 1
  for (let i = 0; i < 8; i++) {
    const mid = (t0 + t1) / 2
    if (x(mid) < clamped) t0 = mid
    else t1 = mid
  }
  return y((t0 + t1) / 2)
}

export const easeAtExtended = (t: number, easing: EasingType, bezier?: BezierCurve): number => {
  switch (easing) {
    case 'bezier': return bezier ? easeBezier(t, bezier.cp1, bezier.cp2) : clampedEase(t, 'ease-in-out')
    default: return clampedEase(t, easing)
  }
}

const clampedEase = (t: number, easing: EasingType): number => easeAt(Math.max(0, Math.min(1, t)), easing)

export const evaluatePropertyAtExtended = (clip: TimelineClip, property: AnimatableProperty, clipTime: number): number => {
  const keyframes = clip.keyframesExtended?.properties?.[property]
  if (!keyframes?.length) return staticPropertyValue(clip, property)
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (clipTime <= sorted[0].time) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (clipTime >= last.time) return last.value
  const index = sorted.findIndex((frame) => frame.time > clipTime)
  const from = sorted[Math.max(0, index - 1)]
  const to = sorted[index]
  const span = to.time - from.time
  const progress = span <= 0 ? 1 : (clipTime - from.time) / span
  return from.value + (to.value - from.value) * easeAtExtended(progress, to.easing, to.bezier)
}

/* ============================================================================
   Phase 2+: Speed ramping with curves and control points
   ============================================================================ */

export interface SpeedPoint {
  id: string
  time: number        // seconds from clip start
  speed: number       // playback speed multiplier at this point
  ease: EasingType
  bezier?: BezierCurve
}

export interface SpeedRamp {
  enabled: boolean
  points: SpeedPoint[]
  frameBlending: boolean
  opticalFlow: boolean
  pitchPreserved: boolean
  reverse: boolean
}

export const makeSpeedPoint = (time: number, speed: number, ease: EasingType = 'linear'): SpeedPoint =>
  ({ id: crypto.randomUUID(), time, speed: Math.max(0.01, speed), ease, bezier: undefined })

export const evaluateSpeedAt = (ramp: SpeedRamp, clipTime: number): number => {
  if (!ramp.enabled || !ramp.points.length) return 1
  const sorted = [...ramp.points].sort((a, b) => a.time - b.time)
  if (clipTime <= sorted[0].time) return sorted[0].speed
  const last = sorted[sorted.length - 1]
  if (clipTime >= last.time) return last.speed
  const index = sorted.findIndex((p) => p.time > clipTime)
  const from = sorted[Math.max(0, index - 1)]
  const to = sorted[index]
  const span = to.time - from.time
  const progress = span <= 0 ? 1 : (clipTime - from.time) / span
  const eased = easeAtExtended(progress, to.ease, to.bezier)
  return from.speed + (to.speed - from.speed) * eased
}

/* ============================================================================
   Phase 3+: Masking and compositing
   ============================================================================ */

export type MaskKind = 'rectangle' | 'ellipse' | 'freehand' | 'bezier'

export interface MaskPoint {
  x: number
  y: number
  cp1?: { x: number; y: number }
  cp2?: { x: number; y: number }
}

export interface TimelineMask {
  id: string
  kind: MaskKind
  enabled: boolean
  inverted: boolean
  feather: number
  expansion: number
  opacity: number
  points: MaskPoint[]
  keyframes?: ClipKeyframesExtended
}

export interface ChromaKeySettings {
  enabled: boolean
  keyColor: string
  tolerance: number
  spillSuppression: number
  edgeSoftness: number
}

export interface BlendModeSettings {
  mode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
  opacity: number
}

/* ============================================================================
   Phase 3+: Professional color grading
   ============================================================================ */

export type ColorWheel = { hue: number; saturation: number; lightness: number }

export interface ColorCurves {
  rgb: Array<[number, number]>
  red: Array<[number, number]>
  green: Array<[number, number]>
  blue: Array<[number, number]>
}

export interface ColorGrade {
  enabled: boolean
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  temperature: number
  tint: number
  saturation: number
  vibrance: number
  hue: number
  lift: ColorWheel
  gamma: ColorWheel
  gain: ColorWheel
  curves: ColorCurves
  vignette: number
  vignetteMidpoint: number
  grain: number
  grainSize: number
  sharpen: number
  denoise: number
  lut?: { id: string; name: string; data?: string; intensity: number }
}

export interface ScopeData {
  kind: 'waveform' | 'histogram' | 'vectorscope' | 'luma'
  width: number
  height: number
  data: Uint8ClampedArray
  updatedAt: number
}

/* ============================================================================
   Phase 4+: Audio production
   ============================================================================ */

export type AudioEffectKind = 'eq' | 'compressor' | 'limiter' | 'reverb' | 'delay' | 'noise-reduction' | 'voice-enhance'

export interface AudioBand {
  frequency: number
  gain: number
  q: number
  enabled: boolean
}

export interface AudioEffect {
  id: string
  kind: AudioEffectKind
  enabled: boolean
  order: number
  parameters: Record<string, number>
  bands?: AudioBand[]
}

export interface AudioTrackState {
  trackId: string
  muted: boolean
  soloed: boolean
  hidden: boolean
  volume: number
  pan: number
}

export interface SilenceRegion {
  id: string
  start: number
  end: number
  duration: number
}

export interface BeatMarker {
  id: string
  time: number
  confidence: number
}

/* ============================================================================
   Phase 4+: Text and motion graphics
   ============================================================================ */

export type TextAnimation = 'none' | 'typewriter' | 'fade' | 'slide' | 'bounce' | 'scale' | 'blur'

export interface TypographyControls {
  fontFamily: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  wordSpacing: number
  lineHeight: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  fontStyle: 'normal' | 'italic' | 'oblique'
}

export interface TextDecoration {
  outline: boolean
  outlineWidth: number
  outlineColor: string
  shadow: boolean
  shadowX: number
  shadowY: number
  shadowBlur: number
  shadowColor: string
  background: boolean
  backgroundColor: string
  backgroundPadding: number
  gradient: boolean
  gradientAngle: number
  gradientStart: string
  gradientEnd: string
}

export interface MotionGraphicsTemplate {
  id: string
  name: string
  category: string
  thumbnail?: string
  clipData: Partial<TimelineClip>
  createdAt: number
}

/* ============================================================================
   Phase 6+: Export queue
   ============================================================================ */

export type ExportFormat = 'webm' | 'mp4'
export type ExportStatus = 'pending' | 'rendering' | 'completed' | 'failed' | 'cancelled'

export interface ExportPreset {
  id: string
  name: string
  format: ExportFormat
  resolution: { width: number; height: number }
  aspectRatio: string
  fps: number
  videoBitrate: number
  audioBitrate: number
  quality: 'draft' | 'standard' | 'high' | 'maximum'
  codec?: string
}

export interface ExportJob {
  id: string
  projectId: string
  name: string
  preset: ExportPreset
  status: ExportStatus
  progress: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  outputUrl?: string
  outputSize?: number
}

export const DEFAULT_EXPORT_PRESETS: ExportPreset[] = [
  { id: 'webm-720p', name: 'WebM 720p', format: 'webm', resolution: { width: 1280, height: 720 }, aspectRatio: '16:9', fps: 30, videoBitrate: 5_000_000, audioBitrate: 192_000, quality: 'high' },
  { id: 'webm-1080p', name: 'WebM 1080p', format: 'webm', resolution: { width: 1920, height: 1080 }, aspectRatio: '16:9', fps: 30, videoBitrate: 10_000_000, audioBitrate: 192_000, quality: 'high' },
  { id: 'mp4-1080p', name: 'MP4 1080p (H.264)', format: 'mp4', resolution: { width: 1920, height: 1080 }, aspectRatio: '16:9', fps: 30, videoBitrate: 10_000_000, audioBitrate: 192_000, quality: 'high', codec: 'avc1' },
]

// Extend EditorProject with new optional fields (backward compatible)
export interface EditorProjectExtensions {
  tracks?: TimelineTrack[]
  speedRamps?: Record<string, SpeedRamp>
  masks?: Record<string, TimelineMask[]>
  chromaKey?: Record<string, ChromaKeySettings>
  blendModes?: Record<string, BlendModeSettings>
  colorGrades?: Record<string, ColorGrade>
  audioEffects?: Record<string, AudioEffect[]>
  audioTrackStates?: AudioTrackState[]
  typography?: Record<string, TypographyControls>
  textDecoration?: Record<string, TextDecoration>
  textAnimation?: Record<string, TextAnimation>
  motionGraphicsTemplates?: MotionGraphicsTemplate[]
  silentRegions?: SilenceRegion[]
  beatMarkers?: BeatMarker[]
  exportQueue?: ExportJob[]
  autosaveEnabled?: boolean
  version?: number
  customKeyboardShortcuts?: Record<string, string>
  workspaceLayout?: string
  proxyMedia?: Record<string, string>
}
