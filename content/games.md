---
title: Games & rounds
navTitle: Games & rounds
description: The two games endpoints, the parallel-array contract, and byes
group: Core resources
order: 5
---

# Games & rounds

<div class="callout callout-trap">
<span class="callout-title">There are two games endpoints and the documented one is the wrong one</span>

`GET /games` — the endpoint in Match Play's handbook — returns **17 fields**.

`GET /tournaments/{tournamentId}/games` — undocumented — returns **25**.

The eight missing fields are exactly the ones that say who played and who won:
`playerIds`, `userIds`, `resultPositions`, `resultPoints`, `resultScores`,
`resultCountMismatch`, `suggestions`.

Unless you specifically need cross-tournament filtering, always use the tournament-scoped
endpoint.
</div>

## Rounds

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/rounds</span></div>

Rounds are collections of games played at the same time. In pingolf they represent holes.
Every round comes back in one unpaginated response.

```json
{
  "roundId": 1162410, "tournamentId": 261001,
  "index": 10, "name": "Round 11", "status": "completed", "duration": 1902,
  "createdAt": "2026-07-08 06:30:13Z", "completedAt": "2026-07-08 07:01:55Z",
  "arenaId": null, "score": null, "size": null, "description": null
}
```

Two traps in that small object:

- **`index` is zero-based, `name` is one-based.** `index: 10` is `"Round 11"`. If you display
  `index` directly, every round number is off by one.
- **`duration` here is elapsed seconds** (`completedAt` − `createdAt`). The identically named
  field on a *tournament* is a planned round **count**. Same name, unrelated meanings.

`completedAt` can predate the websocket event announcing completion by minutes. Trust
`status`, not timestamps.

<div class="callout">
<span class="callout-title">Score-based formats have rounds but no games</span>

Golf, best_game and other single-player formats return a normal list of rounds where every
round contains **zero games**. The games simply don't exist — see
[Single-player formats](/single-player.html). This matters for identity resolution, because
there are no `userIds` anywhere to read.
</div>

{{schema:Round}}

## Games for a tournament

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/games</span></div>

The complete game objects. Unpaginated — a 135-game tournament returns whole, with no
`links` or `meta`.

<div class="table-scroll">

| Parameter | Type | Notes |
| --- | --- | --- |
| `round` | string | Comma-separated round ids. Omit for the whole tournament |
| `player` | integer | Tournament-scoped player id |
| `status` | string | `started` or `completed` |

</div>

The comma-separated `round` list lets you fetch many rounds in one call. Chunk it — 25 round
ids per request is a commonly used size that keeps the URL sane.

```bash
curl -s "https://app.matchplay.events/api/tournaments/258562/games?round=1154935,1154936" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "gameId": 7696295, "roundId": 1154935, "tournamentId": 258562,
  "arenaId": 133517, "bankId": null, "challengeId": null,
  "index": 0, "set": 0, "playerIdAdvantage": 162405, "scorekeeperId": 9024,
  "status": "completed", "startedAt": "2026-06-27T03:51:18.000000Z",
  "duration": 609, "bye": false,
  "playerIds": [162405, 251302],
  "userIds": [9024, 8988],
  "resultPositions": [162405, 251302],
  "resultPoints": ["1.00", "0.00"],
  "resultScores": [null, null],
  "resultCountMismatch": false,
  "scorbitId": null, "scorbitLog": null, "scorbitVerified": false,
  "suggestions": [ … ]
}
```

## The parallel-array contract

This is the most important structural fact about a game, and getting it wrong produces
plausible-looking but wrong results.

**Slot-aligned with each other** — index *i* refers to the same player in all four:

- `playerIds[i]`
- `userIds[i]`
- `resultPoints[i]`
- `resultScores[i]`

**Not slot-aligned** — a completely separate ordering:

- `resultPositions` is a list of **player ids in finishing order, best first**

So to find a player's points you look up their slot:

```js
const slot = game.playerIds.indexOf(playerId)
const points = game.resultPoints[slot]
```

but to find their placement you look up their position in a different array:

```js
const place = game.resultPositions.indexOf(playerId)   // 0 = won
```

Worked example from a real IFPA-scored three-player game:

```json
"playerIds":       [254407, 468850, 254408],
"resultPositions": [468850, 254407, 254408],
"resultPoints":    ["2.00", "4.00", "1.00"]
```

