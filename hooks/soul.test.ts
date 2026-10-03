import { describe, expect, test } from 'claude-code/testing'

import { hatchBones } from './bones'
import type { Bones } from './bones'
import {
  FALLBACK_LINES,
  HATCH_RETRIES,
  MAX_GAP,
  MIN_GAP,
  ReactionGate,
  TurnSchedule,
  ZERO_USAGE,
  defaultSoul,
  fallbackLine,
  hatchSoul,
  nameCall,
  parseHatchReply,
  react,
  sanitizeReply,
  systemPrompt,
} from './soul'
import type { Buddy, Complete, CompleteRequest, CompleteResult, Trigger } from './soul'

const bones: Bones = hatchBones('00000000-0000-4000-8000-000000000000')
const buddy: Buddy = { ...bones, name: 'Testo', personality: 'A test buddy who exists for assertions.', hatchedAt: 0 }
const TRIGGERS: Trigger[] = ['test-fail', 'error', 'big-diff', 'turn', 'pet', 'name-call']

const answering =
  (text: string, calls: CompleteRequest[] = []): Complete =>
  async req => {
    calls.push(req)
    return { isAnswered: true, text, usage: { ...ZERO_USAGE, input_tokens: 10, output_tokens: 5 } }
  }
const failing =
  (reason: 'api-error' | 'empty-reply' | 'aborted', calls: CompleteRequest[] = []): Complete =>
  async req => {
    calls.push(req)
    const result: CompleteResult = { isAnswered: false, reason, usage: ZERO_USAGE }
    return result
  }

describe('hatch reply parsing', () => {
  test('accepts a good reply, capitalises the name and finishes the sentence', async () => {
    const r = parseHatchReply('{"name":"pebble","personality":"A duck who reads every stack trace twice"}')
    expect(r).toEqual({ name: 'Pebble', personality: 'A duck who reads every stack trace twice.' })
  })

  test('tolerates code fences and prose around the JSON', async () => {
    const r = parseHatchReply('Sure!\n```json\n{"name":"Wisp","personality":"A ghost who haunts flaky tests."}\n```')
    expect(r?.name).toBe('Wisp')
  })

  test('rejects a 13-letter name, a two-word name, or a missing personality', async () => {
    expect(parseHatchReply('{"name":"Abcdefghijklm","personality":"A long-named thing that is too long."}')).toBeNull()
    expect(parseHatchReply('{"name":"Two Words","personality":"A thing with two names."}')).toBeNull()
    expect(parseHatchReply('{"name":"Ok"}')).toBeNull()
    expect(parseHatchReply('not json at all')).toBeNull()
    expect(parseHatchReply('{"name":"A","personality":"Too short a name."}')).toBeNull()
  })
})

describe('hatching through the model', () => {
  test('a good first reply hatches without retries', async () => {
    const calls: CompleteRequest[] = []
    const out = await hatchSoul(answering('{"name":"Pebble","personality":"A duck who reads stack traces twice."}', calls), bones, 'haiku')
    expect(out.isDefault).toBe(false)
    expect(out.soul.name).toBe('Pebble')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.model).toBe('haiku')
    expect(calls[0]?.effort).toBe('low')
    expect(out.usage.input_tokens).toBe(10)
  })

  test('three bad shapes fall back to the species default', async () => {
    const calls: CompleteRequest[] = []
    const out = await hatchSoul(answering('{"name":"Abcdefghijklmnop","personality":"Nope."}', calls), bones, 'haiku')
    expect(calls).toHaveLength(HATCH_RETRIES)
    expect(out.isDefault).toBe(true)
    expect(out.soul).toEqual(defaultSoul(bones))
    expect(out.usage.input_tokens).toBe(10 * HATCH_RETRIES)
  })

  test('an api-error retries; an abort stops at once; both end in the default', async () => {
    const errCalls: CompleteRequest[] = []
    const e = await hatchSoul(failing('api-error', errCalls), bones, 'haiku')
    expect(e.isDefault).toBe(true)
    expect(errCalls).toHaveLength(HATCH_RETRIES)
    const abortCalls: CompleteRequest[] = []
    const a = await hatchSoul(failing('aborted', abortCalls), bones, 'haiku')
    expect(a.isDefault).toBe(true)
    expect(abortCalls).toHaveLength(1)
  })
})

describe('reactions', () => {
  test('a mocked api-error produces a canned line for the species and trigger', async () => {
    const out = await react(failing('api-error'), buddy, 'test-fail', 'FAIL x', 'haiku', 0)
    expect(out.isFallback).toBe(true)
    expect(out.line).toBe(FALLBACK_LINES[buddy.species]['test-fail'][0])
    const second = await react(failing('empty-reply'), buddy, 'pet', '', 'haiku', 1)
    expect(second.line).toBe(FALLBACK_LINES[buddy.species].pet[1])
  })

  test('a good reply is sanitised and the system prompt carries the soul', async () => {
    const calls: CompleteRequest[] = []
    const out = await react(answering('**Quack.** That one sank.', calls), buddy, 'error', 'boom', 'haiku', 0)
    expect(out.isFallback).toBe(false)
    expect(out.line).toBe('Quack. That one sank.')
    expect(calls[0]?.system).toBe(systemPrompt(buddy))
    expect(calls[0]?.system).toContain('Testo')
    expect(calls[0]?.system).toContain(buddy.personality)
    expect(calls[0]?.maxTokens).toBe(60)
    expect(calls[0]?.timeoutMs).toBe(8000)
  })

  test('every species has 12 canned lines, two per trigger', async () => {
    for (const species of Object.keys(FALLBACK_LINES) as (keyof typeof FALLBACK_LINES)[]) {
      let n = 0
      for (const trigger of TRIGGERS) {
        const lines = FALLBACK_LINES[species][trigger]
        expect(lines).toHaveLength(2)
        for (const line of lines) {
          n++
          expect(line.split(' ').length).toBeLessThanOrEqual(12)
        }
        expect(fallbackLine(species, trigger, 7)).toBe(lines[1])
      }
      expect(n).toBe(12)
    }
  })
})

