---
title: Conventions
description: Response envelopes, pagination, timestamps and identifier namespaces
group: Start here
order: 2
---

# Conventions

The single biggest obstacle to writing a generic Match Play client is that the API is not
internally consistent. Responses come in six different envelope shapes, pagination comes in
two incompatible flavours, and timestamps come in several formats — sometimes several within
one object.

None of this is documented by the vendor. All of it is load-bearing.

## Base URL and authentication

```
https://app.matchplay.events/api
```

```http
Authorization: Bearer YOUR_API_TOKEN
Accept: application/json
```

Tokens come from [app.matchplay.events/account/tokens](https://app.matchplay.events/account/tokens)
and are Laravel Sanctum style: `<id>|<secret>`.

<!-- claim:rate-budget -->
The rate budget is charged against the **token**, not your IP — see
[Rate limits](/rate-limits.html).

## Finding an endpoint: insert `/api`

Match Play's API paths mirror its website paths. If a page exists on the site, the same path
under `/api` usually returns the same thing as JSON:

<div class="table-scroll">

| Web page | API |
| --- | --- |
| `app.matchplay.events/tournaments/261001` | `app.matchplay.events/api/tournaments/261001` |
| `app.matchplay.events/series/6224` | `app.matchplay.events/api/series/6224` |
| `app.matchplay.events/users/5750` | `app.matchplay.events/api/users/5750` |

</div>

This is how several of the undocumented endpoints on this site were found. If you need data
you can see on the website but cannot find in any documentation, look at the URL of the page
showing it and try the same path under `/api`.

<div class="callout">
<span class="callout-title">The failure modes tell you what you found</span>

The four responses are a useful diagnostic. Guessing costs one request each:

| Response | Meaning |
| --- | --- |
| `200` | The endpoint exists and your token can read it |
| `404` `The route api/… could not be found.` | No such route — the guess was wrong |
| `405` `The GET method is not supported for route …` | **The route exists**, but not for `GET`. Try a sibling path — `/api/players/{id}` is a 405 while `/api/players/resolve-unknown` works |
| `401` `Not allowed (token)` | **The route exists**, but a personal token lacks permission. `/api/locations/{id}` and `/api/clubs` both answer this |

`405` and `401` are the interesting ones: both confirm a route is really there, which a
`404` does not. Note that `401 Not allowed (token)` is a different condition from the
[deep-pagination guard](#deep-pagination-is-blocked), which shares the status code but says
something else entirely.
</div>

Please guess gently — space attempts out like any other call, and see
[Rate limits](/rate-limits.html).

<!-- claim:response-envelopes canonical -->
## The six response envelopes

<div class="table-scroll">

| Form | Shape | Endpoints |
| --- | --- | --- |
| **A** | `{data, links, meta}` — simple pagination | `/tournaments` **only** |
| **B** | `{data, links, meta}` — length-aware pagination | `/games`, `/players`, `/search`, `/single-player-games`, `/cards`, all `/summary/*` |
| **C** | `{data}` alone, no pagination | `/tournaments/{id}`, `/rounds`, `/tournaments/{id}/games`, all `resolve-unknown`, `/users/profile` |
| **D** | **Bare array**, no envelope | `/standings`, `/stats/rounds`, `/stats/arenas`, `/arenas/bgsummary` |
| **E** | **Bare object**, no envelope | `/stats/matchplay`, `/stats/players`, `/stats/bestgame`, `/series/{id}/stats`, `/arenas/{id}/bgdetails`, `/ratings/compare` |
| **F** | Custom named sections | `/users/{id}`, `/ratings/*`, `/pintips`, `/opdb/entries/{id}` |

</div>

A generic `payload.data ?? payload` unwrapper handles A–E. Form F needs per-endpoint
handling.

Forms D and E are the same omission seen twice: the newer statistics and format-specific
endpoints skip the `data` wrapper entirely, returning the resource at the top level. Whether
you get an array or an object is decided by the endpoint, not by any visible rule.

### Form C: `data` is not always an array

On collection endpoints `data` is an array. On `/tournaments/{tournamentId}` it is a **bare
object**. Some consumers additionally report `data` collapsing to a single object when a
collection has exactly one member, so normalising defensively is wise:

```js
function dataArray(payload) {
   const data = payload?.data
   if (Array.isArray(data)) return data
   if (data === undefined || data === null) return []
   return [data]
}
```

### Forms D and E: no envelope at all

`GET /tournaments/{id}/standings` returns a top-level JSON array, and it is not alone —
`/stats/rounds`, `/stats/arenas` and `/arenas/bgsummary` do the same. Handle both shapes so
a future change doesn't break you:

```js
const standings = Array.isArray(payload) ? payload : dataArray(payload)
```

The statistics endpoints that return a single aggregate — `/stats/matchplay`,
`/stats/bestgame`, `/stats/players`, `/series/{id}/stats` — return a **bare object** on the
same principle. `payload.data ?? payload` covers both, which is why it is worth using
everywhere rather than reaching for `payload.data` directly.

## Pagination

The two paginators differ in ways that matter.

<div class="table-scroll">

| | Form A (`/tournaments`) | Form B (everything else) |
| --- | --- | --- |
| `meta.per_page` | **string** when your `limit` applied, [number when it did not](/tournaments.html#limit-above-100-reverts-to-25-rather-than-clamping) | **number** |
| `meta.total` | absent | present |
| `meta.last_page` | absent | present |
| `meta.links[]` | absent | present |
| `meta.current_page_url` | present | absent |
| `links.last` | always `null` | populated |

</div>

### `/tournaments` strips your query parameters

This is the one that catches people. Given a request to
`/tournaments?played=5750&limit=5`, the response contains:

```json
{
  "links": {
    "first": "https://app.matchplay.events/api/tournaments?page=1",
    "last": null,
    "next": "https://app.matchplay.events/api/tournaments?page=2"
  },
  "meta": {
    "current_page": 1,
    "path": "https://app.matchplay.events/api/tournaments",
    "per_page": "5"
  }
}
```

Both `links.next` and `meta.path` have **lost `played` and `limit`**. Following `links.next`
verbatim silently returns unfiltered results. Build page URLs yourself.

Because there is no `last_page`, the only correct termination test is:

```js
while (payload.links?.next) { /* fetch page + 1 */ }
```

<div class="callout callout-warn" id="deep-pagination-is-blocked">
<span class="callout-title">Deep pagination is blocked</span>

Requesting a high page number returns **`401`** with:

```json
{ "message": "Do not scrape data by paginating deeply." }
```

Confirmed at `page=9999`. The status code is misleading — this is an anti-scraping guard,
not an authentication problem, and retrying with a fresh token will not help. If you need
bulk data, use the [data exports](/exports.html) or contact Match Play.
</div>

### Endpoints that don't paginate at all

`/tournaments/{id}/rounds` and `/tournaments/{id}/games` return everything in one response
with no `links` or `meta`, [however many games there are](/games.html#games-for-a-tournament).
This is what makes seeding a tournament cheap: three calls regardless of size.

[Summary endpoints](/summaries.html) paginate but default to a very large page size, so one
request is normally enough.

<!-- claim:timestamp-formats canonical -->
## Timestamp formats

Several incompatible formats coexist, and which you get depends on the **field**, not the
endpoint. Two of them appear in the *same* tournament object.

<div class="table-scroll">

| Field | Format | Example |
| --- | --- | --- |
| `startUtc`, `endUtc`, `completedAt` | ISO 8601, 6-digit microseconds, `Z` | `2026-08-14T02:00:00.000000Z` |
| `startLocal`, `endLocal` | space separated, **no zone** | `2026-08-13 19:00:00` |
| Tournament `createdAt`, `updatedAt` | space separated, **no `Z`** | `2026-06-26 00:40:31` |
| Round `createdAt`, `completedAt` | space separated, **with `Z`** | `2026-07-08 06:30:13Z` |
| `/stats/rounds` `createdAt`, `completedAt` | space separated, **with `Z`** | `2026-07-08 03:32:26Z` |
| Game `startedAt` | ISO 8601 with microseconds | `2026-06-27T03:51:18.000000Z` |
| Summary `tournamentDate` | date only | `2026-07-08` |
| Max Match Play `completedTime` | **Unix epoch seconds**, an integer | `1786829694` |

</div>

Never assume ISO 8601 without checking the specific field. The last row is the one most
likely to catch you out: it is the only timestamp on the API that is not a string at all,
so a parser that accepts anything string-shaped will fail on it rather than mis-parse it.

<div class="callout">
<span class="callout-title">Use <code>startLocal</code> for calendar grouping</span>

A tournament starting 7pm Pacific on 13 August has `startUtc` of `2026-08-14T02:00:00Z` —
the **next day** in UTC. Anything user-facing ("tournaments this month") must group on
`startLocal`, which is already the organizer's wall clock. The `timezone` field names the
zone if you need to convert.
</div>

<!-- claim:player-id-scope -->
## Identifier namespaces

Three separate id spaces are in play, and confusing them is the most common source of bugs.
[Identity](/identity.html) explains the model; this is just where each one turns up:

<div class="table-scroll">

| Id | Appears as |
| --- | --- |
| `userId` | `game.userIds[]`, `organizer.userId`, `/users/{id}`, `?played=` |
| `playerId` | `standings[].playerId`, `game.playerIds[]`, `?player=` |
| `ifpaId` | `player.ifpaId`, `user.ifpaId`, `/ratings/ifpa/{id}` |

</div>

The one thing worth knowing before you read further: **`playerId` is scoped to the
organizer, not the tournament**, so one person has several.

`arenaId` and `locationId` are scoped the same way, so one machine and one venue also have
several ids. Locations are the worst of the three, because each organizer types the venue's
details in independently — see
[resolving two ids to one venue](/identity.html#locations).

## Numbers arrive as strings

Several numeric fields are JSON strings, not numbers:

- `resultPoints[]` — `"1.00"`, `"0.00"`
- Standings `pointsWithTiebreaker` — `"9.00"` (and `points`, [usually](/standings.html#numbers-as-strings))
- `Rating.delta` — `"-9.12"`
- `meta.per_page` on `/tournaments` — `"100"`

Coerce explicitly. `tiebreakers[]` is worse: it mixes strings and numbers in one array, for
example `["45.00", 5, 2]`.

## Absent versus null

Tournament configuration keys are **absent** when they don't apply to the format, not null.
A `best_game` tournament has no `seeding` key at all — not `seeding: null`. So:

```js
if ('seeding' in tournament) { /* format uses seeding */ }
```

behaves differently from a null check, and `Object.keys(tournament)` varies by
`tournament.type`. See [Tournaments](/tournaments.html#the-field-set-depends-on-the-type).
