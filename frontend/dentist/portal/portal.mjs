// portal.mjs — Dentist Portal frontend logic
const API = "https://7i7j7c8rx7.execute-api.us-east-2.amazonaws.com/prod";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["Morning", "Afternoon"];

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("mox_portal_token");
}

function setToken(token) {
  localStorage.setItem("mox_portal_token", token);
}

function clearToken() {
  localStorage.removeItem("mox_portal_token");
}

const PORTAL_FLOW_STORAGE_KEY = "mox_portal_flow";

function getStoredPortalFlow() {
  try {
    const raw = sessionStorage.getItem(PORTAL_FLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storePortalFlow(updates = {}) {
  const next = {
    ...getStoredPortalFlow(),
    ...updates,
  };
  try {
    sessionStorage.setItem(PORTAL_FLOW_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function clearPortalFlow() {
  try {
    sessionStorage.removeItem(PORTAL_FLOW_STORAGE_KEY);
  } catch {}
}

function getPortalFlowParams() {
  const params = new URLSearchParams(window.location.search);
  const queryFlow = {
    email: params.get("email") || "",
    token: params.get("token") || "",
    flow: params.get("flow") || "",
  };

  if (queryFlow.email || queryFlow.token || queryFlow.flow) {
    return storePortalFlow(queryFlow);
  }

  return getStoredPortalFlow();
}

function authHeaders() {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function showSuccess(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait..." : btn.dataset.label || btn.textContent;
  if (!loading && !btn.dataset.label) return;
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
}

// ── Login ─────────────────────────────────────────────────────────────────────

window.handleLogin = async function (e) {
  e.preventDefault();
  hideError("login-error");
  const email = document.getElementById("login-email").value.trim();
  console.log(email );
  
  const password = document.getElementById("login-password").value;
  console.log(password)

  setLoading("login-btn", true);
  try {
    const res = await fetch(`${API}/dentist-portal/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("login-error", data.error || "Login failed");
      return;
    }
    setToken(data.token);
    window.location.href = "dashboard.html";
  } catch {
    showError("login-error", "Network error. Please try again.");
  } finally {
    setLoading("login-btn", false);
  }
};

// ── Set password ──────────────────────────────────────────────────────────────

window.handleSetPassword = async function (e) {
  e.preventDefault();
  hideError("sp-error");
  const password = document.getElementById("sp-password").value;
  const confirm = document.getElementById("sp-confirm").value;

  if (password !== confirm) {
    showError("sp-error", "Passwords do not match.");
    return;
  }

  const { email, token } = getPortalFlowParams();
  if (!email && !token) {
    showError("sp-error", "Missing setup parameter.");
    return;
  }

  setLoading("sp-btn", true);
  try {
    const res = await fetch(`${API}/dentist-portal/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("sp-error", data.error || "Failed to set password.");
      return;
    }
    clearToken();
    clearPortalFlow();
    const nextEmail = data.email || email || "";
    const next = `index.html?email=${encodeURIComponent(nextEmail)}&passwordSet=1`;
    window.location.href = next;
  } catch {
    showError("sp-error", "Network error. Please try again.");
  } finally {
    setLoading("sp-btn", false);
  }
};

// ── Forgot password ───────────────────────────────────────────────────────────

window.handleForgotPassword = async function (e) {
  e.preventDefault();
  hideError("forgot-error");
  const email = document.getElementById("forgot-email").value.trim();

  setLoading("forgot-btn", true);
  try {
    const res = await fetch(`${API}/dentist-portal/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json();
      showError("forgot-error", data.error || "Failed to send reset email.");
      return;
    }
    document.getElementById("forgot-form").classList.add("hidden");
    showSuccess("forgot-success");
  } catch {
    showError("forgot-error", "Network error. Please try again.");
  } finally {
    setLoading("forgot-btn", false);
  }
};

// ── Reset password ────────────────────────────────────────────────────────────

window.handleResetPassword = async function (e) {
  e.preventDefault();
  hideError("reset-error");
  const password = document.getElementById("reset-password").value;
  const confirm = document.getElementById("reset-confirm").value;

  if (password !== confirm) {
    showError("reset-error", "Passwords do not match.");
    return;
  }

  const { token } = getPortalFlowParams();
  if (!token) {
    showError("reset-error", "Missing reset token.");
    return;
  }

  setLoading("reset-btn", true);
  try {
    const res = await fetch(`${API}/dentist-portal/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError("reset-error", data.error || "Failed to reset password.");
      return;
    }
    clearPortalFlow();
    document.getElementById("reset-form").classList.add("hidden");
    showSuccess("reset-success");
  } catch {
    showError("reset-error", "Network error. Please try again.");
  } finally {
    setLoading("reset-btn", false);
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────

window.handleLogout = function () {
  clearToken();
  clearPortalFlow();
  window.location.href = "index.html";
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  if (!requireAuth()) return;

  try {
    const res = await fetch(`${API}/dentist-portal/dashboard`, {
      headers: authHeaders(),
    });
    if (res.status === 401) {
      clearToken();
      window.location.href = "index.html";
      return;
    }
    const data = await res.json();

    // Greeting
    const nameEl = document.getElementById("dash-greeting");
    if (nameEl) nameEl.textContent = `Welcome back, ${data.dentistName || "Doctor"}`;
    const practiceEl = document.getElementById("dash-practice");
    if (practiceEl) practiceEl.textContent = data.practiceName || "";

    // Stats
    const stats = data.stats || {};
    setStatText("stat-received", stats.requestsReceived);
    setStatText("stat-accepted", stats.accepted);
    setStatText("stat-missed", stats.missed);
    setStatText("stat-completed", stats.completed);
    setStatText("stat-response", stats.avgResponseTime);

    // Availability grid
    buildAvailabilityGrid(data.thisWeekAvailability || {});

    // Recent requests
    renderRequests(data.recentRequests || []);
  } catch {
    console.error("Failed to load dashboard");
  }
}

function setStatText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? "—";
}

function buildAvailabilityGrid(current) {
  const grid = document.getElementById("avail-grid");
  if (!grid) return;

  grid.innerHTML = "";

  // Header row: empty corner + day names
  const corner = document.createElement("div");
  corner.className = "portal-avail-header";
  grid.appendChild(corner);

  DAYS.forEach(day => {
    const hdr = document.createElement("div");
    hdr.className = "portal-avail-header";
    hdr.textContent = day;
    grid.appendChild(hdr);
  });

  // One row per slot
  SLOTS.forEach(slot => {
    const label = document.createElement("div");
    label.className = "portal-avail-label";
    label.textContent = slot;
    grid.appendChild(label);

    DAYS.forEach(day => {
      const cell = document.createElement("div");
      cell.className = "portal-avail-cell";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.day = day;
      cb.dataset.slot = slot.toLowerCase();
      cb.checked = !!current[day]?.[slot.toLowerCase()];
      cell.appendChild(cb);
      grid.appendChild(cell);
    });
  });
}

function collectAvailability() {
  const avail = {};
  const checkboxes = document.querySelectorAll("#avail-grid input[type=checkbox]");
  checkboxes.forEach(cb => {
    const { day, slot } = cb.dataset;
    if (!avail[day]) avail[day] = {};
    avail[day][slot] = cb.checked;
  });
  return avail;
}

window.handleSaveAvailability = async function () {
  const availability = collectAvailability();
  setLoading("save-avail-btn", true);
  try {
    const res = await fetch(`${API}/dentist-portal/availability`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ availability }),
    });
    if (res.status === 401) {
      clearToken();
      window.location.href = "index.html";
      return;
    }
    if (res.ok) {
      showSuccess("avail-success");
      setTimeout(() => hideError("avail-success"), 3000);
    }
  } catch {
    console.error("Failed to save availability");
  } finally {
    setLoading("save-avail-btn", false);
  }
};

function renderRequests(requests) {
  const tbody = document.getElementById("requests-body");
  if (!tbody) return;

  if (!requests.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="portal-table-empty">No requests yet</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => {
    const date = r.date ? new Date(r.date).toLocaleDateString() : "—";
    const statusClass = `portal-status portal-status-${r.status || "pending"}`;
    return `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.symptom)}</td>
      <td>${escapeHtml(r.zip)}</td>
      <td>${date}</td>
      <td><span class="${statusClass}">${escapeHtml(r.status)}</span></td>
    </tr>`;
  }).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  if (!requireAuth()) return;

  try {
    const res = await fetch(`${API}/dentist-portal/dashboard`, {
      headers: authHeaders(),
    });
    if (res.status === 401) {
      clearToken();
      window.location.href = "index.html";
      return;
    }
    const data = await res.json();
    const emailInput = document.getElementById("settings-email");
    if (emailInput) emailInput.value = data.email || "";
    const practiceInput = document.getElementById("settings-practice");
    if (practiceInput) practiceInput.value = data.practiceName || "";
  } catch {
    console.error("Failed to load settings");
  }
}

window.handleChangePassword = async function (e) {
  e.preventDefault();
  hideError("settings-error");
  const currentPw = document.getElementById("settings-current-pw").value;
  const newPw = document.getElementById("settings-new-pw").value;
  const confirmPw = document.getElementById("settings-confirm-pw").value;

  if (newPw !== confirmPw) {
    showError("settings-error", "New passwords do not match.");
    return;
  }

  setLoading("change-pw-btn", true);
  try {
    // Verify current password by logging in
    const emailEl = document.getElementById("settings-email");
    const email = emailEl ? emailEl.value : "";

    const loginRes = await fetch(`${API}/dentist-portal/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: currentPw }),
    });
    if (!loginRes.ok) {
      showError("settings-error", "Current password is incorrect.");
      return;
    }

    console.log("SET PASSWORD SUBMIT", {
      API,
      email,
      newPwLength: newPw ? newPw.length : 0
    });
    const setRes = await fetch(`${API}/dentist-portal/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: newPw }),
    });
    const data = await setRes.json();
    if (!setRes.ok) {
      showError("settings-error", data.error || "Failed to update password.");
      return;
    }
    setToken(data.token);
    showSuccess("settings-success");
    document.getElementById("change-pw-form").reset();
    setTimeout(() => {
      const el = document.getElementById("settings-success");
      if (el) el.classList.add("hidden");
    }, 3000);
  } catch {
    showError("settings-error", "Network error. Please try again.");
  } finally {
    setLoading("change-pw-btn", false);
  }
};

// ── Page router ───────────────────────────────────────────────────────────────

const page = window.location.pathname.split("/").pop() || "index.html";

if (page === "dashboard.html") {
  loadDashboard();
} else if (page === "settings.html") {
  loadSettings();
} else if (page === "verify.html") {
  const { token } = getPortalFlowParams();

  const loading = document.getElementById("verify-loading");
  const success = document.getElementById("verify-success");
  const error = document.getElementById("verify-error");
  const errorMsg = document.getElementById("verify-error-msg");

  if (!token) {
    loading?.classList.add("hidden");
    error?.classList.remove("hidden");
    if (errorMsg) errorMsg.textContent = "Missing verification token.";
  } else {
    window.location.replace(`set-password.html?token=${encodeURIComponent(token)}&flow=verify`);
  }
} else if (page === "index.html" || page === "") {
  const params = new URLSearchParams(window.location.search);
  const loginEmail = params.get("email");
  const passwordSet = params.get("passwordSet");
  const { token, flow } = getPortalFlowParams();

  if (token) {
    const target = flow === "reset" ? "reset-password.html" : "set-password.html";
    window.location.replace(`${target}?token=${encodeURIComponent(token)}${flow ? `&flow=${encodeURIComponent(flow)}` : ""}`);
  } else if (loginEmail) {
    clearPortalFlow();
    const emailInput = document.getElementById("login-email");
    if (emailInput) emailInput.value = loginEmail;
  }
   if (passwordSet === "1") {
    const loginError = document.getElementById("login-error");
    if (loginError) {
      loginError.textContent = "Password set successfully. Sign in to access your portal.";
      loginError.classList.remove("hidden");
    }
  } else if (getToken()) {
    window.location.href = "dashboard.html";
  }
}
