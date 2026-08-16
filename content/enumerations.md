---
title: Enumerations
description: Every observed value for every enum field, and the algorithms behind them
group: Reference
order: 12
---

# Enumerations

Values below come from validating this site's schemas against **44,081 completed tournaments**
of cached raw API responses — 1.3 million records including 688,668 player entries and
465,945 standings rows. Counts show real-world frequency in that corpus.

None of this is published by Match Play.

<div class="callout callout-warn">
<span class="callout-title">That corpus is all completed tournaments</span>

It comes from a pipeline that fetched `status=completed` only, so it says nothing about how
common each status is, and it may under-represent settings used mainly by tournaments that
never finish. Every *value* below was observed; the *frequencies* describe completed
tournaments.
</div>

## Tournament type

Twenty-one values, every one of them observed.

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

All 21 were observed across 44,081 completed tournaments, in this order of frequency:
`group_matchplay` (19,178), `group_bracket` (4,542), `group_knockout` (4,086), `knockout`
(3,874), `matchplay` (2,141), `max_matchplay` (1,684), `frenzy` (1,611), `amazingrace`
(1,307), `bracket` (1,178), `best_game` (1,053), `ladder` (697), `double_bracket` (560),
`target` (520), `round_robin` (466), `golf` (399), `pace_matchplay` (270),
`double_round_robin` (184), `golf_bracket` (125), `card_best_game` (102), `bowling` (56),
`manual_matchplay` (48).

Group match play alone is 43% of completed tournaments — worth knowing when deciding which
[scoring regime](/scoring.html) to implement first.

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

<!-- claim:link-types canonical -->
## Configuration values

Counts from a 102-tournament worldwide sample. `null` means the key was present and null;
remember that on many tournaments the key is [absent entirely](/tournaments.html#the-field-set-depends-on-the-type).

For what the `linkType` values *mean* — which direction a `playoff` or `qualifying` link
points — see [finding the playoff or the qualifier](/tournaments.html#finding-links).

<div class="table-scroll">

| Field | Observed values |
| --- | --- |
| `seeding` | `random` (23,940), `manual` (11,677), `ifpa` (1,736), `series_seed` (1,044), `mp_rating` (295), `mp_rating_rating` (255), `ifpa_womens` (181) |
| `pairing` | `balanced` (16,443), `swiss` (9,008), `balanced_series` (2,698), `strictswiss` (966), `random` (704), `tiers` (250) |
| `firstRoundPairing` | `random` (24,364), `slaughter` (3,639), `adjacent` (1,993), `cross` (69), `best_game` (4) |
| `playerOrder` | `balanced` (22,766), `rotating` (3,450), `seed` (2,466), `random` (2,079), `seed_reverse` (722), `position` (263), `disabled` (7) |
| `playerOrderOpen` | `scorekeepers` (37,174), `players` (1,681) |
| `arenaAssignment` | `balanced` (29,590), `manual` (5,695), `disabled` (1,510), `random` (1,099), `balanced_series` (1,052), `banks` (869), `category_banks` (779), `manual_banks` (266) |
| `scorekeeping` | `disabled` (32,379), `user` (11,702) |
| `suggestions` | `automatic` (17,524), `disabled` (13,195), `restricted` (10,217) |
| `byes` | `full` (5,715), `zero` (732), `half` (218) |
| `tiebreaker` | `disabled` (18,927), `standard` (5,237), `placement` (2,343), `wins` (1,428), `placement_last` (264), `none` (238), `losses` (83), `seed` (82) |
| `scoring` | `ifpa` (17,408), `papa` (3,789), `winnerbonus` (1,381), `pinburgh` (600), `dcleague` (556), `idaho` (197), `aussierules` (162), `custom` (73), `bapa` (43), `winneronly` (32), `winwinlossloss` (22), `progressive` (15), `nepl` (10) |
| `bestGameScoring` | 21 values: `bg_linear`(+`_200`/`_300`/`_500`), `bg_papa`(+`_150`/`_200`/`_qck_de`), `bg_indisc`(+`_200`), `bg_circuit`, `bg_cax`, `bg_hella`, `bg_eurovision`, `bg_past_times`, `bg_top_25`, `bg_top_30`, `bg_50_percent_de`, `bg_90_percent_de`, `bg_95_pct_mod_de`, `custom` |
| `organizer.role` | `player`, `organizer` |
| `linkedTournaments[].linkType` | `playoff` (9,240), `qualifying` (9,149), `series` (1,140), `arena` (220), `queue` (11), `entry` (1) |
| `linkedTournaments[].status` | `completed` (17,000), `started` (1,765), `active` (662), `planned` (334) |
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
