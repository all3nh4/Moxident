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
const { normalizePhone, validate, collectSpecialties, buildPayload, submitForm } =
  await import('../../frontend/dentist/join/join.mjs');

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
      add(c)    { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
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

// ── collectSpecialties ────────────────────────────────────────────────────────
describe('collectSpecialties', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty string when no checkboxes checked', () => {
    document.querySelectorAll.mockReturnValue([]);
    expect(collectSpecialties()).toBe('');
  });

  test('returns single checked value', () => {
    document.querySelectorAll.mockReturnValue([{ value: 'Extractions' }]);
    expect(collectSpecialties()).toBe('Extractions');
  });

  test('returns multiple checked values as comma-separated string', () => {
    document.querySelectorAll.mockReturnValue([
      { value: 'Extractions' },
      { value: 'Root canals' },
      { value: 'Crowns & fillings' },
    ]);
    expect(collectSpecialties()).toBe('Extractions, Root canals, Crowns & fillings');
  });
});

// ── buildPayload ──────────────────────────────────────────────────────────────
describe('buildPayload', () => {
  function mockFields(overrides = {}) {
    const defaults = {
      'f-name':      'Dr. Jane Smith',
      'f-practice':  'Smile Dental',
      'f-phone':     '2065550000',
      'f-email':     'jane@smiledental.com',
      'f-zip':       '98101, 98102',
      'f-years':     '10',
      'f-capacity':  '3-5',
      'f-extended':  'weekends',
      'f-uninsured': 'yes',
      'f-exclusions':'',
    };
    const fields = { ...defaults, ...overrides };
    document.getElementById.mockImplementation(id => ({ value: fields[id] ?? '' }));
    // Default: insurance grid returns Delta, Cigna checked
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked') {
        return [{ value: 'Delta' }, { value: 'Cigna' }];
      }
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
    expect(payload.yearsInPractice).toBe('10');
    expect(payload.dailyCapacity).toBe('3-5');
    expect(payload.extendedHours).toBe('weekends');
    expect(payload.insuranceAccepted).toBe('Delta, Cigna'); // from insurance-grid checkboxes
    expect(payload.acceptsUninsured).toBe('yes');
    expect(payload.source).toBe('dentist-join-page');
  });

  test('appends exclusions to specialties when both present', () => {
    mockFields({ 'f-exclusions': 'Orthodontics' });
    document.querySelectorAll.mockReturnValue([{ value: 'Extractions' }]);
    const payload = buildPayload();
    expect(payload.specialties).toContain('Extractions');
    expect(payload.specialties).toContain('Excludes: Orthodontics');
  });

  test('specialties is empty string when nothing selected and no exclusions', () => {
    mockFields();
    const payload = buildPayload();
    expect(payload.specialties).toBe('');
  });

  test('exclusions only — no checked specialties', () => {
    mockFields({ 'f-exclusions': 'Implants' });
    const payload = buildPayload();
    expect(payload.specialties).toBe('Excludes: Implants');
  });
});

// ── submitForm ────────────────────────────────────────────────────────────────
describe('submitForm', () => {
  function makeClassList(hidden = false) {
    return {
      _classes: new Set(hidden ? ['hidden'] : []),
      add(c)    { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c){ return this._classes.has(c); },
    };
  }

  function setupValidForm() {
    const fields = {
      'f-name':      'Dr. Jane',
      'f-practice':  'Smile Dental',
      'f-phone':     '2065550000',
      'f-email':     'jane@smiledental.com',
      'f-zip':       '98101',
      'f-years':     '8',
      'f-capacity':  '3-5',
      'f-extended':  'weekends',
      'f-uninsured': 'yes',
      'f-exclusions':'',
    };

    const btn         = { disabled: false, textContent: '' };
    const formContent = { classList: makeClassList(false), scrollIntoView: jest.fn() };
    const success     = { classList: makeClassList(true),  scrollIntoView: jest.fn() };
    const signup      = { classList: makeClassList(false), scrollIntoView: jest.fn() };

    const fgElements = {};
    ['fg-name','fg-practice','fg-phone','fg-email','fg-zip',
     'fg-years','fg-capacity','fg-extended','fg-insurance','fg-uninsured'].forEach(id => {
      fgElements[id] = { classList: makeClassList() };
    });

    document.getElementById.mockImplementation(id => {
      if (id === 'join-submit-btn')   return btn;
      if (id === 'join-form-content') return formContent;
      if (id === 'join-success')      return success;
      if (id === 'signup')            return signup;
      if (fgElements[id])             return fgElements[id];
      return { value: fields[id] ?? '' };
    });

    document.querySelector.mockReturnValue(null);
    document.querySelectorAll.mockImplementation(selector => {
      if (selector === '#insurance-grid input[type="checkbox"]:checked') {
        return [{ value: 'Delta' }];
      }
      return [];
    });

    return { btn, formContent, success };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.alert = jest.fn();
  });

  test('calls fetch with correct endpoint on valid submit', async () => {
    setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok: true,
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

  test('shows success screen on 200 response', async () => {
    const { formContent, success } = setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    expect(formContent.classList.contains('hidden')).toBe(true);
    expect(success.classList.contains('hidden')).toBe(false);
  });

  test('re-enables button on API error', async () => {
    const { btn } = setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok: false,
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
      if (id === 'f-name') return { value: '' };
      if (id === 'fg-name') return { classList: makeClassList() };
      if (id === 'join-submit-btn') return { disabled: false, textContent: '' };
      return { value: 'valid', classList: makeClassList() };
    });
    document.querySelector.mockReturnValue(null);

    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
