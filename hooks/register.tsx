// register.tsx: the buddy mod's hooks module.
//
// session.start   seed, bones, soul (store or ~/.claude.json), /buddy, timer
// command.run     /buddy, card, pet, mute, unmute (on), off, pick
// ui.render       AbovePrompt: sprite + bubble; CommandOutput: the card
// tool.call       test failures, errors, large diffs -> reaction
// turn.complete   scheduled turn reactions
// prompt.submit   "Name, ..." or "@Name ..." is answered by the buddy's model and dropped
// prompt.compose  the original's companion section, so Claude knows the buddy exists
//
// Every helper that takes `$` is a top-level function (the validator traces
// where `$` flows); the module's mutable state travels in one `Ctx`. Work that
// outlives a hook's dispatch (reactions, the bubble's clock, the animations)
// is started from `$.clock` timers, never left on the dispatch that saw it.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { EYES, HATS, RARITIES, SPECIES, hatchBones, isSpecies, parsePick, pickBones } from './bones'
import type { Bones, Pick_, SeedHash } from './bones'
import {
  HATCH_CRACK_FRAMES,
  HATCH_TICK_MS,
  HATCH_WOBBLE_FRAMES,
  HATCH_WOBBLE_TICKS,
  cardText,
  drawBand,
  drawCard,
  isCardText,
} from './draw'
import type { BandView } from './draw'
import {
  LARGE_DIFF_LINES,
  ReactionGate,
  TurnSchedule,
  ZERO_USAGE,
  addUsage,
  clip,
  companionSection,
  detectReason,
  fallbackLine,
  hatchSoul,
  isValidPersonality,
  lastLines,
  nameCall,
  nameCallEvidence,
  react,
  tidyPersonality,
} from './soul'
import type { Buddy, Trigger, Usage } from './soul'
import { HEART_TICKS, IDLE_SEQUENCE, TICK_MS } from './sprites'
import type { FrameIndex } from './sprites'
import type { BuddySnapshot, BuddySoul, BuddySpend } from '../types'

const PLUGIN = 'buddy'
const BUBBLE_MS = 10_000
const DEFAULT_COOLDOWN_S = 30
/** `$.fs.read` refuses a file over this; ~/.claude.json can grow past it. */
const FS_READ_LIMIT = 4 * 1024 * 1024
/** The egg wobbles at most this long (about 6 s) before cracking on whatever the naming call gave. */
const HATCH_MAX_WOBBLE_TICKS = 36

type Engine = EngineInterface

// ------------------------------------------------------------ $.state refs

const buddyAtom = atom({ plugin: 'buddy', key: 'buddy' } as const, null)
const tickAtom = atom({ plugin: 'buddy', key: 'tick' } as const, 0)
const bubbleAtom = atom({ plugin: 'buddy', key: 'bubble' } as const, null)
const heartsAtom = atom({ plugin: 'buddy', key: 'hearts' } as const, null)
const visibleAtom = atom({ plugin: 'buddy', key: 'visible' } as const, true)
const mutedAtom = atom({ plugin: 'buddy', key: 'muted' } as const, false)
const spendAtom = atom({ plugin: 'buddy', key: 'spend' } as const, { ...ZERO_USAGE, calls: 0 })
const hatchingAtom = atom({ plugin: 'buddy', key: 'hatching' } as const, null)
const lastSaidAtom = atom({ plugin: 'buddy', key: 'lastSaid' } as const, null)

// ------------------------------------------------------------- $.store keys

const STORE = {
  /** The hatch-mode soul: `{ name, personality, hatchedAt }`, as the original kept it. */
  soul: 'soul',
  /** Pick-mode souls, one per species, so trying a pick never touches the real soul. */
  pickSouls: 'pickSouls',
  muted: 'muted',
  off: 'off',
  seedFallback: 'seedFallback',
  pickedBones: 'pickedBones',
  migrated: 'migrated',
} as const

/** The module's mutable state. Lost on a hot reload, which is fine for all of it. */
type Ctx = {
  mode: 'hatch' | 'pick'
  seedHash: SeedHash
  modelName: string
  cooldownMs: number
  gate: ReactionGate
  schedule: TurnSchedule
  recentLines: string[]
  timer: { cancel: () => void } | null
  heartsTimer: { cancel: () => void } | null
  drainTimer: { cancel: () => void } | null
  bones: Bones | null
  /** Why no bones could be computed, for the /buddy message. */
  seedProblem: string | null
  lastPrompt: string
  isHatching: boolean
}

