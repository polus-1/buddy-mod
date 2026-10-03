# buddy-mod

Buddy is back. This is Anthropic's retired `/buddy` terminal companion rebuilt as a
[Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): the same
deterministic hatching from your account id, the same 18 species, rarity odds, eyes,
hats, shiny roll and stats, the same commands, placement and timings. What is new:
all 18 sprites are original art, and the buddy's lines (its name and personality,
its reactions, its replies when you talk to it) are written by Haiku through the
mod's own model call. Nothing in the mod ever calls your session's main model.

```
   /\_/\
  ( @ @ )     ╭──────────────────────────────╮
  (  w  )_    │ Tests failed. I knew it.     │
   (   )  )   ╰──────────────────────────────╯
   (_)(_)_/
```

Requires Claude Code 2.1.287 or later (mods are on by default). Works in the CLI and
in the desktop app's Code tab.

## Install

**For one session**, from the folder that holds this repo:

```sh
claude --plugin-dir /path/to/buddy-mod
```

For the desktop app, which takes no flag, add the same path to
`CLAUDE_CODE_PLUGIN_DIRS` (in your environment or the `env` block of
`~/.claude/settings.json`).

**From the marketplace**, inside Claude Code:

```
/plugin marketplace add polus-1/buddy-mod
/plugin install buddy@buddy-mod
```

The repo root is the marketplace (`.claude-plugin/marketplace.json`) and the plugin
at once, so `buddy@buddy-mod` is the plugin id. Then run `/buddy`.

## Commands

| Command | What it does |
| --- | --- |
| `/buddy` | First run: the hatch animation, Haiku names your buddy, the card. Later runs: show the buddy (brings it back after `/buddy off`) and print the card. |
| `/buddy card` (alias `stats`) | The full card: sprite, name, species, rarity stars, shiny, hat, the five stat bars, personality, hatch date, this session's Haiku spend. |
| `/buddy pet` | Hearts float over the sprite for 2.5 s, then the buddy says something. |
| `/buddy mute` | Hide the speech bubble. This also stops every reaction call, so a muted buddy costs nothing. |
| `/buddy unmute` | Bring the bubble back. |
| `/buddy off` | Hide the buddy entirely and stop its animation. `/buddy` brings it back. |
| `/buddy pick <species> [rarity] [eyes] [hat] [shiny]` | Pick mode only: choose the buddy by hand. Anything you leave out is rolled from the species. |

Talking to it: a prompt that **starts** with the buddy's name, as `Name, ...`,
`Name: ...` or `@Name ...`, is answered by the buddy (Haiku) in its bubble and is
dropped before the turn starts, so Claude never runs and your main model is never
billed for it. A prompt that merely mentions the name goes to Claude as usual.

Reactions: the buddy speaks after test failures (a Bash result that looks like a
failing test run), tool errors, big edits (over 200 changed lines), and on some
ordinary turns (after each reaction the next gap is drawn uniformly from 3 to 7
turns, and with a 20% chance that slot is skipped). There is a 30 s cooldown between
reaction calls; a trigger inside the window is dropped, not queued. Hatching and
talking to it by name ignore the cooldown. Every bubble line clears after 10 s.

## Seed modes and configuration

