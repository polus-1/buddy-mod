Build the `buddy` Claude Code mod described in BUDDY_PLAN.md (in this repo). Read that file completely before writing any code; it is the primary source of truth. Every design decision is already made and listed there, including the ones under "Open questions and risks", which are all settled.

Context you need:

- Load the `plugin-authoring` skill first. It gives you this build's mod API types (`claude-code.d.ts`), the example mods, and the validate/test commands. The API file is the authority on event names, `$` nouns, element props and limits; grep it for anything the plan names (`'prompt.submit'`, `AbovePrompt`, `ModelCompleteRequest`, `$.store`, `$.state`, `$.clock`).
- Mods require Claude Code >= 2.1.287. Official docs: https://code.claude.com/docs/en/plugins/mods/overview and the Events, API, Interface, Test and Reference pages linked from it.
- This is a 1:1 behavioral recreation of the original `/buddy` (same hash, salt, PRNG, roll order, odds, stat formula, commands, timings). Do not change any rule the plan marks "Same". Sprites are the one thing that is new: draw original ASCII art on the plan's 5x12 grid with the `{E}` eye slot; do not copy sprites from the original or from fan sites.
- All model calls use `$.model.complete({ model: 'haiku', ... })`. Never call the session's main model.
- `mode` is a `userConfig` picker: `pick` (manual `/buddy pick <species> [rarity] [eyes] [hat] [shiny]`) and `hatch` (account-uuid hash). Default to `hatch`.
- A prompt that starts with the buddy's name (`Name, ...` or `@Name ...`) is answered by Haiku and dropped in `prompt.submit` so the main model never runs.
- Turn reactions: after each one, draw the next gap uniformly from 3 to 7 turns; with 20% chance skip that slot and redraw. 30 s cooldown on all reaction calls; hatch and name-call ignore it.

Work in the order of "Build order, testing, delivery" in the plan, one step at a time, running `claude plugin validate .` and `claude plugin test .` after each step and fixing before moving on. Write the tests the plan lists. Keep `bones.ts` and `sprites.ts` pure (no `$`).

Repo layout to produce:

```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
hooks/hooks.json
hooks/register.tsx
hooks/bones.ts
hooks/sprites.ts
hooks/soul.ts
hooks/draw.tsx
hooks/*.test.ts
types/index.d.ts
README.md
```

README.md must cover: install (`claude --plugin-dir`, marketplace + `/plugin install buddy@<marketplace>`), the six commands plus `/buddy pick`, pick vs hatch mode and every `userConfig` field, what Haiku is called for and the approximate cost, where the soul is stored and how migration from `~/.claude.json` works, how to add or replace sprites (with a blank 5x12 frame template), and how to run the tests.

When everything validates, type-checks and tests pass, finish with a short summary of what was built, the test results, and anything in the plan you could not implement exactly as written and why.
