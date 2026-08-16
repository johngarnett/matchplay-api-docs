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
- **The two-day auto-close** on idle tournaments, and what it means for reading
  `status: "started"`.
- **`linkedTournamentId` being populated inconsistently** — null on recent tournaments,
  set on older ones.
- **Type-dependent field sets** where irrelevant keys are absent rather than null.
- **`pointsMap` changing type** between REST and websocket.
<!-- claim:live-result-arrays -->
- **In-progress games returning null-filled result arrays.**
- **The six websocket silences.**
- **Undocumented query parameters** on the tournaments list: `dateInterval` and
  `playedOrOrganized`, plus `includeCounts` on the user object.
- **Nine undocumented endpoints**: `/search`, `/players`, `/ratings/users/{id}`,
  `/ratings/ifpa/{id}`, `/series`, `/series/{id}`, `/events`, `/events/{id}` and
  `/clubs/{id}`.
- **The legacy unauthenticated API** on the bare `matchplay.events` host.

## Corrections to earlier community understanding

Claims that circulate among API consumers which observation does not support:

<div class="table-scroll">

| Claim | What was actually observed |
| --- | --- |
| Score-based formats return games without `userIds` | They return **no games at all** — the games do not exist, rather than lacking a field. Evidence and consequences in [Identity](/identity.html#when-there-are-no-games-to-scan) |
| Paging past the end returns an empty body | Returns `401` with a scraping message. An empty body may occur in other circumstances, so guard for both |
| There is no standalone series endpoint | **Wrong.** `GET /series/{id}` and `GET /series` both exist and are undocumented. See [Series](/series.html) |
| `linkedTournamentId` is a decoy that is always null | **Only true of recent tournaments.** Null across 102 sampled recent ones, but populated on 3 of 6 tournaments inside a 2023 event. Unreliable rather than unused — see [Tournaments](/tournaments.html) |
| `scorbitId` is an integer | **Wrong.** It is a Scorbit UUID string. Null on all but 37 of 13,539 games, so every early sample was null and the field was typed — and badged verified — from an absence |
| Nine of the settings enums were complete | **None were.** Validating against 44,081 tournaments added values to `seeding`, `pairing`, `firstRoundPairing`, `playerOrder`, `arenaAssignment`, `tiebreaker`, `scoring` and `bestGameScoring`, and doubled `linkType` from two values to six |
| `pointsMap` is an array or null | **Also the string `"manual"`**, in 836 tournaments, with the hand-entered map in `pointsMapCustom` — itself an object, not an array |
| `cardsCounted` is an integer | **An array of card objects** — `{cardId, points, count}` |
| `scorbitLog` is an object | **Wrong.** A URL to a CSV session log on Scorbit's CDN. Null in all but 37 of 13,539 games — same cause as `scorbitId` |
| Standings `points` is always a string | **Wrong.** A number in 20 of 294 tournaments, and both types within one standings array in a further tournament |
| The tournaments list has no date filter | **Wrong.** The undocumented `dateInterval=<start>;<end>` filters by date and combines with `played` — see [Tournaments](/tournaments.html#two-undocumented-filters) |
| `userCounts` is not a play count | **Wrong.** It is zero only because it needs the undocumented `includeCounts=true`; with it, `tournamentPlayCount` is accurate — see [Identity](/identity.html#usercounts-is-zero-unless-you-ask-for-it) |
| `data` may collapse to a bare object on collections | Never observed on a collection. It *is* a bare object on `/tournaments/{id}`. Normalising defensively remains sensible |
| `status: "started"` mostly means "finished but abandoned", with tournaments idle for over a month | **No longer true.** Match Play now auto-closes an idle tournament after two days; older captures predate that policy. Measurement and the long-running-format exception in [Tournaments](/tournaments.html#status-started) |

</div>

## Where the handbook remains authoritative

It is the authority on what tournament features **mean**, and this site does not duplicate
that:

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

Some of it came from other people. The [PinPoint](https://pinpoint.lol/)
team contributed the undocumented query parameters, the export refresh cadence, the
revisions cross-walk, the watermark failure mode and the sizing figures, from their
production integration. Everything they reported was re-verified here before publication,
and where a report and a measurement disagreed, the measurement won.

The largest single check: this site's schemas were validated against **1,301,505 records**
from 44,081 completed tournaments of cached raw responses — every tournament, organizer,
location, player entry, linked tournament and standings row. That found eleven schema errors,
mostly enum values never seen in small samples, and now passes with zero failures.

The evidence base:

- **A 30-day global snapshot** of 2,755 tournaments with standings, from a community-analysis
  pipeline. Useful for scale and for how a real integration models identity — but **derived,
  not raw**: it nulls `type` and `status`, re-encodes player ids, and drops players it cannot
  resolve. Nothing in this documentation's schemas was verified against it, for that reason.


- **Live probes** — 46 requests across two rounds at one call per two seconds.
- **A SQLite cache** of 6,148 real game objects across 131 tournaments.
- **Fixture corpora** including 102 live tournaments spanning 13 formats, a 135-game
  unpaginated response, a captured in-progress game, and 1,815 lines of logged websocket
  traffic.
- **Six independent applications** consuming the API in production.

## Reporting a correction

This documentation describes a moving target. The API makes no compatibility promises to
third parties, and **nothing here is guaranteed to be correct** — it is a best-effort record
of behaviour observed in **August 2026**, which may since have changed.

That is not false modesty. This site has already had to correct its own claims about the
games endpoint's field count, what `status: "started"` means, the size of the ratings
export, and whether a series endpoint exists. Each was found by checking against the live
API. **Do the same before depending on anything here.**

If something here is wrong, the most useful correction includes the request you made and the
response you got — the same standard applied throughout this site.
