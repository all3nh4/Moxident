// tests/otp.test.mjs
//
// Run: node --experimental-vm-modules node_modules/.bin/jest otp.test.mjs
//
// Covers the /submit → /verify-otp flow end-to-end at the handler level,
// plus the verifyPatientOtp contract against DynamoDB failure modes.
//
// Option B design: OTP state lives on the moxident-patients row (no separate
// OTP table). /submit saves a pending row with isVerified:false; /verify-otp
// flips it atomically and then runs routeVerifiedPatient.

import { jest } from '@jest/globals';

const mockDynamoSend = jest.fn();
const mockSnsSend    = jest.fn();
const mockSesSend    = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient:      jest.fn(() => ({ send: mockDynamoSend })),
  PutItemCommand:      jest.fn(input => ({ type: 'PutItemCommand', input })),
  UpdateItemCommand:   jest.fn(input => ({ type: 'UpdateItemCommand', input })),
  GetItemCommand:      jest.fn(input => ({ type: 'GetItemCommand', input })),
  ScanCommand:         jest.fn(input => ({ type: 'ScanCommand', input })),
  BatchGetItemCommand: jest.fn(input => ({ type: 'BatchGetItemCommand', input })),
}));

jest.unstable_mockModule('@aws-sdk/client-sns', () => ({
  SNSClient:      jest.fn(() => ({ send: mockSnsSend })),
  PublishCommand: jest.fn(input => ({ type: 'PublishCommand', input })),
}));

jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient:        jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn(input => ({ type: 'SendEmailCommand', input })),
}));

jest.unstable_mockModule('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    default: actual,
    randomUUID: jest.fn(() => 'patient-uuid-1'),
  };
});

jest.unstable_mockModule('../src/router.mjs', () => ({
  submitRequest:        jest.fn(),
  handleDentistReply:   jest.fn(),
  routeVerifiedPatient: jest.fn(),
}));

const { handler }              = await import('../src/handler.mjs');
const { routeVerifiedPatient } = await import('../src/router.mjs');
const db                       = await import('../src/db.mjs');

function makeEvent(method, path, body = {}) {
  return {
    rawPath: `/prod${path}`,
    requestContext: { http: { method } },
    body: JSON.stringify(body),
  };
}

function patientAttributes(over = {}) {
  return {
    Attributes: {
      requestId: { S: 'patient-uuid-1' },
      name:      { S: over.name    ?? 'Jane' },
      phone:     { S: over.phone   ?? '2065550001' },
      zip:       { S: over.zip     ?? '98033' },
      symptom:   { S: over.symptom ?? 'Tooth pain' },
    },
  };
}

function conditionalCheckFailed() {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
}

beforeEach(() => {
  mockDynamoSend.mockReset();
  mockSnsSend.mockReset();
  mockSesSend.mockReset();
  routeVerifiedPatient.mockReset();
  process.env.SMS_ENABLED = 'true';
  mockSnsSend.mockResolvedValue({});
  mockSesSend.mockResolvedValue({});
});

// ─── /submit — saves pending row, SMSes code, does NOT route to dentist ───────

