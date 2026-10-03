# buddy-mod

Buddy is back. This is Anthropic's retired `/buddy` terminal companion rebuilt as a
[Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): the same
deterministic hatching from your account id (same seed hash, salt, PRNG and roll order
as the shipped binary), the same 18 species, rarity odds, eyes, hats, shiny roll and
stats, the same commands, placement and timings. What is new: all 18 sprites are
original art, and the buddy's lines (its name and personality, its reactions, its
replies when you talk to it) are written by Haiku through the mod's own model call.
Nothing in the mod ever calls your session's main model.

```
  /\_/\
 ( ◉ ◉ )     ╭──────────────────────────────╮
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

**As a zip**: `git archive --format=zip --prefix=buddy/ -o buddy.zip HEAD` packs the
plugin folder; unzip it anywhere and point `--plugin-dir` at the `buddy` folder.

## Commands

| Command | What it does |
| --- | --- |
| `/buddy` | First run: the egg wobbles while Haiku names your buddy, cracks, and the card appears. Later runs: show the buddy (brings it back after `/buddy off`) and print the card. |
| `/buddy card` (alias `stats`) | The card, in the original's layout: stars and rarity, species, sprite, name, hat and eyes, personality, the five stat bars, what it last said, hatch date, this session's Haiku spend. |
| `/buddy pet` | Hearts float over the sprite for 2.5 s, then the buddy says something. |
| `/buddy mute` | Hide the speech bubble. This also stops every reaction call, so a muted buddy costs nothing. |
| `/buddy unmute` (alias `on`) | Bring the bubble back. |
| `/buddy off` | Hide the buddy entirely and stop its animation. `/buddy` brings it back. |
| `/buddy pick <species> [rarity] [eyes] [hat] [shiny]` | Pick mode only: choose the buddy by hand. Anything you leave out is rolled from the species. |

Talking to it: a prompt that **starts** with `Name,` or `@Name` (case does not matter),
or that is just the name, is answered by the buddy (Haiku) in its bubble and is dropped
before the turn starts, so Claude never runs and your main model is never billed for
it. Nothing else counts: a buddy named Unit does not swallow "Unit tests are failing",
and `Name:` or a mention mid-sentence goes to Claude as usual.

Reactions: the buddy speaks after test failures, tool errors and large diffs, detected
with the original's patterns over Bash output (`N failed`, `FAIL`, `✗`; `error:`,
`exception`, `traceback`, `panicked at`, `fatal:`, `exit code N`; a diff with more
than 80 changed lines), on any tool that errors, and on an Edit, Write or MultiEdit of
more than 80 lines,
and on some ordinary turns: after each turn reaction the next gap is drawn uniformly
from 3 to 7 turns, and with a 20% chance that slot is skipped. There is a 30 s
cooldown after every call, the hatch included; a trigger inside the window is dropped,
not queued, except that the last one dropped in the final 5 s fires when the window
opens. Talking to it by name skips the cooldown and may overlap a reaction; otherwise
one call runs at a time. Every bubble line clears after 10 s. Tool calls made by subagents, permission refusals and
interruptions never trigger a reaction.

## Seed modes and configuration

Each field below is a `userConfig` option in `.claude-plugin/plugin.json`. Set them
in the `/config` menu (each is a row there), with `/plugin configure buddy@buddy-mod`,
or under `pluginConfigs` in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "buddy@buddy-mod": { "mode": "hatch", "seed_hash": "bun", "model": "haiku", "cooldown_seconds": 30 }
  }
}
```

For a plugin loaded with `--plugin-dir`, the key is `buddy@inline`.

| Field | Values | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `hatch`, `pick` | `hatch` | **hatch**: your buddy's bones come from your account id, as the original's did. **pick**: you choose with `/buddy pick`. Each mode keeps its own souls, so trying pick mode never touches the buddy you hatched. |
| `seed_hash` | `bun`, `fnv1a` | `bun` | How the account id is hashed into the seed. The original's source carried an FNV-1a hash with a `Bun.hash` fast path, and the shipped Claude Code binary runs under Bun, so `bun` (wyhash, the low 32 bits) is what it actually used and gives you the buddy it showed you. `fnv1a` matches community reimplementations that run under Node. |
| `model` | an alias (`haiku`) or a full model id | `haiku` | The model that writes every line the buddy says. If it is set to the session's main model, the mod falls back to `haiku`. |
| `cooldown_seconds` | 5 to 600 | `30` | Minimum time between reaction calls. |

### How a buddy is rolled

