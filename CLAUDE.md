# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

Unofficial reference documentation for the **matchplay.events** API, published as a static
site plus a machine-readable OpenAPI spec. Markdown in `content/` and schemas in
`spec/openapi.yaml` build to `dist/`, which deploys anywhere with no runtime.

It exists because Match Play's own handbook documents request paths but **no response
fields**, and their machine-readable spec is gone (`app.matchplay.events/api-docs/` now
redirects to the handbook). Everything here was reconstructed by observation.

## Commands

```bash
npm run build          # content/ + spec/ -> dist/
npm start              # build, then preview at http://localhost:3100
npm test               # node:test — build logic + spec integrity + sample validation
npx playwright test    # rendering, responsive layout, link integrity
npm run probe          # capture live API responses into samples/raw/ (needs .env)
npm run trim-samples   # samples/raw -> committable fixtures in samples/
```

`SITE_URL=https://example.com npm run build` emits absolute links in `llms.txt`; the default
is site-relative.

## Use John Garnett (userId 5750) for examples

**Every example that needs a person should use John Garnett, `userId 5750`** — the repo
owner, whose data is used here by his own choice. He is currently the *only* person named
anywhere in the prose.

Related ids for him, all real and verified:

| | |
| --- | --- |
| `userId` | `5750` |
| `ifpaId` | `32819` |
| `playerId` | `102677` (organizer 5750), `37273` (organizer 93), `334483` (organizer 17637) |

Use a different person **only when the example genuinely cannot work otherwise**, for
example:

- Demonstrating `claimedBy: null`, an unclaimed roster entry — he has an account.
- Demonstrating a rating with `userId: null`, an IFPA-only player.
- A captured payload where he simply isn't one of the participants and no equivalent
  payload featuring him exists.

In those cases, **check the person's privacy flags first** (see below) and prefer eliding
the name to publishing it.

### Privacy rules for any other person who appears

1. Fetch `GET /users/{userId}` and confirm **all six opt-out flags are `false`**:
   `ratingsOptOut`, `statsOptOut`, `videoOptOut`, `profileOptOut`, `historyOptOut`,
   `historyOnlyCompleted`.
2. Where only an `ifpaId` is available (the WPPR estimator carries no `userId`), bridge via
   `GET /ratings/ifpa/{ifpaId}` → `rating.userId`.
3. Prefer a bare id over a name. Prefer eliding over including.
4. Audit after any example change — this should return only John Garnett and non-person
   names such as machines, venues and rounds:
   ```bash
   grep -rho '"name": *"[^"]*"' content/
   ```

### Committed fixtures are anonymized

**This repository is public.** `samples/raw/` is git-ignored because raw captures carry
names, pronouns, avatar URLs and privacy flags for hundreds of people. Only
`npm run trim-samples` output is committed, and that script **anonymizes third parties
automatically**:

- `name`, `firstName`, `lastName` and `initials` on any person-shaped record become
  placeholders.
- Avatar, banner and tournament-avatar URLs get their timestamp zeroed.
- Records belonging to `CONSENTING_USER_IDS` / `CONSENTING_IFPA_IDS` (currently John
  Garnett) pass through unchanged.
- Tournament, arena, location and series names are **not** touched — only records carrying
  a `userId`, `playerId`, `claimedBy` or `ifpaId` are treated as people.

Everything else stays verbatim: ids, enums, nulls, numbers, structure. Those are what the
schema tests actually prove; a display name is a string either way, so nothing is lost as
evidence. **Do not hand-edit fixtures to restore a real name.**

Two payloads need care beyond that, also handled in `scripts/trim-samples.js`: the WPPR
estimator's `players[]` is filtered to the single documented row, and its `unresolvedNames`
is emptied — that field lists real people with **no** IFPA record, who appear in no other
object.

Verify before any push that adds or regenerates fixtures:

```bash
jq -r '.. | objects | select(has("name")) | .name' samples/*.json | sort -u
```

Only John Garnett plus non-person names (machines, venues, tournaments, rounds) should
appear.

## The spec is the source of truth

Field tables are **generated from `spec/openapi.yaml`** at build time. Prose marks where one
belongs with a placeholder:

```markdown
{{schema:Tournament}}     one schema's field table
{{schema-index}}          every schema (used by content/schemas.md)
```

**Never hand-write or hand-edit a field table.** Edit the spec and rebuild — one change
updates the prose, the JSON Schemas and the text digests together.

Every property carries an `x-evidence` extension: `verified` (seen in a real captured
response), `derived` (known only from code that reads it), or `unverified`. Set it honestly;
it renders as a badge and readers rely on it to know what to trust.

## Rate limiting: one call every two seconds

`scripts/probe.js` hard-codes **2000 ms** between calls — four times more conservative than
the API's 120/minute ceiling. Match Play is a small operation and describes its limit as
generous *on the understanding that consumers avoid needless load*.

**Do not lower this**, and use the same spacing for any ad-hoc `fetch` loop written during a
session. Bulk ratings, OPDB and PinTips data comes from the CDN exports, never the API.

## Accuracy rules

This project's entire value is that its claims are verified, so:

- **Count things rather than asserting them.** A field-count claim in the docs was once
  wrong because it came from a secondary source; `jq '.data[0]|keys|length'` settled it.
