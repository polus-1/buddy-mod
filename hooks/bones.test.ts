import { describe, expect, test } from 'claude-code/testing'

import {
  BASE_STAT,
  EYES,
  HATS,
  RARITIES,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
  bonesFromSeed,
  bunHash32,
  fnv1a,
  hatchBones,
  hatsFor,
  mulberry32,
  parsePick,
  pickBones,
  seedFor,
  wyhash,
} from './bones'

const UUID = '00000000-0000-4000-8000-000000000000'
const utf8 = (s: string) => new TextEncoder().encode(s)

describe('fnv1a', () => {
  test('matches the published 32-bit FNV-1a vectors', async () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    expect(fnv1a('hello')).toBe(0x4f9f2cab)
  })

  test("hashes UTF-16 code units, as the original's JavaScript branch did", async () => {
    expect(fnv1a('é')).toBe(Math.imul(0x811c9dc5 ^ 0xe9, 0x01000193) >>> 0)
  })
})

describe('wyhash (Bun.hash)', () => {
  test('matches Bun.hash for strings of every length class', async () => {
    const vectors: [string, string][] = [
      ['', '290873116282709081'],
      ['a', '2941419223392617777'],
      ['abc', '190542993387777138'],
      ['abcd', '5251164938674970899'],
      ['abcdefgh', '3692222752269843843'],
      ['abcdefghi', '10740737026755602898'],
      ['hello world', '7389666205914310003'],
      ['abcdefghijklmnop', '14973346930013163285'],
      ['0123456789abcdef0', '18191082444834498672'],
      ['0123456789abcdef0123456789abcdef', '8038481840242983784'],
      ['0123456789abcdef0123456789abcdef0123456789abcdef', '17886251688214560113'],
      ['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', '8954121328453940222'],
      ['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0', '17793036875989679203'],
      ['é', '1783465187472633034'],
      [`${UUID}friend-2026-401`, '9632800676960879379'],
    ]
    for (const [text, want] of vectors) expect(wyhash(utf8(text)).toString()).toBe(want)
  })

  test('the 32-bit seed is the low word, as Number(BigInt(Bun.hash(s)) & 0xffffffffn)', async () => {
    expect(bunHash32('abc')).toBe(3411111026)
    expect(bunHash32(`${UUID}friend-2026-401`)).toBe(3462742803)
    expect(seedFor(UUID)).toBe(3462742803)
    expect(seedFor(UUID, 'bun')).toBe(3462742803)
    expect(seedFor(UUID, 'fnv1a')).toBe(3980629120)
  })
})

describe('mulberry32', () => {
  test('matches the reference sequence for known seeds', async () => {
    const one = mulberry32(1)
    expect(one()).toBe(0.6270739405881613)
    expect(one()).toBe(0.002735721180215478)
    expect(one()).toBe(0.5274470399599522)
    const beef = mulberry32(0xdeadbeef)
    expect(beef()).toBe(0.9413696140982211)
    expect(beef()).toBe(0.26719574979506433)
    const zero = mulberry32(0)
    expect(zero()).toBe(0.26642920868471265)
  })

  test('stays within [0, 1)', async () => {
    const rand = mulberry32(42)
    for (let i = 0; i < 10_000; i++) {
      const r = rand()
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    }
  })
})

