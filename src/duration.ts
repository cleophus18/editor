export const DEFAULT_IMAGE_DURATION = 5
export const METADATA_TIMEOUT_MS = 15000
export const PROJECT_SCHEMA_VERSION = 2

export type MediaMetadataStatus = 'pending' | 'ready' | 'error' | 'recovered'

export interface ExtractedMetadata {
  duration: number
  width: number
  height: number
  frameRate?: number
  sampleRate?: number
  status: MediaMetadataStatus
  error?: string
}

export const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export const sanitizeDuration = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

export const sanitizeSpeed = (value: unknown, fallback = 1): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.max(0.01, value)
}

export const roundTime = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1_000_000) / 1_000_000
}

export const timelineDurationForSourceRange = (sourceRangeSeconds: number, speed: number): number => {
  const range = Math.max(0, sanitizeDuration(sourceRangeSeconds, 0))
  const safeSpeed = sanitizeSpeed(speed, 1)
  if (range === 0) return 0
  return range / safeSpeed
}

export const sourceRangeForTimelineDuration = (timelineSeconds: number, speed: number): number => {
  const t = Math.max(0, sanitizeDuration(timelineSeconds, 0))
  return t * sanitizeSpeed(speed, 1)
}

export const clampToSource = (value: number, sourceDuration: number | null | undefined): number => {
  const safe = Math.max(0, sanitizeDuration(value, 0))
  if (!isFinitePositive(sourceDuration)) return safe
  return Math.min(safe, sourceDuration)
}

export interface SpeedRampPointLike {
  time: number
  speed: number
}

export const sourceConsumedAt = (
  clipTimeSeconds: number,
  speed: number,
  ramp?: { enabled?: boolean; points?: SpeedRampPointLike[] } | null,
): number => {
  const t = Math.max(0, sanitizeDuration(clipTimeSeconds, 0))
  if (!ramp?.enabled || !ramp.points?.length) return sourceRangeForTimelineDuration(t, speed)
  const sorted = [...ramp.points]
    .map((p) => ({ time: Math.max(0, sanitizeDuration(p.time, 0)), speed: sanitizeSpeed(p.speed, speed) }))
    .sort((a, b) => a.time - b.time)
  let consumed = 0
  let prevTime = 0
  let prevSpeed = sorted[0].speed
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]
    const segEnd = Math.min(point.time, t)
    if (segEnd > prevTime) {
      const segSpeed = i === 0 && point.time > 0 ? point.speed : prevSpeed
      consumed += segSpeed * (segEnd - prevTime)
      prevTime = segEnd
    }
    prevSpeed = point.speed
    if (prevTime >= t) return consumed
  }
  if (prevTime < t) consumed += prevSpeed * (t - prevTime)
  return consumed
}

export const timelineDurationForSourceRangeRamped = (
  sourceRangeSeconds: number,
  speed: number,
  points: SpeedRampPointLike[],
): number => {
  const range = Math.max(0, sanitizeDuration(sourceRangeSeconds, 0))
  if (range === 0) return 0
  const speeds = points.map((p) => sanitizeSpeed(p.speed, speed))
  const minSpeed = Math.max(0.01, Math.min(...speeds, sanitizeSpeed(speed, 1)))
  let lo = 0
  let hi = Math.max(0.1, range / minSpeed)
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    const consumed = sourceConsumedAt(mid, speed, { enabled: true, points })
    if (consumed < range) lo = mid
    else hi = mid
  }
  return hi
}

export const sourceRangeOfClip = (clip: { inPoint: number; duration: number; speed: number; speedRamp?: { enabled?: boolean; points?: SpeedRampPointLike[] } | null }): number =>
  Math.max(0, sourceConsumedAt(clip.duration, clip.speed, clip.speedRamp))

export const formatTimecode = (seconds: number, fps = 30): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const frameRate = Math.max(1, Math.round(fps))
  const totalFrames = Math.floor(safe * frameRate + 1e-9)
  const frames = totalFrames % frameRate
  const totalSeconds = Math.floor(totalFrames / frameRate)
  const secs = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const mins = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}
