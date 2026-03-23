// tests/handler.survey.test.mjs
import { jest, describe, it, beforeEach, expect } from "@jest/globals";

// ── Mock all db functions ──────────────────────────────────────────
jest.unstable_mockModule("../src/db.mjs", () => ({
  savePatient:              jest.fn(),
  findDentistsByZip:        jest.fn(),
  findDentistByPhone:       jest.fn(),
  updatePatientStatus:      jest.fn(),
  findOpenRequestByDentist: jest.fn(),
  saveDentistApplication:   jest.fn(),
  getDentistApplications:   jest.fn(),
  saveLead:                 jest.fn(),
  getLeads:                 jest.fn(),
  updateLead:               jest.fn(),
}));

// ── Mock router ────────────────────────────────────────────────────
jest.unstable_mockModule("../src/router.mjs", () => ({
  submitRequest:      jest.fn(),
  handleDentistReply: jest.fn(),
}));

// ── Mock SES ───────────────────────────────────────────────────────
const mockSend = jest.fn();
jest.unstable_mockModule("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((params) => params),
}));

const { saveDentistApplication, getDentistApplications } = await import("../src/db.mjs");
const { handler } = await import("../src/handler.mjs");

function makeEvent(path, method, body = null) {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    body: body ? JSON.stringify(body) : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({});
});

// ══════════════════════════════════════════════════════════════════
// POST /dentist-survey
// ══════════════════════════════════════════════════════════════════
describe("POST /dentist-survey", () => {
  const surveyPayload = {
    area: "Kirkland",
    openSlots: "2-3",
    responseTime: "within 30 min",
    contactMethod: "SMS",
    willingToPay: "Yes",
    overflow: "Yes",
    staffRequired: "No",
    payment: "per-patient",
    concerns: "None",
    procedures: ["extraction", "root canal"],
    availability: { monday: true, tuesday: false },
  };

  it("returns 200 and applicationId on success", async () => {
    saveDentistApplication.mockResolvedValueOnce("app-001");
    const res = await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.applicationId).toBe("app-001");
  });

  it("calls saveDentistApplication with correct payload", async () => {
    saveDentistApplication.mockResolvedValueOnce("app-002");
    await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(saveDentistApplication).toHaveBeenCalledWith(surveyPayload);
  });

  it("sends SES notification email on success", async () => {
    saveDentistApplication.mockResolvedValueOnce("app-003");
    await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 if SES email fails", async () => {
    saveDentistApplication.mockResolvedValueOnce("app-004");
    mockSend.mockRejectedValueOnce(new Error("SES unavailable"));
    const res = await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it("returns 500 if saveDentistApplication throws", async () => {
    saveDentistApplication.mockRejectedValueOnce(new Error("DynamoDB error"));
    const res = await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe("Something went wrong. Please try again.");
  });

  it("does not send email if db save fails", async () => {
    saveDentistApplication.mockRejectedValueOnce(new Error("DynamoDB error"));
    await handler(makeEvent("/dentist-survey", "POST", surveyPayload));
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /dentist-survey/report
// ══════════════════════════════════════════════════════════════════
describe("GET /dentist-survey/report", () => {
  const mockApplications = [
    {
      applicationId: { S: "app-001" },
      area:          { S: "Kirkland" },
      openSlots:     { S: "2-3" },
      responseTime:  { S: "within 30 min" },
      willingToPay:  { S: "Yes" },
      concerns:      { S: "None" },
      submittedAt:   { S: "2026-03-15T10:00:00.000Z" },
    },
    {
      applicationId: { S: "app-002" },
      area:          { S: "Bellevue" },
      openSlots:     { S: "1" },
      responseTime:  { S: "within 1 hour" },
      willingToPay:  { S: "No" },
      concerns:      { S: "Pricing" },
      submittedAt:   { S: "2026-03-16T10:00:00.000Z" },
    },
    {
      applicationId: { S: "app-003" },
      area:          { S: "Kirkland" },
      openSlots:     { S: "4+" },
      responseTime:  { S: "within 30 min" },
      willingToPay:  { S: "Yes" },
      concerns:      { S: "" },
      submittedAt:   { S: "2026-03-17T10:00:00.000Z" },
    },
  ];

  it("returns 200 with summary and recent submissions", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary).toBeDefined();
    expect(body.recent).toBeDefined();
  });

  it("reports correct total count", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { summary } = JSON.parse(res.body);
    expect(summary.total).toBe(3);
  });

  it("reports correct willingToPay count and percentage", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { summary } = JSON.parse(res.body);
    expect(summary.willingToPay).toBe(2);
    expect(summary.willingToPayPct).toBe(67);
  });

  it("groups submissions correctly by area", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { summary } = JSON.parse(res.body);
    expect(summary.byArea["Kirkland"]).toBe(2);
    expect(summary.byArea["Bellevue"]).toBe(1);
  });

  it("groups submissions correctly by response time", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { summary } = JSON.parse(res.body);
    expect(summary.byResponseTime["within 30 min"]).toBe(2);
    expect(summary.byResponseTime["within 1 hour"]).toBe(1);
  });

  it("returns recent submissions sorted by date descending", async () => {
    getDentistApplications.mockResolvedValueOnce(mockApplications);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { recent } = JSON.parse(res.body);
    expect(recent[0].applicationId).toBe("app-003");
    expect(recent[1].applicationId).toBe("app-002");
    expect(recent[2].applicationId).toBe("app-001");
  });

  it("returns at most 10 recent submissions", async () => {
    const manyApps = Array.from({ length: 15 }, (_, i) => ({
      applicationId: { S: `app-${i}` },
      area:          { S: "Seattle" },
      openSlots:     { S: "1" },
      responseTime:  { S: "within 30 min" },
      willingToPay:  { S: "Yes" },
      concerns:      { S: "" },
      submittedAt:   { S: new Date(Date.now() + i * 1000).toISOString() },
    }));
    getDentistApplications.mockResolvedValueOnce(manyApps);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    const { recent } = JSON.parse(res.body);
    expect(recent.length).toBeLessThanOrEqual(10);
  });

  it("handles empty applications list", async () => {
    getDentistApplications.mockResolvedValueOnce([]);
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    expect(res.statusCode).toBe(200);
    const { summary } = JSON.parse(res.body);
    expect(summary.total).toBe(0);
    expect(summary.willingToPay).toBe(0);
    expect(summary.willingToPayPct).toBe(0);
  });

  it("returns 500 if getDentistApplications throws", async () => {
    getDentistApplications.mockRejectedValueOnce(new Error("DynamoDB error"));
    const res = await handler(makeEvent("/dentist-survey/report", "GET"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe("Failed to generate report");
  });
});
