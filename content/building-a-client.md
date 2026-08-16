---
title: Building a client
description: A worked walkthrough — call budget, caching, and the traps in order
group: Guides
order: 22
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

<!-- claim:auto-close -->
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

Ten tournaments, all cold: 1 + (10 × 3) = **31 calls**, about 16 seconds at the
[serialized spacing](/rate-limits.html#serialized-spacing) shown earlier.
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
one [resolve-unknown](/identity.html#resolve-unknown) batch per player change.
Reconnect is your biggest burst — make sure it shares the
rate limiter with everything else.

See [the six silences](/realtime.html#the-six-silences) for why each REST call is unavoidable.

## Keeping a mirror honest

If you keep your own copy of Match Play data, the dangerous failures are not the ones that
throw. They are the ones that return *fewer rows than they should* and look like success.

<div class="callout callout-trap">
<span class="callout-title">A watermark cursor does not self-heal after a truncated fetch</span>

Incremental sync usually keys on "the newest thing I have seen". That is safe only while
pagination is. If a walk terminates early, page one still holds the **newest** items, so the
watermark advances past the gap — and because it advanced, the next run never looks back.
One truncated fetch becomes permanent silent data loss.

The [PinPoint](https://pinpoint.lol/) team hit exactly this when Match Play's tournaments list moved to
[simple pagination](/conventions.html#pagination): loops terminating on `meta.last_page`
stopped after page one, and 190 player histories were truncated to exactly 25 rows within two
days, every one with a poisoned cursor.

Two defences, both cheap:

- **Terminate on `links.next` and nothing else.** Not `meta.last_page`, which this endpoint
  does not send, and not a short-page heuristic — if your `limit` is
  [silently dropped](/tournaments.html#limit-above-100-reverts-to-25-rather-than-clamping),
  every page arrives at 25 rows with `links.next` still set, and "fewer rows than I asked
  for" ends the walk on page one.
- **Reconcile against a count you did not compute.** `tournamentPlayCount` from
  [`/users/{id}?includeCounts=true`](/identity.html#get-a-user-profile) is an independent
  figure. A mirror holding *exactly* a page-size multiple while Match Play reports more is
  the signature of a truncated walk.
</div>

```js
// A mirror sitting on an exact page-size boundary is suspicious, not merely behind.
function looksTruncated(mirroredCount, matchplayCount, pageSize) {
   return mirroredCount < matchplayCount && mirroredCount % pageSize === 0
}
```

## Scale, roughly

Two independent measurements, useful for sizing a sync. The per-24-hour completed figure and
the latencies come from [PinPoint](https://pinpoint.lol/); the daily totals and tournament
sizes are derived from a 30-day global snapshot of 2,755 tournaments.

They count different things — a shallow walk of the completed feed against every tournament
a community-analysis pipeline retained — so read them as two views rather than one number:

<div class="table-scroll">

| | |
| --- | --- |
| Completed tournaments worldwide | ~59 per 24 hours — about 3 pages at 25 |
| Tournaments worldwide, all statuses | median ~97 per day, peaking at 156 |
| Players per tournament | median 12, mean 15.4, largest seen 191 |
| One page of played history | ~200 ms |
| A 500-tournament player at 25/page | ~20 calls, ~5 s |
| The same player at `limit=100` | ~5 calls |

</div>

Two consequences. A discovery-style sync only needs a **shallow** periodic walk of the
completed feed — which suits an API that
[blocks deep pagination](/conventions.html#deep-pagination-is-blocked). And `limit=100` cuts
call volume roughly fourfold for history backfills; sustained use at that size, under a
client-side cap below the published ceiling, has been reported stable with no `429`s.

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
| An invalid `status` returns the unfiltered list | Check `status` on the rows you get back |
| `limit` above 100 reverts to 25, not 100 | A numeric `meta.per_page` means it was dropped |
| A truncated walk poisons a watermark cursor permanently | Terminate on `links.next`; reconcile against `tournamentPlayCount` |
| `links.next` on `/tournaments` drops filters | Build page URLs yourself |
| Deep pagination returns `401` | Don't page deeply; use exports |
| Misspelled `include*` flags are ignored | Diff payloads when an expansion "doesn't work" |
| `linkedTournamentId` is populated inconsistently | Use `linkedTournaments[]` |
| `linkType` names the *other* tournament's role | A `playoff` link means **this** one is the qualifier — [direction rule](/tournaments.html#finding-links) |
| A `series` link has no `tournamentId` | Filter on `linkType` before dereferencing |
| Rosters only compare within one organizer | `playerId` is organizer-scoped — [containment check](/tournaments.html#inferring-links) |
| One venue has one `locationId` per organizer | Join on `scorbitVenueId`/`pinballmapId`, not name — [locations](/identity.html#locations) |
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
