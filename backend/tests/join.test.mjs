// tests/join.test.mjs
//
// Tests for frontend/dentist/join/join.mjs
// Pure function tests only — no DOM, no jsdom, no browser APIs needed.

import { jest } from '@jest/globals';

// ── Mock fetch ────────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Mock browser globals so join.mjs imports cleanly in Node ─────────────────
global.window   = {};
global.document = {
  getElementById:   jest.fn(() => null),
  querySelector:    jest.fn(() => null),
  querySelectorAll: jest.fn(() => []),
  addEventListener: jest.fn(),
};

// ── Import after mocks ────────────────────────────────────────────────────────
const {
  normalizePhone,
  validate,
  collectCaseTypes,
  collectInsurance,
  buildPayload,
  submitForm,
} = await import('../../frontend/dentist/join/join.mjs');

// ── normalizePhone ────────────────────────────────────────────────────────────
describe('normalizePhone', () => {
  test('adds +1 to 10-digit number', () => {
    expect(normalizePhone('2065550000')).toBe('+12065550000');
  });

  test('handles formatted input (425) 555-0000', () => {
    expect(normalizePhone('(425) 555-0000')).toBe('+14255550000');
  });

  test('does not double-prefix when input starts with 1', () => {
    expect(normalizePhone('12065550000')).toBe('+12065550000');
  });

  test('strips all non-digit characters', () => {
    expect(normalizePhone('+1-206-555-0000')).toBe('+12065550000');
  });
});

// ── validate ──────────────────────────────────────────────────────────────────
describe('validate', () => {
  function makeFakeElement(value = '', hasErr = false) {
    const classList = {
      _classes: new Set(hasErr ? ['err'] : []),
      add(c)     { this._classes.add(c); },
      remove(c)  { this._classes.delete(c); },
      contains(c){ return this._classes.has(c); },
    };
    return { value, classList };
  }

  beforeEach(() => jest.clearAllMocks());

  test('returns true when all fields pass', () => {
    const el = makeFakeElement('valid');
    const fg = makeFakeElement();
    document.getElementById.mockImplementation(id =>
      id === 'test-input' ? el : id === 'test-fg' ? fg : null
    );
    const result = validate([{ id: 'test-input', fg: 'test-fg', test: v => v.length > 0 }]);
    expect(result).toBe(true);
    expect(fg.classList.contains('err')).toBe(false);
  });

  test('returns false and adds err class when field fails', () => {
    const el = makeFakeElement('');
    const fg = makeFakeElement();
    document.getElementById.mockImplementation(id =>
      id === 'bad-input' ? el : id === 'bad-fg' ? fg : null
    );
    const result = validate([{ id: 'bad-input', fg: 'bad-fg', test: v => v.length > 0 }]);
    expect(result).toBe(false);
    expect(fg.classList.contains('err')).toBe(true);
  });

  test('removes err class when field passes', () => {
    const el = makeFakeElement('value');
    const fg = makeFakeElement('', true);
    document.getElementById.mockImplementation(id =>
      id === 'good-input' ? el : id === 'good-fg' ? fg : null
    );
    validate([{ id: 'good-input', fg: 'good-fg', test: v => v.length > 0 }]);
    expect(fg.classList.contains('err')).toBe(false);
  });

  test('validates multiple fields — fails if any fail', () => {
    const el1 = makeFakeElement('ok');
    const el2 = makeFakeElement('');
    const fg1 = makeFakeElement();
    const fg2 = makeFakeElement();
    document.getElementById.mockImplementation(id => {
      if (id === 'f1') return el1;
      if (id === 'f2') return el2;
      if (id === 'fg1') return fg1;
      if (id === 'fg2') return fg2;
      return null;
    });
    const result = validate([
      { id: 'f1', fg: 'fg1', test: v => v.length > 0 },
      { id: 'f2', fg: 'fg2', test: v => v.length > 0 },
    ]);
    expect(result).toBe(false);
    expect(fg1.classList.contains('err')).toBe(false);
    expect(fg2.classList.contains('err')).toBe(true);
  });

  test('skips gracefully if element not found', () => {
    document.getElementById.mockReturnValue(null);
    const result = validate([{ id: 'nonexistent', fg: 'also-nonexistent', test: () => false }]);
    expect(result).toBe(true);
  });
});

// ── collectCaseTypes (Bug 1: reads #insurance-grid, not #specialties-grid) ───
describe('collectCaseTypes', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty string when no checkboxes checked', () => {
    document.querySelectorAll.mockReturnValue([]);
    expect(collectCaseTypes()).toBe('');
  });

  test('returns single checked value', () => {
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [{ value: 'Extractions' }];
      return [];
    });
    expect(collectCaseTypes()).toBe('Extractions');
  });

  test('returns multiple checked values as comma-separated string', () => {
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [
          { value: 'Toothache / pain' },
          { value: 'Root canals' },
          { value: 'Crowns & fillings' },
        ];
      return [];
    });
    expect(collectCaseTypes()).toBe('Toothache / pain, Root canals, Crowns & fillings');
  });

  test('does NOT read from #specialties-grid', () => {
    // Only specialties-grid has checkboxes — caseTypes should still be empty
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Delta Dental' }];
      return [];
    });
    expect(collectCaseTypes()).toBe('');
  });
});

