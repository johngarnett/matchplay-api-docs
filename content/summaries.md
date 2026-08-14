---
title: Summaries & WPPR
navTitle: Summaries & WPPR
description: Pre-aggregated per-tournament statistics, and the WPPR estimator
group: Reference
order: 13
---

# Summaries & WPPR

Three summary endpoints hand you pre-aggregated statistics that would otherwise cost you a
full games fetch plus your own tabulation. They are available **only once a tournament is
completed**, and since a completed tournament never changes, they can be cached forever.

All three default to `per_page: 5000`, so one request normally returns everything.

<div class="callout">
<span class="callout-title">Use these instead of computing your own</span>

If you want machine statistics or head-to-head records for a finished tournament, these
endpoints are strictly cheaper than fetching every game and aggregating. They also carry
`opdbId` and `opdbGroup`, letting you join to machine metadata without a second lookup.

They cannot tell you about a *live* tournament, and they give you no per-game detail — for
that you still need [the games endpoint](/games.html).
</div>

## Arena summary

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/summary/arenas</span></div>

One row per machine, with how often it was played.

```json
{
  "tournamentId": 261001, "userId": 41658, "arenaId": 154338,
  "tournamentDate": "2026-07-08",
  "games": 1, "singlePlayerGames": 0, "totalGames": 1,
  "opdbGroup": "GoEkx", "opdbId": "GoEkx-MdEzN-ARJQz"
}
```

`userId` here is the **organizer**, not a competitor. `games` and `singlePlayerGames` are
counted separately and summed into `totalGames`.

{{schema:ArenaSummaryRow}}

## Player/arena summary

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/summary/player-arenas</span></div>

One row per player/machine pair, adding a win/loss record.

```json
{
  "tournamentId": 261001, "userId": 41658, "arenaId": 171503, "playerId": 382617,
  "tournamentDate": "2026-07-08",
  "games": 1, "singlePlayerGames": 0, "totalGames": 1,
  "wins": 0, "losses": 1,
  "opdbGroup": "G4jPq", "opdbId": "G4jPq-MQdlK"
}
```

This answers "which machines is this player good on?" without you having to implement the
[scoring regimes](/scoring.html) yourself — Match Play has already applied the correct one
for the format.

{{schema:PlayerArenaSummaryRow}}

## Match summary

<div class="endpoint"><span class="method">GET</span> <span>/tournaments/{tournamentId}/summary/matches</span></div>

One row per player/opponent/machine combination.

```json
{
  "tournamentId": 261001, "userId": 41658, "arenaId": 171503,
  "playerId": 382617, "opponentId": 426179,
  "tournamentDate": "2026-07-08",
  "games": 1, "wins": 0, "losses": 1,
  "opdbGroup": "G4jPq", "opdbId": "G4jPq-MQdlK"
}
```

<div class="callout">
<span class="callout-title">Rows are intentionally duplicated</span>

If A played B on machine X, there is **both** an `A-B-X` row and a `B-A-X` row. That is by
design, not a bug — it means filtering by either player works without a union or an OR
across two columns.

It also means you must not sum `games` across all rows to get a tournament total; you would
double-count.
</div>

{{schema:MatchSummaryRow}}

## `opdbGroup` versus `opdbId`

Both summary rows carry both. The distinction is useful:

- **`opdbId`** — `G4jPq-MQdlK` identifies a specific machine model.
- **`opdbGroup`** — `G4jPq` identifies the *title*, shared across Pro, Premium and LE
  editions.

Aggregate on `opdbGroup` to answer "how does this player do on Godzilla" across every
edition. Use `opdbId` when the specific model matters.

## WPPR estimator {#wppr-estimator}

<div class="endpoint"><span class="method">POST</span> <span>/ifpa/wppr-estimator</span></div>

The API's **only non-GET operation**. It computes an estimate of the IFPA World Pinball
Player Ranking value a tournament or series would award, and stores nothing — safe to call
from a read-only integration.

Supply exactly one of `tournamentId` or `seriesId`:

```bash
curl -s -X POST "https://app.matchplay.events/api/ifpa/wppr-estimator" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tournamentId": 261001}'
```

```json
{
  "wpprValue": 4.62, "baseValue": 2.5,
  "rankValue": 0.61, "ratingValue": 1.51,
  "womensWpprValue": 0.5, "womensBaseValue": 0.5, "womensRankValue": 0,
  "standingsOrder": [ … ],
  "unresolvedNames": [],
  "players": [
    { "ifpaId": 89391, "name": "Ben Fodor",
      "rank": 5475, "womensRank": null, "rating": 1108.3, "totalEvents": 418,
      "updatedAt": "2026-08-03 23:32:18Z",
      "baseValue": 0.5, "ratingValue": 0, "ratingValueIncluded": true,
      "rankValue": 0, "rankValueIncluded": true,
      "womensRankValue": 0, "womensRankValueIncluded": true,
      "wpprValue": 0.5, "womensWpprValue": 0.5 }
  ]
}
```

The per-player breakdown shows each competitor's contribution and the `*Included` flags show
which components counted — useful for explaining to an organizer *why* their event is worth
what it is.

**`unresolvedNames`** lists players who could not be matched to an IFPA record. A long list
here means the tournament's roster has unclaimed or misspelled entries, and the estimate is
correspondingly less reliable.

<div class="callout">
<span class="callout-title">Names here come from IFPA, not Match Play</span>

`players[].name` is the **IFPA** record's name, which frequently differs from the same
person's Match Play profile name. One player returned as `"Ben Fodor"` here is
`"Benjamin Fodor U.S.A"` on their Match Play account.

There is also no `userId` in this payload — only `ifpaId`. To reach a Match Play account
from an estimator row, bridge through
[`/ratings/ifpa/{ifpaId}`](/profile-search.html#match-play-ratings), whose `rating.userId`
gives you the link (or `null` if they have no account).
</div>

The related passive field `estimatedTgp` on the tournament object gives Match Play's stored
Tournament Grading Percentage estimate without a call.

{{schema:WpprEstimate}}
