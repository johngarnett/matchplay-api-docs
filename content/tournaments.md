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
| `series` | integer | Tournaments in this [series](/series.html) |
| `playedOrOrganized` | integer | Undocumented. Tournaments a user played **or** ran |
| `dateInterval` | string | Undocumented. `startISO;endISO`, semicolon-separated |
| `page` | integer | 1-based |
| `limit` | integer | Default 25, maximum 100 — but see below |

</div>

Results are sorted **descending by date**, furthest-future first.

### Three undocumented filters

None appear in Match Play's handbook. The first two were reported by the
[PinPoint](https://pinpoint.lol/) team from their production
integration and confirmed here on 2026-08-16; the third was found in a third-party client
and verified on 2026-08-15.

**`dateInterval=<start>;<end>`** filters by date, semicolon-separated ISO dates, and combines
with `played`:

```bash
curl -s "https://app.matchplay.events/api/tournaments?played=5750&dateInterval=2026-07-01;2026-07-31" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

That returned 5 tournaments, all in July, against 100 spanning 2024–2026 for the same query
without it. Fetching a player's whole history to filter client-side is therefore avoidable.

**`playedOrOrganized=<userId>`** returns tournaments a user played or ran. Its exact
semantics are unclear: over one three-month window `played` gave 11 and `owner` 10 with a
union of 20, while `playedOrOrganized` returned 14 — fewer than the union, so it is **not**
simply the two sets combined. Useful, but verify against `played` and `owner` before relying
on the count.

**`type=<tournamentType>`** filters by format, taking any value from the
[tournament type list](/enumerations.html#tournament-type). It is the practical way to find
a tournament of a given format — necessary for the
[format-specific endpoints](/games.html#format-views), which refuse anything else. {#type-filter}

```bash
curl -s "https://app.matchplay.events/api/tournaments?type=frenzy&status=completed&limit=5" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

<div class="callout callout-trap">
<span class="callout-title">An unknown <code>type</code> returns nothing — the opposite of <code>status</code></span>

`type` and `status` sit on the same endpoint and handle bad input in **opposite** ways:

| Query | Result |
| --- | --- |
| `status=bananas` | Filter ignored — full unfiltered list |
| `type=bogusnonsense` | Empty `data: []` |

So neither an empty result nor a full one proves your filter was understood. A typo in
`type` looks exactly like "no tournaments of this format exist", and a typo in `status`
looks exactly like a successful query.

This is not hypothetical: a published third-party client sends `type=tournaments`
unconditionally — not a valid type — and therefore fetches an empty list every time.
</div>

This endpoint uses the odd `simplePaginate` envelope and strips query parameters from its
own `next` link. Read [Conventions](/conventions.html#tournaments-strips-your-query-parameters)
before paginating it.

```bash
curl -s "https://app.matchplay.events/api/tournaments?played=5750&limit=5" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

<div class="callout callout-trap">
<span class="callout-title">An invalid <code>status</code> is ignored, and looks like it worked</span>

`status=active` and `status=bananas` both return the **unfiltered** list — no error, no empty
set. The same silent-ignore behaviour as
[unknown `include*` flags](#unknown-flags-are-silently-ignored).

What makes this one nastier is that the result *looks* filtered. Because the list is sorted
furthest-future first, an unfiltered page is dominated by `planned` tournaments, so a
mistyped filter returns a uniform-looking page that is not what you asked for. Verified
2026-08-16: `status=active`, `status=bananas` and no `status` at all each returned 100
tournaments, all `planned`.

Check `status` on the rows you get back rather than trusting the query.
</div>

<div class="callout callout-trap">
<span class="callout-title"><code>limit</code> above 100 reverts to 25 rather than clamping</span>

`limit=150` returns **25** rows, not 100. An over-max value is discarded and the default
applies, so asking for too much gets you a quarter of what you would have had by asking for
the maximum.

This also explains the `per_page` typing: it echoes the `limit` you sent, **as a string**,
and reports the default **as a number**.

| Request | Rows | `meta.per_page` |
| --- | --- | --- |
| `limit=5` | 5 | `"5"` (string) |
| `limit=100` | 100 | `"100"` (string) |
| `limit=150` | **25** | `25` (number) |
| no `limit` | 25 | `25` (number) |

A numeric `per_page` therefore means your `limit` was not applied.
</div>

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
| `includeSeries` | [`series`](/series.html) | Yes, when `seriesId` is set |
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

<!-- claim:linked-tournament-id canonical -->
### `linkedTournamentId` is unreliable

The scalar `linkedTournamentId` was `null` on **all 102 tournaments** in a sample of recent
ones, including tournaments with a demonstrable playoff link — which is why it is easy to
conclude it is never used.

It is used. Three of the six tournaments inside a 2023 event carried real values. The
difference appears to be age: those tournaments have ids around 113,000 against roughly
266,000 for the recent sample.

Whatever the cause, the field is populated inconsistently, so **don't branch on it**. The
plural `linkedTournaments[]` array, behind `includeLinkedTournaments`, is populated
consistently and carries the link type as well as the id.

When there are no links the array is `null`, not `[]`.

```json
"linkedTournaments": [
  { "tournamentId": 259156, "name": "Finals for …", "status": "completed",
    "linkType": "playoff", "linkIndex": 0 }
]
```

`linkType` is `qualifying` or `playoff`.

<!-- claim:auto-close canonical -->
### `status: "started"` and the two-day auto-close {#status-started}

Organizers routinely start a tournament, run it, and then just close the laptop without
marking it complete. Match Play cleans up after them: **a `started` tournament with no
activity for two days is closed automatically.**

Measured against the live `status=started` list:

<div class="table-scroll">

| Group | Count | Longest idle |
| --- | --- | --- |
| Scheduled window closed (`endLocal` in the past) | 77 | **1.68 days** |
| Scheduled window still open (`endLocal` in the future) | 23 | 24.85 days |

</div>

Not one tournament past its scheduled end had been idle for even two days — a clean cliff,
exactly where the auto-close predicts. The long-idle exceptions are all still inside their
scheduled window, and all long-running asynchronous formats: `best_game` ×13,
`card_best_game` ×2, `golf`, `group_matchplay`. A month-long best-game competition is
*supposed* to sit quiet between sessions.

This sample cannot separate whether the exemption keys on `endLocal` or on the format type,
since those two overlap almost perfectly here.

<div class="callout callout-warn">
<span class="callout-title">Older guidance on this is wrong</span>

Documentation and code written before the auto-close — including earlier notes behind this
site — describe `started` as mostly meaning "finished but abandoned", citing samples with
tournaments idle for over a month. **That no longer holds.** In the sample above, zero
tournaments were idle more than 25 days and none at all past their scheduled end.

The auto-close was described by Match Play's author as a recent policy change, which is
consistent with what older captures show.
</div>

What this means in practice:

- **`started` is now a reasonable liveness signal** for ordinary formats — a knockout or
  match play tournament in that state was active within the last two days.
- **It is not a signal at all for long-running formats.** A `best_game` tournament can be
  `started` and untouched for weeks.
- **Filtering on `status=completed` still loses tournaments** — the ones currently inside
  their two-day grace period, plus every long-running event still in its window. Include
  `started` when computing a player's record.
- **For "is someone playing right now"**, `started` is not enough. Use a game with
  `status: "started"`, or a non-empty `activeGames` on a
  [standings row](/standings.html#live-display-columns).

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

Score-based formats such as golf award no positional points, so both `pointsMap` and
`tiebreakerPointsMap` are **`null`** there — not an empty array.

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

Requires `includeSeries`, and only populates when `seriesId` is non-null. This is the
**leanest of the three shapes a series takes** — see [Series](/series.html) for the other
two and for the standalone endpoints:

```json
{
  "seriesId": 6140, "name": "Walk on the Beach", "status": "active",
  "organizerId": 18724, "removedResults": -5, "scoring": "bg_papa"
}
```

Note what the embed does **not** carry: `organizer`, `rsvpConfiguration` (both on
`GET /series/{id}`) or `tournamentIds` (on `GET /series`). If you need any of those, one of
the [series endpoints](/series.html) is a second call — there is no expansion for it.

## Field reference

{{schema:Tournament}}

### Series (as embedded here)

The embed is the base shape only. The [Series page](/series.html) documents the two richer
forms returned by the standalone endpoints.

{{schema:SeriesBase}}

### Playoff cutoff

{{schema:PlayoffCutoff}}

### Location

{{schema:Location}}

### Prize pool

{{schema:PrizePool}}

### RSVP configuration

{{schema:RsvpConfiguration}}
