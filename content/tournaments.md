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

Two further flags, `includeParent` and `includePlayoffs`, are not in the handbook. A
third-party client sends both on every request, but neither added a key to any response
tried — including a qualifier and its final, where a parent or playoff structure is exactly
what you would expect. They behave like the unknown flags below. To resolve playoff
relationships use [`includeLinkedTournaments`](#finding-links).

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

<!-- claim:link-types -->
`linkType` has [six values](/enumerations.html#configuration-values), not two — a link also
joins a tournament to a series, an arena, a queue or an entry list.

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

## Finding the playoff, or the qualifier {#finding-links}

This is the question `linkedTournaments[]` exists to answer, and the answer turns on one rule
that is easy to get exactly backwards.

<div class="callout callout-trap">
<span class="callout-title"><code>linkType</code> describes the <em>other</em> tournament, not this one</span>

A tournament carrying a **`playoff`** link **is the qualifier** — the link points at its final.

A tournament carrying a **`qualifying`** link **is the final** — the link points at its
qualifier.

Read it the other way round and your code still runs, still returns a real tournament, and is
wrong every time. There is nothing in the response to tell you.
</div>

The clearest way to see it is a reciprocal pair. Tournament 163691 is a monthly qualifier;
221124 is its final. Each one names the *other*'s role:

```jsonc
// GET /tournaments/163691?includeLinkedTournaments=true   ← the qualifier
"linkedTournaments": [
  { "tournamentId": 221124, "name": "Finals for Craft and Draft monthly tournament (November)",
    "linkType": "playoff", "linkIndex": 0 }
]

// GET /tournaments/221124?includeLinkedTournaments=true   ← the final
"linkedTournaments": [
  { "tournamentId": 163691, "name": "Craft and Draft monthly tournament (November)",
    "linkType": "qualifying", "linkIndex": 0 }
]
```

Across 19,761 links, 98.2% of `playoff` targets are named "final" or "playoff" against 5.2%
of `qualifying` targets — the naming confirms the direction at scale.

### Reading them safely

```js
const LINK_PLAYOFF = 'playoff'
const LINK_QUALIFYING = 'qualifying'

function linkedOfType(tournament, linkType) {
   const links = tournament.linkedTournaments ?? []
   return links
      .filter(link => link.linkType === linkType && link.tournamentId != null)
      .sort((a, b) => (a.linkIndex ?? 0) - (b.linkIndex ?? 0))
}

// The finals this tournament feeds into.
const playoffsOf = tournament => linkedOfType(tournament, LINK_PLAYOFF)

// The qualifiers that feed into this tournament.
const qualifiersOf = tournament => linkedOfType(tournament, LINK_QUALIFYING)
```

Three things that guard is doing, each of which corresponds to a real case in the data:

- **`?? []`** — when there are no links the field is `null`, not `[]`.
- **`tournamentId != null`** — a `series` link has **no `tournamentId` at all**; it carries
  `seriesId` instead. All 1,140 series links in the corpus lack the field, so an unfiltered
  `.map(l => l.tournamentId)` yields `undefined` entries.
- **Sorting on `linkIndex`, returning an array** — 709 tournaments carry more than one
  `playoff` link, typically an A and B division. "The playoff" is often not singular.

### A tournament can be both

314 tournaments carry a `playoff` link *and* a `qualifying` link: they are a middle stage,
qualifying out of one round and into another. So "is this a playoff?" has no correct boolean
answer for them — ask the two questions separately:

```js
const isFinal     = qualifiersOf(tournament).length > 0
const isQualifier = playoffsOf(tournament).length > 0   // both can be true
```

### Links are usually, but not always, mutual

In 8,800 of 8,829 checkable pairs (99.7%) the target linked back. So you can normally walk
from either end and get the same picture.

The remaining 0.3% is why a program that must be complete should build a reverse index —
scan the tournaments you have, and record for each id which other tournaments name it as
`qualifying`. That catches a final whose own record is missing the link. It also matters
whenever you are working over a *subset*: the counterpart may simply not be in the set you
fetched, which was true of 411 link targets here.

### When there are no links at all {#inferring-links}

25,693 of the 44,081 tournaments examined carry no links. Several signals can still suggest a
qualifier/final relationship, but none is authoritative — use them to *propose* a pair, and
prefer a real link whenever one exists.

Each was measured against the 8,829 linked qualifier/final pairs, and again against 376,865
*unlinked* same-organizer pairs to see how often it fires on tournaments that are **not**
related. Both numbers matter: a signal that matches every real pair is worthless if it also
matches everything else.

<div class="table-scroll">

| Signal (on the candidate final) | Matches real pairs | Matches unrelated pairs |
| --- | --- | --- |
| Starts on the **same calendar day** | **98.8%** | **1.10%** |
| Roster is a **subset** of the qualifier's | 97.7% | 4.45% |
| Name **contains the qualifier's name** | 91.1% | 3.22% |
| Name is exactly `Finals for {qualifier}` | 79.1% | 0.56% |
| Name merely mentions "final" or "playoff" | 98.2% | **39.6%** |

</div>

<div class="callout callout-trap">
<span class="callout-title">The most obvious signal is the least useful one</span>

Searching for "final" or "playoff" in the name matches 98.2% of real finals — and **39.6% of
unrelated tournaments too**. Organizers name things "Finals" constantly, so on its own it is
close to worthless as a discriminator, despite looking like the strongest lead.

Same-day timing is the opposite: almost identical recall at 98.8%, but it fires on only 1.10%
of unrelated pairs. If you use one signal, use that one.
</div>

Same day is strong because a final is nearly always the back half of a single event: the
median gap is **zero days**, and so is the 90th percentile. Only 28 pairs in 8,829 ran more
than a day apart (the extreme being 49 days), and 13 finals carry a `startLocal` *earlier*
than their qualifier — so compare dates for equality rather than asserting an order.

#### Combining them

Pairing two independent signals is what makes this reliable:

<div class="table-scroll">

| Rule | Matches real pairs | Matches unrelated pairs |
| --- | --- | --- |
| Same day **+** name contains qualifier's name | 90.3% | **0.23%** |
| Same day **+** name mentions final/playoff | 97.0% | 0.67% |
| Any **two of three** (day, name-contains, mentions-final) | 98.6% | 1.53% |

</div>

Same day plus a name mention is the best general-purpose rule — it recovers 97% of real pairs
while firing on well under one percent of everything else. Tighten to full name containment if
you would rather miss a few than guess wrong.

```js
// Propose a candidate final for a qualifier that has no playoff link.
// Same organizer is required, not merely helpful — see below.
function looksLikeFinalOf(final, qualifier) {
   if (final.organizerId !== qualifier.organizerId) return false
   if (final.startLocal.slice(0, 10) !== qualifier.startLocal.slice(0, 10)) return false

   const mentionsFinal = /final|playoff/i.test(final.name)
   const namesQualifier = final.name.toLowerCase().includes(qualifier.name.toLowerCase())

   return mentionsFinal || namesQualifier
}
```

Roster containment is the natural confirmation step once a candidate is proposed, since it
draws on evidence the name and date cannot:

```js
function rosterIsSubset(final, qualifier) {
   const field = new Set(qualifier.players.map(p => p.playerId))
   const finalists = final.players.map(p => p.playerId)

   return finalists.length > 0
      && finalists.length < field.size
      && finalists.every(playerId => field.has(playerId))
}
```

<div class="callout callout-warn">
<span class="callout-title">Every one of these is organizer-scoped</span>

`playerId` is [scoped to the organizer](/identity.html), so a roster comparison across two
organizers is not merely noisy — it is meaningless, because the same integer denotes different
people. All 8,829 linked pairs shared an organizer.

The same caution applies to the whole approach in bulk. A 1% false-positive rate is small per
comparison and large across a corpus: the "same day" test alone produced over four thousand
spurious matches here. These signals are good for **confirming a suspected pair** and poor for
discovering pairs by brute force.
</div>

#### Field size

The field shrinks, and usually by a lot. Across the same 8,829 pairs:

<div class="table-scroll">

| Reduction | Pairs | Share |
| --- | --- | --- |
| Cut by **more than** half | 6,936 | 78.6% |
| Cut by **exactly** half | 1,224 | 13.9% |
| Cut by **less than** half | 669 | 7.6% |

</div>

The median final is **38%** of its qualifier's field, and 90% of finals are at most half of it.
So "half the field" is better read as a ceiling than as the typical case — a rule expecting
exactly half would miss four finals in five.

Requiring a ratio of ≤ 0.5 alongside containment removes 28.8% of the false positives above
while still matching 92.5% of real pairs, which is a reasonable trade if you are scanning in
bulk.

Do not treat a shrinking field as required, though: in 130 pairs the "final" had **as many
players as the qualifier or more**, the largest at 7.75×. A single final fed by several
qualifiers looks like this from each qualifier's side.

#### Playoff cutoffs

For 2,013 of the link-less tournaments a [`playoffsCutoffs`](#playoffscutoffs) entry has text
naming a final or playoff. That suggests the organizer intended one, and nothing more — it
carries **no tournament id**, so it can never tell you *which* tournament the final is. Treat
it as a display label, not as a link.

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
