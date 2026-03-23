// src/handler.test.mjs
//
// Run: node --experimental-vm-modules node_modules/.bin/jest handler.test.mjs
// Or:  npm test (if jest is configured in package.json)
//
// These tests mock DynamoDB and SES so nothing hits AWS.

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient:   jest.fn(() => ({ send: mockSend })),
  PutItemCommand:   jest.fn(input => ({ type: 'PutItemCommand', input })),
  ScanCommand:      jest.fn(input => ({ type: 'ScanCommand', input })),
  UpdateItemCommand:jest.fn(input => ({ type: 'UpdateItemCommand', input })),
  GetItemCommand:   jest.fn(input => ({ type: 'GetItemCommand', input })),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient:        jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn(input => ({ type: 'SendEmailCommand', input })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { saveDentistApplication } = await import('../src/db.mjs');
const { handler }                = await import('../src/handler.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(method, path, body = {}) {
  return {
    rawPath: `/prod${path}`,
    requestContext: { http: { method } },
    body: JSON.stringify(body),
  };
}

// ── saveDentistApplication ────────────────────────────────────────────────────

describe('saveDentistApplication', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('writes all new onboarding fields to DynamoDB', async () => {
    const data = {
      name:             'Dr. Jane Smith',
      practiceName:     'Smile Dental',
      phone:            '+12065550000',
      email:            'jane@smiledental.com',
      zipCodes:         '98101, 98102',
      dailyCapacity:    '5',
      insuranceAccepted:'Delta, Cigna',
      yearsInPractice:  '10',
      acceptsUninsured: 'yes',
      extendedHours:    'weekends',
      specialties:      'extractions, fillings',
    };

    const id = await saveDentistApplication(data);

    expect(typeof id).toBe('string'); expect(id.length).toBeGreaterThan(0);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const putCall = mockSend.mock.calls[0][0];
    const item = putCall.input.Item;

    expect(item.applicationId.S).toBe(id);
    expect(item.name.S).toBe('Dr. Jane Smith');
    expect(item.practiceName.S).toBe('Smile Dental');
    expect(item.phone.S).toBe('+12065550000');
    expect(item.email.S).toBe('jane@smiledental.com');
    expect(item.zipCodes.S).toBe('98101, 98102');
    expect(item.dailyCapacity.S).toBe('5');
    expect(item.insuranceAccepted.S).toBe('Delta, Cigna');
    expect(item.yearsInPractice.S).toBe('10');
    expect(item.acceptsUninsured.S).toBe('yes');
    expect(item.extendedHours.S).toBe('weekends');
    expect(item.specialties.S).toBe('extractions, fillings');
    expect(item.status.S).toBe('pending');
    expect(item.source.S).toBe('dentist-join-page');
    expect(item.submittedAt.S).toBeTruthy();
  });

  test('keeps legacy fields intact for backwards compatibility', async () => {
    const data = {
      name: 'Dr. Test',
      phone: '+12065550001',
      email: 'test@test.com',
      area: 'Seattle',
      openSlots: '3',
      willingToPay: 'yes',
    };

    await saveDentistApplication(data);

    const putCall = mockSend.mock.calls[0][0];
    const item = putCall.input.Item;

    expect(item.area.S).toBe('Seattle');
    expect(item.openSlots.S).toBe('3');
    expect(item.willingToPay.S).toBe('yes');
  });

  test('handles missing optional fields gracefully — writes empty strings', async () => {
    const data = {
      name:  'Dr. Minimal',
      phone: '+12065550002',
      email: 'min@test.com',
    };

    await saveDentistApplication(data);

    const putCall = mockSend.mock.calls[0][0];
    const item = putCall.input.Item;

    expect(item.practiceName.S).toBe('');
    expect(item.zipCodes.S).toBe('');
    expect(item.dailyCapacity.S).toBe('');
    expect(item.specialties.S).toBe('');
  });

  test('always sets status to pending regardless of input', async () => {
    await saveDentistApplication({ name: 'Dr. X', phone: '+1', email: 'x@x.com', status: 'approved' });
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.status.S).toBe('pending');
  });
});

