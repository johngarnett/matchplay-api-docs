---
title: Tournaments
description: Listing and fetching tournaments, expansion flags, and the full field reference
group: Core resources
order: 4
---

# Tournaments

A tournament is the root object — rounds, games, standings, players and arenas all hang off
one. It is also the most complicated object in the API, because a single schema covers
twenty-odd wildly different formats.

## List tournaments

<div class="endpoint"><span class="method">GET</span> <span>/tournaments</span></div>

<div class="table-scroll">

| Parameter | Type | Notes |
| --- | --- | --- |
| `played` | integer | Tournaments played by this **user** id (not a player id) |
| `owner` | integer | Tournaments created by this user id |
| `status` | string | `planned`, `started` or `completed` |
| `series` | integer | Tournaments in this series |
| `page` | integer | 1-based |
| `limit` | integer | Default 25, maximum 100 |

</div>

Results are sorted **descending by date**, furthest-future first. There is **no date filter**
— to get a date range you fetch and filter client-side.

This endpoint uses the odd `simplePaginate` envelope and strips query parameters from its
own `next` link. Read [Conventions](/conventions.html#tournaments-strips-your-query-parameters)
before paginating it.

```bash
curl -s "https://app.matchplay.events/api/tournaments?played=17637&limit=5" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

<div class="callout callout-warn">
<span class="callout-title">An empty result is ambiguous</span>

`?played=` with an unknown user id returns `{"data": []}` — exactly what a real user with no
tournaments returns. The API gives you no way to tell them apart. If you need to validate a
user id, call [`/users/{userId}`](/identity.html#get-a-user-profile), which returns a clean
`404`.
</div>

If the player has hidden their history you get a `403` whose body matches `/opted out/i`.
That is a stable per-user condition, not a failure — see [Errors](/errors.html#opted-out).

## Get one tournament

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}</span></div>

Returns `{ "data": { … } }` where `data` is a bare object, not an array.

`organizer` and `locationId` are always present with no flag needed, and `location` is
embedded on **list** responses whenever `locationId` is set.

### Expansion flags

Match Play document eleven `include*` flags. Six of them actually add data:

<div class="table-scroll">

| Flag | Adds | Works? |
| --- | --- | --- |
| `includePlayers` | `players[]` with `tournamentPlayer` pivots | Yes |
| `includeArenas` | `arenas[]` with `tournamentArena` pivots | Yes |
| `includeBanks` | `banks[]` | Yes |
| `includeScorekeepers` | `scorekeepers[]` | Yes |
| `includeLocation` | `location` | Yes |
| `includeLinkedTournaments` | `linkedTournaments[]` | Yes |
| `includeSeries` | `series` | Yes, when `seriesId` is set |
| `includeRsvpConfiguration` | `rsvpConfiguration` | Yes, when registration is configured |
| `includeEntryConfiguration` | `entryConfiguration` | Observed `null` even on a best-game tournament |
| `includeEvent` | `event` | No populated example captured |
| `includeShortcut` | `shortcut` | No populated example captured |

</div>

Both `true` and `1` are accepted.

<div class="callout callout-trap">
<span class="callout-title">Unknown flags are silently ignored</span>

`includeRounds`, `includeGames`, `includeEverything` and the singular
`includeLinkedTournament` are all **accepted without error** and change nothing. A request
with `?includeRounds=true&includeGames=true` returned a byte-for-byte identical response to
one with no parameters at all.

There is no error, no warning, and no way to discover a typo except by diffing payloads. If
an expansion "isn't working", check the spelling — and check the plural.
</div>

```bash
curl -s "https://app.matchplay.events/api/tournaments/261001?includePlayers=true&includeArenas=true" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## Three things that will bite you

### `linkedTournamentId` is a decoy

The scalar `linkedTournamentId` field is **always `null`** — on all 102 tournaments in one
sample, including ones with a demonstrable playoff link. Only the plural
`linkedTournaments[]` array, behind `includeLinkedTournaments`, carries the real link.

When there are no links the array is `null`, not `[]`.

```json
"linkedTournaments": [
  { "tournamentId": 259156, "name": "Finals for …", "status": "completed",
    "linkType": "playoff", "linkIndex": 0 }
]
```

`linkType` is `qualifying` or `playoff`.

### `status: "started"` usually means finished

This is the most misleading value in the API. Organizers start a tournament, run it, and
then simply close the laptop — the tournament stays `started` forever.

Measured on a live sample: **74 of 77** `started` tournaments were actually over, several by
more than a month.

Consequences:

- Filtering on `status=completed` **loses real, finished tournaments**. If you're computing
  a player's record, you must include `started` too.
- Filtering on `status=started` to find live events gives you mostly stale ones.

The only definitive liveness signal is a **game with `status: "started"`**. Age is a weak
proxy: a `started` tournament more than a couple of days past its `startLocal` is almost
certainly done.

### The field set depends on the type

Configuration keys are **absent**, not null, when they don't apply. This is a per-type
schema, not one schema with optional fields.

<div class="table-scroll">

| Type | Format-specific keys present |
| --- | --- |
| `knockout` | `knockoutStrikeCount`, `byes`, `pairing`, `firstRoundPairing`, `seeding`, `playerOrder`, `arenaAssignment` |
| `matchplay` | above plus `duration`, `gamesPerRound`, `tiebreaker` |
| `group_matchplay` | `scoring`, `tiebreaker`, `duration`, `gamesPerRound`, `pairing` — but **no `byes`** |
| `max_matchplay` | `maxMatchplay*` — **no** `seeding`, `pairing` or `byes` |
| `best_game` | `bestGame*`, `useQueues` — **no** `seeding`, `pairing`, `byes` or `arenaAssignment` |
| `card_best_game` | `cardBestGame*`, `bestGameOverallAttempts`, `useQueues` |
| `frenzy` | `frenzyDuration`, `frenzyQueueSize`, `frenzyStandings`, `frenzyPausedSecondsLeft` |
| `round_robin`, `double_round_robin` | `roundRobinGroupSize`, `byes`, `seeding` |
| `group_bracket` | `roundCount`, `bracketSize`, `groupBracketDoubleByes` |
| `golf`, `bowling` | `golf*`, `tiebreaker` |
| `target` | `targetPoints`, `scoring` |
| `amazingrace` | `seeding`, `arenaAssignment` only |

</div>

So `if (tournament.seeding === null)` and `if (!('seeding' in tournament))` mean different
things, and iterating `Object.keys()` gives different results per tournament.

<div class="callout">
<span class="callout-title">There is no reliable round limit</span>

`roundCount` exists on `group_bracket` only. A live `matchplay` tournament's full payload
carries no round limit at all — one observed example had `duration: 0`, `gamesPerRound: 1`,
and an `endUtc` it overran by about three hours. Treat `endUtc` as advisory.
</div>

## Notable nested objects

### `pointsMap`

Points by finishing position, indexed by group size minus one:

```json
"pointsMap": [[1], [1, 0], [1, 0, 0], [1, 0, 0]]
```

Integer scoring gives you **numbers**; fractional scoring gives you **strings**:

```json
"pointsMap": [["1.00"], ["1.00", "0.01"], ["1.00", "0.02", "0.01"]]
```

<div class="callout callout-trap">
<span class="callout-title">It changes type over the websocket</span>

REST returns an array of arrays. The `TournamentUpdated` websocket event returns the same
field as an **object keyed by stringified group size**:

```json
"pointsMap": {"1": [1], "2": [1, 0], "3": [1, 0, 0], "4": [1, 0, 0]}
```

Same field, same tournament, two structures depending on how it reached you. Normalise on
ingest.
</div>

### `primaryConfigSettings`

An array of *field names* telling a UI which settings to surface — self-describing metadata
pointing at other keys in the same object:

```json
"primaryConfigSettings": ["knockoutStrikeCount", "pairing"]
```

### `playoffsCutoffs`

Where the cut falls, with organizer-authored labels that can contain anything including
emoji:

```json
[{ "index": 0, "value": 16, "cumulative": 16, "text": "FINALS CUTOFF", "color": "green" }]
```

These pair with the `onCutoffBubble` fields on [standings rows](/standings.html).

### `location`

Carries join keys into two external systems:

```json
{
  "locationId": 10993, "name": "Gary's Place",
  "address": "2820 Alki Ave SW, Seattle, WA 98116, US",
  "lat": 47.578242, "lng": -122.412903,
  "pinballmapId": 25134,
  "scorbitVenueId": 62538,
  "scorbitVenueUuid": "8feb4167-657a-4bac-b022-d4b8311cda91"
}
```

`address` is a **single free-text line**, not structured — you'll need an address parser to
extract city or region reliably.

There is no `/locations` endpoint. Venue data arrives only embedded in tournaments, and
there is no way to search by venue.

### `series`

Requires `includeSeries`, and only populates when `seriesId` is non-null:

```json
{
  "seriesId": 6140, "name": "Walk on the Beach", "status": "active",
  "organizerId": 18724, "removedResults": -5, "scoring": "bg_papa"
}
```

`removedResults: -5` means "drop the five worst results". There is no standalone series
endpoint — use `GET /tournaments?series={id}` to enumerate a series' tournaments.

## Field reference

{{schema:Tournament}}

### Series

{{schema:Series}}

### Playoff cutoff

{{schema:PlayoffCutoff}}

### Location

{{schema:Location}}

### Prize pool

{{schema:PrizePool}}

### RSVP configuration

{{schema:RsvpConfiguration}}
