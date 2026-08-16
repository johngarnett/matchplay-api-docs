---
title: Profiles, search & ratings
navTitle: Profiles & ratings
description: Undocumented endpoints for search, global players, and Match Play Ratings
group: Reference
order: 16
---

# Profiles, search & ratings

Most of this page covers endpoints Match Play's handbook does not mention at all. They were
found in production code and confirmed by live probes.

## Search {#search}

<div class="endpoint"><span class="method">GET</span> <span>/search?query={text}&type={type}</span></div>

<div class="table-scroll">

| Parameter | Required | Notes |
| --- | --- | --- |
| `query` | Yes | Free-text search string |
| `type` | **Yes** | `users` or `tournaments` — nothing else |
| `page` | No | 1-based, 25 per page |

</div>

```bash
curl -s "https://app.matchplay.events/api/search?query=Jones&type=users" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Results are full objects, not stubs: `type=users` returns complete
[`User`](/identity.html#user) objects, `type=tournaments` returns complete
[`Tournament`](/tournaments.html) objects. A search for `Jones` returned 192 users across 8
pages.

<!-- claim:idless-players -->
<div class="callout callout-warn">
<span class="callout-title">Matching is fuzzy, and account-only</span>

A search for a full two-word name returned **223 results**, so this is loose token matching
rather than exact lookup. A non-empty result set means nothing on its own — filter for the
exact name yourself.

More importantly, `type=users` only sees **user accounts**. Match Play rates many players who
never created one, and those are unreachable here: two names drawn from id-less rows of the
[ratings CSV](/exports.html) returned no exact match, while a control name with an account
did. For those players the CSV is the practical source — no endpoint found here reaches
them.
</div>

<div class="callout callout-warn">
<span class="callout-title">Only two types exist</span>

`type` is mandatory — omitting it gives `422 "The type field is required."`

`arenas` and `locations` both return `422 "The selected type is invalid."`, so **there is no
way to search machines or venues through this API**. Combined with the absence of any
`/locations` endpoint, venue discovery has to be built on your own index of tournament
`location` objects.
</div>

## Global players

<div class="endpoint"><span class="method">GET</span> <span>/players?players={csv}&status=active</span></div>

Undocumented. Takes **`playerId`s** (organizer-scoped), not `userId`s — passing a user id
returns an empty page rather than an error, which makes mistakes here silent.

Uses full length-aware pagination, unlike `/tournaments`.

For most purposes [`/players/resolve-unknown`](/identity.html#resolve-unknown) is a better
fit: same data, explicit batch semantics, documented 25-id limit.

## Profiles

<div class="endpoint"><span class="method">GET</span> <span>/users/{userId}</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/users/profile</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/users/resolve-unknown?users={csv}</span></div>

`/users/{userId}` returns the rich eight-section bundle described in
[Identity](/identity.html#get-a-user-profile). `/users/profile` returns whoever owns the
token, wrapped in a normal `data` key. `/users/resolve-unknown` batch-resolves up to 25 ids
to plain user objects.

## Match Play Ratings

Match Play maintains its own Glicko rating system, independent of IFPA's WPPR ranking. Two
endpoints expose it, both undocumented.

<div class="endpoint"><span class="method">GET</span> <span>/ratings/users/{userId}</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/ratings/ifpa/{ifpaId}</span></div>

Both return the same bundle. Neither uses a `data` wrapper.

```json
{
  "rating": {
    "ratingId": 2593, "userId": 5750, "ifpaId": 32819, "name": "John Garnett",
    "rating": 1600, "rd": 24, "calculatedRd": 24, "ratingClass": 4,
    "delta": "-9.12", "lowerBound": 1551,
    "gameCount": 2470, "winCount": 2838, "lossCount": 2657, "resultCount": 5495,
    "efficiencyPercent": 0.5164695177434031,
    "firstRatingPeriod": "2016-05-04T00:00:00.000000Z",
    "lastRatingPeriod": "2026-08-03T00:00:00.000000Z"
  },
  "ifpaInfo": { "rank": 2020, "womensRank": null },
  "ratingHistory": [
    { "ratingPeriod": "2025-07-30", "rating": 1597, "lowerBound": 1549, "upperBound": 1646 },
    …
  ]
}
```

<div class="callout">
<span class="callout-title">The rating history is a full time series</span>

`ratingHistory` returned **369 points** in one observed response — one per rating period
where the player's rating changed. That is enough to plot a career trajectory from a single
call, and it is not in Match Play's documentation.

It complements the [rating revisions CSV](/exports.html), which covers all players but only
the past year.
</div>

### Reading the numbers

<div class="table-scroll">

| Field | Meaning |
| --- | --- |
| `rating` | Glicko rating |
| `rd` | Rating deviation at the last rating period |
| `calculatedRd` | RD advanced to today — grows while a player is inactive |
| `lowerBound` | `rating − 2·rd`, the conservative rating. **Match Play ranks on this** |
| `ratingClass` | Tier bucket |
| `delta` | Change at the most recent period, as a **string** |
| `efficiencyPercent` | Win efficiency, 0–1 |
| `resultCount` | Distinct results; `gameCount` counts games |

</div>

Ranking on `lowerBound` rather than `rating` is deliberate: it penalises uncertainty, so a
player with few games can't top the list on a small sample.

<div class="callout">
<span class="callout-title"><code>/ratings/ifpa/</code> reaches players with no Match Play account</span>

Querying by IFPA id returned a rating whose `rating.userId` was **`null`**:

```json
{ "ratingId": 135, "userId": null, "ifpaId": 31811,
  "rating": 1552, "rd": 36, "calculatedRd": 41, "ratingClass": 4 }
