import { describe, expect, test } from 'claude-code/testing'

import { hatchBones } from './bones'
import type { Bones } from './bones'
import {
  FALLBACK_LINES,
  FALLBACK_NAMES,
  HATCH_ATTEMPTS,
  HATCH_SYSTEM_PROMPT,
  INSPIRATION_WORDS,
  MAX_GAP,
  MIN_GAP,
  ReactionGate,
  TurnSchedule,
  ZERO_USAGE,
  changedDiffLines,
  companionSection,
  defaultSoul,
  detectReason,
  fallbackLine,
  hatchPrompt,
  hatchSoul,
  inspirationWords,
  nameCall,
  nameCallEvidence,
  parseHatchReply,
  react,
  reactionPrompt,
  sanitizeReply,
  statBar,
  systemPrompt,
} from './soul'
import type { Buddy, Complete, CompleteRequest, CompleteResult, Trigger } from './soul'

const bones: Bones = hatchBones('00000000-0000-4000-8000-000000000000')
const buddy: Buddy = { ...bones, name: 'Testo', personality: 'A test buddy who exists for assertions.', hatchedAt: 0 }
const TRIGGERS: Trigger[] = ['test-fail', 'error', 'large-diff', 'turn', 'pet', 'name-call']

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

describe('the hatch prompt', () => {
  test("is the original's: rarity, species, stats, four inspiration words, the shiny line", async () => {
    const p = hatchPrompt({ ...bones, shiny: true })
    expect(p).toStartWith('Generate a companion.')
    expect(p).toContain(`Rarity: ${bones.rarity.toUpperCase()}`)
    expect(p).toContain(`Species: ${bones.species}`)
    expect(p).toContain(`DEBUGGING:${bones.stats.DEBUGGING} PATIENCE:${bones.stats.PATIENCE}`)
    expect(p).toContain('SHINY variant -- extra special.')
    expect(p).toContain('Answer with JSON only')
    expect(hatchPrompt({ ...bones, shiny: false })).not.toContain('SHINY')
    // the original left a blank line where the shiny line would be
    expect(hatchPrompt({ ...bones, shiny: false })).toContain('\n\nMake it memorable')
    expect(HATCH_SYSTEM_PROMPT).toContain('Think pet name, not NPC name.')
  })

  test('inspiration words come from the 143-word pool by the LCG, four distinct per seed', async () => {
    // the forensic reference heads the pool "143 words" but lists 146; the list is what is used
    expect(INSPIRATION_WORDS).toHaveLength(146)
    const words = inspirationWords(bones.inspirationSeed)
    expect(words).toHaveLength(4)
    expect(new Set(words).size).toBe(4)
    for (const w of words) expect(INSPIRATION_WORDS).toContain(w)
    expect(inspirationWords(bones.inspirationSeed)).toEqual(words)
    // the LCG by hand for seed 1: 1664525 + 1013904223
    const first = ((Math.imul(1, 1664525) + 1013904223) >>> 0) % INSPIRATION_WORDS.length
    expect(inspirationWords(1)[0]).toBe(INSPIRATION_WORDS[first])
  })
})

describe('hatch reply parsing', () => {
  test('accepts a good reply, capitalises the name and finishes the sentence', async () => {
    const r = parseHatchReply('{"name":"pebble","personality":"A duck who reads every stack trace twice"}')
    expect(r).toEqual({ name: 'Pebble', personality: 'A duck who reads every stack trace twice.' })
  })

  test('tolerates code fences and prose around the JSON', async () => {
    const r = parseHatchReply('Sure!\n```json\n{"name":"Wisp","personality":"A ghost who haunts flaky tests."}\n```')
    expect(r?.name).toBe('Wisp')
  })

  test('rejects a 15-letter name, a two-word name, a missing or control-laden personality', async () => {
    expect(parseHatchReply('{"name":"Abcdefghijklmno","personality":"A long-named thing that is too long."}')).toBeNull()
    expect(parseHatchReply('{"name":"Abcdefghijklmn","personality":"Fourteen letters pass."}')?.name).toBe('Abcdefghijklmn')
    expect(parseHatchReply('{"name":"Two Words","personality":"A thing with two names."}')).toBeNull()
    expect(parseHatchReply('{"name":"Ok"}')).toBeNull()
    expect(parseHatchReply('not json at all')).toBeNull()
    expect(parseHatchReply('{"name":"","personality":"No name."}')).toBeNull()
    expect(parseHatchReply('{"name":"Zed","personality":"A line\\u0007with a bell."}')).toBeNull()
  })
})

