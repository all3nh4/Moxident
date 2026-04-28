// src/router.mjs
import { findDentistsByZip, findDentistByPhone, savePatient,
         updatePatientStatus, findOpenRequestByDentist } from "./db.mjs";
import { sendSMS } from "./sms.mjs";
import { getAvailability } from "./portal-db.mjs";

const COVERED_ZIPS = new Set([
  "98033","98034",
  "98052","98053",
  "98004","98005","98006","98007","98008",
  "98028",
  "98072"
]);

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_SLOT_MAP = {
  10: "10am",
  11: "11am",
  12: "12pm",
  13: "1pm",
  14: "2pm",
  15: "3pm",
  16: "4pm",
};

function getCurrentPacificAvailabilityWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find(part => part.type === "weekday")?.value || "";
  const hour = Number(parts.find(part => part.type === "hour")?.value);

  return {
    day: DAY_KEYS.includes(weekday) ? weekday : "",
    slot: Number.isFinite(hour) ? (HOUR_SLOT_MAP[hour] || "") : "",
  };
}

function hasMatchingAvailability(availability, now = new Date()) {
  if (!availability || typeof availability !== "object") return false;

  const { day, slot } = getCurrentPacificAvailabilityWindow(now);
  if (!day || !slot) return false;

  const dayAvailability = availability[day];
  if (!dayAvailability || typeof dayAvailability !== "object") return false;

  if (dayAvailability[slot]) return true;

  if (["10am", "11am", "12pm"].includes(slot) && dayAvailability.morning) return true;
  if (["1pm", "2pm", "3pm", "4pm"].includes(slot) && dayAvailability.afternoon) return true;

  return false;
}


export async function submitRequest({ name, phone, zip, symptom, otpCode, otpExpiresAt, isVerified }) {
  console.log('submitRequest input:', { name, phone, zip, symptom });

const isCovered = COVERED_ZIPS.has(zip);

const requestId = await savePatient({
  name,
  phone,
  zip,
  symptom,
  otpCode,
  otpExpiresAt,
  isVerified
});
if (!isCovered) {
  return {
    requestId,
    dentistFound: false,
    unsupportedArea: true,
    message: "We’re expanding our dentist network in your area."
  };
}

const dentistFound = await routeToNextDentist(requestId, { name, phone, zip, symptom });

return { requestId, dentistFound };

}

export async function routeVerifiedPatient({ requestId, name, phone, zip, symptom }) {
  console.log("inside routePatient");
  
  const isCovered = COVERED_ZIPS.has(zip);

  if (!isCovered) {
    console.log("this zip is not covered "+ zip)
    return { requestId, dentistFound: false, unsupportedArea: true };
  }

  const dentistFound = await routeToNextDentist(requestId, { name, phone, zip, symptom });
  return { requestId, dentistFound, unsupportedArea: false };
}

export async function routeToNextDentist(requestId, patient, excluded = []) {
  const dentists = await findDentistsByZip(patient.zip);

  if (dentists.length === 0) {
    await sendSMS(
      patient.phone,
      `Moxident: We’re expanding our dentist network in your area and can’t confirm a nearby match yet. Reply STOP to opt out.`
    );

    return false;
  }

  let dentist = null;
  let sawConfiguredAvailability = false;

  for (const d of dentists) {
    const dentistId = d.dentistId.S;
    if (excluded.includes(dentistId)) continue;

    try {
      const availability = await getAvailability(dentistId);
      if (availability && Object.keys(availability).length > 0) {
        sawConfiguredAvailability = true;
      }

      if (hasMatchingAvailability(availability)) {
        dentist = d;
        break;
      }
    } catch (err) {
      console.error("Availability check failed:", err.message);
    }
  }

  if (!dentist && !sawConfiguredAvailability) {
    dentist = dentists.find(d => !excluded.includes(d.dentistId.S)) || null;
  }

  if (!dentist) {
    await sendSMS(
      patient.phone,
      `Moxident: We’re expanding our dentist network in your area and can’t confirm a nearby match yet. Reply STOP to opt out.`
    );
    return false;
  }

  await sendSMS(
    dentist.phone.S,
    `MOXIDENT - New patient request. Patient: ${patient.name}. Symptom: ${patient.symptom}. Zip: ${patient.zip}. Reply YES to accept or NO to decline. Request ID: ${requestId}`
  );

  await updatePatientStatus(requestId, "offered", {
    dentistId: dentist.dentistId.S,
    offeredAt: new Date().toISOString(),
  });

  return true;
}

export async function handleDentistReply(from, replyBody) {
  const reply   = replyBody.trim().toUpperCase();
  const dentist = await findDentistByPhone(from);

  if (!dentist) {
    console.log("Unknown dentist replied:", from);
    return;
  }

  const patient = await findOpenRequestByDentist(dentist.dentistId.S);

  if (!patient) {
    console.log("No open request for dentist:", dentist.dentistId.S);
    return;
  }

  const requestId = patient.requestId.S;

  if (reply === "YES") {
    await updatePatientStatus(requestId, "matched", {
      acceptedAt: new Date().toISOString(),
    });

    await sendSMS(
      patient.phone.S,
      `Moxident: A dentist is ready for you! Dr. ${dentist.name.S} at ${dentist.address.S}. Call them at ${dentist.phone.S} to confirm your appointment.`
    );

    await sendSMS(
      dentist.phone.S,
      `Match confirmed. Patient: ${patient.name.S}. Phone: ${patient.phone.S}. Symptom: ${patient.symptom.S}. Please expect their call. Thank you for using Moxident.`
    );

  } else if (reply === "NO") {
    await updatePatientStatus(requestId, "pending");

    await routeToNextDentist(
      requestId,
      {
        name: patient.name.S,
        phone: patient.phone.S,
        zip: patient.zip.S,
        symptom: patient.symptom.S,
      },
      [dentist.dentistId.S]
    );
  }
}