describe('sanitizeReply', () => {
  test('strips markdown and quotes and keeps one short line', async () => {
    expect(sanitizeReply('"Quack."')).toBe('Quack.')
    expect(sanitizeReply('`code` and *bold* _it_')).toBe('code and bold it')
    expect(sanitizeReply('   ')).toBeNull()
    expect(sanitizeReply('')).toBeNull()
  })

  test('truncates a reply over 12 words at the first sentence', async () => {
    const long = 'That failed badly. Here is a very long second sentence that goes on and on and on forever.'
    expect(sanitizeReply(long)).toBe('That failed badly.')
    const noSentence = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'
    expect(sanitizeReply(noSentence)).toBe('one two three four five six seven eight nine ten eleven twelve…')
  })
})

describe('name call detection', () => {
  test('matches Name, / Name: / @Name at the start only, case-insensitively', async () => {
    expect(nameCall('Testo, how are you?', 'Testo')).toBe('how are you?')
    expect(nameCall('@testo what do you think', 'Testo')).toBe('what do you think')
    expect(nameCall('testo: hi', 'Testo')).toBe('hi')
    expect(nameCall('Testo', 'Testo')).toBe('')
    expect(nameCall('  @Testo!', 'Testo')).toBe('')
    expect(nameCall('Hey Testo, how are you?', 'Testo')).toBeNull()
    expect(nameCall('fix the bug Testo found', 'Testo')).toBeNull()
    expect(nameCall('Testosterone levels', 'Testo')).toBeNull()
  })
})

describe('reaction gate', () => {
  test('drops a second trigger inside the cooldown and fires a late one when the window opens', async () => {
    const gate = new ReactionGate(30_000)
    expect(gate.offer('turn', 'a', 0)).toBe(true)
    expect(gate.offer('error', 'b', 1_000)).toBe(false) // in flight
    const opens = gate.complete(2_000)
    expect(opens).toBe(32_000)
    expect(gate.offer('error', 'c', 10_000)).toBe(false) // inside the window: dropped
    expect(gate.drain(32_000)).toBeNull() // dropped 22 s ago: too old
    expect(gate.offer('test-fail', 'd', 29_000)).toBe(false)
    expect(gate.drain(32_000)).toEqual({ trigger: 'test-fail', evidence: 'd' }) // within 5 s: fires
    expect(gate.isBusy).toBe(true)
    gate.complete(33_000)
    expect(gate.offer('turn', 'e', 63_000)).toBe(true)
  })

  test('take() marks hatch and name-call as in flight without a cooldown check', async () => {
    const gate = new ReactionGate(30_000)
    gate.complete(0)
    expect(gate.offer('turn', 'x', 1_000)).toBe(false)
    gate.take()
    expect(gate.isBusy).toBe(true)
    gate.reset()
    expect(gate.offer('turn', 'y', 1_000)).toBe(true)
  })
})

describe('turn schedule', () => {
  test('gaps are drawn uniformly from 3 to 7 turns, with a 20% skip', async () => {
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x80000000
    }
    const schedule = new TurnSchedule(rand)
    let fired = 0
    let turns = 0
    let last = 0
    const gaps: number[] = []
    for (let i = 1; i <= 20_000; i++) {
      turns++
      if (schedule.onTurn()) {
        fired++
        gaps.push(i - last)
        last = i
      }
    }
    expect(fired).toBeGreaterThan(0)
    // every gap between reactions is a sum of 3..7 draws, so at least 3
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(MIN_GAP)
    // the mean gap: E[draw] = 5, divided by the 80% fire chance = 6.25
    const mean = turns / fired
    expect(mean).toBeGreaterThan(5.8)
    expect(mean).toBeLessThan(6.7)
    expect(gaps.some(g => g <= MAX_GAP)).toBe(true)
  })

  test('the first reaction never comes before the third turn', async () => {
    // draws read 0 (gap 3) then 0.9 (gap 7); the skip check reads 0.9 (fire)
    const values = [0, 0.9, 0.9]
    let i = 0
    const schedule = new TurnSchedule(() => values[i++ % values.length] ?? 0)
    expect(schedule.turnsUntilNext).toBe(MIN_GAP)
    expect(schedule.onTurn()).toBe(false)
    expect(schedule.onTurn()).toBe(false)
    expect(schedule.onTurn()).toBe(true)
    expect(schedule.turnsUntilNext).toBe(MAX_GAP)
  })
})
