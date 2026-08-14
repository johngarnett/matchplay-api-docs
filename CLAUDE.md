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

`samples/raw/` is git-ignored because raw captures carry names, pronouns, avatar URLs and
privacy flags for hundreds of people. Only `npm run trim-samples` output is committed. Two
payloads need care beyond trimming, already handled in `scripts/trim-samples.js`: the WPPR
estimator's `players[]` is filtered to the single documented row, and its `unresolvedNames`
is emptied — that field lists real people with **no** IFPA record, who appear in no other
object.

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

## Conventions

- Node 24+. **3-space indent, no semicolons** in JS. Named constants, not magic numbers.
- Prose in `content/`, one file per section, ordered by front-matter `order`. Keep `order`
  values unique and groups contiguous, or the sidebar repeats a group heading.
- Custom heading anchors via `## Title {#custom-id}` (markdown-it-attrs). Use them for
  anchors other pages link to, so rewording a heading doesn't break links.
- Tests enforce most of this — a missing title, a duplicate `order`, an unresolvable schema
  placeholder or a broken internal anchor all fail the suite.
