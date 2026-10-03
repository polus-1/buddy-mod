// bones.ts: the deterministic half of a buddy. Pure: no `$`, no I/O.
//
// A buddy's *bones* (rarity, species, eyes, hat, shiny, stats) are a pure
// function of the account id, recomputed every session and never stored. The
// pipeline is the original's, as the community forensics of the shipped
// binary record it (BonziClaude, BUDDY_SYSTEM_FORENSICS.md; save-buddy):
//
//   seed  = hash(accountUuid + "friend-2026-401")        32-bit
//   rand  = mulberry32(seed)
//   rolls = rarity, species (all 18), eye (6), hat (8, Common gets none and
//           rolls nothing), shiny (1%), stats (peak, dump, then each value in
//           stat order), inspirationSeed
//
// The hash: the shipped binary ran under Bun and took `Bun.hash(seed) &
// 0xffffffff` (wyhash, seed 0, over the UTF-8 bytes); its FNV-1a branch only
// ran outside Bun. Both are here; `seed_hash` in the plugin's userConfig picks
// one, `bun` by default so a buddy matches what Claude Code itself showed.
// Keep every order and range below as it is: a change changes everyone's buddy.

export const SALT = 'friend-2026-401'

export type SeedHash = 'bun' | 'fnv1a'

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

/** Weighted rarity odds, summing to 100: 60 / 25 / 10 / 4 / 1. */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
}

/** The base stat value per rarity (the original's `Ob4`). */
export const BASE_STAT: Record<Rarity, number> = {
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

/** The 18 species, in the original's index order; every rarity rolls from all of them. */
export const SPECIES = [
  'duck',
  'goose',
  'blob',
  'cat',
  'dragon',
  'octopus',
  'owl',
  'penguin',
  'turtle',
  'snail',
  'ghost',
  'axolotl',
  'capybara',
  'cactus',
  'robot',
  'rabbit',
  'mushroom',
  'chonk',
] as const
export type Species = (typeof SPECIES)[number]

/** The six eye glyphs, in the original's index order. */
export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const
export type Eyes = (typeof EYES)[number]
export const EYE_NAMES: Record<Eyes, string> = {
  '·': 'dot',
  '✦': 'star',
  '×': 'cross',
  '◉': 'fisheye',
  '@': 'spiral',
  '°': 'degree',
}
/** Other spellings `/buddy pick` accepts for an eye. */
const EYE_ALIASES: Record<string, Eyes> = {
  dot: '·',
  star: '✦',
  cross: '×',
  x: '×',
  closed: '×',
  fisheye: '◉',
  round: '◉',
  o: '◉',
  spiral: '@',
  at: '@',
  degree: '°',
  minimalist: '°',
}

/** The eight hats, in the original's index order; Common always gets `none`. */
export const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'] as const
export type Hat = (typeof HATS)[number]
export const HAT_LABELS: Record<Hat, string> = {
  none: 'none',
  crown: 'crown',
  tophat: 'top hat',
  propeller: 'propeller cap',
  halo: 'halo',
  wizard: 'wizard hat',
  beanie: 'beanie',
  tinyduck: 'tiny duck',
}

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STAT_NAMES)[number]
export type Stats = Record<StatName, number>

export type Bones = {
  rarity: Rarity
  species: Species
  eyes: Eyes
  hat: Hat
  shiny: boolean
  stats: Stats
  /** The stat rolled high (`base + 50 + rand(0..29)`, capped at 100). */
  peak: StatName
  /** The stat rolled low (`base - 10 + rand(0..14)`, floored at 1). */
  dump: StatName
  /** Seeds the four inspiration words of the hatch prompt. */
  inspirationSeed: number
}

// ------------------------------------------------------------------ hashing

