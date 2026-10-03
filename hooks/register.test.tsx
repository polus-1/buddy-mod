// Integration tests: the mod driven through the engine kit. The test's hooks
// stand for the engine beneath the plugin: a clock, a store, an env, the
// model, the config file, and the bottoms of the events the mod hooks.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { ModelCompleteRequest, ModelCompleteResult, On, PromptOrigin, RenderPropsOf } from 'claude-code'

import { hatchBones } from './bones'
import { FALLBACK_LINES, FALLBACK_NAMES, HATCH_SYSTEM_PROMPT } from './soul'

const HOME = '/home/tester'
const UUID = '00000000-0000-4000-8000-000000000000'
const BONES = hatchBones(UUID)
const HATCH_JSON = '{"name":"Pebble","personality":"A duck who reads every stack trace twice."}'
const REACTION = 'Quack. That one sank.'
const COMPOSER: PromptOrigin = { kind: 'composer' }
const FAIL_TEXT = '> jest\n\n FAIL  src/app.test.ts\n  ● adds\n    expect(received).toBe(expected)\n\nTests: 1 failed, 3 passed'
const USAGE = { input_tokens: 300, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const MIB = 1024 * 1024

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
  greps: string[][]
}

type WorldOptions = {
  model?: ModelStub
  claudeJson?: Record<string, unknown> | null
  store?: Record<string, unknown>
  /** The config file's size as stat reports it; over 4 MiB the mod greps instead of reading. */
  fileSize?: number
  grepOut?: string
}

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
  on('session.model', () => ({ value: 'claude-opus-4-5' }))
  on('ui.log', () => ({ value: undefined }))
  const json = opts.claudeJson === undefined ? { oauthAccount: { accountUuid: UUID } } : opts.claudeJson
  const path = `${HOME}/.claude.json`
  const size = opts.fileSize ?? 4096
  on('fs.exists', ($, e) => ({ value: json !== null && e.path === path }))
  on('fs.stat', ($, e) =>
    json !== null && e.path === path ? { value: { kind: 'file' as const, size, mtimeMs: 0, isLink: false } } : { deny: 'no such file' },
  )
  on('fs.read', ($, e) => (json !== null && e.path === path && size <= 4 * MIB ? { value: JSON.stringify(json) } : { deny: 'too big or missing' }))
  const greps: string[][] = []
  on('process.run', ($, e) => {
    greps.push([...e.argv])
    return { value: { stdout: opts.grepOut ?? '', stderr: '', exitCode: opts.grepOut === undefined ? 1 : 0, isStdoutTruncated: false, isStderrTruncated: false } }
  })
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
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Read' && e.file_path.includes('fail')) return { result: FAIL_TEXT, text: FAIL_TEXT }
    if (e.tool === 'Bash') {
      if (e.command.includes('boom')) return { isError: true as const, result: 'command not found: boom', text: 'command not found: boom' }
      if (e.command.includes('denied')) {
        const text = "The user doesn't want to proceed with this tool use."
        return { isError: true as const, result: text, text }
      }
      // a failing test run: the output and, as Claude Code reports a non-zero exit, an error flag
      if (e.command.includes('fail')) return { isError: true as const, result: FAIL_TEXT, text: FAIL_TEXT }
      return { result: { stdout: 'ok\n', stderr: '', interrupted: false }, text: 'ok\n' }
    }
    return { result: 'done', text: 'done' }
  })
  return { clock, calls, store, prompts, greps }
}

const start = ($: Engine) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'buddy', args, origin: COMPOSER, presentation: { isFullscreen: false, columns: 100 } })

/**
 * /buddy with the hatch animation: 12 wobble and 7 crack ticks of 160 ms,
 * waiting on the mocked clock; then past the cooldown window the hatch opens.
 */
