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

/* ── Collect specialties from checkboxes ─────────────────────────────────── */
export function collectSpecialties() {
  const checked = document.querySelectorAll('#specialties-grid input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value).join(', ');
}

/* ── Collect insurance from checkboxes ───────────────────────────────────── */
export function collectInsurance() {
  const checked = document.querySelectorAll('#insurance-grid input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value).join(', ');
}

/* ── Validate insurance grid (at least one checked) ─────────────────────── */
export function validateInsurance() {
  const insurance = collectInsurance();
  const fg = document.getElementById('fg-insurance');
  if (!fg) return true;
  if (!insurance) {
    fg.classList.add('err');
    return false;
  }
  fg.classList.remove('err');
  return true;
}

/* ── Build payload from form ─────────────────────────────────────────────── */
export function buildPayload() {
  const exclusions      = document.getElementById('f-exclusions')?.value.trim() || '';
  const specialties     = collectSpecialties();
  const specialtiesFull = exclusions
    ? `${specialties}${specialties ? ' | ' : ''}Excludes: ${exclusions}`
    : specialties;

  return {
    name:             document.getElementById('f-name').value.trim(),
    practiceName:     document.getElementById('f-practice').value.trim(),
    phone:            normalizePhone(document.getElementById('f-phone').value),
    email:            document.getElementById('f-email').value.trim(),
    zipCodes:         document.getElementById('f-zip').value.trim(),
    practiceArea:     document.getElementById('f-years')?.value.trim() || '',
    dailyCapacity:    document.getElementById('f-capacity').value,
    extendedHours:    document.getElementById('f-extended').value,
    insuranceAccepted:collectInsurance(),
    acceptsUninsured: document.getElementById('f-uninsured').value,
    specialties:      specialtiesFull,
    source:           'dentist-join-page',
  };
}

/* ── Submit ──────────────────────────────────────────────────────────────── */
export async function submitForm() {
  const fields = [
    { id: 'f-name',     fg: 'fg-name',     test: v => v.trim().length >= 2 },
    { id: 'f-practice', fg: 'fg-practice', test: v => v.trim().length >= 2 },
    { id: 'f-phone',    fg: 'fg-phone',    test: v => v.replace(/\D/g, '').length >= 10 },
    { id: 'f-email',    fg: 'fg-email',    test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { id: 'f-zip',      fg: 'fg-zip',      test: v => v.trim().length >= 3 },
    { id: 'f-years',    fg: 'fg-years',    test: v => v.trim().length >= 2 },
    { id: 'f-capacity', fg: 'fg-capacity', test: v => v !== '' },
    { id: 'f-extended', fg: 'fg-extended', test: v => v !== '' },
    { id: 'f-uninsured',fg: 'fg-uninsured',test: v => v !== '' },
  ];

  const fieldsOk    = validate(fields);
  const insuranceOk = validateInsurance();

  if (!fieldsOk || !insuranceOk) {
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

    document.getElementById('join-form-content').classList.add('hidden');
    document.getElementById('join-success').classList.remove('hidden');
    document.getElementById('join-success').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('Join submit error:', err.message);
    btn.disabled    = false;
    btn.textContent = 'Join the Network →';
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

  const s2Done = ['f-capacity', 'f-extended', 'f-uninsured'].every(id => {
    const el = document.getElementById(id);
    return el && el.value !== '';
  });

  document.getElementById('seg-1').classList.toggle('active', true);
  document.getElementById('seg-2').classList.toggle('active', s1Done);
  document.getElementById('seg-3').classList.toggle('active', s1Done && s2Done);
}

/* ── Wire up input listeners ─────────────────────────────────────────────── */
function initListeners() {
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

  document.querySelectorAll('#insurance-grid input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (collectInsurance()) document.getElementById('fg-insurance')?.classList.remove('err');
      updateStepBar();
    });
  });

  // Pre-fill from survey if available
  const survey = sessionStorage.getItem('mox_survey');
  if (survey) {
    try {
      const s = JSON.parse(survey);
      if (s.cases?.length) {
        document.querySelectorAll('#insurance-grid input[type="checkbox"]').forEach(cb => {
          if (s.cases.includes(cb.value)) cb.checked = true;
        });
      }
      if (s.contactMethod) {
        const pill = document.querySelector(`#uninsured-pills [data-val="${s.contactMethod}"]`);
        if (pill) selectPill(pill, 'f-uninsured', 'uninsured-pills');
      }
    } catch(e) {}
  }
}