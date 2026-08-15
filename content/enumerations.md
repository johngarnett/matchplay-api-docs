---
title: Enumerations
description: Every observed value for every enum field, and the algorithms behind them
group: Reference
order: 12
---

# Enumerations

Values below were collected from live samples — a 102-tournament worldwide snapshot plus a
100-tournament player history — and from application code that branches on them. Counts,
where given, show real-world frequency.

None of this is published by Match Play.

## Tournament type

Twenty-one values are known. Thirteen were observed live in a single snapshot.

<div class="table-scroll">

| Value | Category | Head-to-head? |
| --- | --- | --- |
| `knockout` | Strikes | Yes |
| `group_knockout` | Strikes, in groups | Yes — [scoring varies](/scoring.html) |
| `matchplay` | Head-to-head match play | Yes |
| `group_matchplay` | Group match play | Yes |
| `max_matchplay` | Max match play | Yes |
| `pace_matchplay` | Pace match play | Yes |
| `manual_matchplay` | Manually paired | Yes |
| `round_robin` | Round robin | Yes |
| `double_round_robin` | Double round robin | Yes |
| `bracket` | Single elimination | Yes |
| `double_bracket` | Double elimination | Yes |
| `group_bracket` | Group elimination | Yes |
| `ladder` | Ladder elimination | Yes |
| `frenzy` | Flip Frenzy | Yes |
| `target` | Target match play | Yes |
| `golf` | Pingolf | **No** |
| `golf_bracket` | Pingolf elimination | **No** |
| `best_game` | Best game | **No** |
| `card_best_game` | Card-based best game | **No** |
| `bowling` | Pinbowling | **No** |
| `amazingrace` | Amazing Race | **No** |

</div>

The "no" rows return no game objects at all — see
[Single-player formats](/single-player.html).

Observed frequency in one player's 100-tournament history: `knockout` 80, `target` 6,
`group_matchplay` 5, `group_knockout` 4, `golf` 2, `matchplay` 2, `max_matchplay` 1. In a
worldwide `status=started` snapshot the spread was much wider, adding `best_game`,
`card_best_game`, `frenzy`, `bowling`, `amazingrace`, `round_robin`, `double_round_robin`
and `group_bracket`.

<div class="callout">
<span class="callout-title">Treat this list as open</span>

Match Play add formats. Code defensively — an unrecognised `type` should degrade to
"placement only" rather than throw or silently mis-score.
</div>

## Statuses

<div class="table-scroll">

