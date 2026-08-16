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
{{openapi-reference}}     every path, method, parameter and response
{{asyncapi-reference}}    the websocket server, channel and messages
```

The last two are rendered by `src/specRender.js`. They exist so no artifact is published
only in a machine format — every spec has a human-readable view. Redoc and the AsyncAPI
generator were tried and rejected: they add ~70s to the build, need a vendored CDN bundle,
look nothing like the site, and — the deciding reason — cannot link an endpoint to the prose
page explaining its traps.

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

- **Count things rather than asserting them.** Run the query, then write the number.

### Re-measure anything inherited from a sibling project

The sibling repos under `../` are the richest evidence available, but **each of them filtered
the API for its own purposes**, and figures copied out of them have been wrong three times in
this project's short history:

| Claimed | Actual | Why it was wrong |
| --- | --- | --- |
| The full games endpoint returns 25 fields, 8 more than `/games` | 24 and 7 | Copied from another repo's inventory instead of counted |
| `status: "started"` mostly means finished, some idle over a month | Auto-closed after 2 idle days; none idle past its scheduled end | The capture predated a policy change |
| The ratings CSV holds ~33,500 players | 141,962 | That repo's importer **skips rows with no `User ID`**, which is 55.7% of the file |

The last is the sharpest lesson: a consumer's dataset reflects what that consumer needed, not
what the API returns. Treat sibling projects as a source of *payloads and behaviour*, and
re-derive every count, ratio and distribution from the raw file or a live response.

### The identity model has four cases, not three

`userId`, `playerId` and `ifpaId` are the documented namespaces, but **a rated player may have
none of them**. 55.7% of rows in the ratings CSV carry neither a `User ID` nor an `IFPA ID`;
those players exist only as a name and a rating.

They are unreachable through the API — `/search?type=users` only sees user accounts — so the
CSV export is the sole route to them. Don't write examples or client guidance that assume
every player resolves to a global id.

Also note `/search` matches **fuzzily**: a full two-word name returned 223 results. A
non-empty result set is not a match; filter for the exact name.
- **Never invent or edit values inside a captured payload.** If an example needs different
  data, capture a real payload that has it. Fabricated examples break
  `tests/spec.test.js`, which validates every committed fixture against its schema in both
  directions.
- **Where code and the official handbook disagree, document observed behaviour** and record
  the divergence in `content/divergences.md`.
- **State each fact once, in the page where a reader needs it, and link from everywhere
  else.** Every stale claim found so far was a *restatement*, not an original: the detailed
  page got corrected and the bullet, table or checklist paraphrasing it did not. A link
  cannot go stale; a duplicated number can. Teasers and summaries are fine — they should
  name the trap and link, not repeat the measurement.

  Callouts are linkable without any effort: the build derives an id from the callout title,
  so `<span class="callout-title">Trust, but verify</span>` becomes `#trust-but-verify`. An
  explicit `id` on the div is respected if you need a stable one. (`{#custom-id}` still works
  on headings only — this is the equivalent for callouts, and it is automatic because doing
  it by hand was forgotten every single time.)
### Before writing a claim, check whether it already exists

**Any time you state something factual about the API — a measurement, a behaviour, a limit —
search for it first:**

```bash
npm run claims -- -f "resultPositions"    # is this already stated somewhere?
```

The output shows every page whose prose mentions it, and which claim tags those pages
already carry. Then:

- **It already exists somewhere.** First ask whether this page needs to say it at all — the
  usual answer is a link, and a link cannot go stale. Delete before you tag: a tag makes
  duplication *visible*, not *free*, and tagging something that should have been cut just
  preserves it with extra ceremony.

  If the page genuinely needs its own mention — because a reader acts on it there — keep it
  to a sentence that adds something local, drop the shared specifics, and tag both sites
  with the same key.
- **Nothing similar exists.** It is a new claim. If it is the sort of thing that will be
  referenced elsewhere — a trap, a limit, a correction — tag it `canonical` now, so the
  second mention has something to point at.

This step is the point. Tagging after the fact only happens when someone already notices the
duplication, which is exactly the thing that keeps being missed.

### Claim tags

```markdown
<!-- claim:auto-close canonical -->   the page that states it in full
<!-- claim:auto-close -->             a page that references or depends on it
```

```bash
npm run claims              every claim and its locations
npm run claims auto-close   just that one
```

**Run it before changing a tagged claim** — it lists every page that has to change with it.
Nothing is kept in sync by hand: the tags *are* the index. Hand-written "see also" lists
would go stale exactly like the claims they describe.

The build strips them, so they reach neither the HTML nor `llms-full.txt`. Two tests enforce
the scheme: exactly one canonical per key with no orphan references, and no tag leaking into
output.

