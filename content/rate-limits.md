---
title: Rate limits & caching
navTitle: Rate limits
description: The 120/minute budget, why it belongs to your token, and what is safe to cache forever
group: Start here
order: 3
---

# Rate limits & caching

Match Play's stated limit is **120 requests per minute**, described in their handbook as
generous *on the understanding that consumers avoid causing needless load*. Treat the
guidance as part of the contract, not decoration — the practical consequence of ignoring it
is an IP block.

<div class="callout callout-warn">
<span class="callout-title">The budget belongs to your token, not your IP or your process</span>

Two workers sharing one API token share one 120/minute budget, and neither knows what the
other has spent. An in-memory limiter is only correct in a **single process**.

If you scale horizontally, move the limiter to shared state — a Redis token bucket or
equivalent — or give each replica its own token. This is the single most common way a
working integration starts failing in production.
</div>

## Match Play's own guidelines

From the [handbook](https://docs.matchplay.events/api):

1. Fetch OPDB, PinTips and Ratings data from the [CDN exports](/exports.html), never the API.
2. Don't treat the API as your backend. Your architecture must include storage.
3. Don't re-fetch unchanged data. Most Match Play data never changes once recorded.
4. Fetch once on behalf of all your users, then serve from your own store.

Two endpoints carry extra guidance: **standings** should not be polled more than once every
15 seconds for a live tournament, and fetched exactly once for a completed one.

## Two client patterns that work

Both are drawn from production applications.

### Serialized spacing

Simplest correct approach: one queue, one call at a time, a fixed gap between them.

```js
const RATE_LIMIT_MAX_CALLS = 120
const SAFETY_MARGIN_MS = 25
const MIN_CALL_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_MAX_CALLS) + SAFETY_MARGIN_MS  // 525ms

let queue = Promise.resolve()
let lastCallAt = 0

function schedule(task) {
   queue = queue.then(async () => {
      const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      lastCallAt = Date.now()
      return task()
   })
   return queue
}
```

That yields about 114 calls/minute. The margin absorbs clock jitter — pacing at exactly
500ms will drift over the limit.

### Multi-window sliding

Allows short bursts while still respecting the per-minute ceiling. Useful when you want a
tournament seed (3 calls) to complete promptly rather than over 1.5 seconds.

```js
const RULES = [
   { maxCalls: 5,   windowMs: 1000 },
   { maxCalls: 115, windowMs: 60000 }
]
```

Both windows are enforced simultaneously: at most 5 calls in any rolling second, and at most
115 in any rolling minute.

<div class="callout">
<span class="callout-title">Prevention, not recovery</span>

Neither pattern handles `429`. Neither production client that inspired them has ever needed
to — staying under the ceiling is the whole strategy, and there is no documented
`Retry-After` behaviour to rely on. If you do see a `429`, back off exponentially and treat
it as a bug in your pacing rather than a normal condition.
</div>

## Does websocket traffic count?

**Unverified.** A busy tournament emitted roughly 1,300 websocket messages over its
lifetime. If those counted against a 120/minute REST budget, merely listening would exhaust
it — which suggests they don't. But nobody has confirmed it, and Match Play don't document
it.

Watch for `429`s if you run a listener at scale, and assume nothing.

## What is safe to cache, and for how long

This is where most of your rate budget savings come from. Match Play data is overwhelmingly
immutable once written.

<div class="table-scroll">

| Data | Cache | Why |
| --- | --- | --- |
| Rounds of a completed tournament | **Forever** | Never change |
| Games of a completed tournament | **Forever** | Never change |
| Standings of a completed tournament | **Forever** | The handbook says so explicitly |
| Roster of a completed tournament | **Forever** | Never change |
| Summary endpoints | **Forever** | Only exist after completion |
| OPDB / PinTips / ratings | From the [CDN](/exports.html) | Never call the API for these |
| A live tournament's games/standings | Seconds | Changing constantly |
| `/tournaments?played=` | Minutes | New tournaments appear |
| `/tournaments?status=started` | Minutes | The working set moves |

</div>

The key insight: **a completed tournament is immutable**, so cache it keyed by tournament id
and never look again. If you compute statistics for many players, most of them will have
played some of the same tournaments — a shared cache means the second player who attended a
given event costs nothing.

### Deciding when a tournament is final

`status: "completed"` is the obvious signal, but it under-counts: organizers routinely
forget to mark tournaments complete, and Match Play only
[auto-closes them after two idle days](/tournaments.html#status-started).

A two-day rule therefore matches Match Play's own behaviour — a `started` tournament idle
that long is about to be closed anyway. Before that, fetch it fresh every time and don't
persist it.

The exception is long-running formats. A `best_game` or `card_best_game` tournament can sit
`started` and idle for weeks while its scheduled window is open, so gate on `endLocal` too
rather than age alone.

```js
const AUTO_CLOSE_IDLE_DAYS = 2

function isImmutable(tournament) {
   if (tournament.status === 'completed') return true
   if (tournament.status !== 'started') return false

   // Long-running formats sit idle by design while their window is open.
   if (tournament.endLocal && new Date(tournament.endLocal) > new Date()) return false

   return daysSince(tournament.updatedAt) >= AUTO_CLOSE_IDLE_DAYS
}
```

Prefer `updatedAt` over `startLocal` here: a multi-round tournament can run for hours past
its start, and it is idleness the auto-close measures, not age.

## Coalesce concurrent work

A persistent cache dedupes across *time*, but it is written only after a fetch completes.
Two requests arriving simultaneously for the same uncached tournament will both miss and
both fetch.

Wrap in-flight requests in a promise registry so concurrent callers share one fetch:

```js
const inFlight = new Map()

function singleFlight(key, task) {
   if (inFlight.has(key)) return inFlight.get(key)
   const promise = task().finally(() => inFlight.delete(key))
   inFlight.set(key, promise)
   return promise
}
```

Order the layers: **persistent cache → single-flight → rate limiter**. Checking the cache
first means a hit costs nothing; single-flighting before the limiter means duplicate work
never consumes budget.

## Filter before you fetch

The cheapest call is the one you don't make. `GET /tournaments?played=` returns full
tournament objects including `status`, `type` and `startLocal` — enough to decide whether you
care, before spending three more calls on rounds, games and standings.

If you only need the last two months, filter on `startLocal` first. On a typical player's
history that turns ~100 tournaments into ~10, which is a 90% reduction in every downstream
call.