async function hatch($: Engine, w: World, args = '') {
  const pending = run($, args)
  for (let i = 0; i < 24; i++) await w.clock.advance(160)
  const r = await pending
  await w.clock.advance(31_000)
  return r
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

const EYES_OPEN = `${BONES.eyes} ${BONES.eyes}`
const hasSprite = (texts: string[]) => texts.some(t => t.includes(EYES_OPEN) || t.includes('- -'))
const STARS = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[BONES.rarity]

describe('hatching', () => {
  test('the first /buddy hatches: egg animation, one model call with the original prompt, the card, the soul stored', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.calls).toHaveLength(0)
    const pending = run($, '')
    // the egg is on the band while the model is asked
    await w.clock.advance(160)
    const egg = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    expect(await egg.find({ type: 'Text', text: /hatching/ })).toBeDefined()
    await egg.unmount()
    for (let i = 0; i < 24; i++) await w.clock.advance(160)
    const r = await pending
    expect(w.calls).toHaveLength(1)
    expect(w.calls[0]?.model).toBe('haiku')
    expect(w.calls[0]?.system).toBe(HATCH_SYSTEM_PROMPT)
    expect(w.calls[0]?.prompt).toContain(`Rarity: ${BONES.rarity.toUpperCase()}`)
    expect(w.calls[0]?.prompt).toContain(`Species: ${BONES.species}`)
    expect(w.calls[0]?.prompt).toContain('Inspiration words: ')
    expect(r.text).toContain('Pebble')
    expect(r.text).toContain(BONES.species.toUpperCase())
    expect(r.text).toContain('★'.repeat(STARS))
    expect(r.text).toContain('A duck who reads every stack trace twice.')
    expect(r.text).toContain('DEBUGGING')
    expect(w.store.soul).toMatchObject({ name: 'Pebble', personality: 'A duck who reads every stack trace twice.' })
    // a second /buddy shows the card again without hatching again
    const again = await run($, '')
    expect(again.text).toContain('Pebble')
    expect(w.calls).toHaveLength(1)
  })

  test('a stored soul is loaded at session start; bones always win the merge', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, {
      store: { soul: { name: 'Gizmo', personality: 'A cheat who edited the store.', hatchedAt: 1_600_000_000_000, rarity: 'legendary', shiny: true, species: 'chonk' } },
    })
    await start($)
    const r = await run($, 'card')
    expect(r.text).toContain('Gizmo')
    expect(r.text).toContain(BONES.species.toUpperCase())
    expect(r.text).toContain(BONES.rarity.toUpperCase())
    expect(w.calls).toHaveLength(0)
  })

  test('the soul survives a seed change: a different species keeps the name instead of rehatching', { timeoutMs: 20_000 }, async ($, on) => {
    // no account uuid this session: a fallback seed, almost surely another species, yet Gizmo stays
    const w = world(on, { claudeJson: null, store: { soul: { name: 'Gizmo', personality: 'A buddy who moved house.', hatchedAt: 1 } } })
    await start($)
    expect((await run($, 'card')).text).toContain('Gizmo')
    expect(w.calls).toHaveLength(0)
    expect(w.store.soul).toMatchObject({ name: 'Gizmo' })
  })

  test('an old companion in ~/.claude.json migrates into the store without a model call, with its mute flag', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, {
      claudeJson: {
        oauthAccount: { accountUuid: UUID },
        companion: { name: 'Mochi', personality: 'A cat who naps on the keyboard.', hatchedAt: '2026-04-08T12:00:00Z' },
        companionMuted: true,
      },
    })
    await start($)
    const r = await run($, 'card')
    expect(r.text).toContain('Mochi')
    expect(r.text).toContain('Hatched 2026-04-08')
    expect(w.calls).toHaveLength(0)
    expect(w.store.soul).toMatchObject({ name: 'Mochi' })
    expect(w.store.migrated).toBe(true)
    expect(w.store.muted).toBe(true)
  })

  test('no account uuid: a fallback uuid is minted once and stored; a userID is used before minting', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { claudeJson: null })
    await start($)
    expect(typeof w.store.seedFallback).toBe('string')
    expect(w.store.seedFallback).toMatch(/^[0-9a-f-]{36}$/)
    const r = await hatch($, w)
    expect(r.text).toContain('Pebble')
  })

  test('a ~/.claude.json over 4 MiB is grepped for the uuid instead of read; no fallback seed is minted', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { fileSize: 5 * MIB, grepOut: `"accountUuid": "${UUID}"` })
    await start($)
    expect(w.greps.length).toBeGreaterThan(0)
    expect(w.greps[0]).toContain('grep')
    expect(w.store.seedFallback).toBeUndefined()
    const r = await hatch($, w)
    expect(r.text).toContain('Pebble')
    expect(w.calls[0]?.prompt).toContain(`Species: ${BONES.species}`)
  })

  test('an unreadable ~/.claude.json never mints a wrong seed nor marks the migration done: /buddy explains and waits', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { fileSize: 5 * MIB })
    await start($)
    expect(w.store.seedFallback).toBeUndefined()
    expect(w.store.migrated).toBeUndefined()
    const r = await run($, '')
    expect(r.text).toContain('could not be read')
    expect(w.calls).toHaveLength(0)
  })

  test('a grepped (partial) read keeps the migration for a later session', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { fileSize: 5 * MIB, grepOut: `"accountUuid": "${UUID}"` })
    await start($)
    expect(w.store.migrated).toBeUndefined()
  })

  test('three bad hatch replies fall back to the original default name, and that soul is stored', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered('nope') : answered(REACTION)) })
    await start($)
    const r = await hatch($, w)
    expect(w.calls).toHaveLength(3)
    expect(r.text).not.toContain('Pebble')
    expect(FALLBACK_NAMES.some(n => r.text?.includes(n))).toBe(true)
    expect(w.store.soul).toBeDefined()
  })

  test('an API outage at hatch gives a stand-in soul for the session only, so the next session tries again', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? apiError() : answered(REACTION)) })
    await start($)
    const r = await hatch($, w)
    expect(r.text).toContain('stand-in name')
    expect(w.store.soul).toBeUndefined()
    expect((await run($, 'card')).text).toContain('of few words')
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
    expect((await run($, 'pet')).text).toBe('petted Pebble')
    expect((await run($, 'mute')).text).toContain('muted')
    expect(w.store.muted).toBe(true)
    expect((await run($, 'unmute')).text).toContain('speak again')
    expect(w.store.muted).toBe(false)
    expect((await run($, 'on')).text).toContain('speak again')
    expect((await run($, 'off')).text).toContain('hidden')
    expect(w.store.off).toBe(true)
    expect((await run($, 'pet')).text).toContain('hidden')
    expect((await run($, '')).text).toContain('Pebble')
    expect(w.store.off).toBe(false)
    expect((await run($, 'help')).text).toContain('/buddy pet')
    expect((await run($, 'pick duck')).text).toContain('hatch mode')
  })

  test('pet: hearts rise over 2.5 s on their own clock, then a line with the original transcript', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const before = w.calls.length
    await run($, 'pet')
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    expect(await ui.find({ type: 'Text', text: '♥' })).toBeDefined()
    await w.clock.advance(1_000)
    expect(await ui.find({ type: 'Text', text: /♥/ })).toBeDefined()
    expect(w.calls.length).toBe(before)
    for (let i = 0; i < 4; i++) await w.clock.advance(500)
    expect(w.calls.length).toBe(before + 1)
    expect(w.calls[w.calls.length - 1]?.prompt).toContain('(you were just petted)')
    expect(await ui.find({ type: 'Text', text: REACTION })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /♥/ })).toBeUndefined()
    await ui.unmount()
    // /buddy off mid-hearts stops them, and no pet line follows
    await w.clock.advance(31_000)
    await run($, 'pet')
    await w.clock.advance(1_000)
    await run($, 'off')
    const calls = w.calls.length
    await w.clock.advance(5_000)
    expect(w.calls.length).toBe(calls)
  })
})