function makeCtx(options: PluginOptions): Ctx {
  const cooldownS =
    typeof options.cooldown_seconds === 'number' && options.cooldown_seconds > 0 ? options.cooldown_seconds : DEFAULT_COOLDOWN_S
  const cooldownMs = Math.round(cooldownS * 1000)
  return {
    mode: options.mode === 'pick' ? 'pick' : 'hatch',
    seedHash: options.seed_hash === 'fnv1a' ? 'fnv1a' : 'bun',
    modelName: typeof options.model === 'string' && options.model.trim() !== '' ? options.model.trim() : 'haiku',
    cooldownMs,
    gate: new ReactionGate(cooldownMs),
    schedule: new TurnSchedule(Math.random),
    recentLines: [],
    timer: null,
    heartsTimer: null,
    drainTimer: null,
    bones: null,
    seedProblem: null,
    lastPrompt: '',
    isHatching: false,
  }
}

// ------------------------------------------------------------------- helpers

const noop = (): void => {}

/** A promise nobody awaits: a rejection is swallowed, never left unhandled. */
function spawn(work: Promise<unknown>): void {
  work.catch(noop)
}

/** A stored name: 1-14 characters, no whitespace or control characters (the original's schema). */
function isStorableName(name: unknown): name is string {
  return typeof name === 'string' && /^[^\s\u0000-\u001f\u007f]{1,14}$/.test(name)
}

function toBuddy(snapshot: BuddySnapshot | null): Buddy | null {
  if (snapshot === null) return null
  if (!isSpecies(snapshot.species)) return null
  const eyes = EYES.find(e => e === snapshot.eyes)
  const hat = HATS.find(h => h === snapshot.hat)
  if (eyes === undefined || hat === undefined) return null
  return { ...snapshot, species: snapshot.species, eyes, hat }
}

/** A soul from the store or the old config file, checked: a bad one counts as missing. */
function asSoul(value: unknown): BuddySoul | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!isStorableName(v.name)) return null
  const personality = typeof v.personality === 'string' ? tidyPersonality(v.personality) : ''
  if (!isValidPersonality(personality)) return null
  return { name: v.name, personality, hatchedAt: typeof v.hatchedAt === 'number' && Number.isFinite(v.hatchedAt) ? v.hatchedAt : Date.now() }
}

function asPickSouls(value: unknown): Record<string, BuddySoul> {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, BuddySoul> = {}
  for (const [species, soul] of Object.entries(value as Record<string, unknown>)) {
    const checked = asSoul(soul)
    if (isSpecies(species) && checked !== null) out[species] = checked
  }
  return out
}

function asPick(value: unknown): Pick_ | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!isSpecies(v.species)) return null
  const pick: Pick_ = { species: v.species }
  const rarity = RARITIES.find(r => r === v.rarity)
  if (rarity !== undefined) pick.rarity = rarity
  const eyes = EYES.find(e => e === v.eyes)
  if (eyes !== undefined) pick.eyes = eyes
  const hat = HATS.find(h => h === v.hat)
  if (hat !== undefined) pick.hat = hat
  if (typeof v.shiny === 'boolean') pick.shiny = v.shiny
  return pick
}

/** Reads a date out of the old `companion` entry, whatever shape it took. */
function hatchTimeOf(record: Record<string, unknown>): number {
  for (const key of ['hatchedAt', 'hatched_at', 'hatchDate', 'createdAt', 'created_at', 'bornAt']) {
    const v = record[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000
    if (typeof v === 'string') {
      const t = Date.parse(v)
      if (Number.isFinite(t)) return t
    }
  }
  return Date.now()
}

type ClaudeJson = {
  /** False when the file exists but could not be read: nothing may be concluded from it. */
  isRead: boolean
  /** True when only grepped fields are known (the file was too big to read whole). */
  isPartial: boolean
  accountUuid: string | null
  companion: Record<string, unknown> | null
  companionMuted: boolean
}

/** Lines an Edit, Write or MultiEdit changes (the larger side of each edit; a whole Write). */
function changedLinesOf(tool: string, input: Record<string, unknown>): number {
  const count = (s: unknown) => (typeof s === 'string' ? s.split('\n').length : 0)
  if (tool === 'Write') return count(input.content)
  if (tool === 'Edit') return Math.max(count(input.old_string), count(input.new_string))
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return (input.edits as unknown[]).reduce<number>((sum, edit) => {
      const e = typeof edit === 'object' && edit !== null ? (edit as Record<string, unknown>) : {}
      return sum + Math.max(count(e.old_string), count(e.new_string))
    }, 0)
  }
  return 0
}