This exists because every stale claim in this repository's history was a restatement whose
original had already been corrected. The tags do not prevent that — they make the blast
radius visible before you start.

- **When correcting a claim, grep for every place that restates it.** Overview bullets,
  "what you get here" teasers and the divergences lists all paraphrase claims made in
  depth elsewhere, and a correction applied only to the detailed page leaves them behind.
  This has happened twice: the index still described `status: "started"` as meaning the
  opposite of what it says long after the auto-close correction, and the divergences page
  ended up contradicting itself about the same field on one screen.
- **Claim only what was checked.** Avoid superlatives and statements about the whole world:
  "the only X in existence", "nowhere else", "no such thing exists". Absence is nearly
  impossible to verify and ages badly — Match Play could publish a spec tomorrow. Prefer
  "no endpoint was found that…", "the only value observed", "not in Match Play's
  documentation". Being matter-of-fact costs nothing and cannot become false.

  This is not hypothetical: the spec once claimed the tournament-scoped games endpoint was
  "the only way to learn who played a game", which was simply wrong — the websocket carries
  the same fields.
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
| series `6224` | a series with an organizer; `GET /series` lists 4,678 of them |
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
- The **`SinglePlayerGameCreatedOrUpdated`, `SinglePlayerGamesDeleted`, `ArenasAdded`,
  `ArenasChanged` and `GamesDeleted`** websocket payloads — named in the docs, never
  observed. See "Capturing websocket events" below.
- **`QueueChanged`** specifically needs a tournament with **`useQueues: true`**; a tournament
  with it false never emits the event at all.
- Whether `/tournaments/{id}/games` has an **upper item limit**. 135 came back in one
  response; the ceiling is unknown.

## Capturing websocket events

`scripts/listen.js <tournamentId> [seconds]` subscribes to a tournament's Pusher channel and
appends every frame to `samples/raw/ws-<id>.jsonl`. It uses no REST calls, so it costs no
rate budget.

The hard part is finding a tournament that is **actually being played right now**.

Match Play auto-closes an idle tournament after two days, so `status: "started"` now means
"active within the last 48 hours" for ordinary formats — a much better filter than it used
to be. Long-running formats (`best_game`, `card_best_game`, `golf`) are exempt while their
`endLocal` window is open and can sit idle for weeks, which is exactly the trap: they are
the formats whose events we still need, and they are the ones most likely to be dormant.

Signals, cheapest first — the list response carries `updatedAt`, so step 1 is free:

1. `updatedAt` within the last hour or two on the tournament object itself.
2. Recent `updatedAt` on its newest games. Definitive for idleness.
3. A standings row with a non-empty `activeGames` array — proof a game is in progress now.

For the single-player and queue events specifically, you need a live **`best_game` or
`card_best_game`** tournament, and `useQueues: true` for `QueueChanged`.

A listen against an idle tournament still confirms the handshake but captures nothing —
`263252` was tried on 2026-08-14 and yielded only `connection_established`,
`subscription_succeeded` and `pong`.

## Publishing

The site deploys to https://johngarnett.github.io/matchplay-api-docs/ via
`.github/workflows/pages.yml` on every push to `main`. The workflow runs `npm test` first, so
a broken spec or missing fixture fails the deploy instead of publishing a bad page.

Descriptions inside `spec/*.yaml` are rendered into the site by `{{openapi-reference}}`, so
any Markdown link in them must resolve **here** — `/series.html`, not a Redoc-style
`#tag/Series`. The Playwright link checker catches these.

**Keep links root-relative in source** — write `/games.html`, not `./games.html`. A project
repo is served from a subpath, and `applyBasePath()` in `src/build.js` prefixes every
`href="/…"` and `src="/…"` once, on the finished document. Writing relative links by hand
would defeat it.

`BASE_PATH` is set only in CI. If the repo is renamed, or the site moves to a custom domain
(which serves from the root), update or remove it in the workflow — nothing else changes.

Pages must be enabled on the repo before the workflow can deploy, and **the workflow cannot
do it itself** — `configure-pages`' `enablement` option fails with "Resource not accessible
by integration" because the default `GITHUB_TOKEN` has no admin rights. Enable it once with
`gh api -X POST /repos/OWNER/REPO/pages -f build_type=workflow`.

## Gotchas that have already cost time

- **Playwright and the preview server no longer share a port.** Tests run on 3101 and always
  rebuild; `npm start` uses 3100. They previously shared one, which meant Playwright reused a
  manually started server and *skipped its own build step* — a broken link added to
  `content/` passed the link checker because the page under test had never been rebuilt. If
  you ever see a test pass that clearly should not, check that what you edited actually
  reached `dist/`.
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
