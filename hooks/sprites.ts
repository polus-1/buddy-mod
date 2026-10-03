// sprites.ts: pure data and pure functions. No `$`, no I/O.
//
// Every species has 4 frames: 3 idle (0, 1, 2) and 1 blink (-1). A frame is
// 5 lines, each at most 12 columns wide, with exactly one `{E}` token where
// the eyes go. `{E}` is 3 columns wide and renders as 3 columns (`◉ ◉`), so a
// frame's raw width is its rendered width and nothing shifts between eye
// styles. The blink frame renders its eyes as `- -`. The art is original; the
// grid, the eye slot, the frame indices and the 15-step idle loop are the
// original's.
//
// Hats are one-line overlays composited above line 0, centred on the eye
// slot, so a hatted sprite is 6 lines tall (as the original's was).
//
// To change a species' look, replace its four frames. To add a species, add a
// key here, add its name to a rarity tier in bones.ts, and add a fallback
// block in soul.ts; `claude plugin test` checks the frame shapes.

import type { Eyes, Hat, Rarity, Species } from './bones'

export const FRAME_WIDTH = 12
export const FRAME_HEIGHT = 5
export const EYE_TOKEN = '{E}'

/** One idle loop: 500 ms a tick, 7.5 s around; -1 is the blink frame. */
export const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0] as const
export const TICK_MS = 500

export type Frame = readonly [string, string, string, string, string]
export type FrameIndex = 0 | 1 | 2 | -1

export type SpriteSheet = {
  /** Idle frames 0, 1, 2 and the blink frame, in that order. */
  frames: readonly [Frame, Frame, Frame, Frame]
}

const sheet = (f0: Frame, f1: Frame, f2: Frame, blink: Frame): SpriteSheet => ({
  frames: [f0, f1, f2, blink],
})

