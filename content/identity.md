---
title: Identity
description: playerId vs userId vs ifpaId, claimedBy, and the resolve-unknown endpoints
group: Core resources
order: 8
---

# Identity

Three separate identifier namespaces coexist in this API, and Match Play's handbook does not
describe how they relate. Getting the model right is a prerequisite for almost any interesting query — "how
did *this person* do?" is surprisingly hard to answer.

<!-- claim:player-id-scope canonical -->
## The three namespaces

<div class="table-scroll">

| Id | Scope | Stable across tournaments? |
| --- | --- | --- |
| **`userId`** | A global Match Play account | Yes |
| **`playerId`** | An entry on one **organizer’s** roster | No — one per organizer, reused across that organizer’s tournaments |
| **`ifpaId`** | An IFPA competitor record, external | Yes, but not everyone has one |

</div>

<!-- claim:idless-players -->
<div class="callout callout-warn">
<span class="callout-title">A rated player may have none of the three</span>

Match Play rates anyone who plays a rated tournament, account or not, and
[most rated players have neither a `User ID` nor an `IFPA ID`](/exports.html#most-rated-players-have-no-id-at-all).
They exist only as a name and a rating, are invisible to `/search`, and no endpoint found
here reaches them.

Within a tournament they still have a `playerId`, so results and standings work normally.
It is only the *global* identity that is missing.
</div>

Here is one real person across four tournaments — the same human being every time:

<div class="table-scroll">

| Tournament | `organizerId` | `playerId` | `claimedBy` | `ifpaId` | `tournamentPlayer.seed` |
| --- | --- | --- | --- | --- | --- |
| 265276 | 5750 | **102677** | 5750 | 32819 | 29 |
| 265105 | 93 | **37273** | 5750 | 32819 | 2020 |
| 264541 | 17637 | **334483** | 5750 | 32819 | 5 |
| 263364 | 17637 | **334483** | 5750 | 32819 | 8 |

</div>

Three things to read out of that table:

1. **`playerId` changes with the organizer**, not the tournament. Three organizers, three
   different player ids for one person.
2. **The last two rows share a `playerId`** because they share an organizer — so a player id
   is *not* unique per tournament, and you cannot use it as a per-tournament key.
3. **`tournamentPlayer.seed` still differs between those two rows**, because the pivot *is*
   per-tournament even when the player entry is not.

`claimedBy` and `ifpaId` are the only columns stable across all four.

## `claimedBy` is the bridge

Every player object carries `claimedBy` — the `userId` of the account that claimed that
roster entry, or `null`:

```json
{
  "playerId": 334483, "name": "John Garnett", "ifpaId": 32819,
  "status": "active", "organizerId": 17637,
  "claimedBy": 5750,
  "labels": [], "labelColor": null
}
```

`claimedBy: null` means an organizer typed a name in and no account ever claimed it. Those
players are invisible to any user-centric query — they exist only on that organizer's
roster.

<div class="callout callout-warn">
<span class="callout-title">Never key your own storage on <code>playerId</code> alone</span>

Because a person has one `playerId` per organizer, aggregating a player's history means
resolving every one of them back to a single `claimedBy`. Storing statistics keyed on
`playerId` will silently split one competitor into several.

`(organizerId, playerId)` identifies a roster entry. `claimedBy` identifies the person.
</div>

## A pattern: one prefixed id

Three namespaces, any of which may be missing, is awkward to store. One approach in
production use is to collapse them into a single string keyed by which namespace it came
from, preferring the most stable:

```js
function canonicalId(player) {
   if (player.claimedBy) return `m${player.claimedBy}`   // a Match Play account
   if (player.ifpaId)    return `i${player.ifpaId}`      // IFPA, no Match Play account
   return `p${player.playerId}`                          // neither: roster entry only
}
```

One column holds any player, the prefix says how much you know about them, and the
preference order means a person who later claims their account collapses from `i…` to `m…`
rather than fragmenting.

<div class="callout callout-warn">
<span class="callout-title">The third case is the one that gets dropped</span>

In a 30-day global snapshot of 2,755 tournaments, the standings resolved to **38,284 `m`
ids and 4,102 `i` ids — and zero `p` ids**. Not because unclaimed players are rare, but
because that pipeline discards players with neither identifier before writing its output.

So the id-less players are missing from the derived data entirely, and nothing in it says
so. If you build a mirror this way, decide deliberately whether `p…` rows are stored or
dropped — and if dropped, record that they were, because a later reader cannot tell the
difference between "no unclaimed players" and "unclaimed players removed".
</div>

## Which endpoints give you what

<div class="table-scroll">

| Source | Gives you |
| --- | --- |
| `game.userIds[]` | `userId`, slot-aligned with `playerIds` |
| `GET /tournaments/{id}?includePlayers=true` | Roster with `playerId` + `claimedBy` |
| `resolve-unknown` | Either, in batches |
| `standings[]` | `playerId` **only** |

</div>

<div class="callout callout-trap">
<span class="callout-title"><code>userIds</code> comes from exactly one endpoint</span>

Only `GET /tournaments/{tournamentId}/games` returns `userIds`. The documented global
`/games` endpoint does not — see [Games](/games.html).

So the normal way to find "which playerId is this user in this tournament?" is to scan the
tournament's games for their `userId` and read the same slot from `playerIds`.
</div>

```js
function findPlayerId(games, userId) {
   for (const game of games) {
      const slot = game.userIds?.indexOf(userId)
      if (slot !== undefined && slot !== -1) return game.playerIds[slot]
   }
   return undefined
}
```

## When there are no games to scan

Score-based formats — golf, best_game, card_best_game, bowling — return rounds that contain
**zero game objects**. There is nothing to scan, so the technique above finds nothing, and
without a `playerId` you cannot read the player's placement from standings.

The fallback is the roster:

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}?includePlayers=1</span></div>