describe('reactions', () => {
  test('a failing Bash run (errored, as Claude Code reports it) is a test failure with the last 8 lines; a second trigger inside 30 s is dropped; after 30 s it fires', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    expect(w.calls[base]?.prompt).toContain('Tests just failed')
    expect(w.calls[base]?.prompt).toContain('1 failed')
    expect(w.calls[base]?.prompt).toContain('<evidence>')
    expect(w.calls[base]?.system).toContain('You are Pebble')
    await w.clock.advance(1_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail again' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail once more' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 2)
    // a passing command, a permission refusal, an unrelated tool, and a Read of a test file do nothing
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.tool.call({ tool: 'Bash', command: 'rm denied' })
    await $.tool.call({ tool: 'Read', file_path: '/x' })
    await $.tool.call({ tool: 'Read', file_path: '/w/app.test.ts # fail' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 2)
  })

  test('an errored tool call and a big edit react too', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.tool.call({ tool: 'Bash', command: 'boom' })
    await w.clock.settle()
    expect(w.calls[base]?.prompt).toContain('A tool call just errored')
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Write', file_path: '/w/big.ts', content: Array.from({ length: 90 }, (_, i) => `line ${i}`).join('\n') })
    await w.clock.settle()
    expect(w.calls[base + 1]?.prompt).toContain('big.ts: 90 changed lines')
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Edit', file_path: '/w/small.ts', old_string: 'a', new_string: 'b' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 2)
  })

  test('the last trigger dropped inside the window fires when it opens, unless the buddy was muted meanwhile', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    await hatch($, w)
    const base = w.calls.length
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    await w.clock.advance(28_000)
    await $.tool.call({ tool: 'Bash', command: 'boom' }) // 2 s before the window opens: remembered
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 1)
    await w.clock.advance(3_000)
    expect(w.calls.length).toBe(base + 2)
    expect(w.calls[base + 1]?.prompt).toContain('errored')
    // again, but muted before the window opens: nothing fires
    await w.clock.advance(31_000)
    await $.tool.call({ tool: 'Bash', command: 'npm test # fail' })
    await w.clock.settle()
    expect(w.calls.length).toBe(base + 3)
    await w.clock.advance(28_000)
    await $.tool.call({ tool: 'Bash', command: 'boom' })
    await w.clock.settle()
    await run($, 'mute')
    await w.clock.advance(10_000)
    expect(w.calls.length).toBe(base + 3)
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
    // an aborted turn and a subagent's turn never react
    const before = w.calls.length
    for (let i = 0; i < 30; i++) {
      await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: `a${i}` })
      await $.turn.complete({ reason: 'answer', answer: 'sub', durationMs: 1, isAborted: false, turnId: `s${i}`, agentId: 'agent-1' })
      await w.clock.advance(31_000)
    }
    expect(w.calls.length).toBe(before)
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
    // a prompt that merely mentions or starts with the word goes to Claude
    for (const text of ['ask Pebble later; fix the parser', 'Pebble is a nice name, fix the parser', 'Pebble: hi']) {
      const plain = await $.prompt.submit({ text, wait: false, origin: COMPOSER })
      expect(plain.drop).toBeUndefined()
    }
    expect(w.prompts).toHaveLength(3)
    expect(w.calls.length).toBe(base + 1)
    // a plugin-submitted prompt is never intercepted
    const fromPlugin = await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: { kind: 'plugin', name: 'other' } })
    expect(fromPlugin.drop).toBeUndefined()
    // muted: the prompt goes to Claude
    await run($, 'mute')
    const muted = await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    expect(muted.drop).toBeUndefined()
  })

  test('the name call ignores the cooldown, keeps the gate counted, and falls back to a canned line on api-error', { timeoutMs: 20_000 }, async ($, on) => {
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
  test("adds the original's companion section after the engine sections; none while off", { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on)
    await start($)
    const compose = () => $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    expect((await compose()).sections.map(s => s.id)).toEqual(['intro'])
    await hatch($, w)
    const r = await compose()
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'buddy:companion'])
    expect(r.sections[1]?.scope).toBe('session')
    expect(r.sections[1]?.text).toStartWith('# Companion')
    expect(r.sections[1]?.text).toContain(`A small ${BONES.species} named Pebble`)
    await run($, 'off')
    expect((await compose()).sections.map(s => s.id)).toEqual(['intro'])
    await run($, '')
    await run($, 'mute')
    expect((await compose()).sections.map(s => s.id)).toEqual(['intro'])
  })
})

