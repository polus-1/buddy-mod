import { describe, expect, test } from 'claude-code/testing'

import { EYES, HATS, SPECIES } from './bones'
import {
  EYE_TOKEN,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  HAT_ROWS,
  HEART_FRAMES,
  IDLE_SEQUENCE,
  SPRITES,
  eyeGlyphs,
  hatRow,
  renderFrame,
  renderSprite,
  spriteColor,
} from './sprites'
import type { FrameIndex } from './sprites'

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/
const INDICES: FrameIndex[] = [0, 1, 2, -1]

describe('frame shapes', () => {
  test('every species has 4 frames of 5 lines, each at most 12 wide, with exactly one eye slot', async () => {
    expect(Object.keys(SPRITES).sort()).toEqual([...SPECIES].sort())
    let frames = 0
    for (const species of SPECIES) {
      const sheet = SPRITES[species]
      expect(sheet.frames).toHaveLength(4)
      expect(typeof sheet.color).toBe('string')
      for (const frame of sheet.frames) {
        frames++
        expect(frame).toHaveLength(FRAME_HEIGHT)
        const eyes = frame.join('\n').split(EYE_TOKEN).length - 1
        expect(eyes, `${species}: one eye slot per frame`).toBe(1)
        for (const line of frame) {
          expect(line.length, `${species}: "${line}" is ${line.length} wide`).toBeLessThanOrEqual(FRAME_WIDTH)
          expect(PRINTABLE_ASCII.test(line), `${species}: "${line}" has a non-ASCII character`).toBe(true)
        }
      }
    }
    expect(frames).toBe(SPECIES.length * 4)
  })

  test('hat rows are printable ASCII and fit the frame', async () => {
    for (const hat of HATS) {
      if (hat === 'none') continue
      const row = HAT_ROWS[hat]
      expect(row.length).toBeLessThanOrEqual(FRAME_WIDTH)
      expect(PRINTABLE_ASCII.test(row)).toBe(true)
      for (const species of SPECIES) {
        const placed = hatRow(SPRITES[species].frames[0], hat)
        expect(placed).not.toBeNull()
        expect(placed?.length).toBe(FRAME_WIDTH)
        expect(placed?.trim()).toBe(row)
      }
    }
    expect(hatRow(SPRITES.duck.frames[0], 'none')).toBeNull()
  })

  test('rendering substitutes the eyes, pads to 12 and never wraps', async () => {
    for (const species of SPECIES) {
      for (const eyes of EYES) {
        for (const index of INDICES) {
          for (const hat of HATS) {
            const lines = renderSprite({ species, eyes, hat, shiny: false }, index)
            expect(lines).toHaveLength(hat === 'none' ? FRAME_HEIGHT : FRAME_HEIGHT + 1)
            for (const line of lines) {
              expect([...line]).toHaveLength(FRAME_WIDTH)
              expect(line).not.toContain(EYE_TOKEN)
            }
            const body = lines.slice(hat === 'none' ? 0 : 1).join('\n')
            expect(body).toContain(eyeGlyphs(eyes, index === -1))
          }
        }
      }
    }
  })

  test('the blink frame closes the eyes', async () => {
    expect(eyeGlyphs('o', true)).toBe('- -')
    expect(eyeGlyphs('@', false)).toBe('@ @')
    const blink = renderFrame(SPRITES.cat.frames[3], 'o', true).join('\n')
    expect(blink).toContain('- -')
    expect(blink).not.toContain('o o')
  })

  test('shiny alternates colour per tick; plain buddies keep theirs', async () => {
    const plain = { species: 'ghost', eyes: 'o', hat: 'none', shiny: false } as const
    const shiny = { ...plain, shiny: true }
    expect(spriteColor(plain, 0)).toBe(SPRITES.ghost.color)
    expect(spriteColor(plain, 1)).toBe(SPRITES.ghost.color)
    expect(spriteColor(shiny, 0)).toBe(SPRITES.ghost.color)
    expect(spriteColor(shiny, 1)).toBe('whiteBright')
  })

  test('the idle sequence is the original 15-step loop and hearts are 5 frames of 12 columns', async () => {
    expect([...IDLE_SEQUENCE]).toEqual([0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0])
    expect(HEART_FRAMES).toHaveLength(5)
    for (const frame of HEART_FRAMES) {
      expect(frame).toHaveLength(FRAME_HEIGHT)
      for (const line of frame) {
        expect([...line]).toHaveLength(FRAME_WIDTH)
        expect(/^[ ♥]*$/.test(line)).toBe(true)
      }
    }
  })
})
