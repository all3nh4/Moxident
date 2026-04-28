import { jest, describe, it, beforeEach, expect } from "@jest/globals";

jest.unstable_mockModule("../src/db.mjs", () => ({
  savePatient:              jest.fn(),
  findDentistsByZip:        jest.fn(),
  findDentistByPhone:       jest.fn(),
  updatePatientStatus:      jest.fn(),
  findOpenRequestByDentist: jest.fn(),
}));

jest.unstable_mockModule("../src/sms.mjs", () => ({
  sendSMS: jest.fn(),
}));

jest.unstable_mockModule("../src/portal-db.mjs", () => ({
  getAvailability: jest.fn(),
}));

const { savePatient, findDentistsByZip, findDentistByPhone,
        updatePatientStatus, findOpenRequestByDentist } = await import("../src/db.mjs");
const { sendSMS } = await import("../src/sms.mjs");
const { getAvailability } = await import("../src/portal-db.mjs");
const { submitRequest, handleDentistReply, routeVerifiedPatient } = await import("../src/router.mjs");

function currentPacificAvailability() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const day = parts.find(part => part.type === "weekday")?.value;
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const slotMap = {
    10: "10am",
    11: "11am",
    12: "12pm",
    13: "1pm",
    14: "2pm",
    15: "3pm",
    16: "4pm",
  };

  return { day, slot: slotMap[hour] || "" };
}

const mockDentist = {
  dentistId: { S: "d001" },
  name:      { S: "Dr. Smith" },
  phone:     { S: "+14255551234" },
  address:   { S: "123 Main St, Redmond WA" },
};

const mockPatient = {
  requestId: { S: "req-001" },
  name:      { S: "Jane Doe" },
  phone:     { S: "+12065559999" },
  zip:       { S: "98033" },
  symptom:   { S: "Tooth pain" },
  dentistId: { S: "d001" },
};

beforeEach(() => jest.clearAllMocks());

describe("submitRequest", () => {
  it("saves patient and texts dentist when dentist found", async () => {
    const { day, slot } = currentPacificAvailability();
    savePatient.mockResolvedValueOnce("req-001");
    findDentistsByZip.mockResolvedValueOnce([mockDentist]);
    getAvailability.mockResolvedValueOnce(day && slot ? { [day]: { [slot]: true } } : {});
    updatePatientStatus.mockResolvedValueOnce({});

    const result = await submitRequest({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" });

    expect(result.requestId).toBe("req-001");
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+14255551234"); // texted dentist
  });

  it("falls back to patient notification when dentists have configured but non-matching availability", async () => {
    const { day, slot } = currentPacificAvailability();
    const nonMatchingSlot = slot === "10am" ? "11am" : "10am";
    savePatient.mockResolvedValueOnce("req-003");
    findDentistsByZip.mockResolvedValueOnce([mockDentist]);
    getAvailability.mockResolvedValueOnce(day ? { [day]: { [nonMatchingSlot]: true } } : { Mon: { "10am": true } });

    const result = await submitRequest({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" });

    expect(result.requestId).toBe("req-003");
    expect(result.dentistFound).toBe(false);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+12065559999");
  });

  it("falls back to first dentist when no availability has been configured yet", async () => {
    savePatient.mockResolvedValueOnce("req-004");
    findDentistsByZip.mockResolvedValueOnce([mockDentist]);
    getAvailability.mockResolvedValueOnce({});
    updatePatientStatus.mockResolvedValueOnce({});

    const result = await submitRequest({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" });

    expect(result.requestId).toBe("req-004");
    expect(result.dentistFound).toBe(true);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+14255551234");
  });

  it("returns unsupportedArea without sending SMS when zip is not covered", async () => {
    savePatient.mockResolvedValueOnce("req-002");
    findDentistsByZip.mockResolvedValueOnce([]);

    const result = await submitRequest({ name: "Jane", phone: "+12065559999", zip: "99999", symptom: "Tooth pain" });

    expect(result).toEqual({
      requestId: "req-002",
      dentistFound: false,
      unsupportedArea: true,
      message: "We’re expanding our dentist network in your area.",
    });
    expect(findDentistsByZip).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe("routeVerifiedPatient", () => {
  it("returns unsupportedArea without sending SMS for unsupported zips", async () => {
    const result = await routeVerifiedPatient({
      requestId: "req-unsupported",
      name: "Jane",
      phone: "+12065559999",
      zip: "99999",
      symptom: "Tooth pain",
    });

    expect(result).toEqual({
      requestId: "req-unsupported",
      dentistFound: false,
      unsupportedArea: true,
    });
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe("handleDentistReply - YES", () => {
  it("matches patient and dentist, sends SMS to both", async () => {
    findDentistByPhone.mockResolvedValueOnce(mockDentist);
    findOpenRequestByDentist.mockResolvedValueOnce(mockPatient);
    updatePatientStatus.mockResolvedValueOnce({});

    await handleDentistReply("+14255551234", "YES");

    expect(sendSMS).toHaveBeenCalledTimes(2);
    expect(sendSMS.mock.calls[0][0]).toBe("+12065559999"); // patient
    expect(sendSMS.mock.calls[1][0]).toBe("+14255551234"); // dentist
  });
});

describe("handleDentistReply - NO", () => {
  it("resets status and tries next dentist", async () => {
    findDentistByPhone.mockResolvedValueOnce(mockDentist);
    findOpenRequestByDentist.mockResolvedValueOnce(mockPatient);
    updatePatientStatus.mockResolvedValueOnce({});
    findDentistsByZip.mockResolvedValueOnce([]); // no next dentist

    await handleDentistReply("+14255551234", "NO");

    expect(updatePatientStatus).toHaveBeenCalledWith("req-001", "pending");
  });
});

describe("handleDentistReply - unknown dentist", () => {
  it("does nothing when dentist not found", async () => {
    findDentistByPhone.mockResolvedValueOnce(null);

    await handleDentistReply("+19999999999", "YES");

    expect(sendSMS).not.toHaveBeenCalled();
  });
});
