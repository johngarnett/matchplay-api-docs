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

There is **no global arenas endpoint**, and `/search?type=arenas` returns `422`. Machines
reach you only embedded in a tournament or via `resolve-unknown`.

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
