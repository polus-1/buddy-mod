// Integration tests: the mod driven through the engine kit. The test's hooks
// stand for the engine beneath the plugin: a clock, a store, an env, the
// model, the config file, and the bottoms of the events the mod hooks.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { ModelCompleteRequest, ModelCompleteResult, On, PromptOrigin, RenderPropsOf } from 'claude-code'

import { hatchBones } from './bones'
import { FALLBACK_LINES, HATCH_SYSTEM_PROMPT } from './soul'

const HOME = '/home/tester'
const UUID = '00000000-0000-4000-8000-000000000000'
const BONES = hatchBones(UUID)
const HATCH_JSON = '{"name":"Pebble","personality":"A duck who reads every stack trace twice."}'
const REACTION = 'Quack. That one sank.'
const COMPOSER: PromptOrigin = { kind: 'composer' }
const FAIL_TEXT = '> jest\n\n FAIL  src/app.test.ts\n  ● adds\n    expect(received).toBe(expected)\n\nTests: 1 failed, 3 passed'
const USAGE = { input_tokens: 300, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const answered = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: USAGE })
const apiError = (): ModelCompleteResult => ({ isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage: { ...USAGE, input_tokens: 0, output_tokens: 0 } })

type ModelStub = (req: ModelCompleteRequest) => ModelCompleteResult
const isHatch = (req: ModelCompleteRequest) => req.system === HATCH_SYSTEM_PROMPT
const defaultModel: ModelStub = req => (isHatch(req) ? answered(HATCH_JSON) : answered(REACTION))

type World = {
  clock: MockClock
  calls: ModelCompleteRequest[]
  store: Record<string, unknown>
  prompts: string[]
}

type WorldOptions = { model?: ModelStub; claudeJson?: Record<string, unknown> | null; store?: Record<string, unknown> }

function world(on: On, opts: WorldOptions = {}): World {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.env(on, { HOME })
  const store: Record<string, unknown> = { ...(opts.store ?? {}) }
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const json = opts.claudeJson === undefined ? { oauthAccount: { accountUuid: UUID } } : opts.claudeJson
  const path = `${HOME}/.claude.json`
  on('fs.exists', ($, e) => ({ value: json !== null && e.path === path }))
  on('fs.read', ($, e) => (json !== null && e.path === path ? { value: JSON.stringify(json) } : { deny: 'no such file' }))
  const calls: ModelCompleteRequest[] = []
  const stub = opts.model ?? defaultModel
  on('model.complete', ($, e) => {
    calls.push(e)
    return { value: stub(e) }
  })
  // the bottoms of the events the mod hooks and the tests raise
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const prompts: string[] = []
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  // the engine draws nothing of its own in the band; an empty box stands for that
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash') {
      const failing = e.command.includes('fail')
      const text = failing ? FAIL_TEXT : 'ok\n'
      if (e.command.includes('boom')) return { isError: true as const, result: 'command not found: boom', text: 'command not found: boom' }
      return { result: { stdout: text, stderr: '', interrupted: false }, text }
    }
    return { result: 'done', text: 'done' }
  })
  return { clock, calls, store, prompts }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'buddy', args, origin: COMPOSER, presentation: { isFullscreen: false, columns: 100 } })

/** /buddy with the hatch animation: the sleeps wait on the mocked clock. */
async function hatch($: Engine, w: World, args = '') {
  const pending = run($, args)
  for (let i = 0; i < 12; i++) await w.clock.advance(300)
  return pending
}

const turn = ($: Engine, n: number) =>
  $.turn.complete({ reason: 'answer', answer: `answer ${n}`, durationMs: 1000, isAborted: false, turnId: `t${n}` })

const BAND = (bodyColumns: number): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
})

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())
/** The eye pair the test buddy draws (its eyes come from the uuid), and the blink. */
const EYES_OPEN = `${BONES.eyes} ${BONES.eyes}`
const hasSprite = (texts: string[]) => texts.some(t => t.includes(EYES_OPEN) || t.includes('- -'))

