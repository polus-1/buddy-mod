import { describe, expect, test } from 'claude-code/testing'

import {
  EYES,
  HATS,
  RARITIES,
  RARITY_ODDS,
  SPECIES,
  SPECIES_BY_RARITY,
  STAT_FLOOR,
  STAT_NAMES,
  bonesFromSeed,
  fnv1a,
  hatchBones,
  hatsFor,
  mulberry32,
  parsePick,
  pickBones,
  rarityFor,
  seedFor,
} from './bones'

describe('fnv1a', () => {
  test('matches the published 32-bit FNV-1a vectors', async () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    expect(fnv1a('hello')).toBe(0x4f9f2cab)
  })

  test('hashes UTF-8 bytes, not UTF-16 code units', async () => {
    expect(fnv1a('é')).toBe(fnv1a('é'))
    expect(fnv1a('é')).not.toBe(fnv1a('e'))
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
  test('a fixed uuid yields a fixed buddy', async () => {
    const uuid = '00000000-0000-4000-8000-000000000000'
    expect(seedFor(uuid)).toBe(3980629120)
    const a = hatchBones(uuid)
    const b = hatchBones(uuid)
    expect(a).toEqual(b)
    expect(SPECIES).toContain(a.species)
    expect(RARITIES).toContain(a.rarity)
    expect(rarityFor(a.species)).toBe(a.rarity)
  })

  test('different uuids give different buddies', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const b = hatchBones(`uuid-${i}`)
      seen.add(JSON.stringify(b))
    }
    expect(seen.size).toBeGreaterThan(150)
  })

  test('100,000 seeds land within 1 point of 60/25/10/4/1 and 1% shiny', { timeoutMs: 30_000 }, async () => {
    const N = 100_000
    const counts: Record<string, number> = {}
    let shiny = 0
    for (let seed = 0; seed < N; seed++) {
      const b = bonesFromSeed(seed * 2654435761 >>> 0)
      counts[b.rarity] = (counts[b.rarity] ?? 0) + 1
      if (b.shiny) shiny++
    }
    for (const rarity of RARITIES) {
      const pct = (100 * (counts[rarity] ?? 0)) / N
      expect(Math.abs(pct - RARITY_ODDS[rarity] * 100)).toBeLessThanOrEqual(1)
    }
    expect(Math.abs((100 * shiny) / N - 1)).toBeLessThanOrEqual(1)
  })

  test('species is uniform within its tier and never outside it', { timeoutMs: 30_000 }, async () => {
    const perSpecies: Record<string, number> = {}
    for (let seed = 0; seed < 50_000; seed++) {
      const b = bonesFromSeed(seed)
      expect(SPECIES_BY_RARITY[b.rarity]).toContain(b.species)
      perSpecies[b.species] = (perSpecies[b.species] ?? 0) + 1
    }
    for (const s of SPECIES) expect(perSpecies[s] ?? 0).toBeGreaterThan(0)
  })

  test('hats are gated by rarity: none for Common, tiny duck for Legendary only', { timeoutMs: 30_000 }, async () => {
    expect(hatsFor('common')).toEqual(['none'])
    expect(hatsFor('legendary')).toEqual(HATS)
    expect(hatsFor('rare')).not.toContain('tiny duck')
    for (let seed = 0; seed < 20_000; seed++) {
      const b = bonesFromSeed(seed)
      expect(hatsFor(b.rarity)).toContain(b.hat)
      expect(EYES).toContain(b.eyes)
    }
  })

  test('every stat is in range: one peak, one dump, three scatter', { timeoutMs: 30_000 }, async () => {
    for (let seed = 0; seed < 10_000; seed++) {
      const b = bonesFromSeed(seed * 2654435761 >>> 0)
      const floor = STAT_FLOOR[b.rarity]
      expect(b.peak).not.toBe(b.dump)
      for (const name of STAT_NAMES) {
        const v = b.stats[name]
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(100)
        if (name === b.peak) {
          expect(v).toBeGreaterThanOrEqual(Math.min(100, floor + 50))
        } else if (name === b.dump) {
          expect(v).toBeLessThanOrEqual(Math.max(1, floor + 19))
          expect(v).toBeLessThanOrEqual(69)
        } else {
          expect(v).toBeGreaterThanOrEqual(floor)
          expect(v).toBeLessThanOrEqual(floor + 40)
        }
      }
    }
  })
})

describe('pick mode', () => {
  test('a pick is deterministic and keeps what was given', async () => {
    const a = pickBones({ species: 'ghost', eyes: '@', hat: 'halo', shiny: true })
    const b = pickBones({ species: 'ghost', eyes: '@', hat: 'halo', shiny: true })
    expect(a).toEqual(b)
    expect(a.rarity).toBe('rare')
    expect(a.eyes).toBe('@')
    expect(a.hat).toBe('halo')
    expect(a.shiny).toBe(true)
  })

  test('a hat the rarity forbids is re-rolled from the allowed list', async () => {
    expect(pickBones({ species: 'duck', hat: 'crown' }).hat).toBe('none')
    expect(pickBones({ species: 'ghost', hat: 'tiny duck' }).hat).not.toBe('tiny duck')
    expect(pickBones({ species: 'chonk', hat: 'tiny duck' }).hat).toBe('tiny duck')
  })

  test('parsePick reads species then options in any order', async () => {
    const r = parsePick('Owl legendary round top-hat shiny')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pick).toEqual({ species: 'owl', rarity: 'legendary', eyes: 'o', hat: 'top hat', shiny: true })
    }
    const quoted = parsePick('robot "propeller cap" *')
    expect(quoted.ok).toBe(true)
    if (quoted.ok) expect(quoted.pick).toEqual({ species: 'robot', hat: 'propeller cap', eyes: '*' })
  })

  test('parsePick rejects an unknown species or option', async () => {
    expect(parsePick('').ok).toBe(false)
    expect(parsePick('unicorn').ok).toBe(false)
    const bad = parsePick('duck sparkly')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('sparkly')
  })
})