export const SPRITES: Record<Species, SpriteSheet> = {
  // ---------------------------------------------------------------- common
  duck: sheet(
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '    ^  ^    '],
    ['    __      ', '  <({E})    ', '   (    )__ ', '   (_____)  ', '    ^  ^    '],
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '     ^ ^    '],
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '    ^  ^    '],
  ),
  goose: sheet(
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____   ', '  (______)  '],
    ['   _        ', '  ({E})     ', '   \\ )      ', '    |(____  ', '   (______) '],
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____~  ', '  (______)  '],
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____   ', '  (______)  '],
  ),
  blob: sheet(
    ['            ', '   .----.   ', '  ( {E}  )  ', '  (  __  )  ', "   `----'   "],
    ['            ', '    .--.    ', '  ( {E} )   ', ' (   __   ) ', " `--------' "],
    ['   .----.   ', '  ( {E}  )  ', '  (  __  )  ', '  (      )  ', "   `----'   "],
    ['            ', '   .----.   ', '  ( {E}  )  ', '  (  __  )  ', "   `----'   "],
  ),
  cat: sheet(
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', '  (_)(_)_/  '],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', "  (_)(_)-'  "],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   ) (   ', '  (_)(_)_\\  '],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', '  (_)(_)_/  '],
  ),
  dragon: sheet(
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )>~', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '  //|___|\\\\ ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
  ),
  octopus: sheet(
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ' ( ) ) ` "],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   \\|\\|/|/  ', '  , ( ) ( , '],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ) ) ( ) ` "],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ' ( ) ) ` "],
  ),
  // -------------------------------------------------------------- uncommon
  owl: sheet(
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '   "   "    '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (  v  )   ', '  (|||||)   ', '   "   "    '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '    " "     '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '   "   "    '],
  ),
  penguin: sheet(
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '   ^"--"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  / (   ) \\ ', '   ^"--"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '    ^"-"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '   ^"--"^   '],
  ),
  turtle: sheet(
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '   U     U  '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '    U   U   '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', '  ({E})_|_|)', '   U     U  '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '   U     U  '],
  ),
  snail: sheet(
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '   /______  ', '  (_______) '],
    ['  {E} .--.  ', '  \\/ ( @) ) ', "   \\  `--'  ", '   /______  ', '  (_______) '],
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '    /______ ', '   (_______)'],
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '   /______  ', '  (_______) '],
  ),
  // ------------------------------------------------------------------ rare
  ghost: sheet(
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^--^-'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '^--^-^'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^^--^'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^--^-'  "],
  ),
  axolotl: sheet(
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (_______)', '    "   "   '],
    [' ~( .--. )~ ', '  ~({E}  )~ ', '   ( ~~  )_ ', '   (_______)', '    "   "   '],
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (______~)', '     " "    '],
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (_______)', '    "   "   '],
  ),
  capybara: sheet(
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||   ||  '],
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||  ||   '],
    ['   .-----.  ', '  ( {E}   )_', '  (  ..   |)', '  (______|_/', '   ||   ||  '],
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||   ||  '],
  ),
  // ------------------------------------------------------------------ epic
  cactus: sheet(
    ['    _|_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
    ['    _|_     ', '   | {E} |  ', ' _ |  __ | _', ' |_|     |_|', '   |_____|  '],
    ['    _*_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
    ['    _|_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
  ),
  robot: sheet(
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
    ['    _()_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  --  |o ', "  '------'  "],
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
  ),
  rabbit: sheet(
    ['   (\\ /)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\_/)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\ \\)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\ /)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
  ),
  // ------------------------------------------------------------- legendary
  mushroom: sheet(
    ['   .-""""-. ', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['  _.-""""-._', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['   .-"..."-.', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['   .-""""-. ', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
  ),
  chonk: sheet(
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "-------" '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "------"~ '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', '(          )', ' "--------" '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "-------" '],
  ),
}

/** One-line hat overlays, each centred on the eye slot when composited. */
export const HAT_ROWS: Record<Exclude<Hat, 'none'>, string> = {
  crown: '\\^^^/',
  tophat: '_|=|_',
  propeller: '-=+=-',
  halo: '.-o-.',
  wizard: '_/^\\_',
  beanie: '(===)',
  tinyduck: '<(o)>',
}

/** Rarity colours, as the original mapped them: grey, green, blue, purple, gold. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: 'gray',
  uncommon: 'green',
  rare: 'blue',
  epic: 'magenta',
  legendary: 'yellow',
}

/** Shiny buddies draw their name and badge in gold, as the original did. */
export const SHINY_COLOR = 'yellow'

export function frameAt(sheet: SpriteSheet, index: FrameIndex): Frame {
  return index === -1 ? sheet.frames[3] : sheet.frames[index]
}

/** The glyph pair drawn in the eye slot: `o o`, or `- -` while blinking. */
export function eyeGlyphs(eyes: Eyes, isBlink: boolean): string {
  const g = isBlink ? '-' : eyes
  return `${g} ${g}`
}

/** Substitutes the eye slot and pads each line to FRAME_WIDTH. */
export function renderFrame(frame: Frame, eyes: Eyes, isBlink: boolean): string[] {
  const glyphs = eyeGlyphs(eyes, isBlink)
  return frame.map(line => line.replace(EYE_TOKEN, glyphs).padEnd(FRAME_WIDTH))
}

/** The column the eye slot starts at, for centring a hat. */
export function eyeColumn(frame: Frame): number {
  for (const line of frame) {
    const at = line.indexOf(EYE_TOKEN)
    if (at >= 0) return at
  }
  return Math.floor(FRAME_WIDTH / 2) - 1
}

/** The hat row, positioned over the eye slot and padded to FRAME_WIDTH. */
export function hatRow(frame: Frame, hat: Hat): string | null {
  if (hat === 'none') return null
  const row = HAT_ROWS[hat]
  const centre = eyeColumn(frame) + 1
  const left = Math.max(0, Math.min(FRAME_WIDTH - row.length, centre - Math.floor(row.length / 2)))
  return (' '.repeat(left) + row).padEnd(FRAME_WIDTH)
}

export type SpriteLook = {
  species: Species
  eyes: Eyes
  hat: Hat
  shiny: boolean
}

/** The finished sprite: hat row (if any) then the 5 frame lines. */
export function renderSprite(look: SpriteLook, index: FrameIndex): string[] {
  const sheet = SPRITES[look.species]
  const frame = frameAt(sheet, index)
  const body = renderFrame(frame, look.eyes, index === -1)
  const hat = hatRow(frame, look.hat)
  return hat === null ? body : [hat, ...body]
}

/**
 * The sprite's colour: its rarity's, as the original drew it. A shiny buddy
 * shimmers between gold and its rarity colour, one tick on, one tick off.
 */
export function spriteColor(look: SpriteLook & { rarity: Rarity }, tick: number): string {
  const base = RARITY_COLOR[look.rarity]
  return look.shiny && tick % 2 === 1 ? SHINY_COLOR : base
}

/** Five frames of hearts rising over the sprite column, one row per tick, fading to dots. */
export const HEART_FRAMES: readonly (readonly string[])[] = [
  ['            ', '            ', '            ', '            ', '     ♥      '],
  ['            ', '            ', '            ', '   ♥   ♥    ', '     ♥      '],
  ['            ', '            ', '  ♥    ♥    ', '   ♥   ♥    ', '            '],
  ['            ', ' ♥   ♥   ♥  ', '  ♥    ♥    ', '            ', '            '],
  ['·   ·   ·  ·', ' ·   ·   ·  ', '            ', '            ', '            '],
]
export const HEART_TICKS = HEART_FRAMES.length
