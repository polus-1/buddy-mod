// draw.tsx: the trees the buddy draws. Pure functions of their inputs: they
// take the surface's element table and return a RenderElement.

import type { Elements, RenderElement } from 'claude-code'

import { HAT_LABELS, STARS } from './bones'
import type { Buddy } from './soul'
import { statLines } from './soul'
import type { BuddySpend } from '../types'
import { FRAME_WIDTH, HEART_FRAMES, RARITY_COLOR, SHINY_COLOR, renderSprite, spriteColor } from './sprites'
import type { FrameIndex } from './sprites'

/** The elements every surface the band draws on has (terminal and desktop). */
export type Table = Pick<Elements['terminal'], 'Box' | 'Text'>

/** Under this many columns the band collapses to the sprite alone. */
export const COLLAPSE_COLUMNS = 40
export const BUBBLE_MAX_COLUMNS = 60
/** The original card's fixed width. */
export const CARD_WIDTH = 40
export const STAR = '★'

export type BandView = {
  buddy: Buddy
  frame: FrameIndex
  tick: number
  bubble: string | null
  /** The hearts frame to overlay, or null. */
  hearts: number | null
  /** Cells across the band (`e.props.bodyColumns`). */
  columns: number
  /** The hatch animation's frame, or null. */
  hatching: number | null
}

// ------------------------------------------------------------------ hatch

/** The original's hatch timing: 160 ms a tick, four wobble frames cycled three times, then the cracks. */
export const HATCH_TICK_MS = 160
export const HATCH_WOBBLE_FRAMES = 4
export const HATCH_WOBBLE_CYCLES = 3

/** An egg wobbling (frames 0-3), cracking (4-9) and bursting (10). Original art. */
export const HATCH_FRAMES: readonly (readonly string[])[] = [
  ['    .---.    ', '   /     \\   ', '  |       |  ', '  |       |  ', '   \\_____/   '],
  ['     .---.   ', '    /     \\  ', '   |       | ', '   |       | ', '    \\_____/  '],
  ['   .---.     ', '  /     \\    ', ' |       |   ', ' |       |   ', '  \\_____/    '],
  ['     .---.   ', '    /     \\  ', '   |       | ', '   |       | ', '    \\_____/  '],
  ['    .---.    ', '   /     \\   ', '  |   .   |  ', '  |       |  ', '   \\_____/   '],
  ['    .---.    ', '   /     \\   ', '  |   /   |  ', '  |       |  ', '   \\_____/   '],
  ['    .---.    ', '   /  .  \\   ', '  |  / \\  |  ', '  |       |  ', '   \\_____/   '],
  ['    .---.    ', '   / / \\ \\   ', '  | /   \\ |  ', '  |   .   |  ', '   \\_____/   '],
  ['    .-_-.    ', '   / / \\ \\   ', '  | /   \\ |  ', '  |  \\ /  |  ', '   \\__v__/   '],
  ['    ._ _.    ', '   / v v \\   ', '  |/     \\|  ', '  |  \\ /  |  ', '   \\__v__/   '],
  ['   .  *  .   ', '  *       *  ', ' .    *    . ', '  *       *  ', '   .  *  .   '],
]
export const HATCH_WOBBLE_TICKS = HATCH_WOBBLE_FRAMES * HATCH_WOBBLE_CYCLES
export const HATCH_CRACK_FRAMES = HATCH_FRAMES.length - HATCH_WOBBLE_FRAMES

// ------------------------------------------------------------------ sprite

type Segment = { text: string; isHeart: boolean }

/** Overlays a hearts frame on sprite lines, char by char, as coloured runs. */
function overlayHearts(lines: string[], heartsFrame: readonly string[] | undefined): Segment[][] {
  return lines.map((line, row) => {
    // the hat row (when the sprite is 6 tall) sits above the 5 heart rows
    const heartRow = heartsFrame?.[row - (lines.length - heartsFrame.length)]
    if (heartRow === undefined) return [{ text: line, isHeart: false }]
    const chars = [...line]
    const segments: Segment[] = []
    for (let col = 0; col < chars.length; col++) {
      const over = heartRow[col]
      const isHeart = over !== undefined && over !== ' '
      const text = isHeart ? over : (chars[col] ?? ' ')
      const last = segments[segments.length - 1]
      if (last !== undefined && last.isHeart === isHeart) last.text += text
      else segments.push({ text, isHeart })
    }
    return segments
  })
}

export function spriteLines(view: BandView): string[] {
  const { buddy, frame } = view
  return renderSprite({ species: buddy.species, eyes: buddy.eyes, hat: buddy.hat, shiny: buddy.shiny }, frame)
}

