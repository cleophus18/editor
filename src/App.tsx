import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  Activity, ArrowLeftRight, AudioLines, Check, ChevronDown, Clapperboard, CircleHelp, Cloud, Copy, Crop,
  Download, FileAudio2, FileImage, FilePlus2, FileVideo2, FileType2, Film, FolderOpen,
  ChevronLeft, ChevronRight, Flag, ImagePlus, Eye, EyeOff, Layers2, Magnet, Maximize2, Minus,
  Music2, Pause, Play, Plus, Redo2, Repeat, Scissors, Settings2, SlidersHorizontal, Sparkles,
  Trash2, Type, Undo2, Upload, Lock, Unlock,
  VolumeX, X, ZoomIn, ZoomOut, ChevronUp,
  MoveHorizontal, MoveDiagonal, Maximize, Minimize,
} from 'lucide-react'
import type { AppliedFilter, EditorProject, EffectPack, FilterCategory, FilterPreset, MediaAsset, MediaKind, ProjectFont, SpeedRamp, Sticker, StickerAsset, TimelineClip, TimelineTrack, TrackKind, TransitionKind } from './types'
import { activeTransitionPairs, addKeyframeToClip, ANIMATABLE_PROPERTIES, applyCanvasTransition, audioGainAt, animatedClipSettings, clipEnd, createProject, DEFAULT_OVERLAY_LAYOUT, DEFAULT_TRACKS, drawFilterOverlays, drawTransitionOverlay, effectiveFilters, evaluateSpeedAt, filterCss, filterOverlayStyle, FILTER_CATEGORIES, FILTER_PRESETS, formatTime, keyframesForProperty, makeAppliedFilter, makeSpeedPoint, MARKER_COLORS, motionBlurOffsets, normalizeOverlayClip, projectDuration, removeKeyframeFromClip, staticPropertyValue, transitionStyle, transitionOverlayStyle, TRANSITION_CATEGORIES, TRANSITION_PRESET_BY_ID, TRANSITION_PRESETS, visualClipLayout, visualClipOrder } from './types'
import type { AnimatableProperty, EasingType, StickerCategory, TimelineMarker } from './types'
import { deleteProject, loadProjects, saveProject } from './storage'
import { validateEffectPack } from './effect-packs'
import EffectCover from './EffectCover'
import { convertVideoToMp4 } from './video-conversion'

type WorkspaceTab = 'Media' | 'Audio' | 'Text' | 'Stickers' | 'Effects' | 'Transitions' | 'Filters' | 'Enhance'
type HistoryEntry = {
  clips: TimelineClip[]
  settings: EditorProject['settings']
  customFilterPresets?: FilterPreset[]
  effectPacks?: EffectPack[]
  markers?: TimelineMarker[]
  tracks?: TimelineTrack[]
}
type TimelineContextMenu = { x: number; y: number; clipId?: string; track?: TrackKind; time?: number }
type TimelineTool = 'select' | 'slip' | 'roll' | 'slide'

const tabs: { name: WorkspaceTab; icon: typeof Film }[] = [
  { name: 'Media', icon: Clapperboard }, { name: 'Audio', icon: Music2 }, { name: 'Text', icon: Type },
  { name: 'Stickers', icon: ImagePlus }, { name: 'Effects', icon: Sparkles }, { name: 'Transitions', icon: Layers2 }, { name: 'Filters', icon: SlidersHorizontal },
  { name: 'Enhance', icon: Activity },
]

const MIN_TIMELINE_ZOOM = 6
const MAX_TIMELINE_ZOOM = 540
const changeTimelineZoom = (value: number, direction: -1 | 1) => {
  const step = Math.max(6, Math.round(value * 0.2 / 6) * 6)
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, value + step * direction))
}

const assetTrack = (kind: MediaKind): TrackKind => kind === 'audio' ? 'audio' : 'video'
const classify = (file: File): MediaKind | null => {
  if (file.type.startsWith('video/') || /\.mkv$/i.test(file.name)) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/') || /\.svg$/i.test(file.name)) return 'image'
  return null
}

const isFontFile = (name: string) => /\.(ttf|otf|woff2?)$/i.test(name)
const secondsFromCaption = (value: string) => {
  const [hours, minutes, rest] = value.replace(',', '.').split(':')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest)
}
const parseSrt = (source: string, startIndex: number): TimelineClip[] => {
  const cues = source.replace(/^\uFEFF/, '').matchAll(/(?:^|\r?\n)\s*(?:\d+\s*\r?\n)?(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n\s*\r?\n|$)/g)
  return Array.from(cues, (match, index) => {
    const start = secondsFromCaption(match[1])
    const end = secondsFromCaption(match[2])
    const text = match[3].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
    return {
      id: crypto.randomUUID(), track: 'text' as const, name: `Subtitle ${startIndex + index + 1}`,
      start, inPoint: 0, duration: Math.max(0.1, end - start), speed: 1, volume: 1, muted: false,
      text, color: '#ffffff', fontSize: 42,
    }
  }).filter((clip) => clip.text && Number.isFinite(clip.start) && clip.start >= 0)
}

const registerFont = async (font: ProjectFont) => {
  const url = URL.createObjectURL(font.blob)
  try {
    const face = new FontFace(font.family, `url("${url}")`)
    await face.load()
    document.fonts.add(face)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const dimensionsForAspect = (aspect: string, height = 1080) => {
  const [ratioWidth, ratioHeight] = aspect.split(':').map(Number)
  const outputHeight = ratioWidth < ratioHeight ? Math.round(height * ratioHeight / ratioWidth) : height
  return { width: Math.round(outputHeight * ratioWidth / ratioHeight), height: outputHeight }
}

const readMetadata = (file: File, kind: MediaKind) => new Promise<{ duration: number; width: number; height: number }>((resolve) => {
  if (kind === 'image') {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: 5, width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: 5, width: 0, height: 0 })
    }
    image.src = url
    return
  }
  const media = document.createElement(kind === 'audio' ? 'audio' : 'video')
  media.preload = 'metadata'
  const url = URL.createObjectURL(file)
  const release = () => {
    URL.revokeObjectURL(url)
    media.removeAttribute('src')
    media.load()
  }
  media.onloadedmetadata = () => {
    resolve({ duration: Number.isFinite(media.duration) ? media.duration : 0, width: 'videoWidth' in media ? media.videoWidth : 0, height: 'videoHeight' in media ? media.videoHeight : 0 })
    release()
  }
  media.onerror = () => {
    resolve({ duration: 0, width: 0, height: 0 })
    release()
  }
  media.src = url
})

const makeClip = (asset: MediaAsset, start: number, track = assetTrack(asset.kind), overlayLayer?: number): TimelineClip => ({
  id: crypto.randomUUID(), mediaId: asset.id, track, name: asset.name, start, inPoint: 0,
  duration: Math.max(asset.duration || 5, 0.1), speed: 1, volume: 1, muted: false,
  ...(track === 'video' ? { positionX: 0, positionY: 0, scale: 100, opacity: 100 } : {}),
  ...(track === 'overlay' ? { ...DEFAULT_OVERLAY_LAYOUT, overlayLayoutConfigured: true, overlayLayer: overlayLayer ?? 1 } : {}),
})

const imageAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read media data.'))
  reader.onerror = () => reject(reader.error ?? new Error('Could not read media data.'))
  reader.readAsDataURL(blob)
})

const integrateSpeed = (ramp: SpeedRamp, clipTime: number): number => {
  let acc = 0
  let prevT = 0
  let prevS = ramp.points[0]?.speed ?? 1
  for (const point of ramp.points) {
    const t = Math.min(point.time, clipTime)
    if (t <= prevT) continue
    acc += prevS * (t - prevT)
    prevT = t
    prevS = point.speed
    if (t >= clipTime) break
  }
  return acc
}

