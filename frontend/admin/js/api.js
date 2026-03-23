'use strict';

/**
 * MxApi — Shared API client for Moxident Admin.
 *
 * ── LAMBDA ENDPOINTS REQUIRED ──────────────────────────────────────────────
 *
 * The following endpoints do NOT yet exist and must be added to moxident-router:
 *
 * 1. GET /admin/leads
 *    Auth: Verify Bearer token (Google ID token) — check email domain
 *    Returns: { leads: LeadRecord[] }
 *    LeadRecord: { id, name, phone, zip, symptom, status, submittedAt }
 *    DynamoDB: Scan the leads table, return all items sorted by submittedAt DESC
 *
 * 2. PATCH /admin/leads/:id
 *    Auth: Same token verification
 *    Body: { status: 'new' | 'contacted' | 'matched' | 'converted' | 'no_answer' | 'cancelled' }
 *    Returns: { id, status, updatedAt }
 *    DynamoDB: UpdateItem on the leads table, set status + updatedAt
 *
 * 3. GET /admin/cold-calls (future — currently uses localStorage)
 * 4. POST /admin/cold-calls (future)
 * 5. PATCH /admin/cold-calls/:id (future)
 * 6. DELETE /admin/cold-calls/:id (future)
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

const MxApi = (() => {
  const BASE = 'https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod';
  const COLD_CALLS_KEY = 'mx_cold_calls_v1';

  /* ── HTTP client ─────────────────────────── */
  async function request(method, path, body) {
    const session = MxAuth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(BASE + path, options);
    } catch (e) {
      throw new Error('Network error — check your connection.');
    }

    if (res.status === 401) {
      MxAuth.clearSession();
      window.location.replace('/');
      return;
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Unexpected response from server (${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || `Server error (${res.status})`);
    }

    return data;
  }

  /* ── Leads ───────────────────────────────── */
  const leads = {
    /**
     * Fetch all patient leads.
     * Lambda: GET /admin/leads
     * @returns {Promise<{leads: Array}>}
     */
    list() {
      return request('GET', '/admin/leads');
    },

    /**
     * Update the status of a lead.
     * Lambda: PATCH /admin/leads/:id
     * @param {string} id
     * @param {string} status
     * @returns {Promise<{id: string, status: string, updatedAt: string}>}
     */
    updateStatus(id, status) {
      return request('PATCH', `/admin/leads/${encodeURIComponent(id)}`, { status });
    },
  };

  /* ── Report ──────────────────────────────── */
  const report = {
    /**
     * Fetch dentist survey report.
     * Lambda: GET /dentist-survey/report (existing)
     * @returns {Promise<Object>}
     */
    get() {
      return request('GET', '/dentist-survey/report');
    },
  };

  /* ── Cold Calls (localStorage) ───────────── */
  // TODO: Replace with real Lambda endpoints once built.
  // To migrate: remove these localStorage functions and replace each
  // method with the corresponding request() call.

  function loadColdCalls() {
    try {
      return JSON.parse(localStorage.getItem(COLD_CALLS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function persistColdCalls(calls) {
    try {
      localStorage.setItem(COLD_CALLS_KEY, JSON.stringify(calls));
    } catch (e) {
      console.error('Failed to save cold calls:', e);
    }
  }

  function generateId() {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  const coldCalls = {
    list() {
      return loadColdCalls();
    },

    create(data) {
      const calls = loadColdCalls();
      const call = {
        id:         generateId(),
        dentistName: data.dentistName?.trim() || '',
        phone:       data.phone?.trim() || '',
        outcome:     data.outcome || 'voicemail',
        followUpDate: data.followUpDate || '',
        notes:       data.notes?.trim() || '',
        loggedBy:    MxAuth.getSession()?.email || 'unknown',
        loggedAt:    new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };
      calls.unshift(call);
      persistColdCalls(calls);
      return call;
    },

    update(id, data) {
      const calls = loadColdCalls();
      const idx = calls.findIndex(c => c.id === id);
      if (idx === -1) throw new Error('Call record not found');
      calls[idx] = {
        ...calls[idx],
        dentistName:  data.dentistName ?? calls[idx].dentistName,
        phone:        data.phone       ?? calls[idx].phone,
        outcome:      data.outcome     ?? calls[idx].outcome,
        followUpDate: data.followUpDate !== undefined ? data.followUpDate : calls[idx].followUpDate,
        notes:        data.notes       !== undefined ? data.notes : calls[idx].notes,
        updatedAt:    new Date().toISOString(),
      };
      persistColdCalls(calls);
      return calls[idx];
    },

    delete(id) {
      const calls = loadColdCalls().filter(c => c.id !== id);
      persistColdCalls(calls);
    },
  };

  return { leads, report, coldCalls };
})();
