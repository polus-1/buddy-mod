// sprites.ts: pure data and pure functions. No `$`, no I/O.
//
// Every species has 4 frames: 3 idle (0, 1, 2) and 1 blink (-1). A frame is
// 5 lines, each at most 12 columns wide, with exactly one `{E}` token where
// the eyes go. `{E}` is 3 columns wide and renders as 3 columns (`o o`), so a
// frame's raw width is its rendered width and nothing shifts between eye
// styles. The blink frame renders its eyes as `- -`.
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
  /** The species' terminal colour (a theme key or a raw colour). */
  color: string
}

const sheet = (color: string, f0: Frame, f1: Frame, f2: Frame, blink: Frame): SpriteSheet => ({
  frames: [f0, f1, f2, blink],
  color,
})

export const SPRITES: Record<Species, SpriteSheet> = {
  // ---------------------------------------------------------------- common
  duck: sheet(
    'yellow',
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '    ^  ^    '],
    ['    __      ', '  <({E})    ', '   (    )__ ', '   (_____)  ', '    ^  ^    '],
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '     ^ ^    '],
    ['    __      ', '  <({E})    ', '   (    )_  ', '   (_____)  ', '    ^  ^    '],
  ),
  goose: sheet(
    'white',
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____   ', '  (______)  '],
    ['   _        ', '  ({E})     ', '   \\ )      ', '    |(____  ', '   (______) '],
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____~  ', '  (______)  '],
    ['   _        ', '  ({E})     ', '   | )      ', '   |(____   ', '  (______)  '],
  ),
  blob: sheet(
    'green',
    ['            ', '   .----.   ', '  ( {E}  )  ', '  (  __  )  ', "   `----'   "],
    ['            ', '    .--.    ', '  ( {E} )   ', ' (   __   ) ', " `--------' "],
    ['   .----.   ', '  ( {E}  )  ', '  (  __  )  ', '  (      )  ', "   `----'   "],
    ['            ', '   .----.   ', '  ( {E}  )  ', '  (  __  )  ', "   `----'   "],
  ),
  cat: sheet(
    'magenta',
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', '  (_)(_)_/  '],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', "  (_)(_)-'  "],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   ) (   ', '  (_)(_)_\\  '],
    ['  /\\_/\\     ', ' ( {E} )    ', ' (  w  )_   ', '  (   )  )  ', '  (_)(_)_/  '],
  ),
  dragon: sheet(
    'red',
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )>~', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '  //|___|\\\\ ', '  ^^    ^^  '],
    ['   /\\  /\\   ', '  ( {E}  )> ', '   \\  ~~ /  ', '   /|___|\\  ', '  ^^    ^^  '],
  ),
  octopus: sheet(
    'magenta',
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ' ( ) ) ` "],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   \\|\\|/|/  ', '  , ( ) ( , '],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ) ) ( ) ` "],
    ['    .---.   ', '   ( {E} )  ', '   ( ___ )  ', '   /|/|\\|\\  ', "  ' ( ) ) ` "],
  ),
  // -------------------------------------------------------------- uncommon
  owl: sheet(
    'yellow',
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '   "   "    '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (  v  )   ', '  (|||||)   ', '   "   "    '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '    " "     '],
    ['   /\\ /\\    ', '  ({E} )    ', '  (( v ))   ', '  (|||||)   ', '   "   "    '],
  ),
  penguin: sheet(
    'cyan',
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '   ^"--"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  / (   ) \\ ', '   ^"--"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '    ^"-"^   '],
    ['    .--.    ', '   ({E} )   ', '   /( v )\\  ', '  | (   ) | ', '   ^"--"^   '],
  ),
  turtle: sheet(
    'green',
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '   U     U  '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '    U   U   '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', '  ({E})_|_|)', '   U     U  '],
    ['    _____   ', '   /_____\\  ', '  /_______\\_', ' ({E} )_|_|)', '   U     U  '],
  ),
  snail: sheet(
    'cyan',
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '   /______  ', '  (_______) '],
    ['  {E} .--.  ', '  \\/ ( @) ) ', "   \\  `--'  ", '   /______  ', '  (_______) '],
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '    /______ ', '   (_______)'],
    ['  {E}  .--. ', '  \\/  ( @) )', "   \\   `--' ", '   /______  ', '  (_______) '],
  ),
  // ------------------------------------------------------------------ rare
  ghost: sheet(
    'white',
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^--^-'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '^--^-^'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^^--^'  "],
    ['   .----.   ', '  / {E}  \\  ', '  |  __  |  ', '  |      |  ', "  '-^--^-'  "],
  ),
  axolotl: sheet(
    'magenta',
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (_______)', '    "   "   '],
    [' ~( .--. )~ ', '  ~({E}  )~ ', '   ( ~~  )_ ', '   (_______)', '    "   "   '],
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (______~)', '     " "    '],
    [' ~( .--. )~ ', '   ({E}  )  ', '   ( ~~  )__', '   (_______)', '    "   "   '],
  ),
  capybara: sheet(
    'yellow',
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||   ||  '],
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||  ||   '],
    ['   .-----.  ', '  ( {E}   )_', '  (  ..   |)', '  (______|_/', '   ||   ||  '],
    ['   .-----.  ', '  ( {E}   )_', '  (  __   |)', '  (______|_/', '   ||   ||  '],
  ),
  // ------------------------------------------------------------------ epic
  cactus: sheet(
    'green',
    ['    _|_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
    ['    _|_     ', '   | {E} |  ', ' _ |  __ | _', ' |_|     |_|', '   |_____|  '],
    ['    _*_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
    ['    _|_     ', '   | {E} |  ', '  _|  __ |_ ', ' |_|     |_|', '   |_____|  '],
  ),
  robot: sheet(
    'cyan',
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
    ['    _()_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  --  |o ', "  '------'  "],
    ['    _[]_    ', '  .------.  ', '  | {E}  |  ', '  |  ==  |o ', "  '------'  "],
  ),
  rabbit: sheet(
    'white',
    ['   (\\ /)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\_/)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\ \\)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
    ['   (\\ /)    ', '   ( {E})   ', '   ( .. )   ', '  (( __ ))  ', '   (_)(_)   '],
  ),
  // ------------------------------------------------------------- legendary
  mushroom: sheet(
    'red',
    ['   .-""""-. ', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['  _.-""""-._', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['   .-"..."-.', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
    ['   .-""""-. ', '  (________)', '    |{E} |  ', '    | __ |  ', '    |____|  '],
  ),
  chonk: sheet(
    'yellow',
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "-------" '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "------"~ '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', '(          )', ' "--------" '],
    ['  /\\_____/\\ ', ' (  {E}   ) ', ' (   ww   ) ', ' (        ) ', '  "-------" '],
  ),
}

/** One-line hat overlays, each centred on the eye slot when composited. */
export const HAT_ROWS: Record<Exclude<Hat, 'none'>, string> = {
  crown: '\\^^^/',
  'top hat': '_|=|_',
  'propeller cap': '-=+=-',
  halo: '.-o-.',
  'wizard hat': '_/^\\_',
  beanie: '(===)',
  'tiny duck': '<(o)>',
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: 'gray',
  uncommon: 'green',
  rare: 'blue',
  epic: 'magenta',
  legendary: 'yellow',
}

export const SHINY_COLOR = 'whiteBright'

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

/** Shiny buddies alternate between their colour and bright white per frame. */
export function spriteColor(look: SpriteLook, tick: number): string {
  const base = SPRITES[look.species].color
  return look.shiny && tick % 2 === 1 ? SHINY_COLOR : base
}

/** Five frames of hearts rising over the sprite column, one row per tick. */
export const HEART_FRAMES: readonly (readonly string[])[] = [
  ['            ', '            ', '            ', '            ', '     ♥      '],
  ['            ', '            ', '            ', '   ♥   ♥    ', '     ♥      '],
  ['            ', '            ', '  ♥    ♥    ', '   ♥   ♥    ', '            '],
  ['            ', ' ♥   ♥   ♥  ', '  ♥    ♥    ', '            ', '            '],
  ['♥   ♥   ♥  ♥', ' ♥   ♥   ♥  ', '            ', '            ', '            '],
]
export const HEART_TICKS = HEART_FRAMES.length
