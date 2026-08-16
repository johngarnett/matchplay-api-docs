---
title: Legacy endpoints
description: The older unauthenticated API on the bare matchplay.events host
group: Reference
order: 18
---

# Legacy endpoints

An older API generation still runs on the **bare `matchplay.events` host** — no `app.`
subdomain, no `/api` prefix, and **no authentication of any kind**.

These are documented here because they still work and you may encounter them in existing
code, not because you should build on them. Every one has a modern equivalent.

<div class="callout callout-warn">
<span class="callout-title">Prefer the modern API</span>

These endpoints are undocumented, unversioned and unauthenticated. Two of the three return
**HTML that must be scraped**, which will break whenever Match Play touch their markup.

If you are writing something new, use the [ratings endpoints](/profile-search.html#match-play-ratings)
or the [CSV exports](/exports.html) instead.
</div>

## Bulk ratings by IFPA id

<div class="endpoint"><span class="method">GET</span> <span>matchplay.events/data/ifpa/ratings/{YYYY-MM-DD}/{ifpaId,ifpaId,…}</span></div>

The one legacy endpoint that returns JSON. The date path segment is the rating period; the
final segment is a comma-separated list of IFPA ids — observed working with 386 ids in a
single URL.

The response is an object keyed by **IFPA id as a string**:

```json
{
  "34433": { "rating": 1675.99, "rd": 38.47, "lower_bound": 1599.05 }
}
```

Note `snake_case` here, against the modern API's `camelCase`. `upper_bound` is not returned —
derive it as `rating + rd * 2`.

<div class="callout callout-trap">
<span class="callout-title">A sentinel means "no rating", not "rating 1500"</span>

```json
{ "rating": 1500, "rd": 125, "lower_bound": 1250 }
```

That exact triple is a **default, not a measurement** — it means Match Play has no rating for
this player. Treat it as a miss.

A client that takes it at face value will record every unrated player as an average-strength
competitor, which quietly skews any aggregate built on top.
</div>

**Modern equivalent:** [`GET /api/ratings/ifpa/{ifpaId}`](/profile-search.html#match-play-ratings)
for one player, or the [ratings CSV](/exports.html) for bulk.

## Ratings pages (HTML)

<div class="endpoint"><span class="method">GET</span> <span>matchplay.events/live/ratings</span></div>
<div class="endpoint"><span class="method">GET</span> <span>matchplay.events/live/ratings/search?query={name}</span></div>

Human-facing HTML pages, not APIs. Existing integrations scrape them:

- `/live/ratings` — the current rating period date, formatted `Mon DD, YYYY`, read from the
  first `.box` element.
- `/live/ratings/search` — a results table whose second cell holds `"{rating} ±{delta}"`, from
  which `rd = floor(delta / 2)` and the bounds are derived.

The search page takes a rating lookup **by player name** rather than by id. No equivalent
was found in the JSON API, which is probably why it survives.

<div class="callout">
<span class="callout-title">If you must scrape, be polite</span>

A long-running job that used these settled on: `sleep 2` between searches, `sleep 5` then
exactly one retry on failure, and hard failure after that. Given these are unauthenticated
pages with no published limit, that restraint is the whole reason it kept working.
</div>

**Modern equivalent:** `GET /api/search?query={name}&type=users` to resolve a name to a
`userId`, then `GET /api/ratings/users/{userId}`. Two calls instead of one scrape, but
structured and stable.

## Web URLs (not APIs)

For linking users to Match Play's own pages:

<div class="table-scroll">

| URL | Shows |
| --- | --- |
| `https://app.matchplay.events/tournaments/{tournamentId}` | Tournament page |
| `https://app.matchplay.events/tournaments/{tournamentId}/standings` | Standings |
| `https://app.matchplay.events/users/{userId}` | Player profile |
| `https://app.matchplay.events/opdb/changelog` | OPDB changelog |

</div>

These are ordinary web pages. Link to them rather than scraping them — deep-linking is good
practice and costs Match Play nothing.

## Removed endpoints {#removed}

These once worked and no longer do. They are listed so that finding them in an old
repository does not send you chasing something that cannot answer — all were verified dead on
**2026-08-15**.

<div class="table-scroll">

| Endpoint | Response now | Last seen working |
| --- | --- | --- |
| `GET /api/dashboard` | `404` `The route api/dashboard could not be found.` | Referenced by a client library that marked it removed in Dec 2025 |
| `GET matchplay.events/data/tournaments/{slug}` | `404` | ~2019. Keyed by the **slug** from a `/live/` URL, not a numeric id |
| `GET matchplay.events/data/tournaments/{slug}/arenas/{arenaId}/scores` | `404` | ~2019 |
| `GET matchplay.events/api-beta/tournaments/{id}` | `404` | 2017. An entire `/api-beta/` generation, now gone |
| `GET matchplay.events/api-beta/tournaments/{id}/standings` | `404` | 2017 |

</div>

The two older generations are worth a note for anyone reading code from that era: they were
unauthenticated, returned **snake_case** fields (`player_id`, `ifpa_id`, `arena_id`) with no
`data` envelope, and addressed tournaments by human-readable slug rather than numeric id.
Nothing about their conventions carries over to the current API.

<div class="callout">
<span class="callout-title">No webhook endpoint was found</span>

`GET /api/webhooks` returns `404` (checked 2026-08-15), and no webhook registration appears
in Match Play's documentation or in any consuming application surveyed for this site.

The push mechanism this site does document is the [Pusher websocket](/realtime.html), which
you subscribe to rather than register a callback for. If you are looking for a way to have
Match Play call your server, that is the closest equivalent found.
</div>
