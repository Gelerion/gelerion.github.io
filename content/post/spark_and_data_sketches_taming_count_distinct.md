---
title: "Spark and Data Sketches: Taming count-distinct"
date: 2023-07-09T19:00:53+03:00
author: "Gelerion"
---

Distinct counting is a commonly used metric in trend analysis to measure popularity or performance. Although it may seem like a simple problem, the challenge quickly grows as the amount of data grows. Counting the exact number of distinct values can consume a significant amount of resources while taking a long time even when using a parallelized processing engine. To address this challenge, you can use probabilistic algorithms

## Probabilistic algorithms
Probabilistic algorithms, such as [Data Sketches](https://datasketches.apache.org/), can be an excellent solution if the results can tolerate slight inaccuracies (with mathematically proven error bounds). Data Sketches is a collection of specialized algorithms known as streaming algorithms, or sketches. They suitable for both real-time and batch processing and has been specifically designed for production systems that must process massive data. 

A sketch is a construct that contains information about the distinct values in a dataset and has a fixed memory consumption. One of the most appealing aspects of sketches is that they can be merged and support set operators such as Union, Intersection, and Difference. This allows you to:

- Incrementally update historical data by merging sketches with newly added data without needing to recalculate it with the raw data.
- For interactive analysis, you can apply a dynamic filter or group by to further aggregate the sketch and quickly obtain approximate counts.

For count-distinct purposes, there are two families of sketches: Theta Sketch and HyperLogLog Sketch.

## Practical example: Online advertising campaign analysis
In the digital advertising industry, understanding the effectiveness of online campaigns and accurately measuring unique user engagement is crucial for optimizing marketing strategies. 

Let's consider a scenario where a digital advertising agency is running multiple ad campaigns across various platforms and wants to assess the reach and engagement of each campaign. The agency collects data that includes user interactions with ads, such as ad impressions and clicks. 

> 💡 **Note:** In the context of online advertising, an impression refers to the display of an ad to a user on a website or app.

As a data engineer, you have been requested to calculate the following:

1. Evaluating audience reach: By identifying the unique users who interacted with the ads, the agency can measure the audience reach and estimate the campaign's potential impact.
2. Evaluating user engagement: By calculating the count of distinct users who clicked on the ads, the agency can analyze the effectiveness of the campaign in terms of user engagement.

These metrics should be aggregated daily to provide trend reports and insights into the effectiveness of the campaigns over time.

> 💡 **Note:** You can find the code here: [advertising-campaign-analysis](https://github.com/Gelerion/advertising-campaign-analysis)
  
## Building histroical layer

#### Input
Impressions and clicks events are continuously generated, streamed in real-time, and stored on Amazon S3. Events are bucketed by date in the `yyyy-mm-dd` format. To simplify the process, impressions and clicks are unified into a single stream. 

```
s3/
├─ streaming_event_data/
   ├─ ...
   ├─ date=2023-05-17
   └─ date=2023-05-18

```

#### Schema

| Column Name | Data Type | Description                                                |
|-------------|-----------|------------------------------------------------------------|
| ad_id       | String    | Unique identifier for each ad                              |
| user_id     | String    | Unique identifier for each user                            |
| campaign_id | String    | Unique identifier for each campaign                        |
| click_id    | String    | Unique identifier for each ad click (nullable)             |
| timestamp   | Timestamp | Timestamp indicating when the impression or click occurred |

> 💡 **Note:** Any event with a null value in `click_id` will be counted as an impression event

> 💡 **Note:** You can find the data example here: [streaming_event_data](https://github.com/Gelerion/advertising-campaign-analysis/tree/main/data/streaming_event_data)
  

### ETL: The naive way
A daily batch job runs once every 24 hours to calculate daily aggregates from the streaming event data. This job loads the entire history of raw data and recomputes the reports every day.
&nbsp;  
&nbsp;  
Here are the steps to perform:
1. Read the complete history of streaming event data

```scala
val adEvents = spark.read
      .option("basePath", "data/streaming_event_data")
      .json("data/streaming_event_data/date=*")

adEvents.createOrReplaceTempView("ad_events")
/*
+-----+-----------+--------+----------+-------+----------+
|ad_id|campaign_id|click_id| timestamp|user_id|      date|
+-----+-----------+--------+----------+-------+----------+
|    1|         10|       1|1684366732|    939|2023-05-18|
|   40|         10|       1|1684363771|      1|2023-05-18|
|   35|         10|       1|1684374985|      1|2023-05-18|
|   40|          8|   59030|1684416924|      1|2023-05-18|
+-----+-----------+--------+----------+-------+----------+
*/
```

2. Compute the aggregates for user engagement

```sql
SELECT date, campaign_id, ad_id, count(distinct user_id) AS unique_users
FROM ad_events
WHERE click_id IS NOT NULL
GROUP BY date, campaign_id, ad_id
```

3. Load the data into the data lake

```scala
userEngagement
  .write
  .partitionBy("date")
  .parquet("data/historical_data/user_engagement")
```

> 💡 **Note:** For brevity, we will omit the audience reach report. The complete example can be found here: [CampaignAnalysisNaiveStrategy](https://github.com/Gelerion/advertising-campaign-analysis/blob/main/src/main/scala/com/gelerion/advertising/campaign/analysis/CampaignAnalysisNaiveStrategy.scala)

#### Drawbacks
Although the ETL is very straightforward, it comes with a couple of drawbacks.  
A major one is that count-distinct metrics are not cumulative. As a result, the entire history of raw data has to be loaded, combined and aggregated daily. Moreover, it is necessary to know beforehand the specific reports needed as grouping queries cannot be applied to pre-aggregated unique data. Finally, determining the exact count of distinct values can be a time-consuming and resource-intensive process.

### ETL: Leveraging data-sketches
To begin, include the Data Sketches library in your dependency management build:

```scala
<dependency>
   <groupId>com.gelerion.spark.sketches</groupId>
   <artifactId>spark-sketches</artifactId>
   <version>1.0.0</version>
</dependency>
```

> 💡 **Note:** You can find the source and the Spark versions compatibility matrix here: [spark-sketches](https://github.com/Gelerion/spark-sketches)

To use new functions in SQL queries, you will also have to register them. This only needs to be done once.

```scala
import org.apache.spark.sql.registrar.SketchFunctionsRegistrar
SketchFunctionsRegistrar.registerFunctions(spark)
```
  
Sketches enable incremental updates to historical data by merging them with newly added data, without the need to recalculate the entire history. Moreover, since sketches support set operators, we can further aggregate them by applying dynamic filters and/or grouping by different dimensions, to quickly obtain approximate counts.
&nbsp;  
&nbsp;  
Here are the steps to perform:
1. Read **one day** of streaming event data

```scala
val adEvents = spark.read
      .option("basePath", "data/streaming_event_data")
      .json("data/streaming_event_data/date=2023-05-20")

adEvents.createOrReplaceTempView("ad_events")
```

2. Compute the aggregates for user engagement 

```sql
SELECT date, campaign_id, ad_id, theta_sketch_build(user_id) AS unique_users
FROM ad_events
WHERE click_id IS NOT NULL
GROUP BY date, campaign_id, ad_id
```

Here is where the magic happens: instead of performing a `count distinct` calculation, you can use the `theta_sketch_build` function to generate a Theta Sketch. Sketches have a fixed size and are stored in binary format. Alternatively, you can use the `hll_sketch_build` function if you prefer to use an HLL sketch.
&nbsp;  
&nbsp;  

3. Load one day of aggregated data into the data lake

```scala
userEngagement
  .write
  .partitionBy("date")
  .parquet("data/historical_data/user_engagement")
```

As simple as that!

> 💡 **Note:** The complete example can be found here: [CampaignAnalysisSketchesStrategy](https://github.com/Gelerion/advertising-campaign-analysis/blob/main/src/main/scala/com/gelerion/advertising/campaign/analysis/CampaignAnalysisSketchesStrategy.scala)

## Exploring historical data
Data lake layout:

```
s3/
└─ historical_data/
	└─ user_engagement/
	    ├─ ...
	    ├─ date=2023-05-17
	    └─ date=2023-05-18
				└─ data_part_1.parquet
				└─ data_part_2.parquet
				└─ ...
```

As you can see the historical data is in the Parquet format, bucketed by date, and split into partitions. This allows queries to scan only a specific range of data when filtering by dates.

> 💡 **Tip:** When loading data into a data lake, consider ordering it by the most frequently used dimensions in queries. This can improve scan efficiency even further.

Let's review the aggregated schema:

```scala
DESC user_engagement_historical;

+------------+-----------+-------+
|col_name    |data_type  |comment|
+------------+-----------+-------+
|campaign_id |bigint     |null   |
|ad_id       |bigint     |null   |
|unique_users|thetasketch|null   |
|date        |date       |null   |
+------------+-----------+-------+
```

Upon reviewing the files, an interesting detail comes to light: the `unique_users` column is of a new type called `thetasketch`. It is is an alias for the built-in binary type and provides runtime safety, preventing the merging of sketches of different types.

## Building dashboards: User Engagement

Now that you have the ETL process up and running, let's move on to addressing the business requirements: analyzing the effectiveness of the campaign in terms of user engagement. 

> 💡 **Note:** To provide greater flexibility for businesses to gain insights, it is important to keep historical data as detailed as possible. We have aggregated reports that include date, campaign id, and even ad id.

> 💡 **Note:** The example is based on mock, auto-generated data.

> 💡 **Note:** Please find the complete example here: [advertising-campaign-analysis](https://github.com/Gelerion/advertising-campaign-analysis/blob/main/src/main/scala/com/gelerion/advertising/campaign/analysis/reports/UserEngagementReport.scala)

### The user engagement for each ad per day
Let's start with something simple and create a report that doesn't require grouping the data. This report demonstrates you how to leverage the `theta_sketch_get_estimate` function to retrieve actual values from the sketch.

```sql
SELECT date, campaign_id, ad_id, theta_sketch_get_estimate(unique_users) as unique_users
FROM user_engagement
WHERE campaign_id = $campaignIdToAnalyze
ORDER BY date, ad_id, unique_users DESC
```

Output:

```
+----------+-----------+-----+------------+
|      date|campaign_id|ad_id|unique_users|
+----------+-----------+-----+------------+
|2023-05-17|          1|    1|         889|
|2023-05-17|          1|    2|          52|
|2023-05-17|          1|    3|          36|
|2023-05-17|          1|    4|          38|
+----------+-----------+-----+------------+ 
```

### Top two ads with the highest user engagement per day

Let's take it up a notch and choose the two most successful ads per day. This report demonstrates how you can use theta sketch functions for advanced analytics with window functions.

```sql
WITH ordered_user_engagement as (
  SELECT date, campaign_id, ad_id, theta_sketch_get_estimate(unique_users) as unique_users,
         RANK() OVER (PARTITION BY date ORDER BY theta_sketch_get_estimate(unique_users) DESC) as topN
  FROM user_engagement
  WHERE campaign_id = $campaignIdToAnalyze
)
SELECT date, campaign_id, ad_id, unique_users
FROM ordered_user_engagement
WHERE topN <= 2
ORDER BY date, ad_id, unique_users DESC
```

Output:

```
+----------+-----------+-----+------------+
|      date|campaign_id|ad_id|unique_users|
+----------+-----------+-----+------------+
|2023-05-17|          1|    1|         889|
|2023-05-17|          1|   40|         473|
|2023-05-18|          1|    1|        1683|
|2023-05-18|          1|   40|         890|
|2023-05-19|          1|    1|        1336|
|2023-05-19|          1|   40|         772|
+----------+-----------+-----+------------+
```

### The daily trend for user engagement per campaign
Sketches are particularly useful when you need to group values while dropping dimensions. Summing distinct values over aggregated data is not possible, but it is certainly achievable with sketches. This report shows you how to use the `theta_sketch_merge` function to merge sketches.

```sql
SELECT date, campaign_id, theta_sketch_get_estimate(theta_sketch_merge(unique_users)) as unique_users
FROM user_engagement
WHERE campaign_id = $campaignIdToAnalyze
GROUP BY date, campaign_id
ORDER BY date, unique_users DESC
```

Output:

```
+----------+-----------+------------+
|      date|campaign_id|unique_users|
+----------+-----------+------------+
|2023-05-17|          1|        2397|
|2023-05-18|          1|        4070|
|2023-05-19|          1|        3479|
+----------+-----------+------------+
```

## Conclusion
In this article, you have learned how to create an efficient ETL process that tackles the difficulties of generating count-distinct reports over massive data. Additionally, you have seen an example of merging raw and historical data without the need to re-aggregate it and efficiently responding to count-distinct queries on the aggregated data.

As you can see, Data Sketches can be a powerful tool in your arsenal, and the [spark-sketches](https://github.com/Gelerion/spark-sketches) library helps you to seamlessly integrate them into Spark workflows.

### Stay tuned
In the second part, you will learn how to stream aggregated data to Druid for interactive analysis in near real time. 
  