```

That is a player IFPA knows about and Match Play rates, but who has never created a Match
Play account — so there is no profile, and none of the opt-out flags exist for them.

This makes it the bridge between the two identifier namespaces, and the route to players who
cannot be reached by Match Play `userId`.
</div>

### Use the CDN for bulk

For more than a handful of players, do **not** call these endpoints. The
[ratings CSV export](/exports.html) has every player in one file and costs the API nothing.

### Comparing several players {#compare}

<div class="endpoint"><span class="method">POST</span> <span>/ratings/compare</span></div>

Between "one player" and "the whole CSV" sits this: several ratings in one call, selected by
any mix of `userIds`, `ifpaIds` and `playerIds`.

```bash
curl -s "https://app.matchplay.events/api/ratings/compare" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userIds": [5750]}'
```

It returns a bare object — `ratings[]` plus a `records` map keyed by `ratingId`.

<div class="callout callout-trap">
<span class="callout-title">Send it as <code>POST</code>, and keep each list to 24 ids</span>

The client this endpoint was found in issues it as a **`GET` with a JSON body**. That is
legal but widely mishandled — several HTTP stacks drop the body silently, and that client's
own test suite marks the call as returning wrong data in code while working in Postman.
`POST` is verified working here and avoids the problem entirely.

The same client caps every id list at **24 entries**, which is good evidence of a server-side
batch limit even though the limit is undocumented.
</div>

{{schema:RatingComparison}}

### Full rating history {#rating-history}

<div class="endpoint"><span class="method">GET</span> <span>/ifpa/{ifpaId}/rating-history</span></div>

Paginated, one row per rating period, defaulting to 100 rows.

This is **not** the same shape as the `ratingHistory` array embedded in a rating bundle. That
one carries four fields; this one adds the revision id, rating deviation, the per-period
`delta` and win/loss counts — enough to chart form over time rather than just rating.

{{schema:IfpaRatingHistoryPoint}}

### The global ratings list {#ratings-list}

<div class="endpoint"><span class="method">GET</span> <span>/ratings</span></div>

Every rating, paginated, ordered by `ratingId` — so an unfiltered call starts at rating 1 and
tells you nothing in particular.

<div class="callout callout-trap">
<span class="callout-title">It filters on a JSON body sent with a <code>GET</code></span>

```bash
curl -s -X GET "https://app.matchplay.events/api/ratings?page=1" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"userIds": "5750"}'
```

That returns one rating. Drop the `-d` and the same URL returns the global list from
`ratingId: 1`.

The filter works, but **the failure mode is silent**: a client that discards the body gets a
`200` and a full unfiltered page rather than an error. Node's `fetch` refuses outright
(`Request with GET/HEAD method cannot have body`); other stacks simply drop it. This is
almost certainly why the client that revealed this endpoint has its own test marked
*"returns wrong data in code but not in Postman"*.

Unless you specifically need this shape, prefer
[`/ratings/users/{userId}`](#match-play-ratings) for one player or
[`POST /ratings/compare`](#compare) for several — neither depends on your HTTP stack
tolerating an unusual request.
</div>

### Rating periods {#rating-periods}

<div class="endpoint"><span class="method">GET</span> <span>/rating-periods</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/rating-periods/{YYYY-MM-DD}</span></div>

Both answer `401 "Not allowed (token)"` for an ordinary API token. The routes resolve — this
is a permissions refusal, not a missing endpoint, and a `404` would read
`The route api/… could not be found.` instead — but their response shapes are **unverified**
here because no available token can read them.

## OPDB and PinTips

<div class="endpoint"><span class="method">GET</span> <span>/opdb/entries/{opdbId}</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/opdb/changelog</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/pintips?opdbId={id}</span></div>

Machine metadata from the Open Pinball Database and short playing tips.

`/opdb/entries/{opdbId}` returns `{entry, type, videos}` — the machine record plus tutorial
videos. `/pintips` returns `{pintips, opdbInfo}` and accepts either `opdbId` or `arenaId`.

Parse an OPDB id with:

```
/^G([a-zA-Z0-9]+)(?:-M([a-zA-Z0-9]+)(?:-A([a-zA-Z0-9]+))?)?$/
```

Capture groups are group, machine and alias. The group identifies the title across all
editions.

`/opdb/changelog` lists ids that were moved or deleted, so you can migrate stored ids rather
than silently losing machines.

Again: for anything beyond a handful of lookups, [download the full datasets](/exports.html).
Both are single files of 1–1.5 MB.

## Field reference

### Rating

{{schema:Rating}}

### Rating bundle

{{schema:RatingBundle}}

### Rating history point

{{schema:RatingHistoryPoint}}
