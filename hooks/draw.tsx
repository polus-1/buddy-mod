// draw.tsx: the trees the buddy draws. Pure functions of their inputs: they
// take the surface's element table and return a RenderElement.

import type { Elements, RenderElement } from 'claude-code'

import { STARS } from './bones'
import type { Buddy } from './soul'
import { statLines } from './soul'
import type { BuddySpend } from '../types'
import {
  FRAME_WIDTH,
  HEART_FRAMES,
  RARITY_COLOR,
  renderSprite,
  spriteColor,
} from './sprites'
import type { FrameIndex } from './sprites'

/** The elements every surface the band draws on has (terminal and desktop). */
export type Table = Pick<Elements['terminal'], 'Box' | 'Text'>

/** Under this many columns the band collapses to the sprite alone. */
export const COLLAPSE_COLUMNS = 40
export const BUBBLE_MAX_COLUMNS = 60
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
  /** The hatch animation's step, or null. */
  hatching: number | null
}

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
      const isHeart = heartRow[col] === '♥'
      const text = isHeart ? '♥' : (chars[col] ?? ' ')
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

const HATCH_STEPS = ['   ( )   ', '  (   )  ', '  ( . )  ', '  (°  )  ', '  ( ° )  ', ' (  °  ) ', ' ( ° ° ) ', ' ( crack )', '   ...   ']

/** The band: sprite column left, bubble right; sprite alone under 40 columns. */
export function drawBand(ui: Table, view: BandView): RenderElement {
  const { Box, Text } = ui
  if (view.hatching !== null) {
    const step = HATCH_STEPS[Math.min(view.hatching, HATCH_STEPS.length - 1)] ?? ''
    return (
      <Box flexDirection="row" alignItems="center">
        <Text color={RARITY_COLOR[view.buddy.rarity]} bold>
          {step}
        </Text>
        <Text dimColor> something is hatching...</Text>
      </Box>
    )
  }
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

function titleCase(word: string): string {
  return word.replace(/\b\w/g, c => c.toUpperCase())
}

export function hatchDate(buddy: Buddy): string {
  const d = new Date(buddy.hatchedAt)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'unknown'
}

export function spendText(spend: BuddySpend): string {
  const inTokens = spend.input_tokens + spend.cache_read_input_tokens + spend.cache_creation_input_tokens
  return `${spend.calls} call${spend.calls === 1 ? '' : 's'}, ${inTokens} in / ${spend.output_tokens} out tokens this session`
}

/** The card as plain text, for the command's output row and the model. */
export function cardText(buddy: Buddy, spend: BuddySpend): string[] {
  const sprite = renderSprite({ species: buddy.species, eyes: buddy.eyes, hat: buddy.hat, shiny: buddy.shiny }, 0)
  const rarity = `${titleCase(buddy.rarity)} ${stars(buddy)}${buddy.shiny ? ' ✦ shiny' : ''}`
  const lines = [
    ...sprite.map(l => `  ${l}`),
    '',
    `  ${buddy.name}`,
    `  ${titleCase(buddy.species)} · ${rarity}`,
    `  Hat: ${buddy.hat} · Eyes: ${buddy.eyes}`,
    '',
    ...statLines(buddy).map(l => `  ${l}`),
    '',
    `  ${buddy.personality}`,
    `  Hatched ${hatchDate(buddy)} · ${spendText(spend)}`,
  ]
  return lines
}

/** The card as a tree: sprite, name, species and rarity, stat bars, personality. */
export function drawCard(ui: Table, buddy: Buddy, spend: BuddySpend, columns: number): RenderElement {
  const { Box, Text } = ui
  const rarityColor = RARITY_COLOR[buddy.rarity]
  const view: BandView = { buddy, frame: 0, tick: 0, bubble: null, hearts: null, columns, hatching: null }
  const sprite = drawSprite(ui, view)
  const facts = (
    <Box flexDirection="column" marginLeft={2}>
      <Text bold color={rarityColor}>
        {buddy.name}
      </Text>
      <Text>
        {titleCase(buddy.species)} · {titleCase(buddy.rarity)}{' '}
        <Text color={rarityColor}>{stars(buddy)}</Text>
        {buddy.shiny ? <Text color="whiteBright"> ✦ shiny</Text> : null}
      </Text>
      <Text dimColor>
        Hat: {buddy.hat} · Eyes: {buddy.eyes}
      </Text>
    </Box>
  )
  const narrow = columns < 56
  return (
    <Box flexDirection="column" paddingY={0}>
      <Box flexDirection={narrow ? 'column' : 'row'} alignItems={narrow ? 'flex-start' : 'center'}>
        {sprite}
        {facts}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {statLines(buddy).map(line => (
          <Text color={line.includes('▲') ? rarityColor : undefined} dimColor={line.includes('▼')}>
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text italic wrap="wrap">
          {buddy.personality}
        </Text>
        <Text dimColor>
          Hatched {hatchDate(buddy)} · {spendText(spend)}
        </Text>
      </Box>
    </Box>
  )
}
