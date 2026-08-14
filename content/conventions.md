---
title: Conventions
description: Response envelopes, pagination, timestamps and identifier namespaces
group: Start here
order: 2
---

# Conventions

The single biggest obstacle to writing a generic Match Play client is that the API is not
internally consistent. Responses come in five different envelope shapes, pagination comes in
two incompatible flavours, and timestamps come in five formats — sometimes several within
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

The rate budget is charged against the **token**, not your IP — see
[Rate limits](/rate-limits.html).

## The five response envelopes

<div class="table-scroll">

| Form | Shape | Endpoints |
| --- | --- | --- |
| **A** | `{data, links, meta}` — simple pagination | `/tournaments` **only** |
| **B** | `{data, links, meta}` — length-aware pagination | `/games`, `/players`, `/search`, `/single-player-games`, `/cards`, all `/summary/*` |
| **C** | `{data}` alone, no pagination | `/tournaments/{id}`, `/rounds`, `/tournaments/{id}/games`, all `resolve-unknown`, `/users/profile` |
| **D** | **Bare array**, no envelope | `/standings` |
| **E** | Custom named sections | `/users/{id}`, `/ratings/*`, `/pintips`, `/opdb/entries/{id}` |

</div>

A generic `payload.data ?? payload` unwrapper handles A–D. Form E needs per-endpoint
handling.

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

### Form D: standings has no envelope

`GET /tournaments/{id}/standings` returns a top-level JSON array. Handle both shapes so a
future change doesn't break you:

```js
const standings = Array.isArray(payload) ? payload : dataArray(payload)
```

## Pagination

The two paginators differ in ways that matter.

<div class="table-scroll">

| | Form A (`/tournaments`) | Form B (everything else) |
| --- | --- | --- |
| `meta.per_page` | **string** — `"100"` | **number** — `100` |
| `meta.total` | absent | present |
| `meta.last_page` | absent | present |
| `meta.links[]` | absent | present |
| `meta.current_page_url` | present | absent |
| `links.last` | always `null` | populated |

</div>

### `/tournaments` strips your query parameters

This is the one that catches people. Given a request to
`/tournaments?played=17637&limit=5`, the response contains:

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

<div class="callout callout-warn">
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
with no `links` or `meta` — a 135-game tournament came back whole. This is what makes
seeding a tournament cheap: three calls regardless of size.

Summary endpoints paginate but default to `per_page: 5000`, so one request is normally
enough.

## Timestamp formats

Five formats coexist, and which you get depends on the field, not the endpoint. Two of them
appear in the *same* tournament object.

<div class="table-scroll">

| Field | Format | Example |
| --- | --- | --- |
| `startUtc`, `endUtc`, `completedAt` | ISO 8601, 6-digit microseconds, `Z` | `2026-08-14T02:00:00.000000Z` |
| `startLocal`, `endLocal` | space separated, **no zone** | `2026-08-13 19:00:00` |
| Tournament `createdAt`, `updatedAt` | space separated, **no `Z`** | `2026-06-26 00:40:31` |
| Round `createdAt`, `completedAt` | space separated, **with `Z`** | `2026-07-08 06:30:13Z` |
| Game `startedAt` | ISO 8601 with microseconds | `2026-06-27T03:51:18.000000Z` |
| Summary `tournamentDate` | date only | `2026-07-08` |

</div>

Never assume ISO 8601 without checking the specific field.

<div class="callout">
<span class="callout-title">Use <code>startLocal</code> for calendar grouping</span>

A tournament starting 7pm Pacific on 13 August has `startUtc` of `2026-08-14T02:00:00Z` —
the **next day** in UTC. Anything user-facing ("tournaments this month") must group on
`startLocal`, which is already the organizer's wall clock. The `timezone` field names the
zone if you need to convert.
</div>

## Identifier namespaces

Three separate id spaces are in play, and confusing them is the most common source of bugs.

<div class="table-scroll">

| Id | Scope | Where it appears |
| --- | --- | --- |
| `userId` | Global Match Play account | `game.userIds[]`, `organizer.userId`, `/users/{id}`, `?played=` |
| `playerId` | An organizer's roster entry | `standings[].playerId`, `game.playerIds[]`, `?player=` |
| `ifpaId` | IFPA, external | `player.ifpaId`, `user.ifpaId`, `/ratings/ifpa/{id}` |

</div>

`player.claimedBy` holds the `userId` that claimed a roster entry, or `null` if unclaimed.
That field is the bridge. See [Identity](/identity.html) for the full model, including what
to do when a format returns no games to read `userIds` from.

## Numbers arrive as strings

Several numeric fields are JSON strings, not numbers:

- `resultPoints[]` — `"1.00"`, `"0.00"`
- Standings `points`, `pointsWithTiebreaker` — `"9.00"`
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