function baseName(path: unknown): string {
  return typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : 'a file'
}

/** Tool errors that are the person's doing, not the code's: no reaction. */
const NOT_A_CODE_ERROR = /doesn't want to proceed|permission|interrupted|aborted by user|rejected/i

const FRAME_INDICES: readonly FrameIndex[] = [0, 1, 2, -1]

function frameForTick(tick: number): FrameIndex {
  const frame = IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length] ?? 0
  return FRAME_INDICES.includes(frame as FrameIndex) ? (frame as FrameIndex) : 0
}

// ---------------------------------------------------------------- state access

/** The clock's time, or the wall clock's when the clock cannot be asked. */
async function nowOf($: Engine): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

async function currentBuddy($: Engine): Promise<Buddy | null> {
  return toBuddy(await read($, buddyAtom))
}

async function addSpend($: Engine, usage: Usage): Promise<void> {
  await update($, spendAtom, (s: BuddySpend) => ({ ...addUsage(s, usage), calls: s.calls + 1 }))
}

/** Shows a line in the bubble for BUBBLE_MS; nothing while muted. */
async function say($: Engine, ctx: Ctx, line: string | null): Promise<void> {
  if (line === null || line.trim() === '') return
  if (await read($, mutedAtom)) return
  const at = await $.clock.now()
  ctx.recentLines.push(line)
  while (ctx.recentLines.length > 2) ctx.recentLines.shift()
  await update($, lastSaidAtom, () => line)
  await update($, bubbleAtom, () => ({ text: line, at }))
  $.clock.after(BUBBLE_MS, () => {
    spawn(update($, bubbleAtom, current => (current !== null && current.at === at ? null : current)))
  })
}

/** May the buddy react right now? (Not while hidden, muted or hatching.) */
async function canReact($: Engine, ctx: Ctx): Promise<boolean> {
  if (ctx.isHatching) return false
  if ((await currentBuddy($)) === null) return false
  return (await read($, visibleAtom)) && !(await read($, mutedAtom))
}

// ------------------------------------------------------------------ the timer

function stopTimer(ctx: Ctx): void {
  ctx.timer?.cancel()
  ctx.timer = null
}

function startTimer($: Engine, ctx: Ctx): void {
  if (ctx.timer !== null) return
  ctx.timer = $.clock.every(TICK_MS, () => {
    spawn(update($, tickAtom, t => t + 1))
  })
}

/** The hearts: their own 500 ms clock, HEART_TICKS frames, then the pet line. */
function startHearts($: Engine, ctx: Ctx): void {
  ctx.heartsTimer?.cancel()
  spawn(update($, heartsAtom, () => 0))
  ctx.heartsTimer = $.clock.every(TICK_MS, () => {
    spawn(
      (async () => {
        const hearts = await read($, heartsAtom)
        if (hearts === null) {
          stopHearts(ctx)
          return
        }
        const next = hearts + 1
        if (next >= HEART_TICKS) {
          stopHearts(ctx)
          await update($, heartsAtom, () => null)
          await petReaction($, ctx)
        } else {
          await update($, heartsAtom, () => next)
        }
      })(),
    )
  })
}

function stopHearts(ctx: Ctx): void {
  ctx.heartsTimer?.cancel()
  ctx.heartsTimer = null
}

// ------------------------------------------------------------------- reactions

/** When the cooldown window opens, fire the last trigger dropped inside it, if recent. */
function armDrain($: Engine, ctx: Ctx): void {
  ctx.drainTimer?.cancel()
  ctx.drainTimer = $.clock.after(ctx.cooldownMs, () => {
    spawn(drain($, ctx))
  })
}

