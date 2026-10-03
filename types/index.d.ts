// The $.state contract of the buddy mod. Self-contained: no imports.
//
// Session state the render hook draws from lives here, so a hot reload keeps
// it and every write redraws the band. Durable data (the soul, mute, off,
// the fallback seed, picked bones) lives in $.store, not here.

/** The deterministic half of a buddy, as bones.ts computes it. */
export type BuddyBones = {
  species: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  shiny: boolean
  eyes: string
  hat: string
  stats: Record<'DEBUGGING' | 'PATIENCE' | 'CHAOS' | 'WISDOM' | 'SNARK', number>
  peak: 'DEBUGGING' | 'PATIENCE' | 'CHAOS' | 'WISDOM' | 'SNARK'
  dump: 'DEBUGGING' | 'PATIENCE' | 'CHAOS' | 'WISDOM' | 'SNARK'
  /** Seeds the hatch prompt's inspiration words. */
  inspirationSeed: number
}

/** The stored half: written once at hatch, carried over from ~/.claude.json when found. */
export type BuddySoul = {
  name: string
  personality: string
  /** Milliseconds since the epoch. */
  hatchedAt: number
}

/** The merged buddy the band and the card draw. */
export type BuddySnapshot = BuddyBones & BuddySoul

/** What the mod's own model calls have cost this session (ModelUsage shape). */
export type BuddySpend = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  calls: number
}

/** A line in the speech bubble: the text and when it was spoken. */
export type BuddyBubble = {
  text: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    buddy: {
      /** The merged buddy; null before the first /buddy hatches it. */
      buddy: BuddySnapshot | null
      /** Ticks since the animation started: the idle frame is IDLE_SEQUENCE[tick % 15]; shiny shimmers on it. */
      tick: number
      /** The bubble's line, cleared 10 s after it was spoken. */
      bubble: BuddyBubble | null
      /** The hearts frame drawn over the sprite during /buddy pet, else null. */
      hearts: number | null
      /** False while /buddy off hides the buddy. */
      visible: boolean
      /** True while /buddy mute silences the bubble and the model calls. */
      muted: boolean
      /** Haiku spend so far this session, shown on the card. */
      spend: BuddySpend
      /** The hatch animation's step while it plays, else null. */
      hatching: number | null
      /** The last line the buddy said this session, for the card's "last said" box. */
      lastSaid: string | null
    }
  }
}
