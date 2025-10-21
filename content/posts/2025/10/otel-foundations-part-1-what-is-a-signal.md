---
title: "OpenTelemetry Foundations: Back to Basics — What Is a Signal? (Part 1)"
date: 2025-10-13T08:00:00+03:00
lastmod: 2025-10-13T08:00:00+03:00
author: "Gelerion"
series: [ "OpenTelemetry Foundations" ]
draft: false
categories: [ "Observability", "Software Engineering" ]
summary: "OpenTelemetry isn't magic—it's just structured data objects. Part 1 demystifies OTel signals: spans for request timelines, metrics for trends and SLOs, logs for context. Learn about attributes vs events, histogram buckets, cardinality traps, and the unified context that ties it all together."
description: "OpenTelemetry isn't magic—it's just structured data objects. Part 1 demystifies OTel signals: spans for request timelines, metrics for trends and SLOs, logs for context. Learn about attributes vs events, histogram buckets, cardinality traps, and the unified context that ties it all together."
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

When people hear about OpenTelemetry (OTel), they often think of dashboards: latency charts, flame graphs, service maps. But OTel itself isn’t a dashboard, and it’s not “observability” in the marketing sense either. At its core, OpenTelemetry is simply a way for your code to produce **structured data objects** about what it’s doing.

Those objects are called **signals**, and there are three of them: **traces, metrics, and logs**.

That’s it. Everything else — collectors, backends, fancy vendor UIs — is built on top of these building blocks. If you don’t understand signals, you’re just poking at pretty graphs without knowing what’s underneath.

> **Outcome:** In this post we'll strip away the layers. No auto-instrumentation, no vendor dashboards, no collectors. Just the SDK, creating and printing raw signals from your app.

---