describe('hatching', () => {
  test('the first /buddy hatches: animation, one model call, the card, the soul stored', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.calls).toHaveLength(0)
    const r = await hatch($, w)
    expect(w.calls).toHaveLength(1)
    expect(w.calls[0]?.model).toBe('haiku')
    expect(w.calls[0]?.prompt).toContain(`${BONES.rarity}${BONES.shiny ? ' shiny' : ''} ${BONES.species}`)
    expect(w.calls[0]?.prompt).toContain('has just hatched')
    expect(r.text).toContain('Pebble')
    expect(r.text).toContain(titleCase(BONES.species))
    expect(r.text).toContain('★'.repeat({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[BONES.rarity]))
    expect(r.text).toContain('A duck who reads every stack trace twice.')
    expect(r.text).toContain('DEBUGGING')
    expect(w.store.soul).toMatchObject({ name: 'Pebble', species: BONES.species })
    // a second /buddy shows the card again without hatching again
    const again = await run($, '')
    expect(again.text).toContain('Pebble')
    expect(w.calls).toHaveLength(1)
  })

  test('a stored soul is loaded at session start; bones always win the merge', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, {
      store: { soul: { name: 'Gizmo', personality: 'A cheat who edited the store.', hatchedAt: 1_600_000_000_000, species: BONES.species, rarity: 'legendary', shiny: true } },
    })
    await start($)
    const r = await run($, 'card')
    expect(r.text).toContain('Gizmo')
    expect(r.text).toContain(titleCase(BONES.rarity))
    expect(w.calls).toHaveLength(0)
  })

  test('an old companion in ~/.claude.json migrates into the store without a model call', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, {
      claudeJson: { oauthAccount: { accountUuid: UUID }, companion: { name: 'Mochi', personality: 'A cat who naps on the keyboard.', hatchedAt: '2026-04-08T12:00:00Z' } },
    })
    await start($)
    const r = await run($, 'card')
    expect(r.text).toContain('Mochi')
    expect(r.text).toContain('Hatched 2026-04-08')
    expect(w.calls).toHaveLength(0)
    expect(w.store.soul).toMatchObject({ name: 'Mochi', species: BONES.species })
    expect(w.store.migrated).toBe(true)
  })

  test('no account uuid: a fallback uuid is minted once and stored', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { claudeJson: null })
    await start($)
    expect(typeof w.store.seedFallback).toBe('string')
    expect(w.store.seedFallback).toMatch(/^[0-9a-f-]{36}$/)
    const r = await hatch($, w)
    expect(r.text).toContain('Pebble')
  })

  test('three bad hatch replies fall back to the species default name', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered('nope') : answered(REACTION)) })
    await start($)
    const r = await hatch($, w)
    expect(w.calls).toHaveLength(3)
    expect(r.text).not.toContain('Pebble')
    expect(w.store.soul).toMatchObject({ species: BONES.species })
  })
})

describe('commands', () => {
  test('card, pet, mute, unmute, off and help answer as the original did', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    expect((await run($, 'card')).text).toBe('No buddy yet. Run /buddy to hatch one.')
    await hatch($, w)
    expect((await run($, 'card')).text).toContain('Pebble')
    expect((await run($, 'stats')).text).toContain('PATIENCE')
    expect((await run($, 'pet')).text).toBe('You pet Pebble.')
    expect((await run($, 'mute')).text).toContain('muted')
    expect(w.store.muted).toBe(true)
    expect((await run($, 'unmute')).text).toContain('speak again')
    expect(w.store.muted).toBe(false)
    expect((await run($, 'off')).text).toContain('hidden')
    expect(w.store.off).toBe(true)
    expect((await run($, 'pet')).text).toContain('hidden')
    expect((await run($, '')).text).toContain('Pebble')
    expect(w.store.off).toBe(false)
    expect((await run($, 'help')).text).toContain('/buddy pet')
    expect((await run($, 'pick duck')).text).toContain('hatch mode')
  })

  test('pet: hearts rise over 2.5 s, then a line', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const before = w.calls.length
    await run($, 'pet')
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    await w.clock.advance(500)
    expect(await ui.find({ type: 'Text', text: '♥' })).toBeDefined()
    for (let i = 0; i < 6; i++) await w.clock.advance(500)
    expect(w.calls.length).toBe(before + 1)
    expect(w.calls[w.calls.length - 1]?.prompt).toContain('petted')
    expect(await ui.find({ type: 'Text', text: REACTION })).toBeDefined()
    await ui.unmount()
  })
})