// ── collectInsurance (Bug 1: reads #specialties-grid, not #insurance-grid) ───
describe('collectInsurance', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty string when no checkboxes checked', () => {
    document.querySelectorAll.mockReturnValue([]);
    expect(collectInsurance()).toBe('');
  });

  test('returns single checked value', () => {
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Delta Dental' }];
      return [];
    });
    expect(collectInsurance()).toBe('Delta Dental');
  });

  test('returns multiple insurance plans as comma-separated string', () => {
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Delta Dental' }, { value: 'Cigna' }, { value: 'Premera' }];
      return [];
    });
    expect(collectInsurance()).toBe('Delta Dental, Cigna, Premera');
  });

  test('does NOT read from #insurance-grid', () => {
    // Only insurance-grid has checkboxes — insurance should still be empty
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [{ value: 'Toothache / pain' }];
      return [];
    });
    expect(collectInsurance()).toBe('');
  });
});

// ── buildPayload ──────────────────────────────────────────────────────────────
describe('buildPayload', () => {
  // f-years in the HTML maps to practiceArea in the payload (Bug 3 fix)
  // f-notification maps to notificationPreference (Bug 2 fix)
  // caseTypes from #insurance-grid, insuranceAccepted from #specialties-grid (Bug 1 fix)
  function mockFields(overrides = {}) {
    const defaults = {
      'f-name':         'Dr. Jane Smith',
      'f-practice':     'Smile Dental',
      'f-phone':        '2065550000',
      'f-email':        'jane@smiledental.com',
      'f-zip':          '98101, 98102',
      'f-years':        'Kirkland, WA',   // practiceArea value
      'f-capacity':     '3-5',
      'f-extended':     'weekends',
      'f-notification': 'sms-frontdesk', // notificationPreference value
      'f-uninsured':    'yes',
      'f-exclusions':   '',
    };
    const fields = { ...defaults, ...overrides };
    document.getElementById.mockImplementation(id => ({ value: fields[id] ?? '' }));
    // Default: caseTypes from insurance-grid, insuranceAccepted from specialties-grid
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [{ value: 'Toothache / pain' }, { value: 'Extractions' }];
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Delta Dental' }, { value: 'Cigna' }];
      return [];
    });
  }

  beforeEach(() => jest.clearAllMocks());

  test('builds correct payload with all fields', () => {
    mockFields();
    const payload = buildPayload();

    expect(payload.name).toBe('Dr. Jane Smith');
    expect(payload.practiceName).toBe('Smile Dental');
    expect(payload.phone).toBe('+12065550000');
    expect(payload.email).toBe('jane@smiledental.com');
    expect(payload.zipCodes).toBe('98101, 98102');
    expect(payload.practiceArea).toBe('Kirkland, WA');       // f-years → practiceArea
    expect(payload.dailyCapacity).toBe('3-5');
    expect(payload.extendedHours).toBe('weekends');
    expect(payload.notificationPreference).toBe('sms-frontdesk'); // f-notification
    expect(payload.acceptsUninsured).toBe('yes');
    expect(payload.caseTypes).toBe('Toothache / pain, Extractions'); // from insurance-grid
    expect(payload.insuranceAccepted).toBe('Delta Dental, Cigna');   // from specialties-grid
    expect(payload.source).toBe('dentist-join-page');
  });

  test('payload has practiceArea, not yearsInPractice (Bug 3)', () => {
    mockFields({ 'f-years': 'Bellevue, WA' });
    const payload = buildPayload();
    expect(payload.practiceArea).toBe('Bellevue, WA');
    expect(payload.yearsInPractice).toBeUndefined();
  });

  test('caseTypes and insuranceAccepted are not swapped (Bug 1)', () => {
    document.getElementById.mockImplementation(id => ({ value: '' }));
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [{ value: 'Root canals' }];
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Premera Blue Cross' }];
      return [];
    });
    const payload = buildPayload();
    expect(payload.caseTypes).toContain('Root canals');
    expect(payload.caseTypes).not.toContain('Premera Blue Cross');
    expect(payload.insuranceAccepted).toContain('Premera Blue Cross');
    expect(payload.insuranceAccepted).not.toContain('Root canals');
  });

  test('notificationPreference and acceptsUninsured are separate (Bug 2)', () => {
    mockFields({ 'f-notification': 'call', 'f-uninsured': 'case-by-case' });
    const payload = buildPayload();
    expect(payload.notificationPreference).toBe('call');
    expect(payload.acceptsUninsured).toBe('case-by-case');
    expect(payload.acceptsUninsured).not.toBe('call');
  });

  test('all valid notificationPreference values pass through correctly', () => {
    const values = ['sms-personal', 'sms-frontdesk', 'call', 'flexible'];
    for (const val of values) {
      jest.clearAllMocks();
      mockFields({ 'f-notification': val });
      expect(buildPayload().notificationPreference).toBe(val);
    }
  });

  test('notes field carries exclusions text', () => {
    mockFields({ 'f-exclusions': 'No pediatric cases' });
    const payload = buildPayload();
    expect(payload.notes).toBe('No pediatric cases');
  });

  test('notes is empty string when no exclusions', () => {
    mockFields();
    const payload = buildPayload();
    expect(payload.notes).toBe('');
  });

  test('practiceArea is empty string when f-years is blank', () => {
    mockFields({ 'f-years': '' });
    const payload = buildPayload();
    expect(payload.practiceArea).toBe('');
  });
});