```js
function findPlayerIdInRoster(roster, userId) {
   return roster.find(player => player.claimedBy === userId)?.playerId
}
```

Because this costs an extra call, run it only when the games route fails — which for
head-to-head formats is never.

<div class="callout">
<span class="callout-title">A correction worth noting</span>

It is sometimes said that score-based tournaments return games "without `userIds`". That is
not what happens. Inspection of 6,148 cached games found **no game anywhere** lacking
`userIds`, while golf tournaments such as 259350, 256439 and 257742 each had multiple rounds
containing **zero games**.

The games don't exist. That distinction matters: you are not looking for a field on an
object, you are handling the absence of the objects entirely.
</div>

## resolve-unknown

Batch-resolve ids to full objects. Four variants exist, and the choice between them matters
more than it looks.

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/players/resolve-unknown?players=334483</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/arenas/resolve-unknown?arenas=56443</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/players/resolve-unknown?players=334483</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/users/resolve-unknown?users=5750</span></div>

Rules:

- The query parameter name **equals the resource kind** — `players=`, `arenas=`, `users=`.
- Comma-separated, **maximum 25 ids** per request. Batch larger sets yourself.
- Ids that don't resolve are **silently dropped**, not errored. Compare what you asked for
  against what came back.

<div class="callout callout-warn">
<span class="callout-title">Use the tournament-scoped variant for players</span>

The global `/players/resolve-unknown` omits the `tournamentPlayer` pivot — so no `seed`, no
per-tournament `status`, no `pointsAdjustment`.

Compare, for the same player id. Global — `GET /players/resolve-unknown?players=334483`:

```json
{ "playerId": 334483, "name": "John Garnett", "ifpaId": 32819,
  "status": "active", "organizerId": 17637, "claimedBy": 5750,
  "labels": [], "labelColor": null }
```

Tournament-scoped — `GET /tournaments/264541/players/resolve-unknown?players=334483`
returns everything above **plus**:

```json
  "tournamentPlayer": {
    "status": "active", "seed": 5, "pointsAdjustment": 0,
    "subscription": null, "labels": [], "labelColor": null
  }
```

If you need to know whether a player is still active *in this tournament*, only the scoped
variant can tell you.
</div>

## Two-scope status

Both players and arenas carry a status at two levels, and they mean different things.

<div class="table-scroll">

| Field | Scope | Meaning |
| --- | --- | --- |
| `player.status` | Global account | Almost always `active` |
| `player.tournamentPlayer.status` | This tournament | `inactive` = left this event |
| `arena.status` | Global machine | `inactive` = retired |
| `arena.tournamentArena.status` | This tournament | `inactive` = not in play here |