describe('the band', () => {
  test('validates on terminal and desktop at 40 and 120 columns; the bubble collapses under 40', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : answered('Quack. Doing great, thanks.')) })
    await start($)
    await hatch($, w)
    await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    for (const surface of ['terminal', 'desktop'] as const) {
      for (const columns of [30, 40, 120]) {
        const ui = await $.ui.mount({ plugin: 'buddy', surface, component: 'AbovePrompt', props: BAND(columns) })
        await ui.drawn()
        const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
        expect(hasSprite(texts), `${surface}@${columns}: ${JSON.stringify(texts)}`).toBe(true)
        expect(texts.includes('Quack. Doing great, thanks.')).toBe(columns >= 40)
        await ui.unmount()
      }
    }
    // the bubble clears after 10 s
    await w.clock.advance(10_500)
    const later = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    expect(await later.find({ type: 'Text', text: 'Quack. Doing great, thanks.' })).toBeUndefined()
    await later.unmount()
  })

  test('nothing is drawn before the hatch, while off, or under a survey; the idle loop blinks', { timeoutMs: 20_000 }, async ($, on) => {
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

  test('a second session.start (a reload) keeps the buddy and clears a stale bubble', { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : answered('Quack. Doing great, thanks.')) })
    await start($)
    await hatch($, w)
    await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    await start($)
    expect(w.calls).toHaveLength(2)
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: BAND(120) })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(hasSprite(texts)).toBe(true)
    expect(texts).not.toContain('Quack. Doing great, thanks.')
    await ui.unmount()
    expect((await run($, 'card')).text).toContain('Pebble')
  })

  test("the card row is drawn as a tree in the original's shape, with the stat bars and the last line", { timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { model: req => (isHatch(req) ? answered(HATCH_JSON) : answered('Quack. Doing great, thanks.')) })
    await start($)
    await hatch($, w)
    await $.prompt.submit({ text: 'Pebble, hi', wait: false, origin: COMPOSER })
    const r = await run($, 'card')
    expect(r.text).toContain('last said')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'buddy',
        surface,
        component: 'CommandOutput',
        props: { command: 'buddy', args: 'card', text: r.text ?? '', isErrored: false },
        viewport: { columns: 100, rows: 40 },
      })
      expect(await ui.find({ type: 'Text', text: 'Pebble' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: new RegExp(`${'★'.repeat(STARS)} ${BONES.rarity.toUpperCase()}`) })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /DEBUGGING/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /stack trace twice/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Doing great/ })).toBeDefined()
      await ui.unmount()
      // a one-line answer is not drawn as the card
      const plain = await $.ui.mount({
        plugin: 'buddy',
        surface,
        component: 'CommandOutput',
        props: { command: 'buddy', args: 'mute', text: 'Pebble is muted. /buddy unmute to hear it again.', isErrored: false },
      })
      expect(await plain.find({ type: 'Text', text: /DEBUGGING/ })).toBeUndefined()
      await plain.unmount()
    }
  })
})