// ── submitForm ────────────────────────────────────────────────────────────────
describe('submitForm', () => {
  function makeClassList(hidden = false) {
    return {
      _classes: new Set(hidden ? ['hidden'] : []),
      add(c)     { this._classes.add(c); },
      remove(c)  { this._classes.delete(c); },
      contains(c){ return this._classes.has(c); },
    };
  }

  function setupValidForm() {
    const fields = {
      'f-name':         'Dr. Jane',
      'f-practice':     'Smile Dental',
      'f-phone':        '2065550000',
      'f-email':        'jane@smiledental.com',
      'f-zip':          '98101',
      'f-years':        'Kirkland, WA',   // practiceArea
      'f-capacity':     '3-5',
      'f-extended':     'weekends',
      'f-notification': 'sms-personal',
      'f-uninsured':    'yes',
      'f-exclusions':   '',
    };

    const btn         = { disabled: false, textContent: '' };
    const formContent = { classList: makeClassList(false), scrollIntoView: jest.fn() };
    const success     = { classList: makeClassList(true),  scrollIntoView: jest.fn() };

    // All fg elements the validation loop touches
    const fgIds = [
      'fg-name', 'fg-practice', 'fg-phone', 'fg-email',
      'fg-zip', 'fg-years', 'fg-capacity', 'fg-extended',
      'fg-notification', 'fg-insurance',
    ];
    const fgElements = {};
    fgIds.forEach(id => { fgElements[id] = { classList: makeClassList() }; });

    document.getElementById.mockImplementation(id => {
      if (id === 'join-submit-btn')   return btn;
      if (id === 'join-form-content') return formContent;
      if (id === 'join-success')      return success;
      if (fgElements[id])             return fgElements[id];
      return { value: fields[id] ?? '' };
    });

    document.querySelector.mockReturnValue(null);
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked')
        return [{ value: 'Toothache / pain' }]; // at least one — passes validateCaseTypes
      if (selector === '#specialties-grid input[type="checkbox"]:checked')
        return [{ value: 'Delta Dental' }];
      return [];
    });

    return { btn, formContent, success, fgElements };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.alert = jest.fn();
  });

  test('calls fetch with correct endpoint on valid submit', async () => {
    setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/dentist-signup');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('Dr. Jane');
    expect(body.source).toBe('dentist-join-page');
  });

  test('payload sent to API has practiceArea not yearsInPractice', async () => {
    setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.practiceArea).toBe('Kirkland, WA');
    expect(body.yearsInPractice).toBeUndefined();
  });

  test('payload sent to API has notificationPreference field (Bug 2)', async () => {
    setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.notificationPreference).toBe('sms-personal');
  });

  test('shows success screen on 200 response', async () => {
    const { formContent, success } = setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    expect(formContent.classList.contains('hidden')).toBe(true);
    expect(success.classList.contains('hidden')).toBe(false);
  });

  test('re-enables button on API error', async () => {
    const { btn } = setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   false,
      json: async () => ({ error: 'Server error' }),
    });

    await submitForm();

    expect(btn.disabled).toBe(false);
  });

  test('re-enables button on network failure', async () => {
    const { btn } = setupValidForm();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await submitForm();

    expect(btn.disabled).toBe(false);
  });

  test('does not call fetch when required field is empty', async () => {
    setupValidForm();
    document.getElementById.mockImplementation(id => {
      if (id === 'f-name')          return { value: '' };        // fails validation
      if (id === 'fg-name')         return { classList: makeClassList() };
      if (id === 'join-submit-btn') return { disabled: false, textContent: '' };
      return { value: 'valid', classList: makeClassList() };
    });
    document.querySelector.mockReturnValue(null);
    document.querySelectorAll.mockReturnValue([{ value: 'Toothache / pain' }]);

    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does not call fetch when no case types selected (validateCaseTypes fails)', async () => {
    setupValidForm();
    document.querySelectorAll.mockImplementation(selector => {
      // No case types checked — insurance-grid returns empty
      if (selector === '#insurance-grid input[type="checkbox"]:checked') return [];
      return [];
    });

    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does not call fetch when notification preference is empty', async () => {
    setupValidForm();
    document.getElementById.mockImplementation(id => {
      if (id === 'f-notification')    return { value: '' };       // fails validation
      if (id === 'fg-notification')   return { classList: makeClassList() };
      if (id === 'join-submit-btn')   return { disabled: false, textContent: '' };
      return { value: 'valid', classList: makeClassList() };
    });
    document.querySelectorAll.mockReturnValue([{ value: 'Toothache / pain' }]);
    document.querySelector.mockReturnValue(null);

    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