- **Never invent or edit values inside a captured payload.** If an example needs different
  data, capture a real payload that has it. Fabricated examples break
  `tests/spec.test.js`, which validates every committed fixture against its schema in both
  directions.
- **Where code and the official handbook disagree, document observed behaviour** and record
  the divergence in `content/divergences.md`.
- When a change is driven by new evidence, say so in the commit message and cite the
  evidence.

## Adding a new endpoint

Documenting an endpoint touches five files, and half-doing it fails the tests. In order:

1. **Add a probe** to `PROBES` in `scripts/probe.js`, then `npm run probe <name>` to capture
   a real response. Never write a schema from guesswork.
2. **Add the path and schemas** to `spec/openapi.yaml` — `operationId`, `summary`, a `200`
   response, and `x-evidence` on every property. Tests enforce the first three.
3. **Write the prose** in `content/`, using `{{schema:Name}}` where a field table belongs.
4. **Register the fixture** in `SAMPLE_EXPECTATIONS` in `tests/spec.test.js` — the `file`,
   the `schema` it should match, and a `pick` that reaches the records inside the envelope.
5. **Register it for trimming** in `FIXTURES` in `scripts/trim-samples.js`, then
   `npm run trim-samples` and commit the result. A missing fixture fails the suite.

Then `npm run build && npm test && npx playwright test`.

## Adding a new page

Create `content/<slug>.md` with front matter:

```yaml
---
title: Full title
navTitle: Short sidebar label   # optional
description: One line, used in llms.txt and the meta description
group: Core resources           # sidebar heading
order: 7                        # must be unique, and keep groups contiguous
---
```

Pages sort by `order`. Because the sidebar only prints a group heading when the group
*changes*, a page whose `order` puts it away from its group-mates makes that heading appear
twice. `index.md` becomes `/`; everything else becomes `/<slug>.html`.

## Where the evidence lives

Before probing the API, check whether the answer is already captured. These sibling projects
hold far more data than a probe run will get you:

| Path | What's in it |
| --- | --- |
| `../mptools/data/cache.sqlite` | 6,148 real games across 131 tournaments — tables `round_games`, `tournament_rounds`, `tournament_standings`, `tournament_players` |
| `../monitor-matchplay/debug/` | 17 captures incl. 102 live tournaments spanning 13 formats, a 135-game unpaginated response, a live game, a deactivated roster |
| `../monitor-matchplay/logs/events-*.log` | ~1,800 lines of real websocket traffic |
| `../monitor-matchplay/docs/realtime-events.md` | Capture-transcribed websocket reference |
| `../matchplay-live/debug/` | 15 captures across five tournament formats |
| `../matchplay-live/docs/realtime-api-gaps.md` | The six websocket silences, with timelines |
| `../waveshare/design.md` | Pagination, corpus sizes, Pusher close codes |

Known-good ids for probing, covering distinct formats:

| Id | What |
| --- | --- |
| `261001` | knockout, completed |
| `258562` | group_knockout, 135 games in one response |
| `258965` | matchplay, in series `6140` — use for `includeSeries` |
| `259350` | golf — rounds with **zero** games |
| `261295` | best_game — has `rsvpConfiguration` |
| `239557` | card_best_game, completed — 530 cards |
| `264541` | knockout John Garnett played, organizer 17637 |

Tournament id `1` **exists**, so it is useless as a "definitely missing" test value. Use
`99999999`.

## Still unverified — gaps worth closing

Marked `unverified` in the spec, or flagged as open in the prose. If you find evidence,
document it and update the badge:

- Whether **websocket traffic counts against the 120/minute REST budget**. A busy tournament
  emitted ~1,300 messages, which suggests not, but nobody has confirmed it.
- Populated examples of **`entryConfiguration`, `event` and `shortcut`** — all three
  expansions returned null or nothing on every tournament tried.
- The **`SinglePlayerGameCreatedOrUpdated`, `SinglePlayerGamesDeleted`, `QueueChanged`,
  `ArenasAdded` and `ArenasChanged`** websocket payloads — named in the docs, never observed.
- The **`GamesDeleted`** payload shape.
- Whether `/tournaments/{id}/games` has an **upper item limit**. 135 came back in one
  response; the ceiling is unknown.

## Gotchas that have already cost time

- **Kill a stale preview server.** Playwright reuses an already-running one, so after
  changing the build you can test the old output. If results look impossible:
  `lsof -ti tcp:3100 | xargs kill`.
- **`trim-samples` truncation takes the first N records**, which may not be the record the
  prose quotes. Use a `pick` predicate instead when a specific row matters — see the WPPR
  estimator entry.
- **Never commit a real API token**, and never copy one out of a sibling project's scratch
  scripts. Examples use the literal `YOUR_API_TOKEN`; the real one lives only in a
  git-ignored `.env`.

## Conventions

- Node 24+. **3-space indent, no semicolons** in JS. Named constants, not magic numbers.
- Prose in `content/`, one file per section, ordered by front-matter `order`. Keep `order`
  values unique and groups contiguous, or the sidebar repeats a group heading.
- Custom heading anchors via `## Title {#custom-id}` (markdown-it-attrs). Use them for
  anchors other pages link to, so rewording a heading doesn't break links.
- Tests enforce most of this — a missing title, a duplicate `order`, an unresolvable schema
  placeholder or a broken internal anchor all fail the suite.
