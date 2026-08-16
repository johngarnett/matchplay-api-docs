---
title: Real-time (websocket)
navTitle: Real-time
description: The Pusher channel, its twelve events, and the six things it never tells you
group: Core resources
order: 9
---

# Real-time

Match Play pushes live tournament updates over a Pusher websocket. The official page for
this is marked *"still a work in progress"* and names the events without a single field
name — and says nothing about the cases where the event you're waiting for never arrives.

Those silences are the most important thing on this page. A client built on the assumption
that events are complete will quietly show stale data.

## Connecting

```
wss://ws.app.matchplay.events/app/tnrxzkahdeullnwje83e?protocol=7&client=js&version=8.5.0&flash=false
```

The app key `tnrxzkahdeullnwje83e` is **public** — Match Play's own web app uses it. Channels
need no authentication.

With `pusher-js`:

```js
const pusher = new Pusher('tnrxzkahdeullnwje83e', {
   wsHost: 'ws.app.matchplay.events',
   wsPort: 443,
   forceTLS: true,
   disableStats: true,
   enabledTransports: ['ws', 'wss'],
   cluster: 'mt1'   // required by pusher-js even though wsHost overrides it
})

pusher.subscribe(`tournaments.${tournamentId}`)
```

Or over a raw socket, subscribe by sending:

```json
{
  "event": "pusher:subscribe",
  "data": { "auth": "", "channel": "tournaments.262494" }
}
```

`tournaments.{tournamentId}` is the only channel namespace observed. **One socket multiplexes any
number of tournaments** — subscribe to as many channels as you need rather than opening a
connection each.

## Protocol quirks

- **Event names are Laravel-namespaced.** They arrive as `App\Events\GameCreatedOrUpdated`;
  strip the `App\Events\` prefix.
- **`data` is double-encoded, inconsistently.** Some events deliver `data` as a JSON
  *string*, others as an object. Parse conditionally:
  ```js
  const payload = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
  ```
- **`activity_timeout` is 30 seconds**, delivered in `pusher:connection_established` —
  confirmed first-hand:
  ```json
  {"event":"pusher:connection_established",
   "data":{"socket_id":"833819024.909562457","activity_timeout":30}}
  ```
  Honour the server's value and ping a few seconds early rather than hardcoding it. A
  successful subscribe answers with `pusher_internal:subscription_succeeded` and an empty
  payload; `pusher:pong` carries `data: null`.
- **Close codes carry meaning**: `4000`–`4099` do **not** reconnect, `4100`–`4199` reconnect
  with backoff, `4200`–`4299` reconnect immediately.
- **There is no replay.** No `Last-Event-ID`, no history, no catch-up. Anything that happened
  while you were disconnected is gone permanently.

## The twelve events

<div class="table-scroll">

| Event | Payload | Seen live |
| --- | --- | --- |
| `GameCreatedOrUpdated` | Full game object **plus an embedded `arena`** | Frequently |
| `GamesDeleted` | `{ gameIds: [...] }` | Rare, shape unconfirmed |
| `RoundCreatedOrUpdated` | Full round object | Frequently |
| `RoundsDeleted` | `{ tournamentId, roundIds: [...] }` | Occasionally |
| `TournamentUpdated` | Full tournament model | Occasionally |
| `PlayersAdded` | `{ tournamentId, playerIds: [...] }` — **ids only** | Occasionally |
| `PlayersChanged` | `{ tournamentId, playerIds: [...] }` — **ids only** | Occasionally |
| `ArenasAdded` | `{ arenaIds: [...] }` — ids only | Not observed |
| `ArenasChanged` | `{ arenaIds: [...] }` — ids only | Not observed |
| `SinglePlayerGameCreatedOrUpdated` | Game model | Not observed |
| `SinglePlayerGamesDeleted` | Game ids | Not observed |
| `QueueChanged` | Queue models, **may be omitted if the queue is large** | Not observed — needs `useQueues: true` |

</div>

An event census over 1,815 logged lines: `GameCreatedOrUpdated` 48, `RoundCreatedOrUpdated`
25, `PlayersAdded` 8, `TournamentUpdated` 2, `RoundsDeleted` 1.

### The websocket knows things REST doesn't

`GameCreatedOrUpdated` embeds a **full arena object including its name**:

```json
{ "arenaId": 18447, "name": "Attack From Mars", "status": "active",
  "opdbId": "G4do5-MDlN7", "categoryId": 3, "organizerId": 3158 }