describe('pick mode', () => {
  test('/buddy asks for a pick; /buddy pick hatches that species into its own soul; the hatch soul is never touched', { options: { mode: 'pick' }, timeoutMs: 20_000 }, async ($, on) => {
    const w = world(on, { store: { soul: { name: 'Gizmo', personality: 'The real hatch-mode soul.', hatchedAt: 1 } } })
    await start($)
    expect((await run($, '')).text).toContain('Pick mode')
    const r = await hatch($, w, 'pick ghost halo shiny')
    expect(w.calls).toHaveLength(1)
    expect(w.calls[0]?.prompt).toContain('Species: ghost')
    expect(w.calls[0]?.prompt).toContain('SHINY variant')
    expect(r.text).toContain('GHOST')
    expect(r.text).toContain('halo')
    expect(r.text).toContain('SHINY')
    expect(w.store.pickedBones).toEqual({ species: 'ghost', hat: 'halo', shiny: true })
    expect(w.store.pickSouls).toMatchObject({ ghost: { name: 'Pebble' } })
    expect(w.store.soul).toMatchObject({ name: 'Gizmo' })
    // same species, different hat: the soul is kept
    const same = await run($, 'pick ghost crown')
    expect(same.text).toContain('Pebble')
    expect(same.text).toContain('crown')
    expect(w.calls).toHaveLength(1)
    // a new species hatches a new soul; the old pick soul stays for when you come back
    await hatch($, w, 'pick chonk legendary')
    expect(w.calls).toHaveLength(2)
    expect(w.calls[1]?.prompt).toContain('Species: chonk')
    expect(w.calls[1]?.prompt).toContain('Rarity: LEGENDARY')
    expect((await run($, 'pick ghost')).text).toContain('Pebble')
    expect(w.calls).toHaveLength(2)
    expect((await run($, 'pick unicorn')).text).toContain('Unknown species')
  })
})