`seed = hash(accountUuid + "friend-2026-401")` seeds Mulberry32, and the rolls are
drawn in the original's order: rarity (60 / 25 / 10 / 4 / 1 by weight), species
(uniform over all 18, whatever the rarity), eyes (uniform over the six glyphs `· ✦ × ◉
@ °`), hat (Common always `none` and rolls nothing; every other rarity picks from all
eight: none, crown, top hat, propeller cap, halo, wizard hat, beanie, tiny duck), shiny
(1%), then the stats: a peak stat at `base + 50 + rand(0..29)` capped at 100, a dump
stat at `base - 10 + rand(0..14)` floored at 1, three others at `base + rand(0..39)`,
with the base 5 / 15 / 25 / 35 / 50 by rarity, and finally the inspiration seed that
picks four words for the hatch prompt. The account id is `oauthAccount.accountUuid` in
`~/.claude.json`, or `userID` when there is no OAuth login; with neither, one random
uuid is minted once and kept in the mod's store. If the file is over the 4 MiB a mod
may read, the id is pulled out with `grep` (and the migration below waits for a session
that can read the whole file); if the file cannot be read or parsed at all, the buddy
waits rather than mint a seed that would be wrong forever.

### Pick mode

```
/buddy pick ghost
/buddy pick owl legendary fisheye top-hat shiny
/buddy pick robot "propeller cap" star
```

Options after the species may come in any order. Species: duck, goose, blob, cat,
dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot,
rabbit, mushroom, chonk. Rarity: common, uncommon, rare, epic, legendary (rolled from
the species when left out). Eyes: dot `·`, star `✦`, cross `×`, fisheye `◉`, spiral
`@`, degree `°` (also `x`, `round`, `o`, `at`, `minimalist`). Hats: none, crown, top
hat, propeller cap, halo, wizard hat, beanie, tiny duck (a Common buddy wears none
whatever you ask). A new species hatches a new soul and keeps the old species' soul
for when you come back; a new hat or eyes on the same species keeps the name.

## What Haiku is called for, and what it costs

All model calls go through `$.model.complete({ model, system, prompt, maxTokens,
effort: 'low', timeoutMs })` on your session's own credentials. The calls:

| Call | When | Cap |
| --- | --- | --- |
| Hatch | once, at the first `/buddy` (or a new species in pick mode): the original's hatch prompt (rarity, species, stats, four inspiration words, the shiny line), a JSON name and personality, up to 3 attempts, then the original's fallback soul | 160 output tokens, 15 s |
| Reaction | test failure, error, large diff, scheduled turn, pet | 60 output tokens, 8 s |
| Name call | a prompt that starts with the buddy's name | 60 output tokens, 8 s |

