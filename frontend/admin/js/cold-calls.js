'use strict';

/* ── Auth guard ── */
var session = MxAuth.requireAuth();
if (session) MxAuth.renderNav('/cold-calls/');

/* ── State ── */
var editingId = null;

/* ── Helpers ── */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    var parts = iso.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function outcomeBadge(outcome) {
  var map = {
    interested:     { cls: 'outcome-interested',      label: 'Interested'     },
    not_interested: { cls: 'outcome-not_interested',  label: 'Not Interested' },
    voicemail:      { cls: 'outcome-voicemail',       label: 'Voicemail'      },
    no_answer:      { cls: 'outcome-no_answer',       label: 'No Answer'      },
  };
  var o = map[outcome] || { cls: 'bdg-gray', label: outcome || '—' };
  return '<span class="bdg ' + o.cls + '">' + o.label + '</span>';
}

/* ── Validation ── */
function validate(fields) {
  var ok = true;
  fields.forEach(function (f) {
    var el = document.getElementById(f.id);
    var fg = document.getElementById(f.fgId);
    if (!el || !fg) return;
    if (!f.test(el.value)) { fg.classList.add('has-err'); ok = false; }
    else                     fg.classList.remove('has-err');
  });
  return ok;
}

function clearErrors() {
  var ids = Array.prototype.slice.call(arguments);
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('has-err');
  });
}

/* ── Log form ── */
function handleSubmit() {
  var ok = validate([
    { id: 'f-dentist-name', fgId: 'fg-dentist-name', test: function (v) { return v.trim().length >= 2; } },
    { id: 'f-phone',        fgId: 'fg-phone',         test: function (v) { return v.trim().length >= 7; } },
    { id: 'f-outcome',      fgId: 'fg-outcome',       test: function (v) { return v !== ''; } },
  ]);
  if (!ok) return;

  var btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    MxApi.coldCalls.create({
      dentistName:  document.getElementById('f-dentist-name').value,
      phone:        document.getElementById('f-phone').value,
      outcome:      document.getElementById('f-outcome').value,
      followUpDate: document.getElementById('f-followup').value,
      notes:        document.getElementById('f-notes').value,
    });
    clearForm();
    renderTable();
  } catch (err) {
    alert('Failed to save call: ' + err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Log Call →';
  }
}

function clearForm() {
  ['f-dentist-name', 'f-phone', 'f-outcome', 'f-followup', 'f-notes'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearErrors('fg-dentist-name', 'fg-phone', 'fg-outcome');
}

/* ── Table ── */
function renderTable() {
  var calls = MxApi.coldCalls.list();
  document.getElementById('table-title').textContent = 'Call Log (' + calls.length + ')';
  document.getElementById('table-hint').textContent  = calls.length > 0 ? 'Sorted by most recent' : '';

  if (calls.length === 0) {
    document.getElementById('table-body').innerHTML =
      '<div class="empty-state">'
      + '<div class="empty-icon">📞</div>'
      + '<div class="empty-title">No calls logged yet</div>'
      + '<div class="empty-sub">Use the form above to log your first dentist outreach call.</div>'
      + '</div>';
    return;
  }

  var rows = calls.map(function (c) {
    return '<tr>'
      + '<td class="td-primary">' + escHtml(c.dentistName) + '</td>'
      + '<td class="td-mono">'    + escHtml(c.phone) + '</td>'
      + '<td>'                    + outcomeBadge(c.outcome) + '</td>'
      + '<td>'                    + (c.followUpDate ? formatDate(c.followUpDate) : '<span class="text-muted">—</span>') + '</td>'
      + '<td style="max-width:240px;white-space:pre-wrap;word-break:break-word;">' + (escHtml(c.notes) || '<span class="text-muted">—</span>') + '</td>'
      + '<td style="white-space:nowrap;">' + formatDateTime(c.loggedAt) + '</td>'
      + '<td class="td-mono" style="font-size:11px;">' + escHtml(c.loggedBy || '—') + '</td>'
      + '<td><div class="td-actions">'
      +   '<button class="btn btn-ghost"   onclick="openEditModal(\'' + escHtml(c.id) + '\')">Edit</button>'
      +   '<button class="btn btn-danger"  onclick="handleDelete(\'' + escHtml(c.id) + '\')">Delete</button>'
      + '</div></td>'
      + '</tr>';
  }).join('');

  document.getElementById('table-body').innerHTML =
    '<table><thead><tr>'
    + '<th>Dentist</th><th>Phone</th><th>Outcome</th><th>Follow-up</th>'
    + '<th>Notes</th><th>Logged</th><th>By</th><th></th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Delete ── */
function handleDelete(id) {
  if (!confirm('Delete this call record? This cannot be undone.')) return;
  try {
    MxApi.coldCalls.delete(id);
    renderTable();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

/* ── Edit modal ── */
function openEditModal(id) {
  var call = MxApi.coldCalls.list().find(function (c) { return c.id === id; });
  if (!call) return;
  editingId = id;

  document.getElementById('mf-dentist-name').value = call.dentistName  || '';
  document.getElementById('mf-phone').value         = call.phone        || '';
  document.getElementById('mf-outcome').value       = call.outcome      || '';
  document.getElementById('mf-followup').value      = call.followUpDate || '';
  document.getElementById('mf-notes').value         = call.notes        || '';

  clearErrors('mfg-dentist-name', 'mfg-phone', 'mfg-outcome');
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editingId = null;
}

function handleModalBackdropClick(e) {
  if (e.target === document.getElementById('edit-modal')) closeModal();
}

function handleModalSave() {
  if (!editingId) return;
  var ok = validate([
    { id: 'mf-dentist-name', fgId: 'mfg-dentist-name', test: function (v) { return v.trim().length >= 2; } },
    { id: 'mf-phone',        fgId: 'mfg-phone',         test: function (v) { return v.trim().length >= 7; } },
    { id: 'mf-outcome',      fgId: 'mfg-outcome',       test: function (v) { return v !== ''; } },
  ]);
  if (!ok) return;

  try {
    MxApi.coldCalls.update(editingId, {
      dentistName:  document.getElementById('mf-dentist-name').value,
      phone:        document.getElementById('mf-phone').value,
      outcome:      document.getElementById('mf-outcome').value,
      followUpDate: document.getElementById('mf-followup').value,
      notes:        document.getElementById('mf-notes').value,
    });
    closeModal();
    renderTable();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

/* ── Keyboard ── */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

/* ── Init ── */
renderTable();
