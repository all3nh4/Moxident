// src/router.mjs
import { findDentistsByZip, findDentistByPhone, savePatient,
         updatePatientStatus, findOpenRequestByDentist } from "./db.mjs";
import { sendSMS } from "./sms.mjs";
import { getAvailability } from "./portal-db.mjs";

export async function submitRequest({ name, phone, zip, symptom }) {
  console.log('submitRequest input:', { name, phone, zip, symptom });
  const requestId   = await savePatient({ name, phone, zip, symptom });
    console.log('savePatient returned requestId:', requestId);
  const dentistFound = await routeToNextDentist(requestId, { name, phone, zip, symptom });
  console.log('routeToNextDentist returned:', dentistFound);
  return { requestId, dentistFound };
}

export async function routeToNextDentist(requestId, patient, excluded = []) {
  const dentists = await findDentistsByZip(patient.zip);
  

  if (dentists.length === 0) {
    await sendSMS(
      patient.phone,
      `Hi ${patient.name}, this is Moxident. We received your request near ${patient.zip} and are searching for an available dentist. We will text you shortly. If this is a medical emergency call 911.`
    );
    
    return false;
  }

let dentist = null;

for (const d of dentists) {
  const dentistId = d.dentistId.S;
  if (excluded.includes(dentistId)) continue;

  try {
    const availability = await getAvailability(dentistId);

    if (availability && Object.keys(availability).length > 0) {
      dentist = d;
      break;
    }
  } catch (err) {
    console.error("Availability check failed:", err.message);
  }
}

if (!dentist) {
  dentist = dentists[0];
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
