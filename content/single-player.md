---
title: Single-player formats
navTitle: Single player
description: Best game, pingolf and card formats — where the games endpoint returns nothing
group: Reference
order: 12
---

# Single-player formats

Best game, pingolf, card-based best game, pinbowling and Amazing Race are **not
head-to-head**. Players post scores alone rather than competing in a group, so the entire
multi-player game model does not apply to them.

<div class="callout callout-trap">
<span class="callout-title">These tournaments have rounds but no games</span>

`GET /tournaments/{id}/rounds` returns a normal list. `GET /tournaments/{id}/games` returns
**nothing** — not games without results, not games missing fields. Zero game objects.

Verified across golf tournaments 259350 (9 rounds), 256439 (5 rounds) and 257742 (9 rounds):
every round held zero games.

The consequences: there are no `userIds` anywhere, so the usual
[identity resolution](/identity.html#when-there-are-no-games-to-scan) fails and you must fall
back to the roster. And there is no win/loss record to compute — report placement from
[standings](/standings.html) only.
</div>

Which types are affected: `best_game`, `card_best_game`, `golf`, `golf_bracket`, `bowling`,
`amazingrace`.

## Single-player games

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/single-player-games</span></div>

<div class="table-scroll">

| Parameter | Type | Notes |
| --- | --- | --- |
| `page` | integer | 1-based |
| `limit` | integer | Default 25, **maximum 500** |
| `ids` | string | Comma-separated game ids, up to 50 |
| `status` | string | `pending`, `started` or `completed` |
| `bestGame` | boolean | Only games counting toward the player's total |
| `voided` | boolean | Include voided games |
| `round` | integer | Round id |
| `player` | integer | A `playerId` (organizer-scoped, not a `userId`) |
| `arena` | integer | Arena id |

</div>

Unlike the tournament-scoped multi-player endpoint, this one **paginates** — a golf
tournament sampled at `limit=5` reported 27 pages. Raise `limit` toward 500 to cut the call
count.

```bash
curl -s "https://app.matchplay.events/api/tournaments/259350/single-player-games?limit=500" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "singlePlayerGameId": 2515032, "tournamentId": 259350, "roundId": 1156019,
  "arenaId": 232643, "playerId": 573866, "scorekeeperId": 24895,
  "status": "completed", "points": "4.00", "score": null,
  "bestGame": false, "voided": false, "index": 0, "duration": null,
  "createdAt": "2026-06-28T02:34:59.000000Z",
  "updatedAt": "2026-06-28T04:31:45.000000Z",
  "scorbitId": null, "scorbitLog": null, "scorbitVerified": false
}
```

Note what's different from a multi-player game:

- **`playerId` is singular** — one player, no arrays, no parallel-array contract.
- **No `userIds`.** Map to a global account through the roster's `claimedBy`.
- **`points`** is the awarded score under the tournament's `bestGameScoring` curve;
  **`score`** is the raw machine score. In a pingolf tournament `points` is the stroke count.
- **`bestGame`** marks whether this attempt counts toward the player's total. A best-game
  tournament lets players take many attempts and keeps the best N — filter on this to see
  which ones mattered.
- **`voided`** games are excluded by default; pass `voided=true` to see them.
- **`status: "pending"`** exists here and not on multi-player games — a queued attempt not yet
  played.

{{schema:SinglePlayerGame}}

## Cards

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/cards</span></div>

Used by `card_best_game` tournaments, where a player buys a card covering a fixed set of
games and the card is scored as a unit.

<div class="table-scroll">

| Parameter | Type | Notes |
| --- | --- | --- |
| `page` | integer | 1-based |
| `limit` | integer | Default 25, maximum 500 |
| `status` | string | `pending`, `started` or `completed` |
| `bestGame` | boolean | |
| `voided` | boolean | |
| `player` | integer | |

</div>

Calling this on a tournament of any other type returns an empty page rather than an error —
a golf tournament returned `{"data": [], "meta": {"total": 0}}`.

```bash
curl -s "https://app.matchplay.events/api/tournaments/239557/cards?limit=3" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "cardId": 33857, "tournamentId": 239557, "playerId": 15377,
  "status": "completed", "bestGame": true, "voided": false,
  "createdAt": "2026-06-18T11:46:54.000000Z",
  "updatedAt": "2026-06-18T12:03:54.000000Z",
  "singlePlayerGames": [
    { "singlePlayerGameId": 2493748, "cardId": 33857, "arenaId": 228035,
      "playerId": 15377, "status": "completed",
      "points": "200.00", "score": 5109360, "bestGame": true,
      "index": 0, "duration": 931, "voided": false, … },
    …
  ],
  "singlePlayerGameIds": [2493748, 2493762, 2493773, 2493787, 2493801, 2493815],
  "arenaIds":            [228035,  71140,   45705,   13830,   149748,  228052],
  "pointsList":          [200,     141,     149,     123,     173,     42]
}
```

<div class="callout">
<span class="callout-title">A card embeds its games in full</span>

`singlePlayerGames[]` holds **complete game objects, not ids**. This is the only place in
the API where a collection inlines its children like this.

So one call to `/cards` returns every attempt on every card, and calling
`/single-player-games` separately for the same tournament is redundant. For a
`card_best_game` tournament, `/cards` is the cheaper and more complete route.
</div>

The three flat arrays — `singlePlayerGameIds`, `arenaIds`, `pointsList` — are
**index-aligned with `singlePlayerGames[]`**, the same parallel-array contract that governs
[multi-player games](/games.html#the-parallel-array-contract). Verified across all six slots
of the card above.

<div class="callout callout-trap">
<span class="callout-title">The same number appears as both a number and a string</span>

`pointsList` holds JSON **numbers**, while the `points` field on each embedded game holds
the same value as a **string**:

```json
"pointsList": [200, 141, …]
"singlePlayerGames": [{ "points": "200.00", … }, { "points": "141.00", … }]
```

`200` and `"200.00"`, in one payload, for one attempt. Coerce before comparing.
</div>

Note also that embedded games carry **`cardId` and no `roundId`**, the mirror image of games
fetched from `/single-player-games`, which carry `roundId` and no `cardId`. The two are
mutually exclusive.

Relevant tournament configuration: `cardBestGameCardsCounted`, `cardBestGameGamesCounted`,
`cardBestGameGamesPerCard`, `cardBestGameScoring` (observed as the integer `0` — note its
best-game sibling `bestGameScoring` is a string enum instead).

{{schema:Card}}

## Standings for these formats

The standings row carries format-specific columns that are null everywhere else:

<div class="table-scroll">

| Field | Meaning |
| --- | --- |
| `entriesPlayed` | Attempts used |
| `entriesAvailable` | Attempts remaining |
| `cardsCounted` | Cards counting toward the total (card formats) |
| `pointsList` | Per-entry breakdown where exposed |

</div>

## Real-time

Two websocket events cover these formats — `SinglePlayerGameCreatedOrUpdated` and
`SinglePlayerGamesDeleted` — carrying the game model and deleted ids respectively. Neither
was observed in captured traffic, so their exact payloads are **unverified**.

`QueueChanged` is also relevant: best-game tournaments often run a machine queue, configured
via `useQueues` on the tournament and `bestGameBlocked` / `bestGameQueueClosed` on each
arena's pivot. The event's payload *may be omitted* when the queue is too large, so treat it
as a hint to refetch rather than as data.
