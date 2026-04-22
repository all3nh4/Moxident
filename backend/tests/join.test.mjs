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
  syncMultiSelect,
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
// ── collectCaseTypes (reads hidden field synced by case-types-multi) ───
describe('collectCaseTypes', () => {
  test('returns empty string when hidden field is empty', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types') return { value: '' };
      return null;
    });

    expect(collectCaseTypes()).toBe('');
  });

  test('returns single selected case type value from hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types') return { value: 'Extraction' };
      return null;
    });

    expect(collectCaseTypes()).toBe('Extraction');
  });

  test('returns multiple selected case types as comma-separated string from hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types') {
        return { value: 'Tooth pain, Root canal, Lost filling or crown' };
      }
      return null;
    });

    expect(collectCaseTypes()).toBe('Tooth pain, Root canal, Lost filling or crown');
  });

  test('does not read insurance hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types') return { value: '' };
      if (id === 'f-insurance-types') return { value: 'Delta Dental' };
      return null;
    });

    expect(collectCaseTypes()).toBe('');
  });
});

// ── collectInsurance (reads hidden field synced by insurance multi-select) ───
describe('collectInsurance', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty string when hidden field is empty', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-insurance-types') return { value: '' };
      return null;
    });
    expect(collectInsurance()).toBe('');
  });

  test('returns single selected insurance value from hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-insurance-types') return { value: 'Delta Dental' };
      return null;
    });
    expect(collectInsurance()).toBe('Delta Dental');
  });

  test('returns multiple insurance plans as comma-separated string from hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-insurance-types') return { value: 'Delta Dental, Cigna, Premera' };
      return null;
    });
    expect(collectInsurance()).toBe('Delta Dental, Cigna, Premera');
  });

  test('does not read case-types hidden field', () => {
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types') return { value: 'Toothache / pain' };
      if (id === 'f-insurance-types') return { value: '' };
      return null;
    });
    expect(collectInsurance()).toBe('');
  });
});

describe('syncMultiSelect', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCheckbox(value, checked = false, selectAll = false) {
    return {
      value,
      checked,
      dataset: selectAll ? { selectAll: 'true' } : {},
      matches: jest.fn(selector => selectAll && selector === 'input[data-select-all]'),
    };
  }

  test('writes selected case types to the hidden input and uses summary text', () => {
    const selectAll = makeCheckbox('__all__', false, true);
    const toothPain = makeCheckbox('Tooth pain', true);
    const infection = makeCheckbox('Infection', true);
    const wrapper = {
      querySelectorAll: jest.fn(selector =>
        selector === 'input[type="checkbox"]:not([data-select-all])'
          ? [toothPain, infection]
          : []
      ),
      querySelector: jest.fn(selector =>
        selector === 'input[data-select-all]' ? selectAll : null
      ),
    };
    const hiddenInput = { value: '' };
    const label = { textContent: 'Select case types' };
    const fgInsurance = { classList: { remove: jest.fn() } };

    document.getElementById.mockImplementation(id => {
      if (id === 'case-types-multi') return wrapper;
      if (id === 'f-case-types') return hiddenInput;
      if (id === 'case-types-label') return label;
      if (id === 'fg-insurance') return fgInsurance;
      if (id === 'seg-1' || id === 'seg-2' || id === 'seg-3') return { classList: { toggle: jest.fn() } };
      return { value: '' };
    });

    syncMultiSelect('case-types-multi', 'f-case-types', 'case-types-label', 'Select case types');

    expect(hiddenInput.value).toBe('Tooth pain, Infection');
    expect(label.textContent).toBe('2 selected');
    expect(selectAll.checked).toBe(true);
  });

  test('select all toggles all non-select-all options for insurance', () => {
    const selectAll = makeCheckbox('__all__', true, true);
    const delta = makeCheckbox('Delta Dental', false);
    const cigna = makeCheckbox('Cigna', false);
    const wrapper = {
      querySelectorAll: jest.fn(selector =>
        selector === 'input[type="checkbox"]:not([data-select-all])'
          ? [delta, cigna]
          : []
      ),
      querySelector: jest.fn(selector =>
        selector === 'input[data-select-all]' ? selectAll : null
      ),
    };
    const hiddenInput = { value: '' };
    const label = { textContent: 'Select insurance' };

    document.getElementById.mockImplementation(id => {
      if (id === 'insurance-multi') return wrapper;
      if (id === 'f-insurance-types') return hiddenInput;
      if (id === 'insurance-label') return label;
      if (id === 'seg-1' || id === 'seg-2' || id === 'seg-3') return { classList: { toggle: jest.fn() } };
      return { value: '' };
    });

    syncMultiSelect('insurance-multi', 'f-insurance-types', 'insurance-label', 'Select insurance', {
      target: selectAll,
    });

    expect(delta.checked).toBe(true);
    expect(cigna.checked).toBe(true);
    expect(hiddenInput.value).toBe('Delta Dental, Cigna');
    expect(label.textContent).toBe('2 selected');
  });
});

// ── buildPayload ──────────────────────────────────────────────────────────────
describe('buildPayload', () => {
  // f-years in the HTML maps to practiceArea in the payload (Bug 3 fix)
  // f-notification maps to notificationPreference (Bug 2 fix)
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
      'f-case-types':   'Toothache / pain, Extractions',
      'f-insurance-types': 'Delta Dental, Cigna',
    };
    const fields = { ...defaults, ...overrides };
    document.getElementById.mockImplementation(id => ({ value: fields[id] ?? '' }));
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
    expect(payload.caseTypes).toBe('Toothache / pain, Extractions');
    expect(payload.insuranceAccepted).toBe('Delta Dental, Cigna');
    expect(payload.source).toBe('dentist-join-page');
  });

  test('payload has practiceArea, not yearsInPractice (Bug 3)', () => {
    mockFields({ 'f-years': 'Bellevue, WA' });
    const payload = buildPayload();
    expect(payload.practiceArea).toBe('Bellevue, WA');
    expect(payload.yearsInPractice).toBeUndefined();
  });

  test('caseTypes and insuranceAccepted are not swapped (Bug 1)', () => {
    mockFields({
      'f-case-types': 'Root canals',
      'f-insurance-types': 'Premera Blue Cross',
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
      'f-case-types':   'Toothache / pain',
      'f-insurance-types': 'Delta Dental',
    };

    const btn         = { disabled: false, textContent: '' };
    const childA = { id: 'section-a', style: {} };
    const success     = { id: 'join-success', classList: makeClassList(true), style: {}, scrollIntoView: jest.fn() };
    const formContent = {
      classList: makeClassList(false),
      children: [childA, success],
      scrollIntoView: jest.fn(),
    };

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
    document.querySelectorAll.mockReturnValue([]);

    return { btn, childA, formContent, success, fgElements };
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
    const { childA, success } = setupValidForm();
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ success: true, applicationId: 'abc-123' }),
    });

    await submitForm();

    expect(childA.style.display).toBe('none');
    expect(success.style.display).toBe('block');
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
    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does not call fetch when no case types selected (validateCaseTypes fails)', async () => {
    setupValidForm();
    document.getElementById.mockImplementation(id => {
      if (id === 'f-case-types')      return { value: '' };
      if (id === 'join-submit-btn')   return { disabled: false, textContent: '' };
      if (id === 'join-form-content') return { children: [], classList: makeClassList(false), scrollIntoView: jest.fn() };
      if (id === 'join-success')      return { classList: makeClassList(true), style: {}, scrollIntoView: jest.fn() };
      return { value: 'valid', classList: makeClassList() };
    });

    await submitForm();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