> 💡 **Prefer hands-on learning?** All examples in this post come from a working Java project with manual instrumentation, and best practices baked in. Clone it, run it, and explore OpenTelemetry without the magic:  
> 👉 [OTel Playground on GitHub](https://github.com/Gelerion/otel-playground)

---

## Signals at a Glance

- Traces/Spans: request lifecycles and causality across services
- Metrics: periodic measurements and aggregations for trends and SLOs
- Logs: discrete, timestamped events with contextual details

These three signals form the foundation of observability. Let's start with the one everything else depends on: spans.

---

## Spans: Timed Units of Work

The first and most important signal is the **span**. A span represents a single, timed unit of work. It could be an HTTP request, a database query, or a background task.

What makes spans interesting is not just that they measure how long something took, but that they carry *context*. A span is a data structure that captures the duration of an operation, its outcome, and metadata describing what was happening.

Under the hood, a span is just a structured object with a few key parts:

* **Name** — the operation, like `GET /checkout`
* **TraceId + SpanId** — identifiers that connect spans into a trace
* **Attributes** — metadata describing the span, such as `http.method=GET`
* **Events** — timestamped markers that show what happened along the way
* **Status** — success or failure


### Example: Creating a Span in Java

```java
Tracer tracer = GlobalOpenTelemetry.getTracer("demo");

Span span = tracer.spanBuilder("GET /api/v1/hello/{name}")
    .setSpanKind(SpanKind.SERVER)
    .startSpan();

try (Scope scope = span.makeCurrent()) {
    span.setAttribute("http.method", "GET");
    span.addEvent("controller.start");
    // do some work...
    span.setStatus(StatusCode.OK);
} finally {
    span.end();
}
```

When the span ends, you’ll see something like this:

```json
{
  "name": "GET /api/v1/hello/{name}",
  "traceId": "4f9c0b9a2b8b4f6ea4c1d8c7e3f2a1b0",
  "spanId": "a1b2c3d4e5f67890",
  "kind": "SERVER",
  "startTime": 172880,
  "endTime": 1728801,
  "status": { "code": "OK" },
  "attributes": {
    "http.method": "GET",
  },
  "events": [{
    "name": "controller.start",
    "timestamp": 172880
  }]
}
```

<details>
<summary>See full details and example output</summary>

**Try it yourself:**  
👉 [Otel-Playground Repository](https://github.com/Gelerion/otel-playground/blob/blog-exmaples/src/main/java/com/gelerion/otel/playground/examples/SpanExample.java)

**Full OTLP Example:**

```json
{
  "resource": {
    "attributes": [
      {
        "key": "service.name",
        "value": {
          "stringValue": "unknown_service:java"
        }
      },
      {
        "key": "telemetry.sdk.language",
        "value": {
          "stringValue": "java"
        }
      },
      {
        "key": "telemetry.sdk.name",
        "value": {
          "stringValue": "opentelemetry"
        }
      },
      {
        "key": "telemetry.sdk.version",
        "value": {
          "stringValue": "1.54.1"
        }
      }
    ]
  },
  "scopeSpans": [
    {
      "scope": {
        "name": "demo",
        "attributes": []
      },
      "spans": [
        {
          "traceId": "9fe9fbfa79eacbffbf033beeaaaa24cf",
          "spanId": "6e47d4cd8035c384",
          "name": "GET /api/v1/hello/{name}",
          "kind": 2,
          "startTimeUnixNano": "1760425716812179000",
          "endTimeUnixNano": "1760425716813545458",
          "attributes": [
            {
              "key": "http.method",
              "value": {
                "stringValue": "GET"
              }
            }
          ],
          "events": [
            {
              "timeUnixNano": "1760425716813172667",
              "name": "controller.start",
              "attributes": []
            }
          ],
          "links": [],
          "status": {
            "code": 1
          },
          "flags": 257
        }
      ]
    }
  ]
}
```

</details>

### Attributes vs. Events: Clearing the Confusion

A common early question is: what's the difference between attributes and events? On the surface they both look like "extra details," but they capture very different kinds of information.

* **Attributes** describe what the span *is* — metadata that applies for the whole duration: the HTTP method, the database system, or the user role. Once set, they don't change
* **Events** describe what *happens* during the span — timestamped points on the timeline like "controller started," "query executed," "cache miss"

**Mental model:** attributes are like columns in a database table; events are like rows in a log table.

### Why Spans Matter

Spans capture what logs and metrics can't: the **timeline and causality** of a request as it flows through your system.

* Attributes make them **searchable** — filter to failed requests or specific endpoints
* Events make them **explainable** — see what happened inside the request  
* Propagation makes them **distributed** — connect the dots across services
* Status codes enable **debugging** — identify which requests failed and where

The cost: spans require careful lifecycle management (always end them) and thoughtful attribute selection (avoid unbounded values). But when done right, they become the foundation for understanding distributed system behavior.

---

## Metrics: The System’s Pulse

If spans are the story of individual requests, metrics are the pulse of your whole system. They don’t describe a single event, but patterns and trends over time.

Metrics answer questions like:

* How many requests per second are we handling
* What's the distribution of request latencies
* How many jobs failed in the last 5 minutes

### Example: Counters and Histograms

OpenTelemetry defines several metric instruments, but in practice two are most important:

* **Counter** — always increases; good for counts: requests, errors, bytes sent
* **Histogram** — captures a distribution of values; perfect for latency, payload sizes, or anything where the spread matters

```java
Meter meter = GlobalOpenTelemetry.getMeter("demo");

// Counter
LongCounter requests = meter.counterBuilder("http.requests").build();
requests.add(1);

// Histogram
DoubleHistogram latency = meter.histogramBuilder("http.request.duration")
    .setUnit("s")
    .build();
latency.record(0.123);
latency.record(0.7);
```

Conceptually printed output might look like:

```json
{
  "name": "http.request.duration",
  "unit": "s",
  "type": "histogram",
  "attributes": {},
  "dataPoints": [
    {
      "count": 2,
      "sum": 0.823,
      "bucketCounts":   [1, 1, 0],
      "explicitBounds": [0.5, 1, 2],
      "timeUnixNano": 1728801600000000000
    }
  ]
}
```

### Why Not Just Averages?

Averages are comforting, but misleading.

Imagine 99% of your requests finish in 50 ms, but 1% take 5 seconds. The average might still look “fine” at 100 ms, but users experiencing the 5-second requests are not happy.

Histograms let you see the full distribution. They show you the 95th and 99th percentiles, where performance problems hide.

Percentiles are not magic either. Saying “p95 latency is 2 seconds” means 5% of requests take longer than 2s — which could still be thousands of slow requests per minute.


### Histograms: Buckets Today, Exponential Tomorrow

Histograms in OTel (and Prometheus) are bucket-based: you define boundaries like 0.1s, 0.5s, 1s, and each recorded value falls into a bucket.

> 💡 **Note:** Dropwizard users may be familiar with reservoir histograms that estimate percentiles from samples. Those work in a single process but **can't be aggregated across services**—you can't meaningfully combine p95 from Service A and p95 from Service B. Bucket histograms solve this: each service sends bucket counts, and the backend merges them correctly.

Choosing good bucket boundaries is one of the most common and subtle performance tuning decisions in observability.
Too few buckets, and you lose visibility. Too many, and your metrics backend drowns in noise.

<details>
<summary>Examples of bucket pitfalls</summary>

**Buckets too wide**:  You pick only two boundaries: `1s` and `+Inf`

* A request that takes 20 ms goes into the `1s` bucket
* A request that takes 800 ms also goes into the same bucket

Result: both "super fast" and "almost a second" look identical — you just learn "not slow"

**Buckets too narrow**: You define 100 tiny buckets: `1ms, 2ms, 3ms, …` up to `100ms`

* Each request increments a different bucket
* Your dashboards are cluttered with dozens of near-empty series

Result: memory overhead in Prometheus, noisy charts, and you still don't get a clearer picture

**Buckets misaligned**: You set boundaries at `100ms, 200ms, 300ms`, but your API actually runs around `2–3s`

* Every request ends up in the `+Inf` bucket

Result: you only know "everything is too slow," but you can't tell if it's consistently 2s or spiking to 20s

</details>

OTel’s upcoming **exponential histograms** adapt automatically — detail without micromanaging buckets.


### The Cardinality Trap

Metrics are actually time series. Each unique combination of attributes creates a new one.

```
http.requests{method="GET", route="/checkout"}
http.requests{method="POST", route="/login"}
```

Add an attribute like `user.id`, and suddenly you have a series for every user. This is how teams unintentionally blow up Prometheus clusters.

Best practice: keep attributes bounded (HTTP method, status code) and avoid unbounded ones (user IDs, request IDs).

### Why Metrics Matter

Spans are great for debugging a single request, but metrics let you spot system-wide trends:

* Counters show traffic surges
* Histograms reveal creeping latency problems
* Percentiles highlight unhappy outliers

Without metrics, you might not notice your service gradually degrading until users start complaining. 
With metrics, you can catch the trend early and prove SLO compliance ("99.9% of requests complete in under 500ms").

---

## Logs: Human Context, Structured

Most developers are already familiar with logs. They’re the oldest tool in the toolbox: print something, look at it later. Logs are human-readable, but often unstructured.

OpenTelemetry doesn’t replace logging frameworks like Log4j or SLF4J. You’ll still use them. What OTel adds is structure and correlation.

An OTel log record contains:

* Timestamp
* Severity (INFO, WARN, ERROR)
* Body (the message itself)
* Attributes (key–value pairs)
* Optionally, TraceId and SpanId


### Example: Structured OTel Log

```java
Logger logger = GlobalOpenTelemetry.get()
        .getLogsBridge()
        .loggerBuilder("demo")
        .build();

logger.logRecordBuilder()
    .setBody("Handled hello request")
    .setSeverity(Severity.INFO)
    .setAttribute(AttributeKey.stringKey("route"), "/hello")
    .emit();
```

Conceptually printed:

```json
{
  "timestamp": "2025-10-13T08:00:00Z",
  "severity": "INFO",
  "body": "Handled hello request",
  "attributes": { "route": "/hello" },
  "traceId": "4f9c0b9a2b8b4f6ea4c1d8c7e3f2a1b0",
  "spanId": "a1b2c3d4e5f67890"
}
```



### OTel Logs Are Not a Logger Replacement

It’s worth repeating: OpenTelemetry does not replace your logger. You’ll still write `logger.info("...")` as always. The difference is that with an OTel appender or bridge, those logs can carry structure and correlation data automatically.

<details>
<summary>Example log4j2.xml configuration</summary>

**Try it yourself:**  
👉 [Otel-Playground Repository](https://github.com/Gelerion/otel-playground/blob/main/src/main/resources/log4j2.xml)

**Full configuration:**  
This configuration shows how to integrate OpenTelemetry logging with Log4j2. The key components:  
- OpenTelemetryAppender: Captures context data and sends logs to the OTel Collector
- Context capture settings: Automatically includes trace/span IDs in log records
  
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration
        status="WARN"
        xmlns="https://logging.apache.org/xml/ns"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="https://logging.apache.org/xml/ns https://logging.apache.org/xml/ns/log4j-config-2.xsd">

    <Appenders>
        <!-- Console output with JSON formatting for better parsing -->
        <Console name="CONSOLE">
            <JsonTemplateLayout/>
        </Console>
        
        <!-- OpenTelemetry appender: captures context and sends to Collector -->
        <OpenTelemetry name="OpenTelemetryAppender"
                       captureContextDataAttributes="*"
                       captureMapMessageAttributes="true"
                       captureMarkerAttribute="true"
                       captureCodeAttributes="true"/>
    </Appenders>

    <Loggers>
        <!-- Application-specific logger with both console and OTel output -->
        <Logger name="com.gelerion" level="INFO" additivity="false">
            <AppenderRef ref="CONSOLE"/>
            <AppenderRef ref="OpenTelemetryAppender"/>
        </Logger>
        
        <!-- Root logger for all other components -->
        <Root level="WARN">
            <AppenderRef ref="CONSOLE"/>
            <AppenderRef ref="OpenTelemetryAppender"/>
        </Root>
    </Loggers>

</Configuration>
```

</details>

### Manual Correlation Without OTel Logging

Even if you’re not using OTel logging directly, you can still add trace IDs manually to your logs:

```java
Span span = Span.current();
logger.info("Handled request, traceId={} spanId={}", 
            span.getSpanContext().getTraceId(), 
            span.getSpanContext().getSpanId());
```

That way, your logs can be linked back to traces later in Loki, Splunk, or Elasticsearch.

This is a pragmatic middle ground: your team keeps its logging setup, but you gain the ability to correlate logs with traces.


### Why Logs Matter

Logs remain the most human-friendly signal. They tell the story in plain language, but with OTel, they also become structured and correlated. That means you can search them, filter them, and tie them directly to traces and metrics.

---

## The Unified Context

Spans, metrics, and logs are valuable on their own, but the real power comes from the context that ties them together.

When you start a span, OTel creates a context containing a TraceId and SpanId. While that span is active, any metrics you record or logs you emit can carry the same IDs. Across services, the `traceparent` header (defined by the W3C Trace Context specification) propagates that context.

<details>
<summary>The `traceparent` header example</summary>

The `traceparent` header looks like this:
```
traceparent: 00-4f9c0b9a2b8b4f6ea4c1d8c7e3f2a1b0-a1b2c3d4e5f67890-01
```

It contains the version, trace ID, parent span ID, and trace flags. When Service A calls Service B, this header travels along, allowing Service B to create child spans that belong to the same trace.

</details>

The result is a connected view:

* From a failing span, you can jump to the logs that explain the error
* From a latency spike in metrics, you can jump into traces showing where the slowdown happened
* From a suspicious log, you can trace it back to the exact request

This context is what transforms piles of disconnected data into observability.

<details>
<summary>Example: Following the Context</summary>

Imagine this scenario:

1. Your dashboard shows **p95 latency spiking** from 200ms to 3s (metrics signal)
2. You drill into traces and find several slow spans for `POST /checkout` (trace signal)
3. Inside one span, you see a child span: `inventory.check` that took 2.8s
4. You jump to logs filtered by that span's trace ID and find: `ERROR: inventory service timeout after 2.8s` (log signal)

Without unified context, you'd be jumping between three different tools, manually correlating timestamps and request IDs. With OTel providing correlation, your observability backend can link these signals directly — what took minutes of manual correlation now takes seconds.

</details>

---

## Choosing the Right Signal

With three signals at your disposal, how do you decide which to use? Here's a practical guide:

| You Want To... | Use... | Example |
|---|---|---|
| Debug a single slow request | Spans | Trace showing DB query took 2s |
| Detect system-wide degradation | Metrics | P95 latency climbing over 3 days |
| Understand *why* something failed | Logs | Error message with stack trace |
| Prove SLO compliance | Metrics | "99.9% of requests < 500ms" |
| Track request flow across services | Spans | Distributed trace showing all hops |
| Get human-readable context | Logs | "User 123 failed authentication: invalid token" |

In practice, you'll use all three together. Metrics alert you to problems, traces help you locate them, and logs explain them.

---

## Common Pitfalls

Before we wrap up, here are the mistakes I see most often:

1. **Unbounded Attributes:** Don't add `user.id` to metrics labels (cardinality explosion) — use events in spans instead, or use metrics with pre-aggregation

2. **Forgetting `span.end()`:** Leads to memory leaks and incomplete traces — always use try-finally or try-with-resources

3. **Averaging Latency:** Use histograms and percentiles, not `mean()` — averages hide outliers

4. **Wrong Bucket Boundaries:** Test with real traffic patterns before settling on histogram buckets — too wide or too narrow both cause problems

5. **Logging Without Correlation:** Always propagate trace context to logs, either via OTel bridges or manual extraction — logs without trace IDs are much harder to debug

6. **Over-instrumenting:** Don't create a span for every function call — focus on meaningful units of work: HTTP requests, database queries, external API calls

---

## Wrapping Up

That's OpenTelemetry at its most stripped-down: **spans, metrics, and logs**, plus the **context** that stitches them into a single narrative.

Once you see signals this way, dashboards stop looking like magic. They're just visualizations of structured data your app is already producing.

But we've only scratched the surface. Now that you understand what signals *are*, the real questions begin:

* How do these signals leave your application and reach your observability backend?
* Where should the Collector run — as a sidecar, daemon, or gateway?
* How do you handle advanced correlation patterns like exemplars and span links?
* What sampling strategies keep signal while cutting noise?
* How does OTel integrate with existing frameworks like Spring Boot and Micrometer?
* What practices separate noisy telemetry from production-grade instrumentation?

This series will answer all of these. **Part 2** starts with the journey from code to collector — how signals are exported, batched, and routed to their final destinations.