async function drain($: Engine, ctx: Ctx): Promise<void> {
  if (!ctx.gate.hasPending) return
  if (!(await canReact($, ctx))) {
    ctx.gate.forget()
    return
  }
  const pending = ctx.gate.drain(await $.clock.now())
  if (pending !== null) await runReaction($, ctx, pending.trigger, pending.evidence)
}

/** Runs a reaction the gate has admitted; completes the gate and shows the line. */
async function runReaction($: Engine, ctx: Ctx, trigger: Trigger, evidence: string): Promise<void> {
  try {
    const buddy = await currentBuddy($)
    if (buddy === null) return
    const out = await react(req => $.model.complete(req), buddy, trigger, evidence, ctx.modelName, await $.clock.now())
    await addSpend($, out.usage)
    await say($, ctx, out.line)
  } finally {
    ctx.gate.complete(await nowOf($))
    armDrain($, ctx)
  }
}

/** Offers a trigger to the gate; one inside the window is dropped, not queued. */
async function fireReaction($: Engine, ctx: Ctx, trigger: Trigger, evidence: string): Promise<void> {
  if (!(await canReact($, ctx))) return
  if (!ctx.gate.offer(trigger, evidence, await $.clock.now())) return
  await runReaction($, ctx, trigger, evidence)
}

/** Hands a reaction to the clock, so it belongs to a timer and not to the hook's dispatch. */
function queueReaction($: Engine, ctx: Ctx, trigger: Trigger, evidence: string): void {
  $.clock.after(0, () => {
    spawn(fireReaction($, ctx, trigger, evidence))
  })
}

/** After the hearts: a pet line, canned when the gate is closed so a pet never goes unanswered. */
async function petReaction($: Engine, ctx: Ctx): Promise<void> {
  const buddy = await currentBuddy($)
  if (buddy === null || (await read($, mutedAtom))) return
  const now = await $.clock.now()
  if (ctx.gate.offer('pet', '', now, false)) await runReaction($, ctx, 'pet', '')
  else await say($, ctx, fallbackLine(buddy.species, 'pet', now))
}

/** A tool result just came back: test failure, error or large diff -> reaction. */
function watchToolResult($: Engine, ctx: Ctx, tool: string, input: Record<string, unknown>, text: string, isError: boolean): void {
  // only a command's output is scanned for the patterns: a Read of a test file is not a failing test
  const reason = tool === 'Bash' ? detectReason(text) : null
  if (reason === 'test-fail') return queueReaction($, ctx, 'test-fail', lastLines(text, 8))
  if (reason === 'large-diff') return queueReaction($, ctx, 'large-diff', `${tool}: ${lastLines(text, 8)}`)
  if (reason === 'error' || (isError && !NOT_A_CODE_ERROR.test(text))) {
    return queueReaction($, ctx, 'error', `${tool}: ${clip(text, 400)}`)
  }
  const lines = changedLinesOf(tool, input)
  if (lines > LARGE_DIFF_LINES) queueReaction($, ctx, 'large-diff', `${baseName(input.file_path)}: ${lines} changed lines`)
}

// -------------------------------------------------------------- the seed, soul

function configPath(configDir: string | undefined, home: string | undefined): string | null {
  const dir = configDir !== undefined && configDir !== '' ? configDir : home
  if (dir === undefined || dir === '') return null
  return `${dir.replace(/[\\/]+$/, '')}/.claude.json`
}

/** Pulls one top-level-ish string field out of a file too big to read whole, with grep. */
async function grepField($: Engine, path: string, field: string): Promise<string | null> {
  try {
    const ran = await $.process.run(['grep', '-o', '-m', '1', `"${field}":[[:space:]]*"[^"]*"`, path])
    const match = /"([^"]*)"\s*$/.exec(ran.stdout.trim())
    return match?.[1] ?? null
  } catch {
    return null
  }
}