describe('POST /submit — OTP staging on patients table', () => {
  test('saves patient with isVerified:false, auto-verifies, and routes immediately', async () => {
    mockDynamoSend.mockResolvedValueOnce({}); // savePatient PutItem
    mockDynamoSend.mockResolvedValueOnce({}); // markPatientOtpVerified UpdateItem
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'patient-uuid-1',
      dentistFound: true,
      unsupportedArea: false,
    });

    const res = await handler(makeEvent('POST', '/submit', {
      name: 'Jane', phone: '2065550001', zip: '98033', symptom: 'Tooth pain',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe('patient-uuid-1');
    expect(body.otpStatus).toBe('verified');
    expect(body.dentistFound).toBe(true);
    expect(body.unsupportedArea).toBe(false);

    const putCall = mockDynamoSend.mock.calls.find(c => c[0].type === 'PutItemCommand');
    expect(putCall).toBeDefined();
    const item = putCall[0].input.Item;
    expect(item.requestId.S).toBe('patient-uuid-1');
    expect(item.name.S).toBe('Jane');
    expect(item.phone.S).toBe('2065550001');
    expect(item.zip.S).toBe('98033');
    expect(item.symptom.S).toBe('Tooth pain');
    expect(item.isVerified.BOOL).toBe(false);
    expect(item.otpStatus.S).toBe('generated');
    expect(item.smsError.S).toBe('');
    expect(item.otpCode.S).toMatch(/^\d{6}$/);
    expect(item.otpAttempts.N).toBe('0');
    const expiry = Number(item.otpExpiresAt.N);
    expect(expiry).toBeGreaterThan(Date.now());
    expect(expiry - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 50); // 5 min window

    const updateCall = mockDynamoSend.mock.calls.find(c => c[0].type === 'UpdateItemCommand');
    expect(updateCall).toBeDefined();
    expect(updateCall[0].input.UpdateExpression).toBe('SET isVerified = :true, otpStatus = :verifiedStatus');
    expect(updateCall[0].input.ExpressionAttributeValues[':verifiedStatus'].S).toBe('verified');

    expect(mockSnsSend).not.toHaveBeenCalled();
    expect(routeVerifiedPatient).toHaveBeenCalledWith({
      requestId: 'patient-uuid-1',
      name: 'Jane',
      phone: '2065550001',
      zip: '98033',
      symptom: 'Tooth pain',
    });
  });

  test('disabled mode ignores SMS env and still auto-verifies the patient flow', async () => {
    process.env.SMS_ENABLED = 'false';
    mockDynamoSend.mockResolvedValueOnce({}); // savePatient PutItem
    mockDynamoSend.mockResolvedValueOnce({}); // markPatientOtpVerified UpdateItem
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'patient-uuid-1',
      dentistFound: true,
      unsupportedArea: false,
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await handler(makeEvent('POST', '/submit', {
      name: 'Jane', phone: '2065550001', zip: '98033', symptom: 'Tooth pain',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe('patient-uuid-1');
    expect(body.otpStatus).toBe('verified');
    expect(body.dentistFound).toBe(true);
    expect(body.unsupportedArea).toBe(false);

    const putCall = mockDynamoSend.mock.calls.find(c => c[0].type === 'PutItemCommand');
    expect(putCall).toBeDefined();
    const item = putCall[0].input.Item;
    expect(item.otpStatus.S).toBe('generated');
    expect(item.otpCode.S).toMatch(/^\d{6}$/);

    const updateCalls = mockDynamoSend.mock.calls.filter(c => c[0].type === 'UpdateItemCommand');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0].input.UpdateExpression).toBe('SET isVerified = :true, otpStatus = :verifiedStatus');

    expect(mockSnsSend).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('OTP (disabled mode):', item.otpCode.S);
    expect(routeVerifiedPatient).toHaveBeenCalledWith({
      requestId: 'patient-uuid-1',
      name: 'Jane',
      phone: '2065550001',
      zip: '98033',
      symptom: 'Tooth pain',
    });

    logSpy.mockRestore();
  });

  test('does not attempt SMS even when SMS is enabled', async () => {
    process.env.SMS_ENABLED = 'true';
    mockDynamoSend.mockResolvedValueOnce({}); // savePatient PutItem
    mockDynamoSend.mockResolvedValueOnce({}); // markPatientOtpVerified UpdateItem
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'patient-uuid-1',
      dentistFound: false,
      unsupportedArea: true,
    });

    const res = await handler(makeEvent('POST', '/submit', {
      name: 'Jane', phone: '2065550001', zip: '98033', symptom: 'Tooth pain',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe('patient-uuid-1');
    expect(body.otpStatus).toBe('verified');
    expect(body.unsupportedArea).toBe(true);

    const putCall = mockDynamoSend.mock.calls.find(c => c[0].type === 'PutItemCommand');
    expect(putCall).toBeDefined();

    const updateCall = mockDynamoSend.mock.calls.find(c => c[0].type === 'UpdateItemCommand');
    expect(updateCall).toBeDefined();
    expect(updateCall[0].input.ExpressionAttributeValues[':verifiedStatus'].S).toBe('verified');

    expect(mockSnsSend).not.toHaveBeenCalled();
    expect(routeVerifiedPatient).toHaveBeenCalled();
  });

  test('returns 400 when required fields missing', async () => {
    const res = await handler(makeEvent('POST', '/submit', { name: 'Jane' }));
    expect(res.statusCode).toBe(400);
    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(mockSnsSend).not.toHaveBeenCalled();
    expect(routeVerifiedPatient).not.toHaveBeenCalled();
  });
});

// ─── /verify-otp — verifies, then routes ──────────────────────────────────────

describe('POST /verify-otp — success path', () => {
  test('verifies OTP atomically and calls routeVerifiedPatient with patient fields', async () => {
    mockDynamoSend.mockResolvedValueOnce(patientAttributes()); // verifyPatientOtp UpdateItem
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'patient-uuid-1', dentistFound: true, unsupportedArea: false,
    });

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'patient-uuid-1', code: '123456',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe('patient-uuid-1');
    expect(body.dentistFound).toBe(true);
    expect(body.unsupportedArea).toBe(false);

    expect(routeVerifiedPatient).toHaveBeenCalledWith({
      requestId: 'patient-uuid-1',
      name: 'Jane', phone: '2065550001', zip: '98033', symptom: 'Tooth pain',
    });
  });

  test('propagates unsupportedArea from routing', async () => {
    mockDynamoSend.mockResolvedValueOnce(patientAttributes({ zip: '99999' }));
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'patient-uuid-1', dentistFound: false, unsupportedArea: true,
    });

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'patient-uuid-1', code: '123456',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.unsupportedArea).toBe(true);
    expect(body.dentistFound).toBe(false);
  });
});