/** 32-bit FNV-1a over UTF-16 code units, as the original's JavaScript branch did. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const MASK64 = (1n << 64n) - 1n
const WY0 = 0xa0761d6478bd642fn
const WY1 = 0xe7037ed1a0b428dbn
const WY2 = 0x8ebc6af09c88c6e3n
const WY3 = 0x589965cc75374cc3n

function mum(a: bigint, b: bigint): [bigint, bigint] {
  const r = a * b
  return [r & MASK64, (r >> 64n) & MASK64]
}

function wymix(a: bigint, b: bigint): bigint {
  const [lo, hi] = mum(a, b)
  return lo ^ hi
}

function read8(b: Uint8Array, p: number): bigint {
  let v = 0n
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[p + i] ?? 0)
  return v
}

function read4(b: Uint8Array, p: number): bigint {
  return BigInt(((b[p] ?? 0) | ((b[p + 1] ?? 0) << 8) | ((b[p + 2] ?? 0) << 16) | ((b[p + 3] ?? 0) << 24)) >>> 0)
}

function read3(b: Uint8Array, p: number, k: number): bigint {
  return (BigInt(b[p] ?? 0) << 16n) | (BigInt(b[p + (k >> 1)] ?? 0) << 8n) | BigInt(b[p + k - 1] ?? 0)
}

/** wyhash (final version 4, the default secret), what `Bun.hash` computes. */
export function wyhash(bytes: Uint8Array, seed = 0n): bigint {
  const len = bytes.length
  seed ^= wymix(seed ^ WY0, WY1)
  let a: bigint
  let b: bigint
  if (len <= 16) {
    if (len >= 4) {
      a = (read4(bytes, 0) << 32n) | read4(bytes, (len >> 3) << 2)
      b = (read4(bytes, len - 4) << 32n) | read4(bytes, len - 4 - ((len >> 3) << 2))
    } else if (len > 0) {
      a = read3(bytes, 0, len)
      b = 0n
    } else {
      a = 0n
      b = 0n
    }
  } else {
    let i = len
    let p = 0
    if (i > 48) {
      let see1 = seed
      let see2 = seed
      do {
        seed = wymix(read8(bytes, p) ^ WY1, read8(bytes, p + 8) ^ seed)
        see1 = wymix(read8(bytes, p + 16) ^ WY2, read8(bytes, p + 24) ^ see1)
        see2 = wymix(read8(bytes, p + 32) ^ WY3, read8(bytes, p + 40) ^ see2)
        p += 48
        i -= 48
      } while (i > 48)
      seed ^= see1 ^ see2
    }
    while (i > 16) {
      seed = wymix(read8(bytes, p) ^ WY1, read8(bytes, p + 8) ^ seed)
      i -= 16
      p += 16
    }
    a = read8(bytes, len - 16)
    b = read8(bytes, len - 8)
  }
  a ^= WY1
  b ^= seed
  const [lo, hi] = mum(a, b)
  return wymix(lo ^ WY0 ^ BigInt(len), hi ^ WY1)
}

/** `Number(BigInt(Bun.hash(text)) & 0xffffffffn)`: the shipped binary's seed hash. */
export function bunHash32(text: string): number {
  return Number(wyhash(new TextEncoder().encode(text)) & 0xffffffffn)
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

export function seedFor(accountUuid: string, hash: SeedHash = 'bun'): number {
  const text = accountUuid + SALT
  return hash === 'fnv1a' ? fnv1a(text) : bunHash32(text)
}

// -------------------------------------------------------------------- rolls

type Rand = () => number

function pick<T>(rand: Rand, list: readonly T[]): T {
  const item = list[Math.floor(rand() * list.length)]
  if (item === undefined) throw new Error('pick from an empty list')
  return item
}

/** Weighted draw: subtract each weight in rarity order until the draw goes negative. */
function rollRarity(rand: Rand): Rarity {
  const total = RARITIES.reduce((sum, r) => sum + RARITY_WEIGHTS[r], 0)
  let remaining = rand() * total
  for (const rarity of RARITIES) {
    remaining -= RARITY_WEIGHTS[rarity]
    if (remaining < 0) return rarity
  }
  return 'common'
}

/** Hats a buddy of this rarity may wear: Common never; every other rarity any of the eight. */
export function hatsFor(rarity: Rarity): readonly Hat[] {
  return rarity === 'common' ? ['none'] : HATS
}

/**
 * Five stats on 1-100: a peak (`base + 50 + rand(0..29)`, capped at 100), a
 * dump (`base - 10 + rand(0..14)`, floored at 1, re-rolled while it lands on
 * the peak) and three others (`base + rand(0..39)`), values in stat order.
 */
function rollStats(rand: Rand, rarity: Rarity): Pick<Bones, 'stats' | 'peak' | 'dump'> {
  const base = BASE_STAT[rarity]
  const peak = pick(rand, STAT_NAMES)
  let dump = pick(rand, STAT_NAMES)
  while (dump === peak) dump = pick(rand, STAT_NAMES)
  const stats = {} as Stats
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, base + 50 + Math.floor(rand() * 30))
    else if (name === dump) stats[name] = Math.max(1, base - 10 + Math.floor(rand() * 15))
    else stats[name] = base + Math.floor(rand() * 40)
  }
  return { stats, peak, dump }
}

