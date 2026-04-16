// src/portal-db.mjs
import { DynamoDBClient, PutItemCommand, GetItemCommand,
         UpdateItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";

const db = new DynamoDBClient({ region: "us-east-2" });
const PORTAL_TABLE = "moxident-dentist-portal";
const DENTISTS_TABLE = "moxident-dentists";
const PATIENTS_TABLE = "moxident-patients";

export async function createPortalAccount(email, verificationToken) {
  await db.send(new PutItemCommand({
    TableName: PORTAL_TABLE,
    Item: {
      email:             { S: email },
      dentistId:         { S: "" },
      passwordHash:      { S: "" },
      verified:          { BOOL: false },
      verificationToken: { S: verificationToken },
      resetToken:        { S: "" },
      resetTokenExpiry:  { S: "" },
      createdAt:         { S: new Date().toISOString() },
      lastLogin:         { S: "" },
    },
  }));
}

export async function getPortalAccount(email) {
  const result = await db.send(new GetItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
  }));
  return result.Item || null;
}

export async function verifyPortalAccount(email) {
  console.log("verifyPortalAccount email:", email);
  await db.send(new UpdateItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: "SET verified = :v REMOVE verificationToken",
    ExpressionAttributeValues: {
      ":v": { BOOL: true },
    },
  }));
}

export async function setPortalPassword(email, passwordHash, dentistId) {
  await db.send(new UpdateItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: "SET passwordHash = :p, dentistId = :d",
    ExpressionAttributeValues: {
      ":p": { S: passwordHash },
      ":d": { S: dentistId },
    },
  }));
}

export async function updateLastLogin(email) {
  await db.send(new UpdateItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: "SET lastLogin = :t",
    ExpressionAttributeValues: {
      ":t": { S: new Date().toISOString() },
    },
  }));
}

export async function setResetToken(email, resetToken) {
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await db.send(new UpdateItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: "SET resetToken = :t, resetTokenExpiry = :e",
    ExpressionAttributeValues: {
      ":t": { S: resetToken },
      ":e": { S: expiry },
    },
  }));
}

export async function clearResetToken(email) {
  await db.send(new UpdateItemCommand({
    TableName: PORTAL_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: "SET resetToken = :t, resetTokenExpiry = :e",
    ExpressionAttributeValues: {
      ":t": { S: "" },
      ":e": { S: "" },
    },
  }));
}

export async function getDentistByEmail(email) {
  const result = await db.send(new ScanCommand({
    TableName: DENTISTS_TABLE,
    FilterExpression: "email = :e",
    ExpressionAttributeValues: { ":e": { S: email } },
  }));
  return result.Items?.[0] || null;
}

export async function saveAvailability(dentistId, availability) {
  await db.send(new UpdateItemCommand({
    TableName: DENTISTS_TABLE,
    Key: { dentistId: { S: dentistId } },
    UpdateExpression: "SET availability = :a",
    ExpressionAttributeValues: {
      ":a": { S: JSON.stringify(availability) },
    },
  }));
}

export async function getAvailability(dentistId) {
  const result = await db.send(new GetItemCommand({
    TableName: DENTISTS_TABLE,
    Key: { dentistId: { S: dentistId } },
  }));
  const item = result.Item;
  if (!item) return null;
  try {
    return JSON.parse(item.availability?.S || "{}");
  } catch {
    return {};
  }
}

export async function getDentistProfile(dentistId) {
  const result = await db.send(new GetItemCommand({
    TableName: DENTISTS_TABLE,
    Key: { dentistId: { S: dentistId } },
  }));
  return result.Item || null;
}

export async function getRecentRequests(dentistId, limit = 10) {
  const result = await db.send(new ScanCommand({
    TableName: PATIENTS_TABLE,
    FilterExpression: "dentistId = :d",
    ExpressionAttributeValues: { ":d": { S: dentistId } },
  }));
  const items = result.Items || [];
  return items
    .sort((a, b) => new Date(b.createdAt?.S) - new Date(a.createdAt?.S))
    .slice(0, limit)
    .map(i => ({
      name:    i.name?.S || "",
      symptom: i.symptom?.S || "",
      zip:     i.zip?.S || "",
      date:    i.createdAt?.S || "",
      status:  i.status?.S || "",
    }));
}

export async function getDentistStats(dentistId) {
  const result = await db.send(new ScanCommand({
    TableName: PATIENTS_TABLE,
    FilterExpression: "dentistId = :d",
    ExpressionAttributeValues: { ":d": { S: dentistId } },
  }));
  const items = result.Items || [];
  const total = items.length;
  const accepted = items.filter(i => i.status?.S === "matched").length;
  const missed = items.filter(i => i.status?.S === "pending" || i.status?.S === "expired").length;
  const completed = items.filter(i => i.status?.S === "completed").length;

  let totalResponseMs = 0;
  let responseCount = 0;
  items.forEach(i => {
    if (i.offeredAt?.S && i.acceptedAt?.S) {
      totalResponseMs += new Date(i.acceptedAt.S) - new Date(i.offeredAt.S);
      responseCount++;
    }
  });
  const avgResponseTime = responseCount > 0
    ? Math.round(totalResponseMs / responseCount / 60000)
    : 0;

  return {
    requestsReceived: total,
    accepted,
    missed,
    completed,
    avgResponseTime,
    revenueOwed: 0,
  };
}