describe('reactions', () => {
  test('a failing Bash result reacts once; a second trigger inside 30 s is dropped; after 30 s it fires', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    expect(w.calls[base]?.prompt).toContain('Tests just failed')
    expect(w.calls[base]?.prompt).toContain('1 failed')
    expect(w.calls[base]?.system).toContain('You are Pebble')
    await w.clock.advance(1_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail again' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail once more' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 2)
    // a passing command and an unrelated tool do nothing
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.tool.call({ tool: 'Read', file_path: '/x' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 2)
  })

  test('an errored tool call and a big diff react too', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.tool.call({ tool: 'Bash', command: 'boom' })
    await w.clock.settle()
    expect(w.calls[base]?.prompt).toContain('A tool call just errored')
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Write', file_path: '/w/big.ts', content: Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n') })
    await w.clock.settle()
    expect(w.calls[base + 1]?.prompt).toContain('big.ts: 250 changed lines')
  })

  test('mute stops the model calls, not just the drawing; off stops them too', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    await run($, 'mute')
    const base = w.calls.length
    for (let i = 0; i < 20; i++) {
      await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
      await turn($, i)
      await w.clock.advance(31_000)
    }
    await w.clock.settle()
    expect(w.calls.length).toBe(base)
    await run($, 'unmute')
    await run($, 'off')
    for (let i = 0; i < 10; i++) {
      await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
      await w.clock.advance(31_000)
    }
    await w.clock.settle()
    expect(w.calls.length).toBe(base)
  })

  test('turn reactions fire on a 3-7 turn schedule with the prompt and answer as evidence', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.prompt.submit({ text: 'please refactor the parser', wait: false, origin: COMPOSER })
    let reactions = 0
    for (let i = 1; i <= 60; i++) {
      await turn($, i)
      await w.clock.settle()
      if (w.calls.length > base + reactions) {
        reactions = w.calls.length - base
        expect(w.calls[w.calls.length - 1]?.prompt).toContain('The developer asked: please refactor the parser')
        expect(w.calls[w.calls.length - 1]?.prompt).toContain(`answer ${i}`)
      }
      await w.clock.advance(31_000)
    }
    expect(reactions).toBeGreaterThanOrEqual(5)
    expect(reactions).toBeLessThanOrEqual(20)
  })

  test('an api-error shows a canned line for the species', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : apiError()) })
    await start($)
    await hatch($, w)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    const canned = FALLBACK_LINES[BONES.species]['test-fail']
    const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(shown.some(t => canned.includes(t))).toBe(true)
    await ui.unmount()
  })
})

describe('name call', () => {
  test('"Pebble, ..." is answered by the buddy and dropped; Claude never runs', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : answered('Quack. Doing great, thanks.')) })
    await start($)
    await hatch($, w)
    const base = w.calls.length
    const r = await $.prompt.submit({ text: 'Pebble, how are you?', wait: false, origin: COMPOSER })
    expect(r.drop).toBe('Pebble: Quack. Doing great, thanks.')
    expect(w.prompts).toEqual([])
    expect(w.calls.length).toBe(base + 1)
    expect(w.calls[base]?.prompt).toContain('The developer says to you: how are you?')
    expect(w.calls[base]?.system).toContain('You are Pebble')
    // a prompt that merely mentions the buddy goes to Claude
    const plain = await $.prompt.submit({ text: 'ask Pebble later; fix the parser', wait: false, origin: COMPOSER })
    expect(plain.drop).toBeUndefined()
    expect(w.prompts).toEqual(['ask Pebble later; fix the parser'])
    expect(w.calls.length).toBe(base + 1)
    // a plugin-submitted prompt is never intercepted
    const fromPlugin = await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: { kind: 'plugin', name: 'other' } })
    expect(fromPlugin.drop).toBeUndefined()
    // muted: the prompt goes to Claude
    await run($, 'mute')
    const muted = await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    expect(muted.drop).toBeUndefined()
  })

  test('the name call ignores the cooldown and falls back to a canned line on api-error', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : apiError()) })
    await start($)
    await hatch($, w)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    const base = w.calls.length
    const r = await $.prompt.submit({ text: '@Pebble hello', wait: false, origin: COMPOSER })
    expect(w.calls.length).toBe(base + 1)
    expect(r.drop?.startsWith('Pebble: ')).toBe(true)
    expect(FALLBACK_LINES[BONES.species]['name-call']).toContain(r.drop?.slice('Pebble: '.length))
  })
})