```

REST game objects carry only `arenaId`. So the socket gives you machine names for free while
REST makes you resolve them separately.

The reverse is also true: `TournamentUpdated` **never** carries `linkedTournaments[]` — only
a REST call with `includeLinkedTournaments=true` returns that. And `pointsMap` arrives as an
object keyed by group size rather than the array-of-arrays REST returns
([details](/tournaments.html#pointsmap)).

## The six silences

Every one of these is verified against captured traffic. Each requires a REST call to work
around, so budget for them.

### 1. Starting a round does not announce its games

Games exist server-side the instant a round starts, with players and arenas assigned. They
emit **no event** until someone modifies them.

A real timeline:

```
17:19:26  game 7786843 created server-side
17:19:33  RoundCreatedOrUpdated arrives — alone
17:24:25  first GameCreatedOrUpdated, five minutes later, on result entry
```

**Workaround:** when `RoundCreatedOrUpdated` arrives with `status: "started"` for a round you
haven't seen, immediately `GET /tournaments/{id}/games`.

### 2. Strike adjustments are completely silent

Changing `tournamentPlayer.pointsAdjustment` — an organizer manually adding or removing a
strike — fires **no event of any kind**. There is no event name for it.

**Workaround:** refetch the roster periodically. Bounding it to about once per round keeps
the cost reasonable.

### 3. Player and arena events carry ids only

`PlayersAdded`, `PlayersChanged`, `ArenasAdded` and `ArenasChanged` give you nothing but
identifiers.

**Workaround:** [`resolve-unknown`](/identity.html#resolve-unknown), in batches. Coalesce
`*Added` events — they often arrive in bursts during registration — but
resolve `*Changed` promptly, since it usually signals a deactivation you want to reflect
immediately.

### 4. Reconnecting replays nothing

There is no catch-up mechanism at all.

**Workaround:** treat every reconnect as a cold start and re-seed from REST — tournament,
rounds, games. Three calls per subscribed tournament. With many subscriptions this is your
largest burst of API usage, so make sure your rate limiter is shared with it.

### 5. Completion is often never sent

Organizers frequently just stop, and no `TournamentUpdated` with `status: "completed"`
arrives when they do.

Match Play [auto-closes an idle tournament after two days](/tournaments.html#status-started),
so completion does eventually happen server-side — but two days later, and **whether that
auto-close emits an event has not been observed**. Either way it is far too late to drive a
live display.

**Workaround:** synthesize completion yourself — no activity for N minutes past the expected
end, or a manual signal. Don't wait for an event that may never come, and don't wait for the
auto-close.

### 6. `RoundsDeleted` does not delete the round's games

Deleting a round emits `RoundsDeleted` with the round ids. The games belonging to those
rounds emit nothing.

**Workaround:** cascade locally — drop every game whose `roundId` is in the deleted set.

## Two more gotchas

<div class="callout callout-warn">
<span class="callout-title">Round <code>index</code> can arrive one too high</span>

`RoundCreatedOrUpdated` events with `status: "completed"` sometimes report an `index` one
higher than the true value — a rolling off-by-one as the next round starts.

Freeze a round's `index` when you first see it and don't update it on subsequent events for
the same `roundId`.
</div>

<div class="callout callout-warn">
<span class="callout-title">Gate on <code>status</code> before reading results</span>

A live game arrives with `resultPositions: [null, null]` — a populated array of nulls. The
same trap as [REST](/games.html#the-parallel-array-contract), and it fires on every
in-progress game event.
</div>

## A working consumer shape

```
subscribe to tournaments.{id}
seed from REST: tournament + rounds + games        (3 calls)

on RoundCreatedOrUpdated:
   upsert round, freezing index on first sight
   if status === 'started' and round is new  ->  GET /tournaments/{id}/games

on GameCreatedOrUpdated:
   upsert by gameId; also cache the embedded arena
   ignore results unless status === 'completed'

on RoundsDeleted:
   delete the rounds AND cascade to their games

on Players/ArenasAdded|Changed:
   queue ids, resolve-unknown in batches of 25

on reconnect:
   re-seed everything from REST — nothing was replayed

periodically:
   refetch the roster to catch silent pointsAdjustment changes
```

## Machine-readable

An [AsyncAPI 3.0 description](/asyncapi.yaml) of the channel and its events accompanies this
page. Like the [OpenAPI spec](/openapi.yaml), it is reconstructed from observed traffic
rather than issued by the vendor.
