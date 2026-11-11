import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FILTER_CATEGORIES,
  FILTER_PRESETS,
  TRANSITION_PRESETS,
  activeTransitionPairs,
  applyCanvasTransition,
  createProject,
  DEFAULT_OVERLAY_LAYOUT,
  filterCss,
  makeAppliedFilter,
  normalizeOverlayClip,
  transitionStyle,
  visualClipOrder,
  visualClipLayout,
  visualClipSettings,
} from '../src/types.ts'
import { validateEffectPack } from '../src/effect-packs.ts'

test('built-in filter library covers every requested category with unique editable presets', () => {
  assert.ok(FILTER_PRESETS.length >= 40)
  assert.equal(new Set(FILTER_PRESETS.map((preset) => preset.id)).size, FILTER_PRESETS.length)
  for (const category of FILTER_CATEGORIES) {
    if (category !== 'Custom User Presets') assert.ok(FILTER_PRESETS.some((preset) => preset.category === category), `missing category: ${category}`)
  }
  for (const preset of FILTER_PRESETS) {
    assert.equal(typeof preset.parameters.exposure, 'number')
    assert.equal(typeof preset.parameters.temperature, 'number')
    assert.equal(typeof preset.parameters.vignette, 'number')
    assert.equal(typeof preset.parameters.grain, 'number')
  }
})

test('filter stacks respect per-filter intensity and enabled state', () => {
  const settings = { brightness: 100, contrast: 100, saturation: 100, blur: 0, aspectRatio: '16:9' }
  const preset = FILTER_PRESETS.find((item) => item.id === 'golden-hour')
  assert.ok(preset)
  const applied = makeAppliedFilter(preset, 50)
  const half = filterCss(settings, [applied])
  const disabled = filterCss(settings, [{ ...applied, enabled: false }])
  assert.notEqual(half, disabled)
  assert.equal(disabled, 'brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)')
})

test('every built-in transition maps to a preview and canvas rendering operation', () => {
  assert.ok(TRANSITION_PRESETS.length >= 30)
  assert.equal(new Set(TRANSITION_PRESETS.map((preset) => preset.id)).size, TRANSITION_PRESETS.length)
  const canvas = new Proxy({}, {
    get(_target, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} })
      return () => {}
    },
    set() { return true },
  })
  for (const preset of TRANSITION_PRESETS) {
    const clip = {
      id: preset.id, track: 'video', name: preset.name, start: 0, inPoint: 0,
      duration: 4, speed: 1, volume: 1, muted: false,
      transitionIn: { kind: preset.id, effect: preset.effect, duration: 1, intensity: 80 },
    }
    assert.ok(Object.keys(transitionStyle(clip, 0.5)).length > 0, `no preview style for ${preset.name}`)
    assert.doesNotThrow(() => applyCanvasTransition(canvas, clip, 0.5, 1920, 1080), preset.name)
  }
})

test('project JSON round-trip preserves clip effects and installed pack references', () => {
  const project = createProject()
  project.markers = [{ id: 'marker-1', time: 2.5, label: 'Chorus' }]
  project.hiddenTracks = ['overlay']
  project.mutedTracks = ['audio']
  project.effectPacks = [{
    format: 'frameforge-effect-pack', schemaVersion: 1, id: 'test-pack', version: '1.0.0',
    name: 'Test Pack', description: 'Test', thumbnail: 'https://example.invalid/preview.png', author: 'Test', license: 'CC0',
    compatibleAppVersion: '1.0.0', requiredAssets: [],
  }]
  project.clips.push({
    id: 'clip-1', track: 'video', name: 'Clip', start: 0, inPoint: 0,
    duration: 2, speed: 1, volume: 1, muted: false,
    transitionIn: { kind: 'dissolve', effect: 'dissolve', packId: 'test-pack', duration: 0.5 },
    filters: [makeAppliedFilter(FILTER_PRESETS[1])],
  })
  const restored = JSON.parse(JSON.stringify(project))
  assert.equal(restored.effectPacks[0].id, 'test-pack')
  assert.deepEqual(restored.markers, project.markers)
  assert.deepEqual(restored.hiddenTracks, ['overlay'])
  assert.deepEqual(restored.mutedTracks, ['audio'])
  assert.equal(restored.clips[0].transitionIn.packId, 'test-pack')
  assert.equal(restored.clips[0].filters[0].presetId, FILTER_PRESETS[1].id)
})

