---
title: Differences from the handbook
navTitle: Divergences
description: Where this documentation contradicts the official docs, and why
group: Guides
order: 22
---

# Differences from the handbook

This documentation contradicts [docs.matchplay.events](https://docs.matchplay.events/) in
several places. Every divergence is deliberate and listed here, so you can audit the
reasoning rather than take it on trust.

The general rule applied: **where observed behaviour and the handbook disagree, observed
behaviour wins** — but the handbook's claim is recorded alongside it.

## Contradictions

<div class="table-scroll">

| Topic | Handbook | Observed |
| --- | --- | --- |
| Games endpoint | Documents `GET /games` as the games endpoint | It omits `playerIds`, `userIds`, `resultPositions`, `resultPoints`, `resultScores`, `resultCountMismatch`, `suggestions`. The undocumented `GET /tournaments/{id}/games` returns all 24 |
| Response fields | Not documented at all | Every schema on this site was reconstructed by observation |
| Machine-readable spec | Points at `app.matchplay.events/api-docs/` | That URL redirects to the handbook. No vendor spec exists |
| Expansion flags | Lists 11 `include*` flags without qualification | Six add data; the rest were `null` or unpopulated in every test. Unknown flags are silently ignored |
| Deep pagination | Not mentioned | Returns `401 "Do not scrape data by paginating deeply."` |
| `search` types | Not documented | `type` is required; only `users` and `tournaments` are valid |

</div>

## Things the handbook simply omits

Not contradictions — gaps. Each is documented here from observation:

- **Five response envelope shapes**, including a bare array for standings and custom
  envelopes for `/users/{id}` and `/ratings/*`.
- **Two incompatible paginators**, with `per_page` typed differently in each.
- **Query parameters stripped** from `/tournaments` pagination links.
- **Five timestamp formats**, two of which appear in the same object.
- **Scoring semantics** — the four regimes for reading `resultPoints` and `resultPositions`.
- **`status: "started"` mostly meaning finished** — measured at 74 of 77.
- **`linkedTournamentId` always being null.**
- **Type-dependent field sets** where irrelevant keys are absent rather than null.
- **`pointsMap` changing type** between REST and websocket.
- **In-progress games returning null-filled result arrays.**
- **The six websocket silences.**
- **`/search`, `/players`, `/ratings/users/{id}`, `/ratings/ifpa/{id}`, `/series`,
  `/series/{id}`** — six undocumented endpoints.
- **The legacy unauthenticated API** on the bare `matchplay.events` host.

## Corrections to earlier community understanding

Claims that circulate among API consumers which observation does not support:

<div class="table-scroll">

| Claim | What was actually observed |
| --- | --- |
| Score-based formats return games without `userIds` | They return **no games at all**. Across 6,148 cached games, none lacked `userIds`; golf tournaments 259350, 256439 and 257742 each had multiple rounds holding zero games |
| Paging past the end returns an empty body | Returns `401` with a scraping message. An empty body may occur in other circumstances, so guard for both |
| There is no standalone series endpoint | **Wrong.** `GET /series/{id}` and `GET /series` both exist and are undocumented. See [Series](/series.html) |
| `data` may collapse to a bare object on collections | Never observed on a collection. It *is* a bare object on `/tournaments/{id}`. Normalising defensively remains sensible |
| `status: "started"` mostly means "finished but abandoned", with tournaments idle for over a month | **No longer true.** Match Play now auto-closes an idle tournament after two days. Measured across the live `status=started` list: of 77 tournaments past their scheduled end, the longest idle was 1.68 days. The 23 exceeding two days were all still inside their scheduled window and all long-running formats. Older captures predate this policy |

</div>

## Where the handbook remains authoritative

It is the only source for what tournament features **mean**, and this site does not
duplicate that:

- What each format actually is, and how to run one.
- Scoring system definitions and their point tables.
- The Match Play Ratings system and its Glicko constants.
- Organizer-facing features — registration, playoffs, prize pools, managers.
- Their stated API usage guidelines, which this site treats as binding.

## How claims here are evidenced

Every field in the [OpenAPI spec](/openapi.yaml) carries an `x-evidence` extension:

<div class="table-scroll">

| Badge | Meaning | Source |
| --- | --- | --- |
| <span class="evidence evidence-verified">verified</span> | Seen in a real captured response | Live probes plus fixtures from six consuming applications |
| <span class="evidence evidence-derived">derived</span> | Known only from code that reads it | Production applications; the field exists but was not in a captured payload |
| <span class="evidence evidence-unverified">unverified</span> | Asserted but unconfirmed | Documented somewhere, no evidence either way |

</div>

The evidence base:

- **Live probes** — 46 requests across two rounds at one call per two seconds.
- **A SQLite cache** of 6,148 real game objects across 131 tournaments.
- **Fixture corpora** including 102 live tournaments spanning 13 formats, a 135-game
  unpaginated response, a captured in-progress game, and 1,815 lines of logged websocket
  traffic.
- **Six independent applications** consuming the API in production.

## Reporting a correction

This documentation describes a moving target that makes no compatibility promises to third
parties. Behaviour recorded here was observed in **August 2026** and may have changed.

If something here is wrong, the most useful correction includes the request you made and the
response you got — the same standard applied throughout this site.
