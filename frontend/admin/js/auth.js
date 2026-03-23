'use strict';

/**
 * MxAuth — Google OAuth session management for Moxident Admin.
 *
 * PRODUCTION NOTE: This module handles frontend-only auth. The Google ID token
 * is sent as a Bearer header on every API request. Lambda admin endpoints must
 * verify this token using Google's public keys before trusting the caller.
 * See: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
const MxAuth = (() => {
  const CLIENT_ID    = '218153485861-013sg8qjimn521j1k6jluj381tik62tu.apps.googleusercontent.com';
  const SESSION_KEY  = 'mx_admin_session_v1';
  const AUTH_DOMAIN  = 'moxident.com';
  // Add individual emails here for non-domain accounts (e.g. contractors)
  const AUTH_EMAILS  = [];

  /* ── JWT helpers ─────────────────────────── */
  function parseJwt(token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch (e) {
      return null;
    }
  }

  function isExpired(exp) {
    return !exp || (Date.now() / 1000) > exp;
  }

  function isAuthorized(email) {
    if (!email) return false;
    if (AUTH_EMAILS.includes(email)) return true;
    return email.endsWith('@' + AUTH_DOMAIN);
  }

  /* ── Session storage ─────────────────────── */
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (isExpired(session.exp)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function setSession(credential) {
    const payload = parseJwt(credential);
    if (!payload) throw new Error('Invalid credential payload');
    const session = {
      token:   credential,
      email:   payload.email,
      name:    payload.name,
      picture: payload.picture,
      exp:     payload.exp,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ── Auth guard ──────────────────────────── */
  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.replace('/');
      return null;
    }
    return session;
  }

  function signOut() {
    clearSession();
    window.location.replace('/');
  }

  /* ── Google Sign-In init ─────────────────── */
  function initSignIn(containerId, onSuccess, onError) {
    function init() {
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          const payload = parseJwt(response.credential);
          if (!isAuthorized(payload?.email)) {
            onError('Access denied. Use your @moxident.com account.');
            return;
          }
          try {
            setSession(response.credential);
            onSuccess();
          } catch (e) {
            onError('Sign-in failed. Please try again.');
          }
        },
        auto_select: false,
      });

      window.google.accounts.id.renderButton(
        document.getElementById(containerId),
        { theme: 'outline', size: 'large', width: 280, text: 'signin_with' }
      );
    }

    // GIS script may still be loading
    if (window.google?.accounts?.id) {
      init();
    } else {
      window.addEventListener('load', init);
    }
  }

  /* ── Top nav renderer ────────────────────── */
  /**
   * Call renderNav(activeHref) on each protected page to inject the shared nav.
   * @param {string} activeHref - The href of the current page link (e.g. '/dashboard/')
   */
  function renderNav(activeHref) {
    const session = getSession();
    if (!session) return;

    const links = [
      { href: '/dashboard/',   label: 'Dashboard'   },
      { href: '/report/',      label: 'Report'       },
      { href: '/cold-calls/',  label: 'Cold Calls'   },
    ];

    const navHtml = `
      <nav class="admin-nav">
        <div class="admin-nav-logo" onclick="window.location.href='/dashboard/'">
          <div class="logo-dot"></div>Moxident
          <span class="nav-logo-tag">Admin</span>
        </div>
        <div class="admin-nav-links">
          ${links.map(l => `
            <a class="admin-nav-link${l.href === activeHref ? ' active' : ''}" href="${l.href}">${l.label}</a>
          `).join('')}
        </div>
        <div class="admin-nav-user">
          ${session.picture ? `<img class="user-avatar" src="${session.picture}" alt="${session.name}" referrerpolicy="no-referrer"/>` : ''}
          <span class="user-name">${session.name}</span>
          <button class="signout-btn" onclick="MxAuth.signOut()">Sign out</button>
        </div>
      </nav>
    `;

    const target = document.getElementById('admin-nav-host');
    if (target) target.innerHTML = navHtml;
  }

  return { getSession, clearSession, requireAuth, signOut, initSignIn, renderNav };
})();