describe('hatching', () => {
  test('a fixed uuid yields a fixed buddy under either hash', async () => {
    const a = hatchBones(UUID)
    expect(a).toEqual(hatchBones(UUID))
    expect(a).toEqual(bonesFromSeed(3462742803))
    expect(hatchBones(UUID, 'fnv1a')).toEqual(bonesFromSeed(3980629120))
    expect(SPECIES).toContain(a.species)
    expect(RARITIES).toContain(a.rarity)
    expect(Number.isInteger(a.inspirationSeed)).toBe(true)
    expect(a.inspirationSeed).toBeGreaterThanOrEqual(0)
    expect(a.inspirationSeed).toBeLessThan(1e9)
  })

  test('the roll order is rarity, species, eye, hat, shiny, stats, inspiration (pinned by hand)', async () => {
    // mulberry32(7)'s stream, read off in the original's order:
    const rand = mulberry32(7)
    const draw = rand()
    let remaining = draw * 100
    let rarity = 'common'
    for (const r of RARITIES) {
      remaining -= RARITY_WEIGHTS[r]
      if (remaining < 0) {
        rarity = r
        break
      }
    }
    const species = SPECIES[Math.floor(rand() * 18)]
    const eyes = EYES[Math.floor(rand() * 6)]
    const hat = rarity === 'common' ? 'none' : HATS[Math.floor(rand() * 8)]
    const shiny = rand() < 0.01
    const b = bonesFromSeed(7)
    expect(b.rarity).toBe(rarity)
    expect(b.species).toBe(species)
    expect(b.eyes).toBe(eyes)
    expect(b.hat).toBe(hat)
    expect(b.shiny).toBe(shiny)
  })

  test('different uuids give different buddies', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(JSON.stringify(hatchBones(`uuid-${i}`)))
    expect(seen.size).toBeGreaterThan(150)
  })

  test('100,000 seeds land within 1 point of 60/25/10/4/1 and 1% shiny', { timeoutMs: 30_000 }, async () => {
    const N = 100_000
    const counts: Record<string, number> = {}
    let shiny = 0
    for (let seed = 0; seed < N; seed++) {
      const b = bonesFromSeed((seed * 2654435761) >>> 0)
      counts[b.rarity] = (counts[b.rarity] ?? 0) + 1
      if (b.shiny) shiny++
    }
    for (const rarity of RARITIES) {
      const pct = (100 * (counts[rarity] ?? 0)) / N
      expect(Math.abs(pct - RARITY_WEIGHTS[rarity])).toBeLessThanOrEqual(1)
    }
    expect(Math.abs((100 * shiny) / N - 1)).toBeLessThanOrEqual(1)
  })

  test('species and eyes are uniform over all 18 and all 6, whatever the rarity', { timeoutMs: 30_000 }, async () => {
    const N = 36_000
    const perSpecies: Record<string, number> = {}
    const perEye: Record<string, number> = {}
    const legendarySpecies = new Set<string>()
    for (let seed = 0; seed < N; seed++) {
      const b = bonesFromSeed(seed)
      perSpecies[b.species] = (perSpecies[b.species] ?? 0) + 1
      perEye[b.eyes] = (perEye[b.eyes] ?? 0) + 1
      if (b.rarity === 'legendary') legendarySpecies.add(b.species)
    }
    for (const s of SPECIES) expect(Math.abs((perSpecies[s] ?? 0) / N - 1 / 18)).toBeLessThan(0.01)
    for (const e of EYES) expect(Math.abs((perEye[e] ?? 0) / N - 1 / 6)).toBeLessThan(0.01)
    expect(legendarySpecies.size).toBeGreaterThan(5)
  })

  test('hats: none for Common, any of the eight otherwise', { timeoutMs: 30_000 }, async () => {
    expect(hatsFor('common')).toEqual(['none'])
    expect(hatsFor('legendary')).toEqual(HATS)
    const seenHats = new Set<string>()
    for (let seed = 0; seed < 20_000; seed++) {
      const b = bonesFromSeed(seed)
      if (b.rarity === 'common') expect(b.hat).toBe('none')
      else seenHats.add(b.hat)
    }
    expect([...seenHats].sort()).toEqual([...HATS].sort())
  })

  test('every stat is in the original range: peak, dump, three others', { timeoutMs: 30_000 }, async () => {
    for (let seed = 0; seed < 10_000; seed++) {
      const b = bonesFromSeed((seed * 2654435761) >>> 0)
      const base = BASE_STAT[b.rarity]
      expect(b.peak).not.toBe(b.dump)
      for (const name of STAT_NAMES) {
        const v = b.stats[name]
        expect(Number.isInteger(v)).toBe(true)
        if (name === b.peak) {
          expect(v).toBeGreaterThanOrEqual(Math.min(100, base + 50))
          expect(v).toBeLessThanOrEqual(Math.min(100, base + 79))
        } else if (name === b.dump) {
          expect(v).toBeGreaterThanOrEqual(Math.max(1, base - 10))
          expect(v).toBeLessThanOrEqual(Math.max(1, base + 4))
        } else {
          expect(v).toBeGreaterThanOrEqual(base)
          expect(v).toBeLessThanOrEqual(base + 39)
        }
      }
    }
  })
})

describe('pick mode', () => {
  test('a pick is deterministic and keeps what was given', async () => {
    const a = pickBones({ species: 'ghost', rarity: 'rare', eyes: '@', hat: 'halo', shiny: true })
    expect(a).toEqual(pickBones({ species: 'ghost', rarity: 'rare', eyes: '@', hat: 'halo', shiny: true }))
    expect(a.rarity).toBe('rare')
    expect(a.eyes).toBe('@')
    expect(a.hat).toBe('halo')
    expect(a.shiny).toBe(true)
  })

  test('the rolled fields do not change when another field is given', async () => {
    const plain = pickBones({ species: 'ghost' })
    const shiny = pickBones({ species: 'ghost', shiny: true })
    expect({ ...shiny, shiny: false }).toEqual(plain)
    const hatted = pickBones({ species: 'ghost', hat: 'crown' })
    expect({ ...hatted, hat: plain.hat }).toEqual(plain)
  })

  test('a Common buddy wears no hat whatever was asked', async () => {
    expect(pickBones({ species: 'duck', rarity: 'common', hat: 'crown' }).hat).toBe('none')
    expect(pickBones({ species: 'chonk', rarity: 'legendary', hat: 'tinyduck' }).hat).toBe('tinyduck')
    expect(pickBones({ species: 'ghost', rarity: 'rare', hat: 'tinyduck' }).hat).toBe('tinyduck')
  })

  test('parsePick reads species then options in any order', async () => {
    const r = parsePick('Owl legendary round top-hat shiny')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pick).toEqual({ species: 'owl', rarity: 'legendary', eyes: '◉', hat: 'tophat', shiny: true })
    const quoted = parsePick('robot "propeller cap" star')
    expect(quoted.ok).toBe(true)
    if (quoted.ok) expect(quoted.pick).toEqual({ species: 'robot', hat: 'propeller', eyes: '✦' })
    const glyph = parsePick('cat ◉ tinyduck')
    expect(glyph.ok).toBe(true)
    if (glyph.ok) expect(glyph.pick).toEqual({ species: 'cat', eyes: '◉', hat: 'tinyduck' })
  })

  test('parsePick rejects an unknown species or option', async () => {
    expect(parsePick('').ok).toBe(false)
    expect(parsePick('unicorn').ok).toBe(false)
    const bad = parsePick('duck sparkly')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('sparkly')
  })
})