</div>

A player who drops out mid-tournament has `status: "active"` and
`tournamentPlayer.status: "inactive"` simultaneously. **The top-level status is not the one
you want** for anything tournament-related.

The pivot's key set is also not stable — one captured deactivated-player row omitted
`labels` and `labelColor` entirely. Read defensively.

## Arenas

An "arena" is a machine. They follow the same pivot pattern:

```json
{
  "arenaId": 56443, "name": "Cheetah", "status": "inactive",
  "opdbId": "GR6kW-Mo1W3", "categoryId": 2, "organizerId": 14223,
  "tournamentArena": {
    "status": "active", "preferred": null,
    "scorbitVenuemachineId": null, "scorbitVenuemachineUuid": null,
    "scorbitronInstalled": null, "amazingRaceSeed": null,
    "bestGameBlocked": false, "bestGameQueueClosed": false,
    "labels": ["Pinball Alley"], "labelColor": "purple"
  }
}
```

- **`opdbId`** joins to the [Open Pinball Database](/exports.html): `G<group>-M<machine>[-A<alias>]`.
  The group prefix is shared across Pro/Premium/LE editions of a title, so group-level
  matching answers "how do people do on Godzilla" across all versions. Null for homebrew
  machines.
- **`labels`** on the pivot are commonly used as bank or section names — `"Pinball Alley"`,
  `"East Wall"`.
- **Scorbit fields** wire the machine to Scorbit hardware. Note the lowercase `m` in
  `scorbitVenuemachineId`.

There is **no global arenas endpoint**. [`GET /arenas`](/organizer-resources.html) returns
only the machines belonging to your own organizer, and `/search?type=arenas` returns `422`.
Another organizer's machines reach you only embedded in a tournament or via
`resolve-unknown`.

## Locations {#locations}

A location is a venue, and it is scoped exactly like a player or a machine: **`locationId`
belongs to the organizer, not to the venue.** When five directors run tournaments at one
address, that address has five location ids.

This is the more painful of the two scoping problems. A `playerId` at least describes one
person consistently within an organizer; a location is free-text data that each organizer
enters independently, so the same venue arrives spelled differently, or with an address on
one row and nothing on another.

Match Play offer a Scorbit venue lookup that fills the record in properly, but taking it is
optional and **fewer than half do**. Of 3,097 locations across 1,701 organizers:

<div class="table-scroll">

| | Locations | Share |
| --- | --- | --- |
| Carry a `scorbitVenueId` | 1,307 | 42.2% |
| Carry a `pinballmapId` | 1,524 | 49.2% |
| Carry an `address` | 2,683 | 86.6% |
| **No external id at all** — typed by hand | **1,539** | **49.7%** |

</div>

Two real tournaments at the same Seattle venue show what that looks like:

```jsonc
// tournament 266703, organizer 7059 — typed by hand
{ "locationId": 5461, "name": "JUPITER",
  "scorbitVenueId": null, "pinballmapId": null,
  "address": null, "lat": null, "lng": null }

// tournament 262812, organizer 18646 — taken from Scorbit
{ "locationId": 10222, "name": "Jupiter Gameroom",
  "scorbitVenueId": 5390, "scorbitVenueUuid": "b2e472a4-7882-4070-a511-1d19c51d201e",
  "pinballmapId": 8947, "address": "2126 2nd Ave Suite A, Seattle, WA 98121, US",
  "lat": 47.613171, "lng": -122.343849 }
```

Nothing in either record points at the other. The scale of the duplication is easy to
under-estimate: 289 Scorbit venues appear under more than one `locationId` — 835 location
rows between them — and **every one of those 289 spans multiple organizers**. The worst case
is Ground Kontrol Classic Arcade in Portland, which exists as **eleven** separate locations.

### Resolving two ids to one venue

In order of how much you should trust them:

1. **`scorbitVenueUuid` or `scorbitVenueId`** — a shared value is proof. Available on 42% of
   locations, and only useful when *both* sides have it.