async function readClaudeJson($: Engine): Promise<ClaudeJson> {
  const none: ClaudeJson = { isRead: true, isPartial: false, accountUuid: null, companion: null, companionMuted: false }
  let path: string | null = null
  try {
    path = configPath(await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')))
    if (path === null || !(await $.fs.exists(path))) return none
    const stat = await $.fs.stat(path)
    if (stat.size > FS_READ_LIMIT) {
      const accountUuid = (await grepField($, path, 'accountUuid')) ?? (await grepField($, path, 'userID'))
      return { isRead: accountUuid !== null, isPartial: true, accountUuid, companion: null, companionMuted: false }
    }
    const parsed: unknown = JSON.parse(await $.fs.read(path))
    if (typeof parsed !== 'object' || parsed === null) return none
    const root = parsed as Record<string, unknown>
    const oauth = typeof root.oauthAccount === 'object' && root.oauthAccount !== null ? (root.oauthAccount as Record<string, unknown>) : null
    const fromOauth = oauth !== null && typeof oauth.accountUuid === 'string' && oauth.accountUuid !== '' ? oauth.accountUuid : null
    const fromUserId = typeof root.userID === 'string' && root.userID !== '' ? root.userID : null
    const companion = typeof root.companion === 'object' && root.companion !== null ? (root.companion as Record<string, unknown>) : null
    return { isRead: true, isPartial: false, accountUuid: fromOauth ?? fromUserId, companion, companionMuted: root.companionMuted === true }
  } catch {
    return { isRead: false, isPartial: false, accountUuid: null, companion: null, companionMuted: false }
  }
}

/** The bones for this session: picked (pick mode) or hatched from the account id. */
async function computeBones($: Engine, ctx: Ctx, claude: ClaudeJson): Promise<Bones | null> {
  if (ctx.mode === 'pick') {
    const picked = asPick(await $.store.get(STORE.pickedBones))
    return picked === null ? null : pickBones(picked)
  }
  let uuid = claude.accountUuid
  if (uuid === null) {
    const stored = await $.store.get(STORE.seedFallback)
    if (typeof stored === 'string' && stored !== '') uuid = stored
    else if (!claude.isRead) {
      // the file is there but unreadable: minting a seed now would give the wrong buddy for good
      ctx.seedProblem = '~/.claude.json could not be read (it may be over 4 MiB), so the buddy cannot be seeded yet. Run /buddy again later.'
      return null
    } else {
      uuid = crypto.randomUUID()
      await $.store.set(STORE.seedFallback, uuid)
    }
  }
  return hatchBones(uuid, ctx.seedHash)
}

/** Copies an old `companion` entry (and the mute flag) from ~/.claude.json into the store, once. */
async function migrate($: Engine, claude: ClaudeJson): Promise<BuddySoul | null> {
  // a partial read (the file was too big) saw no companion: keep the migration for a session that can
  if (!claude.isRead || claude.isPartial) return null
  if ((await $.store.get(STORE.migrated)) === true) return null
  await $.store.set(STORE.migrated, true)
  if (claude.companionMuted && (await $.store.get(STORE.muted)) === undefined) await $.store.set(STORE.muted, true)
  const c = claude.companion
  if (c === null) return null
  const soul = asSoul({ name: c.name, personality: c.personality, hatchedAt: hatchTimeOf(c) })
  if (soul === null) return null
  await $.store.set(STORE.soul, soul)
  return soul
}

/** The soul for these bones: the hatch soul, or in pick mode the one hatched for this species. */
async function loadSoul($: Engine, ctx: Ctx, forBones: Bones | null): Promise<BuddySoul | null> {
  if (ctx.mode === 'pick') {
    if (forBones === null) return null
    return asPickSouls(await $.store.get(STORE.pickSouls))[forBones.species] ?? null
  }
  return asSoul(await $.store.get(STORE.soul))
}

async function storeSoul($: Engine, ctx: Ctx, forBones: Bones, soul: BuddySoul): Promise<void> {
  if (ctx.mode === 'pick') {
    const souls = asPickSouls(await $.store.get(STORE.pickSouls))
    await $.store.set(STORE.pickSouls, { ...souls, [forBones.species]: soul })
  } else {
    await $.store.set(STORE.soul, soul)
  }
}

/** Merges soul and bones into the drawn buddy; bones win (anti-cheat), as `{ ...stored, ...bones }`. */
async function publish($: Engine, soul: BuddySoul | null, forBones: Bones | null): Promise<void> {
  if (soul === null || forBones === null) {
    await update($, buddyAtom, () => null)
    return
  }
  const snapshot: BuddySnapshot = { name: soul.name, personality: soul.personality, hatchedAt: soul.hatchedAt, ...forBones }
  await update($, buddyAtom, () => snapshot)
}

/** The egg wobbles while the model writes the soul, then cracks; the card follows. */
async function hatch($: Engine, ctx: Ctx, forBones: Bones): Promise<{ buddy: Buddy; note?: string }> {
  ctx.isHatching = true
  ctx.gate.take()
  try {
    let isNamed = false
    const naming = hatchSoul(req => $.model.complete(req), forBones, ctx.modelName).finally(() => {
      isNamed = true
    })
    // the egg wobbles for at least the original's twelve ticks, and on while the model is still writing
    for (let step = 0; step < HATCH_WOBBLE_TICKS || (!isNamed && step < HATCH_MAX_WOBBLE_TICKS); step++) {
      await update($, hatchingAtom, () => step % HATCH_WOBBLE_FRAMES)
      await $.clock.sleep(HATCH_TICK_MS)
    }
    const out = await naming
    await addSpend($, out.usage)
    for (let step = 0; step < HATCH_CRACK_FRAMES; step++) {
      await update($, hatchingAtom, () => HATCH_WOBBLE_FRAMES + step)
      await $.clock.sleep(HATCH_TICK_MS)
    }
    const soul: BuddySoul = { ...out.soul, hatchedAt: await $.clock.now() }
    let note: string | undefined
    if (out.isDefault && out.failure !== 'bad-shape') {
      // an outage, not a bad answer: keep the default for this session only (not stored) and try again next session
      note = 'The naming call failed, so this is a stand-in name; /buddy will try again next session.'
    } else {
      await storeSoul($, ctx, forBones, soul)
    }
    await publish($, soul, forBones)
    ctx.recentLines.length = 0
    return { buddy: { ...forBones, ...soul }, note }
  } finally {
    ctx.isHatching = false
    ctx.gate.complete(await nowOf($))
    spawn(update($, hatchingAtom, () => null))
  }
}

async function card($: Engine, buddy: Buddy, note?: string): Promise<string> {
  const [spend, lastSaid] = await Promise.all([read($, spendAtom), read($, lastSaidAtom)])
  return cardText(buddy, spend, lastSaid, note).join('\n')
}

async function show($: Engine): Promise<void> {
  if (await read($, visibleAtom)) return
  await $.store.set(STORE.off, false)
  await update($, visibleAtom, () => true)
}

const NO_BUDDY = 'No buddy yet. Run /buddy to hatch one.'

function helpText(ctx: Ctx): string {
  return [
    '/buddy            hatch your buddy, or show it (and its card)',
    '/buddy card       the full card: sprite, name, species, rarity, stats, personality',
    '/buddy pet        hearts',
    '/buddy mute       hide the speech bubble (and stop its model calls)',
    '/buddy unmute     bring the bubble back',
    '/buddy off        hide the buddy entirely; /buddy brings it back',
    ctx.mode === 'pick' ? '/buddy pick <species> [rarity] [eyes] [hat] [shiny]   choose it by hand' : '',
  ]
    .filter(l => l !== '')
    .join('\n')
}

// ---------------------------------------------------------------- the command

async function runCommand($: Engine, ctx: Ctx, args: string): Promise<{ text: string }> {
  const [sub = '', ...restTokens] = args.trim().split(/\s+/).filter(t => t !== '')
  const rest = restTokens.join(' ')
  const buddy = await currentBuddy($)

  switch (sub.toLowerCase()) {
    case '': {
      await show($)
      if (buddy !== null) {
        startTimer($, ctx)
        return { text: await card($, buddy) }
      }
      if (ctx.bones === null) {
        return {
          text:
            ctx.mode === 'pick'
              ? `Pick mode: choose your buddy with /buddy pick <species> [rarity] [eyes] [hat] [shiny].\nSpecies: ${SPECIES.join(', ')}.`
              : (ctx.seedProblem ?? 'The buddy could not be seeded this session. Check that ~/.claude.json is readable, then run /buddy again.'),
        }
      }
      if (ctx.isHatching) return { text: 'Something is hatching...' }
      const hatched = await hatch($, ctx, ctx.bones)
      startTimer($, ctx)
      return { text: await card($, hatched.buddy, hatched.note) }
    }
    case 'card':
    case 'stats':
      return { text: buddy === null ? NO_BUDDY : await card($, buddy) }
    case 'pet': {
      if (buddy === null) return { text: NO_BUDDY }
      if (!(await read($, visibleAtom))) return { text: `${buddy.name} is hidden. Run /buddy to bring it back first.` }
      startTimer($, ctx)
      startHearts($, ctx)
      return { text: `petted ${buddy.name}` }
    }
    case 'mute':
      await $.store.set(STORE.muted, true)
      await update($, mutedAtom, () => true)
      await update($, bubbleAtom, () => null)
      ctx.gate.forget()
      return { text: buddy === null ? 'companion muted' : `${buddy.name} is muted. /buddy unmute to hear it again.` }
    case 'unmute':
    case 'on':
      await $.store.set(STORE.muted, false)
      await update($, mutedAtom, () => false)
      return { text: buddy === null ? 'companion unmuted' : `${buddy.name} can speak again.` }
    case 'off':
      await $.store.set(STORE.off, true)
      await update($, visibleAtom, () => false)
      await update($, bubbleAtom, () => null)
      await update($, heartsAtom, () => null)
      stopHearts(ctx)
      stopTimer(ctx)
      ctx.gate.forget()
      return { text: buddy === null ? 'Buddy hidden. /buddy brings it back.' : `${buddy.name} is hidden. /buddy brings it back.` }
    case 'pick': {
      if (ctx.mode !== 'pick') {
        return {
          text: 'Buddy is in hatch mode. Switch the "Seed mode" row to pick in /config (or set buddy.mode to "pick" under pluginConfigs), then /buddy pick <species>.',
        }
      }
      if (ctx.isHatching) return { text: 'Something is hatching...' }
      const parsed = parsePick(rest)
      if (!parsed.ok) return { text: parsed.error }
      await $.store.set(STORE.pickedBones, parsed.pick)
      ctx.bones = pickBones(parsed.pick)
      await show($)
      const soul = await loadSoul($, ctx, ctx.bones)
      if (soul !== null) {
        await publish($, soul, ctx.bones)
        const kept = await currentBuddy($)
        if (kept !== null) {
          startTimer($, ctx)
          return { text: await card($, kept) }
        }
      }
      const hatched = await hatch($, ctx, ctx.bones)
      startTimer($, ctx)
      return { text: await card($, hatched.buddy, hatched.note) }
    }
    default:
      return { text: helpText(ctx) }
  }
}

// ------------------------------------------------------------- session start

async function startSession($: Engine, ctx: Ctx): Promise<void> {
  await $.command.register({
    name: 'buddy',
    description: 'Hatch a coding companion · card, pet, mute, unmute, off',
    argumentHint: '[card|pet|mute|unmute|off|pick <species> [rarity] [eyes] [hat] [shiny]]',
  })

  // a reload keeps $.state but drops the old environment's timers: clear what they owned
  await update($, hatchingAtom, () => null)
  await update($, bubbleAtom, () => null)
  await update($, heartsAtom, () => null)

  try {
    const main = (await $.session.model()).toLowerCase()
    const chosen = ctx.modelName.toLowerCase()
    if (chosen === main || (chosen.length > 3 && main.includes(chosen))) {
      $.ui.log(`buddy: the buddy model "${ctx.modelName}" is the session's main model; using haiku instead.`, { to: 'debug' })
      ctx.modelName = 'haiku'
    }
  } catch {
    // no session model to compare against
  }

  const [storedMuted, storedOff] = await Promise.all([$.store.get(STORE.muted), $.store.get(STORE.off)])
  const claude = await readClaudeJson($)
  await update($, mutedAtom, () => storedMuted === true || (storedMuted === undefined && claude.companionMuted))
  await update($, visibleAtom, () => storedOff !== true)

  ctx.bones = await computeBones($, ctx, claude)
  let soul = await loadSoul($, ctx, ctx.bones)
  if (soul === null && ctx.mode === 'hatch') soul = await migrate($, claude)
  await publish($, soul, ctx.bones)

  if (storedOff !== true && (await currentBuddy($)) !== null) startTimer($, ctx)
}

// --------------------------------------------------------------- name call

/** The buddy answers a prompt addressed to it; the main model never runs. */
async function answerNameCall($: Engine, ctx: Ctx, buddy: Buddy, rest: string): Promise<string> {
  ctx.gate.take()
  try {
    const now = await $.clock.now()
    const out = await react(
      req => $.model.complete(req),
      buddy,
      'name-call',
      nameCallEvidence(rest === '' ? 'Hello!' : rest, ctx.recentLines),
      ctx.modelName,
      now,
    )
    await addSpend($, out.usage)
    const line = out.line ?? fallbackLine(buddy.species, 'name-call', now)
    await say($, ctx, line)
    return line
  } finally {
    ctx.gate.complete(await nowOf($))
    armDrain($, ctx)
  }
}

// ------------------------------------------------------------------ register

export const register: Register = (on, options) => {
  const ctx = makeCtx(options)

  on('session.start', async ($, e, next) => {
    try {
      await startSession($, ctx)
    } catch {
      // a failed store or file read must not stop the session; /buddy reports what it can
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, ($, e) => runCommand($, ctx, e.args))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [snapshot, visible, hatching] = await Promise.all([read($, buddyAtom), read($, visibleAtom), read($, hatchingAtom)])
    const buddy = toBuddy(snapshot)
    if (e.props.hasSurvey || !visible) return next(e)
    if (buddy === null && hatching === null) return next(e)
    const [tickCount, bubble, hearts] = await Promise.all([read($, tickAtom), read($, bubbleAtom), read($, heartsAtom)])
    const { Box, Text } = $.ui.resolve(e)
    const egg: Buddy = { ...(ctx.bones ?? hatchBones('egg')), name: '?', personality: '', hatchedAt: 0 }
    const view: BandView = {
      buddy: buddy ?? egg,
      frame: frameForTick(tickCount),
      tick: tickCount,
      bubble: bubble?.text ?? null,
      hearts: hearts !== null && hearts < HEART_TICKS ? hearts : null,
      columns: e.props.bodyColumns,
      hatching,
    }
    return drawBand({ Box, Text }, view)
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'buddy' } }, async ($, e, next) => {
    const buddy = await currentBuddy($)
    if (buddy === null || !isCardText(e.props.text, buddy)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [spend, lastSaid] = await Promise.all([read($, spendAtom), read($, lastSaidAtom)])
    const note = e.props.text.includes('stand-in name') ? 'The naming call failed, so this is a stand-in name; /buddy will try again next session.' : undefined
    return drawCard({ Box, Text }, buddy, spend, e.viewport?.columns ?? 80, lastSaid, note)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && e.agentId === undefined) {
      const { tool, tool_use_id: _id, agentId: _agent, ...input } = e as { tool: string; tool_use_id?: string; agentId?: string } & Record<string, unknown>
      watchToolResult($, ctx, tool, input, typeof ran.text === 'string' ? ran.text : '', ran.isError === true)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer' && (await canReact($, ctx)) && ctx.schedule.onTurn()) {
      queueReaction($, ctx, 'turn', `The developer asked: ${clip(ctx.lastPrompt, 200)}\nThe assistant answered: ${clip(e.answer, 300)}`)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return next(e)
    const buddy = await currentBuddy($)
    const mayAnswer = buddy !== null && !ctx.isHatching && (await read($, visibleAtom)) && !(await read($, mutedAtom))
    const rest = mayAnswer ? nameCall(e.text, buddy.name) : null
    if (buddy === null || rest === null) {
      ctx.lastPrompt = e.text
      return next(e)
    }
    const line = await answerNameCall($, ctx, buddy, rest)
    return { drop: `${buddy.name}: ${line}` }
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const buddy = await currentBuddy($)
    if (buddy === null || !(await read($, visibleAtom)) || (await read($, mutedAtom))) return result
    return { sections: [...result.sections, { id: `${PLUGIN}:companion`, text: companionSection(buddy), scope: 'session' }] }
  })
}
