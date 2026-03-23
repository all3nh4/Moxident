'use strict';

/* ── Auth guard ── */
var session = MxAuth.requireAuth();
if (session) MxAuth.renderNav('/dashboard/');

/* ── State ── */
var allLeads   = [];
var reportData = null;

/* ── Tabs ── */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

/* ── Date helpers ── */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isToday(iso) {
  if (!iso) return false;
  var d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isThisWeek(iso) {
  if (!iso) return false;
  return new Date(iso) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── KPI render ── */
function renderKpis(leads, dentistCount) {
  var total     = leads.length;
  var today     = leads.filter(function (l) { return isToday(l.submittedAt); }).length;
  var week      = leads.filter(function (l) { return isThisWeek(l.submittedAt); }).length;

  document.getElementById('kpi-grid').innerHTML = [
    { val: total,        lbl: 'Total Leads',       sub: 'All time'         },
    { val: today,        lbl: 'Leads Today',        sub: 'Last 24 hours'   },
    { val: week,         lbl: 'This Week',          sub: 'Last 7 days'     },
    { val: dentistCount, lbl: 'Dentists Surveyed',  sub: 'Network size'    },
  ].map(function (c) {
    return '<div class="kpi-card fade-up">'
      + '<div class="kpi-val">' + c.val + '</div>'
      + '<div class="kpi-lbl">' + c.lbl + '</div>'
      + '<div class="kpi-delta">' + c.sub + '</div>'
      + '</div>';
  }).join('');
}

/* ── Status select ── */
var STATUS_OPTIONS = [
  { value: 'new',         label: 'New'         },
  { value: 'contacted',   label: 'Contacted'   },
  { value: 'matched',     label: 'Matched'     },
  { value: 'converted',   label: 'Converted'   },
  { value: 'no_answer',   label: 'No Answer'   },
  { value: 'cancelled',   label: 'Cancelled'   },
];

function buildStatusSelect(leadId, current) {
  var opts = STATUS_OPTIONS.map(function (o) {
    return '<option value="' + o.value + '"' + (o.value === current ? ' selected' : '') + '>' + o.label + '</option>';
  }).join('');
  return '<select class="status-select s-' + (current || 'new') + '" data-lead-id="' + escHtml(leadId) + '" onchange="handleStatusChange(this)">' + opts + '</select>';
}

function handleStatusChange(select) {
  var id     = select.dataset.leadId;
  var status = select.value;
  var prev   = (select.className.match(/s-(\w+)/) || [])[1];

  select.className = select.className.replace(/s-\w+/, 's-' + status);
  select.disabled  = true;

  MxApi.leads.updateStatus(id, status).then(function () {
    var lead = allLeads.find(function (l) { return l.id === id; });
    if (lead) lead.status = status;
  }).catch(function (err) {
    select.value     = prev || 'new';
    select.className = select.className.replace(/s-\w+/, 's-' + (prev || 'new'));
    alert('Failed to update status: ' + err.message);
  }).finally(function () {
    select.disabled = false;
  });
}

/* ── Leads table ── */
function renderLeadsTable(leads) {
  document.getElementById('leads-panel-title').textContent = 'Patient Leads (' + leads.length + ')';

  if (leads.length === 0) {
    document.getElementById('leads-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">📋</div>'
      + '<div class="empty-title">No leads yet</div>'
      + '<div class="empty-sub">Patient form submissions will appear here once the /admin/leads endpoint is deployed.</div>'
      + '</div>';
    return;
  }

  var rows = leads.map(function (l) {
    return '<tr>'
      + '<td class="td-primary">' + escHtml(l.name || '—') + '</td>'
      + '<td class="td-mono">'    + escHtml(l.phone || '—') + '</td>'
      + '<td class="td-mono">'    + escHtml(l.zip || '—') + '</td>'
      + '<td>'                    + escHtml(l.symptom || '—') + '</td>'
      + '<td>'                    + formatDate(l.submittedAt) + '</td>'
      + '<td>'                    + buildStatusSelect(l.id, l.status || 'new') + '</td>'
      + '</tr>';
  }).join('');

  document.getElementById('leads-body').innerHTML =
    '<table><thead><tr>'
    + '<th>Name</th><th>Phone</th><th>Zip</th><th>Symptom</th><th>Submitted</th><th>Status</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Load leads ── */
function loadLeads() {
  document.getElementById('leads-body').innerHTML =
    '<div class="spinner-wrap"><div class="spinner"></div> Loading leads…</div>';

  MxApi.leads.list().then(function (data) {
    allLeads = data.leads || [];
    renderLeadsTable(allLeads);
    renderKpis(allLeads, (reportData && (reportData.submissions || reportData.dentists) || []).length);
  }).catch(function (err) {
    document.getElementById('leads-warn').classList.remove('hidden');
    document.getElementById('leads-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">⚠️</div>'
      + '<div class="empty-title">Endpoint not available</div>'
      + '<div class="empty-sub">' + escHtml(err.message) + '</div>'
      + '</div>';
    renderKpis([], (reportData && (reportData.submissions || reportData.dentists) || []).length);
  });
}

/* ── Dentist report ── */
function renderDentistsTable(data) {
  var submissions = data && (data.submissions || data.dentists) || [];
  document.getElementById('dentists-panel-title').textContent = 'Dentist Submissions (' + submissions.length + ')';

  if (submissions.length === 0) {
    document.getElementById('dentists-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">🦷</div>'
      + '<div class="empty-title">No submissions yet</div>'
      + '<div class="empty-sub">Dentist survey responses will appear here.</div>'
      + '</div>';
    return;
  }

  var rows = submissions.map(function (d) {
    return '<tr>'
      + '<td class="td-primary">' + escHtml(d.name || d.dentistName || '—') + '</td>'
      + '<td>' + escHtml(d.practice || d.practiceName || '—') + '</td>'
      + '<td class="td-mono">' + escHtml(d.phone || '—') + '</td>'
      + '<td class="td-mono">' + escHtml(Array.isArray(d.zips) ? d.zips.join(', ') : (d.zip || '—')) + '</td>'
      + '<td>' + escHtml(String(d.capacity || d.dailyCapacity || '—')) + '</td>'
      + '<td>' + formatDate(d.submittedAt || d.createdAt) + '</td>'
      + '</tr>';
  }).join('');

  document.getElementById('dentists-body').innerHTML =
    '<table><thead><tr>'
    + '<th>Name</th><th>Practice</th><th>Phone</th><th>Zip(s)</th><th>Capacity</th><th>Submitted</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function loadReport() {
  document.getElementById('dentists-body').innerHTML =
    '<div class="spinner-wrap"><div class="spinner"></div> Loading…</div>';

  MxApi.report.get().then(function (data) {
    reportData = data;
    renderDentistsTable(data);
    renderKpis(allLeads, (data && (data.submissions || data.dentists) || []).length);
  }).catch(function (err) {
    document.getElementById('dentists-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">⚠️</div>'
      + '<div class="empty-title">Failed to load report</div>'
      + '<div class="empty-sub">' + escHtml(err.message) + '</div>'
      + '</div>';
  });
}

/* ── Init ── */
loadLeads();
loadReport();
