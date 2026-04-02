// src/db.mjs
import { DynamoDBClient, PutItemCommand, GetItemCommand,
         ScanCommand, UpdateItemCommand, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { BY_ZIP, CITIES } from "./cities.mjs";

const db = new DynamoDBClient({ region: "us-east-2" });

export async function savePatient({ name, phone, zip, symptom }) {
  const requestId = randomUUID();
  await db.send(new PutItemCommand({
    TableName: "moxident-patients",
    Item: {
      requestId: { S: requestId },
      name:      { S: name },
      phone:     { S: phone },
      zip:       { S: zip },
      symptom:   { S: symptom },
      status:    { S: "pending" },
      createdAt: { S: new Date().toISOString() },
      dentistId: { S: "" },
    },
  }));
  return requestId;
}

export async function findDentistsByZip(zip) {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-dentists",
    FilterExpression: "active = :a AND contains(zipCodes, :z)",
    ExpressionAttributeValues: {
      ":a": { BOOL: true },
      ":z": { S: zip },
    },
  }));
  return result.Items || [];
}

export async function updatePatientStatus(requestId, status, extra = {}) {
  const exprParts = ["#s = :s"];
  const names  = { "#s": "status" };
  const values = { ":s": { S: status } };

  for (const [k, v] of Object.entries(extra)) {
    exprParts.push(`${k} = :${k}`);
    values[`:${k}`] = { S: v };
  }

  await db.send(new UpdateItemCommand({
    TableName: "moxident-patients",
    Key: { requestId: { S: requestId } },
    UpdateExpression: "SET " + exprParts.join(", "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function findOpenRequestByDentist(dentistId) {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-patients",
    FilterExpression: "#s = :s AND dentistId = :d",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: {
      ":s": { S: "offered" },
      ":d": { S: dentistId },
    },
  }));
  return result.Items?.[0] || null;
}

export async function findDentistByPhone(phone) {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-dentists",
    FilterExpression: "phone = :p",
    ExpressionAttributeValues: { ":p": { S: phone } },
  }));
  return result.Items?.[0] || null;
}

export async function saveDentistApplication(data) {
  const applicationId = randomUUID();
  await db.send(new PutItemCommand({
    TableName: "moxident-dentist-applications",
    Item: {
      // ── Key ──────────────────────────────────────────────────────
      applicationId:          { S: applicationId },

      // ── Legacy survey fields (kept for backwards compatibility) ──
      availability:           { S: JSON.stringify(data.availability || {}) },
      openSlots:              { S: data.openSlots      || "" },
      procedures:             { S: JSON.stringify(data.procedures || []) },
      staffRequired:          { S: data.staffRequired  || "" },
      responseTime:           { S: data.responseTime   || "" },
      contactMethod:          { S: data.contactMethod  || "" },
      payment:                { S: data.payment        || "" },
      area:                   { S: data.area           || "" },
      overflow:               { S: data.overflow       || "" },
      willingToPay:           { S: data.willingToPay   || "" },
      concerns:               { S: data.concerns       || "" },

      // ── New onboarding fields ─────────────────────────────────────
      name:                   { S: data.name                   || "" },
      practiceName:           { S: data.practiceName           || "" },
      phone:                  { S: data.phone                  || "" },
      email:                  { S: data.email                  || "" },
      zipCodes:               { S: data.zipCodes               || "" },
      practiceArea:           { S: data.practiceArea           || "" },
      dailyCapacity:          { S: data.dailyCapacity          || "" },
      extendedHours:          { S: data.extendedHours          || "" },
      notificationPreference: { S: data.notificationPreference || "" },
      acceptsUninsured:       { S: data.acceptsUninsured       || "" },
      caseTypes:              { S: data.caseTypes              || "" },
      insuranceAccepted:      { S: data.insuranceAccepted      || "" },
      notes:                  { S: data.notes                  || "" },
      status:                 { S: "pending" },
      source:                 { S: data.source                 || "dentist-join-page" },

      // ── Timestamp ─────────────────────────────────────────────────
      submittedAt:            { S: new Date().toISOString() },
    },
  }));
  return applicationId;
}

export async function getDentistApplications() {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-dentist-applications",
  }));
  return result.Items || [];
}

export async function saveLead(data) {
  const leadId = randomUUID();
  const now = new Date().toISOString();
  await db.send(new PutItemCommand({
    TableName: "moxident-leads",
    Item: {
      leadId:       { S: leadId },
      practiceName: { S: data.practiceName || "" },
      dentistName:  { S: data.dentistName  || "" },
      phone:        { S: data.phone        || "" },
      email:        { S: data.email        || "" },
      zip:          { S: data.zip          || "" },
      callOutcome:  { S: data.callOutcome  || "" },
      notes:        { S: data.notes        || "" },
      followUpDate: { S: data.followUpDate || "" },
      source:       { S: data.source       || "sdr-call" },
      status:       { S: data.status       || "new" },
      createdBy:    { S: data.createdBy    || "" },
      createdAt:    { S: now },
      updatedAt:    { S: now },
    },
  }));
  return leadId;
}

