---
title: Data exports & CDN
navTitle: Data exports
description: Bulk datasets on a CDN — no token, no rate limit
group: Reference
order: 15
---

# Data exports & CDN

Match Play publish several bulk datasets as static files on a CDN. They need **no API token
and consume no rate budget**, and Match Play's first stated API guideline is to use them
rather than the API wherever they cover what you need.

If you are calling `/ratings/*` or `/opdb/*` in a loop, you are doing it the expensive way.

## The files

<div class="table-scroll">

| Dataset | URL | Size |
| --- | --- | --- |
| OPDB (all machines) | `https://mp-data.sfo3.cdn.digitaloceanspaces.com/latest-opdb.json` | ~1.5 MB |
| PinTips | `https://mp-data.sfo3.cdn.digitaloceanspaces.com/latest-pintips.json` | ~1 MB |
| Ratings, all players | `https://mp-ratings.sfo3.cdn.digitaloceanspaces.com/latest-ratings.csv` | ~8 MB |
| Rating history, 1 year | `https://mp-ratings.sfo3.cdn.digitaloceanspaces.com/latest-rating-revisions.csv` | ~19 MB |

</div>

```bash
curl -f https://mp-ratings.sfo3.cdn.digitaloceanspaces.com/latest-ratings.csv -o ratings.csv
```

## The ratings CSV

<div class="callout callout-trap">
<span class="callout-title">The header contains a date that changes daily</span>

The seventh column is not named `Last Rating Period`. It is named:

```
Last Rating Period (Data from: 2026-07-18)
```

and that date changes with every refresh. Matching the column name by equality will work
today and break tomorrow. Match by **prefix**:

```js
const columnIndex = header.findIndex(name => name.startsWith('Last Rating Period'))
```

The upside is that the file tells you how fresh it is. Extract the date with:

```js
const match = headerLine.match(/Data from:\s*(\d{4}-\d{2}-\d{2})/)
```
</div>

Full header and a sample row:

```
Name,User ID,IFPA ID,Rating,RD,Lower Bound,Last Rating Period (Data from: 2026-07-18),Rating class
"Craig Jones",57051,34433,1675.99,38.47,1599.05,2026-06-14,3
```

<div class="table-scroll">

| Column | Notes |
| --- | --- |
| `Name` | Quoted |
| `User ID` | Match Play `userId`. **May be empty** — skip those rows for user-keyed lookups |
| `IFPA ID` | May be empty |
| `Rating` | Glicko rating |
| `RD` | Rating deviation at the last rating period |
| `Lower Bound` | `Rating − 2·RD`. Derivable, so you can drop it |
| `Last Rating Period (…)` | Date of the player's last rating change |
| `Rating class` | Tier bucket |

</div>

Scale: about 33,500 players. Build lookups keyed by **both** `User ID` and `IFPA ID` — plenty
of players have one and not the other.

<div class="callout callout-warn">
<span class="callout-title">The file lags by a couple of days</span>

Brand-new accounts will be absent. If your product validates user ids against this file,
recently registered players will appear not to exist. Fall back to
[`GET /users/{userId}`](/identity.html#get-a-user-profile) for a miss.
</div>

## Rating revisions

`latest-rating-revisions.csv` holds a year of history for every player, but records only
**rating** changes.

A player's `RD` grows every day they don't play, and those daily changes are **not** in the
file. To get an accurate RD for a historical date you must advance it yourself from the last
period where the rating changed — `GlickoCalculator::advanceRD` in
[TournamentUtils](https://github.com/haugstrup/TournamentUtils) does exactly this.

If you only need *today's* RD for one player, `calculatedRd` from
[`/ratings/users/{userId}`](/profile-search.html#match-play-ratings) is already advanced.

## Per-tournament CSV exports

Four CSV endpoints under the API host, intended for spreadsheet use:

```
https://app.matchplay.events/api/tournaments/{TOURNAMENT_ID}/players/csv
https://app.matchplay.events/api/tournaments/{TOURNAMENT_ID}/single-player-games/csv
https://app.matchplay.events/api/tournaments/{TOURNAMENT_ID}/games/csv
https://app.matchplay.events/api/tournaments/{TOURNAMENT_ID}/entries/csv
```

These are convenience exports for humans. For programmatic use the JSON endpoints are richer
and easier to consume.

## Other CDN hosts

Avatars live on a third Spaces host, referenced from user objects:

```
https://mp-avatars.sfo3.cdn.digitaloceanspaces.com/avatar-U{userId}-{epoch}.jpg
https://mp-avatars.sfo3.cdn.digitaloceanspaces.com/banner-U{userId}-{epoch}.jpg
https://mp-avatars.sfo3.cdn.digitaloceanspaces.com/t-avatar-U{userId}-{epoch}.jpg
```

Use the URLs as given in `user.avatar`, `user.banner` and `user.tournamentAvatar` — the epoch
suffix is a cache-buster and cannot be constructed. All three are `null` for users who never
uploaded one.

<div class="callout">
<span class="callout-title">Respect the opt-outs</span>

Users who set `profileOptOut` or `videoOptOut` have asked not to be shown. The CDN will
happily serve their avatar anyway — enforcement is your responsibility, not the API's.
</div>

## External identifier bridges

Payloads carry join keys into four other systems. None of them are dereferenced by Match Play
for you.

<div class="table-scroll">

| Field | System | Found on |
| --- | --- | --- |
| `ifpaId` | IFPA | Users, players |
| `opdbId`, `opdbGroup` | Open Pinball Database | Arenas, summary rows |
| `pinballmapId` | Pinball Map | Locations |
| `scorbitVenueId`, `scorbitVenueUuid` | Scorbit | Locations |
| `scorbitVenuemachineId`, `scorbitVenuemachineUuid` | Scorbit | Arena pivots |

</div>

These make it possible to enrich Match Play data with venue details from Pinball Map or
machine metadata from OPDB — but each is a separate service with its own API, terms and rate
limits.
