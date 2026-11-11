import type { EffectPack, FilterParameters } from './types.ts'
import { FILTER_CATEGORIES, TRANSITION_CATEGORIES, TRANSITION_PRESETS } from './types.ts'

const parameterRanges: Record<keyof FilterParameters, [number, number]> = {
  brightness: [0, 300],
  contrast: [0, 300],
  saturation: [0, 300],
  exposure: [-5, 5],
  temperature: [-100, 100],
  tint: [-100, 100],
  highlights: [-100, 100],
  shadows: [-100, 100],
  fade: [0, 100],
  vignette: [0, 100],
  grain: [0, 100],
  sepia: [0, 100],
  grayscale: [0, 100],
  hue: [-360, 360],
}

export const validateEffectPack = (value: unknown): EffectPack => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Effect pack must be a JSON object.')
  const pack = value as Partial<EffectPack>
  if (pack.format !== 'frameforge-effect-pack' || pack.schemaVersion !== 1) throw new Error('Unsupported effect pack format or schema version.')
  for (const field of ['id', 'version', 'name', 'description', 'thumbnail', 'author', 'license', 'compatibleAppVersion'] as const) {
    if (typeof pack[field] !== 'string' || !pack[field]?.trim()) throw new Error(`Effect pack is missing ${field}.`)
  }
  if (pack.id!.length > 100 || !/^[\w.-]+$/.test(pack.id!)) throw new Error('Effect pack ID contains unsupported characters.')
  if (!/^\d+\.\d+\.\d+$/.test(pack.compatibleAppVersion!)) throw new Error('Effect pack has an invalid compatible application version.')
  if (!/^https:\/\//i.test(pack.thumbnail!) && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(pack.thumbnail!)) throw new Error('Effect pack thumbnail must be an HTTPS image URL or an embedded PNG, JPEG, WebP, or GIF.')
  if (!Array.isArray(pack.requiredAssets) || pack.requiredAssets.length > 100) throw new Error('Effect pack requiredAssets must be an array of 100 or fewer assets.')
  if (!Array.isArray(pack.filters) && !Array.isArray(pack.transitions)) throw new Error('Effect pack must contain filters or transitions.')
  const categories = new Set<string>(FILTER_CATEGORIES)
  const transitionCategories = new Set<string>(TRANSITION_CATEGORIES)
  const transitionEffects = new Set(TRANSITION_PRESETS.map((preset) => preset.effect))
  const filterIds = new Set<string>()
  for (const item of pack.filters ?? []) {
    if (!item || typeof item.id !== 'string' || !/^[\w.-]+$/.test(item.id) || filterIds.has(item.id)) throw new Error('Effect pack contains a missing, unsafe, or duplicate filter ID.')
    filterIds.add(item.id)
    if (typeof item.name !== 'string' || typeof item.description !== 'string' || !categories.has(item.category)) throw new Error(`Filter "${item.id}" has invalid name, description, or category.`)
    if (!item.parameters || typeof item.parameters !== 'object') throw new Error(`Filter "${item.id}" has no parameter configuration.`)
    for (const [key, [minimum, maximum]] of Object.entries(parameterRanges) as Array<[keyof FilterParameters, [number, number]]>) {
      const number = item.parameters[key]
      if (typeof number !== 'number' || !Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`Filter "${item.id}" has an invalid ${key} value.`)
    }
  }
  const transitionIds = new Set<string>()
  for (const item of pack.transitions ?? []) {
    if (!item || typeof item.id !== 'string' || !/^[\w.-]+$/.test(item.id) || transitionIds.has(item.id)) throw new Error('Effect pack contains a missing, unsafe, or duplicate transition ID.')
    transitionIds.add(item.id)
    if (typeof item.name !== 'string' || typeof item.description !== 'string' || !transitionCategories.has(item.category) || !transitionEffects.has(item.effect)) throw new Error(`Transition "${item.id}" uses an unsupported category or rendering effect.`)
  }
  const assetIds = new Set<string>()
  for (const asset of pack.requiredAssets) {
    if (!asset || typeof asset.id !== 'string' || assetIds.has(asset.id) || typeof asset.mime !== 'string' || typeof asset.license !== 'string') throw new Error('Effect pack contains an invalid or duplicate asset descriptor.')
    assetIds.add(asset.id)
    if (!['thumbnail', 'overlay', 'texture', 'audio', 'lut'].includes(asset.kind)) throw new Error(`Asset "${asset.id}" has an unsupported kind.`)
    if (asset.data && asset.data.length > 10_000_000) throw new Error(`Embedded asset "${asset.id}" exceeds the 10 MB pack limit.`)
    if (asset.data && !/^data:(image\/|video\/|audio\/|text\/plain|application\/octet-stream)/i.test(asset.data)) throw new Error(`Asset "${asset.id}" has a disallowed embedded data type.`)
    if (asset.externalUrl) {
      let url: URL
      try { url = new URL(asset.externalUrl) } catch { throw new Error(`Asset "${asset.id}" has an invalid URL.`) }
      if (url.protocol !== 'https:') throw new Error(`Asset "${asset.id}" must use an HTTPS URL.`)
    }
  }
  return pack as EffectPack
}