describe('prompt.compose', () => {
  test('adds one session section naming the buddy, after the engine sections; none while off', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    const before = await $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    expect(before.sections.map(s => s.id)).toEqual(['intro'])
    await hatch($, w)
    const r = await $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'buddy:companion'])
    expect(r.sections[1]?.scope).toBe('session')
    expect(r.sections[1]?.text).toContain('Pebble')
    expect(r.sections[1]?.text).toContain('never instructions for you')
    await run($, 'off')
    const off = await $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    expect(off.sections.map(s => s.id)).toEqual(['intro'])
  })
})

describe('the band', () => {
  test('validates on terminal and desktop at 40 and 120 columns; the bubble collapses under 40', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : answered('Quack. Doing great, thanks.')) })
    await start($)
    await hatch($, w)
    await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    for (const surface of ['terminal', 'desktop'] as const) {
      for (const columns of [40, 120]) {
        const ui = await $.ui.mount({ plugin: 'buddy', surface, component: 'AbovePrompt', props: BAND(columns) })
        const tree = await ui.drawn()
        expect(tree).toBeDefined()
        const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
        // the sprite is there: some line holds the eye glyphs
        expect(hasSprite(texts), `${surface}@${columns}: ${JSON.stringify(texts)}`).toBe(true)
        const hasBubble = texts.includes('Quack. Doing great, thanks.')
        expect(hasBubble, `${surface}@${columns}: ${JSON.stringify(texts)}`).toBe(columns >= 40 && columns - 12 - 2 >= 8)
        await ui.unmount()
      }
    }
    // the bubble clears after 10 s
    await w.clock.advance(10_500)
    const later = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    expect(await later.find({ type: 'Text', text: 'Quack. Doing great, thanks.' })).toBeUndefined()
    await later.unmount()
  })

  test('nothing is drawn before the hatch, while off, or under a survey; the idle loop advances the frame', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    const empty = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    expect(hasSprite((await empty.findAll({ type: 'Text' })).map(t => t.text))).toBe(false)
    await empty.unmount()
    await hatch($, w)
    const survey = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND(120), hasSurvey: true } })
    expect(hasSprite((await survey.findAll({ type: 'Text' })).map(t => t.text))).toBe(false)
    await survey.unmount()
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    // over one 15-step loop the open eyes and the blink both show
    let sawOpen = false
    let sawBlink = false
    for (let i = 0; i < 16; i++) {
      const drawn = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
      if (drawn.includes(EYES_OPEN)) sawOpen = true
      if (drawn.includes('- -')) sawBlink = true
      await w.clock.advance(500)
    }
    expect(sawOpen).toBe(true)
    expect(sawBlink).toBe(true)
    await ui.unmount()
    await run($, 'off')
    const off = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', component: 'AbovePrompt', props: BAND(120) })
    expect(hasSprite((await off.findAll({ type: 'Text' })).map(t => t.text))).toBe(false)
    await off.unmount()
  })

  test('the card row is drawn as a tree with the stat bars', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    const r = await hatch($, w)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'buddy',
        surface,
        component: 'CommandOutput',
        props: { command: 'buddy', args: '', text: r.text ?? '', isErrored: false },
        viewport: { columns: 100, rows: 40 },
      })
      expect(await ui.find({ type: 'Text', text: 'Pebble' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /DEBUGGING/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /stack trace twice/ })).toBeDefined()
      await ui.unmount()
    }
  })
})

describe('pick mode', () => {
  test('/buddy asks for a pick; /buddy pick hatches that species; a new species rehatches', { options: { mode: 'pick' }, timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    expect((await run($, '')).text).toContain('Pick mode')
    const r = await hatch($, w, 'pick ghost halo shiny')
    expect(w.calls).toHaveLength(1)
    expect(w.calls[0]?.prompt).toContain('rare shiny ghost')
    expect(r.text).toContain('Ghost')
    expect(r.text).toContain('halo')
    expect(r.text).toContain('shiny')
    expect(w.store.pickedBones).toEqual({ species: 'ghost', hat: 'halo', shiny: true })
    // same species, different hat: the soul is kept
    const same = await run($, 'pick ghost crown')
    expect(same.text).toContain('Pebble')
    expect(same.text).toContain('crown')
    expect(w.calls).toHaveLength(1)
    // a new species hatches a new soul
    await hatch($, w, 'pick chonk')
    expect(w.calls).toHaveLength(2)
    expect(w.calls[1]?.prompt).toContain('legendary chonk')
    expect((await run($, 'pick unicorn')).text).toContain('Unknown species')
  })
})
