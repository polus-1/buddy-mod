# Buddy Mod Plan

Plan as of 2026-10-03. Primary source of context for the build. Decisions in the last section are final.

## Goal

Rebuild Anthropic's retired `/buddy` companion as a Claude Code mod, matching the original's mechanics 1:1, with new original sprites and Haiku writing the buddy's lines.

**1:1 means:** the same deterministic hatching from your account id (same salt, same hash, same PRNG, so a user who had a Rare Ghost gets a Rare Ghost again), the same 18 species, 5 rarity tiers and odds, 6 eye styles, 8 hats, 1% shiny, the same 5 stats with the same peak/dump/scatter roll, the same bones-vs-soul split and anti-cheat merge, the same commands (`/buddy`, `card`, `pet`, `mute`, `unmute`, `off`), the same placement (sprite beside the prompt, speech bubble, 10 s bubble window, 500 ms idle animation on the original 15-step sequence, 2.5 s hearts on pet), the same reaction triggers and 30 s cooldown, and the same "call it by name and Claude steps aside" behavior.

**What changes on purpose:** the 18 sprites are drawn fresh (same 5x12 grid and `{E}` eye slot so the layering code is identical); reactions and the hatch-time name/personality come from `claude-haiku` through the mod's own `$.model.complete` instead of the retired `buddy_react` endpoint; souls live in the mod's own store rather than `~/.claude.json` (the original key is read once for migration, so an existing buddy's name and personality carry over).

**Where it runs:** Claude Code CLI and the desktop app's Code tab, on Claude Code 2.1.287 or later (mods are generally available and on by default; see [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)). Loaded for one session with `claude --plugin-dir <folder>`, or installed from a marketplace with `/plugin install buddy@<marketplace>`. Built locally in the plugin's own repo.

## Homework: how the original /buddy worked

Buddy shipped as an April Fools feature in Claude Code 2.1.89 (a rainbow teaser April 1–7, 2026; the command live from April 8) and vanished in 2.1.97 on April 9 with no changelog; the `buddy_react` endpoint went dark around April 10. Sources are at the end of this section; the mechanics below come from the leaked source files (`buddy/types.ts`, `companion.ts`, `sprites.ts`, `prompt.ts`) as reported by community guides and the two preservation projects.

**Hatching and determinism.** The buddy's *bones* (species, rarity, shiny, eyes, hat, stats) are a pure function of the account: `FNV-1a(accountUuid + "friend-2026-401")` seeds a Mulberry32 PRNG, and the rolls are drawn in a fixed order. Bones are recomputed every session and never written to disk. The *soul* (name, personality, hatch timestamp) is generated once by a model at first `/buddy` and stored under `companion` in `~/.claude.json`. On load the two are merged as `{ ...stored, ...bones }` so an edited file cannot change species or stats (anti-cheat), and because the soul is kept there is no rerolling.

**Rarity and species.**

| Tier | Odds | Stars | Species | Stat floor |
| --- | --- | --- | --- | --- |
| Common | 60% | ★ | Duck, Goose, Blob, Cat, Dragon, Octopus | 5 |
| Uncommon | 25% | ★★ | Owl, Penguin, Turtle, Snail | 15 |
| Rare | 10% | ★★★ | Ghost, Axolotl, Capybara | 25 |
| Epic | 4% | ★★★★ | Cactus, Robot, Rabbit | 35 |
| Legendary | 1% | ★★★★★ | Mushroom, Chonk | 50 |

Species is uniform within the rolled tier. Shiny is an independent 1% roll, so a shiny Legendary is 1 in 10,000. Eyes are one of six glyphs: `·` dot, `*` star, `x` closed, `o` round, `@` spiral, `^` minimalist. Hats are eight: none, crown, top hat, propeller cap, halo, wizard hat, beanie, tiny duck; Common buddies always get none, and the tiny duck is Legendary-only.

**Stats.** Five on a 1–100 scale: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK. One *peak* stat is `floor + 50 + rand`, capped at 100 (so 80–100 in practice); one *dump* stat is `floor − 10 + rand`, floored at 1 (1–25); the other three scatter between `floor` and `floor + 40`. The peak and dump stats steer the personality (a high-SNARK buddy is sarcastic, a high-CHAOS one unpredictable).

**Soul generation.** A dedicated prompt asked for a one-word name (max 12 characters) and a one-sentence personality that reflects the species, rarity and stat shape, with the rule "higher rarity = weirder, more specific, more memorable." Example souls: "a curious penguin who insists on reading every stack trace twice"; "a fierce guardian of clean code who breathes fire at spaghetti logic and hoards well-written functions."

**Display.** Sprites are 5 lines by 12 characters with a `{E}` token where the eyes go; each species has 3 idle frames plus a blink frame. The animation ticks every 500 ms through `[0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` (−1 = blink), a 7.5 s loop. The sprite sits beside the prompt with a speech bubble that stays up 10 s. `/buddy pet` floats hearts over it for 2.5 s. Shiny buddies render with a shimmer/alternate color; rarity shows as star count and color (gray, green, blue, purple, gold).

**Reactions.** The buddy had its own system prompt injected beside Claude Code's, written from its soul and stats. Reactions fired on test failures, errors, large diffs, and ordinary turn completions, through the `buddy_react` endpoint (Claude 3.5 Sonnet) with a 30 s cooldown between calls; a reply was one short line, shown in the bubble. Saying the buddy's name in a prompt made Claude "step aside" so the buddy answered in the bubble instead.

**Commands.** `/buddy` hatches on first run (hatch animation, then the card) and shows the buddy after; `/buddy card` prints the full card (sprite, name, species, rarity stars, shiny flag, hat, stats, personality, hatch date); `/buddy pet` hearts; `/buddy mute` / `unmute` toggle the bubble; `/buddy off` hides the buddy entirely. A `/buddy stats` alias existed in some builds.

**Not in the original:** XP, levels, moods, hunger, or a pet counter. The preservation projects added those later; this plan leaves them out to stay 1:1.

Sources: [save-buddy](https://github.com/jrykn/save-buddy) · [claude-buddy](https://github.com/aahlijia/claude-buddy) · [Bring Back Buddy, issue #45596](https://github.com/anthropics/claude-code/issues/45596) · [regression report #45517](https://github.com/anthropics/claude-code/issues/45517) · [claudefa.st mechanics guide](https://claudefa.st/blog/guide/mechanics/claude-buddy) · [theplanettools species and hidden mechanics](https://theplanettools.ai/blog/claude-code-buddy-tamagotchi-18-species-hidden) · [claudebuddy.net species list](https://claudebuddy.net/species) · [mindwiredai guide](https://mindwiredai.com/2026/04/06/claude-code-buddy-terminal-pet-guide/) · [decodethefuture](https://decodethefuture.org/en/claude-buddy-terminal-pet-explained/)

## Architecture

One mod, `buddy`, built as a Claude Code plugin of function hooks. It has no server, no MCP and no network of its own: everything reaches the outside world through the engine interface `$`.

**Files**

| Path | Holds |
| --- | --- |
| `.claude-plugin/plugin.json` | name `buddy`, version, description, `types` pointer, `userConfig` (model override, cooldown) |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `hooks/register.tsx` | the hooks module: commands, render, reactions, animation timer |
| `hooks/bones.ts` | FNV-1a, Mulberry32, rarity/species/eyes/hat/shiny/stat rolls (pure, no `$`) |
| `hooks/sprites.ts` | 18 species x 4 frames (3 idle + blink), hat overlays, eye substitution, shiny palette |
| `hooks/soul.ts` | Haiku prompts for hatch (name + personality) and reactions; the buddy system prompt |
| `hooks/draw.tsx` | AbovePrompt tree: sprite column, bubble, card, hearts |
| `types/index.d.ts` | the `$.state` contract: `PluginState.buddy` |
| `hooks/*.test.ts` | bones determinism, odds, stat shape, cooldown, mute/off, command answers |

**Hooks used**

| Event | Role |
| --- | --- |
| `session.start` | read seed, compute bones, load soul from `$.store`, register `/buddy`, start the 500 ms animation timer, seed `$.state` |
| `command.run` `{ command: 'buddy' }` | dispatch subcommands; hatch on first run |
| `ui.render` `{ component: 'AbovePrompt' }` | draw sprite + bubble (or nothing when off); reads `$.state` so writes redraw it |
| `tool.call` (after `next`) | watch results: test failures, errors, large diffs -> queue a reaction |
| `turn.complete` | ordinary-turn reaction; also the "step aside" answer when the prompt named the buddy |
| `prompt.submit` | when the prompt starts with the buddy's name (or @name), answer it with Haiku and drop it; otherwise next(e) |
| `prompt.compose` | one short session section so Claude knows a buddy named X exists and ignores its bubble; no yielding logic needed |

**State.** Session state lives in `$.state` (`buddy.frame`, `buddy.bubble`, `buddy.hearts`, `buddy.visible`, `buddy.muted`), typed in the contract, so a hot reload keeps it and the render hook redraws on every write. Durable data lives in `$.store`: `soul` (`{ name, personality, hatchedAt }`), `muted`, `off`, `seedFallback`. Bones are never stored; `register` recomputes them each load.

**Seed: two modes.** A `userConfig` picker `mode` chooses between `pick` and `hatch`. In `pick` (v1), `/buddy pick <species> [rarity] [eyes] [hat] [shiny]` sets the bones by hand and stores them in `$.store.pickedBones`; anything not given is rolled from the species. In `hatch` (the public release), bones come from the original algorithm: `FNV-1a(accountUuid + "friend-2026-401")` into Mulberry32, with the uuid read from `oauthAccount.accountUuid` in `~/.claude.json` through `$.fs`, so people get the buddy claudebuddy.net shows for their uuid. No uuid (API-key or Bedrock login) mints one random uuid into `$.store.seedFallback`. Switching modes rehatches. Migration: on first load, an existing `companion` entry in `~/.claude.json` is copied into `$.store.soul` (name, personality, hatch date); otherwise the buddy hatches fresh with Haiku.

**Haiku.** All model calls go through `$.model.complete({ model: 'haiku', system, prompt, maxTokens, effort: 'low', timeoutMs })` on the session's own credentials. Nothing else leaves the machine.

```text
Claude Code engine events          buddy mod (register.tsx)              outside, via $
-------------------------          ------------------------              --------------
session.start           ---+
command.run /buddy      ---+       +----------------------------+        +---------------------------+
tool.call result        ---+-----> | Hooks                      | -----> | Haiku via $.model         |
turn.complete           ---+       | bones, commands, triggers, |        | hatch, reactions, name    |
prompt.submit / compose ---+       | cooldown                   | -----> +---------------------------+
$.clock every 500 ms    ---+       +-------------+--------------+        | $.store                   |
                                                 v                       | soul, muted, off, seed    |
                                   +----------------------------+        +---------------------------+
                                   | $.state buddy              | -----> | $.fs ~/.claude.json       |
                                   | frame, bubble, hearts,     |        | account uuid, old         |
                                   | visible, muted             |        | companion                 |
                                   +-------------+--------------+        +---------------------------+
                                                 v
                                   +----------------------------+
                                   | ui.render AbovePrompt      |
                                   | sprite column + bubble     |
                                   +----------------------------+
                                   every state write redraws the band
```

The engine raises events; the hooks on the left react, write state, and the render hook on the right redraws from that state. Haiku is reached only through `$.model`, the disk only through `$.fs` and `$.store`.

## Behavior spec: original to mod

Every row is a behavior the original had and how the mod reproduces it. "Same" means byte-for-byte the same rule.

| Behavior | Original | Mod |
| --- | --- | --- |
| Seed | FNV-1a 32-bit over `accountUuid + "friend-2026-401"` -> Mulberry32 | `hatch` mode: same hash, salt and PRNG, uuid from `~/.claude.json`, fallback uuid stored once. `pick` mode: `/buddy pick` sets species, rarity, eyes, hat and shiny by hand |
| Roll order | rarity, species, shiny, eyes, hat, stats (peak, dump, scatter) | Same order, so the same uuid yields the same buddy as before |
| Rarity odds | 60 / 25 / 10 / 4 / 1 | Same, cumulative thresholds on one `rand()` |
| Species | uniform within tier, 18 total | Same lists per tier |
| Shiny | independent 1% | Same |
| Eyes | 6 glyphs, uniform | Same glyphs |
| Hat | none for Common; 7 hats from Uncommon up; tiny duck Legendary-only | Same gating |
| Stats | peak `floor+50+rand`, cap 100; dump `floor-10+rand`, min 1; 3 scatter `floor..floor+40` | Same formula and floors (5/15/25/35/50) |
| Bones vs soul | bones recomputed, soul stored; merge `{...stored, ...bones}` | Same; soul in `$.store`, bones never written |
| Hatch | first `/buddy`: hatch animation, model writes name + personality, card shown | Same flow; Haiku writes name (1 word, <=12 chars) and personality (1 sentence) with the rarity rule; 3 retries on a bad shape, then a species default |
| Sprite | 5 lines x 12 chars, `{E}` eye slot, 3 idle + blink | Same grid and slot; new art |
| Idle loop | 500 ms tick over `[0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` | Same, via `$.clock.every(500)` writing `buddy.frame`; paused while hidden |
| Placement | sprite beside the prompt, bubble to its right | `AbovePrompt` band: sprite column left, bubble right, sized to `bodyColumns`; collapses to sprite-only under 40 columns |
| Bubble | 10 s, one short line | Same; `$.clock.after(10000)` clears `buddy.bubble` |
| Pet | `/buddy pet`: hearts float 2.5 s | Same; 5 frames of hearts over 2.5 s, then a reaction line |
| Card | `/buddy card`: sprite, name, species, rarity stars + color, shiny, hat, 5 stat bars, personality, hatched date | Same fields, drawn as the `CommandOutput` row |
| Mute / unmute | hide or show bubbles, buddy stays | Same; stored in `$.store.muted` |
| Off | hide the buddy entirely; `/buddy` brings it back | Same; stored in `$.store.off`; the animation timer stops while off |
| Reaction triggers | test failures, errors, large diffs, normal turns | `tool.call` after `next`: Bash whose text matches fail/error patterns, any `isError` result, Edit/Write over 200 changed lines; `turn.complete` on `reason: 'answer'` |
| Cooldown | 30 s between model calls | Same; a trigger inside the window is dropped, not queued (the last one wins when the window opens only if it was <5 s ago) |
| Reaction voice | buddy system prompt from soul + stats; one line | Haiku, `maxTokens: 60`, `effort: 'low'`, 8 s timeout; local fallback line from a per-species table on `api-error` or `aborted` |
| Name call-out | saying the name in a prompt makes Claude step aside and the buddy answer | `prompt.submit` answers the prompt itself (`drop`, no `next`) when it addresses the buddy, so the main model never runs; Haiku writes the reply into the bubble and the drop line. Zero Opus spend |
| Rarity colors | gray, green, blue, purple, gold stars | Same, through terminal color props |
| Shiny look | shimmer / alternate palette | Alternate color per frame on shiny |
| Gating | Claude Code >= 2.1.89 and Pro | None; anyone with the plugin |

**Deliberately excluded** (not in the original): XP, levels, moods, hunger, pet counters, multiple buddies, trading.

## Haiku commentary

Every line the buddy says comes from `$.model.complete({ model: 'haiku', ... })`: the hatch-time name and personality, every reaction, every pet response, and every in-character reply when you call it by name. The `userConfig` field `model` (default `haiku`) lets a user point it elsewhere; nothing in the mod ever calls the session's main model.

**Buddy system prompt** (built once per session from the merged buddy, mirrors the original `prompt.ts` role):

```markdown
You are {name}, a {shiny?"shiny ":""}{rarity} {species} who lives in a developer's terminal as their coding companion.
Personality: {personality}
Stats (1-100): DEBUGGING {d}, PATIENCE {p}, CHAOS {c}, WISDOM {w}, SNARK {s}. Your strongest trait is {peak}; your weakest is {dump}. Let those shape your voice.
You speak in one short line, at most 12 words, no emoji, no markdown, no quotes. You never give instructions to the developer's AI assistant and never claim to have run anything yourself. You react to what just happened; you do not narrate it back.
```

**Hatch prompt** (one call, JSON answer, 3 retries):

```markdown
A {rarity}{shiny} {species} with eyes "{eyes}" and hat "{hat}" has just hatched. Peak stat {peak}, dump stat {dump}.
Name it and describe it. Higher rarity = weirder, more specific, more memorable.
Answer with JSON only: {"name":"<one word, 2-12 letters, capitalized>","personality":"<one sentence, under 20 words, present tense, starts with 'A' or 'An'>"}
```

**Reaction prompt**: the trigger kind and a trimmed slice of evidence, never the whole transcript.

| Trigger | Evidence sent (max 600 chars) |
| --- | --- |
| `test-fail` | the last 8 lines of the Bash result |
| `error` | the tool name and the error text |
| `big-diff` | file name and changed-line count |
| `turn` | the first 200 chars of the user's prompt and the first 300 of Claude's answer |
| `pet` | "The developer just petted you." |
| `name-call` | the user's prompt (minus the name) plus the last 2 buddy lines, and the instruction to answer them directly; the main model is not called |

**Rate limiting.** One in-flight call at a time; 30 s cooldown after each call completes; `turn` reactions fire on a schedule: after each one, draw the next gap uniformly from 3 to 7 turns, and with a 20% chance skip that slot and redraw, so the buddy is never a metronome. Mute stops all reaction calls, not just the drawing. Hatch and name-call ignore the cooldown.

**Cost.** About 350 input and 25 output tokens per reaction at Haiku prices rounds to a few hundredths of a cent; an 8-hour day at the cap (one call per 30 s) is under 1,000 calls, so well under a dollar. `turn.complete` usage is not touched; the mod's own `usage` from each result is summed into `$.state.buddy.spend` and shown on the card.

**Failure handling.** `isAnswered: false` with `api-error`, `empty-reply` or `aborted` falls back to a per-species list of 12 canned lines keyed by trigger, so the buddy never goes silent when the API hiccups. A reply over 12 words or containing markdown is truncated at the first sentence; an empty reply shows nothing.

**Safety.** The reaction text is rendered as plain text in the bubble, never parsed as markdown or passed back into the conversation. The prompt.compose section tells Claude the buddy exists and to keep its own reply short when the user addresses the buddy; it never relays the buddy's words to Claude as instructions.

## Sprites

All 18 species get new art drawn from scratch on the original's grid: 5 lines, 12 columns, `{E}` where the eye glyph lands, 3 idle frames and 1 blink frame each, so `sprites.ts` can keep the original frame-index contract (`0`, `1`, `2`, `-1`). Hats are 1-line overlays composited above line 0 (the sprite grows to 6 lines when hatted, as the original did). Shiny swaps the sprite color each frame between the species color and bright white.

Sample, a Common duck at rest with `o` eyes (frame 0 / frame 1 / blink):

```markdown
   __         |    __        |    __
 <({E}>       |  <({E}>      |  <(-)>
  (   )__     |   (    )_    |   (   )__
  (____)      |   (____)     |   (____)
   ^ ^        |    ^  ^      |    ^ ^
```

Each species' frames vary one feature between frames (a tail, a tentacle, a flame, a propeller) so the 500 ms loop reads as breathing rather than flicker. The hearts animation for `/buddy pet` is five frames of `♥` rising one row per 500 ms over the sprite column, drawn in the rarity color.

All 72 frames (18 x 4) plus 7 hat rows are checked by a test that asserts width <= 12, height == 5, exactly one `{E}` per frame, and that every character is printable ASCII plus the heart and star glyphs, so nothing wraps or misaligns in a narrow terminal.

**Adding or replacing sprites.** `hooks/sprites.ts` is pure data: one exported record keyed by species, each entry `{ frames: [f0, f1, f2, blink], color }`, where every frame is a 5-element array of strings up to 12 characters wide with exactly one `{E}`. Hats live in the same file as single-line overlays keyed by hat name. To change a species' look, replace its four frames; to add a species, add a key to the record, add its name to a rarity tier's list in `bones.ts`, and add a 12-line fallback block in `soul.ts`. Then run `claude plugin test` (the frame-shape test catches width, height and eye-slot mistakes) and preview it live with `/buddy pick <species>` in pick mode, which hatches that species on the spot. The README carries this recipe with a blank frame template.

## Build order, testing, delivery

1. `bones.ts` with tests: FNV-1a and Mulberry32 match reference vectors; a fixed uuid yields a fixed buddy; 100,000 seeds land within 1 point of 60/25/10/4/1 and 1% shiny; every stat roll is in range with one peak >= 80 and one dump <= 25.
2. `sprites.ts` and the frame-shape test; a script renders all 18 x 4 frames with every eye and hat to a text file for review.
3. `register.tsx` skeleton: `session.start` (seed, bones, soul load, `/buddy` registration, timer), `command.run` for all six subcommands, `AbovePrompt` render of sprite and bubble, `$.state` contract in `types/index.d.ts`.
4. `soul.ts`: hatch call with JSON parsing and retries; reaction call with cooldown; canned fallbacks.
5. Reaction wiring: `tool.call` watcher, `turn.complete`, `prompt.submit` name detection, `prompt.compose` section.
6. Card drawing, hearts, mute/off persistence, migration from `~/.claude.json`.
7. `claude plugin validate`, `tsc -p`, `claude plugin test` on both `terminal` and `desktop` surfaces; fix until clean.
8. Package: the plugin folder as a zip plus `README.md` covering install (`--plugin-dir`, marketplace, `/plugin install`), the six commands, pick vs hatch mode and the `userConfig` fields, what Haiku is called for and the cost, where the soul is stored, how to add or replace sprites, and how to run the tests.

Tests cover: determinism and odds (step 1); frame shapes (step 2); each subcommand's `command.run` answer; mute stops model calls; off stops the timer and the render; the cooldown drops a second trigger inside 30 s; the hatch prompt's JSON parsing accepts a good reply and rejects a 13-letter name; a mocked `api-error` produces a canned line; the `AbovePrompt` tree validates on terminal and desktop at 40 and 120 columns.

Delivery: the plugin lives in its own git repo with `.claude-plugin/marketplace.json` at the root. To run it locally: `claude --plugin-dir /path/to/buddy`, or add that path to `CLAUDE_CODE_PLUGIN_DIRS` for the desktop app. Mods are not sandboxed; the whole thing is a few hundred lines you can read first.

## Open questions and risks

- [x] **Seed source.** Settled: two modes, `pick` (manual, v1) and `hatch` (account-uuid hash with rarity odds, the public release).
- [x] **Migration.** Settled: carry over an existing `companion` from `~/.claude.json`; otherwise rehatch with Haiku.
- [x] **Turn reactions.** Settled: next gap drawn from 3 to 7 turns, with a 20% chance to skip a slot.
- [x] **Name call-out scope.** Settled: handled entirely by Haiku. A prompt that starts with the buddy's name (or `@Name`) is answered and dropped before the main model runs, so Opus is never billed for it.
- [x] **Name trigger syntax.** Settled: start-of-prompt only (`Name, ...` or `@Name ...`); anything else goes to Claude as usual.

- [x] **Public release packaging.** Settled: buddy ships as its own plugin in its own repo (you are creating it); the repo carries a `.claude-plugin/marketplace.json` so others can run `/plugin install buddy@<marketplace>`.

**Risks.** The reaction prompt wording is not public, so it is reconstructed from behavior. Sprites are new art on the original grid; claudebuddy.net's gallery is used only to match dimensions and hat placement, never copied. The mod API is early access and moves between releases; the plan targets Claude Code 2.1.288. A dropped prompt shows its drop reason to the user, so the buddy's reply would appear there and in the bubble; if that double-shows, the drop reason becomes a one-word marker. `$.audio` could add a hatch chime on macOS but the original had no sound, so none is planned.
