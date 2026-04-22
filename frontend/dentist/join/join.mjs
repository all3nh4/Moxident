// dentist/join/join.mjs
'use strict';

const API = 'https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod';

/* ── Nav ─────────────────────────────────────────────────────────────────── */
export function toggleDrawer() {
  const drawer = document.getElementById('nav-drawer');
  const burger = document.getElementById('hamburger');
  const open   = drawer.classList.toggle('open');
  burger.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

export function closeDrawer() {
  document.getElementById('nav-drawer').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.body.style.overflow = '';
}

function initNavDrawer() {
  const hamburger = document.getElementById('hamburger');
  const navDrawer = document.getElementById('nav-drawer');
  if (!hamburger || !navDrawer) return;

  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navDrawer.contains(e.target)) {
      closeDrawer();
    }
  });
}

/* ── Funnel step navigation ──────────────────────────────────────────────── */
export function goFunnelStep(n) {
  const top = document.getElementById('join-top-content');
  document.querySelectorAll('.funnel-step').forEach(s => {
    s.classList.add('hidden');
    s.classList.remove('active');
  });
  window.goFunnelStep = goFunnelStep;

  const target = document.getElementById('funnel-step-' + n);
  if (!target) return;
  target.classList.remove('hidden');
  target.classList.add('active');

  if (n === 2) {
    gtag('event', 'begin_checkout', { event_category: 'dentist_funnel', event_label: 'step2_zip' });
    if (typeof window.lintrk === 'function') lintrk('track', { conversion_id: 9061468 });
  }

  if (n === 3) {
    const zip   = document.getElementById('f-zip-check')?.value.trim() || '98033';
    const phone = document.getElementById('f-phone-check')?.value.trim() || '';

    // Carry zip forward to display and pre-fill coverage zip
    const zipDisplay = document.getElementById('zip-display');
    if (zipDisplay) zipDisplay.textContent = zip;

    const zipField = document.getElementById('f-zip');
    if (zipField && !zipField.value) zipField.value = zip;

    // Carry phone forward
    const phoneField = document.getElementById('f-phone');
    if (phoneField && !phoneField.value) phoneField.value = phone;

    gtag('event', 'add_to_cart', { event_category: 'dentist_funnel', event_label: 'step3_reveal' });
    if (typeof window.lintrk === 'function') lintrk('track', { conversion_id: 9061468 });
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Zip check → search volume API → reveal ─────────────────────────────── */
export async function checkZipAndReveal() {
  const zipInput = document.getElementById('f-zip-check');
  const zip = zipInput?.value.trim() || '';

  if (!/^\d{5}$/.test(zip)) {
    document.getElementById('fg-zip-check')?.classList.add('err');
    return;
  }
  document.getElementById('fg-zip-check')?.classList.remove('err');

  const btn = document.getElementById('zip-check-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  // Show step 3 with loading state
  goFunnelStep(3);
  const loading = document.getElementById('demand-loading');
  const content = document.getElementById('demand-content');
  if (loading) loading.classList.remove('hidden');
  if (content) content.classList.add('hidden');

  try {
    const res = await fetch(`${API}/search-volume?zip=${zip}`);
    const data = await res.json();

    const countEl = document.getElementById('demand-count');
    const aggregatedEl = document.getElementById('demand-aggregated');
    const cityEl = document.getElementById('demand-city');

    if (data.monthlySearches != null) {
      if (countEl) countEl.textContent = data.monthlySearches.toLocaleString();
    } else {
      if (countEl) countEl.textContent = '—';
    }

    if (data.isAggregated && data.city) {
      if (aggregatedEl) aggregatedEl.classList.remove('hidden');
      if (cityEl) cityEl.textContent = data.city;
    } else {
      if (aggregatedEl) aggregatedEl.classList.add('hidden');
    }
  } catch (err) {
    console.error('Search volume fetch error:', err.message);
    const countEl = document.getElementById('demand-count');
    if (countEl) countEl.textContent = '—';
  } finally {
    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'See patients in your area →';
  }
}

/* ── Chip toggles ────────────────────────────────────────────────────────── */
export function toggleMoreChips() {
  const more = document.getElementById('chip-more');
  const btn  = document.getElementById('chip-show-more-btn');
  if (!more) return;
  const hidden = more.classList.toggle('hidden');
  btn.textContent = hidden ? '+ Show more' : '− Show less';
}

export function toggleInsuranceChips() {
  const more = document.getElementById('insurance-chip-more');
  const btn  = document.getElementById('insurance-show-more-btn');
  if (!more) return;
  const hidden = more.classList.toggle('hidden');
  btn.textContent = hidden ? '+ Show more' : '− Show less';
}

function getMultiSelectInputs(wrapper) {
  if (!wrapper) return [];
  return Array.from(wrapper.querySelectorAll('input[type="checkbox"]:not([data-select-all])'));
}

function getMultiSelectLabel(values, placeholder) {
  if (!values.length) return placeholder;
  return values.length === 1 ? values[0] : `${values.length} selected`;
}

function syncSelectAllState(wrapper) {
  const selectAll = wrapper?.querySelector('input[data-select-all]');
  if (!selectAll) return;

  const options = getMultiSelectInputs(wrapper);
  const checkedCount = options.filter(cb => cb.checked).length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < options.length;
  selectAll.checked = options.length > 0 && checkedCount === options.length;
}

function updateMultiSelectState(wrapperId, inputId, labelId, placeholder) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  const values = getMultiSelectInputs(wrapper)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const input = document.getElementById(inputId);
  if (input) input.value = values.join(', ');

  const label = document.getElementById(labelId);
  if (label) label.textContent = getMultiSelectLabel(values, placeholder);

  syncSelectAllState(wrapper);

  if (inputId === 'f-case-types' && values.length) {
    document.getElementById('fg-insurance')?.classList.remove('err');
  }

  updateStepBar();
}

function setMultiSelectValues(wrapperId, inputId, labelId, placeholder, values = []) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  const selected = new Set(values.map(v => v.trim()).filter(Boolean));
  getMultiSelectInputs(wrapper).forEach(cb => {
    cb.checked = selected.has(cb.value);
  });

  updateMultiSelectState(wrapperId, inputId, labelId, placeholder);
}

export function toggleMultiSelect(id) {
  document.querySelectorAll('.multi-select').forEach(el => {
    if (el.id !== id) el.classList.remove('open');
  });
  document.getElementById(id)?.classList.toggle('open');
}

export function syncMultiSelect(wrapperId, inputId, labelId, placeholder, evt) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  const target = evt?.target || window.event?.target || null;
  const selectAll = wrapper.querySelector('input[data-select-all]');

  if (target?.matches?.('input[data-select-all]')) {
    const checked = target.checked;
    getMultiSelectInputs(wrapper).forEach(cb => {
      cb.checked = checked;
    });
  } else if (selectAll) {
    syncSelectAllState(wrapper);
  }

  updateMultiSelectState(wrapperId, inputId, labelId, placeholder);
}