/** The sprite column: 12 cells wide, 5 or 6 rows, hearts over it while petting. */
export function drawSprite(ui: Table, view: BandView): RenderElement {
  const { Box, Text } = ui
  const color = spriteColor(view.buddy, view.tick)
  const heartColor = RARITY_COLOR[view.buddy.rarity]
  const rows = overlayHearts(spriteLines(view), view.hearts === null ? undefined : HEART_FRAMES[view.hearts])
  return (
    <Box flexDirection="column" width={FRAME_WIDTH} flexShrink={0}>
      {rows.map(segments => (
        <Box flexDirection="row">
          {segments.map(s => (
            <Text color={s.isHeart ? heartColor : color} wrap="truncate">
              {s.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

/** The speech bubble to the right of the sprite. */
export function drawBubble(ui: Table, text: string, width: number): RenderElement {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" alignItems="flex-start" marginLeft={1}>
      <Box borderStyle="round" paddingX={1} width={Math.max(8, Math.min(BUBBLE_MAX_COLUMNS, width))} flexShrink={1}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    </Box>
  )
}

/** The egg while hatching: the frame in the rarity colour, and a line of dim text. */
export function drawHatching(ui: Table, view: BandView): RenderElement {
  const { Box, Text } = ui
  const frame = HATCH_FRAMES[Math.min(view.hatching ?? 0, HATCH_FRAMES.length - 1)] ?? []
  const isBurst = (view.hatching ?? 0) >= HATCH_FRAMES.length - 1
  return (
    <Box flexDirection="row" alignItems="center">
      <Box flexDirection="column" flexShrink={0}>
        {frame.map(line => (
          <Text color={isBurst ? SHINY_COLOR : RARITY_COLOR[view.buddy.rarity]}>{line}</Text>
        ))}
      </Box>
      <Text dimColor> {isBurst ? 'hatched!' : 'hatching...'}</Text>
    </Box>
  )
}

/** The band: sprite column left, bubble right; sprite alone under 40 columns. */
export function drawBand(ui: Table, view: BandView): RenderElement {
  const { Box } = ui
  if (view.hatching !== null) return drawHatching(ui, view)
  const sprite = drawSprite(ui, view)
  const bubbleWidth = view.columns - FRAME_WIDTH - 2
  if (view.bubble === null || view.columns < COLLAPSE_COLUMNS || bubbleWidth < 8) {
    return <Box flexDirection="row">{sprite}</Box>
  }
  return (
    <Box flexDirection="row" alignItems="center">
      {sprite}
      {drawBubble(ui, view.bubble, bubbleWidth)}
    </Box>
  )
}

// -------------------------------------------------------------------- card

export function stars(buddy: Buddy): string {
  return STAR.repeat(STARS[buddy.rarity])
}

export function hatchDate(buddy: Buddy): string {
  const d = new Date(buddy.hatchedAt)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'unknown'
}

export function spendText(spend: BuddySpend): string {
  const inTokens = spend.input_tokens + spend.cache_read_input_tokens + spend.cache_creation_input_tokens
  return `${spend.calls} call${spend.calls === 1 ? '' : 's'}, ${inTokens} in / ${spend.output_tokens} out tokens this session`
}

/** The card's header row: stars and rarity left, species right, as the original laid it out. */
export function cardHeader(buddy: Buddy, width = CARD_WIDTH - 4): string {
  const left = `${stars(buddy)} ${buddy.rarity.toUpperCase()}`
  const right = buddy.species.toUpperCase()
  const gap = Math.max(1, width - left.length - right.length)
  return `${left}${' '.repeat(gap)}${right}`
}

export const SHINY_BADGE = '✨ SHINY ✨'

/** The card as plain text, for the command's output row and the model. */
export function cardText(buddy: Buddy, spend: BuddySpend, lastSaid: string | null, note?: string): string[] {
  const sprite = renderSprite({ species: buddy.species, eyes: buddy.eyes, hat: buddy.hat, shiny: buddy.shiny }, 0)
  const lines = [
    cardHeader(buddy),
    '',
    ...sprite,
    '',
    `${buddy.name}${buddy.shiny ? `  ${SHINY_BADGE}` : ''}`,
    `${HAT_LABELS[buddy.hat]} · ${buddy.eyes} eyes`,
    '',
    `"${buddy.personality}"`,
    '',
    ...statLines(buddy),
  ]
  if (lastSaid !== null) lines.push('', 'last said', `  "${lastSaid}"`)
  lines.push('', `Hatched ${hatchDate(buddy)} · ${spendText(spend)}`)
  if (note !== undefined) lines.push(note)
  return lines
}

/** Whether a `/buddy` output row is the card (and not a one-line answer). */
export function isCardText(text: string, buddy: Buddy): boolean {
  return text.startsWith(cardHeader(buddy)) && text.includes('DEBUGGING')
}

/**
 * The card as a tree, in the original's shape: a 40-wide box in the rarity
 * colour, stars and species up top, the art, the name in bold (gold when
 * shiny), the personality in italics, the five stat bars, and what the buddy
 * last said.
 */
export function drawCard(ui: Table, buddy: Buddy, spend: BuddySpend, columns: number, lastSaid: string | null, note?: string): RenderElement {
  const { Box, Text } = ui
  const rarityColor = RARITY_COLOR[buddy.rarity]
  const width = Math.max(24, Math.min(CARD_WIDTH, columns))
  const view: BandView = { buddy, frame: 0, tick: 0, bubble: null, hearts: null, columns, hatching: null }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={rarityColor} paddingX={1} width={width}>
      <Text color={rarityColor} bold>
        {cardHeader(buddy, width - 4)}
      </Text>
      <Box marginTop={1}>{drawSprite(ui, view)}</Box>
      <Box marginTop={1} flexDirection="row">
        <Text bold color={buddy.shiny ? SHINY_COLOR : rarityColor}>
          {buddy.name}
        </Text>
        {buddy.shiny ? <Text color={SHINY_COLOR}>{'  '}{SHINY_BADGE}</Text> : null}
      </Box>
      <Text dimColor>
        {HAT_LABELS[buddy.hat]} · {buddy.eyes} eyes
      </Text>
      <Box marginTop={1}>
        <Text italic dimColor wrap="wrap">
          "{buddy.personality}"
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {statLines(buddy).map(line => (
          <Text color={line.startsWith(buddy.peak) ? rarityColor : undefined} dimColor={line.startsWith(buddy.dump)}>
            {line}
          </Text>
        ))}
      </Box>
      {lastSaid !== null ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>last said</Text>
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text wrap="wrap">"{lastSaid}"</Text>
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor wrap="wrap">
          Hatched {hatchDate(buddy)} · {spendText(spend)}
        </Text>
        {note !== undefined ? <Text dimColor wrap="wrap">{note}</Text> : null}
      </Box>
    </Box>
  )
}
