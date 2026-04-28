// src/handler.mjs
import { submitRequest, handleDentistReply, routeVerifiedPatient } from "./router.mjs";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { savePatient, findDentistsByZip, findDentistByPhone,
         updatePatientStatus, findOpenRequestByDentist,
         saveDentistApplication, saveLead, getLeads, updateLead,
         getDentistApplications, approveDentistApplication, getSearchVolume,
         verifyPatientOtp, resendPatientOtp, updatePatientOtpStatus,
         markPatientOtpVerified } from "./db.mjs";
import { generateToken, hashPassword, comparePassword,
         generateVerificationToken, authenticateRequest } from "./portal-auth.mjs";
import { createPortalAccount, getPortalAccount, verifyPortalAccount,
         createPortalAccountWithDentistId, updatePortalAccountDentistId,
         setPortalPassword, updateLastLogin, setResetToken, clearResetToken,
         getDentistByEmail, ensureDentistProfile, saveAvailability, getAvailability,
         getDentistProfile, getRecentRequests, getDentistStats } from "./portal-db.mjs";
import sgMail from '@sendgrid/mail';

const sns = new SNSClient({ region: "us-east-2" });        
const NOTIFY_EMAIL = "admin@moxident.com";
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function isSmsEnabled() {
  return process.env.SMS_ENABLED === "true";
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

async function sendSurveyNotification(data, applicationId) {
  const subject = `Moxident: New Dentist Survey Submission`;
  const body = `
A new dentist survey was submitted.

Application ID: ${applicationId}
Submitted At:   ${new Date().toISOString()}

--- SURVEY DETAILS ---
Area:             ${data.area || "—"}
Open Slots:       ${data.openSlots || "—"}
Response Time:    ${data.responseTime || "—"}
Contact Method:   ${data.contactMethod || "—"}
Willing To Pay:   ${data.willingToPay || "—"}
Overflow:         ${data.overflow || "—"}
Staff Required:   ${data.staffRequired || "—"}
Payment:          ${data.payment || "—"}
Concerns:         ${data.concerns || "—"}
Procedures:       ${JSON.stringify(data.procedures || [])}
Availability:     ${JSON.stringify(data.availability || {})}

---
APPROVE THIS DENTIST (one click):
https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod/approve-dentist?applicationId=${applicationId}
Moxident Admin Notification
  `.trim();
  try {
  await sgMail.send({
    to: NOTIFY_EMAIL,
    from: NOTIFY_EMAIL,
    subject,
    text: body
  });
} catch (err) {
  console.error('SendGrid send failed:', err.response?.body || err.message || err);
   throw err; // keep behavior same as before (fail fast)
}
}

async function sendOnboardingNotification(data, applicationId) {
  const subject = `Moxident: New Dentist Onboarding Application`;
  const body = `
A new dentist onboarding application was submitted.

Application ID:     ${applicationId}
Submitted At:       ${new Date().toISOString()}

--- DENTIST DETAILS ---
Name:                    ${data.name || "—"}
Practice:                ${data.practiceName || "—"}
Phone:                   ${data.phone || "—"}
Email:                   ${data.email || "—"}
Zip Codes:               ${data.zipCodes || "—"}
Practice Area:           ${data.practiceArea || "—"}

--- AVAILABILITY ---
Daily Capacity:          ${data.dailyCapacity || "—"}
Extended Hours:          ${data.extendedHours || "—"}
Notification Preference: ${data.notificationPreference || "—"}
Accepts Uninsured:       ${data.acceptsUninsured || "—"}

--- CLINICAL PROFILE ---
Case Types Handled:      ${data.caseTypes || "—"}
Insurance Accepted:      ${data.insuranceAccepted || "—"}
Notes:                   ${data.notes || "—"}

---
Moxident Admin Notification
  `.trim();
  try {
  await sgMail.send({
    to: NOTIFY_EMAIL,
    from: NOTIFY_EMAIL,
    subject,
    text: body
  });

  console.log("Onboarding notification email sent");
} catch (err) {
  console.error("Onboarding email notification failed:", err.response?.body || err.message || err);
  // Don't fail the request if email fails
}
}
async function sendWelcomeEmail(dentist) {
  const subject = `You're live on Moxident`;
  const body = `
Hi ${dentist.name},

You're now active on the Moxident network. When a patient in your area submits an emergency request, you'll receive an SMS with their name, symptom, and zip code.

Reply YES to accept the case or NO to pass. If you accept, the patient will expect a call from your office shortly.

Questions? Reply to this email.

Allen Hafezipour
CEO & Founder, Moxident
allen@moxident.com
  `.trim();
  try {
  await sgMail.send({
    to: dentist.email,
    from: "admin@moxident.com",
    subject,
    text: body
  });
} catch (err) {
  console.error("Onboarding email notification failed:", err.response?.body || err.message || err);
  throw err;
}
}

const PORTAL_BASE_URL =
  process.env.PORTAL_BASE_URL || "https://moxident.com/dentist/portal";
const API_BASE_URL =
  process.env.API_BASE_URL || "https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod";

function getPortalBaseUrl(event) {
  const headers = event?.headers || {};
  const origin = headers.origin || headers.Origin;
  const referer = headers.referer || headers.Referer;

  const sourceUrl = origin || referer;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      return `${url.origin}/dentist/portal`;
    } catch {}
  }

  if (process.env.PORTAL_BASE_URL) return process.env.PORTAL_BASE_URL;

  return PORTAL_BASE_URL;
}



sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendPortalVerificationEmail(email, token, portalBaseUrl = PORTAL_BASE_URL) {
  const link = `${portalBaseUrl}/verify.html?token=${encodeURIComponent(token)}`;

  await sgMail.send({
    to: email,
    from: NOTIFY_EMAIL,
    subject: "Verify your Moxident portal email",
    text: `Hi,\n\nPlease verify your email to access your Moxident dentist portal:\n\n${link}\n\nThis link will expire in 24 hours.\n\n— The Moxident Team`,
    html: `<p>Hi,</p>
      <p>Please verify your email to access your Moxident dentist portal:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>— The Moxident Team</p>`,
    trackingSettings: {
      clickTracking: {
        enable: false,
        enableText: false
      }
    }
  });
}

async function sendPortalWelcomeEmail(email, portalBaseUrl = PORTAL_BASE_URL) {
  const loginUrl = `${portalBaseUrl}/login`;
  try {
    await sgMail.send({
      to: email,
      from: NOTIFY_EMAIL,
      subject: "You're live on Moxident",
      text: `Welcome to the Moxident dentist portal!

You can now log in to manage your availability, view patient requests, and track your performance.

Log in here: ${loginUrl}

— The Moxident Team`,
      html: `<p>Welcome to the Moxident dentist portal!</p>
<p>You can now log in to manage your availability, view patient requests, and track your performance.</p>
<p><a href="${loginUrl}" clicktracking="off">Log in here</a></p>
<p>— The Moxident Team</p>`,
      trackingSettings: {
        clickTracking: {
          enable: false,
          enableText: false
        }
      }
    });
  } catch (err) {
    console.error('SendGrid portal welcome email failed:', err.response?.body || err.message || err);
    throw err;
  }
}

async function sendPortalResetEmail(email, token, portalBaseUrl = PORTAL_BASE_URL) {
  const link = `${portalBaseUrl}/reset-password.html?token=${token}&flow=reset`;

  try {
    await sgMail.send({
      to: email,
      from: NOTIFY_EMAIL,
      subject: "Reset your Moxident password",
      text: `Hi,

We received a request to reset your Moxident portal password.

Reset your password here:
${link}

This link expires in 1 hour. If you didn't request this, ignore this email.

— The Moxident Team`,
      html: `<p>Hi,</p>
<p>We received a request to reset your Moxident portal password.</p>
<p>Reset your password here:<br><a href="${link}">${link}</a></p>
<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
<p>— The Moxident Team</p>`,
      trackingSettings: {
        clickTracking: {
          enable: false,
          enableText: false
        }
      }
    });
  } catch (err) {
    console.error('SendGrid portal reset email failed:', err.response?.body || err.message || err);
    throw err;
  }
}

