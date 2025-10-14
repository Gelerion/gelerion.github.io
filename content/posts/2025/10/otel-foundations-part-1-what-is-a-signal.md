---
title: "OpenTelemetry Foundations: Back to Basics — What Is a Signal? (Part 1)"
date: 2025-10-13T08:00:00+03:00
lastmod: 2025-10-13T08:00:00+03:00
author: "Gelerion"
series: [ "OpenTelemetry Foundations" ]
draft: true
categories: [ "Observability", "Software Engineering" ]
summary: "Start at ground zero: spans, metrics, and logs as structured signals, with a light intro to histograms and a teaser on cardinality."
description: "Part 1 of OpenTelemetry Foundations explores spans, metrics, and logs as structured signals, introduces histograms, and hints at cardinality considerations you should keep in mind."
tags: [
  "OpenTelemetry",
  "OTel",
  "Observability",
  "Traces",
  "Metrics",
  "Logs",
  "Histograms",
  "Cardinality"
]
keywords: [
  "OpenTelemetry signals",
  "OTel traces",
  "OTel metrics",
  "OTel logs",
  "histogram",
  "cardinality",
  "distributed tracing",
  "telemetry fundamentals"
]
slug: "otel-foundations-part-1-what-is-a-signal"
---

## Back to Basics — What Is an OTel Signal?

OpenTelemetry (OTel) defines three core signal types — traces (spans), metrics, and logs — each a structured object that answers a different question about your system. This post demystifies those objects with concrete, low-level examples you can “see” rather than abstract dashboards. We’ll also introduce histograms (and how they differ from counters) and briefly tease cardinality — something you’ll want to manage from day one.

> Outcome: You’ll be able to recognize raw OTel signals, understand where each fits, and know the pitfalls to avoid as you scale.

---

## Signals at a Glance

- Traces/Spans: request lifecycles and causality across services.
- Metrics: periodic measurements and aggregations for trends and SLOs.
- Logs: discrete, timestamped events with contextual details.

---

## Spans (Traces) as Structured Objects

Spans model work: they have a name, start/end time, status, attributes, and links to parent/child spans.

```json
{
  "traceId": "4f9c0b9a2b8b4f6ea4c1d8c7e3f2a1b0",
  "spanId": "a1b2c3d4e5f67890",
  "parentSpanId": "",
  "name": "HTTP GET /checkout",
  "kind": "SERVER",
  "startTimeUnixNano": 1728801600000000000,
  "endTimeUnixNano": 1728801600450000000,
  "status": { "code": "OK" },
  "attributes": {
    "http.method": "GET",
    "http.route": "/checkout",
    "user.id": "12345"
  }
}
```

Use spans to reason about latency, errors, and causality. Attributes provide queryable context — add them intentionally.

---

## Metrics as Structured Time Series

Metrics capture aggregate behavior over time. Two essentials:

- Counter: monotonically increasing value (e.g., requests_total)
- Histogram: distribution of values (e.g., request_duration_seconds)

```json
{
  "name": "http.server.duration",
  "unit": "s",
  "type": "histogram",
  "attributes": { "http.route": "/checkout", "http.method": "GET" },
  "dataPoints": [
    {
      "count": 128,
      "sum": 3.42,
      "bucketCounts": [8, 56, 49, 15],
      "explicitBounds": [0.05, 0.1, 0.25, 0.5],
      "timeUnixNano": 1728801600000000000
    }
  ]
}
```

Counters answer “how many?” Histograms answer “how long/how big, with what distribution?”

---

## Logs as Structured Events

Logs are high-signal events with context; keep them structured for searchability and correlation.

```json
{
  "timestamp": "2025-10-13T08:00:00Z",
  "severity": "INFO",
  "body": "checkout started",
  "attributes": { "user.id": "12345", "cart.size": 3 },
  "traceId": "4f9c0b9a2b8b4f6ea4c1d8c7e3f2a1b0",
  "spanId": "a1b2c3d4e5f67890"
}
```

Add `traceId`/`spanId` for click-through correlation from logs → traces in your backend.

---

## Light Intro: Counters vs Histograms

- Use a counter for event rates (requests, errors). It’s cheap and cache-friendly.
- Use a histogram when you care about distributions (latency, payload sizes). It unlocks percentiles (P50/P95/P99).
- Choose meaningful units and stable buckets early to avoid churn in dashboards and SLOs.

---

## Teaser: Cardinality (Handle with Care)

Cardinality is the number of unique combination of attribute values. High cardinality explodes storage and costs, ruins dashboards, and slows queries. User IDs, UUIDs, and free-form strings are common culprits. We’ll go deep on design strategies later; for now, prefer bounded vocabularies and aggregate where possible.

---

## What You Should Be Able to Do Now

- Identify spans, metrics, and logs in raw form.
- Pick counters vs histograms for your use case.
- Recognize where attributes might create dangerous cardinality.

> Next: we’ll connect the dots from SDK → OTLP → Collector → Backend and demonstrate why context propagation matters.
