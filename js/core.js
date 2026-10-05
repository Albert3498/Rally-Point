/*
 * Voluntar front end - core.
 *
 * HOW TO ADD A FEATURE
 *   1. Create js/features/<name>.js and add a <script> tag for it in interface.html
 *      (after core.js, before the "boot" comment).
 *   2. Register it:
 *        App.register({
 *          id: 'my-page',            // route -> #/my-page
 *          label: 'My page',         // text in the top navigation
 *          access: 'user',           // 'public' | 'user' (logged in) | 'admin' | 'guest' (logged out only)
 *          order: 50,                // position in the navigation (lower = more to the left)
 *          nav: true,                // false = reachable by URL/code but not listed in the navigation
 *          render(el, App) {},       // called once, the first time the page opens
 *          show(el, route) {},       // optional, called every time the page opens
 *        });
 *   3. Talk to the backend with App.api('/path', { method, params, body }).
 *      Build DOM with App.h('div', { class: 'x' }, 'text') - it never uses innerHTML,
 *      so user-supplied data cannot inject markup.
 *
 * Other hooks: App.addNav({ label, href, order }), App.onSession(fn), App.toast(msg, 'ok'|'error'),
 * App.go('home'), App.session ({ name, role } or empty when logged out).
 * Settings can be overridden before this file loads: window.APP_CONFIG = { apiBase: '...' }.
 */