Player `254407` finished **second** (index 1 of `resultPositions`) and scored `"2.00"` — the
value at *their own slot*, index 0 of `resultPoints`. If you had read `resultPoints[1]`
because they came second, you'd get `"4.00"` and credit them with the win.

`userIds[i]` is `null` when that player entry has never been claimed by an account.

<div class="callout callout-trap">
<span class="callout-title">A live game's <code>resultPositions</code> is null-filled, not empty</span>

An in-progress game returns:

```json
"resultPositions": [null, null]
```

A populated array of nulls — not absent, not `[]`. So `resultPositions.length` is truthy,
`Array.isArray` passes, and `resultPositions[0] === myPlayerId` evaluates `false`, which
naive code reads as "this player lost".

**Always gate on `status === "completed"` before reading any result field.**

In formats that permit ties, `resultPositions` stays partially null even *after* completion
— in one captured tournament, 37 of 45 completed games had at least one null. Use
`resultPoints` there instead. See [Scoring](/scoring.html).
</div>

## Byes

A bye is a game a player wins by not playing. It has a distinctive shape:

```json
{
  "gameId": 7696531, "bye": true,
  "arenaId": null, "index": null, "set": 9999,
  "startedAt": null, "duration": null, "scorekeeperId": null,
  "playerIds": [157652], "userIds": [17659],
  "resultPositions": [157652], "resultPoints": ["1.00"],
  "resultScores": [null], "suggestions": []
}
```

`set: 9999` is a sentinel — real sets are 0, 1, 2… within a round. Combined with
`index: null` and a single-element `playerIds`, byes are easy to detect, and you almost
always want to exclude them:

```js
const realGames = games.filter(game => game.bye !== true)
```

Counting a bye as a win inflates a player's record; counting it as a game inflates their
game count.

## Other fields worth knowing

- **`index`** is the game's position **within its round**, not the round number. In one
  135-game sample, 113 games had an `index` that disagreed with their round's index.
- **`set`** groups games within a round (a four-player group split across two machines, say).
- **`playerIdAdvantage`** names the player with position advantage — who chose the machine or
  plays last.
- **`scorekeeperId`** is the `userId` who entered the result.
- **`bankId`** and **`challengeId`** were null in every observed payload.
- **Scorbit fields** (`scorbitId`, `scorbitLog`, `scorbitVerified`) carry automatic
  score-detection data when a venue has Scorbit hardware.

### Suggestions

Submitted result proposals, embedded inline:

```json
{
  "suggestionId": 1838464, "gameId": 7696295, "playerId": 162405, "userId": 9024,
  "results": [162405, 251302],
  "scores": { "162405": null, "251302": null },
  "arenaId": null, "scorbitData": null, "partial": false
}
```

Note the inconsistency: `results` is an **ordered array** of player ids, while `scores` is an
**object keyed by stringified player id** — unlike `resultScores` on the parent game, which
is a parallel array. `partial: true` means the submitter left a slot blank, in which case
`results` contains nulls.

## Games globally

<div class="endpoint"><span class="method">GET</span> <span>/games</span></div>

The documented endpoint. Useful for cross-tournament queries; useless for results.

<div class="table-scroll">

| Parameter | Type | Notes |
| --- | --- | --- |
| `tournaments` | string | Comma-separated, up to 25. Provide this or `series` |
| `series` | string | Comma-separated, up to 5 |
| `ids` | string | Comma-separated game ids, up to 50 |
| `round` | integer | Round id |
| `player` | integer | Tournament-scoped player id |
| `arena` | integer | Arena id |
| `bank` | integer | Bank id |
| `status` | string | `started` or `completed` |
| `page` | integer | 1-based |

</div>

Uses full length-aware pagination at 100 per page, unlike the tournament-scoped endpoint
which returns everything at once.

The complete field list it returns:

```
arenaId, bankId, bye, challengeId, duration, gameId, index, playerIdAdvantage,
roundId, scorbitId, scorbitLog, scorbitVerified, scorekeeperId, set, startedAt,
status, tournamentId
```

No players. No results. No suggestions.

## Field reference

### Full game

{{schema:Game}}

### Reduced game (global endpoint)

{{schema:GameSummary}}

### Suggestion

{{schema:Suggestion}}
