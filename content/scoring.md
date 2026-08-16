---
title: Scoring semantics
navTitle: Scoring
description: How to turn resultPoints and resultPositions into wins and losses, per format
group: Core resources
order: 6
---

# Scoring semantics

A game object tells you `resultPositions` and `resultPoints`. Neither means the same thing
across formats, and Match Play's handbook does not describe the differences. Get this wrong
and you will produce win/loss records that look completely reasonable and are completely
wrong.

There are four regimes. Which applies depends on `tournament.type` and, for group knockouts,
on two boolean flags.

## Picking the regime

```js
const ALL_STATS_TYPES = new Set([
   'frenzy', 'knockout', 'group_matchplay', 'pace_matchplay', 'target', 'matchplay',
   'max_matchplay', 'round_robin', 'double_round_robin', 'manual_matchplay',
   'bracket', 'double_bracket', 'group_bracket', 'ladder'
])

function scoringRegime(tournament) {
   const isGroupKnockout = tournament.type === 'group_knockout'

   // A progressive group knockout behaves like an ordinary head-to-head format.
   if (ALL_STATS_TYPES.has(tournament.type)) return 'positions'
   if (isGroupKnockout && tournament.knockoutProgressive === true) return 'positions'
   if (isGroupKnockout && tournament.knockoutFair === true) return 'fair-strikes'
   if (isGroupKnockout) return 'strike-knockout'

   return 'none'   // score-based formats: placement only, no head-to-head record
}
```

`knockoutFair` and `knockoutProgressive` are mutually exclusive — never both true.

<div class="table-scroll">

| Regime | Applies to | Read from |
| --- | --- | --- |
| **Positions** | Head-to-head formats, plus progressive group knockouts | `resultPositions` |
| **Fair strikes** | `group_knockout` with `knockoutFair: true` | `resultPoints` as an ordinal |
| **Strike knockout** | Any other `group_knockout` | `resultPoints` as a binary flag |
| **None** | `best_game`, `card_best_game`, `golf`, `golf_bracket`, `bowling`, `amazingrace` | Nothing — placement only |

</div>

## 1. Positions

`resultPositions` lists player ids best-to-worst in a **strict order with no ties**. That
strictness is what makes the arithmetic simple: everyone below you is a win, everyone above
you is a loss.

```js
function positionsRecord(game, playerId) {
   const order = game.resultPositions
   const place = order.indexOf(playerId)
   if (place === -1) return null

   const wins = order.length - 1 - place
   const opponents = game.userIds.length - 1
   return { wins, losses: opponents - wins }
}
```

Worked example — a four-player group:

```json
"playerIds":       [101, 102, 103, 104],
"resultPositions": [103, 101, 104, 102]
```

<div class="table-scroll">

| Player | Place | Wins | Losses |
| --- | --- | --- | --- |
| 103 | 1st | 3 | 0 |
| 101 | 2nd | 2 | 1 |
| 104 | 3rd | 1 | 2 |
| 102 | 4th | 0 | 3 |

</div>

Because the order is strict, `losses = opponents − wins` always holds. That identity is
**not** safe in the other regimes.

<div class="callout callout-warn">
<span class="callout-title">IFPA and PAPA point scales live here too</span>

In `group_matchplay` and similar formats, `resultPoints` carries the *point award scale*
rather than a win/loss signal — values like `7.00 / 5.00 / 3.00 / 1.00` (IFPA) or
`4.00 / 2.00 / 1.00 / 0.00` (PAPA). Those are standings points, not results.

Read placement from `resultPositions` in these formats and ignore `resultPoints` unless you
are reproducing the standings calculation.
</div>

## 2. Fair strikes

`group_knockout` with `knockoutFair: true`. Here **ties are legal**, which breaks
`resultPositions` — it goes partially null exactly when placement matters most. In one
captured tournament, **37 of 45 completed games** had at least one null in
`resultPositions`.

So read `resultPoints` instead, treating it as an ordinal where higher is better:

```js
function fairStrikesRecord(game, playerId) {
   const slot = game.playerIds.indexOf(playerId)
   if (slot === -1) return null

   const mine = Number(game.resultPoints[slot])
   if (!Number.isFinite(mine)) return null

   let wins = 0
   let losses = 0
   game.resultPoints.forEach((raw, index) => {
      if (index === slot) return
      const theirs = Number(raw)
      if (!Number.isFinite(theirs)) return
      if (mine > theirs) wins += 1
      else if (mine < theirs) losses += 1
      // equal points is a tie: neither a win nor a loss
   })
   return { wins, losses }
}
```

Worked example — four players, `["1.00", "0.02", "0.02", "0.01"]`:

<div class="table-scroll">

