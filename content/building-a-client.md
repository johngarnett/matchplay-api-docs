---
title: Building a client
description: A worked walkthrough — call budget, caching, and the traps in order
group: Guides
order: 18
---

# Building a client

Everything on this page assumes you've read [Rate limits](/rate-limits.html) and
[Conventions](/conventions.html). This is how the pieces fit together.

## The shape of the problem

Answering "how has this player done recently?" touches four endpoints and a rate limiter.
Done naively it takes hundreds of calls and several minutes. Done well it takes a handful,
and the second player you ask about is nearly free.

Three ideas carry most of the weight:

1. **Filter before you fetch.** The list endpoint already tells you enough to discard most
   tournaments.
2. **A completed tournament is immutable.** Cache it by id, forever, shared across all your
   users.
3. **Coalesce concurrent work.** A cache written after the fetch doesn't help two requests
   that miss simultaneously.

## A worked example

Goal: a player's record over the last two months.

### 1. Their tournaments — one call

```
GET /tournaments?played={userId}&limit=100
```

Deliberately **omit `status=completed`**. That filter would drop tournaments the organizer
finished but never marked complete — which is most `started` tournaments
([why](/tournaments.html#status-started)).

Handle `403` matching `/opted out/i` as a normal outcome, not an error.

### 2. Filter in memory — zero calls

```js
const MONTHS_TO_REPORT = 2

const relevant = tournaments.filter(tournament =>
   (tournament.status === 'completed' || tournament.status === 'started') &&
   withinLastMonths(tournament.startLocal, MONTHS_TO_REPORT)
)
```

Filter on `startLocal`, not `startUtc` — an evening tournament falls on the next UTC day and
would land in the wrong month.

This is the highest-leverage step in the whole pipeline. A hundred tournaments becomes ten,
and every subsequent call is multiplied by that count.

### 3. Per tournament — three calls, cached forever

```
GET /tournaments/{id}/rounds
GET /tournaments/{id}/games?round={comma,separated,ids}
GET /tournaments/{id}/standings
```

The games endpoint takes a comma-separated round list, so one call covers every round —
chunk at 25 ids to keep URLs sane. Neither endpoint paginates.

If the tournament is [immutable](/rate-limits.html#deciding-when-a-tournament-is-final),
persist all three keyed by tournament id and never fetch them again. That cache is shared
across every player who attended, which is what makes the second player cheap.

### 4. Only if needed — one more call

```
GET /tournaments/{id}?includePlayers=1
```

Run this **only** when no game yielded the player's `playerId` — which for head-to-head
formats is never, and for [score-based formats](/single-player.html) is always.

### 5. Count, carefully

```js
for (const game of games) {
   if (game.bye === true) continue
   if (game.status !== 'completed') continue
   const record = gameRecord(tournament, game, playerId)   // see /scoring.html
   …
}
```

Placement comes from standings, keyed by `playerId`, with ties already collapsed. Player
count is `standings.length`.

### Budget

Ten tournaments, all cold: 1 + (10 × 3) = **31 calls**, about 16 seconds at 525ms spacing.
Warm: **1 call**. A second player sharing eight of those tournaments: 1 + (2 × 3) = **7
calls**.

## Client architecture

```
request
   │
   ├─ response cache (per player, short TTL)      hit → done
   │
   ├─ background job, one per player id
   │     │
   │     ├─ persistent cache (per tournament, forever)   hit → free
   │     ├─ single-flight registry                       joins in-flight work
   │     └─ rate limiter                                 the only path to the network
   │
   └─ poll or stream progress
```

Order matters. Cache first so hits cost nothing; single-flight before the limiter so
duplicate work never spends budget.

<div class="callout">
<span class="callout-title">Don't make users wait on a synchronous request</span>

A cold computation takes tens of seconds — far too long for one HTTP request. Run it as a
background job keyed by player id, guaranteeing at most one job per id, and let callers poll
(`202` with progress) or subscribe over SSE. Concurrent requests for the same player share
one job.

Retain failures briefly too, so a doomed job isn't restarted on every poll.
</div>

## A live client

If you're following a tournament in progress, the websocket changes the shape — but does not
remove the need for REST.

```
subscribe to tournaments.{id}
seed from REST: tournament + rounds + games      (3 calls)

on RoundCreatedOrUpdated(status: started, new round)  →  GET /tournaments/{id}/games
on Players/ArenasAdded|Changed                        →  resolve-unknown, 25 ids per call
on RoundsDeleted                                      →  cascade delete its games locally
on reconnect                                          →  re-seed everything, nothing replayed
periodically                                          →  refetch roster (silent strike changes)
```

Costs: 3 calls to seed, 3 per reconnect **per subscription**, 1 per round start,
`ceil(n / 25)` per player change. Reconnect is your biggest burst — make sure it shares the
rate limiter with everything else.

See [the six silences](/realtime.html#the-six-silences) for why each REST call is unavoidable.

## Checklist of traps

<div class="table-scroll">

| Trap | Guard |
| --- | --- |
| `/games` has no player or result fields | Use `/tournaments/{id}/games` |
| Live game has `resultPositions: [null, null]` | Gate on `status === 'completed'` |
| `resultPositions` is not slot-aligned | Index `resultPoints` by `playerIds.indexOf()` |
| Progressive knockouts never score `0.00` | Branch on `knockoutProgressive` first |
| Byes inflate records | Skip `bye === true` |
| `status=completed` drops tournaments still in their 2-day grace period | Accept `started` too |
| `links.next` on `/tournaments` drops filters | Build page URLs yourself |
| Deep pagination returns `401` | Don't page deeply; use exports |
| Misspelled `include*` flags are ignored | Diff payloads when an expansion "doesn't work" |
| `linkedTournamentId` is always null | Use `linkedTournaments[]` |
| `startUtc` shifts evening events to the next day | Group on `startLocal` |
| Config keys are absent, not null | Use `in`, not `!== null` |
| Points arrive as strings | `Number()` and check `isFinite` |
| Score-based formats have no games | Fall back to the roster |
| `pointsAdjustment` ≠ standings `adjustment` | Read the roster field for strikes |
| One rate budget per token | Share the limiter, or shard tokens |

</div>

## Being a good citizen

Match Play is a small operation, and the rate limit is described as generous *on the
understanding that consumers behave*. Concretely:

- **Use the [CDN exports](/exports.html)** for ratings, OPDB and PinTips. Never loop the API
  for them.
- **Store what you fetch.** The API is not your database.
- **Fetch once for all your users**, not once per user.
- **Poll standings no more than every 15 seconds** for a live tournament, once ever for a
  completed one.
- **Space your calls generously** when exploring. This documentation was researched at one
  call every two seconds — four times slower than permitted, and it cost nothing but a
  minute.
- **Send your token on every request**, even where the endpoint would answer without it.

## Going further

To *reproduce* Match Play's behaviour rather than read its output — predicting pairings,
seeding a bracket, advancing a rating deviation —
[TournamentUtils](https://github.com/haugstrup/TournamentUtils) is the reference
implementation, by Match Play's own author. See
[Enumerations](/enumerations.html#tournamentutils-the-reference-implementation).

For machine-readable definitions, this site publishes an [OpenAPI 3.1 spec](/openapi.yaml),
[JSON Schemas](/schemas/), an [AsyncAPI description](/asyncapi.yaml) of the websocket, and
[`llms-full.txt`](/llms-full.txt) for coding agents.