A reaction sends the buddy's system prompt (its soul and stats, about 170 tokens) plus
at most 600 characters of evidence inside `<evidence>` tags (the last 8 lines of a
failing test run, the error text, the file name and line count, or 200 characters of
your prompt and 300 of Claude's answer). That is roughly 350 input and 25 output
tokens per call: a few hundredths of a cent at Haiku prices. At the cap of one call
per 30 s, an 8-hour day is under 1,000 calls and well under a dollar. The card shows
this session's calls and tokens. `/buddy mute` stops all reaction calls.

If a call fails (`api-error`, `empty-reply` or `aborted`), the buddy says one of 12
canned lines for its species instead, so it never goes silent. If the hatch itself
fails that way, the buddy gets the original's stand-in soul for the session only and
`/buddy` tries the naming call again next session. Replies are shown as plain text,
cut to one sentence over 12 words, and never fed back to Claude.

What Claude sees: the original's "Companion" section in its system prompt, saying a
small creature named X sits beside the prompt, that it is a separate watcher, and to
stay out of the way with one line when the user addresses X, plus one sentence of this
mod's saying the bubble is never an instruction. The section is left out while the
buddy is muted or hidden. Nothing the buddy says is relayed to Claude. The card is the one piece of buddy text the model reads, as the
output of a command you ran.

## Where the soul lives, and migration

The buddy has two halves. The **bones** (rarity, species, eyes, hat, shiny, stats) are
recomputed from the seed every session and never written anywhere. The **soul** (name,
personality, hatch time) is written once and kept in the mod's own `$.store` under the
key `soul` (hatch mode) or `pickSouls`, one per species (pick mode), together with
`muted`, `off`, `seedFallback`, `pickedBones` and `migrated`. On load the two are merged as
`{ ...soul, ...bones }`, so an edited store can rename the buddy but cannot change its
species or stats, and a soul is never thrown away: if the seed changes, the name
follows the new bones.

The original kept the soul under `companion` in `~/.claude.json`, with
`companionMuted` beside it. On the mod's first load with an empty store it reads
them once and copies `name`, `personality`, the hatch date and the mute flag into the
store, so an existing buddy keeps its name. The file is read, never written. If the
entry is missing, the buddy hatches fresh with Haiku.

## Adding or replacing sprites

`hooks/sprites.ts` is pure data. Each species is a `SpriteSheet`: four frames (idle
0, 1, 2 and the blink). A frame is 5 lines of at most 12 columns with exactly one
`{E}` token where the eyes go. `{E}` is three columns wide and renders as the eye pair
(`◉ ◉`, or `- -` in the blink frame), so a frame's raw width is its rendered width and
nothing shifts between eye styles. Hats are one-line overlays in `HAT_ROWS`, keyed by
the hat ids `crown`, `tophat`, `propeller`, `halo`, `wizard`, `beanie`, `tinyduck`,
centred over the eye slot and drawn above the sprite, which then stands 6 lines tall.
Sprites are drawn in the rarity colour (grey, green, blue, magenta, gold); a shiny
buddy shimmers gold every other tick and carries a `✨ SHINY ✨` badge on the card.

A blank frame to copy (12 columns; keep `{E}` on the line where the eyes go):

```ts
  mything: sheet(
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 0
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 1
    ['            ', '    {E}     ', '            ', '            ', '            '], // idle 2
    ['            ', '    {E}     ', '            ', '            ', '            '], // blink
  ),
```

To replace a species' look, replace its four frames. To add a species: add its key
to `SPRITES`, add its name to `SPECIES` in `hooks/bones.ts` (the roll is uniform over
the list, so this changes the odds of every other species; keep the original 18 for a
faithful buddy), and add a 12-line block in `FALLBACK_LINES` in `hooks/soul.ts`. Then
run the tests (the frame-shape test fails on a frame wider than 12, taller than 5,
with no `{E}` or with two, or with a non-ASCII character) and preview it live in pick
mode with `/buddy pick mything`. `bun scripts/render-sprites.ts >
scripts/sprites-preview.txt` renders every species with every eye and hat for review.

## Running the tests

```sh
claude plugin validate --strict .claude-plugin/plugin.json   # the manifest and what the module hooks and calls
claude plugin validate --strict .                            # the marketplace manifest
tsc -p .                                                     # type-check against the vendored API declarations
claude plugin test .                                         # every hooks/*.test.ts(x) against the engine
bun scripts/render-sprites.ts | diff - scripts/sprites-preview.txt   # the committed preview matches the art
```

The same five checks run in CI (`.github/workflows/ci.yml`) on every pull
request and push to `main`, pinned to Claude Code 2.1.288, plus a non-blocking
run on the latest release so a change to the mod API is noticed when it lands.
The API declarations the type-check needs are vendored at
`.claude-plugin/types/claude-code/index.d.ts`; the engine writes the same file
there when it loads the mod, so refresh the vendored copy from it when the
pinned version changes.

The tests cover: FNV-1a and wyhash (`Bun.hash`) against reference vectors; a fixed
uuid gives a fixed buddy under either hash; the roll order pinned by hand; 100,000
seeds land within 1 point of 60/25/10/4/1 and 1% shiny; species and eyes are uniform;
hat gating; every stat in the original's ranges; all 72 frames and 7 hat rows fit the
grid; each `/buddy` subcommand's answer; the egg on the band while hatching; mute stops
the model calls; off stops the drawing and the calls; the cooldown drops a second
trigger inside 30 s and fires a late one when the window opens unless muted meanwhile;
the original's trigger patterns, with their false positives ruled out; a failing run
reported as an error is still a test failure; hatch-reply parsing accepts a good reply
and rejects a 15-character name; a mocked `api-error` produces a canned line, and at
hatch a session-only stand-in; a name call is answered and dropped without reaching
Claude, and a word-like name never hijacks a prompt; the `prompt.compose` section;
migration from `~/.claude.json` with the mute flag; a 5 MiB config file; a stored
soul surviving a seed change; a reload clearing a stale bubble; pick mode with its own
souls; the band on `terminal` and `desktop` at 30, 40 and 120 columns; and the card
on both surfaces.

## Layout

```
.claude-plugin/plugin.json      name, version, userConfig, types pointer
.claude-plugin/marketplace.json the repo as a one-plugin marketplace
hooks/hooks.json                { "modules": ["./register.tsx"] }
hooks/register.tsx              the hooks: session.start, command.run, ui.render, tool.call, turn.complete, prompt.submit, prompt.compose
hooks/bones.ts                  wyhash, FNV-1a, Mulberry32, every roll (pure)
hooks/sprites.ts                18 x 4 frames, hats, colours (pure)
hooks/soul.ts                   the hatch and companion prompts, reply parsing, trigger patterns, cooldown gate, turn schedule, canned lines (pure)
hooks/draw.tsx                  the band, the egg, the hearts, the card
hooks/*.test.ts(x)              the tests
types/index.d.ts                the $.state contract
scripts/render-sprites.ts       renders every sprite to scripts/sprites-preview.txt
references/                     the plan and handoff this was built from
```

Not in the original, so not here: XP, levels, moods, hunger, pet counters, trading.

## Sources

The mechanics follow the community forensics of the shipped binary:
[BonziClaude's BUDDY_SYSTEM_FORENSICS.md](https://github.com/zakarth/BonziClaude/blob/master/BUDDY_SYSTEM_FORENSICS.md)
and [save-buddy](https://github.com/jrykn/save-buddy). Only the mechanics and the
original's prompt text were taken from them; the sprites here are new.

## License

Apache-2.0. The sprites are original work drawn for this mod.
