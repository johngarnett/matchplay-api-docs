---
title: Identity
description: playerId vs userId vs ifpaId, claimedBy, and the resolve-unknown endpoints
group: Core resources
order: 8
---

# Identity

Three separate identifier namespaces coexist in this API, and nothing documents how they
relate. Getting the model right is a prerequisite for almost any interesting query — "how
did *this person* do?" is surprisingly hard to answer.

## The three namespaces

<div class="table-scroll">

| Id | Scope | Stable across tournaments? |
| --- | --- | --- |
| **`userId`** | A global Match Play account | Yes |
| **`playerId`** | An entry on one organizer's roster | No — a person has many |
| **`ifpaId`** | An IFPA competitor record, external | Yes, but not everyone has one |

</div>

A single human being might be `userId 6912`, appear as `playerId 135991` in one organizer's
tournaments and `playerId 447203` in another's, and separately be `ifpaId 52614` in IFPA's
database.

## `claimedBy` is the bridge

Every player object carries `claimedBy` — the `userId` of the account that claimed that
roster entry, or `null`:

```json
{
  "playerId": 135991, "name": "Vanessa Ish", "ifpaId": 52614,
  "status": "active", "organizerId": 14223,
  "claimedBy": 6912,
  "labels": [], "labelColor": null
}
```

`claimedBy: null` means an organizer typed a name in and no account ever claimed it. Those
players are invisible to any user-centric query — they exist only within that tournament.

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

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/players/resolve-unknown?players=1,2,3</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/arenas/resolve-unknown?arenas=7,8</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/players/resolve-unknown?players=1,2,3</span></div>
<div class="endpoint"><span class="method">GET</span> <span>/users/resolve-unknown?users=17637</span></div>

Rules:

- The query parameter name **equals the resource kind** — `players=`, `arenas=`, `users=`.
- Comma-separated, **maximum 25 ids** per request. Batch larger sets yourself.
- Ids that don't resolve are **silently dropped**, not errored. Compare what you asked for
  against what came back.

<div class="callout callout-warn">
<span class="callout-title">Use the tournament-scoped variant for players</span>

The global `/players/resolve-unknown` omits the `tournamentPlayer` pivot — so no `seed`, no
per-tournament `status`, no `pointsAdjustment`.

Compare. Global:

```json
{ "playerId": 135991, "name": "Vanessa Ish", "ifpaId": 52614,
  "status": "active", "organizerId": 14223, "claimedBy": 6912 }
```

Tournament-scoped — same plus:

```json
  "tournamentPlayer": {
    "status": "active", "seed": 15, "pointsAdjustment": 0,
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

There is **no global arenas endpoint**, and `/search?type=arenas` returns `422`. Machines
reach you only embedded in a tournament or via `resolve-unknown`.

## Get a user profile

<div class="endpoint"><span class="method">GET</span> <span>/users/{userId}</span></div>

Returns a **custom envelope** with eight named sections rather than a `data` wrapper — and
it is far richer than the profile object embedded on tournaments:

```json
{
  "user": { "userId": 17637, "name": "Elliott Johnson", "ifpaId": 70949, … },
  "rating": {
    "rating": 1568, "rd": 15, "calculatedRd": 15, "ratingClass": 4,
    "delta": "-1.61", "gameCount": 5746, "winCount": 4740, "lossCount": 4666,
    "efficiencyPercent": 0.5039336593663619, "lowerBound": 1537
  },
  "ifpa": null, "club": null, "plan": null, "planFeatures": null, "shortcut": null,
  "userCounts": { "tournamentPlayCount": 0, "tournamentOrganizedCount": 0, "seriesOrganizedCount": 0 }
}
```

One call gets you the account, their current Match Play Rating with a lifetime win/loss
record, and activity counts. It returns a clean `404` for an unknown id, which makes it the
best way to **validate a user id** — unlike `?played=`, whose empty result is ambiguous.

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