| Slot | Points | Wins | Losses | Note |
| --- | --- | --- | --- | --- |
| 0 | `1.00` | 3 | 0 | beat everyone |
| 1 | `0.02` | 1 | 1 | tied with slot 2 |
| 2 | `0.02` | 1 | 1 | tied with slot 1 |
| 3 | `0.01` | 0 | 3 | lost to everyone |

</div>

Note that wins + losses ≠ opponents for the tied players. This is why the positions-regime
shortcut cannot be reused here.

## 3. Strike knockout

Any other `group_knockout`. Here `resultPoints` is effectively a binary flag:

- `1.00` — no strike taken
- `0.00` — took a strike

Every no-strike player beats every struck player, and players sharing an outcome tie.

<div class="callout">
<span class="callout-title">Count, don't assume</span>

Don't hardcode "one player is struck". Group sizes vary and so do strike rules — a
four-player group might strike three. Count both buckets and multiply:

```js
const STRIKE_KNOCKOUT_NO_STRIKE_POINTS = 1
const STRIKE_KNOCKOUT_STRIKE_POINTS = 0

function strikeKnockoutRecord(game, playerId) {
   const slot = game.playerIds.indexOf(playerId)
   if (slot === -1) return null

   let noStrike = 0
   let struck = 0
   for (const raw of game.resultPoints) {
      const points = Number(raw)
      if (points === STRIKE_KNOCKOUT_NO_STRIKE_POINTS) noStrike += 1
      else if (points === STRIKE_KNOCKOUT_STRIKE_POINTS) struck += 1
   }

   const mine = Number(game.resultPoints[slot])
   if (mine === STRIKE_KNOCKOUT_NO_STRIKE_POINTS) return { wins: struck, losses: 0 }
   if (mine === STRIKE_KNOCKOUT_STRIKE_POINTS) return { wins: 0, losses: noStrike }
   return null
}
```
</div>

## Why progressive knockouts are not a fourth strike regime

`knockoutProgressive: true` looks like a strike format but its `resultPoints` are graded:

```json
"resultPoints": ["1.00", "0.03", "0.02", "0.01"]
```

<div class="callout callout-trap">
<span class="callout-title">A <code>== "0.00"</code> strike test misses every single strike</span>

In a progressive knockout **no player ever scores `0.00`**. Code written for standard
strikes will conclude that nobody was ever struck, and every player will appear to have gone
undefeated.

This is why the regime selector routes progressive knockouts to `resultPositions`, and why
you must branch on `knockoutProgressive` before doing anything with points.
</div>

The number of strikes a player takes equals the number of co-players finishing ahead of them.

## 4. None — score-based formats

`best_game`, `card_best_game`, `golf`, `golf_bracket`, `bowling` and `amazingrace` are not
head-to-head. Players post scores alone; there are no opponents to beat.

These tournaments return **no game objects at all** (see
[Single-player formats](/single-player.html)). Report placement from
[standings](/standings.html) and don't attempt a win/loss record.

## Distribution of `resultPoints` in the wild

From 6,148 real games across 131 tournaments, which gives a sense of how dominant strike
formats are:

<div class="table-scroll">

| Value | Count | Typically means |
| --- | --- | --- |
| `1.00` | 6,116 | Win / no strike |
| `0.00` | 4,762 | Loss / strike |
| `3.00` | 679 | IFPA-style points |
| `5.00` | 626 | IFPA-style points |
| `2.00` | 563 | IFPA / PAPA points |
| `0.02` | 370 | Fair or progressive ordinal |
| `0.01` | 289 | Fair or progressive ordinal |
| `0.03` | 287 | Progressive ordinal |
| `7.00` | 242 | IFPA first place |
| `4.00` | 193 | PAPA first place |
| `null` | 63 | Unrecorded |

</div>

Values are **always strings or null**, never JSON numbers. Coerce with `Number()` and check
`Number.isFinite`.

## Putting it together

```js
function gameRecord(tournament, game, playerId) {
   if (game.bye === true) return null              // byes are not games
   if (game.status !== 'completed') return null    // results are not final

   switch (scoringRegime(tournament)) {
      case 'positions':        return positionsRecord(game, playerId)
      case 'fair-strikes':     return fairStrikesRecord(game, playerId)
      case 'strike-knockout':  return strikeKnockoutRecord(game, playerId)
      default:                 return null
   }
}
```

Three guards do most of the work: skip byes, skip unfinished games, then branch on regime.

## Reproducing Match Play's own maths

If you need to compute pairings, seedings or ratings rather than just read results,
[TournamentUtils](https://github.com/haugstrup/TournamentUtils) is the reference
implementation — PHP, MIT licensed, written by Match Play's own author. See
[Enumerations](/enumerations.html#tournamentutils-the-reference-implementation) for the
mapping from API values to classes.
