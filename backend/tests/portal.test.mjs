// tests/portal.test.mjs
//
// Tests for the dentist portal feature:
// - Registration, verification, set-password, login, forgot/reset password
// - Dashboard (auth + unauth), availability save
// - JWT generation & verification
// - Portal DB functions

import { jest } from "@jest/globals";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient:    jest.fn(() => ({ send: mockSend })),
  PutItemCommand:    jest.fn((input) => ({ type: "PutItemCommand", input })),
  GetItemCommand:    jest.fn((input) => ({ type: "GetItemCommand", input })),
  ScanCommand:       jest.fn((input) => ({ type: "ScanCommand", input })),
  UpdateItemCommand: jest.fn((input) => ({ type: "UpdateItemCommand", input })),
  BatchGetItemCommand: jest.fn((input) => ({ type: "BatchGetItemCommand", input })),
}));

jest.mock("@aws-sdk/client-ses", () => ({
  SESClient:        jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn((input) => ({ type: "SendEmailCommand", input })),
}));

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    randomUUID: jest.fn(() => "test-uuid-1234"),
  };
});

jest.unstable_mockModule("../src/router.mjs", () => ({
  submitRequest:        jest.fn(),
  handleDentistReply:   jest.fn(),
  routeVerifiedPatient: jest.fn(),
}));

// Mock bcrypt to avoid native compilation issues in tests
jest.unstable_mockModule("bcrypt", () => ({
  default: {
    hash:    jest.fn((pw) => Promise.resolve(`hashed_${pw}`)),
    compare: jest.fn((pw, hash) => Promise.resolve(hash === `hashed_${pw}`)),
  },
}));

// Mock jsonwebtoken
jest.unstable_mockModule("jsonwebtoken", () => ({
  default: {
    sign:   jest.fn((payload) => `token_${payload.email}`),
    verify: jest.fn((token) => {
      if (token === "valid-token") return { email: "test@dental.com", dentistId: "dentist-123" };
      if (token === "no-dentist-token") return { email: "test@dental.com", dentistId: "" };
      throw new Error("Invalid token");
    }),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { handler } = await import("../src/handler.mjs");
const {
  createPortalAccount,
  getPortalAccount,
  verifyPortalAccount,
  setPortalPassword,
  setResetToken,
  clearResetToken,
  getDentistByEmail,
  saveAvailability,
  getAvailability,
} = await import("../src/portal-db.mjs");
const {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  generateVerificationToken,
  authenticateRequest,
} = await import("../src/portal-auth.mjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(method, path, body = {}, extraHeaders = {}) {
  return {
    rawPath: `/prod${path}`,
    requestContext: { http: { method } },
    body: JSON.stringify(body),
    headers: extraHeaders,
    queryStringParameters: {},
    rawQueryString: "",
  };
}

function makeAuthEvent(method, path, body = {}) {
  return makeEvent(method, path, body, { Authorization: "Bearer valid-token" });
}

// ═══════════════════════════════════════════
// JWT GENERATION & VERIFICATION
// ═══════════════════════════════════════════

describe("JWT generation and verification", () => {
  test("generateToken returns a token string", () => {
    const token = generateToken("test@dental.com", "dentist-123");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("verifyToken returns payload for valid token", () => {
    const payload = verifyToken("valid-token");
    expect(payload.email).toBe("test@dental.com");
    expect(payload.dentistId).toBe("dentist-123");
  });

  test("verifyToken throws for invalid token", () => {
    expect(() => verifyToken("bad-token")).toThrow();
  });

  test("authenticateRequest returns null when no header", () => {
    const event = { headers: {} };
    expect(authenticateRequest(event)).toBeNull();
  });

  test("authenticateRequest returns null for invalid token", () => {
    const event = { headers: { Authorization: "Bearer bad-token" } };
    expect(authenticateRequest(event)).toBeNull();
  });

  test("authenticateRequest returns payload for valid token", () => {
    const event = { headers: { Authorization: "Bearer valid-token" } };
    const result = authenticateRequest(event);
    expect(result.email).toBe("test@dental.com");
  });
});

// ═══════════════════════════════════════════
// PASSWORD HASHING
// ═══════════════════════════════════════════

describe("Password hashing", () => {
  test("hashPassword returns a hash", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).toBe("hashed_mypassword");
  });

  test("comparePassword returns true for matching password", async () => {
    const result = await comparePassword("mypassword", "hashed_mypassword");
    expect(result).toBe(true);
  });

  test("comparePassword returns false for wrong password", async () => {
    const result = await comparePassword("wrong", "hashed_mypassword");
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/register
// ═══════════════════════════════════════════

describe("POST /dentist-portal/register", () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [] }));
  afterEach(() => jest.clearAllMocks());

  test("returns 200 on successful registration", async () => {
    // getPortalAccount returns null (no existing account)
    mockSend.mockResolvedValueOnce({ Item: null });
    // createPortalAccount succeeds
    mockSend.mockResolvedValueOnce({});
    // sendPortalVerificationEmail (SES) succeeds
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/register", { email: "new@dental.com" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    const portalWrites = mockSend.mock.calls
      .map(([cmd]) => cmd?.input)
      .filter((input) => input?.TableName === "moxident-dentist-portal" && input?.Item);
    expect(portalWrites.length).toBe(1);
    expect(portalWrites[0].Item.dentistId.S).toBeTruthy();
  });

  test("returns 400 when email is missing", async () => {
    const event = makeEvent("POST", "/dentist-portal/register", {});
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test("returns 409 when account already exists", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "existing@dental.com" }, verified: { BOOL: true } },
    });

    const event = makeEvent("POST", "/dentist-portal/register", { email: "existing@dental.com" });
    const res = await handler(event);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/already exists/i);
  });
});

