---
title: Schema index
description: Every documented object in one place, generated from the OpenAPI spec
group: Reference
order: 17
---

# Schema index

Every object the API returns, generated directly from
[`openapi.yaml`](/openapi.yaml). The narrative pages link here whenever a field
references another object.

Each schema is also published as a standalone JSON Schema under
[`/schemas/`](/schemas/) — for example
[`/schemas/Tournament.json`](/schemas/Tournament.json) — usable for runtime
validation with any JSON Schema validator.

<div class="callout">
<span class="callout-title">Evidence badges</span>

<span class="evidence evidence-verified">verified</span> — seen in a real captured response.
<span class="evidence evidence-derived">derived</span> — known only from application code
that reads it. <span class="evidence evidence-unverified">unverified</span> — asserted
somewhere but not confirmed.

Full methodology in [Differences from the handbook](/divergences.html#how-claims-here-are-evidenced).
</div>

{{schema-index}}
