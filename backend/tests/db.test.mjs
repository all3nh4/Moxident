import { jest, describe, it, beforeEach, expect } from "@jest/globals";

const mockSend = jest.fn();

jest.unstable_mockModule("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient:      jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutItemCommand:      jest.fn().mockImplementation((p) => ({ type: "PutItem", params: p })),
  GetItemCommand:      jest.fn().mockImplementation((p) => ({ type: "GetItem", params: p })),
  UpdateItemCommand:   jest.fn().mockImplementation((p) => ({ type: "UpdateItem", params: p })),
  ScanCommand:         jest.fn().mockImplementation((p) => ({ type: "Scan", params: p })),
  BatchGetItemCommand: jest.fn().mockImplementation((p) => ({ type: "BatchGetItem", params: p })),
}));

jest.unstable_mockModule("crypto", () => ({
  randomUUID: () => "test-uuid-5678"
}));

const {
  savePatient,
  findDentistsByZip,
  findDentistByPhone,
  saveDentistApplication,
  saveWaitlist,
  saveLead,
  getLeads,
} = await import("../src/db.mjs");

// ── savePatient ───────────────────────────────────────────────────────────────

describe("savePatient", () => {
  beforeEach(() => mockSend.mockReset());

  it("saves patient and returns requestId", async () => {
    mockSend.mockResolvedValueOnce({});
    const id = await savePatient({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" });
    expect(id).toBe("test-uuid-5678");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("throws if DynamoDB fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("DB error"));
    await expect(savePatient({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" }))
      .rejects.toThrow("DB error");
  });
});

// ── findDentistsByZip ─────────────────────────────────────────────────────────

describe("findDentistsByZip", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns dentists when found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ dentistId: { S: "d1" } }] });
    const results = await findDentistsByZip("98033");
    expect(results.length).toBe(1);
  });

  it("returns empty array when none found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const results = await findDentistsByZip("99999");
    expect(results).toEqual([]);
  });
});

// ── findDentistByPhone ────────────────────────────────────────────────────────

describe("findDentistByPhone", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns dentist when found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ phone: { S: "+14255551234" } }] });
    const dentist = await findDentistByPhone("+14255551234");
    expect(dentist.phone.S).toBe("+14255551234");
  });

  it("returns null when not found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const dentist = await findDentistByPhone("+10000000000");
    expect(dentist).toBeNull();
  });
});

// ── saveDentistApplication ────────────────────────────────────────────────────

