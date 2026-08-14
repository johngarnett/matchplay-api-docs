---
title: Standings
description: Placements, ties, and the format-specific columns
group: Core resources
order: 7
---

# Standings

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/standings</span></div>

The computed placement for every player. This is the **only** endpoint that returns a bare
JSON array with no envelope at all.

```bash
curl -s "https://app.matchplay.events/api/tournaments/261001/standings" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
[
  {
    "playerId": 551329, "position": 1, "points": "9.00",
    "pointsWithTiebreaker": null, "gamesPlayed": 11, "strikeCount": 2,
    "adjustment": 0, "tiebreakers": ["9.00"],
    "entriesPlayed": 0, "entriesAvailable": 0, "cardsCounted": null,
    "frenzyWins": null, "frenzyLosses": null, "pointsList": null,
    "activeGames": [], "activeGameColor": null,
    "onPaceBubble": null, "onCutoffBubble": null, "cutoffBubbleColor": null,
    "onCutoffBubble2": null, "manualTiebreakerGroup": null
  }
]
```

Rows arrive ordered by `position`. Handle both shapes defensively in case the envelope ever
changes:

```js
const standings = Array.isArray(payload) ? payload : (payload.data ?? [])
```

## Polling

Match Play ask that you **not request this more than once every 15 seconds** for a live
tournament. For a completed tournament, fetch once and cache forever — standings never
change after completion.

## Keyed by `playerId`, not `userId`

Every row identifies its player by tournament-scoped `playerId`. If you're tracking a global
Match Play account you have to map across, and how you do that depends on the format — see
[Identity](/identity.html).

## Ties share a position

Match Play collapses ties for you. Two players tied for 9th both carry `position: 9`, and
there is no `position: 10`. Use the value verbatim; don't recompute rank from array index.

```js
// Everyone in the top four, ties included
const topFour = standings.filter(row => row.position >= 1 && row.position <= 4)
```

That filter can return more than four rows, which is usually what you want.

## Player count

`standings.length` is the most reliable player count for a completed tournament — more so
than the roster, which can include players who registered but never played.

An **empty array is a legitimate response** for a tournament that was created but never run.

## Numbers as strings

`points`, `pointsWithTiebreaker` and the entries of `tiebreakers[]` are **strings**.
`position`, `gamesPlayed`, `strikeCount` and `adjustment` are numbers.

`tiebreakers` is heterogeneous — its contents vary by format and mix types:

<div class="table-scroll">

| Format | Example |
| --- | --- |
| Knockout | `["9.00"]` |
| Group match play | `["45.00", 5, 2]` |
| Progressive knockout | `[10, 7]` |

</div>

## Format-specific columns

Every row carries all 21 fields; most are null for any given format.

<div class="table-scroll">

| Field | Populated for |
| --- | --- |
| `strikeCount` | Knockout formats |
| `cardsCounted` | `card_best_game` |
| `entriesPlayed`, `entriesAvailable` | Best-game and entry formats |
| `frenzyWins`, `frenzyLosses` | Flip Frenzy |
| `pointsList` | Formats that expose a per-round breakdown |
| `manualTiebreakerGroup` | Manually resolved ties |

</div>

## Live-display columns

Four fields exist to drive Match Play's own live standings UI:

- **`activeGames`** — games this player is currently in. Non-empty means they're mid-game.
- **`activeGameColor`** — display hint.
- **`onPaceBubble`**, **`onCutoffBubble`**, **`onCutoffBubble2`**, **`cutoffBubbleColor`** —
  whether the player sits on a playoff bubble. These pair with the tournament's
  [`playoffsCutoffs`](/tournaments.html#playoffscutoffs) array.

`activeGames` is a genuinely useful liveness signal: a tournament with non-empty
`activeGames` on any row is definitely in progress, regardless of what its `status` says.

<div class="callout callout-trap">
<span class="callout-title"><code>adjustment</code> is not <code>pointsAdjustment</code></span>

Two similarly named fields mean different things:

- **`standings[].adjustment`** — a **scoring** adjustment applied to this player's points.
- **`tournamentPlayer.pointsAdjustment`** (on the roster, via `includePlayers`) — a manual
  adjustment whose meaning depends on format: **strikes** in knockouts, **points**
  elsewhere.

A player can carry `pointsAdjustment: -1` (one strike removed by the organizer) *and*
`adjustment: -2` (a two-point scoring penalty) simultaneously. They are unrelated.

If you are reconstructing strike counts, read `tournamentPlayer.pointsAdjustment` — never
the standings field.
</div>

## Field reference

{{schema:StandingsRow}}
