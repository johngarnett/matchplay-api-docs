---
title: Match Play Events API
navTitle: Overview
description: Unofficial reference documentation for the matchplay.events REST and websocket API
group: Start here
order: 1
---

# Match Play Events API

Unofficial reference documentation for the [matchplay.events](https://app.matchplay.events)
API — the data behind thousands of pinball tournaments.

<div class="callout">
<span class="callout-title">Why this exists</span>

Match Play publishes a [handbook](https://docs.matchplay.events/) that lists request paths
and query parameters but documents **no response fields at all**. The vendor's own
machine-readable spec is gone: `app.matchplay.events/api-docs/` now redirects to that
handbook.

This site fills the gap. Every schema here was reconstructed by observation — from live
responses and from five independent applications that consume the API.
</div>

<div class="callout callout-warn">
<span class="callout-title">Trust, but verify</span>

**This documentation is not guaranteed to be correct.** It is a best-effort record of how
the API behaved when it was observed, and Match Play Events is a live service that can
change at any time without notice.

**The API's actual responses are the only definitive source.** Check what an endpoint really
returns before depending on anything written here — and if it differs, the API is right and
this page is wrong.

Every claim carries an [evidence badge](#how-claims-here-are-marked) so you can see how well
attested it is.
</div>

## What you get here that the handbook doesn't have

- **Complete response schemas** for every object, with types, nullability, and real examples.
- **A browsable [REST endpoint reference](/reference-rest.html) and
  [websocket reference](/reference-websocket.html)**, generated from the specs so they cannot
  drift, and cross-linked into the prose that explains each endpoint's traps.
- **A machine-readable description of this API**: an [OpenAPI 3.1 spec](/openapi.yaml), an
  [AsyncAPI spec](/asyncapi.yaml) for the websocket, [JSON Schemas](/schemas/index.json) per
  object, and [`llms-full.txt`](/llms-full.txt) for coding agents.
- **Scoring semantics.** How to turn `resultPoints` and `resultPositions` into wins and
  losses, which differs by format in ways that will silently corrupt your data if you get
  them wrong.
- **The traps.** Silently ignored parameters, fields that change type between REST and
  websocket, and result arrays that are full of nulls rather than absent while a game is
  still being played.

## Start here

<!-- claim:games-field-diff -->
<div class="callout callout-trap">
<span class="callout-title">Read this before you write any code</span>

The handbook documents `GET /api/games` as the endpoint for game results. That endpoint
**does not return who played or who won** — it omits `playerIds`, `userIds`,
`resultPositions`, `resultPoints` and `resultScores`.

The undocumented `GET /api/tournaments/{tournamentId}/games` returns all of them. Use that
one. See [Games](/games.html).
</div>

1. [Conventions](/conventions.html) — five response envelopes, five timestamp formats. Read
   this first; it explains shapes you'll meet everywhere.
2. [Rate limits](/rate-limits.html) — 120 requests/minute, charged against your token.
3. [Tournaments](/tournaments.html) — the root object everything else hangs off.
4. [Games](/games.html) and [Scoring](/scoring.html) — the results, and how to read them.
5. [Building a client](/building-a-client.html) — a worked walkthrough with caching strategy.

## Quick start

```bash
curl -s "https://app.matchplay.events/api/tournaments/261001" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Accept: application/json"
```

Get a token at [app.matchplay.events/account/tokens](https://app.matchplay.events/account/tokens).
Tokens look like `387|n1hm…` — an id, a pipe, then the secret.

Some endpoints answer without authentication, but Match Play warn that unauthenticated use
can get your IP blocked. Always send the header.

The API is **read-only**. There is exactly one non-GET operation
([the WPPR estimator](/summaries.html#wppr-estimator)), and it computes rather than stores.
You cannot register players or submit results through it.

## How claims here are marked

Not every field is equally well attested, so each one carries a badge:

| Badge | Meaning |
| --- | --- |
| <span class="evidence evidence-verified">verified</span> | Seen in a real captured response |
| <span class="evidence evidence-derived">derived</span> | Known only from application code that reads it |
| <span class="evidence evidence-unverified">unverified</span> | Asserted somewhere but not confirmed |

Where this documentation contradicts the official handbook, it is deliberate and the
divergence is listed in [Differences from the handbook](/divergences.html).

## Related

- **[TournamentUtils](https://github.com/haugstrup/TournamentUtils)** — pairing, seeding and
  Glicko algorithms in PHP, by Match Play's own author. Effectively the reference
  implementation behind the API's configuration values. See
  [Enumerations](/enumerations.html).
- **[Official handbook](https://docs.matchplay.events/)** — the authority on what tournament
  features *mean*, even though it doesn't document payloads.
- **[Data exports](/exports.html)** — bulk ratings and machine data on a CDN, no API calls
  and no token needed.

<div class="callout callout-warn">
<span class="callout-title">Not affiliated with Match Play Events</span>

This is independent documentation written by API consumers. It is not endorsed by or
connected to Match Play Events, and nothing here is authoritative.

Behaviour described was observed at a point in time. The API makes no compatibility promises
to third parties, carries no version in its path, and has already changed in ways this site
had to correct. Treat every page as a well-researched starting point, not a contract —
**verify against live responses before you rely on it.**
</div>
