---
title: Websocket reference
navTitle: Websocket reference
description: The Pusher channel and every event, generated from the AsyncAPI spec
group: Reference
order: 19
---

# Websocket reference

The server, channel and every message in [`asyncapi.yaml`](/asyncapi.yaml), rendered for
reading and **generated from the spec at build time**.

<!-- claim:live-result-arrays -->
<div class="callout callout-trap">
<span class="callout-title">The events that never arrive matter more than the ones that do</span>

This page lists what the channel *can* send. The
[Real-time page](/realtime.html#the-six-silences) documents the six cases where the event
you are waiting for **never comes** — a round starting does not announce its games, strike
adjustments emit nothing at all, and reconnecting replays nothing.

A client built only from this reference will silently show stale data.
</div>

Also available as [AsyncAPI 3.0 YAML](/asyncapi.yaml).

{{asyncapi-reference}}
