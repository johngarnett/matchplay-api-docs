---
title: REST endpoint reference
navTitle: REST reference
description: Every documented endpoint, parameter and response, generated from the OpenAPI spec
group: Reference
order: 18
---

# REST endpoint reference

Every endpoint in [`openapi.yaml`](/openapi.yaml), rendered for reading. This page is
**generated from the spec at build time**, so it cannot drift from the machine-readable
version.

<div class="callout">
<span class="callout-title">This is the map, not the territory</span>

An endpoint reference tells you what to call. It cannot tell you that
[`GET /games` omits the fields you need](/games.html), that
[a live game's results are null-filled](/games.html#the-parallel-array-contract), or that
[`resultPoints` means something different in each format](/scoring.html).

Each group below links to the prose page that covers its traps. Read those before building.
</div>

Also available as [OpenAPI 3.1 YAML](/openapi.yaml), [JSON](/openapi.json), and
[individual JSON Schemas](/schemas/index.json). Object shapes live in the
[schema index](/schemas.html).

{{openapi-reference}}