function initChips() {
  document.querySelectorAll('.case-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      syncChipValues();
    });
  });
}

function syncChipValues() {
  const caseVals = Array.from(
    document.querySelectorAll('#case-chip-grid .case-chip.selected')
  ).map(c => c.dataset.val).join(', ');
  const insVals = Array.from(
    document.querySelectorAll('#insurance-chip-grid .case-chip.selected')
  ).map(c => c.dataset.val).join(', ');
  const caseEl = document.getElementById('f-case-types');
  const insEl  = document.getElementById('f-insurance-types');
  if (caseEl) caseEl.value = caseVals;
  if (insEl)  insEl.value  = insVals;
  if (caseVals) document.getElementById('fg-insurance')?.classList.remove('err');
}

/* ── Phone normalizer ────────────────────────────────────────────────────── */
export function normalizePhone(val) {
  const digits = val.replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

/* ── Pill select ─────────────────────────────────────────────────────────── */
export function selectPill(btn, hiddenId, gridId) {
  document.querySelectorAll(`#${gridId} .pill-option`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById(hiddenId).value = btn.dataset.val;
  const fgId = `fg-${hiddenId.replace('f-', '')}`;
  document.getElementById(fgId)?.classList.remove('err');
  updateStepBar();
}

/* ── Validation ──────────────────────────────────────────────────────────── */
export function validate(fields) {
  let ok = true;
  fields.forEach(({ id, fg, test }) => {
    const el    = document.getElementById(id);
    const fg_el = document.getElementById(fg);
    if (!el || !fg_el) return;
    if (!test(el.value)) {
      fg_el.classList.add('err');
      ok = false;
    } else {
      fg_el.classList.remove('err');
    }
  });
  return ok;
}

/* ── Collect case types from hidden field ───────────────────────────────── */
export function collectCaseTypes() {
  return document.getElementById('f-case-types')?.value?.trim() || '';
}

/* ── Collect insurance from hidden field ───────────────────────────────── */
export function collectInsurance() {
  return document.getElementById('f-insurance-types')?.value?.trim() || '';
}

/* ── Validate case types grid ────────────────────────────────────────────── */
export function validateCaseTypes() {
  const caseTypes = document.getElementById('f-case-types')?.value;
  const fg = document.getElementById('fg-insurance');
  if (!fg) return true;
  if (!caseTypes) {
    fg.classList.add('err');
    return false;
  }
  fg.classList.remove('err');
  return true;
}

/* ── Build payload from form ─────────────────────────────────────────────── */
export function buildPayload() {
  const exclusions = document.getElementById('f-exclusions')?.value.trim() || '';

  return {
    name:                   document.getElementById('f-name').value.trim(),
    practiceName:           document.getElementById('f-practice').value.trim(),
    phone:                  normalizePhone(document.getElementById('f-phone').value),
    email:                  document.getElementById('f-email').value.trim(),
    zipCodes:               document.getElementById('f-zip').value.trim(),
    practiceArea:           document.getElementById('f-years')?.value.trim() || '',
    dailyCapacity:          document.getElementById('f-capacity').value,
    extendedHours:          document.getElementById('f-extended').value,
    caseTypes:              document.getElementById('f-case-types')?.value || '',
    insuranceAccepted:      document.getElementById('f-insurance-types')?.value || '',
    notificationPreference: document.getElementById('f-notification')?.value || '',
    acceptsUninsured:       document.getElementById('f-uninsured')?.value || '',
    notes:                  exclusions,
    source:                 'dentist-join-page',
  };
}

/* ── Submit ──────────────────────────────────────────────────────────────── */
export async function submitForm() {
  console.log('SUBMIT START');
  const fields = [
    { id: 'f-name',         fg: 'fg-name',         test: v => v.trim().length >= 2 },
    { id: 'f-practice',     fg: 'fg-practice',     test: v => v.trim().length >= 2 },
    { id: 'f-phone',        fg: 'fg-phone',        test: v => v.replace(/\D/g, '').length >= 10 },
    { id: 'f-email',        fg: 'fg-email',        test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { id: 'f-zip',          fg: 'fg-zip',          test: v => v.trim().length >= 3 },
    { id: 'f-years',        fg: 'fg-years',        test: v => v.trim().length >= 2 },
    { id: 'f-capacity',     fg: 'fg-capacity',     test: v => v !== '' },
    { id: 'f-extended',     fg: 'fg-extended',     test: v => v !== '' },
  ];

  const fieldsOk    = validate(fields);
  const caseTypesOk = validateCaseTypes();

  console.log('fieldsOk:', fieldsOk);
  console.log('caseTypesOk:', caseTypesOk);
  

  if (!fieldsOk || !caseTypesOk) {
    document.querySelector('.fg.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = document.getElementById('join-submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  try {
    const res = await fetch(`${API}/dentist-signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPayload()),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    console.log('REACHING SUCCESS BLOCK');

      const formContent = document.getElementById('join-form-content');
      const success = document.getElementById('join-success');

      Array.from(formContent.children).forEach(el => {
        if (el.id !== 'join-success') el.style.display = 'none';
      });

      success.style.display = 'block';
      success.classList.remove('hidden');
      success.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window.lintrk === 'function') {
      lintrk('track', { conversion_id: 9061468 });
    }
    if (typeof gtag === 'function') {
      gtag('event', 'purchase', {
        event_category: 'dentist_funnel',
        event_label:    'join_complete',
        value:          1,
        currency:       'USD',
      });
    }

  } catch (err) {
    console.error('Join submit error:', err.message);
    btn.disabled    = false;
    btn.textContent = 'Start receiving patients →';
    alert('Something went wrong. Please try again.');
  }
}

/* ── Progress bar updater ────────────────────────────────────────────────── */
function updateStepBar() {
  const section1Fields = ['f-name', 'f-practice', 'f-phone', 'f-email', 'f-zip', 'f-years'];

  const s1Done = section1Fields.every(id => {
    const el = document.getElementById(id);
    return el && el.value.trim().length > 0;
  });

  const s2Done = ['f-capacity', 'f-extended'].every(id => {
    const el = document.getElementById(id);
    return el && el.value !== '';
  });

  document.getElementById('seg-1')?.classList.toggle('active', true);
  document.getElementById('seg-2')?.classList.toggle('active', s1Done);
  document.getElementById('seg-3')?.classList.toggle('active', s1Done && s2Done);
}

/* ── Wire up input listeners ─────────────────────────────────────────────── */
function initListeners() {
  initChips();
 const clearOnInput = [
    ['f-name',     'fg-name'],
    ['f-practice', 'fg-practice'],
    ['f-phone',    'fg-phone'],
    ['f-email',    'fg-email'],
    ['f-zip',      'fg-zip'],
    ['f-years',    'fg-years'],
  ];

  clearOnInput.forEach(([id, fg]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  () => { document.getElementById(fg)?.classList.remove('err'); updateStepBar(); });
    el.addEventListener('change', () => { document.getElementById(fg)?.classList.remove('err'); updateStepBar(); });
  });

  document.addEventListener('click', event => {
    document.querySelectorAll('.multi-select').forEach(el => {
      if (!el.contains(event.target)) el.classList.remove('open');
    });
  });

  // Pre-fill from survey if available
  const survey = sessionStorage.getItem('mox_survey');
  if (survey) {
    try {
      const s = JSON.parse(survey);
      if (s.cases?.length) {
        setMultiSelectValues(
          'case-types-multi',
          'f-case-types',
          'case-types-label',
          'Select case types',
          s.cases
        );
      }
      if (s.contactMethod) {
        const pill = document.querySelector(`#notification-pills [data-val="${s.contactMethod}"]`);
        if (pill) selectPill(pill, 'f-notification', 'notification-pills');
      }
    } catch(e) {}
  }

  updateMultiSelectState('case-types-multi', 'f-case-types', 'case-types-label', 'Select case types');
  updateMultiSelectState('insurance-multi', 'f-insurance-types', 'insurance-label', 'Select insurance');
  updateMultiSelectState('extended-hours-multi', 'f-extended', 'extended-hours-label', 'Select available hours');
}

/* ── Expose globals ──────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.toggleDrawer       = toggleDrawer;
  window.toggleMultiSelect  = toggleMultiSelect;
  window.syncMultiSelect    = syncMultiSelect;
  window.syncChipValues     = syncChipValues;
  window.closeDrawer        = closeDrawer;
  window.submitForm         = submitForm;
  window.selectPill         = selectPill;
  window.goFunnelStep       = goFunnelStep;
  window.toggleMoreChips    = toggleMoreChips;
  window.toggleInsuranceChips = toggleInsuranceChips;
  window.checkZipAndReveal    = checkZipAndReveal;
}

/* ── Init ────────────────────────────────────────────────────────────────── */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initNavDrawer();
    initListeners();
  });
}
