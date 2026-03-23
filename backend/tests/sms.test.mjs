import { jest, describe, it, beforeEach, expect } from "@jest/globals";

const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.TWILIO_ACCOUNT_SID  = "AC_TEST";
process.env.TWILIO_AUTH_TOKEN   = "AUTH_TEST";
process.env.TWILIO_PHONE_NUMBER = "+14258423179";

const { sendSMS } = await import("../src/sms.mjs");

describe("sendSMS", () => {
  beforeEach(() => mockFetch.mockReset());

  it("calls Twilio API and returns message SID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM123", status: "queued" })
    });
    const result = await sendSMS("+12065551234", "Hello");
    expect(result.sid).toBe("SM123");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

    it("calls Twilio with correct To and From numbers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM456" })
    });
    await sendSMS("+12065551234", "Test message");
    const callBody = mockFetch.mock.calls[0][1].body;
    expect(callBody).toContain("%2B12065551234");
    expect(callBody).toContain("%2B14258423179");
  });

  it("throws when Twilio returns an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Invalid number" })
    });
    await expect(sendSMS("+1invalid", "Hello")).rejects.toThrow("Twilio error");
  });
});