import { DynamoDBClient, ScanCommand as PortalScanCommand } from "@aws-sdk/client-dynamodb";
const portalDb = new DynamoDBClient({ region: "us-east-2" });

async function findPortalAccountByVerificationToken(token) {
  const result = await portalDb.send(new PortalScanCommand({
    TableName: "moxident-dentist-portal",
    FilterExpression: "verificationToken = :t",
    ExpressionAttributeValues:  { ":t": { S: token } },
  }));
  const item = result.Items?.[0];
  if (!item) return null;
  return {
    email: item.email?.S,
    dentistId: item.dentistId?.S || "",
  };
}

async function findPortalAccountByResetToken(token) {
  const result = await portalDb.send(new PortalScanCommand({
    TableName: "moxident-dentist-portal",
    FilterExpression: "resetToken = :t",
    ExpressionAttributeValues: { ":t": { S: token } },
  }));
  const item = result.Items?.[0];
  if (!item) return null;
  return item;
}

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  const path = (event.rawPath || event.path || "/").replace(/^\/prod/, "");
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const portalBaseUrl = getPortalBaseUrl(event);

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // POST /submit — save pending patient + SMS the OTP; no dentist routing yet
  if (path === "/submit" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { name, phone, zip, symptom } = body;
      if (!name || !phone || !zip || !symptom) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: name, phone, zip, symptom" }),
        };
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = Date.now() + 5 * 60 * 1000;
      const requestId = await savePatient({
        name, phone, zip, symptom,
        otpCode: code,
        otpExpiresAt,
        isVerified: false,
        otpStatus: "generated",
      });

      console.log("OTP (disabled mode):", code);
      await markPatientOtpVerified(requestId);
      const { dentistFound, unsupportedArea } = await routeVerifiedPatient({
        requestId,
        name,
        phone,
        zip,
        symptom,
      });

      try {
        await sgMail.send({
          to: NOTIFY_EMAIL,
          from: NOTIFY_EMAIL,
          subject: `Moxident: New Patient Request`,
          text: `New patient request received.

    Request ID: ${requestId}
    Name: ${name}
    Phone: ${phone}
    Zip: ${zip}
    Symptom: ${symptom}
    Out of Network: ${unsupportedArea ? 'Yes' : 'No'}
    Dentist Found: ${unsupportedArea ? 'N/A' : (dentistFound ? 'Yes' : 'No')}
    Submitted At: ${new Date().toISOString()}`
        });
      } catch (emailErr) {
        console.error("Patient email notification failed:", emailErr.response?.body || emailErr.message || emailErr);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, requestId, otpStatus: "verified", dentistFound, unsupportedArea }),
      };
    } catch (err) {
      console.error("Submit error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Something went wrong. Please try again." }),
      };
    }
  }

  // POST /verify-otp — validate OTP, then route to dentist
  if (path === "/verify-otp" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { requestId, code } = body;
      if (!requestId || !code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing requestId or code" }),
        };
      }

      const verified = await verifyPatientOtp(requestId, code);
      if (!verified.success) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid or expired code" }),
        };
      }

      const { name, phone, zip, symptom } = verified.patient;
      const { dentistFound, unsupportedArea } = await routeVerifiedPatient({
        requestId, name, phone, zip, symptom,
      });

      try {
  await sgMail.send({
    to: NOTIFY_EMAIL,
    from: NOTIFY_EMAIL,
    subject: `Moxident: New Patient Request`,
    text: `New patient request received.

    Request ID: ${requestId}
    Name: ${name}
    Phone: ${phone}
    Zip: ${zip}
    Symptom: ${symptom}
    Out of Network: ${unsupportedArea ? 'Yes' : 'No'}
    Dentist Found: ${unsupportedArea ? 'N/A' : (dentistFound ? 'Yes' : 'No')}
    Submitted At: ${new Date().toISOString()}`
      });
} catch (emailErr) {
  console.error("Patient email notification failed:", emailErr.response?.body || emailErr.message || emailErr);
}

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, requestId, dentistFound, unsupportedArea }),
      };
    } catch (err) {
      console.error("Verify-OTP error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Something went wrong. Please try again." }),
      };
    }
  }

  // POST /resend-otp — generate a new code, reset attempts, SMS it
  if (path === "/resend-otp" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { requestId } = body;
      if (!requestId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing requestId" }) };
      }

      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      const newExpiresAt = Date.now() + 5 * 60 * 1000;
      const result = await resendPatientOtp(requestId, newCode, newExpiresAt);
      if (!result.success) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Cannot resend. Please restart the form." }),
        };
      }

      if (!isSmsEnabled()) {
        await updatePatientOtpStatus(requestId, "generated");
        console.log("OTP (local mode):", newCode);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, otpStatus: "generated" }) };
      }

      try {
        await sns.send(new PublishCommand({
          Message: `Your Moxident code is ${newCode}`,
          PhoneNumber: `+1${result.phone}`,
        }));
        await updatePatientOtpStatus(requestId, "sent");
      } catch (smsErr) {
        console.error("Resend-OTP SMS send failed:", smsErr.message);
        await updatePatientOtpStatus(requestId, "failed", smsErr.message || "SMS send failed");
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: false, otpStatus: "failed", error: "OTP delivery failed" }),
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, otpStatus: "sent" }) };
    } catch (err) {
      console.error("Resend-OTP error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Something went wrong. Please try again." }),
      };
    }
  }

  // POST /sms-webhook
  if (path === "/sms-webhook" && method === "POST") {
    try {
      const params = new URLSearchParams(event.body || "");
      const from = params.get("From") || "";
      const body = params.get("Body") || "";
      await handleDentistReply(from, body);
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    };
  }

  // GET /health
  if (path === "/health") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "ok", service: "moxident-router" }),
    };
  }

  // POST /dentist-survey
  if (path === "/dentist-survey" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const applicationId = await saveDentistApplication(body);
      try {
        await sendSurveyNotification(body, applicationId);
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr.message);
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, applicationId }),
      };
    } catch (err) {
      console.error("Survey error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Something went wrong. Please try again." }),
      };
    }
  }

  // GET /dentist-survey/report
  if (path === "/dentist-survey/report" && method === "GET") {
    try {
      const applications = await getDentistApplications();

      const total = applications.length;

      const byArea = {};
      applications.forEach(a => {
        const area = a.area?.S || "Unknown";
        byArea[area] = (byArea[area] || 0) + 1;
      });

      const willingToPay = applications.filter(a =>
        (a.willingToPay?.S || "").toLowerCase().includes("yes")
      ).length;

      const byResponseTime = {};
      applications.forEach(a => {
        const rt = a.responseTime?.S || "Unknown";
        byResponseTime[rt] = (byResponseTime[rt] || 0) + 1;
      });

      const byOpenSlots = {};
      applications.forEach(a => {
        const slots = a.openSlots?.S || "Unknown";
        byOpenSlots[slots] = (byOpenSlots[slots] || 0) + 1;
      });

      const recent = applications
        .sort((a, b) => new Date(b.submittedAt?.S) - new Date(a.submittedAt?.S))
        .slice(0, 10)
        .map(a => ({
          applicationId:    a.applicationId?.S,
          name:             a.name?.S,
          practiceName:     a.practiceName?.S,
          phone:            a.phone?.S,
          email:            a.email?.S,
          zipCodes:         a.zipCodes?.S,
          dailyCapacity:    a.dailyCapacity?.S,
          insuranceAccepted:a.insuranceAccepted?.S,
          yearsInPractice:  a.yearsInPractice?.S,
          acceptsUninsured: a.acceptsUninsured?.S,
          extendedHours:    a.extendedHours?.S,
          specialties:      a.specialties?.S,
          status:           a.status?.S,
          // legacy fields
          area:             a.area?.S,
          openSlots:        a.openSlots?.S,
          responseTime:     a.responseTime?.S,
          willingToPay:     a.willingToPay?.S,
          concerns:         a.concerns?.S,
          submittedAt:      a.submittedAt?.S,
        }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          summary: {
            total,
            willingToPay,
            willingToPayPct: total > 0 ? Math.round((willingToPay / total) * 100) : 0,
            byArea,
            byResponseTime,
            byOpenSlots,
          },
          recent,
          submissions: recent, // alias for admin dashboard compatibility
        }),
      };
    } catch (err) {
      console.error("Report error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to generate report" }),
      };
    }
  }

  // POST /leads
  if (path === "/leads" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const leadId = await saveLead(body);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, leadId }) };
    } catch (err) {
      console.error("Lead save error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save lead" }) };
    }
  }

  // GET /leads
  if (path === "/leads" && method === "GET") {
    try {
      const leads = await getLeads();
      return { statusCode: 200, headers, body: JSON.stringify({ leads }) };
    } catch (err) {
      console.error("Leads fetch error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch leads" }) };
    }
  }

  // PUT /leads/:id
  if (path.startsWith("/leads/") && method === "PUT") {
    try {
      const leadId = path.split("/")[2];
      const body = JSON.parse(event.body || "{}");
      await updateLead(leadId, body);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Lead update error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to update lead" }) };
    }
  }

  // GET /search-volume?zip=XXXXX
  if (path === "/search-volume" && method === "GET") {
    const zip = event.queryStringParameters?.zip
      || new URLSearchParams(event.rawQueryString || "").get("zip")
      || "";
    if (!/^\d{5}$/.test(zip)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid zip code. Must be 5 digits." }),
      };
    }
    try {
      const result = await getSearchVolume(zip);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          zip,
          monthlySearches: result.monthlySearches,
          isAggregated: result.isAggregated,
          city: result.city,
        }),
      };
    } catch (err) {
      console.error("Search volume error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to fetch search volume" }),
      };
    }
  }

  // POST /dentist-signup
  if (path === "/dentist-signup" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { name, phone, email } = body;
      if (!name || !phone || !email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing required fields: name, phone, email" }),
        };
      }
      const applicationId = await saveDentistApplication(body);
      await sendOnboardingNotification(body, applicationId);

      // Auto-create portal account
      try {
        const existing = await getPortalAccount(email);
        console.log("existing portal account:", existing);
        const dentist = await ensureDentistProfile(body);
        const dentistId = dentist?.dentistId?.S || "";

        if (!existing) {
          const verificationToken = generateVerificationToken();
          await createPortalAccountWithDentistId(email, verificationToken, dentistId);
          await sendPortalVerificationEmail(email, verificationToken, portalBaseUrl);

        } else if (!existing.verified?.BOOL) {
          if (!existing.dentistId?.S && dentistId) {
            await updatePortalAccountDentistId(email, dentistId);
          }
          const token = existing.verificationToken?.S;
          if (token) {
      await sendPortalVerificationEmail(email, token, portalBaseUrl);
          }

        } else {
          await sendPortalWelcomeEmail(email, portalBaseUrl);
        }
      } catch (portalErr) {
        console.error("Portal auto-registration failed:", portalErr);
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, applicationId }),
      };
    } catch (err) {
      console.error("Dentist signup error:", err.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Something went wrong. Please try again." }),
      };
    }
  }
  // GET /approve-dentist