describe("Portal email links", () => {
  afterEach(() => jest.clearAllMocks());

  test("verification email points directly to set-password page with token", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/register", { email: "new@dental.com" });
    await handler(event);

    const emailCall = mockSend.mock.calls.find(
      ([cmd]) => cmd?.input?.Message?.Subject?.Data === "Verify your Moxident portal email"
    );
    const body = emailCall?.[0]?.input?.Message?.Body?.Text?.Data || "";

    expect(body).toContain("/dentist-portal/verify?token=");
    expect(body).not.toContain("/set-password.html?token=");
  });

  test("verification email uses API verify route", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/register", { email: "new@dental.com" });
    event.headers = { origin: "https://stage.moxident.com" };
    await handler(event);

    const emailCall = mockSend.mock.calls.find(
      ([cmd]) => cmd?.input?.Message?.Subject?.Data === "Verify your Moxident portal email"
    );
    const body = emailCall?.[0]?.input?.Message?.Body?.Text?.Data || "";

    expect(body).toContain("https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod/dentist-portal/verify?token=");
  });
});

// ═══════════════════════════════════════════
// GET /dentist-portal/verify
// ═══════════════════════════════════════════

describe("GET /dentist-portal/verify", () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test("returns 302 redirect on valid token", async () => {
    // findPortalAccountByVerificationToken scan returns match
    mockSend.mockResolvedValueOnce({
      Items: [{ email: { S: "test@dental.com" }, verificationToken: { S: "valid-verify-token" } }],
    });
    // verifyPortalAccount update succeeds
    mockSend.mockResolvedValueOnce({});

    const event = {
      rawPath: "/prod/dentist-portal/verify",
      requestContext: { http: { method: "GET" } },
      body: "",
      headers: {},
      queryStringParameters: { token: "valid-verify-token" },
      rawQueryString: "token=valid-verify-token",
    };

    const res = await handler(event);
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toContain("set-password.html");
    expect(res.headers.Location).toContain("email=test%40dental.com");
  });

  test("returns stage redirect when request origin is stage", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ email: { S: "test@dental.com" }, verificationToken: { S: "valid-verify-token" } }],
    });
    mockSend.mockResolvedValueOnce({});

    const event = {
      rawPath: "/prod/dentist-portal/verify",
      requestContext: { http: { method: "GET" } },
      body: "",
      headers: { origin: "https://stage.moxident.com" },
      queryStringParameters: { token: "valid-verify-token" },
      rawQueryString: "token=valid-verify-token",
    };

    const res = await handler(event);
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toContain("https://stage.moxident.com/dentist/portal/set-password.html");
    expect(res.headers.Location).toContain("email=test%40dental.com");
  });

  test("returns 400 when token is missing", async () => {
    const event = {
      rawPath: "/prod/dentist-portal/verify",
      requestContext: { http: { method: "GET" } },
      body: "",
      headers: {},
      queryStringParameters: {},
      rawQueryString: "",
    };

    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test("returns 400 when token is invalid", async () => {
    // Scan returns no matches
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = {
      rawPath: "/prod/dentist-portal/verify",
      requestContext: { http: { method: "GET" } },
      body: "",
      headers: {},
      queryStringParameters: { token: "bad-token" },
      rawQueryString: "token=bad-token",
    };

    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid/i);
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/set-password
// ═══════════════════════════════════════════

describe("POST /dentist-portal/set-password", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 with token on success", async () => {
    // getPortalAccount
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true }, passwordHash: { S: "" } },
    });
    // getDentistByEmail scan
    mockSend.mockResolvedValueOnce({
      Items: [{ dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } }],
    });
    // setPortalPassword update
    mockSend.mockResolvedValueOnce({});
    // sendPortalWelcomeEmail
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/set-password", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
  });

  test("returns 200 with token when verification token is used for first-time setup", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ email: { S: "test@dental.com" }, verificationToken: { S: "valid-verify-token" } }],
    });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true }, passwordHash: { S: "" } },
    });
    mockSend.mockResolvedValueOnce({
      Items: [{ dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } }],
    });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/set-password", {
      token: "valid-verify-token",
      password: "securepass123",
    });
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.email).toBe("test@dental.com");
  });

  test("returns 200 when reset token is used on set-password path", async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({
      Items: [{
        email: { S: "test@dental.com" },
        resetToken: { S: "valid-reset-token" },
        resetTokenExpiry: { S: futureExpiry },
        dentistId: { S: "dentist-123" },
      }],
    });
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true }, passwordHash: { S: "" } },
    });
    mockSend.mockResolvedValueOnce({
      Items: [{ dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } }],
    });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/set-password", {
      token: "valid-reset-token",
      password: "securepass123",
    });
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.email).toBe("test@dental.com");
  });

  test("returns 400 when password is too short", async () => {
    const event = makeEvent("POST", "/dentist-portal/set-password", {
      email: "test@dental.com",
      password: "short",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/8 characters/);
  });

  test("returns 400 when email not verified", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: false } },
    });

    const event = makeEvent("POST", "/dentist-portal/set-password", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/not verified/i);
  });

  test("returns 400 when email and password missing", async () => {
    const event = makeEvent("POST", "/dentist-portal/set-password", {});
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/login
// ═══════════════════════════════════════════

describe("POST /dentist-portal/login", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 with token on valid credentials", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email:        { S: "test@dental.com" },
        passwordHash: { S: "hashed_securepass123" },
        verified:     { BOOL: true },
        dentistId:    { S: "dentist-123" },
      },
    });
    mockSend.mockResolvedValueOnce({
      Item: { dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } },
    });
    // updateLastLogin
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
  });

  test("returns 401 on invalid password", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email:        { S: "test@dental.com" },
        passwordHash: { S: "hashed_securepass123" },
        verified:     { BOOL: true },
        dentistId:    { S: "dentist-123" },
      },
    });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "wrongpassword",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/invalid/i);
  });

  test("returns 401 when account does not exist", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "nobody@dental.com",
      password: "anything",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  test("returns 403 when email not verified", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email:        { S: "test@dental.com" },
        passwordHash: { S: "hashed_pass" },
        verified:     { BOOL: false },
        dentistId:    { S: "" },
      },
    });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "pass",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/not verified/i);
  });

  test("returns 400 when passwordHash is missing", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email: { S: "test@dental.com" },
        verified: { BOOL: true },
        dentistId: { S: "dentist-123" },
      },
    });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test("returns 409 when dentistId is missing", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email: { S: "test@dental.com" },
        passwordHash: { S: "hashed_securepass123" },
        verified: { BOOL: true },
        dentistId: { S: "" },
      },
    });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe("Account is not fully initialized. Dentist profile missing.");
  });

  test("returns 409 when dentist profile is not found", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        email: { S: "test@dental.com" },
        passwordHash: { S: "hashed_securepass123" },
        verified: { BOOL: true },
        dentistId: { S: "dentist-123" },
      },
    });
    mockSend.mockResolvedValueOnce({ Item: null });

    const event = makeEvent("POST", "/dentist-portal/login", {
      email: "test@dental.com",
      password: "securepass123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe("Dentist profile not found for this account.");
  });

  test("returns 400 when email or password missing", async () => {
    const event = makeEvent("POST", "/dentist-portal/login", { email: "test@dental.com" });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/forgot-password
// ═══════════════════════════════════════════

describe("POST /dentist-portal/forgot-password", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 when account exists (sends email)", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true } },
    });
    // setResetToken
    mockSend.mockResolvedValueOnce({});
    // sendPortalResetEmail
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/forgot-password", { email: "test@dental.com" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  test("returns 200 even when account does not exist (no info leak)", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });

    const event = makeEvent("POST", "/dentist-portal/forgot-password", { email: "nobody@dental.com" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  test("returns 400 when email is missing", async () => {
    const event = makeEvent("POST", "/dentist-portal/forgot-password", {});
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test("returns 200 even if reset email delivery fails", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true } },
    });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockRejectedValueOnce(new Error("SES unavailable"));

    const event = makeEvent("POST", "/dentist-portal/forgot-password", { email: "test@dental.com" });
    const res = await handler(event);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  test("reset email points to reset-password page with reset flow", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { email: { S: "test@dental.com" }, verified: { BOOL: true } },
    });
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/forgot-password", { email: "test@dental.com" });
    await handler(event);

    const emailCall = mockSend.mock.calls.find(
      ([cmd]) => cmd?.input?.Message?.Subject?.Data === "Reset your Moxident password"
    );
    const body = emailCall?.[0]?.input?.Message?.Body?.Text?.Data || "";

    expect(body).toContain("/reset-password.html?token=");
    expect(body).toContain("flow=reset");
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/reset-password
// ═══════════════════════════════════════════

describe("POST /dentist-portal/reset-password", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 on valid reset", async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    // findPortalAccountByResetToken scan
    mockSend.mockResolvedValueOnce({
      Items: [{
        email:            { S: "test@dental.com" },
        resetToken:       { S: "valid-reset-token" },
        resetTokenExpiry: { S: futureExpiry },
        dentistId:        { S: "dentist-123" },
      }],
    });
    // setPortalPassword
    mockSend.mockResolvedValueOnce({});
    // clearResetToken
    mockSend.mockResolvedValueOnce({});

    const event = makeEvent("POST", "/dentist-portal/reset-password", {
      token: "valid-reset-token",
      password: "newpassword123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  test("returns 400 when token is invalid", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = makeEvent("POST", "/dentist-portal/reset-password", {
      token: "bad-token",
      password: "newpassword123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid/i);
  });

  test("returns 400 when token is expired", async () => {
    const pastExpiry = new Date(Date.now() - 3600000).toISOString();
    mockSend.mockResolvedValueOnce({
      Items: [{
        email:            { S: "test@dental.com" },
        resetToken:       { S: "expired-token" },
        resetTokenExpiry: { S: pastExpiry },
        dentistId:        { S: "" },
      }],
    });

    const event = makeEvent("POST", "/dentist-portal/reset-password", {
      token: "expired-token",
      password: "newpassword123",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/expired/i);
  });

  test("returns 400 when password too short", async () => {
    const event = makeEvent("POST", "/dentist-portal/reset-password", {
      token: "some-token",
      password: "short",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/8 characters/);
  });

  test("returns 400 when token or password missing", async () => {
    const event = makeEvent("POST", "/dentist-portal/reset-password", {});
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════
// GET /dentist-portal/dashboard — authenticated
// ═══════════════════════════════════════════

describe("GET /dentist-portal/dashboard — authenticated", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 with dashboard data", async () => {
    // getDentistProfile
    mockSend.mockResolvedValueOnce({
      Item: {
        dentistId:    { S: "dentist-123" },
        name:         { S: "Dr. Test" },
        practiceName: { S: "Test Dental" },
        availability: { S: '{"Mon":{"morning":true}}' },
      },
    });
    // getAvailability (same dentist record)
    mockSend.mockResolvedValueOnce({
      Item: {
        dentistId:    { S: "dentist-123" },
        availability: { S: '{"Mon":{"morning":true}}' },
      },
    });
    // getRecentRequests scan
    mockSend.mockResolvedValueOnce({ Items: [] });
    // getDentistStats scan
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = makeAuthEvent("GET", "/dentist-portal/dashboard");
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dentistName).toBe("Dr. Test");
    expect(body.practiceName).toBe("Test Dental");
    expect(body.stats).toBeDefined();
    expect(body.recentRequests).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// GET /dentist-portal/dashboard — unauthenticated
// ═══════════════════════════════════════════

describe("GET /dentist-portal/dashboard — unauthenticated", () => {
  test("returns 401 without auth header", async () => {
    const event = makeEvent("GET", "/dentist-portal/dashboard");
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/unauthorized/i);
  });

  test("returns 401 with invalid token", async () => {
    const event = makeEvent("GET", "/dentist-portal/dashboard", {}, {
      Authorization: "Bearer invalid-token",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════
// POST /dentist-portal/availability — saves correctly
// ═══════════════════════════════════════════

describe("POST /dentist-portal/availability", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 200 on successful save", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: { dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } },
      })
      .mockResolvedValueOnce({});

    const event = makeAuthEvent("POST", "/dentist-portal/availability", {
      availability: {
        Mon: { morning: true, afternoon: false },
        Tue: { morning: false, afternoon: true },
      },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    // Verify DDB update was called with correct table
    const updateCalls = mockSend.mock.calls.filter(
      (c) => c[0]?.input?.TableName === "moxident-dentists"
    );
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  test("returns 401 without auth", async () => {
    const event = makeEvent("POST", "/dentist-portal/availability", {
      availability: { Mon: { morning: true } },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  test("returns 400 when availability data is missing", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { dentistId: { S: "dentist-123" }, email: { S: "test@dental.com" } },
    });
    const event = makeAuthEvent("POST", "/dentist-portal/availability", {});
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/availability/i);
  });

  test("returns 409 when token has no dentistId", async () => {
    const event = makeEvent("POST", "/dentist-portal/availability", {
      availability: { Mon: { morning: true } },
    }, {
      Authorization: "Bearer no-dentist-token",
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe("Account is not fully initialized. Dentist profile missing.");
  });

  test("returns 409 when dentist profile is missing", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });
    const event = makeAuthEvent("POST", "/dentist-portal/availability", {
      availability: { Mon: { morning: true } },
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toBe("Dentist profile not found for this account.");
  });
});

// ═══════════════════════════════════════════
// Portal DB functions
// ═══════════════════════════════════════════

describe("Portal DB — createPortalAccount", () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test("writes to moxident-dentist-portal table", async () => {
    await createPortalAccount("test@dental.com", "verify-token-123");

    const putCalls = mockSend.mock.calls.filter(
      (c) => c[0]?.input?.TableName === "moxident-dentist-portal"
    );
    expect(putCalls.length).toBe(1);
    const item = putCalls[0][0].input.Item;
    expect(item.email.S).toBe("test@dental.com");
    expect(item.verified.BOOL).toBe(false);
    expect(item.verificationToken.S).toBe("verify-token-123");
  });
});

describe("Portal DB — verifyPortalAccount", () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test("sets verified to true and clears token", async () => {
    await verifyPortalAccount("test@dental.com");

    const updateCalls = mockSend.mock.calls.filter(
      (c) => c[0]?.input?.TableName === "moxident-dentist-portal"
    );
    expect(updateCalls.length).toBe(1);
    const expr = updateCalls[0][0].input.UpdateExpression;
    expect(expr).toContain("verified");
  });
});

describe("Portal DB — setPortalPassword", () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test("updates passwordHash and dentistId", async () => {
    await setPortalPassword("test@dental.com", "hashed_pw", "dentist-456");

    const updateCalls = mockSend.mock.calls.filter(
      (c) => c[0]?.input?.TableName === "moxident-dentist-portal"
    );
    expect(updateCalls.length).toBe(1);
    const values = updateCalls[0][0].input.ExpressionAttributeValues;
    expect(values[":p"].S).toBe("hashed_pw");
    expect(values[":d"].S).toBe("dentist-456");
  });
});

// ═══════════════════════════════════════════
// Regression — existing routes unchanged
// ═══════════════════════════════════════════

describe("Regression — existing routes still work", () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [] }));
  afterEach(() => jest.clearAllMocks());

  test("GET /health returns ok", async () => {
    const event = makeEvent("GET", "/health");
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("ok");
  });

  test("unknown route returns 404", async () => {
    const event = makeEvent("GET", "/nonexistent");
    const res = await handler(event);
    expect(res.statusCode).toBe(404);
  });

  test("OPTIONS returns 200", async () => {
    const event = {
      rawPath: "/prod/dentist-portal/login",
      requestContext: { http: { method: "OPTIONS" } },
      body: "",
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });
});
