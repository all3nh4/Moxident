import { jest, describe, it, beforeEach, expect } from "@jest/globals";

// mockSend must be defined before the mock module that references it
const mockSend = jest.fn();

// Mock the AWS SDK — include ALL commands imported by db.mjs
jest.unstable_mockModule("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient:    jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutItemCommand:    jest.fn().mockImplementation((p) => ({ type: "PutItem", params: p })),
  GetItemCommand:    jest.fn().mockImplementation((p) => ({ type: "GetItem", params: p })),
  UpdateItemCommand: jest.fn().mockImplementation((p) => ({ type: "UpdateItem", params: p })),
  ScanCommand:       jest.fn().mockImplementation((p) => ({ type: "Scan", params: p })),
}));

jest.unstable_mockModule("crypto", () => ({
  randomUUID: () => "test-uuid-5678"
}));

const { savePatient, findDentistsByZip, findDentistByPhone } = await import("../src/db.mjs");

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