if (path === "/approve-dentist" && method === "GET") {
  try {
    const applicationId = event.queryStringParameters?.applicationId;
    if (!applicationId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html" },
        body: "<h2>Missing application ID.</h2>",
      };
    }
    const result = await approveDentistApplication(applicationId);
    await sendWelcomeEmail(result);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <html>
          <body style="font-family:sans-serif;max-width:500px;margin:80px auto;text-align:center;">
            <h2 style="color:#0f1a2e;">✓ Dentist Approved</h2>
            <p style="color:#555;">${result.practiceName} is now live on the Moxident network.</p>
            <p style="color:#555;">A welcome email has been sent to ${result.email}.</p>
          </body>
        </html>
      `,
    };
  } catch (err) {
    console.error("Approve dentist error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: "<h2>Something went wrong. Please try again.</h2>",
    };
  }
}

  // ═══════════════════════════════════════════
  // DENTIST PORTAL ROUTES
  // ═══════════════════════════════════════════

  // POST /dentist-portal/register
  if (path === "/dentist-portal/register" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required field: email" }) };
      }
      const existing = await getPortalAccount(email);
      if (existing) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: "Account already exists" }) };
      }
      const dentist = await ensureDentistProfile({ email });
      const dentistId = dentist?.dentistId?.S || "";
      const verificationToken = generateVerificationToken();
      await createPortalAccountWithDentistId(email, verificationToken, dentistId);
      await sendPortalVerificationEmail(email, verificationToken, portalBaseUrl);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Portal register error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Registration failed" }) };
    }
  }

  // GET /dentist-portal/verify
  if (path === "/dentist-portal/verify" && method === "GET") {
    try {
      const token = event.queryStringParameters?.token
        || new URLSearchParams(event.rawQueryString || "").get("token") || "";
      const frontendMode = (event.queryStringParameters?.frontend
        || new URLSearchParams(event.rawQueryString || "").get("frontend") || "") === "1";
      if (!token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing verification token" }) };
      }
      const accounts = await findPortalAccountByVerificationToken(token);
      if (!accounts) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid or expired verification token" }) };
      }
      console.log("verify route token:", token);
      console.log("verify route account email:", accounts.email);
      await verifyPortalAccount(accounts.email);
      const redirectUrl = `${portalBaseUrl}/set-password.html?email=${encodeURIComponent(accounts.email)}`;
      if (frontendMode) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, email: accounts.email, redirectUrl }),
        };
      }
      return {
        statusCode: 302,
        headers: {
          ...headers,
          Location: redirectUrl,
        },
        body: "",
      };
    } catch (err) {
      console.error("Portal verify error:", err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Verification failed" }) };
    }
  }

  // POST /dentist-portal/set-password
  if (path === "/dentist-portal/set-password" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      console.log("set-password body:", body);
      const { email, token, password } = body;
      console.log("set-password email:", email);
      console.log("set-password password length:", password ? password.length : 0);

      if ((!email && !token) || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing email/token or password" }) };
      }
      if (password.length < 8) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };
      }
      let accountEmail = email;

      if (token) {
        const verificationAccount = await findPortalAccountByVerificationToken(token);
        if (verificationAccount?.email) {
          accountEmail = verificationAccount.email;
          await verifyPortalAccount(accountEmail);
        } else {
          const resetAccount = await findPortalAccountByResetToken(token);
          if (!resetAccount?.email?.S) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid or expired setup token" }) };
          }
          if (resetAccount.resetTokenExpiry?.S && new Date(resetAccount.resetTokenExpiry.S) < new Date()) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Reset token has expired" }) };
          }
          accountEmail = resetAccount.email.S;
        }
      }

      const account = await getPortalAccount(accountEmail);
      console.log("set-password account:", account);
      if (!account) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Account not found" }) };
      }
      if (!account.verified?.BOOL) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Email not verified" }) };
      }
      const dentist = await getDentistByEmail(accountEmail);
      console.log("set-password: dentist lookup result:", dentist);

      const dentistId = account.dentistId?.S || dentist?.dentistId?.S || "";
      console.log("set-password: dentistId:", dentistId);
      if (!dentistId) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Account is not fully initialized. Dentist profile missing." }),
        };
      }

      const hashed = await hashPassword(password);
      console.log("set-password: password hashed");

      await setPortalPassword(accountEmail, hashed, dentistId);
      console.log("set-password: password saved");

      if (token) {
        await clearResetToken(accountEmail);
      }

      await sendPortalWelcomeEmail(accountEmail, portalBaseUrl);
      console.log("set-password: welcome email sent");

      const authToken = generateToken(accountEmail, dentistId);
      console.log("set-password: token generated");
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, token: authToken, email: accountEmail }) };
    } catch (err) {
      console.error("Set password error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to set password" }) };
    }
  }

  // POST /dentist-portal/login
  if (path === "/dentist-portal/login" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { email, password } = body;
      if (!email || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing email or password" }) };
      }
      const account = await getPortalAccount(email);
      if (!account) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid email or password" }) };
      }
      if (!account.verified?.BOOL) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Email not verified" }) };
      }
      if (!account.passwordHash?.S) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Password not set for this account" }) };
      }
      const valid = await comparePassword(password, account.passwordHash.S);
      if (!valid) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid email or password" }) };
      }
      const dentistId = account.dentistId?.S || "";
      if (!dentistId) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Account is not fully initialized. Dentist profile missing." }),
        };
      }
      const dentist = await getDentistProfile(dentistId);
      if (!dentist) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Dentist profile not found for this account." }),
        };
      }
      try {
        await updateLastLogin(email);
      } catch (err) {
        console.error("login lastLogin update failed:", err);
      }
      const token = generateToken(email, dentistId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, token }) };
    } catch (err) {
      console.error("login error:", err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
    }
  }

  // POST /dentist-portal/forgot-password
  if (path === "/dentist-portal/forgot-password" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing email" }) };
      }
      const account = await getPortalAccount(email);
      if (!account) {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
      const resetToken = generateVerificationToken();
      await setResetToken(email, resetToken);
      try {
        await sendPortalResetEmail(email, resetToken, portalBaseUrl);
      } catch (emailErr) {
        console.error("Forgot password email send failed:", emailErr.message);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Forgot password error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to process request" }) };
    }
  }

  // POST /dentist-portal/reset-password
  if (path === "/dentist-portal/reset-password" && method === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { token, password } = body;
      if (!token || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing token or password" }) };
      }
      if (password.length < 8) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };
      }
      const account = await findPortalAccountByResetToken(token);
      if (!account) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid or expired reset token" }) };
      }
      if (account.resetTokenExpiry?.S && new Date(account.resetTokenExpiry.S) < new Date()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Reset token has expired" }) };
      }
      const hashed = await hashPassword(password);
      await setPortalPassword(account.email, hashed, account.dentistId?.S || "");
      await clearResetToken(account.email);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Reset password error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to reset password" }) };
    }
  }

  // GET /dentist-portal/dashboard
if (path === "/dentist-portal/dashboard" && method === "GET") {
  const user = authenticateRequest(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    if (!user.dentistId) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "Account is not fully initialized. Dentist profile missing." }),
      };
    }

    const profile = await getDentistProfile(user.dentistId);
    if (!profile) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "Dentist profile not found for this account." }),
      };
    }

    const availability = await getAvailability(user.dentistId);
    const recentRequests = await getRecentRequests(user.dentistId);
    const stats = await getDentistStats(user.dentistId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        dentistName: profile?.name?.S || profile?.name || "",
        practiceName: profile?.practiceName?.S || profile?.practiceName || "",
        email: user.email,
        thisWeekAvailability: availability || {},
        recentRequests: recentRequests || [],
        stats: stats || {},
      }),
    };
  } catch (err) {
    console.error("Dashboard error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to load dashboard" }) };
  }
}

  // POST /dentist-portal/availability
  if (path === "/dentist-portal/availability" && method === "POST") {
    const user = authenticateRequest(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    try {
      if (!user.dentistId) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Account is not fully initialized. Dentist profile missing." }),
        };
      }
      const dentist = await getDentistProfile(user.dentistId);
      if (!dentist) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Dentist profile not found for this account." }),
        };
      }
      const body = JSON.parse(event.body || "{}");
      const { availability } = body;
      if (!availability || typeof availability !== "object") {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing availability data" }) };
      }
      await saveAvailability(user.dentistId, availability);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Availability save error:", err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save availability" }) };
    }
  }

  // GET /dentist-portal/availability
 if (path === "/dentist-portal/availability" && method === "GET") {
  const user = authenticateRequest(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    if (!user.dentistId) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "Account is not fully initialized. Dentist profile missing." }),
      };
    }

    const dentist = await getDentistProfile(user.dentistId);
    if (!dentist) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: "Dentist profile not found for this account." }),
      };
    }

    const availability = await getAvailability(user.dentistId);
    return { statusCode: 200, headers, body: JSON.stringify({ availability: availability || {} }) };
  } catch (err) {
    console.error("Availability fetch error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch availability" }) };
  };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
}