// ── POST /dentist-signup handler ──────────────────────────────────────────────

describe('POST /dentist-signup', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('returns 200 with applicationId on valid submission', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:             'Dr. Jane Smith',
      practiceName:     'Smile Dental',
      phone:            '+12065550000',
      email:            'jane@smiledental.com',
      zipCodes:         '98101',
      dailyCapacity:    '4',
      insuranceAccepted:'Delta',
      yearsInPractice:  '8',
      acceptsUninsured: 'yes',
      extendedHours:    'no',
      specialties:      'general dentistry',
    });

    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.applicationId).toBe('string'); expect(body.applicationId.length).toBeGreaterThan(0);
  });

  test('returns 400 when name is missing', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      phone: '+12065550000',
      email: 'jane@smiledental.com',
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Missing required fields/);
  });

  test('returns 400 when phone is missing', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Jane',
      email: 'jane@smiledental.com',
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test('returns 400 when email is missing', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Jane',
      phone: '+12065550000',
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test('returns 500 when DynamoDB throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Jane',
      phone: '+12065550000',
      email: 'jane@smiledental.com',
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  test('does not write to moxident-leads table', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Jane',
      phone: '+12065550000',
      email: 'jane@smiledental.com',
    });

    await handler(event);

    const putCalls = mockSend.mock.calls.filter(c =>
      c[0]?.input?.TableName === 'moxident-leads'
    );
    expect(putCalls.length).toBe(0);
  });

  test('writes to moxident-dentist-applications table', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Jane',
      phone: '+12065550000',
      email: 'jane@smiledental.com',
    });

    await handler(event);

    const putCalls = mockSend.mock.calls.filter(c =>
      c[0]?.input?.TableName === 'moxident-dentist-applications'
    );
    expect(putCalls.length).toBe(1);
  });
});

// ── Regression: existing routes unaffected ────────────────────────────────────

describe('Regression — existing routes unchanged', () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [] }));
  afterEach(() => jest.clearAllMocks());

  test('OPTIONS returns 200', async () => {
    const event = { rawPath: '/prod/submit', requestContext: { http: { method: 'OPTIONS' } }, body: '' };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });

  test('GET /health returns ok', async () => {
    const event = makeEvent('GET', '/health');
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  test('POST /submit returns 400 when fields missing', async () => {
    const event = makeEvent('POST', '/submit', { name: 'John' });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  test('unknown route returns 404', async () => {
    const event = makeEvent('GET', '/nonexistent');
    const res = await handler(event);
    expect(res.statusCode).toBe(404);
  });

  test('GET /leads still works', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const event = makeEvent('GET', '/leads');
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });
});

// ── POST /submit — dentistFound flag ─────────────────────────────────────────
// router.mjs is mocked via unstable_mockModule (required for ESM).
// Router behaviour is tested separately in router.test.mjs.

jest.unstable_mockModule('../src/router.mjs', () => ({
  submitRequest:      jest.fn(),
  handleDentistReply: jest.fn(),
}));

const { submitRequest } = await import('../src/router.mjs');

describe('POST /submit — dentistFound', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('returns dentistFound:true in response when router returns true', async () => {
    submitRequest.mockResolvedValueOnce({ requestId: 'req-123', dentistFound: true });

    const event = makeEvent('POST', '/submit', {
      name: 'Jane', phone: '+12065559999', zip: '98033', symptom: 'Tooth pain',
    });

    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.dentistFound).toBe(true);
    expect(body.requestId).toBe('req-123');
  });

  test('returns dentistFound:false in response when router returns false', async () => {
    submitRequest.mockResolvedValueOnce({ requestId: 'req-456', dentistFound: false });

    const event = makeEvent('POST', '/submit', {
      name: 'Jane', phone: '+12065559999', zip: '99999', symptom: 'Tooth pain',
    });

    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.dentistFound).toBe(false);
  });
});