2. **`pinballmapId`** — the same, and slightly more common at 49%.
3. **`lat`/`lng`** — present on 59%. Nearby coordinates are strong evidence, though a large
   venue and its neighbour can sit within a few metres of each other.
4. **Player overlap**, and **whether the director plays at the other venue** — the fallbacks
   that work when a record has no external id at all, which is half of them. Used together
   they catch 82.8% of provable duplicates while firing on 1.0% of unrelated pairs; adding a
   name check takes the false-positive rate to 0.01%.

<div class="callout callout-trap">
<span class="callout-title">The name is not a key, and neither is the address</span>

Among duplicate groups that Scorbit *proves* are one venue, 6% still disagree on the name —
and those are the well-behaved half, where both records came from the same source. The
hand-entered half is where `JUPITER` and `Jupiter Gameroom` live, and it is precisely the
half you cannot check.

Matching on normalised names will therefore merge venues that share a common name
(`"The Pinball Museum"`) while missing the pairs you actually needed to catch.

As a *filter* on another signal it earns its place — see
[requiring the name to match as well](#requiring-the-name-to-match-as-well). It is starting
from the name that goes wrong.
</div>

### Player overlap

The people are the same even when the data is not. Comparing the players who appear at two
locations separates real duplicates from unrelated venues sharply:

<div class="table-scroll">

| Overlap of the smaller player set | Same venue (proven by Scorbit) | Different venues |
| --- | --- | --- |
| Median | **0.557** | 0.000 |
| At least 0.30 | 76.6% | **0.6%** |
| At least 0.50 | 57.5% | 0.3% |

</div>

A threshold of 0.30 therefore recovers about three quarters of genuine duplicates while
firing on well under one percent of unrelated pairs.

<div class="callout callout-warn">
<span class="callout-title">Restricted-field tournaments depress the overlap</span>

Some tournaments are open only to a subset of players — women's and women/trans/femme/NB
leagues are the common case, and around 4.7% of tournaments signal one in their name or
description. A venue that hosts both an open monthly and a women's monthly will show a
genuinely smaller intersection than its two rosters suggest, because half the pairing is
drawing from a restricted pool by design.

**No field encodes it.** Across 44,081 tournaments the tournament object uses 100 distinct
top-level keys, and none of them describes eligibility — the closest name, `playerOrderOpen`,
is about play order. The only signal is free text, as in this real description:

> Jupiter's monthly womxn's pinball tournament! … Women/Trans/Femme/NB welcome

So you cannot detect the situation reliably, and you should not try to parse your way to it.
Treat a *low* overlap as weak evidence rather than as a refutation, and let the join keys and
coordinates outrank it whenever they are available.
</div>

This is the concrete reason for the metric below. The two Jupiter locations are exactly this
case — one open tournament series, one women's series — and they score very differently
depending on how you measure:

<div class="table-scroll">

| Jupiter pair, 239 vs 60 claimed players, 36 shared | Score | At threshold 0.30 |
| --- | --- | --- |
| **Overlap coefficient** | **0.600** | match |
| Jaccard | 0.137 | miss |

</div>

Jaccard divides by the union, so a small restricted roster sitting inside a much larger open
one scores low however complete the containment is. That is the wrong answer here, and it is
why the code below normalises by the smaller set.

<div class="callout callout-warn">
<span class="callout-title">Compare by <code>claimedBy</code>, never by <code>playerId</code></span>

This is the trap the whole page is about, and it bites hardest here. Two locations with
different `locationId`s almost always belong to **different organizers** — that is why they
are duplicated in the first place — so their `playerId`s are drawn from different namespaces.
Intersecting them compares unrelated integers and yields noise.

Map to a global identity first: `player.claimedBy` (a `userId`), or `player.ifpaId`. Players
who never claimed their account have neither, and simply drop out of the comparison.
</div>

```js
const OVERLAP_THRESHOLD = 0.30
const MIN_PLAYERS = 5

// Global user ids for everyone who has played at a location.
function claimedPlayers(tournaments) {
   const users = new Set()
   for (const tournament of tournaments) {
      for (const player of tournament.players ?? []) {
         if (player.claimedBy != null) users.add(player.claimedBy)
      }
   }
   return users
}

// Overlap coefficient, not Jaccard. One organizer's roster at a venue is
// routinely several times another's -- and a restricted-field tournament makes
// that worse -- so dividing by the union punishes exactly the pairs you want to
// catch. Measured on the Jupiter pair above: 0.600 here against 0.137 Jaccard.
function sameVenue(usersA, usersB) {
   if (usersA.size < MIN_PLAYERS || usersB.size < MIN_PLAYERS) return false

   let shared = 0
   for (const userId of usersA) if (usersB.has(userId)) shared += 1

   return shared / Math.min(usersA.size, usersB.size) >= OVERLAP_THRESHOLD
}
```

### The organizer is a signal in their own right

Directors are local. Of 357 organizers owning two or more located venues, the **median
distance between their furthest-apart venues is 16 km**, and 73.9% keep everything within
50 km. The tail is real, though — the 99th percentile is 2,154 km, and one organizer spans
8,753 km — so treat "same organizer" as evidence of proximity, not proof of it.

Directors also play. In **50.0%** of tournaments the organizer appears in their own player
list, and they turn up at neighbouring venues too. That gives a signal independent of the
crowd: if the director who runs location A shows up as a *player* at location B, the two are
probably in the same town — and if the names also look alike, probably the same building.

Conveniently, the organizer is always resolvable. Unlike players, who may never claim their
account, **every organizer carries a `userId`** — 44,081 of 44,081 tournaments examined — so
`organizer.userId` can always be intersected against another location's `claimedBy` values.

<div class="table-scroll">

| Rule | Same venue (proven by Scorbit) | Different venues |
| --- | --- | --- |
| Player overlap ≥ 0.30 | 76.6% | 0.6% |
| Director plays at the other location | 63.6% | 0.7% |
| **Either of the two** | **82.8%** | **1.0%** |

</div>

The two are worth combining because they fail differently. The director test found 57 real
duplicates that the overlap test missed — 6.2% of all true pairs — for 0.3 points of extra
false positives. A director can attend a neighbouring venue whose crowd barely intersects
theirs, which is exactly the [restricted-field case](#locations) above: a small women's league
and a large open one may share little but their organizers.

### Requiring the name to match as well

The name is [useless as a key on its own](#locations), but as a *filter* on another signal it
is powerful. Directors are local, so one turning up at a second venue mostly means the two
are in the same town — it does not make them the same building. Requiring the names to agree
as well removes almost everything that survives:

<div class="table-scroll">

| Rule | Same venue | Different venues |
| --- | --- | --- |
| Director plays at the other location | 63.6% | 0.70% |
| Similar name | 96.8% | 0.43% |
| **Both** | **61.8%** | **0.01%** |

</div>

Roughly one in three of the pairs the director test flags is a genuine duplicate; requiring a
similar name as well takes that to the great majority, at the cost of a couple of points of
recall.

<div class="callout callout-warn">
<span class="callout-title">That 0.01% is an over-estimate, and the residue is not coincidence</span>

These rates are measured against pairs with **different `scorbitVenueId`s**, treated as
"different venues" — but Scorbit has duplicates of its own. Inspecting the ~90 survivors
across 300,000 pairs, they are almost all one of three things, and only the last is an error:

- **Venues Scorbit itself failed to unify.** `Flipperz Pinball` and `Flipperz Pinball` sit at
  the same coordinates under two Scorbit ids; `Next Level Pinball Museum` and `Next Level` are
  10 metres apart. These are correct answers being scored as mistakes.
- **Two branches of one business in one metro** — `Barcade (Brooklyn)` and `Barcade FiDi`,
  5 km apart; `Quarters Arcade Bar` and `Quarters Arcade Bar (Sugarhouse)`. Same brand, same
  owner, genuinely different buildings. **This is the real limit of the technique**, and no
  amount of name matching fixes it. Coordinates do.
- **Generic words surviving normalisation** — `The Kraken Bar & Lounge` against
  `Rickshaw Restaurant & Lounge`, matching on "lounge"; `Roshambo Beverage Company` against
  `Mordecai Beverage Company`. Strip venue-type words (`bar`, `lounge`, `arcade`, `brewing`,
  `company`, `tavern`) before comparing, or these are what you will get.

What does *not* appear is an unrelated venue that coincidentally shares a name and a director.
Treat a surviving disagreement as a branch or a Scorbit duplicate, not as a fluke.
</div>

```js
// Independent of roster overlap, and cheap: one id against a set.
function directorAttendsOther(locationA, locationB) {
   for (const userId of locationA.organizerUserIds) {
      if (locationB.playerUserIds.has(userId)) return true
   }
   for (const userId of locationB.organizerUserIds) {
      if (locationA.playerUserIds.has(userId)) return true
   }
   return false
}
```

Treat a match as a proposal, as with the [playoff heuristics](/tournaments.html#inferring-links):
confirm it against coordinates or an address before merging anything a user will see.

## Get a user profile

<div class="endpoint"><span class="method">GET</span> <span>/users/{userId}</span></div>

Returns a **custom envelope** with eight named sections rather than a `data` wrapper — and
it is far richer than the profile object embedded on tournaments:

```json
{
  "user": {
    "userId": 5750, "name": "John Garnett", "firstName": "John", "lastName": "Garnett",
    "ifpaId": 32819, "role": "player", "flag": "us", "location": "Seattle",
    "pronouns": "he", "initials": "JWG", "clubId": 25,
    "avatar": null, "banner": null, "tournamentAvatar": null,
    "ratingsOptOut": false, "statsOptOut": false, "videoOptOut": false,
    "profileOptOut": false, "historyOptOut": false, "historyOnlyCompleted": false,
    "createdAt": "2017-12-02T06:25:40.000000Z"
  },
  "rating": {
    "rating": 1600, "rd": 24, "calculatedRd": 24, "ratingClass": 4,
    "delta": "-9.12", "gameCount": 2470, "winCount": 2838, "lossCount": 2657,
    "efficiencyPercent": 0.5164695177434031, "lowerBound": 1551
  },
  "ifpa": null, "club": null, "plan": null, "planFeatures": null, "shortcut": null,
  "userCounts": { "tournamentPlayCount": 0, "tournamentOrganizedCount": 0, "seriesOrganizedCount": 0 }
}
```

One call gets you the account and their current Match Play Rating with a lifetime win/loss
record. It returns a clean `404` for an unknown id, which makes it the best way to
**validate a user id** — unlike `?played=`, whose empty result is ambiguous.

<div class="callout callout-warn">
<span class="callout-title"><code>userCounts</code> is zero unless you ask for it</span>

In the response above every `userCounts` value is `0`. They are not broken — they are simply
not computed without the undocumented **`includeCounts=true`** flag:

```bash
curl -s "https://app.matchplay.events/api/users/5750?includeCounts=true" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
"userCounts": { "tournamentPlayCount": 552, "tournamentOrganizedCount": 28, "seriesOrganizedCount": 2 }
```

The zeros are worse than an omission: a client that reads them without the flag gets a
plausible number that is silently wrong, rather than a missing field it would notice.

With the flag, `tournamentPlayCount` is a genuinely useful figure — see
[keeping a mirror honest](/building-a-client.html#keeping-a-mirror-honest).
</div>

<div class="callout callout-warn">
<span class="callout-title">"Unset" is represented two different ways</span>

`initials`, `pronouns`, `flag` and `location` are sometimes `""` and sometimes `null` for
users who haven't set them — **both forms appear in the same response**, on different users.

Check for both:

```js
const initials = user.initials || null   // normalises "" and null alike
```
</div>

<div class="callout" id="privacy-flags">
<span class="callout-title">Privacy flags</span>

Every user object carries six independent opt-out booleans: `ratingsOptOut`, `statsOptOut`,
`videoOptOut`, `profileOptOut`, `historyOptOut`, plus `historyOnlyCompleted`.

`historyOptOut` is the one that changes API behaviour — it makes
`/tournaments?played={userId}` return [`403`](/errors.html#opted-out). Respect the others in
your own product even though the API doesn't enforce them for you.
</div>

## Field reference

### Player

{{schema:Player}}

### Tournament player pivot

{{schema:TournamentPlayerPivot}}

### Arena

{{schema:Arena}}

### Tournament arena pivot

{{schema:TournamentArenaPivot}}

### User

{{schema:User}}

### User profile bundle

{{schema:UserProfileBundle}}
