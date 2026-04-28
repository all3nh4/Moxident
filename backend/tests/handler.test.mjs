// src/handler.test.mjs
//
// Run: node --experimental-vm-modules node_modules/.bin/jest handler.test.mjs
// Or:  npm test (if jest is configured in package.json)
//
// These tests mock DynamoDB and SES so nothing hits AWS.

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// IMPORTANT: ALL jest.unstable_mockModule calls must appear before any
// await import() calls. handler.mjs imports router.mjs internally, so the
// router mock must be registered here — before handler is imported — or the
// real router module gets wired in and the mock is never used.

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient:      jest.fn(() => ({ send: mockSend })),
  PutItemCommand:      jest.fn(input => ({ type: 'PutItemCommand', input })),
  ScanCommand:         jest.fn(input => ({ type: 'ScanCommand', input })),
  UpdateItemCommand:   jest.fn(input => ({ type: 'UpdateItemCommand', input })),
  GetItemCommand:      jest.fn(input => ({ type: 'GetItemCommand', input })),
  BatchGetItemCommand: jest.fn(input => ({ type: 'BatchGetItemCommand', input })),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient:        jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn(input => ({ type: 'SendEmailCommand', input })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient:      jest.fn(() => ({ send: mockSend })),
  PublishCommand: jest.fn(input => ({ type: 'PublishCommand', input })),
}));

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomUUID: jest.fn(() => 'test-uuid-1234'),
  };
});

// ── Router mock MUST be here, before handler is imported ──────────────────────
jest.unstable_mockModule('../src/router.mjs', () => ({
  submitRequest:        jest.fn(),
  handleDentistReply:   jest.fn(),
  routeVerifiedPatient: jest.fn(),
}));

// ── Import after ALL mocks are registered ─────────────────────────────────────

const { saveDentistApplication } = await import('../src/db.mjs');
const { handler }                = await import('../src/handler.mjs');
const { submitRequest, routeVerifiedPatient } = await import('../src/router.mjs');

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
      name:                   'Dr. Jane Smith',
      practiceName:           'Smile Dental',
      phone:                  '+12065550000',
      email:                  'jane@smiledental.com',
      zipCodes:               '98101, 98102',
      practiceArea:           'Kirkland, WA',
      dailyCapacity:          '3-5',
      extendedHours:          'weekends',
      notificationPreference: 'sms-personal',
      acceptsUninsured:       'yes',
      caseTypes:              'Toothache / pain, Broken / chipped tooth',
      insuranceAccepted:      'Delta Dental, Cigna',
      notes:                  'Spanish-speaking staff on Tuesdays',
    };

    const id = await saveDentistApplication(data);

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const putCall = mockSend.mock.calls[0][0];
    const item = putCall.input.Item;

    expect(item.applicationId.S).toBe(id);
    expect(item.name.S).toBe('Dr. Jane Smith');
    expect(item.practiceName.S).toBe('Smile Dental');
    expect(item.phone.S).toBe('+12065550000');
    expect(item.email.S).toBe('jane@smiledental.com');
    expect(item.zipCodes.S).toBe('98101, 98102');
    expect(item.practiceArea.S).toBe('Kirkland, WA');
    expect(item.dailyCapacity.S).toBe('3-5');
    expect(item.extendedHours.S).toBe('weekends');
    expect(item.notificationPreference.S).toBe('sms-personal');
    expect(item.acceptsUninsured.S).toBe('yes');
    expect(item.caseTypes.S).toBe('Toothache / pain, Broken / chipped tooth');
    expect(item.insuranceAccepted.S).toBe('Delta Dental, Cigna');
    expect(item.notes.S).toBe('Spanish-speaking staff on Tuesdays');
    expect(item.status.S).toBe('pending');
    expect(item.submittedAt.S).toBeTruthy();
  });

  test('keeps legacy survey fields intact for backwards compatibility', async () => {
    const data = {
      name:         'Dr. Test',
      phone:        '+12065550001',
      email:        'test@test.com',
      area:         'Seattle',
      openSlots:    '3',
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
    expect(item.caseTypes.S).toBe('');
    expect(item.insuranceAccepted.S).toBe('');
  });

  test('always sets status to pending regardless of input', async () => {
    await saveDentistApplication({ name: 'Dr. X', phone: '+1', email: 'x@x.com', status: 'approved' });
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.status.S).toBe('pending');
  });
});

// ── Bug Fix Regression Tests ──────────────────────────────────────────────────