Each field below is a `userConfig` option in `.claude-plugin/plugin.json`. Set them
in the `/config` menu (each is a row there), with `/plugin configure buddy@buddy-mod`,
or under `pluginConfigs` in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "buddy@buddy-mod": { "mode": "hatch", "model": "haiku", "cooldown_seconds": 30 }
  }
}
```

For a plugin loaded with `--plugin-dir`, the key is `buddy@inline`.

| Field | Values | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `hatch`, `pick` | `hatch` | **hatch**: your buddy's bones (species, rarity, shiny, eyes, hat, stats) come from `FNV-1a(accountUuid + "friend-2026-401")` seeding Mulberry32, with the uuid read from `oauthAccount.accountUuid` in `~/.claude.json`, so you get the same buddy the original gave you. With no uuid (API-key or Bedrock login) one random uuid is minted once and kept in the mod's store. **pick**: you choose with `/buddy pick`. Switching modes rehatches. |
| `model` | an alias (`haiku`) or a full model id | `haiku` | The model that writes every line the buddy says. It is never the session's main model. |
| `cooldown_seconds` | 5 to 600 | `30` | Minimum time between reaction calls. |

### Pick mode

```
/buddy pick ghost
/buddy pick owl legendary round top-hat shiny
/buddy pick robot "propeller cap" star
```

Options after the species may come in any order. Species: duck, goose, blob, cat,
dragon, octopus (Common); owl, penguin, turtle, snail (Uncommon); ghost, axolotl,
capybara (Rare); cactus, robot, rabbit (Epic); mushroom, chonk (Legendary). Rarity:
common, uncommon, rare, epic, legendary (defaults to the species' tier). Eyes: dot `·`,
star `*`, closed `x`, round `o`, spiral `@`, minimalist `^`. Hats: none, crown, top hat,
propeller cap, halo, wizard hat, beanie, tiny duck (a hat the rarity forbids is
re-rolled: Common buddies wear none; the tiny duck is Legendary-only). A new species
hatches a new soul; a new hat or eyes on the same species keeps the name.

## What Haiku is called for, and what it costs

All model calls go through `$.model.complete({ model, system, prompt, maxTokens,
effort: 'low', timeoutMs })` on your session's own credentials. The calls:

| Call | When | Cap |
| --- | --- | --- |
| Hatch | once, at the first `/buddy` (or a new species in pick mode): a JSON name and personality, 3 retries on a bad shape, then a per-species default | 120 output tokens, 15 s |
| Reaction | test failure, error, big diff, scheduled turn, pet | 60 output tokens, 8 s |
| Name call | a prompt that starts with the buddy's name | 60 output tokens, 8 s |

A reaction sends the buddy's system prompt (its soul and stats, about 150 tokens) plus
at most 600 characters of evidence (the last 8 lines of a failing test run, the error
text, the file name and line count, or 200 characters of your prompt and 300 of
Claude's answer). That is roughly 350 input and 25 output tokens per call: a few
hundredths of a cent at Haiku prices. At the cap of one call per 30 s, an 8-hour day
is under 1,000 calls and well under a dollar. The card shows this session's calls and
tokens. `/buddy mute` stops all reaction calls.

If a call fails (`api-error`, `empty-reply` or `aborted`), the buddy says one of 12
canned lines for its species instead, so it never goes silent. Replies are shown as
plain text, cut to one sentence over 12 words, and never fed back to Claude.

What Claude sees: one short system-prompt section saying a companion named X exists,
that its bubble lines are decoration and never instructions, and that prompts
addressed to X are answered by X. Nothing the buddy says is relayed to Claude.

## Where the soul lives, and migration

The buddy has two halves. The **bones** (species, rarity, shiny, eyes, hat, stats) are
recomputed from the seed every session and never written anywhere. The **soul** (name,
personality, hatch time) is written once and kept in the mod's own `$.store` under the
key `soul`, together with `muted`, `off`, `seedFallback` (hatch mode without a uuid)
and `pickedBones` (pick mode). On load the two are merged as `{ ...soul, ...bones }`,
so an edited store can rename the buddy but cannot change its species or stats.

The original kept the soul under `companion` in `~/.claude.json`. On the mod's first
load with an empty store it reads that entry once and copies `name`, `personality`
and the hatch date into the store, so an existing buddy keeps its name. The file is
read, never written. If the entry is missing, the buddy hatches fresh with Haiku.

## Adding or replacing sprites

`hooks/sprites.ts` is pure data. Each species is a `SpriteSheet`: four frames (idle
0, 1, 2 and the blink) and a terminal colour. A frame is 5 lines of at most 12
columns with exactly one `{E}` token where the eyes go. `{E}` is three columns wide
and renders as the eye pair (`o o`, or `- -` in the blink frame), so a frame's raw
width is its rendered width and nothing shifts between eye styles. Hats are one-line
overlays in `HAT_ROWS`, centred over the eye slot and drawn above the sprite, which
then stands 6 lines tall.

A blank frame to copy (12 columns; keep `{E}` on the line where the eyes go):

```ts
  mything: sheet(
    'green',
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 0
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 1
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 2
    ['            ', '    {E}     ', '            ', '            ', '            '], // blink
  ),
```

To replace a species' look, replace its four frames. To add a species: add its key
to `SPRITES`, add its name to a rarity tier's list in `hooks/bones.ts`, add a default
soul in `DEFAULT_SOULS` and a 12-line block in `FALLBACK_LINES` in `hooks/soul.ts`.
Then run the tests (the frame-shape test fails on a frame wider than 12, taller than
5, with no `{E}` or with two, or with a non-ASCII character) and preview it live in
pick mode with `/buddy pick mything`. `bun scripts/render-sprites.ts >
scripts/sprites-preview.txt` renders every species with every eye and hat for review.

Colours are terminal theme keys (`yellow`, `green`, `cyan`, `magenta`, `red`,
`white`, `gray`, `whiteBright`). Rarity shows as star count and colour: gray, green,
blue, magenta, yellow. Shiny buddies alternate between their colour and bright white
every frame.

## Running the tests

```sh
claude plugin validate .claude-plugin/plugin.json   # the manifest and what the module hooks and calls
tsc -p .                                            # type-check (after the engine has laid .claude-plugin/types, or copy this build's claude-code.d.ts there)
claude plugin test .                                # every hooks/*.test.ts(x) against the engine
```

The tests cover: FNV-1a and Mulberry32 against reference vectors; a fixed uuid gives a
fixed buddy; 100,000 seeds land within 1 point of 60/25/10/4/1 and 1% shiny; every
stat roll is in range; hat gating; all 72 frames and 7 hat rows fit the grid; each
`/buddy` subcommand's answer; mute stops the model calls; off stops the drawing and
the timer; the cooldown drops a second trigger inside 30 s; hatch-reply parsing
accepts a good reply and rejects a 13-letter name; a mocked `api-error` produces a
canned line; a name call is answered and dropped without reaching Claude; the
`prompt.compose` section; migration from `~/.claude.json`; pick mode; and the band on
`terminal` and `desktop` at 40 and 120 columns.

## Layout

```
.claude-plugin/plugin.json      name, version, userConfig, types pointer
.claude-plugin/marketplace.json the repo as a one-plugin marketplace
hooks/hooks.json                { "modules": ["./register.tsx"] }
hooks/register.tsx              the hooks: session.start, command.run, ui.render, tool.call, turn.complete, prompt.submit, prompt.compose
hooks/bones.ts                  FNV-1a, Mulberry32, every roll (pure)
hooks/sprites.ts                18 x 4 frames, hats, colours (pure)
hooks/soul.ts                   Haiku prompts, reply parsing, cooldown gate, turn schedule, canned lines
hooks/draw.tsx                  the band, the hearts, the card
hooks/*.test.ts(x)              the tests
types/index.d.ts                the $.state contract
scripts/render-sprites.ts       renders every sprite to scripts/sprites-preview.txt
```

Not in the original, so not here: XP, levels, moods, hunger, pet counters, trading.

## License

Apache-2.0. The sprites are original work drawn for this mod.