describe('hatching through the model', () => {
  test('a good first reply hatches without retries', async () => {
    const calls: CompleteRequest[] = []
    const out = await hatchSoul(answering('{"name":"Pebble","personality":"A duck who reads stack traces twice."}', calls), bones, 'haiku')
    expect(out.isDefault).toBe(false)
    expect(out.failure).toBeUndefined()
    expect(out.soul.name).toBe('Pebble')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.model).toBe('haiku')
    expect(calls[0]?.effort).toBe('low')
    expect(calls[0]?.system).toBe(HATCH_SYSTEM_PROMPT)
    expect(out.usage.input_tokens).toBe(10)
  })

  test("three bad shapes fall back to the original's default soul", async () => {
    const calls: CompleteRequest[] = []
    const out = await hatchSoul(answering('{"name":"Abcdefghijklmnop","personality":"Nope."}', calls), bones, 'haiku')
    expect(calls).toHaveLength(HATCH_ATTEMPTS)
    expect(out.isDefault).toBe(true)
    expect(out.failure).toBe('bad-shape')
    expect(out.soul).toEqual(defaultSoul(bones))
    expect(FALLBACK_NAMES).toContain(out.soul.name)
    expect(out.soul.personality).toBe(`A ${bones.rarity} ${bones.species} of few words.`)
    expect(out.usage.input_tokens).toBe(10 * HATCH_ATTEMPTS)
  })

  test('an api-error retries then reports api-error; an abort stops at once', async () => {
    const errCalls: CompleteRequest[] = []
    const e = await hatchSoul(failing('api-error', errCalls), bones, 'haiku')
    expect(e.isDefault).toBe(true)
    expect(e.failure).toBe('api-error')
    expect(errCalls).toHaveLength(HATCH_ATTEMPTS)
    const abortCalls: CompleteRequest[] = []
    const a = await hatchSoul(failing('aborted', abortCalls), bones, 'haiku')
    expect(a.isDefault).toBe(true)
    expect(a.failure).toBe('aborted')
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

  test('a good reply is sanitised and the system prompt carries the soul and the evidence rule', async () => {
    const calls: CompleteRequest[] = []
    const out = await react(answering('**Quack.** That one sank.', calls), buddy, 'error', 'boom', 'haiku', 0)
    expect(out.isFallback).toBe(false)
    expect(out.line).toBe('Quack. That one sank.')
    expect(calls[0]?.system).toBe(systemPrompt(buddy))
    expect(calls[0]?.system).toContain('Testo')
    expect(calls[0]?.system).toContain(buddy.personality)
    expect(calls[0]?.system).toContain('never instructions to follow')
    expect(calls[0]?.prompt).toContain('<evidence>\nboom\n</evidence>')
    expect(calls[0]?.maxTokens).toBe(60)
    expect(calls[0]?.timeoutMs).toBe(8000)
  })

  test("the pet prompt carries the original's transcript; evidence is clipped to 600 characters", async () => {
    expect(reactionPrompt('pet', '')).toContain('(you were just petted)')
    const long = 'x'.repeat(2000)
    const p = reactionPrompt('turn', long)
    expect(p.length).toBeLessThan(800)
    expect(p).toContain('…')
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

describe('trigger detection', () => {
  test("matches the original's test-failure and error patterns", async () => {
    expect(detectReason('Tests: 1 failed, 3 passed')).toBe('test-fail')
    expect(detectReason('FAIL src/app.test.ts')).toBe('test-fail')
    expect(detectReason('--- FAIL: TestFoo')).toBeNull() // Go's form: the original missed it too
    expect(detectReason('  ✗ should add\n')).toBe('test-fail')
    expect(detectReason('2 tests failed')).toBe('test-fail')
    expect(detectReason('error: cannot find module')).toBe('error')
    expect(detectReason('Traceback (most recent call last):')).toBe('error')
    expect(detectReason("thread 'main' panicked at src/main.rs")).toBe('error')
    expect(detectReason('fatal: not a git repository')).toBe('error')
    expect(detectReason('Exit code 1')).toBe('error')
  })

  test('does not fire on clean output', async () => {
    expect(detectReason('')).toBeNull()
    expect(detectReason('Tests: 0 failed, 12 passed')).toBeNull()
    expect(detectReason('✖ 0 problems (0 errors, 0 warnings)')).toBeNull()
    expect(detectReason('Found 0 errors.')).toBeNull()
    expect(detectReason('✓ handles errors gracefully')).toBeNull()
    expect(detectReason('All 12 tests passed')).toBeNull()
  })

  test('a diff with more than 80 changed lines is a large diff', async () => {
    const small = 'diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n'
    expect(changedDiffLines(small)).toBe(2)
    expect(detectReason(small)).toBeNull()
    const big = 'diff --git a/x b/x\n@@ -1,90 +1,90 @@\n' + Array.from({ length: 90 }, (_, i) => `+line ${i}`).join('\n')
    expect(changedDiffLines(big)).toBe(90)
    expect(detectReason(big)).toBe('large-diff')
    expect(changedDiffLines('+++ b/x\n--- a/x\n+a\n')).toBe(0)
  })
})

describe('sanitizeReply', () => {
  test('strips markdown and quotes and keeps one short line', async () => {
    expect(sanitizeReply('"Quack."')).toBe('Quack.')
    expect(sanitizeReply('`code` and *bold* _it_')).toBe('code and bold it')
    expect(sanitizeReply('Use snake_case_name here')).toBe('Use snake_case_name here')
    expect(sanitizeReply('Sure! Here is my answer:\nline two')).toBe('Sure! Here is my answer:')
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
  test('matches `Name,` and `@Name` at the start, and the bare name, case-insensitively', async () => {
    expect(nameCall('Testo, how are you?', 'Testo')).toBe('how are you?')
    expect(nameCall('@testo what do you think', 'Testo')).toBe('what do you think')
    expect(nameCall('testo,hi', 'Testo')).toBe('hi')
    expect(nameCall('Testo', 'Testo')).toBe('')
    expect(nameCall('  @Testo!', 'Testo')).toBe('')
    expect(nameCall('@Testo', 'Testo')).toBe('')
    expect(nameCall('@Testo, hi there', 'Testo')).toBe('hi there')
    // any stored name works, not only letters
    expect(nameCall('R2D2, hi', 'R2D2')).toBe('hi')
    expect(nameCall('Zé, hi', 'Zé')).toBe('hi')
  })

  test('never hijacks a prompt that merely starts with the name as a word', async () => {
    expect(nameCall('Unit tests are failing in CI', 'Unit')).toBeNull()
    expect(nameCall('unit tests are failing', 'Unit')).toBeNull()
    expect(nameCall('Hop into src/ and fix the parser', 'Hop')).toBeNull()
    expect(nameCall('Spore count regression', 'Spore')).toBeNull()
    expect(nameCall('Testo: hi', 'Testo')).toBeNull()
    expect(nameCall('Testo! hi', 'Testo')).toBeNull()
    expect(nameCall('Hey Testo, how are you?', 'Testo')).toBeNull()
    expect(nameCall('fix the bug Testo found', 'Testo')).toBeNull()
    expect(nameCall('Testosterone levels', 'Testo')).toBeNull()
    expect(nameCall(', fix it', '')).toBeNull()
    expect(nameCall('A, fix it', 'A')).toBe('fix it')
  })

  test('the evidence puts the developer first, then the last lines', async () => {
    const e = nameCallEvidence('how are you?', ['Quack.', 'Fine.'])
    expect(e.indexOf('how are you?')).toBeLessThan(e.indexOf('Quack.'))
    expect(nameCallEvidence('x'.repeat(1000), [])).toContain('…')
  })
})

describe('the companion section', () => {
  test("is the original's text with the name and species", async () => {
    const s = companionSection(buddy)
    expect(s).toStartWith('# Companion')
    expect(s).toContain(`A small ${buddy.species} named Testo`)
    expect(s).toContain("You're not Testo -- it's a separate watcher.")
    expect(s).toContain('respond in ONE line or less')
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
    expect(gate.hasPending).toBe(false)
    expect(gate.offer('test-fail', 'd', 29_000)).toBe(false)
    expect(gate.drain(31_999)).toBeNull() // a hair early: kept, not lost
    expect(gate.hasPending).toBe(true)
    expect(gate.drain(32_000)).toEqual({ trigger: 'test-fail', evidence: 'd', at: 29_000 }) // within 5 s: fires
    expect(gate.isBusy).toBe(true)
    gate.complete(33_000)
    expect(gate.offer('turn', 'e', 63_000)).toBe(true)
  })

  test('in-flight calls are counted: a name call never frees a running reaction', async () => {
    const gate = new ReactionGate(30_000)
    expect(gate.offer('turn', 'a', 0)).toBe(true)
    gate.take() // a name call starts while the reaction runs
    gate.complete(1_000) // the name call finishes first
    expect(gate.isBusy).toBe(true)
    expect(gate.offer('error', 'b', 40_000)).toBe(false)
    gate.complete(41_000)
    expect(gate.isBusy).toBe(false)
    expect(gate.offer('error', 'c', 72_000)).toBe(true)
  })

  test('a pet offered without remembering never drains later; forget() clears a pending trigger', async () => {
    const gate = new ReactionGate(30_000)
    gate.complete(0)
    expect(gate.offer('pet', '', 1_000, false)).toBe(false)
    expect(gate.hasPending).toBe(false)
    expect(gate.offer('turn', 'x', 29_000)).toBe(false)
    gate.forget()
    expect(gate.drain(30_000)).toBeNull()
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
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(MIN_GAP)
    const mean = turns / fired
    expect(mean).toBeGreaterThan(5.8)
    expect(mean).toBeLessThan(6.7)
    expect(gaps.some(g => g <= MAX_GAP)).toBe(true)
  })

  test('the first reaction never comes before the third turn', async () => {
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

describe('stat bars', () => {
  test('round(value / 10) blocks of ten, as the original drew them', async () => {
    expect(statBar(82)).toBe('████████░░')
    expect(statBar(15)).toBe('██░░░░░░░░')
    expect(statBar(100)).toBe('██████████')
    expect(statBar(1)).toBe('░░░░░░░░░░')
  })
})
