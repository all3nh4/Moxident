// src/search-volume-updater.mjs
// Lambda: moxident-search-volume-updater
// Trigger: EventBridge cron(0 6 ? * MON *) — every Sunday 10pm Pacific
// Writes population-proportional search volume estimates from cities.mjs
// to the moxident-search-volume DynamoDB table.

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CITIES } from "./cities.mjs";

const db = new DynamoDBClient({ region: "us-east-2" });

const TABLE_NAME = "moxident-search-volume";

function log(fields) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), function: "search-volume-updater", ...fields }));
}

async function writeToDynamo(entry) {
  await db.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      zipCode:         { S: entry.primaryZip },
      city:            { S: entry.city },
      monthlySearches: { N: String(entry.monthlySearchEstimate) },
      adjacentZips:    { SS: entry.adjacentZips },
      lastUpdated:     { S: new Date().toISOString() },
    },
  }));
}

export const handler = async (event) => {
  log({ status: "started", totalCities: CITIES.length });

  let successCount = 0;
  let failureCount = 0;

  for (const entry of CITIES) {
    try {
      await writeToDynamo(entry);

      log({
        status: "success",
        zip: entry.primaryZip,
        city: entry.city,
        monthlySearches: entry.monthlySearchEstimate,
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

  log({ status: "completed", successCount, failureCount });

  return { statusCode: 200, body: JSON.stringify({ successCount, failureCount }) };
};
