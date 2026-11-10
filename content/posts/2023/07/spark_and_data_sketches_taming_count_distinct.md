---
title: "Distinct Counting at Scale: A Different Approach with DataSketches"
date: 2023-07-09T19:00:53+03:00
lastmod: "2026-11-10T12:00:00+02:00"
author: "Gelerion"
categories: ["Big Data", "Streaming"]
summary: "Distinct counting becomes challenging when you need to aggregate results across different dimensions or time windows. Once unique counts are stored as plain numbers, information about overlapping values is lost. This post explores how Apache DataSketches and Spark help overcome that limitation using compact, mergeable sketches that enable flexible analytics without repeatedly processing raw data."
description: "Speed up Spark `count distinct` on big data. Learn how probabilistic Data Sketches (Theta/HLL) enable efficient cardinality estimation & faster ETL."
tags: [
  "spark",
  "streaming",
  "data-sketches",
  "analytics",
  "probabilistic-algorithms"
]
keywords: [
  "spark data sketches",
  "count-distinct",
  "probabilistic algorithms",
  "theta sketch",
  "hyperloglog",
  "ETL pipelines",
  "data analytics"
]
toc: true
---
## Introduction

Counting unique users is one of the most common analytics questions, and one of the easiest pipelines to get stuck with.
A daily job computes distinct users per ad and writes an integer to a table. Then someone asks for unique users per
campaign, or per week, and the table can't answer. Distinct counts can't be added, because the same user may appear in
several rows. The only way out is to go back to the raw events, which gets expensive as the data grows.

The fix is to change what we store. With Apache DataSketches, we keep a compact, mergeable sketch of the underlying
values instead of a final number. Sketches can be combined across dimensions and dates without touching the raw records.
In exchange, we accept a small, bounded approximation error.

The rest of this post builds that pipeline in Apache Spark for an advertising use case.