describe('POST /verify-otp — rejection paths', () => {
  test('returns 400 when requestId or code missing', async () => {
    const res = await handler(makeEvent('POST', '/verify-otp', { requestId: 'x' }));
    expect(res.statusCode).toBe(400);
    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(routeVerifiedPatient).not.toHaveBeenCalled();
  });

  test('wrong code — rejects and increments otpAttempts; does NOT call routeVerifiedPatient', async () => {
    mockDynamoSend.mockRejectedValueOnce(conditionalCheckFailed()); // verify fails
    mockDynamoSend.mockResolvedValueOnce({});                        // attempts-increment

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'patient-uuid-1', code: '000000',
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Invalid or expired/i);
    expect(routeVerifiedPatient).not.toHaveBeenCalled();

    const updates = mockDynamoSend.mock.calls.filter(c => c[0].type === 'UpdateItemCommand');
    expect(updates).toHaveLength(2);
    expect(updates[1][0].input.UpdateExpression).toBe('ADD otpAttempts :one');
  });

  test('attempts-increment swallowed when row missing or already verified', async () => {
    mockDynamoSend.mockRejectedValueOnce(conditionalCheckFailed());
    mockDynamoSend.mockRejectedValueOnce(conditionalCheckFailed());

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'patient-uuid-1', code: '000000',
    }));

    expect(res.statusCode).toBe(400);
    expect(routeVerifiedPatient).not.toHaveBeenCalled();
  });
});

// ─── /resend-otp ──────────────────────────────────────────────────────────────

