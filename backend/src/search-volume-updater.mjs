// src/search-volume-updater.mjs
// Lambda: moxident-search-volume-updater
// Trigger: EventBridge cron(0 6 ? * MON *) — every Sunday 10pm Pacific
// Fetches monthly search volume for metro-level keywords from DataForSEO,
// then distributes results to all cities in each metro group.

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CITIES } from "./cities.mjs";

const db = new DynamoDBClient({ region: "us-east-2" });
const cw = new CloudWatchClient({ region: "us-east-2" });

const TABLE_NAME = "moxident-search-volume";
const METRIC_NAMESPACE = "Moxident/SearchVolume";

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

// Metro keywords → city slugs they cover.
// If a city appears in multiple metros, it gets the highest volume.
const METRO_KEYWORDS = [
  {
    keyword: "emergency dentist Seattle",
    slugs: ["kirkland", "bellevue", "redmond", "kenmore", "shoreline",
            "mercer-island", "burien", "tukwila", "seatac", "des-moines",
            "renton", "federal-way", "auburn", "kent"],
  },
  {
    keyword: "emergency dentist Bellevue",
    slugs: ["bellevue", "bellevue-east", "issaquah", "sammamish", "redmond"],
  },
  {
    keyword: "emergency dentist Everett",
    slugs: ["everett", "marysville", "mukilteo", "mill-creek", "snohomish", "monroe"],
  },
  {
    keyword: "emergency dentist Bothell",
    slugs: ["bothell", "woodinville", "kenmore", "lynnwood",
            "mountlake-terrace", "edmonds"],
  },
  {
    keyword: "emergency dentist Maple Valley",
    slugs: ["maple-valley", "covington", "kent", "auburn"],
  },
];

function log(fields) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), function: "search-volume-updater", ...fields }));
}

async function emitMetric(name, value) {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: METRIC_NAMESPACE,
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: "Count",
        Timestamp: new Date(),
      }],
    }));
  } catch (err) {
    log({ status: "metric_error", metric: name, error: err.message });
  }
}

async function fetchSearchVolume(keyword) {
  const auth = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64");

  // TODO: Verify DataForSEO v3 response shape — the field path
  // result.tasks[0].result[0].search_volume
  // may differ. Check https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
  const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{
      keywords: [keyword],
      location_code: 2840, // United States
      language_code: "en",
    }]),
  });

  if (!res.ok) {
    throw new Error(`DataForSEO HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  // TODO: Confirm exact response structure matches this path
  const task = data.tasks?.[0];
  if (task?.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || "unknown"}`);
  }

  const searchVolume = task.result?.[0]?.search_volume ?? 0;
  return searchVolume;
}

async function writeToDynamo(entry, monthlySearches) {
  await db.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      zipCode:         { S: entry.primaryZip },
      city:            { S: entry.city },
      monthlySearches: { N: String(monthlySearches) },
      adjacentZips:    { SS: entry.adjacentZips },
      lastUpdated:     { S: new Date().toISOString() },
    },
  }));
}

export const handler = async (event) => {
  log({ status: "started", totalMetros: METRO_KEYWORDS.length, totalCities: CITIES.length });

  // Step 1: Fetch volume for each metro keyword (only 5 API calls)
  const slugToVolume = new Map();
  let metroFailures = 0;

  for (const metro of METRO_KEYWORDS) {
    try {
      const volume = await fetchSearchVolume(metro.keyword);

      log({ status: "metro_success", keyword: metro.keyword, monthlySearches: volume });

      for (const slug of metro.slugs) {
        const current = slugToVolume.get(slug) || 0;
        if (volume > current) {
          slugToVolume.set(slug, volume);
        }
      }
    } catch (err) {
      metroFailures++;
      log({ status: "metro_error", keyword: metro.keyword, error: err.message });
    }
  }

  // Step 2: Write results to DynamoDB for all 30 cities
  let successCount = 0;
  let failureCount = 0;

  for (const entry of CITIES) {
    try {
      const monthlySearches = slugToVolume.get(entry.slug) || 0;

      await writeToDynamo(entry, monthlySearches);

      log({
        status: "success",
        zip: entry.primaryZip,
        city: entry.city,
        monthlySearches,
      });

      successCount++;
    } catch (err) {
      failureCount++;
      log({
        status: "error",
        zip: entry.primaryZip,
        city: entry.city,
        error: err.message,
      });
    }
  }

  const totalFailures = metroFailures + failureCount;

  await emitMetric("CitiesUpdated", successCount);
  await emitMetric("SearchVolumeUpdateSuccess", totalFailures === 0 ? 1 : 0);
  await emitMetric("SearchVolumeUpdateFailure", totalFailures);

  log({ status: "completed", successCount, failureCount, metroFailures });

  return { statusCode: 200, body: JSON.stringify({ successCount, failureCount, metroFailures }) };
};