> 💡 **Update (2026):** I wrote this in July 2023, when Spark's approximate counting returned only a final number and
> threw away the sketch. The examples use [`spark-sketches`](https://github.com/Gelerion/spark-sketches), a library I
> built to store and merge sketches. Spark now supports DataSketches natively (HLL in 3.5, Theta in 4.1), so on a recent
> runtime you can skip the library. The [last section](#running-this-on-modern-spark) has the function mapping.

## How DataSketches Work

[Apache DataSketches](https://datasketches.apache.org/) summarizes a set into a lightweight binary data structure called
a **sketch**. During ingestion, the sketch hashes each incoming value deterministically and keeps only a bounded,
fixed-size statistical sample of those hashes. Because the same user ID always produces the exact same hash across every
batch job, combining two sketches is just a matter of merging their samples. Overlapping users are deduplicated
automatically, and the raw event logs stay untouched.

If your reports can tolerate a small, bounded approximation error (typically around 1 to 2%), storing sketches instead
of plain integers gives you two advantages:

* **Incremental historical updates:** we can summarize newly arrived data into a daily sketch and merge it directly with
  historical sketches, without needing to recalculate over raw historical data.
* **Dynamic rollups for interactive analysis:** we can pre-aggregate sketches at a fine granularity and later merge them
  across coarser dimensions or arbitrary date ranges on the fly.

DataSketches provides several sketch families depending on your workload. Here we use Theta sketches, which support
distinct counting as well as set operations like union, intersection, and difference. The pipeline below shows how they
change both the daily ETL and the downstream reporting.

## Practical Example: Advertising Analytics

> 💡 **Note:** You can find the code examples in the [companion
> repository](https://github.com/Gelerion/advertising-campaign-analysis)

Suppose an advertising agency runs multiple campaigns, with several ads in each campaign. As users view and click those
ads, events are collected and stored in a data lake.

We want two reports:

1. **Audience reach:** How many distinct users saw or interacted with each campaign?
2. **User engagement:** How many distinct users clicked each ad, and how does that number change over time?

The events are streamed in real time and stored on Amazon S3 as a unified stream partitioned by date:

```scala
s3/
└─ streaming_event_data/
   ├─ ...
   ├─ date=2023-05-17
   └─ date=2023-05-18
```

Each record in the [sample
dataset](https://github.com/Gelerion/advertising-campaign-analysis/tree/main/data/streaming_event_data) follows this
schema:

| Column Name | Data Type | Description |
| --- | --- | --- |
| `ad_id` | String | Unique identifier for each ad |
| `user_id` | String | Unique identifier for each user |
| `campaign_id` | String | Unique identifier for each campaign |
| `click_id` | String | Unique identifier for each ad click (`null` for impression events) |
| `timestamp` | Timestamp | Timestamp indicating when the impression or click occurred |

## Building the Historical Layer

### ETL: Starting with Exact Counts

In a conventional batch setup, a daily job reads the latest partition from the raw event stream, computes unique user
counts per ad, and writes the aggregated rows to a historical Parquet table:

```scala
val adEvents = spark.read
  .option("basePath", "data/streaming_event_data")
  .json("data/streaming_event_data/date=2023-05-18")

adEvents.createOrReplaceTempView("ad_events")

/*
+-----+-----------+--------+----------+-------+----------+
|ad_id|campaign_id|click_id| timestamp|user_id|      date|
+-----+-----------+--------+----------+-------+----------+
|    1|         10|   48101|1684366732|    939|2023-05-18|
|   40|         10|   48102|1684363771|      1|2023-05-18|
|   35|         10|   48103|1684374985|      1|2023-05-18|
|   40|          8|   59030|1684416924|      1|2023-05-18|
+-----+-----------+--------+----------+-------+----------+
*/
```

Then calculate the number of distinct users who clicked each ad on each day:

```sql
SELECT date, campaign_id, ad_id, count(distinct user_id) AS unique_users
FROM ad_events
WHERE click_id IS NOT NULL
GROUP BY date, campaign_id, ad_id
```

<details>
<summary>Load the data into the data lake</summary>

```scala
userEngagement.write
  .mode("overwrite")
  .option("partitionOverwriteMode", "dynamic")
  .partitionBy("date")
  .parquet("data/historical_data/user_engagement")
```

</details>

> 💡 **Note:** The audience reach report is omitted for brevity. The complete baseline implementation, including it, is in
> [CampaignAnalysisNaiveStrategy](https://github.com/Gelerion/advertising-campaign-analysis/blob/main/src/main/scala/com/gelerion/advertising/campaign/analysis/CampaignAnalysisNaiveStrategy.scala).

#### Where the exact-count breaks down

The pipeline is straightforward, but it has a limitation: distinct counts are not additive.

When the same user clicks multiple ads within a campaign, they are correctly counted once per ad. But summing those
counts would count that user multiple times. Once we've reduced each group to an integer, we lose the information needed
to identify overlaps between groups.

This means we cannot calculate unique users per campaign (dropping ad_id) or weekly unique users (aggregating across
date) from our pre-aggregated table alone.

Instead, we must either precompute every reporting combination we anticipate or return to the raw events whenever we
need a different aggregation.

### ETL: Replacing Counts with Sketches

To avoid returning to raw events, we can change our daily job to store a binary Theta Sketch instead of a flat integer.

<details>
<summary>Setup: add the spark-sketches dependency and register the functions</summary>

```xml
<dependency>
   <groupId>com.gelerion.spark.sketches</groupId>
   <artifactId>spark-sketches</artifactId>
   <version>1.0.0</version>
</dependency>

```

> 💡 **Note:** You can find the source code and the Spark version compatibility matrix here:
> [spark-sketches](https://github.com/Gelerion/spark-sketches)

To use the sketch functions in Spark SQL queries, register them once on your `SparkSession`:

```scala
import org.apache.spark.sql.registrar.SketchFunctionsRegistrar
SketchFunctionsRegistrar.registerFunctions(spark)
```

</details>

```sql
SELECT date, campaign_id, ad_id, 
       theta_sketch_build(user_id) AS unique_users
FROM ad_events
WHERE click_id IS NOT NULL
GROUP BY date, campaign_id, ad_id
```

The query looks almost identical to the exact-count version. The difference is the value we keep in `unique_users`:
instead of a number, `theta_sketch_build` returns a serialized Theta Sketch summarizing the distinct user IDs in that
group.

### Persisting Daily Sketches

Store the daily aggregates as partitioned Parquet files:

```scala
userEngagement.write
  .mode("overwrite")
  .option("partitionOverwriteMode", "dynamic")
  .partitionBy("date")
  .parquet("data/historical_data/user_engagement")
```

Dynamic partition overwrite matters here. Since the DataFrame holds one day's results, Spark replaces only the
partitions present in the output and leaves other dates untouched, so history isn't scanned or rewritten each time a
daily aggregate lands. Without this mode, a rerun can overwrite more of the history than intended. The companion project
sets it at the Spark-session level; the option above makes it explicit at the write site.

<details>
<summary>Production notes: late data, deletions and object stores</summary>

* Late-arriving events: this example rebuilds a complete daily partition from that day's events. For late data, either
  rebuild the affected day or merge incoming sketches with the existing day's state. Overwriting a partition with a
  partial batch would lose earlier data.
* Deletions and corrections: sketch union handles duplicates, but it can't generally retract a user who must be deleted
  or correct arbitrary past events. Those cases can require rebuilding from source data.
* Object stores: plain Parquet overwrites aren't transactional. On S3 or another object store, use a compatible
  committer or a transactional table format if readers need reliable, atomic updates.

</details>

## Querying the Historical Data

After a few daily runs, the table is just Parquet files partitioned by date. Each row holds a `campaign_id`, an `ad_id`
and a sketch in place of a number. Because the partitions are by date, a query with a date filter only reads the days it
needs.

<details>
<summary>Historical data layout</summary>

```scala
historical_data/
  user_engagement/
    date=2023-05-17/
      part-....parquet
    date=2023-05-18/
      part-....parquet
    date=2023-05-19/
      part-....parquet
    ...
```

</details>

```scala
spark.read.parquet("data/historical_data/user_engagement")
  .createOrReplaceTempView("user_engagement")
```

### Unique Users per Ad, per Day

For each row, `theta_sketch_get_estimate` extracts the approximate distinct-user count from the stored sketch:

```sql
SELECT date, campaign_id, ad_id,
       theta_sketch_get_estimate(unique_users) AS unique_users
FROM user_engagement
WHERE campaign_id = 1
ORDER BY date, ad_id;
```

The original sample data yields results such as:

```sql
+----------+-----------+-----+------------+
| date     |campaign_id|ad_id|unique_users|
+----------+-----------+-----+------------+
|2023-05-17|          1|    1|         889|
|2023-05-17|          1|    2|          52|
|2023-05-17|          1|    3|          36|
|2023-05-17|          1|    4|          38|
+----------+-----------+-----+------------+
```

Those values are estimates from the sketches. At small cardinalities, a Theta sketch may still be in exact mode; as
cardinality grows beyond its configured capacity, sampling introduces estimation error.

### Top Two Ads by Daily Engagement

Once the estimate is extracted, it's an ordinary number, so any SQL works on top of it. For example, a window function
can find the two ads with the highest estimated reach each day:

```sql
WITH engagement AS (
  SELECT date, ad_id,
         theta_sketch_get_estimate(unique_users) AS estimated_users
  FROM user_engagement
  WHERE campaign_id = 1
), ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY date
           ORDER BY estimated_users DESC
         ) AS position
  FROM engagement
)
SELECT date, ad_id, estimated_users
FROM ranked
WHERE position <= 2
ORDER BY date, position;
```

The rankings are based on approximate rather than exact user counts, so closely ranked ads may swap positions within the
sketch's error range.

### Daily Engagement Across the Entire Campaign

We no longer need the ad-level dimension, but we can't simply sum the per-ad unique-user estimates. Instead, we merge
the sketches first. Here are both calculations side by side:

```sql
SELECT date, campaign_id,
       SUM(theta_sketch_get_estimate(unique_users)) AS sum_of_ads,
       theta_sketch_get_estimate(
         theta_sketch_merge(unique_users)
       ) AS unique_users
FROM user_engagement
WHERE campaign_id = 1
GROUP BY date, campaign_id
ORDER BY date;
```

```sql
+----------+-----------+----------+------------+
| date     |campaign_id|sum_of_ads|unique_users|
+----------+-----------+----------+------------+
|2023-05-17|          1|      3112|        2397|
|2023-05-18|          1|      5386|        4070|
|2023-05-19|          1|      4623|        3479|
+----------+-----------+----------+------------+
```

`sum_of_ads` counts a user once for every ad they clicked. `unique_users` counts each user once per campaign. The gap
between the two columns is the overlap, which the merged sketches account for without touching the raw clickstream.

We can also drop the date dimension to estimate reach over a longer period:

```sql
SELECT campaign_id,
       theta_sketch_get_estimate(
         theta_sketch_merge(unique_users)
       ) AS unique_users
FROM user_engagement
WHERE campaign_id = 1
  AND date BETWEEN '2023-05-17' AND '2023-05-19'
GROUP BY campaign_id;
```

This answers a new question from the historical aggregates alone, without reading the original click events.

If you maintain cumulative month-to-date or all-time summary tables, your daily job can merge yesterday's cumulative
sketch with today's new daily sketch, which keeps daily processing cost flat regardless of how much history you
accumulate.

## Theta vs. HyperLogLog

The examples above use Theta sketches. `spark-sketches` also supports HyperLogLog (HLL), and the choice comes down to
which questions you need to answer later.

If you only need counts and rollups, use HLL. It's built for cardinality estimation and unions, and it's much smaller
than a Theta sketch of comparable accuracy. For "unique users per campaign, per week", it's usually the most
storage-efficient option.

If you need to compare audiences, use Theta. It's larger than HLL, often by roughly an order of magnitude at typical
settings. In exchange, it supports intersection (`A ∩ B`) and difference (`A \ B`), not just union. In our pipeline,
storing Theta sketches for both impressions and clicks lets you ask:

* Who saw an ad but never clicked? (`Impressions \ Clicks`)
* Who engaged with both Campaign A and Campaign B? (`Campaign A ∩ Campaign B`)

All of that comes from the pre-aggregated table, without going back to the raw events.

## Running This on Modern Spark

The pattern is the same on Spark 4.1+, with different function names:

| spark-sketches | Spark 4.1+ |
| --- | --- |
| `theta_sketch_build` | `theta_sketch_agg` |
| `theta_sketch_merge` | `theta_union_agg` |
| `theta_sketch_get_estimate` | `theta_sketch_estimate` |

Don't assume sketches written by one implementation can be read by the other. Check format compatibility before mixing
them.

## Final Thoughts

Distinct counts stop being a dead end once we store sketches instead of numbers. The daily job barely changes: one
function swap in the query and a binary column in Parquet. In return, the same historical table can answer per-ad,
per-campaign and per-week questions, and with Theta sketches it can also answer intersection and difference questions,
all without reading the raw events again.

The price is a small, bounded approximation error, and sketches that take more space than a plain integer. For reach and
engagement reporting, that is usually a good trade.
  