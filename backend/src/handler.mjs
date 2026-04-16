// src/handler.mjs
import { submitRequest, handleDentistReply } from "./router.mjs";
import { savePatient, findDentistsByZip, findDentistByPhone,
         updatePatientStatus, findOpenRequestByDentist,
         saveDentistApplication, saveLead, getLeads, updateLead,
         getDentistApplications, approveDentistApplication, getSearchVolume } from "./db.mjs";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { generateToken, hashPassword, comparePassword,
         generateVerificationToken, authenticateRequest } from "./portal-auth.mjs";
import { createPortalAccount, getPortalAccount, verifyPortalAccount,
         setPortalPassword, updateLastLogin, setResetToken, clearResetToken,
         getDentistByEmail, saveAvailability, getAvailability,
         getDentistProfile, getRecentRequests, getDentistStats } from "./portal-db.mjs";

const ses = new SESClient({ region: "us-east-2" });
const NOTIFY_EMAIL = "admin@moxident.com";

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
    console.log("Sending SES email to:", NOTIFY_EMAIL);
    await ses.send(new SendEmailCommand({
      Source: NOTIFY_EMAIL,
      Destination: { ToAddresses: [NOTIFY_EMAIL] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    }));
    console.log("SES email sent successfully");
  } catch (err) {
    console.error("SES send failed:", err.message);
    throw err;
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
    await ses.send(new SendEmailCommand({
      Source: NOTIFY_EMAIL,
      Destination: { ToAddresses: [NOTIFY_EMAIL] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    }));
    console.log("Onboarding notification email sent");
  } catch (err) {
    console.error("Onboarding email notification failed:", err.message);
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

  await ses.send(new SendEmailCommand({
    Source: "admin@moxident.com",
    Destination: { ToAddresses: [dentist.email] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: body } },
    },
  }));
}

const PORTAL_BASE_URL =
  process.env.PORTAL_BASE_URL || "https://moxident.com/dentist/portal";

async function sendPortalVerificationEmail(email, token) {
const link = `${PORTAL_BASE_URL}/verify.html?token=${token}`;  await ses.send(new SendEmailCommand({
    Source: NOTIFY_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Verify your Moxident portal email" },
      Body: { Text: { Data: `Hi,\n\nPlease verify your email to access your Moxident dentist portal:\n\n${link}\n\nThis link will expire in 24 hours.\n\n— The Moxident Team` } },
    },
  }));
}

async function sendPortalWelcomeEmail(email) {
  await ses.send(new SendEmailCommand({
    Source: NOTIFY_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "You're live on Moxident" },
      Body: { Text: { Data: `Welcome to the Moxident dentist portal!\n\nYou can now log in to manage your availability, view patient requests, and track your performance.\n\nLog in here: ${PORTAL_BASE_URL}/index.html\n\n— The Moxident Team` } },
    },
  }));
}

async function sendPortalResetEmail(email, token) {
  const link = `${PORTAL_BASE_URL}/reset-password.html?token=${token}`;
  await ses.send(new SendEmailCommand({
    Source: NOTIFY_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Reset your Moxident password" },
      Body: { Text: { Data: `Hi,\n\nWe received a request to reset your Moxident portal password.\n\nReset your password here:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.\n\n— The Moxident Team` } },
    },
  }));
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
  return { email: item.email?.S };
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

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // POST /submit
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
      const { requestId, dentistFound } = await submitRequest({ name, phone, zip, symptom });
      try {
        await ses.send(new SendEmailCommand({
          Source: NOTIFY_EMAIL,
          Destination: { ToAddresses: [NOTIFY_EMAIL] },
          Message: {
            Subject: { Data: `Moxident: New Patient Request` },
            Body: { Text: { Data: `New patient request received.\n\nRequest ID: ${requestId}\nName: ${name}\nPhone: ${phone}\nZip: ${zip}\nSymptom: ${symptom}\nDentist Found: ${dentistFound ? 'Yes' : 'No'}\nSubmitted At: ${new Date().toISOString()}` } },
          },
        }));
        console.log("Patient notification email sent");
      } catch (emailErr) {
        console.error("Patient email notification failed:", emailErr.message);
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, requestId, dentistFound }),
      };
    } catch (err) {
      console.error("Submit error:", err.message);
      const status = err.message?.includes("Missing") ? 400 : 500;
      const message = status === 400 ? err.message : "Something went wrong. Please try again.";
      return { statusCode: status, headers, body: JSON.stringify({ error: message }) };
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
          console.log("RESEND_FIX_DEPLOYED");
          console.log("existing portal account:", existing);

          if (!existing) {
            console.log("Creating new portal account for email:", email);
            const verificationToken = generateVerificationToken();
            await createPortalAccount(email, verificationToken);
            await sendPortalVerificationEmail(email, verificationToken);

          } else if (!existing.verified?.BOOL) {
            console.log("Resending verification email for:", email);
            const token = existing.verificationToken?.S;
      if (token) {
        await sendPortalVerificationEmail(email, token);
      }
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
      const verificationToken = generateVerificationToken();
      await createPortalAccount(email, verificationToken);
      await sendPortalVerificationEmail(email, verificationToken);
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
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, email: accounts.email }),
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
      const { email, password } = body;
      if (!email || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing email or password" }) };
      }
      if (password.length < 8) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };
      }
      const account = await getPortalAccount(email);
      if (!account) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Account not found" }) };
      }
      if (!account.verified?.BOOL) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Email not verified" }) };
      }
      const dentist = await getDentistByEmail(email);
      const dentistId = dentist?.dentistId?.S || "";
      const hashed = await hashPassword(password);
      await setPortalPassword(email, hashed, dentistId);
      await sendPortalWelcomeEmail(email);
      const token = generateToken(email, dentistId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, token }) };
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
      if (!account || !account.passwordHash?.S) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid email or password" }) };
      }
      if (!account.verified?.BOOL) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Email not verified" }) };
      }
      const valid = await comparePassword(password, account.passwordHash.S);
      if (!valid) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid email or password" }) };
      }
      const dentistId = account.dentistId?.S || "";
      await updateLastLogin(email);
      const token = generateToken(email, dentistId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, token }) };
    } catch (err) {
      console.error("Login error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Login failed" }) };
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
      await sendPortalResetEmail(email, resetToken);
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
      const profile = user.dentistId ? await getDentistProfile(user.dentistId) : null;
      const availability = user.dentistId ? await getAvailability(user.dentistId) : {};
      const recentRequests = user.dentistId ? await getRecentRequests(user.dentistId) : [];
      const stats = user.dentistId ? await getDentistStats(user.dentistId) : {};
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          dentistName:          profile?.name?.S || "",
          practiceName:         profile?.practiceName?.S || "",
          email:                user.email,
          thisWeekAvailability: availability || {},
          recentRequests,
          stats,
        }),
      };
    } catch (err) {
      console.error("Dashboard error:", err.message);
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
      const body = JSON.parse(event.body || "{}");
      const { availability } = body;
      if (!availability || typeof availability !== "object") {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing availability data" }) };
      }
      await saveAvailability(user.dentistId, availability);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("Availability save error:", err.message);
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
      const availability = await getAvailability(user.dentistId);
      return { statusCode: 200, headers, body: JSON.stringify({ availability: availability || {} }) };
    } catch (err) {
      console.error("Availability fetch error:", err.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch availability" }) };
    }
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
};
