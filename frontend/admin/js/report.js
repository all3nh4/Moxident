'use strict';

/* ── Auth guard ── */
var session = MxAuth.requireAuth();
if (session) MxAuth.renderNav('/report/');

/* ── Helpers ── */
function escHtml(str) {
  return String(str == null ? '—' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function field(label, value) {
  if (!value || value === '—') return '';
  return '<div class="report-field">'
    + '<div class="report-label">' + label + '</div>'
    + '<div class="report-value">' + escHtml(value) + '</div>'
    + '</div>';
}

/* ── KPIs ── */
function renderKpis(submissions) {
  var total   = submissions.length;
  var withZip = submissions.filter(function (d) { return d.zip || (d.zips && d.zips.length); }).length;
  var withCap = submissions.filter(function (d) { return d.capacity || d.dailyCapacity; }).length;
  var avgCap  = withCap > 0
    ? Math.round(submissions.reduce(function (acc, d) { return acc + (parseInt(d.capacity || d.dailyCapacity) || 0); }, 0) / withCap)
    : '—';

  document.getElementById('report-kpis').innerHTML = [
    { val: total,   lbl: 'Total Submissions',  sub: 'Dentists in pipeline' },
    { val: withZip, lbl: 'With Coverage Zip',  sub: 'Ready to match'       },
    { val: withCap, lbl: 'Capacity Reported',  sub: 'Daily appt targets'   },
    { val: avgCap,  lbl: 'Avg Daily Capacity', sub: 'Across reporters'     },
  ].map(function (c) {
    return '<div class="kpi-card fade-up">'
      + '<div class="kpi-val">' + c.val + '</div>'
      + '<div class="kpi-lbl">' + c.lbl + '</div>'
      + '<div class="kpi-delta">' + c.sub + '</div>'
      + '</div>';
  }).join('');
}

/* ── Cards ── */
function renderCards(submissions) {
  if (submissions.length === 0) {
    document.getElementById('report-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">🦷</div>'
      + '<div class="empty-title">No submissions yet</div>'
      + '<div class="empty-sub">Dentist survey responses will appear here once dentists complete the onboarding form at moxident.com/dentist/portal/join.</div>'
      + '</div>';
    return;
  }

  var cards = submissions.map(function (d) {
    var name      = d.name || d.dentistName || '—';
    var practice  = d.practice || d.practiceName || '';
    var zip       = Array.isArray(d.zips) ? d.zips.join(', ') : (d.zip || '');
    var capacity  = d.capacity || d.dailyCapacity || '';
    var insurance = Array.isArray(d.insurance) ? d.insurance.join(', ') : (d.insurance || '');

    return '<div class="report-entry fade-up">'
      + '<div class="report-entry-header">'
      +   '<div>'
      +     '<div class="report-dentist-name">' + escHtml(name) + '</div>'
      +     (practice ? '<div class="report-dentist-practice">' + escHtml(practice) + '</div>' : '')
      +   '</div>'
      +   '<span class="bdg bdg-grn">Active</span>'
      + '</div>'
      + field('Phone', d.phone)
      + field('Email', d.email)
      + field('Coverage Zips', zip)
      + field('Daily Capacity', capacity ? capacity + ' appointments' : '')
      + field('Insurance Accepted', insurance)
      + field('Notes', d.notes || d.additionalNotes)
      + field('Submitted', formatDate(d.submittedAt || d.createdAt))
      + '</div>';
  }).join('');

  document.getElementById('report-body').innerHTML = '<div class="report-grid">' + cards + '</div>';
}

/* ── Load ── */
function loadReport() {
  MxApi.report.get().then(function (data) {
    var submissions = (data && (data.submissions || data.dentists)) || (Array.isArray(data) ? data : []);
    renderKpis(submissions);
    renderCards(submissions);
  }).catch(function (err) {
    var errEl = document.getElementById('report-error');
    errEl.textContent = 'Failed to load report: ' + err.message;
    errEl.classList.remove('hidden');
    document.getElementById('report-body').innerHTML = '';
  });
}

loadReport();
