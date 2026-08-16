# MatchPlay API Docs — Additions for John Garnett

Feedback on https://johngarnett.github.io/matchplay-api-docs/ from PinPoint's
production MatchPlay integration. Drafted 2026-08-15; all items verified
against the live API (dates inline so they can carry evidence badges).

Context: John shared the docs site asking if we had anything to add. Items
below were cross-checked against his Tournaments, Enumerations, Divergences,
Exports, and Profiles pages to avoid redundancy — he already covers
include-flag silent ignores, the deep-pagination 401, export ID sparsity,
and the 2-idle-day auto-close.

---

## Message to send

Hey John — great docs. My Claude cross-checked them against what we've
verified building PinPoint's MatchPlay integration. A few additions, all
verified against the live API (dates included so you can badge them):

**1. `GET /api/tournaments` has two more undocumented params** (found in
the SPA bundle, Apr 2026, in daily production use since):

- `playedOrOrganized=<userId>` — union of `played` and `owner`
- `dateInterval=<startISO>;<endISO>` (semicolon-separated ISO-8601 range) —
  this one contradicts your note that the endpoint has "no built-in date
  filtering"; it works, including combined with `played=`

**2. Invalid `status` values are silently ignored** (verified live
Jul 30, 2026): `status=active` returns the *unfiltered* list — no error, no
empty set. Same silent-ignore behavior you documented for unknown `include*`
flags. Candidate for your Divergences page since it can mislead people into
thinking their filter worked.

**3. Pagination `meta` is unreliable when a `status` filter is present** —
`meta.total` came back undefined in our tests. Don't build paging logic on
it for filtered queries.

**4. The user-object privacy opt-out flags** (your Profiles page notes they
exist but doesn't list them). Five booleans on the user object,
absent/falsy = visible: `profileOptOut`, `ratingsOptOut`, `statsOptOut`,
`historyOptOut`, `videoOptOut`.

**5. Export refresh cadence**: the ratings CSVs regenerate daily,
~06:15 UTC (verified via Last-Modified over multiple days, Aug 2026). Your
"lags by a couple of days" note is about the "Data from:" date inside the
header — the file itself lands daily.

**6. A practical fix for the ID-sparsity problem you documented**: many
`latest-rating-revisions.csv` rows are IFPA-keyed with an empty User ID,
but the rows in `latest-ratings.csv` that carry *both* IDs work as a
cross-walk to resolve them. We match ~26k of ~530k revision rows to known
users this way.

**8. (Added Aug 15) `/api/tournaments` now returns Laravel *simple* pagination** — verified by live shape probe: `meta` contains only `current_page`/`current_page_url`/`from`/`path`/`per_page`/`to`; no `total`, no `last_page`, and `links.last` is null. The only more-pages signal is `links.next`. If your schemas show full pagination meta for this endpoint, that predates the switch (which bit us in production: our `meta.last_page` loop terminators silently fetched only page 1 starting ~Aug 13, 2026). Also: `limit=100` works (`per_page` comes back as the *string* `"100"` vs the *number* 25 by default), and over-max values like `limit=150` silently revert to 25 rather than clamping to 100.

**9. (Added Aug 15, post-fix) Termination-logic guidance for your "Building a client" page**: after the simple-pagination switch, `links.next` is the ONLY safe more-pages signal. A short-page heuristic ("got fewer rows than I asked for → done") is a trap when combined with `limit`: if MP ever ignores your `limit` (which it does silently for values over 100), every page comes back at 25 rows with `links.next` still set, and the short-page check ends your walk on page 1. Order of authority: `links.next` when `links` is present; row-count heuristic only as a fallback when it isn't.

**10. (Added Aug 15) The watermark-poisoning failure mode**: if you run incremental sync keyed on "newest item I've seen" (endUtc watermark/cursor), a pagination regression doesn't just truncate one fetch — page 1 still contains the *newest* items, so your watermark advances past the gap and your sync never self-heals. We had 190 player histories silently truncated to exactly 25 rows within two days of MP's switch, all with poisoned cursors. Detection recipe that caught it: compare your mirrored per-player tournament count against MP's own `tournamentPlayCount` (from the user object with `includeCounts`) — exact-page-size mirror counts with a higher MP count are the smoking gun. Cheap standing integrity check for any mirror.

**11. (Added Aug 15) `limit=100` behaves well under sustained load**: hundreds of backfill calls at `limit=100` through a 96 req/min client-side cap, zero errors and zero 429s so far (large remediation batch still running at time of writing — final tally to follow). Page latency stays ~200ms at 100 rows; a 600-tournament history is 7 calls.

**7. Sizing datum for the global completed feed**: ~59 completed
tournaments per 24h worldwide (~3 pages at 25/page, measured Jul 2026).
Pairs nicely with the deep-pagination 401 you documented — a shallow
periodic walk of the completed feed is all a discovery-style sync needs.
For scale: one played-history page returns in ~200ms; a ~500-tournament
player is ~20 pages ≈ 5s.

---

## Internal evidence trail (not part of the message)

| # | Claim | Source |
|---|---|---|
| 1 | `playedOrOrganized`, `dateInterval` params | `lib/services/matchplay/playerTournaments.ts` header (SPA-bundle discovery 2026-04-24, session 64) |
| 2 | `status=active` silently ignored | `docs/features/tourneys-live-status-filter.md` (live probe 2026-07-30, card jezitKUL) |
| 3 | `meta.total` undefined with status filter | same doc, same probe |
| 4 | Five opt-out booleans | `lib/services/matchplay/MatchPlayService.ts` visibility helpers (production since Apr 2026) |
| 5 | Daily ~06:15 UTC export refresh | `docs/features/matchplay-ratings-cdn-import.md` (Last-Modified verified, card uelO4u5A) |
| 6 | Revisions↔identity cross-walk, 26,428/528,552 matched | same doc, E2E import run 2026-08-11 |
| 7 | ~59 completed/24h, ~3 pages; 200ms/page, ~20 pages ≈ 5s | 1zf21IK4 discovery probe 2026-07-26; playerTournaments.ts latency notes |

## Follow-up for us (not for John)

His docs note `limit` max 100 on the tournaments list — our pagination
assumes 25/page. Bumping to `limit=100` would cut played-history backfill
calls ~4x. Filed as card `1ZqSFAjN` (P2, Tech debt, Needs Grooming,
2026-08-15).

## Last Updated

2026-08-15 — drafted, awaiting user review/send.
