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

const { savePatient, findDentistsByZip, findDentistByPhone,
        updatePatientStatus, findOpenRequestByDentist } = await import("../src/db.mjs");
const { sendSMS } = await import("../src/sms.mjs");
const { submitRequest, handleDentistReply } = await import("../src/router.mjs");

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
    savePatient.mockResolvedValueOnce("req-001");
    findDentistsByZip.mockResolvedValueOnce([mockDentist]);
    updatePatientStatus.mockResolvedValueOnce({});

    const id = await submitRequest({ name: "Jane", phone: "+12065559999", zip: "98033", symptom: "Tooth pain" });

    expect(id).toBe("req-001");
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+14255551234"); // texted dentist
  });

  it("sends fallback SMS to patient when no dentist found", async () => {
    savePatient.mockResolvedValueOnce("req-002");
    findDentistsByZip.mockResolvedValueOnce([]);

    await submitRequest({ name: "Jane", phone: "+12065559999", zip: "99999", symptom: "Tooth pain" });

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0]).toBe("+12065559999"); // texted patient
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