describe('Bug 1 — caseTypes and insuranceAccepted are NOT swapped', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('caseTypes stores procedure names, not insurance plan names', async () => {
    const data = {
      name:              'Dr. Singh',
      phone:             '+12065550010',
      email:             'singh@dental.com',
      caseTypes:         'Toothache / pain, Root canals, Abscess / infection',
      insuranceAccepted: 'Delta Dental, Premera Blue Cross',
    };

    await saveDentistApplication(data);
    const item = mockSend.mock.calls[0][0].input.Item;

    expect(item.caseTypes.S).toBe('Toothache / pain, Root canals, Abscess / infection');
    expect(item.insuranceAccepted.S).toBe('Delta Dental, Premera Blue Cross');
    expect(item.caseTypes.S).not.toContain('Delta Dental');
    expect(item.insuranceAccepted.S).not.toContain('Toothache');
  });

  test('insuranceAccepted stores insurance plan names, not procedure names', async () => {
    const data = {
      name:              'Dr. Kim',
      phone:             '+12065550011',
      email:             'kim@dental.com',
      caseTypes:         'Extractions, Crowns & fillings',
      insuranceAccepted: 'Cigna, MetLife, Aetna',
    };

    await saveDentistApplication(data);
    const item = mockSend.mock.calls[0][0].input.Item;

    expect(item.insuranceAccepted.S).toContain('Cigna');
    expect(item.insuranceAccepted.S).toContain('MetLife');
    expect(item.caseTypes.S).toContain('Extractions');
    expect(item.caseTypes.S).not.toContain('Cigna');
    expect(item.insuranceAccepted.S).not.toContain('Extractions');
  });
});

describe('Bug 2 — notificationPreference and acceptsUninsured are separate fields', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('notificationPreference stores SMS/call preference, not yes/no/case-by-case', async () => {
    const data = {
      name:                   'Dr. Anya',
      phone:                  '+12065550020',
      email:                  'anya@kirklanddental.com',
      notificationPreference: 'sms-frontdesk',
      acceptsUninsured:       'yes',
    };

    await saveDentistApplication(data);
    const item = mockSend.mock.calls[0][0].input.Item;

    expect(item.notificationPreference.S).toBe('sms-frontdesk');
    expect(item.acceptsUninsured.S).toBe('yes');
  });

  test('acceptsUninsured never contains a notification preference value', async () => {
    const notifValues = ['sms-personal', 'sms-frontdesk', 'call', 'flexible'];

    for (const notifVal of notifValues) {
      mockSend.mockClear();
      await saveDentistApplication({
        name:                   'Dr. Test',
        phone:                  '+12065550021',
        email:                  'test@dental.com',
        notificationPreference: notifVal,
        acceptsUninsured:       'case-by-case',
      });

      const item = mockSend.mock.calls[0][0].input.Item;
      expect(item.acceptsUninsured.S).toBe('case-by-case');
      expect(item.acceptsUninsured.S).not.toBe(notifVal);
      expect(item.notificationPreference.S).toBe(notifVal);
    }
  });

  test('all valid notificationPreference values are stored correctly', async () => {
    const cases = ['sms-personal', 'sms-frontdesk', 'call', 'flexible'];

    for (const notificationPreference of cases) {
      mockSend.mockClear();
      await saveDentistApplication({
        name: 'Dr. T', phone: '+1', email: 't@t.com', notificationPreference,
      });
      const item = mockSend.mock.calls[0][0].input.Item;
      expect(item.notificationPreference.S).toBe(notificationPreference);
    }
  });
});

describe('Bug 3 — practiceArea replaces yearsInPractice', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('practiceArea is stored when provided', async () => {
    await saveDentistApplication({
      name:         'Dr. Moore',
      phone:        '+12065550030',
      email:        'moore@dental.com',
      practiceArea: 'Kirkland, WA',
    });

    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.practiceArea.S).toBe('Kirkland, WA');
  });

  test('practiceArea accepts city or zip format', async () => {
    const formats = ['Kirkland, WA', '98033', 'Bellevue WA 98004'];

    for (const practiceArea of formats) {
      mockSend.mockClear();
      await saveDentistApplication({
        name: 'Dr. T', phone: '+1', email: 't@t.com', practiceArea,
      });
      const item = mockSend.mock.calls[0][0].input.Item;
      expect(item.practiceArea.S).toBe(practiceArea);
    }
  });

  test('practiceArea is empty string when not provided', async () => {
    await saveDentistApplication({ name: 'Dr. T', phone: '+1', email: 't@t.com' });
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.practiceArea.S).toBe('');
  });

  test('yearsInPractice is no longer a required or expected field', async () => {
    await saveDentistApplication({
      name:            'Dr. T',
      phone:           '+1',
      email:           't@t.com',
      yearsInPractice: '10', // old field — should not pollute new schema
    });
    const item = mockSend.mock.calls[0][0].input.Item;
    // practiceArea should be empty since it was not provided
    expect(item.practiceArea.S).toBe('');
  });
});

// ── POST /dentist-signup handler ──────────────────────────────────────────────