/** Bones from a seed, rolls in the original order. */
export function bonesFromSeed(seed: number): Bones {
  const rand = mulberry32(seed)
  const rarity = rollRarity(rand)
  const species = pick(rand, SPECIES)
  const eyes = pick(rand, EYES)
  const hat: Hat = rarity === 'common' ? 'none' : pick(rand, HATS)
  const shiny = rand() < 0.01
  const rolled = rollStats(rand, rarity)
  const inspirationSeed = Math.floor(rand() * 1e9)
  return { rarity, species, eyes, hat, shiny, ...rolled, inspirationSeed }
}

/** `hatch` mode: the buddy an account id hatches. */
export function hatchBones(accountUuid: string, hash: SeedHash = 'bun'): Bones {
  return bonesFromSeed(seedFor(accountUuid, hash))
}

export type Pick_ = {
  species: Species
  rarity?: Rarity
  eyes?: Eyes
  hat?: Hat
  shiny?: boolean
}

/**
 * `pick` mode: bones set by hand. Every roll is still made, from a seed
 * derived from the species, and the given fields override the rolled ones,
 * so the same species always rolls the same stats whatever else is given.
 * A Common buddy wears no hat whatever was asked.
 */
export function pickBones(picked: Pick_): Bones {
  const rand = mulberry32(fnv1a('pick:' + picked.species + SALT))
  const rarity = picked.rarity ?? rollRarity(rand)
  if (picked.rarity !== undefined) rand()
  const rolledEyes = pick(rand, EYES)
  const rolledHat = pick(rand, HATS)
  const rolledShiny = rand() < 0.01
  const rolled = rollStats(rand, rarity)
  const inspirationSeed = Math.floor(rand() * 1e9)
  const hat: Hat = rarity === 'common' ? 'none' : (picked.hat ?? rolledHat)
  return {
    rarity,
    species: picked.species,
    eyes: picked.eyes ?? rolledEyes,
    hat,
    shiny: picked.shiny ?? rolledShiny,
    ...rolled,
    inspirationSeed,
  }
}

// ------------------------------------------------------------------ parsing

function normalizeHat(token: string): Hat | undefined {
  const flat = token.toLowerCase().replace(/[\s_-]+/g, '')
  const byId = HATS.find(h => h === flat)
  if (byId !== undefined) return byId
  return (Object.keys(HAT_LABELS) as Hat[]).find(h => HAT_LABELS[h].replace(/\s+/g, '') === flat)
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
    const eyes = EYES.find(e => e === token) ?? EYE_ALIASES[lower]
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
      error: `Unknown option "${token}". Rarity: ${RARITIES.join(', ')}. Eyes: ${Object.values(EYE_NAMES).join(', ')}. Hats: ${Object.values(HAT_LABELS).join(', ')}. Or "shiny".`,
    }
  }
  return { ok: true, pick }
}

export function isSpecies(value: unknown): value is Species {
  return typeof value === 'string' && (SPECIES as readonly string[]).includes(value)
}