(function () {
  'use strict';

  // Served by the API itself when deployed, so use same-origin requests; only local dev needs the explicit address.
  const LOCAL_HOSTS = ['', 'localhost', '127.0.0.1'];

  const cfg = Object.assign(
    { apiBase: LOCAL_HOSTS.includes(location.hostname) ? 'http://127.0.0.1:8000' : '', tokenKey: 'volunteer.token' },
    window.APP_CONFIG
  );

  /* ---------- DOM helper ---------- */

  function append(el, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, kids);
    return el;
  }

  // el.replaceChildren(null) would insert the text "null"; fill() skips empty values the way h() does.
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((kid) => kid != null && kid !== false));
  }

  /* ---------- Storage (may be blocked, so always guarded) ---------- */

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  };

  /* ---------- Toasts ---------- */

  function toast(message, kind = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) {
      box = h('div', { id: 'toasts', 'aria-live': 'polite' });
      document.body.append(box);
    }
    const item = h('div', { class: 'toast ' + kind }, message);
    box.append(item);
    setTimeout(() => item.remove(), 4500);
  }

  /* ---------- API ---------- */

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  // Server messages are in English; the interface is in Romanian, so the common ones are translated here.
  const KNOWN_MESSAGES = {
    'name already exists': 'Există deja un cont cu acest nume. Alege alt nume sau autentifică-te.',
    'invalid user': 'Nume sau parolă greșite.',
    'Too many login attempts,try again later': 'Prea multe încercări. Încearcă din nou peste câteva minute.',
    'token is invalid': 'Sesiunea nu mai este validă. Autentifică-te din nou.',
    'login again please': 'Sesiunea a expirat. Autentifică-te din nou.',
    'Not authenticated': 'Trebuie să fii autentificat.',
    'Image must be JPEG, PNG, or WebP.': 'Imaginea trebuie să fie JPEG, PNG sau WebP.',
    'Image must be 5 MB or smaller.': 'Imaginea trebuie să aibă cel mult 5 MB.',
    'Image content does not match its file type.': 'Conținutul imaginii nu corespunde formatului fișierului.',
    'Request must be 6 MB or smaller.': 'Cererea trebuie să aibă cel mult 6 MB.',
    'Event data is required.': 'Completează detaliile oportunității.',
    'Image upload is invalid.': 'Fișierul încărcat nu este o imagine validă.',
    'Invalid event data.': 'Detaliile oportunității nu sunt valide.',
  };
  const FIELD_LABELS = {
    name: 'Nume', password: 'Parolă', birthdate: 'Data nașterii', email: 'Email', city: 'Oraș', country: 'Țară',
    aptitudes: 'Aptitudini', account_type: 'Tip de cont', title: 'Titlu', description: 'Descriere', category: 'Categorie',
    start_datetime: 'Început', end_datetime: 'Sfârșit', location: 'Locație', volunteers_needed: 'Voluntari necesari',
    volunteer_tasks: 'Sarcinile voluntarilor', organizer_name: 'Organizator', contact_email: 'Email de contact',
    contact_phone: 'Telefon', requirements: 'Cerințe', additional_notes: 'Note suplimentare', review_note: 'Notă',
  };
  const MESSAGE_PATTERNS = [
    [/^String should have at least (\d+) characters?/, 'trebuie să aibă cel puțin $1 caractere'],
    [/^String should have at most (\d+) characters?/, 'poate avea cel mult $1 caractere'],
    [/^Field required/, 'este obligatoriu'],
    [/^Input should be greater than (\d+)/, 'trebuie să fie mai mare decât $1'],
    [/email address/i, 'nu este o adresă de email validă'],
    [/^Input should be a valid date/, 'nu este o dată validă'],
  ];

  function translateMessage(message) {
    const text = String(message).replace(/^Value error, /, '');
    if (KNOWN_MESSAGES[text]) return KNOWN_MESSAGES[text];
    for (const [pattern, replacement] of MESSAGE_PATTERNS) {
      if (pattern.test(text)) return text.replace(pattern, replacement);
    }
    return text;
  }

  function describeError(data, status) {
    if (data && typeof data.detail === 'string') return translateMessage(data.detail);
    if (data && Array.isArray(data.detail)) {
      return data.detail
        .map((e) => {
          const field = (e.loc || []).filter((part) => part !== 'body' && part !== 'query').pop();
          const text = translateMessage(e.msg);
          return field ? (FIELD_LABELS[field] || field) + ': ' + text : text;
        })
        .join('; ');
    }
    return 'Cererea a eșuat (cod ' + status + ').';
  }

  async function api(path, { method = 'GET', params, body, auth = true } = {}) {
    const url = new URL(cfg.apiBase + path, location.href);
    for (const [key, value] of Object.entries(params || {})) {
      for (const item of [].concat(value)) {
        if (item !== '' && item != null) url.searchParams.append(key, item);
      }
    }
    const headers = {};
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
    if (auth && session.token) headers.Authorization = 'Bearer ' + session.token;

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Nu mă pot conecta la server (' + cfg.apiBase + '). Pornește API-ul și încearcă din nou.');
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      if (res.status === 401 && session.token) {
        clearSession();
        toast('Sesiunea a expirat. Autentifică-te din nou.', 'error');
      }
      throw new ApiError(res.status, describeError(data, res.status));
    }
    return data;
  }

  /* ---------- Session ---------- */

  const session = { token: null, name: null, role: null };
  const sessionListeners = [];

  function onSession(fn) { sessionListeners.push(fn); }
  function emitSession() { sessionListeners.forEach((fn) => fn(session)); }

  function clearSession() {
    session.token = session.name = session.role = null;
    store.remove(cfg.tokenKey);
    emitSession();
  }

  async function refreshSession() {
    const token = store.get(cfg.tokenKey);
    if (!token) return;
    session.token = token;
    try {
      const me = await api('/whoami/');
      session.name = me.sub;
      session.role = me.role;
    } catch (err) {
      if (err.status !== 401) session.token = null; // 401 already cleared everything
    }
    emitSession();
  }

  // The server ignores case when matching names, so the name is sent as typed.
  async function login(name, password) {
    const data = await api('/login/', { method: 'POST', auth: false, body: { name: name.trim(), password } });
    store.set(cfg.tokenKey, data.access_token);
    await refreshSession();
  }

  function logout() {
    clearSession();
    go('home');
  }

  /* ---------- Views, navigation and router ---------- */

  const views = new Map();
  const extraNav = [];

  function register(view) {
    views.set(view.id, Object.assign({ access: 'public', order: 100, nav: true }, view));
  }

  function addNav(item) {
    extraNav.push(Object.assign({ order: 100 }, item));
  }

  function isAllowed(access) {
    if (access === 'public') return true;
    if (access === 'guest') return !session.name;
    if (!session.name) return false;
    if (access === 'organization') return session.role === 'organization';
    return access === 'user' || session.role === 'admin';
  }

  function go(path) {
    const target = '#/' + path;
    if (location.hash === target) route();
    else location.hash = target;
  }

  function parseHash() {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const [id, ...rest] = path.split('/');
    return { id: id || 'home', sub: rest.join('/'), query: new URLSearchParams(query || '') };
  }

  function mountView(view) {
    if (view.mounted) return;
    view.el = document.getElementById('view-' + view.id);
    if (!view.el) {
      view.body = h('div', { class: 'container' });
      view.el = h('section', { class: 'section view', id: 'view-' + view.id }, view.body);
      document.getElementById('views').append(view.el);
    } else {
      view.body = view.el;
    }
    if (view.render) view.render(view.body, App);
    view.mounted = true;
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    const current = parseHash();
    const items = [
      ...[...views.values()]
        .filter((v) => v.nav && v.label && isAllowed(v.access))
        .map((v) => ({ label: v.label, href: '#/' + v.id, order: v.order, viewId: v.id })),
      ...extraNav.filter((i) => isAllowed(i.access || 'public')),
    ].sort((a, b) => a.order - b.order);

    nav.replaceChildren(
      ...items.map((item) => {
        const active = item.viewId ? item.viewId === current.id && !current.sub : item.href === location.hash;
        return h('button', {
          type: 'button',
          class: active ? 'active' : '',
          onclick: () => { location.hash = item.href; },
        }, item.label);
      })
    );
  }

  let currentView = null;

  function route() {
    const r = parseHash();
    const view = views.get(r.id) || views.get('home');

    if (view.access === 'guest' && session.name) return go('home');
    if (!isAllowed(view.access)) {
      if (!session.name) return go('login?next=' + encodeURIComponent(location.hash));
      toast('Nu ai acces la această pagină.', 'error');
      return go('home');
    }

    mountView(view);
    const changed = currentView !== view;
    // A page can clean up when the user leaves it (e.g. close an open dialog, which would otherwise block the next page).
    if (changed && currentView && currentView.hide) currentView.hide();
    currentView = view;
    views.forEach((v) => v.el && v.el.classList.toggle('active', v === view));
    if (view.show) view.show(view.body, r);
    renderNav();
    document.title = view.id === 'home'
      ? 'RallyPoint · Acasă'
      : (view.label ? view.label + ' · ' : '') + 'RallyPoint';

    const anchor = r.sub && document.getElementById(r.sub);
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    else if (changed || !view.keepScroll) window.scrollTo(0, 0);
    // Screen readers and keyboard users start at the top of the new page, not on the old link.
    if (changed) {
      const main = document.getElementById('views');
      if (main) main.focus({ preventScroll: true });
    }
  }

  /* ---------- Formatting ---------- */

  function fmtDate(iso) {
    const date = new Date(iso);
    return isNaN(date) ? String(iso) : date.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  /* ---------- Public surface ---------- */

  const App = {
    cfg, h, fill, api, ApiError, toast, session, onSession, login, logout, refreshSession,
    register, addNav, go, fmtDate, ui: {},
    getView: (id) => views.get(id),
  };
  window.App = App;

  async function boot() {
    let ready = false;
    // Re-route on login/logout so guarded pages and the navigation always match the session.
    onSession(() => { if (ready) route(); });
    await refreshSession();
    ready = true;
    window.addEventListener('hashchange', route);
    route();
  }

  // Feature scripts run before DOMContentLoaded fires, so every view is registered by now.
  document.addEventListener('DOMContentLoaded', boot);
})();
