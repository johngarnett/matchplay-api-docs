---
title: Legacy endpoints
description: The older unauthenticated API on the bare matchplay.events host
group: Reference
order: 17
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