describe('POST /dentist-signup', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));
  afterEach(() => jest.clearAllMocks());

  test('returns 200 with applicationId on valid submission', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:                   'Dr. Jane Smith',
      practiceName:           'Smile Dental',
      phone:                  '+12065550000',
      email:                  'jane@smiledental.com',
      zipCodes:               '98101',
      practiceArea:           'Seattle, WA',
      dailyCapacity:          '3-5',
      extendedHours:          'none',
      notificationPreference: 'sms-personal',
      acceptsUninsured:       'yes',
      caseTypes:              'Toothache / pain, Extractions',
      insuranceAccepted:      'Delta Dental',
    });

    const res = await handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.applicationId).toBe('string');
    expect(body.applicationId.length).toBeGreaterThan(0);
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

    test('sends portal welcome email when portal account already exists and is verified', async () => {
    mockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          email: { S: 'existing@dental.com' },
          verified: { BOOL: true },
        },
      })
      .mockResolvedValueOnce({});

    const event = makeEvent('POST', '/dentist-signup', {
      name:  'Dr. Existing',
      phone: '+12065550099',
      email: 'existing@dental.com',
    });

    await handler(event);

    const sesCalls = mockSend.mock.calls.filter(
      c => c[0]?.type === 'SendEmailCommand'
    );

    const emailSubjects = sesCalls.map(
      c => c[0]?.input?.Message?.Subject?.Data
    );

    expect(emailSubjects).toContain('Moxident: New Dentist Onboarding Application');
    expect(emailSubjects).toContain("You're live on Moxident");
    expect(emailSubjects).not.toContain('Verify your Moxident portal email');
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

  test('Bug 1 regression — caseTypes and insuranceAccepted not swapped in DB write', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:              'Dr. Singh',
      phone:             '+12065550010',
      email:             'singh@dental.com',
      caseTypes:         'Toothache / pain, Root canals',
      insuranceAccepted: 'Delta Dental, Premera Blue Cross',
    });

    await handler(event);

    const putCalls = mockSend.mock.calls.filter(c =>
      c[0]?.input?.TableName === 'moxident-dentist-applications'
    );
    const item = putCalls[0][0].input.Item;

    expect(item.caseTypes.S).toContain('Toothache');
    expect(item.caseTypes.S).not.toContain('Delta Dental');
    expect(item.insuranceAccepted.S).toContain('Delta Dental');
    expect(item.insuranceAccepted.S).not.toContain('Toothache');
  });

  test('Bug 2 regression — acceptsUninsured never contains notification preference value', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:                   'Dr. Anya',
      phone:                  '+12065550020',
      email:                  'anya@dental.com',
      notificationPreference: 'sms-frontdesk',
      acceptsUninsured:       'yes',
    });

    await handler(event);

    const putCalls = mockSend.mock.calls.filter(c =>
      c[0]?.input?.TableName === 'moxident-dentist-applications'
    );
    const item = putCalls[0][0].input.Item;

    expect(item.acceptsUninsured.S).toBe('yes');
    expect(item.acceptsUninsured.S).not.toBe('sms-frontdesk');
    expect(item.notificationPreference.S).toBe('sms-frontdesk');
  });

  test('Bug 3 regression — practiceArea stored correctly', async () => {
    const event = makeEvent('POST', '/dentist-signup', {
      name:         'Dr. Moore',
      phone:        '+12065550030',
      email:        'moore@dental.com',
      practiceArea: 'Kirkland, WA',
    });

    await handler(event);

    const putCalls = mockSend.mock.calls.filter(c =>
      c[0]?.input?.TableName === 'moxident-dentist-applications'
    );
    const item = putCalls[0][0].input.Item;

    expect(item.practiceArea.S).toBe('Kirkland, WA');
    expect(item.yearsInPractice?.S || '').toBe('');
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

// ── POST /verify-otp — dentistFound flag ─────────────────────────────────────
// Option B: verifyPatientOtp runs against a mocked DynamoDB UpdateItem that
// returns the patient row via ALL_OLD; routeVerifiedPatient is mocked at the
// router boundary.

function patientAttributes(patient) {
  return {
    Attributes: {
      requestId: { S: patient.requestId ?? 'req-123' },
      name:      { S: patient.name },
      phone:     { S: patient.phone },
      zip:       { S: patient.zip },
      symptom:   { S: patient.symptom },
    },
  };
}

describe('POST /verify-otp — dentistFound', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns dentistFound:true in response when router returns true', async () => {
    mockSend.mockResolvedValueOnce(patientAttributes({
      requestId: 'req-123', name: 'Jane', phone: '+12065559999', zip: '98033', symptom: 'Tooth pain',
    }));
    mockSend.mockResolvedValue({});
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'req-123', dentistFound: true, unsupportedArea: false,
    });

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'req-123', code: '123456',
    }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.dentistFound).toBe(true);
    expect(body.requestId).toBe('req-123');
  });

  test('returns dentistFound:false in response when router returns false', async () => {
    mockSend.mockResolvedValueOnce(patientAttributes({
      requestId: 'req-456', name: 'Jane', phone: '+12065559999', zip: '99999', symptom: 'Tooth pain',
    }));
    mockSend.mockResolvedValue({});
    routeVerifiedPatient.mockResolvedValueOnce({
      requestId: 'req-456', dentistFound: false, unsupportedArea: true,
    });

    const res = await handler(makeEvent('POST', '/verify-otp', {
      requestId: 'req-456', code: '123456',
    }));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.dentistFound).toBe(false);
  });
});