export async function saveWaitlist(data) {
  const leadId = randomUUID();
  await db.send(new PutItemCommand({
    TableName: "moxident-leads",
    Item: {
      leadId:        { S: leadId },
      email:         { S: data.email         || "" },
      zip:           { S: data.zip           || "" },
      preferredTime: { S: data.preferredTime || "asap" },
      source:        { S: "waitlist" },
      status:        { S: "new" },
      submittedAt:   { S: new Date().toISOString() },
    },
  }));
  return leadId;
}

export async function getLeads() {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-leads",
  }));
  return result.Items || [];
}

export async function getSearchVolume(zipCode) {
  // Look up primary zip
  const result = await db.send(new GetItemCommand({
    TableName: "moxident-search-volume",
    Key: { zipCode: { S: zipCode } },
  }));

  const item = result.Item;
  const monthlySearches = item ? Number(item.monthlySearches?.N || "0") : 0;
  const city = item?.city?.S || null;

  if (monthlySearches > 0) {
    return { monthlySearches, city, isAggregated: false };
  }

  // Find adjacent zips for this zip code
  const cityEntry = BY_ZIP.get(zipCode)
    || CITIES.find(c => c.adjacentZips.includes(zipCode));

  if (!cityEntry || !cityEntry.adjacentZips.length) {
    return { monthlySearches: null, city: cityEntry?.city || city, isAggregated: false };
  }

  // Batch-get adjacent zips
  const keys = cityEntry.adjacentZips.map(z => ({ zipCode: { S: z } }));
  const batchResult = await db.send(new BatchGetItemCommand({
    RequestItems: {
      "moxident-search-volume": { Keys: keys },
    },
  }));

  const adjacentItems = batchResult.Responses?.["moxident-search-volume"] || [];
  const total = adjacentItems.reduce((sum, i) => sum + Number(i.monthlySearches?.N || "0"), 0);

  if (total > 0) {
    return { monthlySearches: total, city: cityEntry.city, isAggregated: true };
  }

  return { monthlySearches: null, city: cityEntry.city, isAggregated: false };
}

export async function updateLead(leadId, data) {
  const now = new Date().toISOString();
  const exprParts = ["updatedAt = :u"];
  const values = { ":u": { S: now } };
  const names = {};
  const fields = ["practiceName","dentistName","phone","email","zip",
                  "callOutcome","notes","followUpDate","status","createdBy"];
  fields.forEach(f => {
    if (data[f] !== undefined) {
      exprParts.push(`#${f} = :${f}`);
      values[`:${f}`] = { S: data[f] };
      names[`#${f}`] = f;
    }
  });
  await db.send(new UpdateItemCommand({
    TableName: "moxident-leads",
    Key: { leadId: { S: leadId } },
    UpdateExpression: "SET " + exprParts.join(", "),
    ExpressionAttributeValues: values,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
  }));
}
export async function approveDentistApplication(applicationId) {
  const result = await db.send(new GetItemCommand({
    TableName: "moxident-dentist-applications",
    Key: { applicationId: { S: applicationId } },
  }));

  if (!result.Item) throw new Error("Application not found");

  const item = result.Item;

  const dentistId = `dentist-${randomUUID()}`;
  await db.send(new PutItemCommand({
    TableName: "moxident-dentists",
    Item: {
      dentistId:              { S: dentistId },
      name:                   { S: item.name?.S || "" },
      practiceName:           { S: item.practiceName?.S || "" },
      phone:                  { S: item.phone?.S || "" },
      email:                  { S: item.email?.S || "" },
      zipCodes:               { S: item.zipCodes?.S || "" },
      practiceArea:           { S: item.practiceArea?.S || "" },
      dailyCapacity:          { S: item.dailyCapacity?.S || "" },
      extendedHours:          { S: item.extendedHours?.S || "" },
      notificationPreference: { S: item.notificationPreference?.S || "" },
      caseTypes:              { S: item.caseTypes?.S || "" },
      insuranceAccepted:      { S: item.insuranceAccepted?.S || "" },
      notes:                  { S: item.notes?.S || "" },
      active:                 { BOOL: true },
      approvedAt:             { S: new Date().toISOString() },
    },
  }));

  await db.send(new UpdateItemCommand({
    TableName: "moxident-dentist-applications",
    Key: { applicationId: { S: applicationId } },
    UpdateExpression: "SET #s = :s",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": { S: "approved" } },
  }));

  return {
    practiceName: item.practiceName?.S || "",
    email:        item.email?.S || "",
    name:         item.name?.S || "",
    phone:        item.phone?.S || "",
  };
}