describe('POST /resend-otp', () => {
  test('success: updates row, resets attempts, SMSes a new 6-digit code', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Attributes: { phone: { S: '2065550001' } },
    });
    mockDynamoSend.mockResolvedValueOnce({});

    const res = await handler(makeEvent('POST', '/resend-otp', {
      requestId: 'patient-uuid-1',
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);

    const update = mockDynamoSend.mock.calls[0][0].input;
    expect(update.UpdateExpression).toBe(
      'SET otpCode = :code, otpExpiresAt = :exp, otpAttempts = :zero ADD resendCount :one'
    );
    expect(update.ConditionExpression).toContain('isVerified = :false');
    expect(update.ConditionExpression).toContain('resendCount < :max');
    expect(update.ExpressionAttributeValues[':max'].N).toBe('3');
    expect(update.ExpressionAttributeValues[':code'].S).toMatch(/^\d{6}$/);
    expect(update.ExpressionAttributeValues[':zero'].N).toBe('0');

    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    const snsInput = mockSnsSend.mock.calls[0][0].input;
    expect(snsInput.PhoneNumber).toBe('+12065550001');
    expect(snsInput.Message).toBe(
      `Your Moxident code is ${update.ExpressionAttributeValues[':code'].S}`
    );

    expect(JSON.parse(res.body).otpStatus).toBe('sent');
  });

  test('local mode updates OTP without sending SMS', async () => {
    process.env.SMS_ENABLED = 'false';
    mockDynamoSend.mockResolvedValueOnce({
      Attributes: { phone: { S: '2065550001' } },
    });
    mockDynamoSend.mockResolvedValueOnce({});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await handler(makeEvent('POST', '/resend-otp', {
      requestId: 'patient-uuid-1',
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true, otpStatus: 'generated' });
    expect(mockSnsSend).not.toHaveBeenCalled();

    const updateCalls = mockDynamoSend.mock.calls.filter(c => c[0].type === 'UpdateItemCommand');
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1][0].input.ExpressionAttributeValues[':otpStatus'].S).toBe('generated');
    expect(logSpy).toHaveBeenCalledWith(
      'OTP (local mode):',
      updateCalls[0][0].input.ExpressionAttributeValues[':code'].S
    );

    logSpy.mockRestore();
  });

  test('returns 400 when missing requestId', async () => {
    const res = await handler(makeEvent('POST', '/resend-otp', {}));
    expect(res.statusCode).toBe(400);
    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(mockSnsSend).not.toHaveBeenCalled();
  });

  test('rate-limited or already-verified: 400 with generic message, no SMS', async () => {
    mockDynamoSend.mockRejectedValueOnce(conditionalCheckFailed());

    const res = await handler(makeEvent('POST', '/resend-otp', {
      requestId: 'patient-uuid-1',
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Cannot resend/i);
    expect(mockSnsSend).not.toHaveBeenCalled();
  });

  test('unknown DynamoDB error surfaces as 500', async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error('network down'));

    const res = await handler(makeEvent('POST', '/resend-otp', {
      requestId: 'patient-uuid-1',
    }));

    expect(res.statusCode).toBe(500);
    expect(mockSnsSend).not.toHaveBeenCalled();
  });
});

// ─── verifyPatientOtp direct contract ─────────────────────────────────────────

describe('verifyPatientOtp contract', () => {
  test('success returns patient fields from ALL_OLD attributes', async () => {
    mockDynamoSend.mockResolvedValueOnce(patientAttributes());
    const result = await db.verifyPatientOtp('patient-uuid-1', '123456');
    expect(result.success).toBe(true);
    expect(result.patient).toEqual({
      name: 'Jane', phone: '2065550001', zip: '98033', symptom: 'Tooth pain',
    });
  });

  test('condition expression checks code, expiry, isVerified=false, and attempts cap', async () => {
    mockDynamoSend.mockResolvedValueOnce(patientAttributes());
    await db.verifyPatientOtp('patient-uuid-1', '123456');
    const call = mockDynamoSend.mock.calls[0][0];
    expect(call.input.UpdateExpression).toBe('SET isVerified = :true, otpStatus = :verifiedStatus');
    expect(call.input.ConditionExpression).toContain('otpCode = :code');
    expect(call.input.ConditionExpression).toContain('otpExpiresAt > :now');
    expect(call.input.ConditionExpression).toContain('isVerified = :false');
    expect(call.input.ConditionExpression).toContain('otpAttempts < :max');
    expect(call.input.ExpressionAttributeValues[':max'].N).toBe('5');
    expect(call.input.ExpressionAttributeValues[':verifiedStatus'].S).toBe('verified');
  });

  test('condition failure returns success:false without throwing', async () => {
    mockDynamoSend.mockRejectedValueOnce(conditionalCheckFailed());
    mockDynamoSend.mockResolvedValueOnce({});
    const result = await db.verifyPatientOtp('patient-uuid-1', '000000');
    expect(result.success).toBe(false);
  });

  test('non-conditional errors propagate', async () => {
    const boom = new Error('network down');
    mockDynamoSend.mockRejectedValueOnce(boom);
    await expect(db.verifyPatientOtp('x', 'y')).rejects.toThrow('network down');
  });
});
