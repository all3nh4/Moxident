// src/db.mjs
import { DynamoDBClient, PutItemCommand, GetItemCommand,
         ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";

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
      // ── Key ──────────────────────────────────────────
      applicationId:    { S: applicationId },

      // ── Legacy survey fields (kept for backwards compatibility) ──
      availability:     { S: JSON.stringify(data.availability || {}) },
      openSlots:        { S: data.openSlots     || "" },
      procedures:       { S: JSON.stringify(data.procedures || []) },
      staffRequired:    { S: data.staffRequired || "" },
      responseTime:     { S: data.responseTime  || "" },
      contactMethod:    { S: data.contactMethod || "" },
      payment:          { S: data.payment       || "" },
      area:             { S: data.area          || "" },
      overflow:         { S: data.overflow      || "" },
      willingToPay:     { S: data.willingToPay  || "" },
      concerns:         { S: data.concerns      || "" },

      // ── New onboarding fields ─────────────────────────
      name:             { S: data.name             || "" },
      practiceName:     { S: data.practiceName     || "" },
      phone:            { S: data.phone            || "" },
      email:            { S: data.email            || "" },
      zipCodes:         { S: data.zipCodes         || "" },
      dailyCapacity:    { S: data.dailyCapacity    || "" },
      insuranceAccepted:{ S: data.insuranceAccepted|| "" },
      yearsInPractice:  { S: data.yearsInPractice  || "" },
      acceptsUninsured: { S: data.acceptsUninsured || "" },
      extendedHours:    { S: data.extendedHours    || "" },
      specialties:      { S: data.specialties      || "" },
      status:           { S: "pending" },
      source:           { S: data.source           || "dentist-join-page" },

      // ── Timestamp ────────────────────────────────────
      submittedAt:      { S: new Date().toISOString() },
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

export async function getLeads() {
  const result = await db.send(new ScanCommand({
    TableName: "moxident-leads",
  }));
  return result.Items || [];
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
