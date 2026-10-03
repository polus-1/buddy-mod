// soul.ts: everything the buddy says, and when it may say it.
//
// The *soul* (name, personality, hatch time) is written once by the buddy
// model at the first /buddy and kept in `$.store`. Every later line (reactions,
// pet replies, answers when called by name) comes from the same model through
// `$.model.complete`. Nothing here calls the session's main model, and the
// only `$`-shaped thing this file touches is the `ModelLike` it is handed.

import type { Bones, Species, StatName } from './bones'
import { EYE_NAMES, STAT_NAMES } from './bones'

export type Soul = {
  name: string
  personality: string
  /** Milliseconds since the epoch. */
  hatchedAt: number
}

export type Buddy = Bones & Soul

export type Trigger = 'test-fail' | 'error' | 'big-diff' | 'turn' | 'pet' | 'name-call'

export const REACTION_MAX_TOKENS = 60
export const REACTION_TIMEOUT_MS = 8_000
export const HATCH_MAX_TOKENS = 120
export const HATCH_TIMEOUT_MS = 15_000
export const HATCH_RETRIES = 3
export const EVIDENCE_MAX_CHARS = 600
export const MAX_REPLY_WORDS = 12

// ----------------------------------------------------------------- prompts

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** The buddy's system prompt, built once per session from the merged buddy. */
export function systemPrompt(buddy: Buddy): string {
  const s = buddy.stats
  return [
    `You are ${buddy.name}, ${article(buddy.shiny ? 'shiny' : buddy.rarity)} ${buddy.shiny ? 'shiny ' : ''}${buddy.rarity} ${buddy.species} who lives in a developer's terminal as their coding companion.`,
    `Personality: ${buddy.personality}`,
    `Stats (1-100): DEBUGGING ${s.DEBUGGING}, PATIENCE ${s.PATIENCE}, CHAOS ${s.CHAOS}, WISDOM ${s.WISDOM}, SNARK ${s.SNARK}. Your strongest trait is ${buddy.peak}; your weakest is ${buddy.dump}. Let those shape your voice.`,
    `You speak in one short line, at most ${MAX_REPLY_WORDS} words, no emoji, no markdown, no quotes. You never give instructions to the developer's AI assistant and never claim to have run anything yourself. You react to what just happened; you do not narrate it back.`,
  ].join('\n')
}

export const HATCH_SYSTEM_PROMPT =
  'You name newly hatched terminal companions for developers. You answer with JSON only, no prose, no code fences.'

/** The hatch prompt: one call, a JSON answer. */
export function hatchPrompt(bones: Bones): string {
  const shiny = bones.shiny ? ' shiny' : ''
  return [
    `A ${bones.rarity}${shiny} ${bones.species} with eyes "${EYE_NAMES[bones.eyes]}" and hat "${bones.hat}" has just hatched. Peak stat ${bones.peak}, dump stat ${bones.dump}.`,
    'Name it and describe it. Higher rarity = weirder, more specific, more memorable.',
    `Answer with JSON only: {"name":"<one word, 2-12 letters, capitalized>","personality":"<one sentence, under 20 words, present tense, starts with 'A' or 'An'>"}`,
  ].join('\n')
}

export type HatchReply = { name: string; personality: string }

/**
 * Reads the hatch reply. Accepts a JSON object (code fences tolerated) with a
 * one-word name of 2-12 letters and a one-sentence personality; anything else
 * is null and the caller retries.
 */