const BUILTIN_STICKERS: Sticker[] = [
  { id: 'sticker-heart', name: 'Heart', category: 'heart', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff4757" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-star', name: 'Star', category: 'shape', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ffa502" d="M12 17.27l1.37 4.26L20 20.24l-4.25-1.4L16 12l-1.37-4.26L12 8l-2.63 3.74L8 12l-1.37 4.26-4.25 1.4L12 17.27z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-arrow-right', name: 'Right Arrow', category: 'arrow', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ed573" d="M6 6h6v6h2V6h6l-6-6-6 6z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-arrow-left', name: 'Left Arrow', category: 'arrow', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ed573" d="M18 6l-6 6 6 6v-2h-6V6h6z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-arrow-up', name: 'Up Arrow', category: 'arrow', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ed573" d="M12 2l6 6h-2v6H6V8h2z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-arrow-down', name: 'Down Arrow', category: 'arrow', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ed573" d="M18 20v-6h-6v6h2v-6h6v6z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-circle', name: 'Circle', category: 'shape', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="%233742fa" stroke-width="2"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-square', name: 'Square', category: 'shape', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" fill="none" stroke="%233742fa" stroke-width="2"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-check', name: 'Check Mark', category: 'shape', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ed573" d="M20 7l-3 3-5-6 1.4-1.4L13 10.4l2.3-4.6L20 7z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-x-mark', name: 'X Mark', category: 'shape', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff4757" d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-bow', name: 'Bow', category: 'decorative', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff4757" d="M12 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM5 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm14 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zM12 22c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-sparkles', name: 'Sparkles', category: 'decorative', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23fbc42d" d="M12 3l1 6h6l-4.5 3.2L20 15l-6 4-1-6h-6l4.5-3.2L4 15z"/></svg>', type: 'image', width: 24, height: 24 },
  { id: 'sticker-ribbon', name: 'Ribbon', category: 'decorative', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23a55eea" d="M12 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM4 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm16 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/></svg>', type: 'image', width: 24, height: 24 },
]

const STICKER_CATEGORIES: { id: StickerCategory; label: string; icon: string }[] = [
  { id: 'emoji', label: 'Emoji', icon: '😀' },
  { id: 'shape', label: 'Shapes', icon: '◆' },
  { id: 'arrow', label: 'Arrows', icon: '→' },
  { id: 'heart', label: 'Hearts', icon: '♥' },
  { id: 'decorative', label: 'Decorative', icon: '✦' },
  { id: 'animated', label: 'Animated', icon: '✨' },
  { id: 'custom', label: 'My Stickers', icon: '📎' },
]

function App() {
  const [project, setProject] = useState<EditorProject>(createProject)
  const [projects, setProjects] = useState<EditorProject[]>([])
  const [projectToDelete, setProjectToDelete] = useState<EditorProject | null>(null)
  const [screen, setScreen] = useState<'home' | 'editor'>('home')
  const screenRef = useRef(screen)
  screenRef.current = screen
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Media')
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [stickerCategoryFilter, setStickerCategoryFilter] = useState<StickerCategory>('custom')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiSelectedClipIds, setMultiSelectedClipIds] = useState<string[]>([])
  const [copiedClips, setCopiedClips] = useState<TimelineClip[] | null>(null)
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenu | null>(null)
  const [transitionDuration, setTransitionDuration] = useState(0.6)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapSensitivity, setSnapSensitivity] = useState(0.14)
  const [activeTool, setActiveTool] = useState<TimelineTool>('select')
  const timelineTool = activeTool
  const setTimelineTool = setActiveTool
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [markerDialog, setMarkerDialog] = useState<{ markerId?: string; value: string; color: string } | null>(null)
  const [selectedKeyframeProperty, setSelectedKeyframeProperty] = useState<AnimatableProperty | null>(null)
  const [exportCancelRequested, setExportCancelRequested] = useState(false)
  const exportCancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false })
  const [zoom, setZoom] = useState(54)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [message, setMessage] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportName, setExportName] = useState('my-video')
  const [exportSize, setExportSize] = useState('1080p')
  const [exportQuality, setExportQuality] = useState('High')
  const [exportFps, setExportFps] = useState(30)
  const [exportAudioBitrate, setExportAudioBitrate] = useState(192_000)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [search, setSearch] = useState('')
  const [effectSearch, setEffectSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<FilterCategory | 'All' | 'Favorites' | 'Recent'>('All')
  const [transitionCategory, setTransitionCategory] = useState<string>('All')
  const [compareOriginal, setCompareOriginal] = useState(false)
  const [copiedFilters, setCopiedFilters] = useState<AppliedFilter[] | null>(null)
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null)
  const [projectSearch, setProjectSearch] = useState('')
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null)
  const [trackRenameValue, setTrackRenameValue] = useState('')
  const [autoKeyframe, setAutoKeyframe] = useState(false)
  const [dragAsset, setDragAsset] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [panelWidth, setPanelWidth] = useState(280)
  const [propertiesWidth, setPropertiesWidth] = useState(280)
  const [selectedStickerClip, setSelectedStickerClip] = useState<string | null>(null)
  const [stickerTransform, setStickerTransform] = useState<{ clipId: string; x: number; y: number; scale: number; rotation: number; startX: number; startY: number; action: 'move' | 'resize' | 'rotate' | 'crop'; corner: 'tl' | 'tr' | 'bl' | 'br' | null; edge: 'top' | 'right' | 'bottom' | 'left' | null } | null>(null)
  const [trimMode, setTrimMode] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const effectPackInput = useRef<HTMLInputElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackLabelsRef = useRef<HTMLDivElement>(null)
  const visualVideoRefs = useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = useRef(new Map<string, HTMLAudioElement>())
  const clockRef = useRef<number | null>(null)
  const playStartRef = useRef<{ time: number; now: number }>({ time: 0, now: 0 })
  const lastClockPaintRef = useRef(0)
  const shortcutsRef = useRef({
    undo: () => {}, redo: () => {}, save: () => {}, togglePlayback: () => {},
    remove: () => {}, split: () => {}, copy: () => {}, cut: () => {}, paste: () => {},
    addMarker: () => {}, previousMarker: () => {}, nextMarker: () => {},
    rippleDelete: () => {}, toggleLoop: () => {}, toggleShortcuts: () => {},
  })
  const dragRef = useRef<{ clipId: string; action: 'move' | 'left' | 'right'; x: number; start: number; duration: number; inPoint: number; clips: TimelineClip[] } | null>(null)
  const selectedClip = project.clips.find((clip) => clip.id === selectedId) ?? null
  const filterTargetClip = selectedClip && (selectedClip.track === 'video' || selectedClip.track === 'overlay') ? selectedClip : null
  const targetFilterStack = filterTargetClip?.filters ?? project.settings.filterStack ?? effectiveFilters(project.settings)
  const activeAppliedFilters = filterTargetClip
    ? (filterTargetClip.filters ?? [])
    : effectiveFilters(project.settings)
  const selectedAppliedFilter = activeAppliedFilters.find((item) => item.id === selectedFilterId)
    ?? activeAppliedFilters[activeAppliedFilters.length - 1]
  const allFilterPresets = [...FILTER_PRESETS, ...(project.customFilterPresets ?? [])]
  const filteredPresets = allFilterPresets.filter((preset) =>
    (filterCategory === 'All' || filterCategory === 'Favorites' || filterCategory === 'Recent' || preset.category === filterCategory)
    && `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(effectSearch.trim().toLowerCase()))
  const allTransitionPresets = [...TRANSITION_PRESETS, ...(project.effectPacks ?? []).flatMap((pack) => (pack.transitions ?? []).map((item) => ({ ...item, packId: pack.id })))]
  const installedPackIds = new Set((project.effectPacks ?? []).map((pack) => pack.id))
  const missingPackIds = new Set([
    ...(project.settings.filterStack ?? []).map((item) => item.packId).filter((id): id is string => Boolean(id && !installedPackIds.has(id))),
    ...project.clips.flatMap((clip) => [
      ...(clip.filters ?? []).map((item) => item.packId),
      clip.transitionIn?.packId,
    ]).filter((id): id is string => Boolean(id && !installedPackIds.has(id))),
  ])
  const filteredTransitions = allTransitionPresets.filter((preset) =>
    (transitionCategory === 'All' || transitionCategory === 'Favorites' || transitionCategory === 'Recent' || preset.category === transitionCategory)
    && `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(effectSearch.trim().toLowerCase()))
  const duration = projectDuration(project.clips)
  const visibleVisualClips = useMemo(() => project.clips.filter((clip) =>
    (clip.track === 'video' || clip.track === 'overlay') && !project.hiddenTracks?.includes(clip.track)),
  [project.clips, project.hiddenTracks])
  const activeVisualClips = useMemo(() => visibleVisualClips
    .filter((clip) => playhead >= clip.start && playhead < clipEnd(clip))
    .sort(visualClipOrder), [visibleVisualClips, playhead])
  const previewTransitionPairs = useMemo(() => activeTransitionPairs(visibleVisualClips, playhead), [visibleVisualClips, playhead])
  const previewVisualClips = useMemo(() => {
    const clips = [...activeVisualClips]
    for (const pair of previewTransitionPairs) {
      if (pair.previous && !clips.some((clip) => clip.id === pair.previous?.id)) clips.push(pair.previous)
    }
    return clips.sort(visualClipOrder)
  }, [activeVisualClips, previewTransitionPairs])
  const overlayLayers = Array.from(new Set([
    1,
    ...project.clips.filter((clip) => clip.track === 'overlay').map((clip) => clip.overlayLayer ?? 1),
  ])).sort((a, b) => a - b)
  const activeStickerClips = useMemo(() => project.clips.filter((clip) =>
    clip.track === 'overlay' && !project.hiddenTracks?.includes('overlay') && clip.mediaId
      && playhead >= clip.start && playhead < clipEnd(clip)
  ).sort(visualClipOrder), [project.clips, project.hiddenTracks, playhead])
  const allStickers: Sticker[] = useMemo(() => [...BUILTIN_STICKERS, ...(project.stickers ?? []).map((s) => ({ id: s.id, name: s.name, category: s.stickerCategory ?? 'custom', url: s.url!, type: s.kind as Sticker['type'], width: s.width, height: s.height }))], [project.stickers])
  const stickersForCategory = useMemo(() => {
    if (stickerCategoryFilter === 'custom') return allStickers.filter((s) => s.category === 'custom')
    return allStickers.filter((s) => s.category === stickerCategoryFilter)
  }, [allStickers, stickerCategoryFilter])
  const timelineRows: TimelineTrack[] = project.tracks ?? DEFAULT_TRACKS
  const markers = [...(project.markers ?? [])].sort((a, b) => a.time - b.time)
  const visibleAssets = project.media.filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase()) && (activeTab !== 'Audio' || asset.kind === 'audio'))
  const matchingProjects = projects.filter((item) => item.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
  const historyEntry = (): HistoryEntry => ({
    clips: project.clips,
    settings: project.settings,
    customFilterPresets: project.customFilterPresets,
    effectPacks: project.effectPacks,
    markers: project.markers,
    tracks: project.tracks,
  })

  const report = useCallback((text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 4000)
  }, [])

  const persist = useCallback(async (current: EditorProject) => {
    try {
      setSaveState('saving')
      const saved = { ...current, updatedAt: Date.now() }
      await saveProject(saved)
      setSaveState('saved')
      setProjects((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)])
    } catch {
      setSaveState('error')
      report('Could not save this project. Check that browser storage is available.')
    }
  }, [report])

  useEffect(() => {
    loadProjects().then((loaded) => {
      const normalized = loaded.map((item) => ({
        ...item,
        fonts: item.fonts ?? [],
        customFilterPresets: item.customFilterPresets ?? [],
        effectPacks: item.effectPacks ?? [],
        clips: item.clips.map((clip) => normalizeOverlayClip({ ...clip, filters: clip.filters ?? [] })),
        settings: { ...item.settings, filterPreset: item.settings.filterPreset ?? 'none', filterIntensity: item.settings.filterIntensity ?? 100 },
        ...dimensionsForAspect(item.settings.aspectRatio),
      }))
      setProjects(normalized.sort((a, b) => b.updatedAt - a.updatedAt))
      if (normalized.length && screenRef.current === 'home') {
        const latest = normalized.sort((a, b) => b.updatedAt - a.updatedAt)[0]
        latest.fonts.forEach((font) => void registerFont(font).catch(() => report(`Could not load font: ${font.name}`)))
        setProject(latest)
      }
    }).catch(() => report('Local project storage is unavailable in this browser session.'))
  }, [report])

  useEffect(() => {
    if (screen !== 'editor') return
    const timeout = window.setTimeout(() => void persist(project), 800)
    return () => window.clearTimeout(timeout)
  }, [project, screen, persist])

  useEffect(() => {
    const activeIds = new Set(activeVisualClips.map((clip) => clip.id))
    const visibleIds = new Set(previewVisualClips.map((clip) => clip.id))
    for (const clip of previewVisualClips) {
      const asset = project.media.find((item) => item.id === clip.mediaId)
      const video = visualVideoRefs.current.get(clip.id)
      if (!video || asset?.kind !== 'video' || !asset.url) continue
      if (video.src !== asset.url) video.src = asset.url
      const heldFrame = !activeIds.has(clip.id)
      const clipTime = heldFrame ? Math.max(0, clip.duration - 1 / 30) : Math.max(0, playhead - clip.start)
      const sourceTime = clip.inPoint + clipTime * clip.speed
      if (Number.isFinite(sourceTime) && Math.abs(video.currentTime - sourceTime) > 0.45) video.currentTime = Math.min(sourceTime, Math.max(0, video.duration || sourceTime))
      video.muted = clip.muted || heldFrame
      video.playbackRate = Math.min(4, Math.max(0.25, clip.speed))
      if (playing && !heldFrame) void video.play().catch(() => undefined)
      else video.pause()
    }
    visualVideoRefs.current.forEach((video, id) => {
      if (!visibleIds.has(id)) video.pause()
    })
  }, [activeVisualClips, previewVisualClips, project.media, playhead, playing])

  useEffect(() => {
    for (const clip of project.clips.filter((item) => item.track === 'audio')) {
      const audio = audioRefs.current.get(clip.id)
      const asset = project.media.find((item) => item.id === clip.mediaId)
      if (!audio || !asset?.url) continue
      if (audio.src !== asset.url) audio.src = asset.url
      const inside = playhead >= clip.start && playhead < clipEnd(clip) && !clip.muted && !project.mutedTracks?.includes('audio')
      const sourceTime = clip.inPoint + Math.max(0, playhead - clip.start) * clip.speed
      if (inside && Math.abs(audio.currentTime - sourceTime) > 0.5) audio.currentTime = sourceTime
      audio.volume = Math.max(0, Math.min(1, audioGainAt(clip, playhead)))
      audio.playbackRate = Math.min(4, Math.max(0.25, clip.speed))
      if (playing && inside) void audio.play().catch(() => undefined)
      else audio.pause()
    }
  }, [project.clips, project.media, project.mutedTracks, playhead, playing])

  useEffect(() => {
    if (screen !== 'editor') return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const editingText = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) shortcutsRef.current.redo()
        else shortcutsRef.current.undo()
      } else if (command && event.key.toLowerCase() === 'c' && !editingText && (selectedClip || multiSelectedClipIds.length)) {
        event.preventDefault()
        shortcutsRef.current.copy()
      } else if (command && event.key.toLowerCase() === 'x' && !editingText && (selectedClip || multiSelectedClipIds.length)) {
        event.preventDefault()
        shortcutsRef.current.cut()
      } else if (command && event.key.toLowerCase() === 'v' && !editingText && copiedClips?.length) {
        event.preventDefault()
        shortcutsRef.current.paste()
      } else if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcutsRef.current.save()
      } else if (event.code === 'Space' && !editingText) {
        event.preventDefault()
        shortcutsRef.current.togglePlayback()
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !editingText) {
        event.preventDefault()
        shortcutsRef.current.remove()
      } else if (event.key.toLowerCase() === 's' && !editingText && !command) {
        shortcutsRef.current.split()
      } else if (!editingText && !command && event.key.toLowerCase() === 'm') {
        shortcutsRef.current.addMarker()
      } else if (!editingText && !command && event.key === '[') {
        shortcutsRef.current.previousMarker()
      } else if (!editingText && !command && event.key === ']') {
        shortcutsRef.current.nextMarker()
      } else if (!editingText && !command && event.key.toLowerCase() === 'l') {
        shortcutsRef.current.toggleLoop()
      } else if (!editingText && !command && event.key === '?') {
        shortcutsRef.current.toggleShortcuts()
      }
      if (event.key === 'Escape') {
        setTimelineContextMenu(null)
        setShortcutsOpen(false)
        setMarkerDialog(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen, selectedClip, multiSelectedClipIds, copiedClips])

  useEffect(() => {
    if (!playing) {
      if (clockRef.current !== null) cancelAnimationFrame(clockRef.current)
      clockRef.current = null
      return
    }
    playStartRef.current = { time: playhead, now: performance.now() }
    lastClockPaintRef.current = 0
    const tick = (now: number) => {
      const next = playStartRef.current.time + (now - playStartRef.current.now) / 1000
      if (next >= duration) {
        if (loopPlayback && duration > 0) {
          playStartRef.current = { time: 0, now }
          setPlayhead(0)
          clockRef.current = requestAnimationFrame(tick)
          return
        }
        setPlayhead(duration)
        setPlaying(false)
        return
      }
      if (now - lastClockPaintRef.current >= 50) {
        lastClockPaintRef.current = now
        setPlayhead(next)
      }
      clockRef.current = requestAnimationFrame(tick)
    }
    clockRef.current = requestAnimationFrame(tick)
    return () => { if (clockRef.current !== null) cancelAnimationFrame(clockRef.current) }
  }, [playing, duration, loopPlayback])

  const commitClips = (next: TimelineClip[]) => {
    setHistory((items) => [...items.slice(-79), historyEntry()])
    setFuture([])
    setProject((previous) => ({ ...previous, clips: next }))
  }

  const addFiles = async (files: FileList | File[]) => {
    setImporting(true)
    const imported: MediaAsset[] = []
    const importedFonts: ProjectFont[] = []
    const subtitleClips: TimelineClip[] = []
    const unsupported: string[] = []
    for (const file of Array.from(files)) {
      if (file.size > 1024 * 1024 * 1024) { unsupported.push(`${file.name} (over 1 GB)`); continue }
      if (/\.srt$/i.test(file.name)) {
        try {
          const parsed = parseSrt(await file.text(), project.clips.filter((clip) => clip.track === 'text').length + subtitleClips.length)
          if (parsed.length) subtitleClips.push(...parsed)
          else unsupported.push(`${file.name} (no valid subtitle cues)`)
        } catch {
          unsupported.push(`${file.name} (could not read subtitles)`)
        }
        continue
      }
      if (isFontFile(file.name)) {
        const id = crypto.randomUUID()
        const font: ProjectFont = { id, name: file.name, family: `Frameforge ${id.slice(0, 8)}`, blob: file, addedAt: Date.now() }
        try {
          await registerFont(font)
          importedFonts.push(font)
        } catch {
          unsupported.push(`${file.name} (unsupported or invalid font)`)
        }
        continue
      }
      const kind = classify(file)
      if (!kind) { unsupported.push(file.name); continue }
      let mediaFile = file
      let metadata = await readMetadata(mediaFile, kind)
      if (kind === 'video' && !metadata.duration && /\.mkv$/i.test(file.name)) {
        setMessage(`Converting ${file.name} to a browser-compatible MP4…`)
        try {
          mediaFile = await convertVideoToMp4(file)
          metadata = await readMetadata(mediaFile, kind)
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'conversion failed'
          unsupported.push(`${file.name} (MKV conversion failed: ${reason})`)
          continue
        }
      }
      if (kind !== 'image' && !metadata.duration) {
        unsupported.push(`${file.name} (browser could not read this media; use MP4/H.264 or WebM for video)`)
        continue
      }
      imported.push({
        id: crypto.randomUUID(), name: file.name, kind, mime: mediaFile.type, size: mediaFile.size,
        duration: metadata.duration, width: metadata.width, height: metadata.height, addedAt: Date.now(), blob: mediaFile,
        url: URL.createObjectURL(mediaFile),
      })
    }
    if (subtitleClips.length) {
      setHistory((items) => [...items.slice(-79), historyEntry()])
      setFuture([])
    }
    if (imported.length || importedFonts.length || subtitleClips.length) {
      setProject((previous) => ({
        ...previous,
        media: [...previous.media, ...imported],
        stickers: [...(previous.stickers ?? []), ...imported.filter((item) => item.kind === 'image').map((item) => ({ ...item, sticker: true, stickerCategory: 'custom' } as StickerAsset))],
        fonts: [...(previous.fonts ?? []), ...importedFonts],
        clips: [...previous.clips, ...subtitleClips],
      }))
      if (subtitleClips.length) {
        setActiveTab('Text')
        setSelectedId(subtitleClips[0].id)
      } else if (imported.length && imported.every((asset) => asset.kind === 'audio')) setActiveTab('Audio')
      else if (imported.length) setActiveTab('Media')
      const additions = imported.length + importedFonts.length + subtitleClips.length
      report(`Imported ${additions} ${additions === 1 ? 'item' : 'items'}${unsupported.length ? ` · skipped: ${unsupported.join(', ')}` : ''}.`)
    } else if (unsupported.length) report(`Could not import: ${unsupported.join(', ')}`)
    setImporting(false)
  }

  const addAssetToTimeline = (asset: MediaAsset, target?: TrackKind, at?: number, overlayLayer?: number) => {
    const track = target ?? assetTrack(asset.kind)
    if ((asset.kind === 'audio' && track !== 'audio') || (asset.kind !== 'audio' && track !== 'video' && track !== 'overlay')) {
      report(asset.kind === 'audio' ? 'Audio media can only be added to an audio track.' : 'Video and image media can only be added to video or overlay tracks.')
      return
    }
    const siblings = project.clips.filter((clip) => clip.track === track)
    const start = at ?? (track === 'overlay' ? playhead : siblings.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0))
    const nextOverlayLayer = track === 'overlay'
      ? overlayLayer ?? Math.max(0, ...project.clips.filter((item) => item.track === 'overlay').map((item) => item.overlayLayer ?? 1)) + 1
      : undefined
    const clip = makeClip(asset, start, track, nextOverlayLayer)
    commitClips([...project.clips, clip])
    setSelectedId(clip.id)
    setMultiSelectedClipIds([clip.id])
    setPlayhead(start)
    setSelectedStickerClip(null)
  }

  const addStickerToTimeline = (sticker: Sticker, at?: number) => {
    const start = at ?? playhead
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      mediaId: sticker.id,
      track: 'overlay',
      name: sticker.name,
      start,
      inPoint: 0,
      duration: 4,
      speed: 1,
      volume: 1,
      muted: false,
      positionX: 0,
      positionY: 0,
      scale: 40,
      rotation: 0,
      opacity: 100,
      overlayLayer: Math.max(0, ...project.clips.filter((item) => item.track === 'overlay').map((item) => item.overlayLayer ?? 1)) + 1,
      overlayLayoutConfigured: true,
    }
    commitClips([...project.clips, clip])
    setSelectedId(clip.id)
    setMultiSelectedClipIds([clip.id])
    setSelectedStickerClip(clip.id)
    setPlayhead(start)
    setActiveTab('Media')
  }

  const startStickerTransform = (event: ReactPointerEvent<HTMLDivElement>, clipId: string, action: 'move' | 'resize' | 'rotate' | 'crop', corner: 'tl' | 'tr' | 'bl' | 'br' | null = null, edge: 'top' | 'right' | 'bottom' | 'left' | null = null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const clip = project.clips.find((c) => c.id === clipId)
    if (!clip) return
    setSelectedStickerClip(clipId)
    setSelectedId(clipId)
    setStickerTransform({
      clipId,
      x: clip.positionX ?? 0,
      y: clip.positionY ?? 0,
      scale: clip.scale ?? 100,
      rotation: clip.rotation ?? 0,
      startX: event.clientX,
      startY: event.clientY,
      action,
      corner,
      edge,
    })
  }

  const moveStickerTransform = (event: ReactPointerEvent<HTMLDivElement>) => {
    const t = stickerTransform
    if (!t) return
    const clip = project.clips.find((c) => c.id === t.clipId)
    if (!clip) return
    const dx = event.clientX - t.startX
    const dy = event.clientY - t.startY
    const previewFrame = document.querySelector('.preview-frame')
    if (!previewFrame) return
    const rect = previewFrame.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const frameW = rect.width
    const frameH = rect.height
    if (t.action === 'move') {
      const nx = ((t.startX - cx) + dx) / frameW * 100
      const ny = ((t.startY - cy) + dy) / frameH * 100
      updateClip(t.clipId, { positionX: Math.max(-100, Math.min(100, nx)), positionY: Math.max(-100, Math.min(100, ny)) }, false)
    } else if (t.action === 'resize' && t.corner) {
      const mx = (event.clientX - cx) / frameW * 100
      const baseScale = t.scale
      let newScale = baseScale
      if (t.corner === 'tl') newScale = baseScale + (-(mx - t.x) / 100) * 100
      else if (t.corner === 'tr') newScale = baseScale + (mx / 100) * 100
      else if (t.corner === 'bl') newScale = baseScale + (-(mx - t.x) / 100) * 100
      else if (t.corner === 'br') newScale = baseScale + (mx / 100) * 100
      newScale = Math.max(10, Math.min(500, newScale))
      updateClip(t.clipId, { scale: newScale }, false)
      const nx = ((t.startX - cx) + dx) / frameW * 100
      const ny = ((t.startY - cy) + dy) / frameH * 100
      updateClip(t.clipId, { positionX: Math.max(-100, Math.min(100, nx)), positionY: Math.max(-100, Math.min(100, ny)) }, false)
    } else if (t.action === 'rotate') {
      const angle1 = Math.atan2(t.startY - cy, t.startX - cx)
      const angle2 = Math.atan2(event.clientY - cy, event.clientX - cx)
      const delta = (angle2 - angle1) * 180 / Math.PI
      let newRot = t.rotation + delta
      newRot = ((newRot % 360) + 360) % 360
      updateClip(t.clipId, { rotation: newRot }, false)
    } else if (t.action === 'crop' && t.edge) {
      const currentCrop = clip[t.edge === 'top' ? 'cropTop' : t.edge === 'bottom' ? 'cropBottom' : t.edge === 'left' ? 'cropLeft' : 'cropRight'] ?? 0
      let newValue = currentCrop
      if (t.edge === 'top') newValue = currentCrop - dy / frameH * 100
      else if (t.edge === 'bottom') newValue = currentCrop + dy / frameH * 100
      else if (t.edge === 'left') newValue = currentCrop - dx / frameW * 100
      else if (t.edge === 'right') newValue = currentCrop + dx / frameW * 100
      newValue = Math.max(0, Math.min(100, newValue))
      const update: Record<string, number> = {}
      update[t.edge === 'top' ? 'cropTop' : t.edge === 'bottom' ? 'cropBottom' : t.edge === 'left' ? 'cropLeft' : 'cropRight'] = newValue
      // Prevent total crop from exceeding 100%
      const horizontal = (update.cropLeft ?? 0) + (update.cropRight ?? 0)
      const vertical = (update.cropTop ?? 0) + (update.cropBottom ?? 0)
      if (horizontal > 100) {
        update.cropLeft = Math.max(0, 100 - update.cropRight!)
        update.cropRight = Math.max(0, 100 - update.cropLeft!)
      }
      if (vertical > 100) {
        update.cropTop = Math.max(0, 100 - update.cropBottom!)
        update.cropBottom = Math.max(0, 100 - update.cropTop!)
      }
      updateClip(t.clipId, update, false)
    }
  }

  const finishStickerTransform = () => {
    if (stickerTransform) {
      const before = project.clips
      setHistory((items) => [...items.slice(-79), { ...historyEntry(), clips: before }])
      setFuture([])
    }
    setStickerTransform(null)
  }

  const deleteSticker = (clipId: string) => {
    commitClips(project.clips.filter((c) => c.id !== clipId))
    setSelectedStickerClip(null)
    setSelectedId(null)
    report('Sticker removed.')
  }

  const duplicateSticker = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId)
    if (!clip || clip.track !== 'overlay') return
    const target = clipEnd(clip)
    const copy: TimelineClip = {
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} copy`,
      start: target,
    }
    commitClips([...project.clips, copy])
    setSelectedId(copy.id)
    setMultiSelectedClipIds([copy.id])
    setSelectedStickerClip(copy.id)
    setPlayhead(target)
  }

  const bringStickerForward = (clipId: string) => moveOverlayLayer(clipId, 1)
  const sendStickerBackward = (clipId: string) => moveOverlayLayer(clipId, -1)

  const updateClip = (id: string, patch: Partial<TimelineClip>, recordHistory = true) => {
    if (recordHistory) {
      setHistory((items) => [...items.slice(-79), historyEntry()])
      setFuture([])
    }
    setProject((previous) => ({ ...previous, clips: previous.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) }))
  }

  const updateClipWithAutoKey = (id: string, patch: Partial<TimelineClip>) => {
    const clip = project.clips.find((c) => c.id === id)
    if (!clip || !autoKeyframe || !selectedClip) { updateClip(id, patch); return }
    const playheadInside = playhead >= clip.start && playhead < clipEnd(clip)
    if (!playheadInside) { updateClip(id, patch); return }
    const localTime = Math.max(0, Math.min(clip.duration, playhead - clip.start))
    let next = clip
    const animProps: AnimatableProperty[] = ['positionX', 'positionY', 'scale', 'opacity', 'volume']
    for (const prop of animProps) {
      if (patch[prop] !== undefined && patch[prop] !== staticPropertyValue(clip, prop)) {
        next = addKeyframeToClip(next, prop, localTime, patch[prop] as number)
      }
    }
    updateClip(id, { ...patch, ...(next.keyframes ? { keyframes: next.keyframes } : {}) })
  }

  const toggleSpeedRamp = (event: ChangeEvent<HTMLInputElement>) => {
    const clip = selectedClip
    if (!clip) return
    const ramp = clip.speedRamp ?? { enabled: false, points: [makeSpeedPoint(0, clip.speed)], frameBlending: false, opticalFlow: false, pitchPreserved: true, reverse: false }
    updateClip(clip.id, { speedRamp: { ...ramp, enabled: event.target.checked } })
  }

  const toggleSpeedReverse = (event: ChangeEvent<HTMLInputElement>) => {
    const clip = selectedClip
    if (!clip) return
    const ramp = clip.speedRamp ?? { enabled: true, points: [makeSpeedPoint(0, clip.speed)], frameBlending: false, opticalFlow: false, pitchPreserved: true, reverse: false }
    updateClip(clip.id, { speedRamp: { ...ramp, reverse: event.target.checked } })
  }

  const recordHistory = () => {
    setHistory((items) => [...items.slice(-79), historyEntry()])
    setFuture([])
  }

  const applyFilterPreset = (preset: FilterPreset) => {
    const selectedTargets = project.clips.filter((clip) => multiSelectedClipIds.includes(clip.id) && (clip.track === 'video' || clip.track === 'overlay'))
    if (preset.id === 'none') {
      recordHistory()
      if (selectedTargets.length > 1) setProject((previous) => ({
        ...previous,
        clips: previous.clips.map((clip) => selectedTargets.some((target) => target.id === clip.id) ? { ...clip, filters: [] } : clip),
      }))
      else if (filterTargetClip) updateClip(filterTargetClip.id, { filters: [] }, false)
      else setProject((previous) => ({ ...previous, settings: { ...previous.settings, filterPreset: 'none', filterStack: [] } }))
      setSelectedFilterId(null)
      return
    }
    const applied = makeAppliedFilter(preset)
    recordHistory()
    if (selectedTargets.length > 1) {
      setProject((previous) => ({
        ...previous,
        clips: previous.clips.map((clip) => selectedTargets.some((target) => target.id === clip.id)
          ? { ...clip, filters: [...(clip.filters ?? []), { ...applied, id: crypto.randomUUID() }] }
          : clip),
      }))
      setSelectedFilterId(null)
    } else if (filterTargetClip) updateClip(filterTargetClip.id, { filters: [...targetFilterStack, applied] }, false)
    else setProject((previous) => ({
      ...previous,
      settings: { ...previous.settings, filterPreset: 'none', filterStack: [...targetFilterStack, applied] },
    }))
    if (selectedTargets.length <= 1) setSelectedFilterId(applied.id)
    setProject((previous) => ({ ...previous, recentEffectIds: [preset.id, ...(previous.recentEffectIds ?? []).filter((id) => id !== preset.id)].slice(0, 20) }))
  }

  const updateAppliedFilter = (id: string, patch: Partial<AppliedFilter>) => {
    recordHistory()
    if (filterTargetClip) updateClip(filterTargetClip.id, {
      filters: (filterTargetClip.filters ?? []).map((item) => item.id === id ? { ...item, ...patch } : item),
    }, false)
    else {
      const current = project.settings.filterStack ?? effectiveFilters(project.settings)
      setProject((previous) => ({ ...previous, settings: { ...previous.settings, filterPreset: 'none', filterStack: current.map((item) => item.id === id ? { ...item, ...patch } : item) } }))
    }
  }

  const removeAppliedFilter = (id: string) => {
    recordHistory()
    if (filterTargetClip) updateClip(filterTargetClip.id, { filters: (filterTargetClip.filters ?? []).filter((item) => item.id !== id) }, false)
    else {
      const current = project.settings.filterStack ?? effectiveFilters(project.settings)
      setProject((previous) => ({ ...previous, settings: { ...previous.settings, filterPreset: 'none', filterStack: current.filter((item) => item.id !== id) } }))
    }
    setSelectedFilterId(null)
  }

  const moveAppliedFilter = (id: string, direction: -1 | 1) => {
    const stack = filterTargetClip?.filters ?? project.settings.filterStack ?? effectiveFilters(project.settings)
    const index = stack.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= stack.length) return
    const reordered = [...stack]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    recordHistory()
    if (filterTargetClip) updateClip(filterTargetClip.id, { filters: reordered }, false)
    else setProject((previous) => ({ ...previous, settings: { ...previous.settings, filterPreset: 'none', filterStack: reordered } }))
  }

  const copyFilterStack = () => {
    const stack = filterTargetClip?.filters ?? project.settings.filterStack ?? effectiveFilters(project.settings)
    setCopiedFilters(stack.map((item) => ({ ...item, parameters: { ...item.parameters } })))
    report(`Copied ${stack.length} filter${stack.length === 1 ? '' : 's'}.`)
  }

  const pasteFilterStack = () => {
    if (!copiedFilters) return
    const pasted = copiedFilters.map((item) => ({ ...item, id: crypto.randomUUID(), parameters: { ...item.parameters } }))
    recordHistory()
    if (filterTargetClip) updateClip(filterTargetClip.id, { filters: pasted }, false)
    else setProject((previous) => ({ ...previous, settings: { ...previous.settings, filterPreset: 'none', filterStack: pasted } }))
    setSelectedFilterId(pasted[pasted.length - 1]?.id ?? null)
  }

  const saveCustomFilterPreset = () => {
    const active = selectedAppliedFilter
    if (!active) { report('Apply or select a filter before saving a custom preset.'); return }
    const name = window.prompt('Name this filter preset')
    if (!name?.trim()) return
    const preset: FilterPreset = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim().slice(0, 60),
      description: 'Custom user preset',
      category: 'Custom User Presets',
      parameters: { ...active.parameters },
      packId: active.packId,
    }
    recordHistory()
    setProject((previous) => ({ ...previous, customFilterPresets: [...(previous.customFilterPresets ?? []), preset] }))
    report(`Saved "${preset.name}" to custom presets.`)
  }

  const toggleFavorite = (id: string) => {
    setProject((previous) => ({
      ...previous,
      favoriteEffectIds: (previous.favoriteEffectIds ?? []).includes(id)
        ? (previous.favoriteEffectIds ?? []).filter((favorite) => favorite !== id)
        : [...(previous.favoriteEffectIds ?? []), id],
    }))
  }

  const installEffectPack = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Effect pack JSON files must be 10 MB or smaller.')
      const pack = validateEffectPack(JSON.parse(await file.text()))
      if ((project.effectPacks ?? []).some((installed) => installed.id === pack.id)) throw new Error(`Effect pack "${pack.name}" is already installed.`)
      const filterIds = new Set(allFilterPresets.map((preset) => preset.id))
      for (const preset of pack.filters ?? []) if (filterIds.has(preset.id)) throw new Error(`Filter ID "${preset.id}" is already in use.`)
      const transitionIds = new Set(allTransitionPresets.map((preset) => preset.id))
      for (const preset of pack.transitions ?? []) if (transitionIds.has(preset.id)) throw new Error(`Transition ID "${preset.id}" is already in use.`)
      const filters = (pack.filters ?? []).map((preset) => ({ ...preset, packId: pack.id }))
      const transitions = (pack.transitions ?? []).map((preset) => ({ ...preset, packId: pack.id }))
      recordHistory()
      setProject((previous) => ({
        ...previous,
        effectPacks: [...(previous.effectPacks ?? []), { ...pack, filters, transitions }],
        customFilterPresets: [...(previous.customFilterPresets ?? []), ...filters],
      }))
      report(`Installed effect pack "${pack.name}".`)
    } catch (error) {
      report(error instanceof Error ? `Effect pack not installed: ${error.message}` : 'Effect pack not installed: invalid JSON.')
    }
  }

  const uninstallEffectPack = (pack: EffectPack) => {
    const inUse = project.clips.some((clip) => clip.filters?.some((item) => item.packId === pack.id) || clip.transitionIn?.kind && (pack.transitions ?? []).some((item) => item.id === clip.transitionIn?.kind))
      || project.settings.filterStack?.some((item) => item.packId === pack.id)
    if (inUse && !window.confirm(`"${pack.name}" is used by this project. Its effect settings will remain as missing-pack references. Uninstall anyway?`)) return
    recordHistory()
    setProject((previous) => ({
      ...previous,
      effectPacks: (previous.effectPacks ?? []).filter((item) => item.id !== pack.id),
      customFilterPresets: (previous.customFilterPresets ?? []).filter((item) => item.packId !== pack.id),
    }))
    report(`Uninstalled effect pack "${pack.name}".`)
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setFuture((items) => [historyEntry(), ...items])
    setHistory((items) => items.slice(0, -1))
    setProject((item) => ({ ...item, clips: previous.clips, settings: previous.settings, customFilterPresets: previous.customFilterPresets ?? item.customFilterPresets, effectPacks: previous.effectPacks ?? item.effectPacks }))
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setHistory((items) => [...items, historyEntry()])
    setFuture((items) => items.slice(1))
    setProject((item) => ({ ...item, clips: next.clips, settings: next.settings, customFilterPresets: next.customFilterPresets ?? item.customFilterPresets, effectPacks: next.effectPacks ?? item.effectPacks }))
  }

  const splitSelected = () => {
    if (!selectedClip || playhead <= selectedClip.start || playhead >= clipEnd(selectedClip)) {
      report('Place the playhead inside a clip to split it.')
      return
    }
    const firstDuration = playhead - selectedClip.start
    const second: TimelineClip = {
      ...selectedClip, id: crypto.randomUUID(), start: playhead,
      inPoint: selectedClip.inPoint + firstDuration * selectedClip.speed,
      duration: selectedClip.duration - firstDuration,
    }
    commitClips(project.clips.flatMap((clip) => clip.id === selectedClip.id
      ? [{ ...clip, duration: firstDuration }, second] : [clip]))
    setSelectedId(second.id)
  }

  const removeSelected = () => {
    const selectedIds = new Set(multiSelectedClipIds.length ? multiSelectedClipIds : selectedId ? [selectedId] : [])
    if (!selectedIds.size) return
    commitClips(project.clips.filter((clip) => !selectedIds.has(clip.id)))
    setSelectedId(null)
    setMultiSelectedClipIds([])
  }

  const assetDuration = (clip: TimelineClip) => {
    const asset = project.media.find((item) => item.id === clip.mediaId)
    return asset?.kind === 'image' ? null : asset?.duration
  }

  const rippleDeleteSelected = () => {
    const selected = selectedTimelineClips()
    if (!selected.length) { report('Select one or more clips to ripple delete.'); return }
    const selectedIds = new Set(selected.map((clip) => clip.id))
    const laneKey = (clip: TimelineClip) => `${clip.track}:${clip.track === 'overlay' ? clip.overlayLayer ?? 1 : ''}`
    const intervalsByLane = new Map<string, Array<{ start: number; end: number }>>()
    for (const clip of selected) {
      const key = laneKey(clip)
      intervalsByLane.set(key, [...(intervalsByLane.get(key) ?? []), { start: clip.start, end: clipEnd(clip) }])
    }
    for (const [key, intervals] of intervalsByLane) {
      const merged: Array<{ start: number; end: number }> = []
      for (const interval of intervals.sort((a, b) => a.start - b.start)) {
        const last = merged[merged.length - 1]
        if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
        else merged.push({ ...interval })
      }
      intervalsByLane.set(key, merged)
    }
    const remaining = project.clips.filter((clip) => !selectedIds.has(clip.id)).map((clip) => {
      const removedBefore = (intervalsByLane.get(laneKey(clip)) ?? [])
        .filter((interval) => interval.end <= clip.start)
        .reduce((total, interval) => total + interval.end - interval.start, 0)
      return removedBefore ? { ...clip, start: Math.max(0, clip.start - removedBefore) } : clip
    })
    commitClips(remaining)
    setSelectedId(null)
    setMultiSelectedClipIds([])
    setTimelineContextMenu(null)
    report(`Ripple deleted ${selected.length} clip${selected.length === 1 ? '' : 's'} and closed the gaps on their tracks.`)
  }

  const splitAllAtPlayhead = () => {
    const splitIds = new Set(project.clips
      .filter((clip) => playhead > clip.start && playhead < clipEnd(clip))
      .map((clip) => clip.id))
    if (!splitIds.size) { report('The playhead is not inside any clips.'); return }
    const rightHalves: TimelineClip[] = []
    const clips = project.clips.flatMap((clip) => {
      if (!splitIds.has(clip.id)) return [clip]
      const firstDuration = playhead - clip.start
      const second: TimelineClip = {
        ...clip,
        id: crypto.randomUUID(),
        start: playhead,
        inPoint: clip.inPoint + firstDuration * clip.speed,
        duration: clip.duration - firstDuration,
      }
      rightHalves.push(second)
      return [{ ...clip, duration: firstDuration }, second]
    })
    commitClips(clips)
    setSelectedId(rightHalves[0]?.id ?? null)
    setMultiSelectedClipIds(rightHalves.map((clip) => clip.id))
    report(`Split ${rightHalves.length} clip${rightHalves.length === 1 ? '' : 's'} at the playhead.`)
  }

  const trimSelectedToPlayhead = (edge: 'start' | 'end') => {
    if (!selectedClip) { report('Select a clip to trim.'); return }
    const clip = selectedClip
    if (edge === 'start') {
      const cut = playhead - clip.start
      if (cut < 0.1 || cut >= clip.duration) { report('Place the playhead at least 0.1 seconds inside the selected clip.'); return }
      updateClip(clip.id, { start: playhead, inPoint: clip.inPoint + cut * clip.speed, duration: clip.duration - cut })
    } else {
      const newDuration = playhead - clip.start
      if (newDuration < 0.1 || newDuration >= clip.duration) { report('Place the playhead at least 0.1 seconds inside the selected clip.'); return }
      updateClip(clip.id, { duration: newDuration })
    }
  }

  const addTimelineMarker = () => {
    setMarkerDialog({ value: `Marker ${(project.markers?.length ?? 0) + 1}`, color: MARKER_COLORS[(project.markers?.length ?? 0) % MARKER_COLORS.length] })
  }

  const jumpToMarker = (direction: -1 | 1) => {
    if (!markers.length) { report('Add a timeline marker first.'); return }
    const next = direction > 0
      ? markers.find((marker) => marker.time > playhead + 0.001) ?? markers[0]
      : [...markers].reverse().find((marker) => marker.time < playhead - 0.001) ?? markers[markers.length - 1]
    seekTimeline(next.time)
  }

  const renameMarker = (markerId: string) => {
    const marker = markers.find((item) => item.id === markerId)
    if (!marker) return
    setMarkerDialog({ markerId, value: marker.label, color: marker.color ?? '#f5a524' })
  }

  const saveMarker = () => {
    if (!markerDialog) return
    const label = markerDialog.value.trim()
    if (!label) { report('Enter a name for the marker.'); return }
    if (markerDialog.markerId) {
      setProject((previous) => ({
        ...previous,
        markers: (previous.markers ?? []).map((item) => item.id === markerDialog.markerId ? { ...item, label, color: markerDialog.color } : item),
      }))
      report('Marker renamed.')
    } else {
      const marker = { id: crypto.randomUUID(), time: playhead, label, color: markerDialog.color }
      setProject((previous) => ({ ...previous, markers: [...(previous.markers ?? []), marker] }))
      report(`Added marker at ${formatTime(playhead)}.`)
    }
    setMarkerDialog(null)
  }

  const removeMarker = (markerId: string) => {
    setProject((previous) => ({ ...previous, markers: (previous.markers ?? []).filter((marker) => marker.id !== markerId) }))
    setTimelineContextMenu(null)
    report('Timeline marker removed.')
  }

  const toggleTrackState = (track: 'video' | 'overlay' | 'text' | 'subtitle' | 'audio') => {
    const property = track === 'audio' ? 'mutedTracks' : 'hiddenTracks'
    setProject((previous) => {
      const current = previous[property] ?? []
      return {
        ...previous,
        [property]: current.includes(track) ? current.filter((item) => item !== track) : [...current, track],
      }
    })
  }

  const renameTrack = (trackId: string) => {
    const track = project.tracks?.find((t) => t.id === trackId)
    if (!track) return
    setTrackRenameValue(track.name)
    setRenamingTrackId(trackId)
  }

  const saveTrackRename = () => {
    if (!renamingTrackId || !trackRenameValue.trim()) {
      setRenamingTrackId(null)
      setTrackRenameValue('')
      return
    }
    setProject((previous) => ({
      ...previous,
      tracks: (previous.tracks ?? DEFAULT_TRACKS).map((t) =>
        t.id === renamingTrackId ? { ...t, name: trackRenameValue.trim() } : t,
      ),
    }))
    setRenamingTrackId(null)
    setTrackRenameValue('')
  }

  const cancelTrackRename = () => {
    setRenamingTrackId(null)
    setTrackRenameValue('')
  }

  const addTrack = (kind: TrackKind) => {
    const existing = project.tracks ?? DEFAULT_TRACKS
    const sameKind = existing.filter((t) => t.kind === kind)
    const name = kind === 'video' ? `Video ${sameKind.length + 1}`
      : kind === 'audio' ? `Audio ${sameKind.length + 1}`
      : kind === 'text' ? `Text ${sameKind.length + 1}`
      : `Overlay ${sameKind.length + 1}`
    const colors: Record<string, string> = {
      video: '#b9f35a', audio: '#f1a552', text: '#64d9e9', overlay: '#aa8aff',
    }
    const newTrack: TimelineTrack = {
      id: `track-${kind}-${Date.now()}`,
      name,
      kind,
      locked: false,
      muted: false,
      hidden: false,
      soloed: false,
      color: colors[kind],
      ...(kind === 'overlay' ? { overlayLayer: Math.max(0, ...sameKind.map((t) => t.overlayLayer ?? 1)) + 1 } : {}),
    }
    setProject((previous) => ({
      ...previous,
      tracks: [...(previous.tracks ?? DEFAULT_TRACKS), newTrack],
    }))
  }

  const toggleTrackLock = (trackId: string) => {
    setProject((previous) => ({
      ...previous,
      tracks: (previous.tracks ?? DEFAULT_TRACKS).map((t) => t.id === trackId ? { ...t, locked: !t.locked } : t),
    }))
  }

  const toggleTrackSolo = (trackId: string) => {
    setProject((previous) => {
      const tracks = previous.tracks ?? DEFAULT_TRACKS
      const track = tracks.find((t) => t.id === trackId)
      if (!track) return previous
      const nextSoloed = !track.soloed
      return {
        ...previous,
        tracks: tracks.map((t) => ({
          ...t,
          soloed: t.id === trackId ? nextSoloed : false,
        })),
      }
    })
  }

  const fitTimeline = () => {
    const available = timelineRef.current?.clientWidth ?? 850
    setZoom(Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, available / Math.max(1, duration + 2))))
    if (timelineRef.current) timelineRef.current.scrollLeft = 0
  }

  const seekTimeline = (time: number) => {
    const next = duration === 0 ? 0 : Math.min(duration, Math.max(0, time))
    setPlayhead(next)
    const viewport = timelineRef.current
    if (!viewport) return
    const position = time * zoom
    if (position < viewport.scrollLeft || position > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = Math.max(0, position - viewport.clientWidth / 2)
    }
  }

  const selectedTimelineClips = () => {
    const ids = new Set(multiSelectedClipIds.length ? multiSelectedClipIds : selectedClip ? [selectedClip.id] : [])
    return project.clips.filter((clip) => ids.has(clip.id))
  }

  const copySelectedClips = () => {
    const selected = selectedTimelineClips()
    if (!selected.length) return
    setCopiedClips(selected.map((clip) => ({ ...clip, transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined, filters: clip.filters?.map((filter) => ({ ...filter, parameters: { ...filter.parameters } })) })))
    report(`Copied ${selected.length} clip${selected.length === 1 ? '' : 's'}.`)
  }

  const pasteClips = (at = playhead) => {
    if (!copiedClips?.length) return
    const earliest = Math.min(...copiedClips.map((clip) => clip.start))
    const target = Math.max(0, at)
    let nextOverlayLayer = Math.max(0, ...project.clips.filter((item) => item.track === 'overlay').map((item) => item.overlayLayer ?? 1))
    const pasted = copiedClips.map((clip) => ({
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} copy`,
      start: target + clip.start - earliest,
      ...(clip.track === 'overlay'
        ? { overlayLayer: ++nextOverlayLayer }
        : {}),
      transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined,
      filters: clip.filters?.map((filter) => ({ ...filter, id: crypto.randomUUID(), parameters: { ...filter.parameters } })),
    }))
    commitClips([...project.clips, ...pasted])
    setSelectedId(pasted[pasted.length - 1].id)
    setMultiSelectedClipIds(pasted.map((clip) => clip.id))
    setPlayhead(target)
    setTimelineContextMenu(null)
  }

  const cutSelectedClips = () => {
    const selected = selectedTimelineClips()
    if (!selected.length) return
    copySelectedClips()
    const ids = new Set(selected.map((clip) => clip.id))
    commitClips(project.clips.filter((clip) => !ids.has(clip.id)))
    setSelectedId(null)
    setMultiSelectedClipIds([])
    setTimelineContextMenu(null)
    report(`Cut ${selected.length} clip${selected.length === 1 ? '' : 's'}.`)
  }

  const duplicateSelected = () => {
    const selected = selectedTimelineClips()
    if (!selected.length) return
    const earliest = Math.min(...selected.map((clip) => clip.start))
    const target = Math.max(...selected.map(clipEnd))
    setCopiedClips(selected.map((clip) => ({ ...clip, transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined, filters: clip.filters?.map((filter) => ({ ...filter, parameters: { ...filter.parameters } })) })))
    let nextOverlayLayer = Math.max(0, ...project.clips.filter((item) => item.track === 'overlay').map((item) => item.overlayLayer ?? 1))
    const pasted = selected.map((clip) => ({
      ...clip,
      id: crypto.randomUUID(),
      name: `${clip.name} copy`,
      start: target + clip.start - earliest,
      ...(clip.track === 'overlay' ? { overlayLayer: ++nextOverlayLayer } : {}),
    }))
    commitClips([...project.clips, ...pasted])
    setSelectedId(pasted[pasted.length - 1].id)
    setMultiSelectedClipIds(pasted.map((clip) => clip.id))
  }

  const openClipContextMenu = (event: ReactMouseEvent<HTMLDivElement>, clip: TimelineClip) => {
    event.preventDefault()
    event.stopPropagation()
    if (!multiSelectedClipIds.includes(clip.id)) {
      setSelectedId(clip.id)
      setMultiSelectedClipIds([clip.id])
    }
    setTimelineContextMenu({ x: event.clientX, y: event.clientY, clipId: clip.id, track: clip.track, time: playhead })
  }

  const openLaneContextMenu = (event: ReactMouseEvent<HTMLDivElement>, track: TrackKind) => {
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const time = Math.max(0, (event.clientX - bounds.left + (timelineRef.current?.scrollLeft ?? 0)) / zoom)
    setTimelineContextMenu({ x: event.clientX, y: event.clientY, track, time })
  }

  const moveSelectedToOverlay = (clipId: string) => {
    const clip = project.clips.find((item) => item.id === clipId)
    if (!clip || (clip.track !== 'video' && clip.track !== 'overlay')) return
    const nextTrack: 'video' | 'overlay' = clip.track === 'overlay' ? 'video' : 'overlay'
    const usesDefaultLayout = (clip.positionX ?? 0) === 0 && (clip.positionY ?? 0) === 0 && (clip.scale ?? 100) === 100
    const usesPictureInPictureLayout = clip.positionX === DEFAULT_OVERLAY_LAYOUT.positionX
      && clip.positionY === DEFAULT_OVERLAY_LAYOUT.positionY
      && clip.scale === DEFAULT_OVERLAY_LAYOUT.scale
      && clip.opacity === DEFAULT_OVERLAY_LAYOUT.opacity
    const moved: TimelineClip = nextTrack === 'overlay'
      ? {
        ...clip,
        track: nextTrack,
        ...(usesDefaultLayout ? { ...DEFAULT_OVERLAY_LAYOUT, opacity: clip.opacity ?? DEFAULT_OVERLAY_LAYOUT.opacity } : {}),
        overlayLayoutConfigured: true,
        overlayLayer: Math.max(0, ...project.clips.filter((item) => item.track === 'overlay').map((item) => item.overlayLayer ?? 1)) + 1,
      }
      : {
        ...clip,
        track: nextTrack,
        ...(usesPictureInPictureLayout ? { positionX: 0, positionY: 0, scale: 100, opacity: 100 } : {}),
        overlayLayoutConfigured: undefined,
        overlayLayer: undefined,
      }
    commitClips(project.clips.map((item) => item.id === clipId ? moved : item))
    setTimelineContextMenu(null)
  }

  const moveOverlayLayer = (clipId: string, direction: -1 | 1) => {
    const clip = project.clips.find((item) => item.id === clipId)
    if (!clip || clip.track !== 'overlay') return
    const layers = Array.from(new Set(project.clips
      .filter((item) => item.track === 'overlay')
      .map((item) => item.overlayLayer ?? 1))).sort((a, b) => a - b)
    const currentIndex = layers.indexOf(clip.overlayLayer ?? 1)
    const targetIndex = currentIndex + direction
    const overlayLayer = direction > 0
      ? targetIndex < layers.length ? layers[targetIndex] : Math.max(...layers) + 1
      : targetIndex >= 0 ? layers[targetIndex] : 1
    commitClips(project.clips.map((item) => item.id === clipId ? { ...item, overlayLayer } : item))
    setTimelineContextMenu(null)
  }

  const beginClipDrag = (event: ReactPointerEvent<HTMLDivElement>, clip: TimelineClip, action: 'move' | 'left' | 'right') => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { clipId: clip.id, action, x: event.clientX, start: clip.start, duration: clip.duration, inPoint: clip.inPoint, clips: project.clips }
  }

  const moveClipDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = (event.clientX - drag.x) / zoom
    const clip = project.clips.find((item) => item.id === drag.clipId)
    if (!clip) return
    if (drag.action === 'move') {
      if (timelineTool === 'slip') {
        const change = Math.max(-drag.inPoint, Math.min(Math.max(0, (assetDuration(clip) ?? Infinity) - drag.inPoint - drag.duration * clip.speed), delta * clip.speed))
        updateClip(clip.id, { inPoint: Math.max(0, drag.inPoint + change) }, false)
        return
      }
      if (timelineTool === 'slide') {
        // Keep neighbours' edit points fixed: the clip moves and adjacent clips stretch to close the gaps.
        const sortedSameTrack = project.clips.filter((item) => item.track === clip.track && item.id !== clip.id).sort((a, b) => a.start - b.start)
        const previous = [...sortedSameTrack].reverse().find((item) => clipEnd(item) <= drag.start + 0.001)
        const next = sortedSameTrack.find((item) => item.start >= drag.start + drag.duration - 0.001)
        let start = Math.max(0, drag.start + delta)
        if (snapEnabled) {
          const points = project.clips.filter((item) => item.id !== clip.id).flatMap((item) => [item.start, clipEnd(item)])
          points.push(playhead)
          const candidates = points.flatMap((point) => [point, point - drag.duration])
          const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - start) < Math.abs(best - start) ? candidate : best, start)
          if (Math.abs(nearest - start) < snapSensitivity) start = Math.max(0, nearest)
        }
        const newStart = Math.max(previous ? clipEnd(previous) : 0, start)
        const leftGap = newStart - (previous ? clipEnd(previous) : 0)
        const rightGap = next ? next.start - (newStart + drag.duration) : 0
        if (previous) updateClip(previous.id, { start: newStart - leftGap - previous.duration }, false)
        if (next) updateClip(next.id, { start: newStart + drag.duration + rightGap }, false)
        updateClip(clip.id, { start: newStart }, false)
        return
      }
      let start = Math.max(0, drag.start + delta)
      if (snapEnabled) {
        const points = project.clips.filter((item) => item.id !== clip.id).flatMap((item) => [item.start, clipEnd(item)])
        points.push(playhead)
        const candidates = points.flatMap((point) => [point, point - clip.duration])
        const nearest = candidates.reduce((best, candidate) =>
          Math.abs(candidate - start) < Math.abs(best - start) ? candidate : best, start)
        if (Math.abs(nearest - start) < snapSensitivity) start = Math.max(0, nearest)
      }
      updateClip(clip.id, { start }, false)
    } else if (drag.action === 'left') {
      const change = Math.max(-drag.start, Math.min(drag.duration - 0.1, delta))
      updateClip(clip.id, { start: drag.start + change, duration: drag.duration - change, inPoint: Math.max(0, drag.inPoint + change * clip.speed) }, false)
    } else {
      updateClip(clip.id, { duration: Math.max(0.1, drag.duration + delta) }, false)
    }
  }

  const finishClipDrag = () => {
    if (dragRef.current) {
      const before = dragRef.current.clips
      setHistory((items) => [...items.slice(-79), { ...historyEntry(), clips: before }])
      setFuture([])
    }
    dragRef.current = null
  }

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (!timelineRef.current || event.target instanceof HTMLElement && event.target.closest('.timeline-clip')) return
    const bounds = timelineRef.current.getBoundingClientRect()
    const time = Math.max(0, Math.min(duration, (event.clientX - bounds.left + timelineRef.current.scrollLeft) / zoom))
    if (playing) playStartRef.current = { time, now: performance.now() }
    setPlayhead(time)
  }

  const setProjectName = (name: string) => setProject((previous) => ({ ...previous, name }))

  const openProject = (item: EditorProject) => {
    const recovered = {
      ...item,
      fonts: item.fonts ?? [],
      clips: item.clips.map(normalizeOverlayClip),
      settings: { ...item.settings, filterPreset: item.settings.filterPreset ?? 'none', filterIntensity: item.settings.filterIntensity ?? 100 },
      media: item.media.map((asset) => ({ ...asset, url: URL.createObjectURL(asset.blob) })),
    }
    recovered.fonts.forEach((font) => void registerFont(font).catch(() => report(`Could not load font: ${font.name}`)))
    setProject(recovered)
    setCopiedClips(null)
    setPlayhead(0)
    setSelectedId(null)
    setScreen('editor')
  }

  const createNewProject = () => {
    const next = createProject()
    setProject(next)
    setHistory([])
    setFuture([])
    setPlayhead(0)
    setSelectedId(null)
    setCopiedClips(null)
    setScreen('editor')
  }

  const duplicateProject = async (item: EditorProject) => {
    const duplicate = { ...item, id: crypto.randomUUID(), name: `${item.name} copy`, createdAt: Date.now(), updatedAt: Date.now() }
    try {
      await saveProject(duplicate)
      setProjects((previous) => [duplicate, ...previous])
      report('Project duplicated locally.')
    } catch {
      report('Could not duplicate this project. Check available browser storage.')
    }
  }

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return
    try {
      await deleteProject(projectToDelete.id)
      setProjects((previous) => previous.filter((record) => record.id !== projectToDelete.id))
      setProjectToDelete(null)
    } catch {
      report(`Could not delete "${projectToDelete.name}". Check that browser storage is available.`)
    }
  }

  const addText = () => {
    const textClip: TimelineClip = {
      id: crypto.randomUUID(), track: 'text', name: 'Title', start: playhead, inPoint: 0,
      duration: 4, speed: 1, volume: 1, muted: false, text: 'Your title', color: '#ffffff', fontSize: 54,
    }
    commitClips([...project.clips, textClip])
    setSelectedId(textClip.id)
    setMultiSelectedClipIds([textClip.id])
    setActiveTab('Text')
  }

  const applyTransitionToClip = (clip: TimelineClip, kind: TransitionKind) => {
    if (!['video', 'overlay'].includes(clip.track)) {
      report('Transitions can only be placed on video and overlay clips.')
      return
    }
    const preset = allTransitionPresets.find((item) => item.id === kind)
    if (!preset) { report('That transition preset is unavailable.'); return }
    updateClip(clip.id, {
      transitionIn: { kind, effect: preset.effect, packId: preset.packId, duration: Math.min(transitionDuration, Math.max(0.1, clip.duration)), intensity: 100, speed: 1 },
    })
    setProject((previous) => ({ ...previous, recentEffectIds: [kind, ...(previous.recentEffectIds ?? []).filter((id) => id !== kind)].slice(0, 20) }))
  }

  const applyTransition = (kind: TransitionKind) => {
    if (!selectedClip || !['video', 'overlay'].includes(selectedClip.track)) {
      report('Select a video or overlay clip first. The transition is applied to its start.')
      return
    }
    applyTransitionToClip(selectedClip, kind)
  }

  const removeTransition = () => {
    if (selectedClip) updateClip(selectedClip.id, { transitionIn: undefined })
  }

  const removeFont = (font: ProjectFont) => {
    if (project.clips.some((clip) => clip.fontFamily === font.family)) {
      report('This font is used by a title. Choose another font before removing it.')
      return
    }
    document.fonts.forEach((face) => {
      if (face.family === font.family) document.fonts.delete(face)
    })
    setProject((previous) => ({ ...previous, fonts: previous.fonts.filter((item) => item.id !== font.id) }))
  }

  const deleteMedia = (assetId: string) => {
    const used = project.clips.some((clip) => clip.mediaId === assetId)
    if (used) { report('This media is used on the timeline. Remove its clips before removing the source.'); return }
    const asset = project.media.find((item) => item.id === assetId)
    if (asset?.url) URL.revokeObjectURL(asset.url)
    setProject((previous) => ({ ...previous, media: previous.media.filter((asset) => asset.id !== assetId) }))
  }

  const togglePlayback = () => {
    if (!duration) { report('Import a video or image and add it to the timeline to preview.'); return }
    if (!playing && playhead >= duration) setPlayhead(0)
    setPlaying((value) => !value)
  }

  const exportVideo = async () => {
    const canvas = document.createElement('canvas')
    const outputHeight = exportSize === '4K' ? 2160 : exportSize === '720p' ? 720 : exportSize === '480p' ? 480 : 1080
    const [ratioWidth, ratioHeight] = project.settings.aspectRatio.split(':').map(Number)
    canvas.height = ratioWidth < ratioHeight ? Math.round(outputHeight * ratioHeight / ratioWidth) : outputHeight
    canvas.width = Math.round(canvas.height * ratioWidth / ratioHeight)
    const context = canvas.getContext('2d')
    if (!context) { report('Canvas rendering is unavailable in this browser.'); return }
    if (!window.MediaRecorder || !canvas.captureStream) { report('This browser cannot record a rendered video. Try the latest Chrome or Edge.'); return }
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) { report('This browser has no supported WebM video encoder.'); return }
    if (!duration) { report('Add media to the timeline before exporting.'); return }
    setExporting(true)
    setExportProgress(0)
    setExportOpen(false)
    const cancelToken = { cancelled: false }
    exportCancelTokenRef.current = cancelToken
    setExportCancelRequested(false)
    let stream = canvas.captureStream(0)
    let canvasTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined
    if (typeof canvasTrack?.requestFrame !== 'function') {
      stream.getTracks().forEach((track) => track.stop())
      stream = canvas.captureStream(exportFps)
      canvasTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined
    }
    const chunks: BlobPart[] = []
    const videoBitrate = exportQuality === 'Draft' ? 2_500_000 : exportQuality === 'Standard' ? 5_000_000 : exportQuality === 'Maximum' ? 16_000_000 : 10_000_000

    const audioContext = new AudioContext()
    const audioDestination = audioContext.createMediaStreamDestination()
    const audioElements: HTMLAudioElement[] = []
    const videoGainNodes = new Map<string, GainNode>()
    const audioClips = project.clips.filter((clip) => clip.track === 'audio' && !clip.muted && !project.mutedTracks?.includes('audio') && clip.mediaId)
    for (const clip of audioClips) {
      const asset = project.media.find((item) => item.id === clip.mediaId)
      if (!asset?.url) continue
      const audio = new Audio(asset.url)
      audio.preload = 'auto'
      audio.volume = Math.max(0, Math.min(1, clip.volume))
      const source = audioContext.createMediaElementSource(audio)
      source.connect(audioDestination)
      audioElements.push(audio)
    }

    const visualClips = project.clips.filter((clip) => (clip.track === 'video' || clip.track === 'overlay')
      && !project.hiddenTracks?.includes(clip.track) && clip.mediaId)
    const videoElements = new Map<string, HTMLVideoElement>()
    const images = new Map<string, HTMLImageElement>()
    const stickerImages = new Map<string, HTMLImageElement>()
    try {
      for (const clip of visualClips) {
        const asset = project.media.find((item) => item.id === clip.mediaId)
        if (asset?.kind !== 'video' || !asset.url) continue
        const video = document.createElement('video')
        video.playsInline = true
        video.preload = 'auto'
        video.src = asset.url
        videoElements.set(clip.id, video)
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve()
          video.onerror = () => reject(new Error(`Could not decode "${asset.name}" for export. Try an MP4 (H.264) or WebM file.`))
        })
        const videoSource = audioContext.createMediaElementSource(video)
        const gainNode = audioContext.createGain()
        videoSource.connect(gainNode)
        gainNode.connect(audioDestination)
        videoGainNodes.set(clip.id, gainNode)
      }
      for (const clip of visualClips) {
        const asset = project.media.find((item) => item.id === clip.mediaId)
        if (asset?.kind === 'image' && asset.url) {
          const image = new Image()
          image.src = asset.url
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error(`Could not load "${asset.name}" for export.`))
          })
          images.set(asset.id, image)
        }
      }
      const stickerClips = project.clips.filter((clip) => clip.track === 'overlay' && clip.mediaId && !project.hiddenTracks?.includes('overlay'))
      for (const clip of stickerClips) {
        const mediaId = clip.mediaId!
        const sticker = project.stickers?.find((s) => s.id === mediaId)
        const asset = project.media.find((item) => item.id === mediaId)
        const url = (sticker?.url ?? asset?.url)!
        if (!url) continue
        if (stickerImages.has(mediaId)) continue
        const image = new Image()
        image.src = url
        await new Promise<void>((resolve) => {
          image.onload = () => resolve()
          image.onerror = () => resolve()
        })
        stickerImages.set(mediaId, image)
      }
    } catch (error) {
      audioElements.forEach((audio) => { audio.pause(); audio.src = '' })
      await audioContext.close()
      stream.getTracks().forEach((track) => track.stop())
      setExporting(false)
      report(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed while loading media.')
      return
    }

    if (audioElements.length || videoGainNodes.size > 0) stream.addTrack(audioDestination.stream.getAudioTracks()[0])

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: videoBitrate, audioBitsPerSecond: exportAudioBitrate })
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    const completed = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
      recorder.onerror = () => reject(new Error('The browser encoder stopped unexpectedly.'))
    })

    await Promise.allSettled(audioElements.map((audio) => new Promise<void>((resolve) => {
      if (audio.readyState >= 2) { resolve(); return }
      audio.oncanplay = () => resolve()
    })))
    const animatedLayoutFor = (clip: TimelineClip, time: number, canvasWidth: number, canvasHeight: number) => {
      const asset = project.media.find((item) => item.id === clip.mediaId)
      const sourceWidth = asset?.kind === 'video' ? videoElements.get(clip.id)?.videoWidth || canvasWidth : asset?.kind === 'image' ? images.get(asset.id)?.naturalWidth || canvasWidth : canvasWidth
      const sourceHeight = asset?.kind === 'video' ? videoElements.get(clip.id)?.videoHeight || canvasHeight : asset?.kind === 'image' ? images.get(asset.id)?.naturalHeight || canvasHeight : canvasHeight
      const animated = animatedClipSettings(clip, time)
      const base = visualClipLayout({ ...clip, positionX: animated.positionX, positionY: animated.positionY, scale: animated.scale, opacity: animated.opacity }, canvasWidth, canvasHeight, sourceWidth, sourceHeight)
      return base
    }
    const renderFrame = (time: number) => {
      context.fillStyle = '#000'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const transitions = activeTransitionPairs(project.clips, time)
      const heldClips = transitions.flatMap((pair) => pair.previous ? [pair.previous] : [])
      const ordered = [...new Map([...visualClips.filter((clip) => time >= clip.start && time < clipEnd(clip)), ...heldClips].map((clip) => [clip.id, clip])).values()]
        .sort((a, b) => Number(b.track === 'video') - Number(a.track === 'video') || a.start - b.start)
      for (const clip of ordered) {
        const asset = project.media.find((item) => item.id === clip.mediaId)
        if (!asset) continue
        const source = asset.kind === 'image' ? images.get(asset.id) : videoElements.get(clip.id)
        const heldFrame = time >= clipEnd(clip)
        const clipTime = heldFrame ? Math.max(0, clip.duration - 1 / 30) : Math.max(0, time - clip.start)
        const ramp = clip.speedRamp
        const targetTime = ramp?.enabled
          ? clip.inPoint + integrateSpeed(ramp, clipTime)
          : clip.inPoint + clipTime * clip.speed
        if (source instanceof HTMLVideoElement) {
          const effectiveSpeed = ramp?.enabled ? evaluateSpeedAt(ramp, clipTime) : clip.speed
          if (heldFrame) {
            source.pause()
            if (Math.abs(source.currentTime - targetTime) > 1 / 24) source.currentTime = targetTime
          } else {
            if (source.paused || Math.abs(source.currentTime - targetTime) > 0.65) source.currentTime = targetTime
            void source.play().catch(() => undefined)
          }
          source.playbackRate = Math.min(4, Math.max(0.25, effectiveSpeed))
          const gainNode = videoGainNodes.get(clip.id)
          if (gainNode) {
            const isMuted = clip.muted || project.mutedTracks?.includes('audio') || project.hiddenTracks?.includes(clip.track)
            const inside = time >= clip.start && time < clipEnd(clip)
            gainNode.gain.setValueAtTime((inside && !isMuted) ? (clip.volume ?? 1) : 0, audioContext.currentTime)
          }
        }
        const sourceReady = source instanceof HTMLImageElement
          ? source.complete && source.naturalWidth > 0
          : source instanceof HTMLVideoElement && source.readyState >= 2
        if (!source || !sourceReady) continue
        const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.videoWidth || canvas.width
        const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.videoHeight || canvas.height
        const layout = animatedLayoutFor(clip, time, canvas.width, canvas.height)
        const isMotionBlur = clip.transitionIn && ['whip', 'motion-blur', 'push-left', 'push-right', 'push-up', 'push-down'].includes(clip.transitionIn.effect ?? TRANSITION_PRESET_BY_ID.get(clip.transitionIn.kind)?.effect ?? '')
        context.save()
        context.filter = filterCss(project.settings, clip.filters)
        if (transitions.some((pair) => pair.incoming.id === clip.id)) applyCanvasTransition(context, clip, time, canvas.width, canvas.height)
        context.globalAlpha *= layout.opacity
        context.translate(layout.x, layout.y)
        context.scale(layout.width / sourceWidth, layout.height / sourceHeight)
        if (isMotionBlur) {
          const samples = motionBlurOffsets(clip, time, canvas.width, canvas.height)
          if (samples.length) {
            samples.forEach((sample) => {
              context.save()
              context.translate(sample.x * sourceWidth * 0.0015, sample.y * sourceHeight * 0.0015)
              context.globalAlpha = layout.opacity * sample.alpha
              context.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight)
              context.restore()
            })
          } else {
            context.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight)
          }
        } else {
          context.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight)
        }
        context.filter = 'none'
        context.save()
        context.translate(-canvas.width / 2, -canvas.height / 2)
        drawFilterOverlays(context, canvas.width, canvas.height, project.settings, clip.filters, time)
        context.restore()
        context.restore()
      }
      const stickerClipsAtTime = project.clips.filter((clip) => clip.track === 'overlay' && clip.mediaId
        && !project.hiddenTracks?.includes('overlay') && time >= clip.start && time < clipEnd(clip))
        .sort(visualClipOrder)
      for (const clip of stickerClipsAtTime) {
        const asset = project.media.find((item) => item.id === clip.mediaId)
        const image = stickerImages.get(clip.mediaId!) ?? (asset?.kind === 'image' ? images.get(asset.id) : null)!
        if (!image || !image.complete || image.naturalWidth === 0) continue
        const animated = animatedClipSettings(clip, playhead)
        const sourceWidth = image.naturalWidth
        const sourceHeight = image.naturalHeight
        const fitScale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight)
        const width = sourceWidth * fitScale * (animated.scale / 100)
        const height = sourceHeight * fitScale * (animated.scale / 100)
        const x = canvas.width / 2 + animated.positionX * canvas.width / 100
        const y = canvas.height / 2 + animated.positionY * canvas.height / 100
        const cropLeft = clip.cropLeft ?? 0
        const cropTop = clip.cropTop ?? 0
        const cropRight = clip.cropRight ?? 0
        const cropBottom = clip.cropBottom ?? 0
        context.save()
        context.translate(x, y)
        context.rotate((animated.rotation * Math.PI) / 180)
        context.globalAlpha = animated.opacity / 100
        if (cropLeft || cropTop || cropRight || cropBottom) {
          const sx = sourceWidth * Math.max(0, Math.min(100, cropLeft)) / 100
          const sy = sourceHeight * Math.max(0, Math.min(100, cropTop)) / 100
          const sw = Math.max(0, sourceWidth * (1 - Math.max(0, Math.min(100, cropLeft)) / 100 - Math.max(0, Math.min(100, cropRight)) / 100))
          const sh = Math.max(0, sourceHeight * (1 - Math.max(0, Math.min(100, cropTop)) / 100 - Math.max(0, Math.min(100, cropBottom)) / 100))
          context.drawImage(image, sx, sy, sw, sh, -width / 2, -height / 2, width, height)
        } else {
          context.drawImage(image, -width / 2, -height / 2, width, height)
        }
        context.restore()
      }
      transitions.forEach(({ incoming }) => drawTransitionOverlay(context, incoming, time, canvas.width, canvas.height))
      for (const clip of project.clips.filter((item) => item.track === 'text' && !project.hiddenTracks?.includes('text')
        && time >= item.start && time < clipEnd(item))) {
        context.fillStyle = clip.color ?? '#fff'
        context.font = `700 ${Math.round((clip.fontSize ?? 54) * canvas.width / project.width)}px "${clip.fontFamily ?? 'Inter'}", Arial, sans-serif`
        context.textAlign = 'center'
        context.shadowColor = '#000'
        context.shadowBlur = 8
        context.fillText(clip.text ?? '', canvas.width / 2, canvas.height * 0.82, canvas.width * 0.85)
        context.shadowBlur = 0
      }
    }
    await Promise.all(project.clips.filter((clip) => clip.track === 'text' && clip.fontFamily).map((clip) => document.fonts.load(`700 24px "${clip.fontFamily}"`)))
    await audioContext.resume()
    renderFrame(0)
    canvasTrack?.requestFrame?.()
    recorder.start(200)
    const startAt = performance.now()
    const frame = () => {
      if (exportCancelTokenRef.current.cancelled) {
        recorder.stop()
        return
      }
      const time = Math.min(duration, (performance.now() - startAt) / 1000)
      renderFrame(time)
      canvasTrack?.requestFrame?.()
      setExportProgress(Math.min(99, Math.floor(time / duration * 100)))
      audioClips.forEach((clip, index) => {
        const audio = audioElements[index]
        if (!audio) return
        const inside = time >= clip.start && time < clipEnd(clip)
        const isMuted = clip.muted || project.mutedTracks?.includes('audio') || project.hiddenTracks?.includes('audio')
        if (inside && !isMuted) {
          const target = clip.inPoint + (time - clip.start) * clip.speed
          if (audio.paused) { audio.currentTime = target; void audio.play().catch(() => undefined) }
          else if (Math.abs(audio.currentTime - target) > 0.8) audio.currentTime = target
          audio.volume = Math.max(0, Math.min(1, audioGainAt(clip, time)))
        } else audio.pause()
      })
      if (time < duration) window.setTimeout(frame, Math.max(4, 1000 / exportFps))
      else {
        audioElements.forEach((audio) => audio.pause())
        videoElements.forEach((video) => video.pause())
        window.setTimeout(() => recorder.stop(), Math.max(50, 1000 / exportFps))
      }
    }
    window.setTimeout(frame, 0)
    try {
      const blob = await completed
      if (cancelToken.cancelled) throw new Error('Export cancelled.')
      if (!blob.size) throw new Error('The browser produced an empty recording. Try exporting again in Chrome or Edge.')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const dur = Math.round(duration)
      link.download = `${(exportName.trim() || 'my-video').replace(/[^a-z0-9_-]/gi, '_')}_0-to-${dur}s_${stamp}.webm`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000)
      setExportProgress(100)
      report('Export complete. Your rendered WebM has been downloaded.')
    } catch (error) {
      report(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed unexpectedly.')
    } finally {
      audioElements.forEach((audio) => { audio.pause(); audio.src = '' })
      await audioContext.close()
      stream.getTracks().forEach((track) => track.stop())
      setExporting(false)
    }
  }

  const cancelExport = () => {
    exportCancelTokenRef.current.cancelled = true
    setExportCancelRequested(true)
  }

  const exportProjectFile = async () => {
    try {
      const media = await Promise.all(project.media.map(async (asset) => ({ ...asset, url: undefined, data: await imageAsDataUrl(asset.blob) })))
      const fonts = await Promise.all((project.fonts ?? []).map(async (font) => ({
        ...font, blob: undefined, data: await imageAsDataUrl(font.blob),
      })))
      const data = JSON.stringify({ ...project, media, fonts }, null, 2)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
      link.download = `${project.name.replace(/[^\w-]+/g, '-') || 'project'}.frameforge.json`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch { report('Project backup failed. The browser may not have enough memory for the media files.') }
  }

  const importProjectFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Omit<EditorProject, 'media' | 'fonts'> & {
        media: Array<MediaAsset & { data?: string }>
        fonts?: Array<Omit<ProjectFont, 'blob'> & { blob?: Blob; data?: string }>
      }
      if (!parsed.id || !Array.isArray(parsed.media) || !Array.isArray(parsed.clips)) throw new Error('Invalid project file.')
      const media = await Promise.all(parsed.media.map(async (asset) => {
        if (!asset.data) throw new Error(`Missing embedded media: ${asset.name}`)
        const response = await fetch(asset.data)
        const blob = await response.blob()
        return { ...asset, blob, url: URL.createObjectURL(blob) }
      }))
      const fonts = await Promise.all((parsed.fonts ?? []).map(async (font) => {
        if (font.blob instanceof Blob) return font as ProjectFont
        if (!font.data) throw new Error(`Missing embedded font: ${font.name}`)
        const response = await fetch(font.data)
        const blob = await response.blob()
        return { ...font, blob }
      }))
      const restored: EditorProject = {
        ...parsed,
        media,
        fonts,
        clips: parsed.clips.map(normalizeOverlayClip),
        settings: { ...parsed.settings, filterPreset: parsed.settings.filterPreset ?? 'none', filterIntensity: parsed.settings.filterIntensity ?? 100 },
        updatedAt: Date.now(),
      }
      fonts.forEach((font) => void registerFont(font).catch(() => report(`Could not load font: ${font.name}`)))
      setProject(restored)
      setScreen('editor')
      report('Project backup imported with its media.')
    } catch (error) { report(error instanceof Error ? error.message : 'Could not import that project file.') }
  }

  const startPanelResize = (event: React.PointerEvent, panel: 'left' | 'right') => {
    const startX = event.clientX
    const initial = panel === 'left' ? panelWidth : propertiesWidth
    const resize = (move: PointerEvent) => {
      const delta = move.clientX - startX
      if (panel === 'left') setPanelWidth(Math.max(220, Math.min(420, initial + delta)))
      else setPropertiesWidth(Math.max(240, Math.min(420, initial - delta)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop, { once: true })
  }

  const displayedTextClip = project.clips.find((clip) => clip.track === 'text'
    && !project.hiddenTracks?.includes('text') && playhead >= clip.start && playhead < clipEnd(clip))
  const previewTransition = previewTransitionPairs[0]?.incoming
  const selectedAsset = project.media.find((asset) => asset.id === selectedId) ?? null

  shortcutsRef.current = {
    undo, redo, save: () => void persist(project), togglePlayback,
    remove: removeSelected, split: splitSelected, copy: copySelectedClips, cut: cutSelectedClips, paste: () => pasteClips(),
    addMarker: addTimelineMarker, previousMarker: () => jumpToMarker(-1), nextMarker: () => jumpToMarker(1),
    rippleDelete: rippleDeleteSelected, toggleLoop: () => setLoopPlayback((value) => !value),
    toggleShortcuts: () => setShortcutsOpen((value) => !value),
  }

  if (screen === 'home') return (
    <main className="home-screen">
      <header className="home-header">
        <Brand />
        <button className="button subtle" onClick={() => projectInput.current?.click()}><FolderOpen size={16} /> Import project</button>
      </header>
      <section className="home-content">
        <div className="home-welcome"><div><span className="eyebrow">YOUR CREATIVE SPACE</span><h1>Make something<br /><span>remarkable.</span></h1><p>Bring your footage to life, one frame at a time.</p></div>
          <button className="button primary new-project" onClick={createNewProject}><Plus size={18} /> Create new project</button>
        </div>
        <div className="recent-head"><div><h2>Recent projects</h2><p>Your work, right where you left it.</p></div><div className="recent-actions"><label className="project-search"><span>⌕</span><input aria-label="Search projects" placeholder="Search projects…" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} /></label><button className="button subtle" onClick={exportProjectFile}><Download size={15} /> Back up current</button></div></div>
        {matchingProjects.length ? <div className="project-grid">{matchingProjects.map((item) => <article className="project-card" key={item.id}>
          <button className="project-thumb" onClick={() => openProject(item)}><Film size={34} /><span>{item.clips.length ? `${item.clips.length} clips` : 'No media yet'}</span></button>
          <div className="project-info"><button className="project-title" onClick={() => openProject(item)}>{item.name}</button><span>{new Date(item.updatedAt).toLocaleDateString()} · {item.width} × {item.height}</span></div>
          <button className="icon-button duplicate-project" title="Duplicate project" onClick={() => void duplicateProject(item)}><Copy size={14} /></button>
          <button className="icon-button delete-project" title="Delete project" onClick={() => setProjectToDelete(item)}><Trash2 size={15} /></button>
        </article>)}</div> : <div className="empty-projects"><div className="empty-icon"><Clapperboard size={27} /></div><b>{projects.length ? 'No matching projects' : 'Your next edit starts here'}</b><span>{projects.length ? 'Try another project name.' : 'Create a project to import footage, build a timeline, and export a finished video.'}</span></div>}
      </section>
      {projectToDelete && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectToDelete(null) }}>
        <section className="delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description" onKeyDown={(event) => { if (event.key === 'Escape') setProjectToDelete(null) }}>
          <div className="delete-confirm-icon"><Trash2 size={18} /></div>
          <h2 id="delete-confirm-title">Are you sure?</h2>
          <p id="delete-confirm-description">Delete “{projectToDelete.name}”? This removes the local project and its stored media.</p>
          <div className="delete-confirm-actions">
            <button className="button subtle" autoFocus onClick={() => setProjectToDelete(null)}>Cancel</button>
            <button className="button delete-confirm-action" onClick={() => void confirmDeleteProject()}><Trash2 size={14} />Delete project</button>
          </div>
        </section>
      </div>}
      <input ref={projectInput} type="file" accept=".json,.frameforge.json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProjectFile(file); event.target.value = '' }} />
    </main>
  )

  return (
    <div className="editor-app" onPointerDown={(event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest('.timeline-context-menu')) setTimelineContextMenu(null)
    }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault()
      const files = event.dataTransfer.files
      if (files.length) void addFiles(files)
    }}>
      <header className="topbar">
        <button className="brand-button" onClick={() => setScreen('home')} title="Back to projects"><Brand compact /></button>
        <span className="top-separator" />
        <input className="project-name" value={project.name} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" />
        <div className="top-actions">
          <span className={`save-indicator ${saveState}`}><span />{saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Save error' : 'Saved locally'}</span>
          <span className="top-separator" />
          <button className="icon-button" title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.length}><Undo2 size={17} /></button>
          <button className="icon-button" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length}><Redo2 size={17} /></button>
          <button className="icon-button settings-trigger" title="Project settings" onClick={() => report('Project settings can be changed in the inspector below.')}><Settings2 size={17} /></button>
          <button className="button export-button" onClick={() => setExportOpen(true)} disabled={exporting}><Download size={15} /> Export</button>
        </div>
      </header>

      <div className="workspace" style={{ gridTemplateColumns: `${panelWidth}px 5px minmax(0,1fr) 5px ${propertiesWidth}px` }}>
        <aside className="media-panel">
          <div className="panel-tabs">{tabs.map(({ name, icon: Icon }) => <button key={name} className={`panel-tab ${activeTab === name ? 'active' : ''}`} onClick={() => setActiveTab(name)}><Icon size={17} /><span>{name}</span></button>)}</div>
          <div className="asset-header"><div><h2>{activeTab === 'Enhance' ? 'Enhance quality' : `${activeTab} library`}</h2><span>{activeTab === 'Enhance' ? 'Non-destructive adjustments' : `${project.media.length} assets in this project`}</span></div>
            {activeTab === 'Media' || activeTab === 'Audio' ? <button className="small-icon-button" title="Import media" onClick={() => fileInput.current?.click()}><Plus size={16} /></button> : null}</div>
          {activeTab === 'Media' || activeTab === 'Audio' ? <>
            <label className="search-box"><span>⌕</span><input placeholder="Search media..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="import-box" onClick={() => fileInput.current?.click()}><div className="import-icon"><Upload size={17} /></div><div><b>{importing ? 'Importing media…' : 'Import media'}</b><span>Video, audio, SVG, SRT, fonts · up to 1 GB</span></div><FilePlus2 size={16} /></button>
            <div className="asset-grid">{visibleAssets.map((asset) => <div className={`asset-card ${selectedId === asset.id ? 'selected' : ''}`} key={asset.id} draggable onDragStart={(event) => { event.dataTransfer.setData('assetId', asset.id); setDragAsset(asset.id) }} onDragEnd={() => setDragAsset(null)} onClick={() => { setSelectedId(asset.id); setMultiSelectedClipIds([]) }} onDoubleClick={() => addAssetToTimeline(asset)}>
              <div className="asset-thumb">{asset.kind === 'video' ? <video src={asset.url} muted preload="metadata" /> : asset.kind === 'image' ? <img src={asset.url} /> : <div className="audio-thumb"><AudioLines size={25} /></div>}
                {asset.kind === 'video' ? <FileVideo2 className="asset-kind" size={13} /> : asset.kind === 'audio' ? <FileAudio2 className="asset-kind" size={13} /> : <FileImage className="asset-kind" size={13} />}
                <button className="asset-add" title="Add to timeline" onClick={(event) => { event.stopPropagation(); addAssetToTimeline(asset) }}><Plus size={15} /></button>
                {(asset.kind === 'video' || asset.kind === 'image') && <button className="asset-add asset-overlay-add" title="Add as picture-in-picture overlay at the playhead" aria-label="Add as picture-in-picture overlay" onClick={(event) => { event.stopPropagation(); addAssetToTimeline(asset, 'overlay') }}><Layers2 size={13} /></button>}
              </div><div className="asset-name" title={asset.name}>{asset.name}</div><span className="asset-meta">{asset.kind === 'image' ? `${asset.width} × ${asset.height}` : asset.kind === 'audio' ? formatTime(asset.duration) : `${formatTime(asset.duration)} · ${asset.width}×${asset.height}`}</span>
              <button className="asset-remove" title="Remove media" onClick={(event) => { event.stopPropagation(); deleteMedia(asset.id) }}><X size={12} /></button>
            </div>)}</div>
            {activeTab === 'Media' && <p className="overlay-help">Use the layered button on a video to add it as a picture-in-picture overlay above your main video.</p>}
            {!visibleAssets.length && <div className="empty-assets"><ImagePlus size={23} /><span>{search ? 'No matching media' : 'Your media will appear here'}</span></div>}
          </> : activeTab === 'Text' ? <div className="library-content"><p className="library-copy">Build a title layer and customize it directly in the properties panel.</p><button className="library-tile" onClick={addText}><Type size={21} /><span><b>Add a title</b><small>Place a text overlay at the playhead</small></span><Plus size={15} /></button><button className="library-tile preset-tile" onClick={() => fileInput.current?.click()}><Upload size={19} /><span><b>Import SRT or font</b><small>{project.clips.filter((clip) => clip.track === 'text').length} subtitle/title layers · {project.fonts?.length ?? 0} custom fonts</small></span><Plus size={15} /></button>
              {(project.fonts ?? []).map((font) => <div className="font-row" key={font.id}><FileType2 size={15} /><span>{font.name}</span><button className="small-icon-button" title={`Remove ${font.name}`} onClick={() => removeFont(font)}><X size={13} /></button></div>)}
              <div className="feature-note">SRT captions, SVG artwork, and licensed local font files can be imported. Captions are placed at their SRT timestamps.</div></div>
            : activeTab === 'Filters' ? <div className="library-content">
              <p className="library-copy">40+ editable looks. Select a video clip to apply a filter there, Ctrl/Cmd-click clips to apply to several, or select none to affect the whole project.</p>
              <div className="effect-library-actions"><button className="button subtle" onClick={() => effectPackInput.current?.click()}><Upload size={13} /> Import pack</button><button className="button subtle" onClick={copyFilterStack}><Copy size={13} /> Copy</button><button className="button subtle" disabled={!copiedFilters} onClick={pasteFilterStack}><FilePlus2 size={13} /> Paste</button><button className="button subtle" onClick={saveCustomFilterPreset}><Plus size={13} /> Save preset</button></div>
              <label className="search-box effect-search"><span>⌕</span><input aria-label="Search effects" placeholder="Search filters..." value={effectSearch} onChange={(event) => setEffectSearch(event.target.value)} /></label>
              <div className="effect-category-row"><button className={`category-chip ${filterCategory === 'All' ? 'active' : ''}`} onClick={() => setFilterCategory('All')}>All</button><button className={`category-chip ${filterCategory === 'Favorites' ? 'active' : ''}`} onClick={() => setFilterCategory('Favorites')}>★</button><button className={`category-chip ${filterCategory === 'Recent' ? 'active' : ''}`} onClick={() => setFilterCategory('Recent')}>Recent</button>
                <select aria-label="Filter category" value={filterCategory === 'All' || filterCategory === 'Favorites' || filterCategory === 'Recent' ? 'All' : filterCategory} onChange={(event) => setFilterCategory(event.target.value as FilterCategory | 'All')}><option value="All">All categories</option>{FILTER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
              </div>
              <div className="filter-grid">{filteredPresets.filter((preset) => filterCategory === 'Favorites' ? (project.favoriteEffectIds ?? []).includes(preset.id) : filterCategory === 'Recent' ? (project.recentEffectIds ?? []).includes(preset.id) : true).map((preset) => <div className="filter-card-wrap" key={preset.id}>
                <button type="button" className={`filter-card ${targetFilterStack.some((item) => item.presetId === preset.id) ? 'selected' : ''}`} title={preset.description} onClick={() => applyFilterPreset(preset)}>
                  <span className="filter-cover" style={{ filter: filterCss({ ...project.settings, brightness: 100, contrast: 100, saturation: 100, blur: 0, filterPreset: preset.id, filterIntensity: 100, filterStack: [{ id: preset.id, presetId: preset.id, enabled: true, intensity: 100, parameters: preset.parameters, packId: preset.packId }] }) }}>
                    <EffectCover id={preset.id} category={preset.category} />
                    <span className="filter-cover-overlay" style={filterOverlayStyle({ ...project.settings, filterStack: [{ id: preset.id, presetId: preset.id, enabled: true, intensity: 100, parameters: preset.parameters, packId: preset.packId }] })} />
                  </span>
                  <span><b>{preset.name}</b><small>{preset.description}</small></span>
                </button>
                <button className={`effect-favorite ${(project.favoriteEffectIds ?? []).includes(preset.id) ? 'active' : ''}`} title="Toggle favorite" onClick={() => toggleFavorite(preset.id)}>★</button>
              </div>)}</div>
              {!filteredPresets.length && <div className="empty-assets">No matching filters.</div>}
              {targetFilterStack.length > 0 && <section className="active-effects"><div className="section-title"><span>{filterTargetClip ? 'CLIP FILTER STACK' : 'PROJECT FILTER STACK'}</span></div>
                {targetFilterStack.map((item, index) => <div className={`active-effect-row ${item.enabled ? '' : 'disabled'}`} key={item.id}>
                  <button className="effect-enable" title={item.enabled ? 'Disable filter' : 'Enable filter'} onClick={() => updateAppliedFilter(item.id, { enabled: !item.enabled })}>{item.enabled ? '●' : '○'}</button>
                  <button className="effect-name" onClick={() => setSelectedFilterId(item.id)}>{allFilterPresets.find((preset) => preset.id === item.presetId)?.name ?? item.presetId}</button>
                  <button className="small-icon-button" disabled={index === 0} title="Move up" onClick={() => moveAppliedFilter(item.id, -1)}><ChevronUp size={13} /></button>
                  <button className="small-icon-button" disabled={index === targetFilterStack.length - 1} title="Move down" onClick={() => moveAppliedFilter(item.id, 1)}><ChevronDown size={13} /></button>
                  <button className="small-icon-button" title="Remove filter" onClick={() => removeAppliedFilter(item.id)}><X size={13} /></button>
                </div>)}
              </section>}
              {selectedAppliedFilter && <section className="active-effects filter-adjustments"><div className="section-title"><span>FILTER SETTINGS</span></div>
                <SettingSlider label="Intensity" value={selectedAppliedFilter.intensity} min={0} max={100} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { intensity: value })} />
                <SettingSlider label="Brightness" value={selectedAppliedFilter.parameters.brightness} min={0} max={200} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, brightness: value } })} />
                <SettingSlider label="Contrast" value={selectedAppliedFilter.parameters.contrast} min={0} max={200} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, contrast: value } })} />
                <SettingSlider label="Saturation" value={selectedAppliedFilter.parameters.saturation} min={0} max={200} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, saturation: value } })} />
                <SettingSlider label="Exposure" value={selectedAppliedFilter.parameters.exposure} min={-2} max={2} step={0.1} unit=" EV" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, exposure: value } })} />
                <SettingSlider label="Temperature" value={selectedAppliedFilter.parameters.temperature} min={-100} max={100} unit="" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, temperature: value } })} />
                <SettingSlider label="Tint" value={selectedAppliedFilter.parameters.tint} min={-100} max={100} unit="" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, tint: value } })} />
                <SettingSlider label="Highlights" value={selectedAppliedFilter.parameters.highlights} min={-100} max={100} unit="" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, highlights: value } })} />
                <SettingSlider label="Shadows" value={selectedAppliedFilter.parameters.shadows} min={-100} max={100} unit="" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, shadows: value } })} />
                <SettingSlider label="Fade" value={selectedAppliedFilter.parameters.fade} min={0} max={100} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, fade: value } })} />
                <SettingSlider label="Vignette" value={selectedAppliedFilter.parameters.vignette} min={0} max={100} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, vignette: value } })} />
                <SettingSlider label="Grain" value={selectedAppliedFilter.parameters.grain} min={0} max={100} unit="%" onChange={(value) => updateAppliedFilter(selectedAppliedFilter.id, { parameters: { ...selectedAppliedFilter.parameters, grain: value } })} />
              </section>}
              {missingPackIds.size > 0 && <div className="feature-note missing-effects"><X size={14} /><span>Missing effect pack{missingPackIds.size === 1 ? '' : 's'}: {[...missingPackIds].join(', ')}. Referenced effects were preserved in this project.</span></div>}
              <div className="effect-pack-list"><div className="section-title"><span>INSTALLED PACKS · {project.effectPacks?.length ?? 0}</span><button className="small-icon-button" title="Import effect pack" onClick={() => effectPackInput.current?.click()}><Plus size={14} /></button></div>
                {(project.effectPacks ?? []).map((pack) => <div className="font-row" key={pack.id}><Layers2 size={14} /><span title={`${pack.author} · ${pack.license}`}>{pack.name}</span><button className="small-icon-button" title={`Uninstall ${pack.name}`} onClick={() => uninstallEffectPack(pack)}><X size={13} /></button></div>)}
              </div>
              <div className="feature-note">Effect packs are data-only JSON; imported files cannot run scripts. Import and use external assets under their original license terms.</div>
              <div className="external-effects"><a href="https://mixkit.co/" target="_blank" rel="noreferrer">Mixkit</a><a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a><a href="https://www.productioncrate.com/" target="_blank" rel="noreferrer">ProductionCrate</a><a href="https://github.com/search?q=free+LUT+cube+files&type=repositories" target="_blank" rel="noreferrer">GitHub LUT search</a></div>
            </div>
            : activeTab === 'Stickers' ? <div className="library-content">
              <p className="library-copy">Drag stickers onto the preview or timeline. Built-in stickers are SVG-based and scale without quality loss.</p>
              <div className="effect-library-actions"><button className="button subtle" onClick={() => fileInput.current?.click()}><Upload size={13} /> Upload sticker</button><span className="sticker-upload-hint">PNG · JPG · WebP · GIF</span></div>
              <div className="sticker-category-row">{STICKER_CATEGORIES.map((cat) => <button key={cat.id} className={`sticker-category-chip ${stickerCategoryFilter === cat.id ? 'active' : ''}`} onClick={() => setStickerCategoryFilter(cat.id)}>{cat.icon}</button>)}</div>
              <div className="sticker-grid">{stickersForCategory.map((sticker) => <div className="sticker-card-wrap" key={sticker.id}>
                <button className={`sticker-card ${selectedStickerId === sticker.id ? 'selected' : ''}`} onClick={() => { setSelectedStickerId(sticker.id); addStickerToTimeline(sticker) }} title={sticker.name} draggable onDragStart={(event) => { event.dataTransfer.setData('stickerId', sticker.id); event.dataTransfer.effectAllowed = 'copy' }}>
                  <span className="sticker-image" style={{ backgroundImage: `url(${sticker.url})`, width: sticker.width, height: sticker.height }} />
                  <b>{sticker.name}</b>
                </button>
              </div>)}</div>
              {!stickersForCategory.length && <div className="empty-assets">No stickers in this category.</div>}
              <div className="feature-note">Uploaded images automatically appear in "My Stickers". Drag any sticker from the library onto the preview to place it at the playhead.</div>
            </div>
            : activeTab === 'Enhance' ? <div className="library-content"><p className="library-copy">Adjust the preview and rendered output. Changes are non-destructive.</p>
              <SettingSlider label="Brightness" value={project.settings.brightness} min={50} max={150} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, brightness: v } }))} />
              <SettingSlider label="Contrast" value={project.settings.contrast} min={50} max={150} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, contrast: v } }))} />
              <SettingSlider label="Saturation" value={project.settings.saturation} min={0} max={200} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, saturation: v } }))} />
              <SettingSlider label="Sharpen / blur" value={project.settings.blur} min={0} max={8} unit=" px" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, blur: v } }))} />
              <div className="feature-note"><Sparkles size={15} /> Upscaling changes output dimensions only. AI super-resolution and frame interpolation are not configured.</div>
              <button className="library-tile preset-tile" onClick={() => { setProject((p) => ({ ...p, settings: { ...p.settings, brightness: 106, contrast: 112, saturation: 112 } })); report('Cinematic color adjustment applied.') }}><Sparkles size={18} /><span><b>Cinematic lift</b><small>Gentle contrast and saturation</small></span><Plus size={15} /></button>
            </div>
            : activeTab === 'Transitions' ? <div className="library-content"><p className="library-copy">Choose a transition for the selected video/overlay clip, or drag a preset onto a cut. Preview and WebM export use the same transition model.</p>
              <div className="effect-library-actions"><button className="button subtle" onClick={() => effectPackInput.current?.click()}><Upload size={13} /> Import pack</button><label className="transition-search"><input aria-label="Search transitions" placeholder="Search transitions..." value={effectSearch} onChange={(event) => setEffectSearch(event.target.value)} /></label></div>
              <div className="effect-category-row"><button className={`category-chip ${transitionCategory === 'All' ? 'active' : ''}`} onClick={() => setTransitionCategory('All')}>All</button><button className={`category-chip ${transitionCategory === 'Favorites' ? 'active' : ''}`} onClick={() => setTransitionCategory('Favorites')}>★</button><button className={`category-chip ${transitionCategory === 'Recent' ? 'active' : ''}`} onClick={() => setTransitionCategory('Recent')}>Recent</button><select aria-label="Transition category" value={transitionCategory === 'All' || transitionCategory === 'Favorites' || transitionCategory === 'Recent' ? 'All' : transitionCategory} onChange={(event) => setTransitionCategory(event.target.value)}><option value="All">All categories</option>{TRANSITION_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
              <div className="transition-grid">{filteredTransitions.filter((preset) => transitionCategory === 'Favorites' ? (project.favoriteEffectIds ?? []).includes(preset.id) : transitionCategory === 'Recent' ? (project.recentEffectIds ?? []).includes(preset.id) : true).map((transition) => <div className="transition-card-wrap" key={transition.id}>
                <button draggable className={`transition-card ${selectedClip?.transitionIn?.kind === transition.id ? 'selected' : ''}`} onDragStart={(event) => { event.dataTransfer.setData('transitionId', transition.id); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => applyTransition(transition.id)} title="Click to apply, or drag onto a timeline cut">
                  <span className={`transition-cover effect-${transition.effect}`}><EffectCover id={`${transition.id}-out`} category={transition.category} /><EffectCover id={`${transition.id}-in`} category={transition.category} /><i /></span>
                  <b>{transition.name}</b><small>{transition.description}</small>
                </button>
                <button className={`transition-fav ${(project.favoriteEffectIds ?? []).includes(transition.id) ? 'active' : ''}`} aria-label={`Favorite ${transition.name}`} onClick={() => toggleFavorite(transition.id)}>★</button>
              </div>)}</div>
              <SettingSlider label="Transition duration" value={Math.round((selectedClip?.transitionIn?.duration ?? transitionDuration) * 10) / 10} min={0.1} max={Math.max(0.2, Math.min(2, selectedClip?.duration ?? 2))} unit=" s" step={0.1} onChange={(v) => { setTransitionDuration(v); if (selectedClip?.transitionIn) updateClip(selectedClip.id, { transitionIn: { ...selectedClip.transitionIn, duration: v } }, false) }} />
              {selectedClip?.transitionIn && <><SettingSlider label="Intensity" value={selectedClip.transitionIn.intensity ?? 100} min={0} max={100} unit="%" onChange={(v) => updateClip(selectedClip.id, { transitionIn: { ...selectedClip.transitionIn!, intensity: v } }, false)} />
                <SettingSlider label="Transition speed" value={Math.round((selectedClip.transitionIn.speed ?? 1) * 100)} min={25} max={200} unit="%" onChange={(v) => updateClip(selectedClip.id, { transitionIn: { ...selectedClip.transitionIn!, speed: v / 100 } }, false)} />
                <label className="field-label">Direction<select value={selectedClip.transitionIn.direction ?? 'left'} onChange={(event) => updateClip(selectedClip.id, { transitionIn: { ...selectedClip.transitionIn!, direction: event.target.value as 'left' | 'right' | 'up' | 'down' } }, false)}><option value="left">Left</option><option value="right">Right</option><option value="up">Up</option><option value="down">Down</option></select></label>
                <button className="button subtle transition-remove" onClick={removeTransition}><X size={14} /> Remove transition</button></>}
              <div className="feature-note">Transitions are non-destructive clip entrance effects. Timeline audio remains continuous; source-video audio is not extracted.</div>
            </div>
            : activeTab === 'Effects' ? <div className="library-content effect-store">
              <p className="library-copy">Browse original built-in packs and install user-authored JSON packs. No third-party assets are bundled or downloaded automatically.</p>
              <div className="store-pack-card"><span className="store-pack-icon"><Sparkles size={20} /></span><div><b>Frameforge Color Studio</b><small>{FILTER_PRESETS.length - 1} original filters · 19 categories</small></div><button className="button subtle" onClick={() => setActiveTab('Filters')}>Browse</button></div>
              <div className="store-pack-card"><span className="store-pack-icon transition"><Layers2 size={20} /></span><div><b>Motion & Transitions</b><small>{TRANSITION_PRESETS.length} original transitions · 14 categories</small></div><button className="button subtle" onClick={() => setActiveTab('Transitions')}>Browse</button></div>
              <button className="library-tile preset-tile" onClick={() => effectPackInput.current?.click()}><Upload size={19} /><span><b>Install an effect pack</b><small>Validate and add a data-only .json pack to this project</small></span><Plus size={15} /></button>
              {(project.effectPacks ?? []).map((pack) => <div className="store-installed" key={pack.id}><span><b>{pack.name}</b><small>{pack.author} · {pack.license} · v{pack.version}</small></span><button className="small-icon-button" title={`Uninstall ${pack.name}`} onClick={() => uninstallEffectPack(pack)}><X size={13} /></button></div>)}
              <div className="section-title store-section-title"><span>EXTERNAL SOURCES · REVIEW TERMS BEFORE USE</span></div>
              <div className="external-effects"><a href="https://mixkit.co/" target="_blank" rel="noreferrer">Mixkit</a><a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a><a href="https://www.productioncrate.com/" target="_blank" rel="noreferrer">ProductionCrate</a><a href="https://github.com/search?q=free+LUT+cube+files&type=repositories" target="_blank" rel="noreferrer">Open-source LUT search</a></div>
              <div className="feature-note"><Activity size={14} /> No catalog API is configured. External source links are informational; imports are user-initiated and no pack is claimed to be downloaded.</div>
            </div>
            : <div className="library-content"><p className="library-copy">Drop tracks into the timeline, then make adjustments in the inspector.</p></div>}
        </aside>
        <div className="resize-handle" onPointerDown={(event) => startPanelResize(event, 'left')} />

        <main className="center-panel">
          <div className="preview-topline"><div className="breadcrumb"><span>Project</span><ChevronDown size={13} /><b>{project.name || 'Untitled project'}</b></div><div className="preview-resolution"><span className="live-dot" /> Preview <span className="resolution-pill">{project.width} × {project.height}</span></div></div>
          <div className="preview-stage">
            <div className={`preview-frame aspect-${project.settings.aspectRatio.replace(':', '-')}`}>
              {previewVisualClips.map((clip) => {
                const asset = project.media.find((item) => item.id === clip.mediaId)
                if (!asset?.url) return null
                const transitionStyleForClip = transitionStyle(clip, playhead)
                const transitionFilter = 'filter' in transitionStyleForClip && typeof transitionStyleForClip.filter === 'string' ? transitionStyleForClip.filter : ''
                const transitionVisualStyle = { ...transitionStyleForClip }
                delete transitionVisualStyle.filter
                const filter = compareOriginal ? `${transitionFilter}` : `${filterCss(project.settings, clip.filters)} ${transitionFilter}`
                const clipOverlay = compareOriginal ? {} : filterOverlayStyle(project.settings, clip.filters)
                const animated = animatedClipSettings(clip, playhead)
                const isSelectedOverlay = selectedStickerClip === clip.id
                const cropInset = `inset(${clip.cropTop ?? 0}% ${clip.cropRight ?? 0}% ${clip.cropBottom ?? 0}% ${clip.cropLeft ?? 0}%)`
                const layerStyle: React.CSSProperties = {
                  left: `${50 + animated.positionX}%`,
                  top: `${50 + animated.positionY}%`,
                  transform: `translate(-50%, -50%) scale(${Math.max(0.01, animated.scale) / 100}) rotate(${animated.rotation ?? 0}deg)`,
                  opacity: Math.max(0, Math.min(1, animated.opacity / 100)),
                  zIndex: clip.track === 'overlay' ? overlayLayers.indexOf(clip.overlayLayer ?? 1) + 2 : 1,
                }
                return asset.kind === 'image'
                  ? <div className={`preview-layer ${clip.track} ${isSelectedOverlay ? 'sticker-selected' : ''}`} key={clip.id} style={layerStyle}
                    onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'move')}
                    onPointerMove={(event) => moveStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>)}
                    onPointerUp={finishStickerTransform}
                    ><img src={asset.url} className="preview-image" style={{ ...transitionVisualStyle, filter, clipPath: cropInset }} /><div className="preview-filter-overlay" style={{ ...clipOverlay, ...transitionStyleForClip }} /></div>
                  : asset.kind === 'video'
                    ? <div className={`preview-layer ${clip.track} ${isSelectedOverlay ? 'sticker-selected' : ''}`} key={clip.id} style={layerStyle}
                      onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'move')}
                      onPointerMove={(event) => moveStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>)}
                      onPointerUp={finishStickerTransform}
                      ><video ref={(element) => {
                      if (element) visualVideoRefs.current.set(clip.id, element)
                      else visualVideoRefs.current.delete(clip.id)
                    }} className="preview-video" style={{ ...transitionVisualStyle, filter, clipPath: cropInset }} playsInline /><div className="preview-filter-overlay" style={{ ...clipOverlay, ...transitionStyleForClip }} /></div>
                    : null
              })}
              {previewTransition && <div className="preview-transition-overlay" style={transitionOverlayStyle(previewTransition, playhead)} />}
              {!activeVisualClips.length && !project.clips.some((clip) => (clip.track === 'video' || clip.track === 'overlay') && playhead >= clip.start && playhead < clipEnd(clip)) && <div className="preview-empty"><div className="preview-mark"><Clapperboard size={29} /></div><b>Your canvas is ready</b><span>Import media, then add it to the timeline</span><button className="button primary" onClick={() => fileInput.current?.click()}><Upload size={15} /> Import media</button></div>}
              {displayedTextClip && <div className="preview-text" style={{ color: displayedTextClip.color, fontSize: `clamp(18px, ${displayedTextClip.fontSize ?? 54}px, 10vw)`, fontFamily: displayedTextClip.fontFamily ? `"${displayedTextClip.fontFamily}", sans-serif` : undefined }}>{displayedTextClip.text}</div>}
              {activeStickerClips.map((clip) => {
                const sticker = project.stickers?.find((s) => s.id === clip.mediaId) ?? project.media.find((item) => item.id === clip.mediaId)
                if (!sticker?.url) return null
                const animated = animatedClipSettings(clip, playhead)
                const isSelected = selectedStickerClip === clip.id
                const cropInset = `inset(${clip.cropTop ?? 0}% ${clip.cropRight ?? 0}% ${clip.cropBottom ?? 0}% ${clip.cropLeft ?? 0}%)`
                const layerStyle: React.CSSProperties = {
                  left: `${50 + animated.positionX}%`,
                  top: `${50 + animated.positionY}%`,
                  transform: `translate(-50%, -50%) scale(${Math.max(0.01, animated.scale) / 100}) rotate(${animated.rotation}deg)`,
                  opacity: Math.max(0, Math.min(1, animated.opacity / 100)),
                  zIndex: overlayLayers.indexOf(clip.overlayLayer ?? 1) + 10,
                }
                return (
                  <div className={`preview-sticker-layer ${isSelected ? 'sticker-selected' : ''}`} key={clip.id} style={layerStyle}
                    onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'move')}
                    onPointerMove={(event) => moveStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>)}
                    onPointerUp={finishStickerTransform}
                  >
                    <img src={sticker.url} className="preview-sticker-image" alt={sticker.name} style={{ clipPath: cropInset }} />
                    {isSelected && (
                      <div className="sticker-bounding-box">
                        <div className="sticker-handle sticker-handle-tl" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'resize', 'tl')} />
                        <div className="sticker-handle sticker-handle-tr" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'resize', 'tr')} />
                        <div className="sticker-handle sticker-handle-bl" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'resize', 'bl')} />
                        <div className="sticker-handle sticker-handle-br" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'resize', 'br')} />
                        <div className="sticker-crop-handle sticker-crop-top" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'crop', null, 'top')} />
                        <div className="sticker-crop-handle sticker-crop-right" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'crop', null, 'right')} />
                        <div className="sticker-crop-handle sticker-crop-bottom" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'crop', null, 'bottom')} />
                        <div className="sticker-crop-handle sticker-crop-left" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'crop', null, 'left')} />
                        <div className="sticker-rotate-handle" onPointerDown={(event) => startStickerTransform(event as unknown as ReactPointerEvent<HTMLDivElement>, clip.id, 'rotate')} />
                        <button className="sticker-delete" title="Delete sticker" onClick={(event) => { event.stopPropagation(); deleteSticker(clip.id) }}><X size={12} /></button>
                        <button className="sticker-duplicate" title="Duplicate sticker" onClick={(event) => { event.stopPropagation(); duplicateSticker(clip.id) }}><Copy size={12} /></button>
                        <button className="sticker-forward" title="Bring forward" onClick={(event) => { event.stopPropagation(); bringStickerForward(clip.id) }}><Maximize size={11} /></button>
                        <button className="sticker-backward" title="Send backward" onClick={(event) => { event.stopPropagation(); sendStickerBackward(clip.id) }}><Minimize size={11} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="preview-controls">
            <div className="playback-group"><button className="icon-button" title="Previous frame" onClick={() => setPlayhead((v) => Math.max(0, v - 1 / project.fps))}><Minus size={14} /></button><button className="play-main" onClick={togglePlayback} title={playing ? 'Pause' : 'Play'}><span className={`play-icon ${playing ? 'pause' : 'play'}`}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span></button><button className="icon-button" title="Next frame" onClick={() => setPlayhead((v) => Math.min(duration, v + 1 / project.fps))}><Plus size={14} /></button></div>
            <div className="time-readout"><b>{formatTime(playhead)}</b><span>/</span>{formatTime(duration)}</div>
            <div className="preview-control-right"><button className={`icon-button ${compareOriginal ? 'active' : ''}`} title={compareOriginal ? 'Show filtered preview' : 'Compare original'} aria-label="Compare original" onClick={() => setCompareOriginal((value) => !value)}><Eye size={15} /></button><button className={`icon-button ${trimMode ? 'active' : ''}`} title="Crop preview" onClick={() => { const ratio = project.settings.aspectRatio === '16:9' ? '9:16' : '16:9'; setProject((p) => ({ ...p, settings: { ...p.settings, aspectRatio: ratio }, ...dimensionsForAspect(ratio, 1080) })); setTrimMode((value) => !value) }}><Crop size={16} /></button><select className="compact-select" value={project.settings.aspectRatio} aria-label="Aspect ratio" onChange={(event) => setProject((p) => ({ ...p, settings: { ...p.settings, aspectRatio: event.target.value }, ...dimensionsForAspect(event.target.value, 1080) }))}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option></select><button className="icon-button" title="Fit preview" onClick={() => document.querySelector('.preview-frame')?.requestFullscreen?.()}><Maximize2 size={15} /></button></div>
          </div>
          {project.clips.filter((clip) => clip.track === 'audio').map((clip) => <audio key={clip.id} className="hidden-audio" ref={(element) => {
            if (element) audioRefs.current.set(clip.id, element)
            else audioRefs.current.delete(clip.id)
          }} />)}
        </main>
        <div className="resize-handle" onPointerDown={(event) => startPanelResize(event, 'right')} />

        <aside className="inspector">
          <div className="inspector-head"><div><SlidersHorizontal size={16} /><h2>Inspector</h2></div><button className="small-icon-button" title="Reset properties" onClick={() => selectedClip ? updateClip(selectedClip.id, { speed: 1, volume: 1, muted: false }) : setProject((p) => ({ ...p, settings: { ...p.settings, brightness: 100, contrast: 100, saturation: 100, blur: 0 } }))}><Undo2 size={14} /></button></div>
          {selectedClip ? <div className="inspector-content">
            <div className="inspector-section"><div className="section-title"><span>{selectedClip.track === 'text' ? 'TEXT LAYER' : `${selectedClip.track.toUpperCase()} CLIP`}</span><button className="icon-button danger" title="Delete clip" onClick={removeSelected}><Trash2 size={15} /></button></div><b className="selected-clip-name">{selectedClip.name}</b>
              {selectedClip.track === 'text' ? <>
                <label className="field-label">Content<input className="text-input" value={selectedClip.text ?? ''} onChange={(event) => updateClip(selectedClip.id, { text: event.target.value, name: event.target.value || 'Title' })} /></label>
                <label className="field-label">Text color<input type="color" value={selectedClip.color ?? '#ffffff'} onChange={(event) => updateClip(selectedClip.id, { color: event.target.value })} /></label>
                <label className="field-label">Font<select value={selectedClip.fontFamily ?? ''} onChange={(event) => updateClip(selectedClip.id, { fontFamily: event.target.value || undefined })}><option value="">System sans-serif</option>{(project.fonts ?? []).map((font) => <option key={font.id} value={font.family}>{font.name}</option>)}</select></label>
                <SettingSlider label="Font size" value={selectedClip.fontSize ?? 54} min={16} max={110} unit=" px" onChange={(v) => updateClip(selectedClip.id, { fontSize: v })} />
              </> : <>
                <SettingSlider label="Speed" value={Math.round(selectedClip.speed * 100)} min={25} max={400} unit="%" onChange={(v) => updateClip(selectedClip.id, { speed: v / 100, duration: selectedClip.duration * selectedClip.speed / (v / 100) })} />
                <div className="inspector-section"><div className="section-title"><span>SPEED RAMP</span></div>
                  <label className="toggle-row"><span>Speed ramp</span><input type="checkbox" checked={!!(selectedClip.speedRamp?.enabled)} onChange={toggleSpeedRamp} /></label>
                  <label className="toggle-row"><span>Reverse playback</span><input type="checkbox" checked={!!(selectedClip.speedRamp?.reverse)} onChange={toggleSpeedReverse} /></label>
                  <button className="button subtle" onClick={() => {
                    const ramp = selectedClip.speedRamp ?? { enabled: true, points: [makeSpeedPoint(0, selectedClip.speed)], frameBlending: false, opticalFlow: false, pitchPreserved: true, reverse: false }
                    const points = [...ramp.points, makeSpeedPoint(selectedClip.duration / 2, 0)]
                    updateClip(selectedClip.id, { speedRamp: { ...ramp, points, enabled: true } })
                    report('Freeze frame added at mid-clip.')
                  }}><Pause size={13} /> Freeze frame</button>
                  <div className="feature-note" style={{ fontSize: 8, marginTop: 6 }}>Speed ramp uses control points along the clip. Frame blending and optical flow require source frame interpolation (preview only).</div>
                </div>
                {selectedClip.track === 'audio' && <><SettingSlider label="Volume" value={Math.round(selectedClip.volume * 100)} min={0} max={100} unit="%" onChange={(v) => updateClip(selectedClip.id, { volume: v / 100 })} /><label className="toggle-row"><span>Mute clip</span><input type="checkbox" checked={selectedClip.muted} onChange={(event) => updateClip(selectedClip.id, { muted: event.target.checked })} /></label></>}
                {(selectedClip.track === 'video' || selectedClip.track === 'overlay') && <label className="toggle-row"><span>Mute source audio</span><input type="checkbox" checked={selectedClip.muted} onChange={(event) => updateClip(selectedClip.id, { muted: event.target.checked })} /></label>}
                {(selectedClip.track === 'video' || selectedClip.track === 'overlay') && <>
                  <div className="section-title overlay-controls-title"><span>CANVAS LAYER</span></div>
                  <SettingSlider label="Horizontal position" value={selectedClip.positionX ?? 0} min={-100} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { positionX: v })} />
                  <SettingSlider label="Vertical position" value={selectedClip.positionY ?? 0} min={-100} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { positionY: v })} />
                  <SettingSlider label="Layer size" value={selectedClip.scale ?? 100} min={10} max={300} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { scale: v })} />
                  <SettingSlider label="Opacity" value={selectedClip.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { opacity: v })} />
                  <SettingSlider label="Rotation" value={selectedClip.rotation ?? 0} min={-360} max={360} unit="°" step={1} onChange={(v) => updateClipWithAutoKey(selectedClip.id, { rotation: v })} />
                  <div className="section-title overlay-controls-title"><span>IMAGE CROP</span></div>
                  <SettingSlider label="Crop left" value={selectedClip.cropLeft ?? 0} min={0} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { cropLeft: v })} />
                  <SettingSlider label="Crop top" value={selectedClip.cropTop ?? 0} min={0} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { cropTop: v })} />
                  <SettingSlider label="Crop right" value={selectedClip.cropRight ?? 0} min={0} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { cropRight: v })} />
                  <SettingSlider label="Crop bottom" value={selectedClip.cropBottom ?? 0} min={0} max={100} unit="%" onChange={(v) => updateClipWithAutoKey(selectedClip.id, { cropBottom: v })} />
                  <button className="button subtle cut-sticker-btn" onClick={() => splitSelected()}><Scissors size={13} /> Cut at playhead</button>
                </>}
              </>}
              <div className="field-row"><label className="field-label">Position (s)<input type="number" min="0" step="0.1" value={selectedClip.start.toFixed(2)} onChange={(event) => updateClip(selectedClip.id, { start: Math.max(0, Number(event.target.value)) })} /></label><label className="field-label">Duration (s)<input type="number" min="0.1" step="0.1" value={selectedClip.duration.toFixed(2)} onChange={(event) => updateClip(selectedClip.id, { duration: Math.max(0.1, Number(event.target.value)) })} /></label></div>
              <div className="inspector-section keyframe-section">
                <div className="section-title"><span>ANIMATION · KEYFRAMES</span><div className="keyframe-actions"><label className="toggle-row" style={{ margin: 0, fontSize: 9 }}><input type="checkbox" checked={autoKeyframe} onChange={(event) => setAutoKeyframe(event.target.checked)} /> <span style={{ marginLeft: 4 }}>Auto keyframe</span></label><button className="small-icon-button" title="Clear all keyframes on this clip" aria-label="Clear all keyframes" onClick={() => updateClip(selectedClip.id, { keyframes: { properties: {} } })}><X size={13} /></button></div></div>
                <p className="library-copy keyframe-hint">Move the playhead inside the clip, then add a keyframe. Property changes between keyframes animate automatically in preview and export.</p>
                {ANIMATABLE_PROPERTIES.map((property) => {
                  const frames = keyframesForProperty(selectedClip, property.id)
                  const inRange = playhead >= selectedClip.start && playhead < clipEnd(selectedClip)
                  const atKeyframe = frames.some((frame) => Math.abs(selectedClip.start + frame.time - playhead) < 1 / project.fps)
                  return <div className="keyframe-property-row" key={property.id}>
                    <span className="keyframe-property-name">{property.label}</span>
                    <span className="keyframe-count">{frames.length} key{frames.length === 1 ? '' : 's'}</span>
                    <button className={`small-icon-button ${atKeyframe ? 'active' : ''}`} disabled={!inRange} title={inRange ? 'Add a keyframe for this property at the playhead (records the current value)' : 'Move the playhead inside the clip first'} aria-label={`Add ${property.label} keyframe at playhead`} onClick={() => {
                      const localTime = Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.start))
                      const current = staticPropertyValue(selectedClip, property.id)
                      updateClip(selectedClip.id, addKeyframeToClip(selectedClip, property.id, localTime, current))
                      report(`${property.label} keyframe added at ${formatTime(playhead)}.`)
                    }}><Plus size={12} /></button>
                    <button className="small-icon-button" disabled={!frames.length} title="Remove all keyframes for this property" aria-label={`Remove all ${property.label} keyframes`} onClick={() => updateClip(selectedClip.id, { keyframes: { properties: { ...selectedClip.keyframes?.properties, [property.id]: [] } } })}><X size={12} /></button>
                  </div>
                })}
                {(() => {
                  const activeProperty = selectedKeyframeProperty ?? ANIMATABLE_PROPERTIES.find((property) => keyframesForProperty(selectedClip, property.id).length > 0)?.id ?? null
                  if (!activeProperty) return null
                  const frames = keyframesForProperty(selectedClip, activeProperty)
                  if (!frames.length) return null
                  const property = ANIMATABLE_PROPERTIES.find((item) => item.id === activeProperty)
                  return <div className="keyframe-list">
                    <div className="section-title"><span>{property?.label ?? activeProperty} KEYFRAMES</span><select className="compact-select" aria-label="Keyframe property" value={activeProperty} onChange={(event) => setSelectedKeyframeProperty(event.target.value as AnimatableProperty)}>{ANIMATABLE_PROPERTIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
                    {frames.map((frame) => <div className="keyframe-row" key={frame.id}>
                      <input type="number" min={0} max={selectedClip.duration} step={0.05} value={frame.time.toFixed(2)} aria-label="Keyframe time (seconds from clip start)" onChange={(event) => {
                        const time = Math.max(0, Math.min(selectedClip.duration, Number(event.target.value)))
                        const sorted = [...frames.filter((item) => item.id !== frame.id), { ...frame, time }].sort((a, b) => a.time - b.time)
                        updateClip(selectedClip.id, { keyframes: { properties: { ...selectedClip.keyframes?.properties, [activeProperty]: sorted } } })
                      }} />
                      <input type="number" value={frame.value.toFixed(1)} step={0.5} aria-label="Keyframe value" onChange={(event) => {
                        const value = Number(event.target.value)
                        if (!Number.isFinite(value)) return
                        updateClip(selectedClip.id, { keyframes: { properties: { ...selectedClip.keyframes?.properties, [activeProperty]: frames.map((item) => item.id === frame.id ? { ...item, value } : item) } } })
                      }} />
                      <select className="compact-select" aria-label="Keyframe easing" value={frame.easing} onChange={(event) => {
                        const easing = event.target.value as EasingType
                        updateClip(selectedClip.id, { keyframes: { properties: { ...selectedClip.keyframes?.properties, [activeProperty]: frames.map((item) => item.id === frame.id ? { ...item, easing } : item) } } })
                      }}>{(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as EasingType[]).map((easing) => <option key={easing} value={easing}>{easing}</option>)}</select>
                      <button className="small-icon-button" title="Go to keyframe" aria-label={`Go to ${property?.label} keyframe`} onClick={() => setPlayhead(selectedClip.start + frame.time)}><Play size={11} /></button>
                      <button className="small-icon-button" title="Delete keyframe" aria-label={`Delete ${property?.label} keyframe`} onClick={() => updateClip(selectedClip.id, removeKeyframeFromClip(selectedClip, activeProperty, frame.id))}><X size={12} /></button>
                    </div>)}
                  </div>
                })()}
              </div>
              <div className="inspector-actions"><button className="button subtle" onClick={duplicateSelected}><Copy size={14} /> Duplicate</button><button className="button subtle" onClick={splitSelected}><Scissors size={14} /> Split</button></div>
              <div className="inspector-actions trim-actions">
                <button className="button subtle" title="Move clip start to the playhead" onClick={() => trimSelectedToPlayhead('start')}><ChevronRight size={13} /> Trim start here</button>
                <button className="button subtle" title="Move clip end to the playhead" onClick={() => trimSelectedToPlayhead('end')}><ChevronLeft size={13} /> Trim end here</button>
              </div>
            </div>
          </div> : <div className="inspector-empty"><div className="inspector-empty-icon"><SlidersHorizontal size={21} /></div><b>Nothing selected</b><span>Select a clip to adjust its properties, or tune the project look below.</span>
            <div className="inspector-section project-look"><div className="section-title"><span>PROJECT LOOK</span></div><SettingSlider label="Brightness" value={project.settings.brightness} min={50} max={150} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, brightness: v } }))} /><SettingSlider label="Contrast" value={project.settings.contrast} min={50} max={150} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, contrast: v } }))} /><SettingSlider label="Saturation" value={project.settings.saturation} min={0} max={200} unit="%" onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, saturation: v } }))} /></div></div>}
          <div className="inspector-footer"><Cloud size={14} /><span>Stored on this device</span><button title="Download portable project with media" onClick={exportProjectFile}><Download size={14} /></button></div>
        </aside>
      </div>

      <section className="timeline-panel">
        <div className="timeline-toolbar"><div className="timeline-title"><span className="timeline-title-icon"><Layers2 size={16} /></span><div><b>Timeline</b><span>{project.clips.length} clips · {formatTime(duration)}</span></div></div>
          <div className="timeline-tools">
            <button className="tool-button" title="Undo" aria-label="Undo" onClick={undo} disabled={!history.length}><Undo2 size={15} /></button>
            <button className="tool-button" title="Redo" aria-label="Redo" onClick={redo} disabled={!future.length}><Redo2 size={15} /></button>
            <span className="toolbar-divider" />
            <button className="tool-button" title="Split selected clip at playhead" aria-label="Split selected clip" onClick={splitSelected}><Scissors size={15} /></button>
            <button className="tool-button" title="Split every clip at playhead" aria-label="Split all clips" onClick={splitAllAtPlayhead}><Layers2 size={15} /></button>
            <button className={`tool-button ${timelineTool === 'roll' ? 'active' : ''}`} title="Roll edit: drag a cut to adjust the boundary without moving other clips" aria-label="Roll edit tool" aria-pressed={timelineTool === 'roll'} onClick={() => setTimelineTool((tool) => tool === 'roll' ? 'select' : 'roll')}><ArrowLeftRight size={15} /></button>
            <button className={`tool-button ${timelineTool === 'slip' ? 'active' : ''}`} title="Slip edit: drag a clip to change its source section without moving it on the timeline" aria-label="Slip edit tool" aria-pressed={timelineTool === 'slip'} onClick={() => setTimelineTool((tool) => tool === 'slip' ? 'select' : 'slip')}><MoveHorizontal size={15} /></button>
            <button className={`tool-button ${timelineTool === 'slide' ? 'active' : ''}`} title="Slide edit: drag a clip while the neighboring edit points stay fixed" aria-label="Slide edit tool" aria-pressed={timelineTool === 'slide'} onClick={() => setTimelineTool((tool) => tool === 'slide' ? 'select' : 'slide')}><MoveDiagonal size={15} /></button>
            <button className="tool-button" title="Ripple delete selected clips" aria-label="Ripple delete" onClick={rippleDeleteSelected} disabled={!selectedTimelineClips().length}><Trash2 size={14} /></button>
            <button className="tool-button" title="Add track" aria-label="Add track" onClick={() => addTrack('video')}>+</button>
            <button className={`tool-button ${snapEnabled ? 'active' : ''}`} title={`Timeline snapping ${snapEnabled ? 'on' : 'off'}`} aria-label="Toggle timeline snapping" aria-pressed={snapEnabled} onClick={() => setSnapEnabled((value) => !value)}><Magnet size={15} /></button>
            <input type="range" className="snap-sensitivity" title="Snapping sensitivity (seconds)" min={0.02} max={0.5} step={0.02} value={snapSensitivity} onChange={(event) => setSnapSensitivity(Number(event.target.value))} />
            <span className="toolbar-divider" />
            <button className="tool-button" title="Add marker at playhead (M)" aria-label="Add marker" onClick={addTimelineMarker}><Flag size={14} /></button>
            <button className="tool-button" title="Previous marker ([)" aria-label="Previous marker" onClick={() => jumpToMarker(-1)}><ChevronLeft size={15} /></button>
            <button className="tool-button" title="Next marker (])" aria-label="Next marker" onClick={() => jumpToMarker(1)}><ChevronRight size={15} /></button>
            <button className={`tool-button ${loopPlayback ? 'active' : ''}`} title={`Loop playback ${loopPlayback ? 'on' : 'off'} (L)`} aria-label="Toggle loop playback" aria-pressed={loopPlayback} onClick={() => setLoopPlayback((value) => !value)}><Repeat size={15} /></button>
            <span className="toolbar-divider" />
            <button className="tool-button" title="Fit timeline to project" aria-label="Fit timeline" onClick={fitTimeline}><Maximize2 size={14} /></button>
            <button className="tool-button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}><CircleHelp size={15} /></button>
            <span className="toolbar-divider" />
            <button className="tool-button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => changeTimelineZoom(value, -1))}><ZoomOut size={15} /></button>
            <input className="zoom-range" type="range" min={MIN_TIMELINE_ZOOM} max={MAX_TIMELINE_ZOOM} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Timeline zoom" />
            <button className="tool-button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => changeTimelineZoom(value, 1))}><ZoomIn size={15} /></button>
            <span className="zoom-value">{Math.round(zoom / 54 * 100)}%</span>
          </div>
        </div>
        <div className="timeline-body">
          <div className="track-label-column" ref={trackLabelsRef}>
            <div className="ruler-label"><span>TIME</span></div>
            {timelineRows.map((track) => {
              const disabled = track.kind === 'audio'
                ? project.mutedTracks?.includes('audio') ?? false
                : project.hiddenTracks?.includes(track.kind) ?? false
              const isRenaming = renamingTrackId === track.id
              return <div className={`track-label ${disabled ? 'inactive-track' : ''} ${track.locked ? 'locked-track' : ''}`} key={track.id} title={track.kind === 'overlay' ? `Picture-in-picture layer ${track.overlayLayer}; higher numbered layers appear above lower ones.` : undefined}>
                <span className={`track-color ${track.kind}`} style={{ background: track.color }} />
                {isRenaming ? (
                  <input className="text-input" autoFocus value={trackRenameValue} onChange={(event) => setTrackRenameValue(event.target.value)} onBlur={saveTrackRename} onKeyDown={(event) => { if (event.key === 'Enter') saveTrackRename(); if (event.key === 'Escape') cancelTrackRename() }} />
                ) : (
                  <span title={track.name} onDoubleClick={() => renameTrack(track.id)}>{track.kind === 'overlay' ? `Overlay ${track.overlayLayer}` : track.name}</span>
                )}
                <div className="track-controls">
                  <button className="track-state-button" title={track.kind === 'audio' ? `${disabled ? 'Unmute' : 'Mute'} audio track` : `${disabled ? 'Show' : 'Hide'} ${track.kind} track`} aria-label={track.kind === 'audio' ? `${disabled ? 'Unmute' : 'Mute'} audio track` : `${disabled ? 'Show' : 'Hide'} ${track.kind} track`} aria-pressed={disabled} onClick={() => toggleTrackState(track.kind as TrackKind)} disabled={track.locked}>
                    {track.kind === 'audio' ? disabled ? <VolumeX size={12} /> : <AudioLines size={12} /> : disabled ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button className="track-state-button" title={track.locked ? 'Unlock track' : 'Lock track'} aria-label={track.locked ? 'Unlock track' : 'Lock track'} aria-pressed={track.locked} onClick={() => toggleTrackLock(track.id)}>
                    {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  <button className="track-state-button" title={track.soloed ? 'Unsolo track' : 'Solo track'} aria-label={track.soloed ? 'Unsolo track' : 'Solo track'} aria-pressed={track.soloed} onClick={() => toggleTrackSolo(track.id)}>
                    {track.soloed ? <CircleHelp size={12} /> : <SlidersHorizontal size={12} />}
                  </button>
                </div>
              </div>
            })}
          </div>
          <div className="timeline-scroll" ref={timelineRef} onScroll={(event) => {
            const labels = trackLabelsRef.current
            if (labels && Math.abs(labels.scrollTop - event.currentTarget.scrollTop) > 1) labels.scrollTop = event.currentTarget.scrollTop
          }} onPointerDown={seekFromPointer} onContextMenu={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest('.timeline-clip')) return
            openLaneContextMenu(event, 'video')
          }}>
            <div className="timeline-inner" style={{ width: `${Math.max(850, (duration + 10) * zoom + 150)}px` }}>
              <div className="ruler" style={{ backgroundSize: `${zoom}px 100%` }}>{Array.from({ length: Math.ceil(duration + 10) }, (_, i) => <span key={i} style={{ left: `${i * zoom}px` }}>{i === 0 || i % 5 === 0 ? `${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}` : ''}</span>)}</div>
              {markers.map((marker) => <div className="timeline-marker-wrap" key={marker.id} style={{ left: `${marker.time * zoom}px` }}>
                <button className="timeline-marker" title={`${marker.label} · ${formatTime(marker.time)} · double-click to rename · right-click to remove`} aria-label={`Go to marker ${marker.label} at ${formatTime(marker.time)}`} onClick={(event) => { event.stopPropagation(); seekTimeline(marker.time) }} onDoubleClick={() => renameMarker(marker.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); removeMarker(marker.id) }}><Flag size={11} /></button>
                <span className="timeline-marker-stem" />
              </div>)}
              {timelineRows.map((track) => <div className={`track-lane ${track.kind} ${track.locked ? 'locked-track' : ''} ${track.kind === 'audio' ? (project.mutedTracks?.includes('audio') ? 'inactive-track' : '') : (project.hiddenTracks?.includes(track.kind) ? 'inactive-track' : '')} ${track.soloed ? 'soloed-track' : ''}`} key={track.id} onContextMenu={(event) => openLaneContextMenu(event, track.kind as TrackKind)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault()
                if (track.locked) { report('This track is locked.'); return }
                const transitionId = event.dataTransfer.getData('transitionId')
                if (transitionId) {
                  if (track.kind !== 'video' && track.kind !== 'overlay') { report('Transitions can only be dropped on video or overlay cuts.'); return }
                  const at = Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left + (timelineRef.current?.scrollLeft ?? 0)) / zoom)
                  const candidates = project.clips.filter((clip) => clip.track === track.kind
                    && (track.kind !== 'overlay' || (clip.overlayLayer ?? 1) === (track.overlayLayer ?? 1)))
                  const incoming = candidates.filter((clip) => clip.start >= at - 0.08).sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at))[0]
                    ?? candidates.sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at))[0]
                  if (incoming) { setSelectedId(incoming.id); applyTransitionToClip(incoming, transitionId) }
                  else report('Add two clips to this track before placing a transition.')
                  return
                }
                const id = event.dataTransfer.getData('assetId') || dragAsset
                const asset = project.media.find((item) => item.id === id)
                if (asset) addAssetToTimeline(asset, track.kind as TrackKind, Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left + (timelineRef.current?.scrollLeft ?? 0)) / zoom), track.overlayLayer)
              }}>
                {project.clips.filter((clip) => clip.track === track.kind && (track.kind !== 'overlay' || (clip.overlayLayer ?? 1) === (track.overlayLayer ?? 1))).map((clip) => {
                  const asset = clip.mediaId ? project.media.find((item) => item.id === clip.mediaId) : null
                  return <div className={`timeline-clip ${track.kind} ${multiSelectedClipIds.includes(clip.id) ? 'selected' : ''} ${track.locked ? 'locked-track' : ''}`} key={clip.id} style={{ left: `${clip.start * zoom}px`, width: `${Math.max(28, clip.duration * zoom)}px` }} onContextMenu={(event) => openClipContextMenu(event, clip)} onClick={(event) => { event.stopPropagation(); setTimelineContextMenu(null); setSelectedId(clip.id); setMultiSelectedClipIds((ids) => event.ctrlKey || event.metaKey ? (ids.includes(clip.id) ? ids.filter((id) => id !== clip.id) : [...ids, clip.id]) : [clip.id]) }} onPointerDown={(event) => { if (track.locked) return; if (!(event.target instanceof HTMLElement && event.target.classList.contains('trim-handle'))) beginClipDrag(event, clip, 'move') }} onPointerMove={moveClipDrag} onPointerUp={finishClipDrag} title={`${clip.name} · ${formatTime(clip.duration)} · Ctrl/Cmd-click to multi-select · right-click for actions`}>
                    <div className="trim-handle left" onPointerDown={(event) => { if (track.locked) return; beginClipDrag(event, clip, 'left') }} onPointerMove={moveClipDrag} onPointerUp={finishClipDrag} />
                    <div className="clip-content">{track.kind === 'video' && asset?.kind === 'video' ? <video src={asset.url} muted preload="metadata" className="clip-thumb" /> : null}{track.kind === 'video' && asset?.kind === 'image' ? <img src={asset.url} className="clip-thumb" /> : null}{(track.kind === 'overlay' && asset?.kind === 'video') || (track.kind === 'overlay' && asset?.kind === 'image') ? <img src={asset.url} className="clip-thumb overlay-thumb" /> : null}{track.kind === 'audio' ? <div className="waveform">{Array.from({ length: Math.max(8, Math.min(45, Math.floor(clip.duration * 4))) }, (_, index) => <i key={index} style={{ height: `${20 + Math.abs(Math.sin(index * 12.9898 + clip.id.length)) * 72}%` }} />)}</div> : null}<span>{track.kind === 'text' ? <Type size={12} /> : track.kind === 'audio' ? <Music2 size={11} /> : track.kind === 'overlay' ? <ImagePlus size={11} /> : null}{clip.name}</span></div>
                    {clip.transitionIn && <div className={`transition-band ${clip.transitionIn.kind}`} style={{ width: `${Math.min(clip.transitionIn.duration, clip.duration) * zoom}px` }} title={`${clip.transitionIn.kind} · ${clip.transitionIn.duration.toFixed(1)}s`}><i /><span>{clip.transitionIn.kind}</span></div>}
                    {(() => {
                      const allFrames: { time: number; property: string; id: string }[] = []
                      Object.entries(clip.keyframesExtended?.properties ?? clip.keyframes?.properties ?? {}).forEach(([prop, frames]) => {
                        frames.forEach((f) => allFrames.push({ time: f.time, property: prop as string, id: f.id }))
                      })
                      return allFrames.map((frame) => {
                        const left = (frame.time / Math.max(clip.duration, 0.001)) * 100
                        return <button className="keyframe-dot" key={frame.id} title={`Keyframe: ${frame.property} at ${formatTime(clip.start + frame.time)}`} onClick={(event) => { event.stopPropagation(); setPlayhead(clip.start + frame.time) }} style={{ left: `${left}%` }} />
                      })
                    })()}
                    <div className="trim-handle right" onPointerDown={(event) => { if (track.locked) return; beginClipDrag(event, clip, 'right') }} onPointerMove={moveClipDrag} onPointerUp={finishClipDrag} />
                  </div>
                })}
              </div>)}
              <div className="playhead" style={{ left: `${playhead * zoom}px` }}><div className="playhead-grip" /><div className="playhead-line" /></div>
            </div>
          </div>
        </div>
      </section>

      {timelineContextMenu && <div
        className="timeline-context-menu"
        role="menu"
        style={{
          left: Math.max(8, Math.min(timelineContextMenu.x, window.innerWidth - 220)),
          top: Math.max(8, Math.min(timelineContextMenu.y, window.innerHeight - 330)),
        }}
      >
        {timelineContextMenu.clipId ? <>
          <button className="timeline-menu-item" role="menuitem" onClick={() => { copySelectedClips(); setTimelineContextMenu(null) }}><Copy size={14} />Copy</button>
          <button className="timeline-menu-item" role="menuitem" onClick={cutSelectedClips}><Scissors size={14} />Cut</button>
          <button className="timeline-menu-item" role="menuitem" disabled={!copiedClips?.length} onClick={() => pasteClips()}><FilePlus2 size={14} />Paste at playhead</button>
          <span className="timeline-menu-divider" />
          <button className="timeline-menu-item" role="menuitem" onClick={() => { duplicateSelected(); setTimelineContextMenu(null) }}><Copy size={14} />Duplicate</button>
          <button className="timeline-menu-item" role="menuitem" onClick={() => { splitSelected(); setTimelineContextMenu(null) }}><Scissors size={14} />Split at playhead</button>
          {timelineContextMenu.track === 'overlay' && <>
            <button className="timeline-menu-item" role="menuitem" onClick={() => moveOverlayLayer(timelineContextMenu.clipId!, 1)}><Layers2 size={14} />Bring overlay forward</button>
            <button className="timeline-menu-item" role="menuitem" onClick={() => moveOverlayLayer(timelineContextMenu.clipId!, -1)}><Layers2 size={14} />Send overlay backward</button>
          </>}
          {(timelineContextMenu.track === 'video' || timelineContextMenu.track === 'overlay') && <button className="timeline-menu-item" role="menuitem" onClick={() => moveSelectedToOverlay(timelineContextMenu.clipId!)}><Layers2 size={14} />Move to {timelineContextMenu.track === 'overlay' ? 'video' : 'new overlay layer'}</button>}
          <span className="timeline-menu-divider" />
          <button className="timeline-menu-item danger" role="menuitem" onClick={() => { removeSelected(); setTimelineContextMenu(null) }}><Trash2 size={14} />Delete</button>
        </> : <>
          <button className="timeline-menu-item" role="menuitem" disabled={!copiedClips?.length} onClick={() => pasteClips(timelineContextMenu.time ?? playhead)}><FilePlus2 size={14} />Paste here</button>
          {selectedAsset && <button className="timeline-menu-item" role="menuitem" disabled={(selectedAsset.kind === 'audio' && timelineContextMenu.track !== 'audio') || (selectedAsset.kind !== 'audio' && timelineContextMenu.track !== 'video' && timelineContextMenu.track !== 'overlay')} onClick={() => {
            const { track, time } = timelineContextMenu
            setTimelineContextMenu(null)
            if (track) addAssetToTimeline(selectedAsset, track, time)
          }}><Plus size={14} />Add selected media here</button>}
        </>}
      </div>}

      {markerDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMarkerDialog(null) }}><section className="marker-modal" role="dialog" aria-modal="true" aria-labelledby="marker-title">
        <div className="modal-head"><div><div className="modal-icon"><Flag size={18} /></div><div><h2 id="marker-title">{markerDialog.markerId ? 'Rename marker' : 'Add timeline marker'}</h2><span>Marker position · {formatTime(markerDialog.markerId ? markers.find((item) => item.id === markerDialog.markerId)?.time ?? playhead : playhead)}</span></div></div><button className="icon-button" aria-label="Close marker dialog" onClick={() => setMarkerDialog(null)}><X size={17} /></button></div>
        <form onSubmit={(event) => { event.preventDefault(); saveMarker() }}>
          <label className="field-label">Marker name<input className="text-input" autoFocus maxLength={60} value={markerDialog.value} onChange={(event) => setMarkerDialog((current) => current ? { ...current, value: event.target.value } : null)} /></label>
          <div className="field-label marker-color-row"><span>Marker color</span><div className="marker-color-swatches">{MARKER_COLORS.map((color) => <button key={color} type="button" className={`marker-swatch ${markerDialog.color === color ? 'active' : ''}`} style={{ background: color }} aria-label={`Marker color ${color}`} onClick={() => setMarkerDialog((current) => current ? { ...current, color } : null)} />)}</div></div>
          <div className="marker-dialog-actions"><button type="button" className="button subtle" onClick={() => setMarkerDialog(null)}>Cancel</button><button type="submit" className="button primary">{markerDialog.markerId ? 'Save name' : 'Add marker'}</button></div>
        </form>
      </section></div>}
      {shortcutsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false) }}><section className="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="modal-head"><div><div className="modal-icon"><CircleHelp size={18} /></div><div><h2 id="shortcuts-title">Keyboard shortcuts</h2><span>Quick actions for editing your timeline</span></div></div><button className="icon-button" aria-label="Close shortcuts" onClick={() => setShortcutsOpen(false)}><X size={17} /></button></div>
        <div className="shortcut-list">
          <span>Play / pause</span><kbd>Space</kbd>
          <span>Split selected clip</span><kbd>S</kbd>
          <span>Add marker</span><kbd>M</kbd>
          <span>Previous / next marker</span><kbd>[ / ]</kbd>
          <span>Toggle playback loop</span><kbd>L</kbd>
          <span>Show this help</span><kbd>?</kbd>
          <span>Copy / cut / paste clips</span><kbd>Ctrl/Cmd + C/X/V</kbd>
          <span>Undo / redo</span><kbd>Ctrl/Cmd + Z / Shift + Z</kbd>
          <span>Delete selected clips</span><kbd>Delete</kbd>
          <span>Save project</span><kbd>Ctrl/Cmd + S</kbd>
        </div>
      </section></div>}
      {exportOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false) }}><section className="export-modal">
        <div className="modal-head"><div><div className="modal-icon"><Download size={18} /></div><div><h2>Export video</h2><span>Render your timeline into a downloadable file</span></div></div><button className="icon-button" onClick={() => setExportOpen(false)}><X size={17} /></button></div>
        <label className="field-label">File name<input className="text-input" value={exportName} onChange={(event) => setExportName(event.target.value)} /></label>
        <div className="field-row"><label className="field-label">Resolution<select value={exportSize} onChange={(event) => setExportSize(event.target.value)}><option>480p</option><option>720p</option><option>1080p</option><option>4K</option></select></label><label className="field-label">Frame rate<select value={exportFps} onChange={(event) => setExportFps(Number(event.target.value))}><option value={24}>24 FPS</option><option value={25}>25 FPS</option><option value={30}>30 FPS</option><option value={50}>50 FPS</option><option value={60}>60 FPS</option></select></label></div>
        <div className="field-row"><label className="field-label">Video quality<select value={exportQuality} onChange={(event) => setExportQuality(event.target.value)}><option>Draft</option><option>Standard</option><option>High</option><option>Maximum</option></select></label><label className="field-label">Audio bitrate<select value={exportAudioBitrate} onChange={(event) => setExportAudioBitrate(Number(event.target.value))}><option value={96000}>96 kbps</option><option value={128000}>128 kbps</option><option value={192000}>192 kbps</option><option value={256000}>256 kbps</option></select></label></div>
        <div className="export-notice"><Activity size={16} /><span>Rendering uses your browser’s real-time canvas and WebM encoder. 4K export can use substantial memory. Export format: WebM.</span></div>
        <div className="export-summary"><span>Project duration</span><b>{formatTime(duration)}</b><span>Frame rate</span><b>{exportFps} FPS</b><span>Aspect ratio</span><b>{project.settings.aspectRatio}</b></div>
        <button className="button primary export-start" disabled={exporting || !project.clips.length} onClick={() => void exportVideo()}><Download size={16} /> Render & download</button>
      </section></div>}
      {exporting && <div className="export-progress"><div><span>Rendering your video… {exportProgress}%</span><button className="button subtle cancel-export" onClick={cancelExport} disabled={exportCancelRequested}>{exportCancelRequested ? 'Cancelling…' : 'Cancel'}</button></div><div className="progress-track"><i style={{ width: `${exportProgress}%` }} /></div><span>{exportCancelRequested ? 'Stopping the render and discarding the partial file.' : 'Keep this tab open while the browser records the composition.'}</span></div>}
      {message && <div className="toast"><Check size={15} /><span>{message}</span><button onClick={() => setMessage('')}><X size={14} /></button></div>}
      <input ref={fileInput} type="file" multiple accept="video/*,audio/*,image/*,.svg,.srt,.ttf,.otf,.woff,.woff2" hidden onChange={(event) => { const files = event.target.files; if (files?.length) void addFiles(files); event.target.value = '' }} />
      <input ref={effectPackInput} type="file" accept=".json,.frameforge-effects.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void installEffectPack(file); event.target.value = '' }} />
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><div className="brand-symbol"><span /><span /><span /></div>{!compact && <span>frameforge<span className="brand-studio"> STUDIO</span></span>}</div>
}

function SettingSlider({ label, value, min, max, unit, step = 1, onChange }: { label: string; value: number; min: number; max: number; unit: string; step?: number; onChange: (value: number) => void }) {
  return <label className="setting-slider"><span>{label}<b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

export default App
