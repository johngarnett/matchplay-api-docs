---
title: Series
description: Recurring competitions that group tournaments — and the three shapes a series takes
group: Core resources
order: 10
---

# Series

A series groups tournaments into a recurring competition — a league season, a monthly
circuit, a multi-week best-game event. Match Play document none of this.

<div class="callout callout-trap">
<span class="callout-title">The same series arrives in four different shapes</span>

Which fields you get depends entirely on how you fetched it:

| | `GET /series` | `GET /series/{id}` | `…?includeDetails=true` | `includeSeries` on a tournament |
| --- | --- | --- | --- | --- |
| Core fields | ✓ | ✓ | ✓ | ✓ |
| `organizer` | — | **✓** | **✓** | — |
| `rsvpConfiguration` | — | **✓** | **✓** | — |
| `tournamentIds` | **✓** | — | **✓** | — |
| `standings`, `players` | — | — | **✓** | — |

The bare single-series call is the weakest of the three server-side options — it is the only
one that names neither the tournaments nor the players. Reach for
[`includeDetails`](#include-details) unless you specifically want the small payload.
</div>

## List series

<div class="endpoint"><span class="method">GET</span> <span>/series</span></div>

Undocumented. Standard length-aware pagination at 25 per page — 4,678 series across 188
pages when sampled.

```bash
curl -s "https://app.matchplay.events/api/series" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "seriesId": 6346,
  "name": "Vermont Pinball League Season 11 (VPL11) @ The Pinball Co-op",
  "status": "active",
  "organizerId": 8932,
  "test": false,
  "removedResults": 0,
  "playoffsCutoffs": [
    { "index": 0, "value": 24, "cumulative": 24, "text": "FINALS CUTOFF", "color": "red" }
  ],
  "scoring": "bg_linear",
  "scoringCustom": null,
  "estimatedTgp": null,
  "tournamentIds": [267037]
}
```

`tournamentIds` is the useful part: it saves a `GET /tournaments?series={id}` call when all
you need are the ids.

{{schema:SeriesListItem}}

## Get one series

<div class="endpoint"><span class="method">GET</span> <span>/series/{seriesId}</span></div>

Undocumented. Returns `{ "data": { … } }` with the organizer's full profile and the RSVP
configuration embedded — neither of which the list provides.

```bash
curl -s "https://app.matchplay.events/api/series/6224" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "seriesId": 6224,
  "name": "Whatcom Pinball League Season 8",
  "status": "active",
  "organizerId": 17565,
  "test": false,
  "removedResults": 1,
  "playoffsCutoffs": [],
  "scoring": "bg_linear",
  "scoringCustom": null,
  "estimatedTgp": null,
  "organizer": { "userId": 17565, "name": "…", "role": "organizer", … },
  "rsvpConfiguration": null
}
```

An unknown id returns the usual `404` naming the Laravel model:
`No query results for model [App\Models\Series] 99999999`.

Invented expansion names are ignored, as everywhere else on this API:
`?includeTournaments=true&includePlayers=true` returns a **byte-identical** response to the
bare request, the same silent-ignore behaviour as
[tournament expansions](/tournaments.html#expansion-flags). Only one expansion is real.

## `includeDetails` — the whole series in one call {#include-details}

<div class="endpoint"><span class="method">GET</span> <span>/series/{seriesId}?includeDetails=true</span></div>

This changes the response substantially. On a nine-tournament series it took the payload from
768 bytes to 17KB, adding five keys:

<div class="table-scroll">

| Key | Contents |
| --- | --- |
| `standings` | Series-wide standings, one row per player |
| `tournamentPoints` | Points per player, keyed by tournament id then player id |
| `players` | The full roster, with each player's `tournamentPlayer` pivot |
| `playerLabels` | Organizer labels and colours, keyed by player id |
| `tournamentIds` | The member tournament ids |

</div>

**This is series-wide standings in a single call.** Without it, reproducing them means
fetching every member tournament's standings and applying the series scoring rules yourself
— including `removedResults`, which drops each player's worst finishes.

```json
{
  "playerId": 573018, "position": 1,
  "points": 640, "pointsAdjusted": 478,
  "onCutoffBubble": null, "cutoffBubbleColor": null,
  "onCutoffBubble2": null, "manualTiebreakerGroup": null
}
```

`points` is the raw total; `pointsAdjusted` is what remains after `removedResults` — that
series drops the worst five, hence 640 against 478. Rank on `pointsAdjusted`.

Note that `tournamentPoints` is keyed by id rather than being an array:

```json
"tournamentPoints": { "258953": { "199818": 85, "225854": 78 } }
```

{{schema:SeriesStanding}}

{{schema:Series}}

## Series statistics {#stats}

<div class="endpoint"><span class="method">GET</span> <span>/series/{seriesId}/stats</span></div>

Attendance analysis, returned as a bare object. Three `Aggregate` blocks describe attendance
per tournament — `overall`, `members` and `guests`:

```json
"overall": { "sum": 111, "max": 19, "min": 11, "mean": 13.875, "median": 13.5, "count": 8 }
```

Every member except `sum` and `count` is **null when the set is empty**, which is the normal
case for `guests` on a members-only series.

`playerAttendances` is a histogram keyed by attendance count — `{"1": 12}` means twelve
players came exactly once. It answers "how much of my field is regulars versus one-timers"
without any per-player work.

{{schema:SeriesStats}}

{{schema:Aggregate}}

<div class="endpoint"><span class="method">GET</span> <span>/series/{seriesId}/stats/attendance?count={n}</span></div>

The players who attended at least `n` tournaments. `count` is **required** and is the
attendance threshold, not a page size — a natural misreading given the name.

## Finding a series' tournaments

<div class="endpoint"><span class="method">GET</span> <span>/tournaments?series={seriesId}</span></div>

This is the documented route, and the one to use when you want the tournaments themselves
rather than their ids. It returns full [tournament objects](/tournaments.html) and uses the
same `simplePaginate` envelope as every other `/tournaments` query — including
[stripping your query parameters](/conventions.html#tournaments-strips-your-query-parameters)
from `links.next`.

Going the other way, a tournament carries `seriesId` (often `null`), and
`includeSeries` embeds the lean form of the series object.

## Fields worth knowing

### `scoring` is a different enum here

A series' `scoring` is **not** the same set as a tournament's. Observed on series:
`points`, `bg_linear`, `bg_papa`, `pingolf`. Tournaments instead use `ifpa`, `papa`,
`dcleague`, `winnerbonus`, `winwinlossloss`.

That makes sense — a series aggregates *placements across tournaments*, so it needs its own
curve. Don't share an enum between them in your model.

### `removedResults` — semantics unconfirmed

The dropped-results rule, but the values do not read as a simple count. Across one page of
25 series:

<div class="table-scroll">

| Value | Series |
| --- | --- |
| `-6` | 2 |
| `-5` | 1 |
| `-4` | 5 |
| `-3` | 1 |
| `0` | 7 |
| `1` | 3 |
| `2` | 6 |

</div>

Both signs occur, plus zero. A negative value plausibly means "drop this many worst results"
and a positive one "count only this many best", but **that is an inference, not an observed
fact** — nothing in the API confirms it. Treat `0` as "keep everything" and check the
series' own rules before relying on the rest.

### `status`

Only `active` was observed across the sampled page. Whether a completed or archived series
reports something else is unverified.

### `playoffsCutoffs`

Identical in shape to the [tournament field](/tournaments.html#playoffscutoffs) —
`{index, value, cumulative, text, color}` — describing where the series cut falls.

### `test`

Sandbox series, same as the tournament flag. Exclude from statistics.