describe("saveDentistApplication", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns an applicationId", async () => {
    mockSend.mockResolvedValueOnce({});
    const id = await saveDentistApplication({ name: "Dr. Jane", phone: "+1", email: "j@j.com" });
    expect(id).toBe("test-uuid-5678");
  });

  it("writes to moxident-dentist-applications table", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({ name: "Dr. Jane", phone: "+1", email: "j@j.com" });
    const call = mockSend.mock.calls[0][0];
    expect(call.params.TableName).toBe("moxident-dentist-applications");
  });

  it("always sets status to pending", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({ name: "Dr. Jane", phone: "+1", email: "j@j.com", status: "approved" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.status.S).toBe("pending");
  });

  it("writes practiceArea (Bug 3 fix)", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({ name: "Dr. Jane", phone: "+1", email: "j@j.com", practiceArea: "Kirkland, WA" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.practiceArea.S).toBe("Kirkland, WA");
  });

  it("practiceArea defaults to empty string when not provided (Bug 3 fix)", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({ name: "Dr. Jane", phone: "+1", email: "j@j.com" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.practiceArea.S).toBe("");
  });

  it("writes caseTypes — not specialties (Bug 1 fix)", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({
      name: "Dr. Jane", phone: "+1", email: "j@j.com",
      caseTypes: "Toothache / pain, Root canals",
    });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.caseTypes.S).toBe("Toothache / pain, Root canals");
    expect(item.caseTypes.S).not.toContain("Delta Dental");
  });

  it("writes insuranceAccepted separately from caseTypes (Bug 1 fix)", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({
      name: "Dr. Jane", phone: "+1", email: "j@j.com",
      caseTypes:         "Toothache / pain",
      insuranceAccepted: "Delta Dental, Cigna",
    });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.insuranceAccepted.S).toBe("Delta Dental, Cigna");
    expect(item.insuranceAccepted.S).not.toContain("Toothache");
    expect(item.caseTypes.S).not.toContain("Delta Dental");
  });

  it("writes notificationPreference separate from acceptsUninsured (Bug 2 fix)", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({
      name: "Dr. Jane", phone: "+1", email: "j@j.com",
      notificationPreference: "sms-frontdesk",
      acceptsUninsured:       "yes",
    });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.notificationPreference.S).toBe("sms-frontdesk");
    expect(item.acceptsUninsured.S).toBe("yes");
    expect(item.acceptsUninsured.S).not.toBe("sms-frontdesk");
  });

  it("acceptsUninsured never contains a notification preference value (Bug 2 fix)", async () => {
    const notifValues = ["sms-personal", "sms-frontdesk", "call", "flexible"];
    for (const notifVal of notifValues) {
      mockSend.mockClear();
      mockSend.mockResolvedValueOnce({});
      await saveDentistApplication({
        name: "Dr. T", phone: "+1", email: "t@t.com",
        notificationPreference: notifVal,
        acceptsUninsured: "case-by-case",
      });
      const item = mockSend.mock.calls[0][0].params.Item;
      expect(item.acceptsUninsured.S).toBe("case-by-case");
      expect(item.acceptsUninsured.S).not.toBe(notifVal);
    }
  });

  it("preserves legacy survey fields for backwards compatibility", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveDentistApplication({
      name: "Dr. T", phone: "+1", email: "t@t.com",
      area: "Seattle", openSlots: "3", willingToPay: "yes",
    });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.area.S).toBe("Seattle");
    expect(item.openSlots.S).toBe("3");
    expect(item.willingToPay.S).toBe("yes");
  });

  it("throws if DynamoDB fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("DB error"));
    await expect(saveDentistApplication({ name: "Dr. T", phone: "+1", email: "t@t.com" }))
      .rejects.toThrow("DB error");
  });
});

// ── saveWaitlist ──────────────────────────────────────────────────────────────

describe("saveWaitlist", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns a leadId", async () => {
    mockSend.mockResolvedValueOnce({});
    const id = await saveWaitlist({ email: "patient@test.com", zip: "98033" });
    expect(id).toBe("test-uuid-5678");
  });

  it("writes to moxident-leads table", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveWaitlist({ email: "patient@test.com" });
    const call = mockSend.mock.calls[0][0];
    expect(call.params.TableName).toBe("moxident-leads");
  });

  it("sets source to waitlist", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveWaitlist({ email: "patient@test.com" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.source.S).toBe("waitlist");
  });

  it("sets status to new", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveWaitlist({ email: "patient@test.com" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.status.S).toBe("new");
  });

  it("defaults preferredTime to asap when not provided", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveWaitlist({ email: "patient@test.com" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.preferredTime.S).toBe("asap");
  });

  it("stores provided preferredTime", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveWaitlist({ email: "patient@test.com", preferredTime: "morning" });
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.preferredTime.S).toBe("morning");
  });
});

// ── saveLead ──────────────────────────────────────────────────────────────────

describe("saveLead", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns a leadId", async () => {
    mockSend.mockResolvedValueOnce({});
    const id = await saveLead({ practiceName: "Smile Dental", phone: "+1" });
    expect(id).toBe("test-uuid-5678");
  });

  it("writes to moxident-leads table", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveLead({ practiceName: "Smile Dental" });
    const call = mockSend.mock.calls[0][0];
    expect(call.params.TableName).toBe("moxident-leads");
  });

  it("defaults source to sdr-call", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveLead({});
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.source.S).toBe("sdr-call");
  });

  it("defaults status to new", async () => {
    mockSend.mockResolvedValueOnce({});
    await saveLead({});
    const item = mockSend.mock.calls[0][0].params.Item;
    expect(item.status.S).toBe("new");
  });
});

// ── getLeads ──────────────────────────────────────────────────────────────────

describe("getLeads", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns leads array", async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ leadId: { S: "l1" } }] });
    const leads = await getLeads();
    expect(leads.length).toBe(1);
  });

  it("returns empty array when no leads", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const leads = await getLeads();
    expect(leads).toEqual([]);
  });
});