test('overlay placement, scale, and opacity are normalized and produce matching export bounds', () => {
  const clip = {
    id: 'overlay-1', track: 'overlay', name: 'Picture in picture', start: 0, inPoint: 0,
    duration: 4, speed: 1, volume: 1, muted: false,
    positionX: 25, positionY: -10, scale: 50, opacity: 40,
  }
  assert.deepEqual(visualClipSettings(clip), { positionX: 25, positionY: -10, scale: 0.5, rotation: 0, opacity: 0.4 })
  assert.deepEqual(visualClipLayout(clip, 1920, 1080, 1920, 1080), {
    x: 1440, y: 432, width: 960, height: 540, opacity: 0.4,
  })
  assert.deepEqual(visualClipSettings({ ...clip, positionX: 200, positionY: -200, scale: 500, opacity: -20 }), {
    positionX: 100, positionY: -100, scale: 3, rotation: 0, opacity: 0,
  })
})

test('overlay videos default to a visible picture-in-picture layout and preserve custom placement', () => {
  const legacyOverlay = {
    id: 'legacy-overlay', track: 'overlay', name: 'Overlay video', start: 0, inPoint: 0,
    duration: 4, speed: 1, volume: 1, muted: false,
    positionX: 0, positionY: 0, scale: 100, opacity: 100,
  }
  assert.deepEqual(normalizeOverlayClip(legacyOverlay), {
    ...legacyOverlay, ...DEFAULT_OVERLAY_LAYOUT, overlayLayer: 1, overlayLayoutConfigured: true,
  })
  const customOverlay = { ...legacyOverlay, positionX: -30, scale: 48 }
  assert.deepEqual(normalizeOverlayClip(customOverlay), { ...customOverlay, overlayLayer: 1, overlayLayoutConfigured: true })
  const fadedLegacyOverlay = { ...legacyOverlay, opacity: 65 }
  assert.deepEqual(normalizeOverlayClip(fadedLegacyOverlay), {
    ...fadedLegacyOverlay, positionX: DEFAULT_OVERLAY_LAYOUT.positionX, positionY: DEFAULT_OVERLAY_LAYOUT.positionY,
    scale: DEFAULT_OVERLAY_LAYOUT.scale, overlayLayer: 1, overlayLayoutConfigured: true,
  })
  assert.equal(normalizeOverlayClip({ ...legacyOverlay, overlayLayoutConfigured: true }).scale, 100)
})

test('overlay tracks stack in layer order and transitions stay within their own layer', () => {
  const base = {
    id: 'base', track: 'video', name: 'Base', start: 0, inPoint: 0,
    duration: 5, speed: 1, volume: 1, muted: false,
  }
  const lower = { ...base, id: 'lower', track: 'overlay', overlayLayer: 1, start: 1 }
  const upper = { ...base, id: 'upper', track: 'overlay', overlayLayer: 2, start: 1 }
  assert.deepEqual([upper, lower, base].sort(visualClipOrder).map((clip) => clip.id), ['base', 'lower', 'upper'])

  const incoming = {
    ...upper, id: 'incoming', start: 5,
    transitionIn: { kind: 'dissolve', duration: 1 },
  }
  const differentLayerPrevious = { ...lower, id: 'different-layer-previous', start: 0, duration: 4 }
  const sameLayerPrevious = { ...upper, id: 'same-layer-previous', start: 0, duration: 4 }
  const pairs = activeTransitionPairs([differentLayerPrevious, sameLayerPrevious, incoming], 5)
  assert.equal(pairs[0].previous.id, 'same-layer-previous')
})

test('effect pack import accepts data-only supported effects and rejects executable URLs or invalid ranges', () => {
  const pack = {
    format: 'frameforge-effect-pack', schemaVersion: 1, id: 'sample-pack', version: '1.0.0',
    name: 'Sample', description: 'Sample data-only pack', thumbnail: 'https://example.invalid/preview.png', author: 'Example', license: 'CC0',
    compatibleAppVersion: '1.0.0', requiredAssets: [],
    filters: [{ ...FILTER_PRESETS[1], id: 'sample-filter' }],
  }
  assert.equal(validateEffectPack(pack).filters[0].id, 'sample-filter')
  assert.throws(() => validateEffectPack({ ...pack, requiredAssets: [{ id: 'script', kind: 'overlay', mime: 'text/javascript', license: 'unknown', externalUrl: 'javascript:alert(1)' }] }), /HTTPS URL|disallowed embedded/)
  assert.throws(() => validateEffectPack({ ...pack, filters: [{ ...pack.filters[0], parameters: { ...pack.filters[0].parameters, grain: 1000 } }] }), /invalid grain/)
})
