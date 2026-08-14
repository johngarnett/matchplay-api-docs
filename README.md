# matchplay-api-docs

Unofficial reference documentation for the [matchplay.events](https://app.matchplay.events)
API, published as a static site with a machine-readable OpenAPI spec.

**Not affiliated with or endorsed by Match Play Events.**

## Why this exists

Match Play publish a [handbook](https://docs.matchplay.events/) that lists request paths and
query parameters but documents **no response fields**. Their machine-readable spec is gone —
`app.matchplay.events/api-docs/` now redirects to the handbook.

This project fills the gap: complete response schemas, observed enumerations, scoring
semantics, and the behavioural quirks that cost real debugging time. Everything was
reconstructed by observation, from live probes and from six applications that consume the
API in production.

The headline finding, and the reason this exists at all: the handbook documents
`GET /api/games`, which **does not return who played or who won**. The undocumented
`GET /api/tournaments/{id}/games` does.

## Quick start

```bash
npm install
npm run build          # content/ + spec/ -> dist/
npm start              # build, then preview at http://localhost:3100
```

`dist/` is a self-contained static site. Deploy it anywhere — GitHub Pages, S3, Netlify,
nginx — with no Node runtime.

Links in `llms.txt` are site-relative by default. Set `SITE_URL` at build time to emit
absolute ones, which some agent tooling prefers:

```bash
SITE_URL=https://docs.example.com npm run build
```

## Layout

```
spec/openapi.yaml      SOURCE OF TRUTH for every schema
spec/asyncapi.yaml     the Pusher websocket channel and its events
content/*.md           prose, one file per section, ordered by front matter
samples/*.json         committed fixtures the tests validate against
samples/raw/           full captures (gitignored)
scripts/probe.js       rate-limited prober that populates samples/raw
scripts/trim-samples.js  raw captures -> committable fixtures
src/build.js           the build
public/site.css        theme, copied to dist/assets/
server.js              local preview only
tests/*.test.js        node:test unit tests
tests/*.spec.js        Playwright browser tests
```

## The spec is the source of truth

Field tables in the prose are **generated from `spec/openapi.yaml`** at build time. A
Markdown file marks where one belongs:

```markdown
{{schema:Tournament}}
```

and `src/schemaTables.js` substitutes a table. `{{schema-index}}` renders every schema at
once, which is what `content/schemas.md` uses.

**Never hand-write a field table.** Edit the spec and rebuild — one change updates the prose,
the tables, the JSON Schemas and the text digests together.

### Evidence tagging

Every property carries an `x-evidence` extension, rendered as a badge:

| Value | Meaning |
| --- | --- |
| `verified` | Seen in a real captured response |
| `derived` | Known only from application code that reads it |
| `unverified` | Asserted somewhere but not confirmed |

This matters because the spec was reconstructed by observation rather than issued by the
vendor. Readers deserve to know which parts to trust blindly.

## Build outputs

| Path | What |
| --- | --- |
| `dist/*.html` | The documentation site |
| `dist/openapi.yaml`, `dist/openapi.json` | OpenAPI 3.1 |
| `dist/asyncapi.yaml` | AsyncAPI 3.0 for the websocket |
| `dist/schemas/*.json` | One standalone JSON Schema per object |
| `dist/llms.txt` | Short index for agents |
| `dist/llms-full.txt` | Whole reference as flat text, one fetch |

## Capturing samples

```bash
cp .env.example .env       # add MATCHPLAY_API_TOKEN
npm run probe              # 46 calls, one every 2 seconds
npm run probe tournament   # only probes whose name matches
npm run trim-samples       # samples/raw -> committable fixtures in samples/
```

<!-- markdownlint-disable-next-line -->
> **Rate limiting.** `scripts/probe.js` hard-codes 2000 ms between calls — four times more
> conservative than the API's 120/minute ceiling. Match Play is a small operation and their
> limit is described as generous *on the understanding that consumers behave*. Do not lower
> this.

### Privacy

Raw captures land in `samples/raw/`, which is **gitignored** — those payloads carry real
names, pronouns, avatar URLs and privacy flags for hundreds of people.

`npm run trim-samples` reduces them to at most two records per endpoint in `samples/`, which
*is* committed so the spec tests run on a fresh clone. Trimming is the privacy control:
values are kept verbatim, because rewriting them would defeat the point of proving the
schemas match reality.

**Exactly one person is named in the prose: John Garnett, the repo owner**, whose account is
used deliberately as the demo user throughout. Third-party names were removed rather than
merely vetted. Anyone who set `historyOptOut` should certainly not become the illustrative
example in public API documentation — but not appearing at all is a better default.

Re-run this audit after changing any example — it should return only the repo owner and
non-person names such as machines, venues and rounds:

```bash
grep -rho '"name": *"[^"]*"' content/
```

If a third party does appear, check their opt-out flags with `GET /users/{userId}` before
publishing. Where only an `ifpaId` is available — the WPPR estimator carries no `userId` —
reach the account via `GET /ratings/ifpa/{ifpaId}` → `rating.userId`.

Two payloads need extra care beyond trimming, both handled by `trim-samples.js`: the WPPR
estimator's `players[]` is filtered to the single documented row, and its `unresolvedNames`
is emptied, since that field lists real people who have **no** IFPA record and so appear in
no other object.

## Tests

```bash
npm test              # node:test — build logic and spec integrity
npx playwright test   # rendering, responsive layout, link integrity
```

The unit suite includes the check that keeps this project honest: **every captured sample is
validated against the schema the spec claims describes it**, in both directions — no sample
may violate its schema, and no sample may contain a field the schema omits. If the API
changes shape, or a schema is wrong, the tests fail rather than publishing a wrong spec.

That check has already earned its keep. It caught `initials` being sometimes `null` and
sometimes `""` for the same logical state — a real inconsistency in the API that had been
documented incorrectly.

The Playwright suite checks phone/tablet/desktop widths, both colour schemes, that wide
tables scroll inside their container rather than the page, and that every internal link and
anchor resolves.

## Conventions

Node 24+, 3-space indent, no semicolons, named constants over magic numbers. Documentation
prose lives in `content/`; nothing but config sits at the top level.

## Related

- **[TournamentUtils](https://github.com/haugstrup/TournamentUtils)** — pairing, seeding and
  Glicko algorithms in PHP, by Match Play's own author. Effectively the reference
  implementation behind the API's configuration values.
- **[Official handbook](https://docs.matchplay.events/)** — authoritative on what tournament
  features *mean*, even though it doesn't document payloads.

## Licence

Documentation content is CC BY 4.0. Match Play Events, OPDB, IFPA, Pinball Map and Scorbit
names and data belong to their respective owners.