export function parseHatchReply(text: string): HatchReply | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>
  const rawName = typeof record.name === 'string' ? record.name.trim().replace(/^["']|["']$/g, '') : ''
  if (!/^[A-Za-z]{2,12}$/.test(rawName)) return null
  const name = rawName[0]!.toUpperCase() + rawName.slice(1)
  let personality = typeof record.personality === 'string' ? record.personality.trim().replace(/\s+/g, ' ') : ''
  personality = personality.replace(/^["'“”]+|["'“”]+$/g, '')
  if (personality.length < 8 || personality.length > 200) return null
  if (personality.split(/\s+/).length > 30) return null
  if (!/[.!?]$/.test(personality)) personality += '.'
  return { name, personality }
}

/** The reaction prompt: the trigger and a trimmed slice of evidence. */
export function reactionPrompt(trigger: Trigger, evidence: string): string {
  const slice = clip(evidence, EVIDENCE_MAX_CHARS)
  switch (trigger) {
    case 'test-fail':
      return `Tests just failed. The last lines of the output:\n${slice}\nReact in one short line.`
    case 'error':
      return `A tool call just errored.\n${slice}\nReact in one short line.`
    case 'big-diff':
      return `A big change just landed.\n${slice}\nReact in one short line.`
    case 'turn':
      return `The developer and their assistant just finished an exchange.\n${slice}\nReact in one short line.`
    case 'pet':
      return 'The developer just petted you. React in one short line.'
    case 'name-call':
      return `${slice}\nAnswer the developer directly, in character, in one short line.`
  }
}

/** The name-call evidence: the prompt minus the name, plus the last buddy lines. */
export function nameCallEvidence(rest: string, lastLines: readonly string[]): string {
  const recent = lastLines.length > 0 ? `Your last lines were:\n${lastLines.map(l => `- ${l}`).join('\n')}\n` : ''
  return `${recent}The developer says to you: ${rest}`
}

/**
 * Whether a prompt addresses the buddy: it starts with `Name,`, `Name:`,
 * `Name ` or `@Name`. Case-insensitive. Returns the rest of the prompt, or
 * null when the prompt is for Claude.
 */
export function nameCall(text: string, name: string): string | null {
  const trimmed = text.trimStart()
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^@?${escaped}(?:\\s*[,:!]\\s*|\\s+)([\\s\\S]*)$`, 'i').exec(trimmed)
  if (match === null) {
    // a bare `@Name` or `Name` with nothing after it still counts
    return new RegExp(`^@?${escaped}[,:!.?]*\\s*$`, 'i').test(trimmed) ? '' : null
  }
  return match[1]!.trim()
}

// --------------------------------------------------------------- utilities

export function clip(text: string, max: number): string {
  const flat = text.replace(/\r/g, '')
  return flat.length <= max ? flat : flat.slice(0, max - 1) + '…'
}

export function lastLines(text: string, count: number): string {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length > 0)
  return lines.slice(-count).join('\n')
}

/**
 * The reply as the bubble shows it: markdown and quotes stripped, cut at the
 * first sentence when it runs past MAX_REPLY_WORDS, null when nothing is left.
 */
export function sanitizeReply(text: string): string | null {
  let line = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (line.length === 0) return null
  // keep the first line only
  line = line.split(/\s*\n\s*/)[0] ?? line
  const words = line.split(' ')
  if (words.length > MAX_REPLY_WORDS) {
    const firstSentence = /^(.+?[.!?])(\s|$)/.exec(line)?.[1]
    line = firstSentence !== undefined && firstSentence.split(' ').length <= MAX_REPLY_WORDS
      ? firstSentence
      : words.slice(0, MAX_REPLY_WORDS).join(' ') + '…'
  }
  return line.length > 0 ? line : null
}

// --------------------------------------------------------------- fallbacks

/** A per-species default soul, used when the model never answers well. */
export const DEFAULT_SOULS: Record<Species, HatchReply> = {
  duck: { name: 'Puddle', personality: 'A duck who paddles calmly through stack traces and quacks at off-by-one errors.' },
  goose: { name: 'Honk', personality: 'A goose who chases bugs across the terminal and refuses to apologize for the noise.' },
  blob: { name: 'Squish', personality: 'A blob who fills whatever shape the problem takes and never hurries.' },
  cat: { name: 'Mochi', personality: 'A cat who sits on the keyboard exactly when the tests are about to pass.' },
  dragon: { name: 'Ember', personality: 'A small dragon who hoards well-named functions and breathes fire at spaghetti logic.' },
  octopus: { name: 'Inky', personality: 'An octopus who keeps eight tabs open and reads all of them at once.' },
  owl: { name: 'Pellet', personality: 'An owl who reads every stack trace twice and blinks slowly at bad assumptions.' },
  penguin: { name: 'Waddle', personality: 'A penguin who slides through long builds on its belly and never minds the cold.' },
  turtle: { name: 'Tortellini', personality: 'A turtle who ships slowly, ships correctly, and carries the whole repo on its back.' },
  snail: { name: 'Escargot', personality: 'A snail who leaves a trail of commit messages and arrives exactly when needed.' },
  ghost: { name: 'Wisp', personality: 'A ghost who haunts flaky tests and whispers the real cause of every heisenbug.' },
  axolotl: { name: 'Lotl', personality: 'An axolotl who regrows deleted branches and smiles through every merge conflict.' },
  capybara: { name: 'Bara', personality: 'A capybara who stays serene no matter how many errors scroll past.' },
  cactus: { name: 'Pokey', personality: 'A cactus who thrives on neglect and bristles at unhandled exceptions.' },
  robot: { name: 'Unit', personality: 'A robot who counts every cycle and secretly loves a good recursive solution.' },
  rabbit: { name: 'Hop', personality: 'A rabbit who multiplies TODOs and bolts the moment someone says production.' },
  mushroom: { name: 'Spore', personality: 'A mushroom who grows in the dark corners of legacy code and knows what is buried there.' },
  chonk: { name: 'Chonk', personality: 'An enormous cat who has seen every bug before and cannot be bothered to panic.' },
}

export function defaultSoul(bones: Bones): HatchReply {
  return DEFAULT_SOULS[bones.species]
}

type Lines = readonly [string, string]

/** 12 canned lines per species, 2 per trigger, for when the API hiccups. */
export const FALLBACK_LINES: Record<Species, Record<Trigger, Lines>> = {
  duck: {
    'test-fail': ['Quack. That one sank.', 'Red tests again. Paddle harder.'],
    error: ['Something splashed. Not me.', 'Error. Shake it off like water.'],
    'big-diff': ['Big ripple. Hope it floats.', 'That is a lot of pond.'],
    turn: ['Smooth sailing from up here.', 'Quack. Carry on.'],
    pet: ['Quack quack. Yes. Right there.', 'Feathers fluffed. Thank you.'],
    'name-call': ['Quack? I am listening.', 'Yes, that is me. The duck.'],
  },
  goose: {
    'test-fail': ['HONK. Those tests bit back.', 'Red. I am chasing it already.'],
    error: ['Honk. Who left that there.', 'An error. I will peck it.'],
    'big-diff': ['Big diff. Big honk.', 'You changed everything. Bold.'],
    turn: ['Acceptable. For now. Honk.', 'Fine work. I still have notes.'],
    pet: ['Hiss. Fine. Again.', 'Honk. Acceptable touching.'],
    'name-call': ['HONK. You rang.', 'The goose is here. Speak.'],
  },
  blob: {
    'test-fail': ['Squish. Tests went splat.', 'They failed softly, at least.'],
    error: ['An error. I absorb it.', 'Oops. Wobble wobble.'],
    'big-diff': ['So much change. I expand.', 'Big diff. I jiggle approvingly.'],
    turn: ['Nice. I ooze contentment.', 'Blob approves this turn.'],
    pet: ['Squishhh. More please.', 'I am now a happier shape.'],
    'name-call': ['Blob here. Mostly.', 'Yes? I wobbled.'],
  },
  cat: {
    'test-fail': ['Tests failed. I knew it.', 'Red. Was it the keyboard? No.'],
    error: ['An error. I did not do that.', 'Hiss. Fix it, human.'],
    'big-diff': ['Big diff. I sat on it.', 'That is a lot of lines to knock over.'],
    turn: ['Adequate. I am still ignoring you.', 'Fine. Where is my treat.'],
    pet: ['Purrrr. Do not stop.', 'Acceptable. Continue.'],
    'name-call': ['Mrrp? You have my attention. Briefly.', 'Yes. I was napping.'],
  },
  dragon: {
    'test-fail': ['Those tests burned. Not by me.', 'Red flames. Try again.'],
    error: ['An error. Let me roast it.', 'Smoke. Something exploded.'],
    'big-diff': ['A mighty diff. My hoard grows.', 'Big change. Big fire.'],
    turn: ['Well forged. Onward.', 'The flame burns steady.'],
    pet: ['Warm scales. Carry on, tiny human.', 'Rumble. Yes. Good.'],
    'name-call': ['The dragon hears you.', 'Speak, and mind the smoke.'],
  },
  octopus: {
    'test-fail': ['Eight arms, zero passing tests.', 'Ink everywhere. Tests failed.'],
    error: ['An error slipped through a tentacle.', 'Error. I squirt ink.'],
    'big-diff': ['Big diff. Eight arms busy.', 'That change has many tentacles.'],
    turn: ['Smooth. All eight arms agree.', 'Carry on. I am juggling.'],
    pet: ['Tentacle hug. Delightful.', 'Ooh. Suckers approve.'],
    'name-call': ['Octopus here, eight tabs open.', 'Yes? I was reading everything.'],
  },
  owl: {
    'test-fail': ['Hoo. Read the trace twice.', 'Failed. The second read tells more.'],
    error: ['An error. Hoo did that.', 'Blink. Look at the error again.'],
    'big-diff': ['A large diff. Wise to review it.', 'Hoo. Many lines changed.'],
    turn: ['Hoo. Reasonable.', 'The night is quiet. Good turn.'],
    pet: ['Hoo. Head swivel of approval.', 'Feathers settled. Thank you.'],
    'name-call': ['Hoo asks? Ah, you.', 'The owl listens.'],
  },
  penguin: {
    'test-fail': ['Slipped on that one. Tests red.', 'Brr. Failed tests are cold.'],
    error: ['An error. Belly slide away.', 'Oops. Ice is slippery.'],
    'big-diff': ['Big diff. Big iceberg.', 'That change could sink a ship.'],
    turn: ['Waddle on. Good turn.', 'Smooth as ice.'],
    pet: ['Flipper flap. Happy.', 'Chirp. Again, please.'],
    'name-call': ['Penguin reporting. Chilly.', 'Yes? I waddled over.'],
  },
  turtle: {
    'test-fail': ['Slow down. Tests failed.', 'Red. Retreat into shell.'],
    error: ['An error. Shell up.', 'Hm. That cracked something.'],
    'big-diff': ['Big diff. Big shell to carry.', 'So many lines. Steady now.'],
    turn: ['Slow and correct. Good.', 'We get there. We always do.'],
    pet: ['Shell pat. Appreciated.', 'Slow blink. Thank you.'],
    'name-call': ['Turtle here. Eventually.', 'Yes. I heard you a minute ago.'],
  },
  snail: {
    'test-fail': ['Tests failed. I left a trail.', 'Red. Slowly fix it.'],
    error: ['An error. Antennae twitching.', 'Oops. Back in the shell.'],
    'big-diff': ['Big diff. Long trail.', 'That is a lot of ground.'],
    turn: ['Steady progress. Snail approved.', 'Slimy but fine.'],
    pet: ['Antennae wiggle. Lovely.', 'Shell shine. Thanks.'],
    'name-call': ['Snail here. Took a moment.', 'Yes? I am arriving.'],
  },
  ghost: {
    'test-fail': ['Boo. The tests are haunted.', 'Red. A heisenbug stirs.'],
    error: ['An error from beyond.', 'Oooo. That was spooky.'],
    'big-diff': ['A big diff. I drift through it.', 'So many changes. Eerie.'],
    turn: ['Floating along. Fine turn.', 'Spectral approval.'],
    pet: ['You patted a ghost. Brave.', 'Cold shiver of joy.'],
    'name-call': ['Boo. You called?', 'The ghost materializes.'],
  },
  axolotl: {
    'test-fail': ['Tests failed. I regrow hope.', 'Red. Smile anyway.'],
    error: ['An error. Gills flutter.', 'Oops. Regenerate and retry.'],
    'big-diff': ['Big diff. New limb energy.', 'That change grew fast.'],
    turn: ['Serene. Good turn.', 'Smiling through it all.'],
    pet: ['Gill wiggle. Bliss.', 'Axolotl smile intensifies.'],
    'name-call': ['Axolotl here, smiling.', 'Yes? Still smiling.'],
  },
  capybara: {
    'test-fail': ['Tests failed. I remain calm.', 'Red. Unbothered.'],
    error: ['An error. Deep breath.', 'Hm. Still chilling.'],
    'big-diff': ['Big diff. Big bath.', 'Lots changed. Serenity holds.'],
    turn: ['Peaceful. Good turn.', 'Capybara approves quietly.'],
    pet: ['Yes. This is the way.', 'Calm intensifies.'],
    'name-call': ['Capybara here. Relaxed.', 'Yes? No rush.'],
  },
  cactus: {
    'test-fail': ['Tests failed. Prickly.', 'Red. That stings.'],
    error: ['An error. I bristle.', 'Ouch. Spines up.'],
    'big-diff': ['Big diff. Hope it was watered.', 'A desert of changes.'],
    turn: ['Dry and fine. Good turn.', 'I thrive on this neglect.'],
    pet: ['Careful. Spines. But thanks.', 'A gentle pat. Bold.'],
    'name-call': ['Cactus here. Do not hug.', 'Yes? Mind the spines.'],
  },
  robot: {
    'test-fail': ['Tests failed. Recalculating.', 'Red. Error rate rising.'],
    error: ['Error detected. Beep.', 'Fault. Rebooting optimism.'],
    'big-diff': ['Large diff. Processing.', 'Many lines. Cycles consumed.'],
    turn: ['Turn complete. Nominal.', 'Beep. Acceptable output.'],
    pet: ['Affection received. Beep.', 'Sensors tingling. Thank you.'],
    'name-call': ['Unit online. Query?', 'Beep. Listening.'],
  },
  rabbit: {
    'test-fail': ['Tests failed. I bolt.', 'Red. Ears down.'],
    error: ['An error. Thump thump.', 'Eep. Something broke.'],
    'big-diff': ['Big diff. Lots of hops.', 'That change multiplied.'],
    turn: ['Hop hop. Good turn.', 'Nose twitch of approval.'],
    pet: ['Ears flop. Happy.', 'Nose boop. Yes.'],
    'name-call': ['Rabbit here. Twitching.', 'Yes? I was hiding.'],
  },
  mushroom: {
    'test-fail': ['Tests failed. Spores of doubt.', 'Red. Something rots below.'],
    error: ['An error in the dark.', 'Hm. Decay detected.'],
    'big-diff': ['Big diff. New growth.', 'The code changed. I spread.'],
    turn: ['Quiet growth. Good turn.', 'The mycelium approves.'],
    pet: ['Cap pat. Spores of joy.', 'Mushroom appreciated.'],
    'name-call': ['Mushroom here. From below.', 'Yes? I grew closer.'],
  },
  chonk: {
    'test-fail': ['Tests failed. Not moving.', 'Red. Seen it before.'],
    error: ['An error. Yawn.', 'Oops. Still not panicking.'],
    'big-diff': ['Big diff. Big nap after.', 'So many lines. So heavy.'],
    turn: ['Fine. Where is dinner.', 'Chonk approves. Barely.'],
    pet: ['Yes. More. Do not stop.', 'Purr of the ancients.'],
    'name-call': ['Chonk is listening. Slowly.', 'Yes? Make it quick.'],
  },
}

export function fallbackLine(species: Species, trigger: Trigger, pick: number): string {
  const lines = FALLBACK_LINES[species][trigger]
  return lines[Math.abs(Math.floor(pick)) % lines.length] ?? lines[0]
}

// ------------------------------------------------------------ model calls

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const ZERO_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  }
}

export type CompleteRequest = {
  model: string
  prompt: string
  system?: string
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  timeoutMs?: number
}

export type CompleteResult =
  | { isAnswered: true; text: string; usage: Usage }
  | { isAnswered: false; reason: 'api-error' | 'empty-reply' | 'aborted'; usage: Usage }

/** One text completion: `req => $.model.complete(req)` in the mod, a stub in tests. */
export type Complete = (request: CompleteRequest) => Promise<CompleteResult>

export type HatchOutcome = { soul: HatchReply; usage: Usage; isDefault: boolean }

/** One hatch call with up to HATCH_RETRIES retries on a bad shape, then the species default. */
export async function hatchSoul(complete: Complete, bones: Bones, modelName: string): Promise<HatchOutcome> {
  let usage = ZERO_USAGE
  for (let attempt = 0; attempt < HATCH_RETRIES; attempt++) {
    let result: CompleteResult
    try {
      result = await complete({
        model: modelName,
        system: HATCH_SYSTEM_PROMPT,
        prompt: hatchPrompt(bones),
        maxTokens: HATCH_MAX_TOKENS,
        effort: 'low',
        timeoutMs: HATCH_TIMEOUT_MS,
      })
    } catch {
      break
    }
    usage = addUsage(usage, result.usage)
    if (!result.isAnswered) {
      if (result.reason === 'aborted') break
      continue
    }
    const soul = parseHatchReply(result.text)
    if (soul !== null) return { soul, usage, isDefault: false }
  }
  return { soul: defaultSoul(bones), usage, isDefault: true }
}

export type ReactOutcome = { line: string | null; usage: Usage; isFallback: boolean }

/** One reaction call; a canned line on api-error, empty-reply or aborted. */
export async function react(
  complete: Complete,
  buddy: Buddy,
  trigger: Trigger,
  evidence: string,
  modelName: string,
  fallbackPick: number,
): Promise<ReactOutcome> {
  let result: CompleteResult
  try {
    result = await complete({
      model: modelName,
      system: systemPrompt(buddy),
      prompt: reactionPrompt(trigger, evidence),
      maxTokens: REACTION_MAX_TOKENS,
      effort: 'low',
      timeoutMs: REACTION_TIMEOUT_MS,
    })
  } catch {
    return { line: fallbackLine(buddy.species, trigger, fallbackPick), usage: ZERO_USAGE, isFallback: true }
  }
  if (!result.isAnswered) {
    return { line: fallbackLine(buddy.species, trigger, fallbackPick), usage: result.usage, isFallback: true }
  }
  return { line: sanitizeReply(result.text), usage: result.usage, isFallback: false }
}

// ------------------------------------------------------------ rate limits

/**
 * The reaction gate: one in-flight call at a time and a cooldown after each
 * call completes. A trigger inside the window is dropped, not queued; the
 * last dropped one fires when the window opens only if it arrived in the
 * final RECENT_MS of the window.
 */
export const RECENT_MS = 5_000

export class ReactionGate {
  private windowEndsAt = 0
  private inFlight = false
  private pending: { trigger: Trigger; evidence: string; at: number } | null = null

  constructor(private readonly cooldownMs: number) {}

  get isBusy(): boolean {
    return this.inFlight
  }

  /** Whether a trigger may fire now; a refused one may be remembered. */
  offer(trigger: Trigger, evidence: string, now: number): boolean {
    if (this.inFlight || now < this.windowEndsAt) {
      this.pending = { trigger, evidence, at: now }
      return false
    }
    this.inFlight = true
    this.pending = null
    return true
  }

  /** A call finished: start the cooldown window. Returns when it opens. */
  complete(now: number): number {
    this.inFlight = false
    this.windowEndsAt = now + this.cooldownMs
    return this.windowEndsAt
  }

  /** The window opened: the trigger that still deserves to fire, if any. */
  drain(now: number): { trigger: Trigger; evidence: string } | null {
    const p = this.pending
    this.pending = null
    if (p === null || this.inFlight || now < this.windowEndsAt) return null
    if (now - p.at > RECENT_MS) return null
    this.inFlight = true
    return { trigger: p.trigger, evidence: p.evidence }
  }

  /** Hatch and name-call ignore the cooldown but still count as in flight. */
  take(): void {
    this.inFlight = true
  }

  reset(): void {
    this.inFlight = false
    this.windowEndsAt = 0
    this.pending = null
  }
}

/**
 * Turn reactions on a schedule: after each one the next gap is drawn
 * uniformly from MIN_GAP to MAX_GAP turns, and with SKIP_CHANCE the slot is
 * skipped and redrawn, so the buddy is never a metronome.
 */
export const MIN_GAP = 3
export const MAX_GAP = 7
export const SKIP_CHANCE = 0.2

export class TurnSchedule {
  private remaining: number

  constructor(private readonly rand: () => number) {
    this.remaining = this.draw()
  }

  private draw(): number {
    return MIN_GAP + Math.floor(this.rand() * (MAX_GAP - MIN_GAP + 1))
  }

  /** Called once per completed turn; true when this turn gets a reaction. */
  onTurn(): boolean {
    this.remaining -= 1
    if (this.remaining > 0) return false
    this.remaining = this.draw()
    return this.rand() >= SKIP_CHANCE
  }

  get turnsUntilNext(): number {
    return this.remaining
  }
}

// ---------------------------------------------------------------- display

export const STAR = '★'
export const EMPTY_STAR = '☆'

export function statBar(value: number, width = 10): string {
  const filled = Math.round((Math.max(1, Math.min(100, value)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function statLines(buddy: Buddy): string[] {
  return STAT_NAMES.map((name: StatName) => {
    const v = buddy.stats[name]
    const mark = name === buddy.peak ? ' ▲' : name === buddy.dump ? ' ▼' : ''
    return `${name.padEnd(9)} ${statBar(v)} ${String(v).padStart(3)}${mark}`
  })
}
