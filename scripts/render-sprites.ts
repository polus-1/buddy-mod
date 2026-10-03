// Renders every species x frame with every eye glyph and hat to a text file,
// for review. Run: bun scripts/render-sprites.ts > scripts/sprites-preview.txt
import { EYES, HAT_LABELS, HATS, SPECIES } from '../hooks/bones'
import { FRAME_WIDTH, SPRITES, renderSprite } from '../hooks/sprites'
import type { FrameIndex } from '../hooks/sprites'

const INDICES: FrameIndex[] = [0, 1, 2, -1]
const out: string[] = []
const box = (lines: string[]) => lines.map(l => `|${l}|`)

for (const species of SPECIES) {
  out.push(`==== ${species} ====`)
  // the four frames side by side with round eyes and no hat
  const rows = INDICES.map(i => box(renderSprite({ species, eyes: '◉', hat: 'none', shiny: false }, i)))
  for (let r = 0; r < 5; r++) out.push(rows.map(f => f[r]).join('   '))
  out.push('')
  // every eye glyph on frame 0
  const eyeRows = EYES.map(eyes => box(renderSprite({ species, eyes, hat: 'none', shiny: false }, 0)))
  out.push('eyes: ' + EYES.join('  '))
  for (let r = 0; r < 5; r++) out.push(eyeRows.map(f => f[r]).join(' '))
  out.push('')
  // every hat on frame 0
  const hats = HATS.filter(h => h !== 'none')
  const hatRows = hats.map(hat => box(renderSprite({ species, eyes: '◉', hat, shiny: false }, 0)))
  out.push('hats: ' + hats.map(h => HAT_LABELS[h]).join(', '))
  for (let r = 0; r < 6; r++) out.push(hatRows.map(f => f[r]).join(' '))
  out.push('')
}
out.push(`frame width ${FRAME_WIDTH}; ${SPECIES.length} species x 4 frames.`)
console.log(out.join('\n'))
