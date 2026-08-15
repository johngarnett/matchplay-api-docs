---
title: Errors
description: Status codes, what they mean, and which are safe to cache
group: Reference
order: 11
---

# Errors

Error bodies are usually JSON with a `message` key, but **not reliably** — parse
defensively:

```js
const body = await response.text()
let message
try { message = JSON.parse(body).message } catch { message = body }
```

## Status codes

<div class="table-scroll">

| Code | Meaning | Cache the failure? |
| --- | --- | --- |
| `401` | Bad token, deep pagination, **or** a route your token cannot read. Match on the body | No |
| `403` | Player opted out of sharing history | **Yes** |
| `404` | No such record | **Yes** |
| `410` | Gone | **Yes** |
| `405` | The route exists but not for this method | **Yes** |
| `422` | Invalid or missing query parameter | No — fix the request |
| `429` | Rate limited | No — back off |
| `5xx` | Server error | No |

</div>

The caching column matters. `403`, `404` and `410` are **id-specific and stable** — the
answer will be the same tomorrow, so remember it rather than asking again. Everything else
is transient or your fault.

```js
const CACHEABLE_UPSTREAM_STATUSES = new Set([403, 404, 410])
```

## `401` has two very different meanings

### A bad or missing token

The ordinary case.

Note that many endpoints **answer without authentication at all** — a `GET` on a tournament
with no `Authorization` header returned a normal `200`. Do not take that as permission.
Match Play warn explicitly that unauthenticated use risks an IP block, and an IP block is
much harder to recover from than a `401`.

### Deep pagination

```json
{ "message": "Do not scrape data by paginating deeply." }
```

Returned when `page` is too high — confirmed at `page=9999` on `/tournaments`. This is an
anti-scraping guard wearing the wrong status code. Retrying, re-authenticating or rotating
tokens will not help; only asking for less data will.

<div class="callout callout-warn">
<span class="callout-title">Distinguish them by body, not by code</span>

Since both are `401`, a client that treats every `401` as "refresh the token and retry" will
loop forever against the pagination guard. Match on the message text.
</div>

Note that some consumers previously observed an *empty body* rather than this message when
paging past the end. Either way, guard the shape:

```js
if (!payload || !payload.meta || !Array.isArray(payload.data)) {
   return   // stop paging
}
```

## `405` and `401 Not allowed (token)`

Two responses confirm that a route exists even though it did not answer:

- **`405`** — `The GET method is not supported for route api/players/135991`. The path is
  real, but not readable this way. Look for a sibling: `/api/players/resolve-unknown` works.
- **`401 {"message":"Not allowed (token)"}`** — the route is real but a personal token cannot
  read it. Seen on `/api/locations/{id}` and on the `/api/clubs` list, while
  `/api/clubs/{id}` returns `200`.

Both are more informative than a `404`, which means the route simply is not there. See
[finding an endpoint](/conventions.html#finding-an-endpoint-insert-api).

Note this `401` is a **different condition** from the deep-pagination guard above, which
shares the status code but returns a different message. Match on the body.

## `403` — opted out {#opted-out}

Users can hide their tournament history. When they have, `/tournaments?played={userId}`
returns `403` with a body matching `/opted out/i`.

This is **not a failure**. It is a stable, deliberate, per-user state, and the right response
is to explain it rather than to show an error:

```js
const HTTP_FORBIDDEN = 403
const OPTED_OUT_MESSAGE_RE = /opted out/i

if (response.status === HTTP_FORBIDDEN && OPTED_OUT_MESSAGE_RE.test(body)) {
   return { optedOut: true }   // cache this — it will not change on retry
}
```

The exact wording is not documented and may vary, so match the substring rather than a full
string. The corresponding flag is `historyOptOut` on the
[user object](/identity.html#privacy-flags).

## `404` — not found

The body names the Laravel model, which is a handy hint about what the API thinks you asked
for:

```json
{ "message": "No query results for model [App\\Models\\Tournament] 99999999" }
```

```json
{ "message": "No query results for model [App\\Models\\User] 999999999" }
```

Note that low tournament ids **do exist** — id `1` returns a real tournament. Don't use small
integers as your "definitely missing" test value.

`GET /users/{userId}` returning a clean `404` makes it the reliable way to
[validate a user id](/identity.html#get-a-user-profile), unlike `?played=` whose empty result
is ambiguous.

## `422` — validation

Returned with a Laravel-style field breakdown:

```json
{
  "message": "The selected type is invalid.",
  "errors": { "type": ["The selected type is invalid."] }
}
```

Observed on [`/search`](/profile-search.html#search) when `type` is missing
(`"The type field is required."`) or not one of `users` / `tournaments`.

## Silent failures

Not every mistake produces an error, and these are worse than the ones that do.

<div class="table-scroll">

| What you did | What happens |
| --- | --- |
| Misspelled an `include*` flag | Accepted, ignored, unchanged payload, no error |
| Used `includeLinkedTournament` (singular) | Same — silently ignored |
| Followed `links.next` on `/tournaments` | Works, but your filters were stripped |
| Passed a `userId` to `/players?players=` | Empty page, not an error |
| Read `resultPositions` on a live game | Array of nulls, reads as a loss |
| Filtered on `status=completed` | Silently drops finished-but-unmarked tournaments |

</div>

None of these raise anything. Each produces a plausible-looking wrong answer, which is why
they cost far more debugging time than a `500` ever would.

## What isn't there

- **No `Retry-After` handling** is documented, and no consumer has needed it. Rate limiting
  is meant to be prevented, not recovered from.
- **No `ETag` or conditional requests.** There is no `If-None-Match` support to lean on;
  cache by immutability instead ([how](/rate-limits.html#what-is-safe-to-cache-and-for-how-long)).
- **No documented deprecation or versioning policy.** The base path has no version segment.
  Field sets have changed before — the global `/games` endpoint used to return `userIds` and
  no longer does.

## Field reference

{{schema:Error}}

{{schema:ValidationError}}