| Object | Values | Notes |
| --- | --- | --- |
| Tournament | `planned`, `started`, `completed` | [auto-closed after 2 idle days](/tournaments.html#status-started), unless still inside its scheduled window |
| Round | `started`, `completed` | |
| Game | `started`, `completed` | Gate on `completed` before reading results |
| Single-player game | `pending`, `started`, `completed` | Extra `pending` state |
| Player (global) | `active` | Effectively constant |
| `tournamentPlayer` | `active`, `inactive` | `inactive` = left this tournament |
| Arena (global) | `active`, `inactive` | |
| `tournamentArena` | `active`, `inactive` | `inactive` = out of play here |
| Location | `active`, `inactive` | |
| Series | `active` | |

</div>

## Configuration values

Counts from a 102-tournament worldwide sample. `null` means the key was present and null;
remember that on many tournaments the key is [absent entirely](/tournaments.html#the-field-set-depends-on-the-type).

<div class="table-scroll">

| Field | Observed values |
| --- | --- |
| `seeding` | `random` (91), `mp_rating_rating` (4), `mp_rating` (2), `ifpa`, `manual`, `series_seed` |
| `pairing` | `swiss` (63), `strictswiss` (22), `balanced` (10), `balanced_series` (2), `tiers`, `random` |
| `firstRoundPairing` | `random` (83), `slaughter` (10), `adjacent` (4), `cross` |
| `playerOrder` | `balanced` (96), `random` (2), `rotating`, `seed`, `disabled` |
| `playerOrderOpen` | `scorekeepers` (96), `players` (2) |
| `arenaAssignment` | `balanced` (94), `banks` (2), `disabled` (2), `random`, `manual`, `category_banks` |
| `scorekeeping` | `disabled` (61), `user` (39) |
| `suggestions` | `automatic` (78), `restricted` (17), `disabled` (5) |
| `byes` | `full` (82), `half`, `zero` |
| `tiebreaker` | `standard` (7), `disabled` (2), `placement_last` (1), `placement`, `wins`, `losses` |
| `scoring` | `ifpa` (7), `papa` (3), `winnerbonus` (1), `dcleague`, `winwinlossloss` |
| `bestGameScoring` | `bg_linear`, `bg_papa`, `bg_circuit`, `bg_indisc`, `bg_50_percent_de`, `bg_95_pct_mod_de` |
| `organizer.role` | `player`, `organizer` |
| `linkedTournaments[].linkType` | `qualifying`, `playoff` |
| `prizePool.type` | `standard` |
| `search` `type` | `users`, `tournaments` — **only** these two |

</div>

### Numeric configuration

<div class="table-scroll">

| Field | Observed |
| --- | --- |
| `knockoutStrikeCount` | 2, 3 (79), 5, 7, 8 |
| `knockoutThreePlayerStrikes` | 0 |
| `knockoutFourPlayerStrikes` | 2, 100, 101 — see below |
| `gamesPerRound` | 1, 2, 3, 4, 5 |
| `bracketSize` | 4, 8, 10, 12 |
| `roundCount` | 1, 2, 3 — `group_bracket` only |
| `estimatedTgp` | 40, 56, 64, 76, 80, 200, null |
| `categoryId` (arena) | null, 1, 2, 3, 4, 5 |

</div>

<div class="callout">
<span class="callout-title"><code>knockoutFourPlayerStrikes</code> looks like a sentinel</span>

Across a four-tournament sample its value correlated one-to-one with the knockout variant:

| Value | Variant | Flags |
| --- | --- | --- |
| `2` | Standard strikes | both false |
| `100` | Progressive | `knockoutProgressive: true` |
| `101` | Fair strikes | `knockoutFair: true` |

The sample is small, so **branch on the boolean flags** — which are unambiguous — rather than
on this number. Recorded here because the correlation is striking and may help identify
variants when the flags are absent.
</div>

## Scoring maps

`pointsMap` values by scoring system, for four- and three-player groups:

<div class="table-scroll">

| System | Four players | Three players |
| --- | --- | --- |
| IFPA | 7/5/3/1 | 7/4/1 |
| PAPA | 4/2/1/0 | 4/2/1 |
| Pinburgh | 3/2/1/0 | 3/1.5/0 |
| Bonus point | 5/3/2/1 | 5/3/1 |
| Only winner | 1/0/0/0 | 1/0/0 |
| Only 1st and 2nd | 1/1/0/0 | 1/0/0 |
| Marburg | 7/4/2/0 | 7/3/0 |
| BAPA | 8/6/4/2 | 8/5/2 |
| NEPL | 10/6/4/2 | 10/5/2 |
| DC League | 4/3/2/1 | 4/2.5/1 |

</div>

Best-game scoring curves referenced by `bestGameScoring`: Linear (100/99/98…), Linear 150,
Linear 200, PAPA (100/90/85/84…), PAPA Circuit (100/75/60/50…), INDISC (100/97/95…), INDISC
200, CAX (100/94/91…), Hella Heart, Top 30, Top 25, 90% decay, 95% modified decay, and PAPA
with quick decay.

## TournamentUtils — the reference implementation

[github.com/haugstrup/TournamentUtils](https://github.com/haugstrup/TournamentUtils) is a
PHP library (MIT) by **haugstrup — Andreas Haugstrup Pedersen, the author of Match Play
Events**.

That authorship is what makes it valuable here. It is not a third-party reimplementation; it
is where the algorithms behind these enum values actually live. Match Play's own data-exports
page already points at it for Glicko calculations.

If you need to *reproduce* Match Play's behaviour rather than just read its output — predict
next round's pairings, seed a bracket, advance a rating deviation — this is the source.

<div class="table-scroll">

| API value | Class | What it does |
| --- | --- | --- |
| `pairing: swiss` | `HeadToHeadSwissPairing` | Balanced pairings within sub-groups |
| `pairing: strictswiss` | `HeadToHeadStrictSwissPairing` | Strict Swiss ordering |
| `pairing: balanced` | `BalancedPairing`, `BalancedGreedyPairing` | Minimises repeat opponents |
| `pairing: tiers` | `GroupTieredSwissPairing` | Seed-tiered four-player groups, Pinburgh style |
| `firstRoundPairing: adjacent` | `AdjacentPairing` | #1 v #2, #3 v #4 |
| `firstRoundPairing: cross` | `CrossPairing` | Top half's best v bottom half's best |
| `firstRoundPairing: slaughter` | `SlaughterPairing` | #1 v last seed |
| `arenaAssignment: balanced` | `BalancedArena`, `BalancedGreedyArena`, `BalancedPlayerArenaPairing` | Spreads machine exposure |
| `playerOrder: balanced` | `BalancedPlayerOrder` | Evens out play order |
| `type: round_robin` / `double_round_robin` | `RoundRobinPairing` | Everyone plays everyone |
| `type: bracket` | `SingleEliminationBracket` | Binary-heap bracket |
| `type: group_matchplay` (Pinburgh style) | `GroupTieredSwissPairing`, `WCSGroups` | Seed-tiered four-player groups |
| `type: golf` | `GolfHole` | Pingolf hole scoring |
| Ratings `RD` | `GlickoCalculator` | Glicko, including `advanceRD` |

</div>

`ArenaSelector` (least-played-first machine choice) and `MaxWeightMatching` (the matching
engine underneath the balanced pairings) have no direct API field but explain observed
behaviour.

### Advancing rating deviation

The [rating revisions export](/exports.html) records only *rating* changes, but a player's
`RD` grows every day they don't play. To get an accurate RD for an arbitrary date you must
advance it yourself from the last period where the rating changed — which is exactly what
`GlickoCalculator::advanceRD` does.

The `/ratings/*` endpoints hand you `calculatedRd` already advanced to today, so you only
need this for historical dates.
