---
title: Organizer resources
navTitle: Organizer resources
description: The machine and venue rosters belonging to your own organizer account
group: Reference
order: 15
---

# Organizer resources

Two endpoints return the things an organizer owns rather than anything about a tournament.
Both returned only **the account whose token was used**, with no parameter for selecting a
different organizer and no global machine list.

<div class="callout">
<span class="callout-title">These are not a machine database</span>

If you want machine metadata, you want [OPDB](/reference-rest.html#machines) — Match Play
carries `opdbId` precisely so you can join to it. `/arenas` tells you which machines *this
organizer has registered*, which for most accounts is a handful.
</div>

## Machines

<div class="endpoint"><span class="method">GET</span> <span>/arenas</span></div>

```bash
curl -s "https://app.matchplay.events/api/arenas" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "data": [
    {
      "arenaId": 42381, "name": "Baywatch", "status": "active",
      "opdbId": "Grxvy-M4oZj", "categoryId": null, "organizerId": 5750,
      "labels": [], "labelColor": null
    }
  ]
}
```

<div class="table-scroll">

| Parameter | Meaning |
| --- | --- |
| `status` | `active` or `inactive` |
| `arenas` | Comma-separated arena ids, to fetch a specific set |
| `page` | Standard pagination |

</div>

{{schema:Arena}}

## Venues

<div class="endpoint"><span class="method">GET</span> <span>/locations</span></div>

Venues carry coordinates and two external join keys — `pinballmapId` for
[Pinball Map](https://pinballmap.com) and `scorbitVenueId`/`scorbitVenueUuid` for Scorbit.

```json
{
  "data": [
    {
      "locationId": 12899, "name": "8-Bit Arcade Bar",
      "scorbitVenueId": 5302,
      "scorbitVenueUuid": "54c977ba-d4a0-410c-8453-38d758cf5f93",
      "pinballmapId": 4295, "organizerId": 5750, "status": "active",
      "address": "916 South 3rd St, Renton, WA 98057, US",
      "lat": 47.479813, "lng": -122.204936
    }
  ]
}
```

It takes the same three parameters, with `locations` in place of `arenas`.

<div class="callout callout-trap">
<span class="callout-title">A venue has one id per organizer, not one id</span>

`locationId` is organizer-scoped like `playerId`. The same physical venue appears once per
director who runs tournaments there — eleven times, in the worst case measured — and because
half of all locations are typed by hand rather than taken from Scorbit, the duplicates often
disagree about the name and address.

If you are aggregating by venue, read
[Locations](/identity.html#locations) first: it covers the join keys that work and the
player-overlap fallback for the half that carry no external id.
</div>

<div class="callout callout-trap">
<span class="callout-title">The collection reads but the item does not</span>

`GET /locations` returns `200`. `GET /locations/{id}` returns **`401`** — for a venue that
appears in your own collection response.

That asymmetry is worth knowing when probing: on this API a `401` means the route exists and
you may not read it, while a missing route gives `404` with
`"The route api/… could not be found."` Do not read `401` as "this endpoint does not exist".
</div>

{{schema:Location}}
