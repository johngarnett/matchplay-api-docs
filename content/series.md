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
<span class="callout-title">The same series arrives in three different shapes</span>

Which fields you get depends entirely on how you fetched it:

| | `GET /series` | `GET /series/{id}` | `includeSeries` on a tournament |
| --- | --- | --- | --- |
| Core fields | ✓ | ✓ | ✓ |
| `organizer` | — | **✓** | — |
| `rsvpConfiguration` | — | **✓** | — |
| `tournamentIds` | **✓** | — | — |

So the endpoint that names a series' tournaments is **not** the one that fetches a single
series. If you want both the organizer and the tournament list you need two calls, or one
call plus `GET /tournaments?series={id}`.
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

<div class="callout callout-warn">
<span class="callout-title">Expansion parameters are ignored here</span>

`?includeTournaments=true&includePlayers=true` returned a **byte-identical** response to the
bare request — the same silent-ignore behaviour as
[tournament expansions](/tournaments.html#expansion-flags). There is no known way to expand
a series.
</div>

{{schema:Series}}

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
