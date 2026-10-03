// bones.ts: the deterministic half of a buddy. Pure: no `$`, no I/O.
//
// A buddy's *bones* (species, rarity, shiny, eyes, hat, stats) are a pure
// function of the account id, recomputed every session and never stored:
//   FNV-1a(accountUuid + SALT) seeds Mulberry32, and the rolls are drawn in a
//   fixed order: rarity, species, shiny, eyes, hat, stats (peak, dump, scatter).
// Keep that order: changing it changes everyone's buddy.

export const SALT = 'friend-2026-401'

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const SPECIES_BY_RARITY = {
  common: ['duck', 'goose', 'blob', 'cat', 'dragon', 'octopus'],
  uncommon: ['owl', 'penguin', 'turtle', 'snail'],
  rare: ['ghost', 'axolotl', 'capybara'],
  epic: ['cactus', 'robot', 'rabbit'],
  legendary: ['mushroom', 'chonk'],
} as const satisfies Record<Rarity, readonly string[]>

export type Species = (typeof SPECIES_BY_RARITY)[Rarity][number]

export const SPECIES: readonly Species[] = RARITIES.flatMap(r => [...SPECIES_BY_RARITY[r]])

/** Cumulative rarity odds on one `rand()`: 60 / 25 / 10 / 4 / 1. */
export const RARITY_ODDS: Record<Rarity, number> = {
  common: 0.6,
  uncommon: 0.25,
  rare: 0.1,
  epic: 0.04,
  legendary: 0.01,
}

export const STAT_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
}

export const STARS: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
}

export const EYES = ['·', '*', 'x', 'o', '@', '^'] as const
export type Eyes = (typeof EYES)[number]
export const EYE_NAMES: Record<Eyes, string> = {
  '·': 'dot',
  '*': 'star',
  x: 'closed',
  o: 'round',
  '@': 'spiral',
  '^': 'minimalist',
}

export const HATS = [
  'none',
  'crown',
  'top hat',
  'propeller cap',
  'halo',
  'wizard hat',
  'beanie',
  'tiny duck',
] as const
export type Hat = (typeof HATS)[number]

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STAT_NAMES)[number]
export type Stats = Record<StatName, number>

export type Bones = {
  species: Species
  rarity: Rarity
  shiny: boolean
  eyes: Eyes
  hat: Hat
  stats: Stats
  /** The stat rolled as the peak (`floor + 50 + rand`, capped at 100). */
  peak: StatName
  /** The stat rolled as the dump (`floor - 10 + rand`, floored at 1). */
  dump: StatName
}

/** 32-bit FNV-1a over the UTF-8 bytes of `text`. */
export function fnv1a(text: string): number {
  const bytes = new TextEncoder().encode(text)
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** Mulberry32: a tiny 32-bit PRNG; `rand()` is uniform on [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFor(accountUuid: string): number {
  return fnv1a(accountUuid + SALT)
}

export function rarityFor(species: Species): Rarity {
  for (const rarity of RARITIES) {
    if ((SPECIES_BY_RARITY[rarity] as readonly string[]).includes(species)) return rarity
  }
  return 'common'
}

/** Hats a buddy of this rarity may wear: Common never, tiny duck Legendary-only. */
export function hatsFor(rarity: Rarity): readonly Hat[] {
  if (rarity === 'common') return ['none']
  if (rarity === 'legendary') return HATS
  return HATS.filter(h => h !== 'tiny duck')
}

type Rand = () => number

function pick<T>(rand: Rand, list: readonly T[]): T {
  const item = list[Math.floor(rand() * list.length)]
  if (item === undefined) throw new Error('pick from an empty list')
  return item
}

function rollRarity(rand: Rand): Rarity {
  const r = rand()
  let edge = 0
  for (const rarity of RARITIES) {
    edge += RARITY_ODDS[rarity]
    if (r < edge) return rarity
  }
  return 'legendary'
}

/**
 * Five stats on 1-100. One peak (`floor + 50 + rand(0..49)`, capped at 100),
 * one dump (`floor - 10 + rand(0..29)`, floored at 1), three scatter
 * (`floor + rand(0..40)`). Rolls: peak index, dump index, then each stat's
 * value in STAT_NAMES order.
 */
function rollStats(rand: Rand, rarity: Rarity): Pick<Bones, 'stats' | 'peak' | 'dump'> {
  const floor = STAT_FLOOR[rarity]
  const peakIdx = Math.floor(rand() * STAT_NAMES.length)
  let dumpIdx = Math.floor(rand() * (STAT_NAMES.length - 1))
  if (dumpIdx >= peakIdx) dumpIdx += 1
  const stats = {} as Stats
  STAT_NAMES.forEach((name, i) => {
    if (i === peakIdx) stats[name] = Math.min(100, floor + 50 + Math.floor(rand() * 50))
    else if (i === dumpIdx) stats[name] = Math.max(1, floor - 10 + Math.floor(rand() * 30))
    else stats[name] = floor + Math.floor(rand() * 41)
  })
  return { stats, peak: STAT_NAMES[peakIdx] as StatName, dump: STAT_NAMES[dumpIdx] as StatName }
}

/** Bones from a seed, rolls in the canonical order. */
export function bonesFromSeed(seed: number): Bones {
  const rand = mulberry32(seed)
  const rarity = rollRarity(rand)
  const species = pick(rand, SPECIES_BY_RARITY[rarity])
  const shiny = rand() < 0.01
  const eyes = pick(rand, EYES)
  const hat = pick(rand, hatsFor(rarity))
  return { species, rarity, shiny, eyes, hat, ...rollStats(rand, rarity) }
}

/** `hatch` mode: the buddy an account id hatches. */
export function hatchBones(accountUuid: string): Bones {
  return bonesFromSeed(seedFor(accountUuid))
}

export type Pick_ = {
  species: Species
  rarity?: Rarity
  eyes?: Eyes
  hat?: Hat
  shiny?: boolean
}

/**
 * `pick` mode: bones set by hand. Anything not given is rolled from the
 * species (deterministically, so the same pick always looks the same).
 */
export function pickBones(picked: Pick_): Bones {
  const rand = mulberry32(fnv1a('pick:' + picked.species + SALT))
  const rarity = picked.rarity ?? rarityFor(picked.species)
  const shiny = picked.shiny ?? rand() < 0.01
  const eyes = picked.eyes ?? pick(rand, EYES)
  const allowed = hatsFor(rarity)
  const hat = picked.hat !== undefined && allowed.includes(picked.hat) ? picked.hat : pick(rand, allowed)
  return { species: picked.species, rarity, shiny, eyes, hat, ...rollStats(rand, rarity) }
}

const EYE_BY_NAME: Record<string, Eyes> = Object.fromEntries(
  (Object.entries(EYE_NAMES) as [Eyes, string][]).map(([glyph, name]) => [name, glyph]),
)

function normalizeHat(token: string): Hat | undefined {
  const flat = token.toLowerCase().replace(/[\s_-]+/g, '')
  return HATS.find(h => h.replace(/\s+/g, '') === flat)
}

export type PickParse = { ok: true; pick: Pick_ } | { ok: false; error: string }

/**
 * Parses `/buddy pick <species> [rarity] [eyes] [hat] [shiny]`. Tokens after
 * the species may come in any order; a two-word hat may be written as one
 * word (`tophat`), hyphenated (`top-hat`) or quoted ("top hat").
 */
export function parsePick(args: string): PickParse {
  const tokens = args.match(/"[^"]*"|'[^']*'|\S+/g)?.map(t => t.replace(/^["']|["']$/g, '')) ?? []
  const [first, ...rest] = tokens
  if (first === undefined) {
    return { ok: false, error: `Usage: /buddy pick <species> [rarity] [eyes] [hat] [shiny]. Species: ${SPECIES.join(', ')}.` }
  }
  const species = SPECIES.find(s => s === first.toLowerCase())
  if (species === undefined) {
    return { ok: false, error: `Unknown species "${first}". Species: ${SPECIES.join(', ')}.` }
  }
  const pick: Pick_ = { species }
  for (const token of rest) {
    const lower = token.toLowerCase()
    const rarity = RARITIES.find(r => r === lower)
    if (rarity !== undefined) {
      pick.rarity = rarity
      continue
    }
    if (lower === 'shiny') {
      pick.shiny = true
      continue
    }
    const eyeGlyph = EYES.find(e => e === token)
    const eyes = eyeGlyph ?? EYE_BY_NAME[lower]
    if (eyes !== undefined) {
      pick.eyes = eyes
      continue
    }
    const hat = normalizeHat(token)
    if (hat !== undefined) {
      pick.hat = hat
      continue
    }
    return {
      ok: false,
      error: `Unknown option "${token}". Rarity: ${RARITIES.join(', ')}. Eyes: ${Object.values(EYE_NAMES).join(', ')}. Hats: ${HATS.join(', ')}. Or "shiny".`,
    }
  }
  return { ok: true, pick }
}

export function isSpecies(value: unknown): value is Species {
  return typeof value === 'string' && (SPECIES as readonly string[]).includes(value)
}
