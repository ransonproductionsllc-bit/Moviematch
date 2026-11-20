// MovieMatch frontend — a dependency-free single-page app.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');

const app = { status: null, user: null, timers: [], cleanups: [] };

// ---------- utilities ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** One icon set: 24px grid, 1.75 stroke, round caps. */
const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.4-9.1C1.3 7.6 3.4 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.2 1.7-2 3.2-3.2 5.3-3.2 3.3 0 5.4 3.1 4.1 6.4C19.5 15.4 12 20 12 20z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8 4v16M16 4v16M3.5 9H8M3.5 15H8M16 9h4.5M16 15h4.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2"/>',
};

const initials = (u) => (u?.displayName || u?.username || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const avatar = (u, cls = '') => `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(u))}</span>`;

/**
 * Small pop-up menu anchored to a button. items: [{ label, icon, onClick, danger, checked, disabled, heading }]
 * Used for the poster "⋯" menu, "Add to list" and the account button.
 */
function openMenu(anchor, items) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => it.heading
    ? `<div class="menu-head">${esc(it.label)}</div>`
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>
        ${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.checked ? `<span class="tick">${icon('check')}</span>` : ''}</button>`).join('');
  ([...document.querySelectorAll('dialog[open]')].pop() || document.body).appendChild(el);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.right - el.offsetWidth), innerWidth - el.offsetWidth - 8);
  let top = r.bottom + 6;
  if (top + el.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    closeMenu();
    items[Number(b.dataset.i)].onClick?.();
  });
  anchor.setAttribute('aria-expanded', 'true');
  openMenu.state = { el, anchor };
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
  el.querySelector('button:not([disabled])')?.focus();
}
function onOutside(e) {
  const s = openMenu.state;
  if (s && !s.el.contains(e.target) && !s.anchor.contains(e.target)) closeMenu();
}
function closeMenu() {
  const s = openMenu.state;
  if (!s) return false;
  s.el.remove();
  s.anchor.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onOutside, true);
  openMenu.state = null;
  return true;
}
window.addEventListener('scroll', closeMenu, { passive: true });
window.addEventListener('resize', closeMenu);
const onHome = () => /^#?\/?$/.test(location.hash || '#/');
const STAR = '<svg class="i fill" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const icon = (name, label) =>
  `<svg class="i" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name]}</svg>`;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') {
    app.user = null;
    renderAuth();
    throw new Error(data.error || 'Please sign in');
  }
  if (res.status === 403 && /new password/i.test(data.error || '') && app.user) {
    app.user.mustChangePassword = true;
    renderSetPassword();
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.field = data.field;
    throw err;
  }
  return data;
}

let toastTimer;
/** toast(message) · toast(message, true) for an error · toast(message, { action: { label, onClick } }) */
function toast(msg, opts = false) {
  const o = typeof opts === 'object' && opts ? opts : { err: !!opts };
  const t = $('#toast');
  t.className = 'toast' + (o.err ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>${o.action ? `<button type="button" class="toast-action">${esc(o.action.label)}</button>` : ''}`;
  if (o.action) $('.toast-action', t).addEventListener('click', () => { hideToast(); o.action.onClick(); });
  // A popover sits in the top layer, so the message stays visible above an open dialog.
  if (t.showPopover) {
    try { t.hidePopover(); } catch { /* not open */ }
    t.showPopover();
  } else t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, o.duration || (o.action ? 5000 : 3000));
}
function hideToast() {
  const t = $('#toast');
  if (t.hidePopover) { try { t.hidePopover(); } catch { /* not open */ } } else t.hidden = true;
}
const fail = (err) => toast(err.message || String(err), true);

// ---------- inline form validation (pattern from Toggle Supply's form validation) ----------
const RULES = {
  displayName: (v) => (!v.trim() ? 'Tell us what to call you' : v.trim().length > 40 ? 'Keep your name under 40 characters' : ''),
  username: (v) => (/^[a-zA-Z0-9_.-]{2,32}$/.test(v.trim()) ? '' : 'Use 2–32 letters, numbers, dots, dashes or underscores'),
  loginUsername: (v) => (v.trim() ? '' : 'Enter your username'),
  loginPassword: (v) => (v ? '' : 'Enter your password'),
  password: (v) => (v.length >= 6 ? '' : 'Use at least 6 characters'),
  currentPassword: (v) => (v ? '' : 'Enter your current password'),
  confirmPassword: (v, form) => (v === form.newPassword.value ? '' : 'The two passwords don’t match'),
  listName: (v) => (!v.trim() ? 'Give the list a name' : v.trim().length > 60 ? 'Keep it under 60 characters' : ''),
};

function setFieldError(input, msg) {
  const field = input.closest('.field');
  let el = $('.field-error', field);
  if (!el) {
    el = document.createElement('p');
    el.className = 'field-error';
    el.id = `${input.id}-error`;
    field.appendChild(el);
  }
  el.textContent = msg || '';
  field.classList.toggle('invalid', !!msg);
  input.setAttribute('aria-invalid', String(!!msg));
  if (msg) input.setAttribute('aria-describedby', el.id);
  else input.removeAttribute('aria-describedby');
}

/** Checks a field when you leave it and re-checks while you fix it. Returns validateAll(), which focuses the first problem. */
function wireValidation(form, rules) {
  const check = (input) => {
    const msg = rules[input.name] ? rules[input.name](input.value, form) : '';
    setFieldError(input, msg);
    return !msg;
  };
  for (const input of $$('input', form)) {
    if (!rules[input.name]) continue;
    input.addEventListener('blur', () => {
      if (input.value || input.dataset.touched) check(input);
      input.dataset.touched = '1';
    });
    input.addEventListener('input', () => { if (input.closest('.field').classList.contains('invalid')) check(input); });
  }
  return () => {
    let first = null;
    for (const input of $$('input', form)) if (rules[input.name] && !check(input) && !first) first = input;
    first?.focus();
    return !first;
  };
}

/** Show a server error beside the field it names, otherwise in the general error line. */
function showServerError(form, err, generalEl) {
  const input = err.field && form.querySelector(`[name="${err.field}"]`);
  if (input) {
    setFieldError(input, err.message);
    input.focus();
    if (generalEl) generalEl.textContent = '';
  } else if (generalEl) generalEl.textContent = err.message;
  else toast(err.message, true);
}

// ---------- in-app dialogs (native <dialog>: focus stays inside, Escape closes, focus returns) ----------
/**
 * actions: [{ label (HTML), kind: ''|'ghost'|'danger-solid', value, submit, onSubmit(dialog) }]
 * onSubmit returns the value to close with, or undefined to stay open (e.g. a validation error).
 */
function openDialog({ title, body = '', actions = [], className = '', onOpen }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const d = document.createElement('dialog');
    d.className = `dlg ${className}`;
    d.setAttribute('aria-labelledby', 'dlg-title');
    d.innerHTML = `<form method="dialog" class="dlg-card" novalidate>
      <h2 id="dlg-title">${esc(title)}</h2>
      <div class="dlg-body">${body}</div>
      <div class="dlg-actions">${actions.map((a, i) => `<button type="${a.submit ? 'submit' : 'button'}" class="btn ${a.kind ?? 'ghost'}" data-a="${i}">${a.label}</button>`).join('')}</div>
    </form>`;
    document.body.appendChild(d);
    let result;
    const close = (value) => { result = value; d.close(); };
    d.addEventListener('close', () => {
      d.remove();
      if (opener?.isConnected) opener.focus();
      resolve(result);
    });
    d.addEventListener('click', (e) => { if (e.target === d) close(undefined); });
    $$('[data-a]', d).forEach((b) => {
      const a = actions[Number(b.dataset.a)];
      if (!a.submit) b.addEventListener('click', () => close(a.value));
    });
    $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = actions.find((x) => x.submit);
      if (!a) return;
      const btn = $(`[data-a="${actions.indexOf(a)}"]`, d);
      btn.disabled = true;
      const v = a.onSubmit ? await a.onSubmit(d) : a.value;
      btn.disabled = false;
      if (v !== undefined) close(v);
    });
    d.showModal();
    onOpen?.(d, close);
    ($('[autofocus]', d) || $('input:not([type=hidden])', d))?.focus();
  });
}

const confirmDialog = ({ title, message, confirmLabel, danger = false }) =>
  openDialog({
    title,
    body: `<p>${esc(message)}</p>`,
    actions: [
      { label: 'Cancel', value: false },
      { label: esc(confirmLabel), kind: danger ? 'danger-solid' : '', value: true, submit: true },
    ],
  }).then((v) => v === true);

function promptDialog({ title, label, value = '', confirmLabel = 'Save', rule }) {
  return openDialog({
    title,
    body: `<div class="field"><label for="dlg-in">${esc(label)}</label><input id="dlg-in" name="value" value="${esc(value)}" autocomplete="off" /></div>`,
    actions: [
      { label: 'Cancel' },
      {
        label: esc(confirmLabel), kind: '', submit: true,
        onSubmit: (d) => {
          const input = $('#dlg-in', d);
          const msg = rule ? rule(input.value) : '';
          setFieldError(input, msg);
          return msg ? undefined : input.value.trim();
        },
      },
    ],
    onOpen: (d) => $('#dlg-in', d).select(),
  });
}

// ---------- remove with undo ----------
const pendingRemovals = new Map();
/** Remove after a short delay so "Undo" can cancel it. run(keepalive) performs the request. */
function scheduleRemoval(key, run) {
  const timer = setTimeout(() => { pendingRemovals.delete(key); run(false); }, 5200);
  pendingRemovals.set(key, { timer, run });
}
function cancelRemoval(key) {
  const p = pendingRemovals.get(key);
  if (!p) return false;
  clearTimeout(p.timer);
  pendingRemovals.delete(key);
  return true;
}
function flushRemovals() {
  for (const [key, p] of pendingRemovals) {
    clearTimeout(p.timer);
    pendingRemovals.delete(key);
    p.run(true);
  }
}
addEventListener('pagehide', flushRemovals);

// ---------- live title search that adds to a list (list page + "Add a movie" sheet) ----------
function attachAdder({ input, box, getListId, haveIds = () => new Set(), onAdded }) {
  let results = [], hi = 0, seq = 0;
  const show = (html) => {
    box.hidden = !html;
    input.setAttribute('aria-expanded', String(!!html));
    if (html) box.innerHTML = html;
    else input.removeAttribute('aria-activedescendant');
  };
  const draw = () => {
    if (!results.length) return show('');
    const have = haveIds();
    show(results.map((r, i) => `
      <button type="button" role="option" tabindex="-1" id="${box.id}-opt-${i}" data-i="${i}" class="${i === hi ? 'hi' : ''}" aria-selected="${i === hi}">
        <span class="thumb">${poster(r, { mini: true })}</span>
        <span class="spacer"><strong>${esc(r.title)}</strong> <span class="muted">${esc(r.year || '')}</span><span class="ov">${have.has(r.id) ? 'Already on this list' : esc(r.overview || '')}</span></span>
        ${have.has(r.id) ? icon('check') : icon('plus')}
      </button>`).join(''));
    input.setAttribute('aria-activedescendant', `${box.id}-opt-${hi}`);
    $$('button', box).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); add(results[Number(b.dataset.i)]); }));
  };
  const search = debounce(async () => {
    const qv = input.value.trim();
    const mine = ++seq;
    if (qv.length < 2) { results = []; return draw(); }
    show('<div class="hint">Searching…</div>');
    try {
      const { results: r } = await api(`/api/movies/search?q=${encodeURIComponent(qv)}`);
      if (mine !== seq) return;
      results = r; hi = 0;
      if (r.length) draw();
      else show(`<div class="hint">No movies match “${esc(qv)}”. Check the spelling, or try fewer words.</div>`);
    } catch (err) { fail(err); }
  }, 220);
  async function add(pick) {
    const title = input.value.trim();
    if (!pick && !title) return;
    if (pick && haveIds().has(pick.id)) return toast(`${pick.title} is already on this list`);
    input.disabled = true;
    show('<div class="hint">Adding and pulling in cast, crew and trailer…</div>');
    try {
      const { item } = await api(`/api/lists/${getListId()}/items`, { method: 'POST', body: pick ? { tmdbId: pick.id } : { title } });
      input.value = ''; results = []; show('');
      await onAdded(item);
    } catch (err) { fail(err); draw(); }
    input.disabled = false;
    input.focus();
  }
  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(() => show(''), 150));
  input.addEventListener('focus', () => results.length && draw());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { hi = (hi + 1) % results.length; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && results.length) { hi = (hi - 1 + results.length) % results.length; draw(); e.preventDefault(); }
    else if (e.key === 'Escape' && !box.hidden) { e.preventDefault(); show(''); }
    else if (e.key === 'Enter') { e.preventDefault(); add(results[hi] || null); }
  });
}

/** "Add a movie" from anywhere: header button, tab bar, or the / key. */
async function openAddSheet() {
  if (document.querySelector('dialog[open]')) return;
  let lists;
  try { ({ lists } = await api('/api/lists')); } catch (err) { return fail(err); }
  const editable = lists.filter((l) => l.canEdit);
  if (!editable.length) return toast('Create a list first', true);
  const key = `mm_add_list_${app.user.id}`;
  let last = null;
  try { last = Number(localStorage.getItem(key)); } catch { /* storage unavailable */ }
  const def = editable.find((l) => l.id === last) || editable.find((l) => l.kind === 'joint') || editable[0];
  let added = 0;
  await openDialog({
    title: 'Add a movie',
    className: 'sheet',
    body: `
      <div class="field"><label for="addList">Add to</label>
        <select id="addList">${editable.map((l) => `<option value="${l.id}" ${l.id === def.id ? 'selected' : ''}>${esc(l.name)}${l.kind === 'joint' ? ' · Joint' : ''}</option>`).join('')}</select></div>
      <div class="adder">${icon('search')}
        <input id="sheetInput" placeholder="Type a title" autocomplete="off" aria-label="Movie title" role="combobox" aria-expanded="false" aria-controls="sheetSuggest" aria-autocomplete="list" />
        <div class="suggest" id="sheetSuggest" role="listbox" aria-label="Matching movies" hidden></div>
      </div>
      <p class="sheet-status" role="status"></p>`,
    actions: [{ label: 'Done', value: 'done' }],
    onOpen: async (d) => {
      const sel = $('#addList', d);
      let have = new Set();
      const loadHave = async () => {
        try { have = new Set((await api(`/api/lists/${sel.value}`)).items.map((i) => i.movie.id)); } catch { have = new Set(); }
      };
      sel.addEventListener('change', () => {
        try { localStorage.setItem(key, sel.value); } catch { /* storage unavailable */ }
        loadHave();
      });
      attachAdder({
        input: $('#sheetInput', d),
        box: $('#sheetSuggest', d),
        getListId: () => sel.value,
        haveIds: () => have,
        onAdded: (item) => {
          have.add(item.movie.id);
          added++;
          const listName = editable.find((l) => String(l.id) === sel.value)?.name || 'your list';
          $('.sheet-status', d).textContent = `Added ${item.movie.title}${item.movie.year ? ` (${item.movie.year})` : ''} to ${listName}. Add another, or tap Done.`;
        },
      });
      await loadHave();
    },
  });
  if (added) route();
}

// ---------- account: password change and partner reset ----------
function changePasswordDialog() {
  return openDialog({
    title: 'Change password',
    body: `
      <div class="field"><label for="cp-cur">Current password</label><input id="cp-cur" name="currentPassword" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="cp-new">New password</label><input id="cp-new" name="newPassword" type="password" autocomplete="new-password" /></div>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save password', kind: '', submit: true,
        onSubmit: async (d) => {
          const form = $('form', d);
          if (!d.validate()) return undefined;
          try {
            await api('/api/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value } });
            toast('Password changed');
            return true;
          } catch (err) { showServerError(form, err, null); return undefined; }
        },
      },
    ],
    onOpen: (d) => { d.validate = wireValidation($('form', d), { currentPassword: RULES.currentPassword, newPassword: RULES.password }); },
  });
}

async function resetPartnerDialog(partner) {
  const name = firstName(partner);
  const ok = await confirmDialog({
    title: `Reset ${name}’s password?`,
    message: `${name} will be signed out on every device and get a one-time temporary password from you. They’ll choose a new password the next time they sign in.`,
    confirmLabel: 'Reset password',
    danger: true,
  });
  if (!ok) return;
  let temporaryPassword;
  try { ({ temporaryPassword } = await api('/api/partner/reset-password', { method: 'POST' })); } catch (err) { return fail(err); }
  await openDialog({
    title: `${name}’s temporary password`,
    body: `<p>Give this to ${esc(name)}. It works once and is only shown now.</p>
      <p class="temp-pass"><code>${esc(temporaryPassword)}</code><button type="button" class="btn ghost small" data-copy>Copy</button></p>`,
    actions: [{ label: 'Done', kind: '', submit: true, value: true }],
    onOpen: (d) => $('[data-copy]', d).addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(temporaryPassword); e.currentTarget.textContent = 'Copied'; }
      catch { toast('Couldn’t copy. Select the password instead.', true); }
    }),
  });
}

/** Shown after signing in with a temporary password: nothing else works until a new one is chosen. */
function renderSetPassword() {
  stopTimers();
  $('#topbar').hidden = true;
  $('#tabbar').hidden = true;
  view.innerHTML = `
    <div class="auth">
      <div class="brand">Movie<em>Match</em></div>
      <h1 class="title-m">Choose a new password</h1>
      <p class="lede">You signed in with a temporary password. Pick a new one to keep going.</p>
      <form id="pwForm" novalidate>
        <div class="field"><label for="f-new">New password</label><input id="f-new" name="newPassword" type="password" autocomplete="new-password" required /></div>
        <div class="field"><label for="f-confirm">Type it again</label><input id="f-confirm" name="confirmPassword" type="password" autocomplete="new-password" required /></div>
        <p class="error" id="pwErr" role="alert"></p>
        <button class="btn block" id="pwSave">Save new password</button>
        <button type="button" class="btn quiet block" id="pwSignOut">Sign out</button>
      </form>
    </div>`;
  const form = $('#pwForm');
  const validate = wireValidation(form, { newPassword: RULES.password, confirmPassword: RULES.confirmPassword });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    $('#pwSave').disabled = true;
    try {
      const { user } = await api('/api/auth/password', { method: 'POST', body: { newPassword: form.newPassword.value } });
      app.user = user;
      toast('Password saved');
      showChrome();
      route();
    } catch (err) {
      showServerError(form, err, $('#pwErr'));
      $('#pwSave').disabled = false;
    }
  });
  $('#pwSignOut').addEventListener('click', signOut);
  $('#f-new').focus();
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const fmtRuntime = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : '');
const firstName = (u) => (u?.displayName || u?.username || 'Partner').split(' ')[0];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const timeAgo = (iso) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const s = (Date.now() - d) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Poster artwork, or a title card drawn in the page when there is none. */
function poster(m, { score = false, watched = false, extra = '', mini = false } = {}) {
  const hue = (m.id * 47) % 360;
  const inner = m.posterUrl
    ? `<img src="${esc(m.posterUrl)}" alt="" loading="lazy" />`
    : `<div class="ph" style="background:radial-gradient(130% 90% at 20% 0%,hsl(${hue} 32% 30%),hsl(${(hue + 25) % 360} 28% 13%) 70%)"><b>${esc(m.title)}</b><span>${esc(m.year || '')}</span></div>`;
  const r = score && m.rating ? `<span class="score">${STAR}${m.rating.toFixed(1)}</span>` : '';
  return `<div class="poster${watched ? ' watched' : ''}${mini ? ' mini' : ''}" role="img" aria-label="${esc(m.title)} poster">${inner}${r}${extra}</div>`;
}

function stopTimers() {
  app.timers.forEach(clearInterval);
  app.timers = [];
  app.cleanups.forEach((fn) => fn());
  app.cleanups = [];
}

const skeletonRow = (n = 6) =>
  `<div class="strip">${Array.from({ length: n }, () => '<div><div class="skel" style="aspect-ratio:2/3"></div><div class="skel" style="height:14px;margin-top:10px;width:70%"></div></div>').join('')}</div>`;

// ---------- routing ----------
const routes = [
  [/^#?\/?$/, renderDashboard, 'dashboard'],
  [/^#\/lists\/?$/, renderLists, 'lists'],
  [/^#\/lists\/(\d+)$/, renderList, 'lists'],
  [/^#\/match\/?$/, renderMatch, 'match'],
];

async function route() {
  flushRemovals();
  stopTimers();
  closeModal();
  closeMenu();
  if (!app.user) return renderAuth();
  if (app.user.mustChangePassword) return renderSetPassword();
  const hash = location.hash || '#/';
  for (const [re, fn, nav] of routes) {
    const m = hash.match(re);
    if (m) {
      $$('[data-nav]').forEach((a) => {
        a.classList.toggle('active', a.dataset.nav === nav);
        a.toggleAttribute('aria-current', a.dataset.nav === nav);
      });
      view.innerHTML = `<div class="skel" style="height:44px;width:220px;margin-bottom:1.5rem"></div>${skeletonRow()}`;
      try {
        await fn(...m.slice(1));
        view.style.animation = 'none';
        void view.offsetWidth;
        view.style.animation = '';
      } catch (err) {
        if (app.user) view.innerHTML = `<div class="empty">${icon('film')}<strong>Couldn’t load this page</strong>${esc(err.message)}</div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

// ---------- boot ----------
async function boot() {
  $$('[data-icon]').forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
  $('.modal-close').innerHTML = icon('x');
  if (!$('#toast').showPopover) { $('#toast').removeAttribute('popover'); $('#toast').hidden = true; }
  $('#addBtn').addEventListener('click', openAddSheet);
  $('#addTab').addEventListener('click', openAddSheet);
  app.status = await api('/api/status');
  app.user = app.status.user;
  if (app.status.mode === 'demo') {
    const banner = $('#banner');
    banner.hidden = false;
    banner.innerHTML = '<strong>Demo catalog</strong> · about 20 movies. Add a TMDB key to search every film.';
  }
  if (app.user) showChrome();
  route();
}

function showChrome() {
  $('#topbar').hidden = false;
  $('#tabbar').hidden = false;
  $('#whoName').textContent = app.user.displayName;
  $('#meAvatar').innerHTML = avatar(app.user, 'me');
  api('/api/status').then((st) => { app.status = st; }).catch(() => {});
}

$('#meBtn').addEventListener('click', (e) => {
  const partner = app.status?.partner;
  openMenu(e.currentTarget, [
    { heading: true, label: `Signed in as ${app.user.displayName}` },
    { label: 'Change password', icon: 'key', onClick: changePasswordDialog },
    ...(partner ? [{ label: `Reset ${firstName(partner)}’s password`, icon: 'undo', onClick: () => resetPartnerDialog(partner) }] : []),
    { label: 'Sign out', icon: 'logout', onClick: signOut },
  ]);
});
async function signOut() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  app.user = null;
  location.hash = '#/';
  renderAuth();
}

// ---------- auth ----------
async function renderAuth() {
  stopTimers();
  $('#topbar').hidden = true;
  $('#tabbar').hidden = true;
  app.status = await api('/api/status').catch(() => app.status);
  const canRegister = app.status?.registrationOpen;
  let mode = app.status?.userCount === 0 ? 'register' : 'login';
  const draw = () => {
    const first = app.status.userCount === 0;
    view.innerHTML = `
      <div class="auth">
        <div class="brand">Movie<em>Match</em></div>
        <p class="lede">${mode === 'register'
          ? first ? 'Create the first of two seats. Your partner takes the second one from this same address.' : 'One seat left — this will be the second and final account.'
          : 'Your shared watchlist, and a tie-breaker for movie night.'}</p>
        ${canRegister ? `<div class="seg" role="tablist">
          <button type="button" role="tab" data-mode="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button>
          <button type="button" role="tab" data-mode="register" class="${mode === 'register' ? 'on' : ''}">Create account</button>
        </div>` : ''}
        <form id="authForm" novalidate>
          ${mode === 'register' ? '<div class="field"><label for="f-name">Your name</label><input id="f-name" name="displayName" autocomplete="given-name" placeholder="Sam" required /></div>' : ''}
          <div class="field"><label for="f-user">Username</label><input id="f-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required /></div>
          <div class="field"><label for="f-pass">Password</label><input id="f-pass" name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required /></div>
          <p class="error" id="authErr" role="alert"></p>
          <button class="btn block">${mode === 'register' ? 'Create my account' : 'Sign in'}</button>
        </form>
        ${mode === 'login' ? `<button type="button" class="btn quiet block forgot" id="forgotBtn" aria-expanded="false" aria-controls="forgotHelp">Forgot your password?</button>
        <div class="help-panel" id="forgotHelp" hidden>
          <p><strong>Ask your partner to reset it.</strong> On their device: tap their initials at the top right, then <em>Reset your partner’s password</em>. They’ll give you a one-time password, and you’ll pick a new one after signing in.</p>
          <p>If neither of you can sign in, whoever runs the server can run <code>npm run reset-password -- your-username</code>.</p>
        </div>` : ''}
      </div>`;
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    const form = $('#authForm');
    const validate = wireValidation(form, mode === 'register'
      ? { displayName: RULES.displayName, username: RULES.username, password: RULES.password }
      : { username: RULES.loginUsername, password: RULES.loginPassword });
    $('#forgotBtn')?.addEventListener('click', (e) => {
      const panel = $('#forgotHelp');
      panel.hidden = !panel.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#authErr').textContent = '';
      if (!validate()) return;
      const btn = $('button.btn', form);
      btn.disabled = true;
      try {
        const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
        app.user = user;
        if (!user.mustChangePassword) showChrome();
        route();
      } catch (err) {
        showServerError(form, err, $('#authErr'));
        btn.disabled = false;
      }
    });
  };
  draw();
}

// ---------- dashboard ----------
// ---------- home: marquee + shelves ----------
/** Small initials showing whose pick a film is (you, your partner, or both). */
function seatBadges(m, d) {
  if (!m.seats?.length) return '';
  return `<span class="seats" aria-hidden="true">${m.seats.map((s) => avatar(s === 'me' ? d.me : d.partner, s)).join('')}</span>`;
}
const whose = (m, d) => {
  const names = (m.seats || []).map((s) => (s === 'me' ? 'you' : firstName(d.partner)));
  return names.length ? `, picked by ${names.join(' and ')}` : '';
};

function movieCard(m, { sub = '', d = null, seats = false, i = 0 } = {}) {
  const label = `${m.title}${m.year ? ` (${m.year})` : ''}${seats && d ? whose(m, d) : ''}. Details and trailer`;
  return `<div class="mcard" style="--i:${Math.min(i, 8)}">
    <button type="button" class="card-open" data-movie="${m.id}" aria-label="${esc(label)}">${poster(m, { score: true, extra: seats && d ? seatBadges(m, d) : '' })}</button>
    <div class="t">${esc(m.title)}</div>
    ${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}

/** "For Alex · with Sam" — whose home this is. */
function forWhom(d) {
  return `<div class="for-whom">
    <span class="pair">${avatar(d.me, 'me')}${d.partner ? avatar(d.partner, 'partner') : ''}</span>
    <span>For <b>${esc(firstName(d.me))}</b>${d.partner ? ` <span class="muted">· with ${esc(firstName(d.partner))}</span>` : ''}</span>
  </div>`;
}

/** Big backdrop at the top of Home: tonight's pick, or something you'd both enjoy. */
function marquee(d) {
  const pName = d.partner ? firstName(d.partner) : null;
  const r = d.round;
  const m = d.tonight?.movie || d.feature?.movie;
  if (!m) {
    return `<section class="marquee empty-marquee">${forWhom(d)}<div class="copy">
      <span class="eyebrow">${icon('film')}Welcome</span>
      <h1>Start your movie list</h1>
      <p class="facts">Add a few titles you both want to see. The best of them shows up here.</p>
      <div class="actions"><button type="button" class="btn" data-add>${icon('plus')}Add a movie</button></div>
    </div></section>`;
  }
  const hue = (m.id * 47) % 360;
  const art = m.backdropUrl
    ? `<img class="bg" src="${esc(m.backdropUrl)}" alt="" />`
    : m.posterUrl
      ? `<img class="bg blur" src="${esc(m.posterUrl)}" alt="" />`
      : `<div class="bg" style="background:radial-gradient(120% 90% at 70% 10%,hsl(${hue} 32% 30%),hsl(${(hue + 25) % 360} 28% 10%) 70%)"></div>`;
  const facts = [m.rating && `${STAR} ${m.rating.toFixed(1)}`, m.year, fmtRuntime(m.runtime), m.genres[0] && esc(m.genres[0])]
    .filter(Boolean).map((x) => `<span>${x}</span>`).join('');
  const matchBtn = r
    ? `<a class="btn ghost" href="#/match">${icon('heart')}${r.myDone ? 'See matches' : `Keep swiping · ${r.poolSize - r.mySwipes} left`}</a>`
    : `<a class="btn ghost" href="#/match">${icon('heart')}Match instead</a>`;

  let eyebrow, actions;
  if (d.tonight) {
    const by = d.tonight.setBy && d.tonight.setBy.id !== d.me.id ? ` · picked by ${esc(firstName(d.tonight.setBy))}` : '';
    eyebrow = `${icon('play')}Tonight’s pick${by}`;
    actions = `<button class="btn" data-trailer="${m.id}">${icon('play')}Play trailer</button>
      <button class="btn ghost" data-watched="${m.id}">${icon('check')}Mark as watched</button>
      <button class="btn quiet small" data-clear>Clear tonight’s pick</button>`;
  } else {
    eyebrow = `${icon(d.feature.reason === 'both' ? 'users' : 'film')}${esc(d.feature.label)}`;
    actions = `<button class="btn" data-tonight="${m.id}">${icon('play')}Watch tonight</button>${matchBtn}`;
  }
  return `<section class="marquee">${art}
    ${forWhom(d)}
    <div class="copy">
      <span class="eyebrow">${eyebrow}</span>
      <h1><button type="button" class="title-open" data-movie="${m.id}" aria-label="${esc(m.title)}. Details and trailer">${esc(m.title)}</button></h1>
      <div class="facts">${facts}</div>
      ${m.overview ? `<p class="overview">${esc(m.overview)}</p>` : ''}
      <div class="actions">${actions}</div>
    </div>
  </section>`;
}

function shelf(s, d) {
  const isList = s.key.startsWith('list-');
  const more = isList ? `<a class="btn quiet small" href="#/lists/${s.listId}">See all ${icon('right')}</a>` : '';
  // Seat badges where it isn't obvious from the row title whose pick a film is.
  const seats = isList || s.key === 'overlap' || s.key === 'matches';
  const body = s.movies.length
    ? `<div class="strip reveal">${s.movies.map((m, i) => movieCard(m, { d, seats, i, sub: [m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ') })).join('')}</div>`
    : `<a class="empty shelf-empty" href="#/lists/${s.listId}">${icon('plus')}<strong>Nothing here yet</strong>Add the movies you both want to see.</a>`;
  const sub = s.subtitle ? `<span class="muted small ${s.partner ? 'seat-partner' : ''}">${esc(s.subtitle)}</span>` : '';
  return `<section class="section shelf">
    <div class="section-head"><h2>${esc(s.title)}</h2>${sub}<span class="spacer"></span>${more}</div>
    ${body}
  </section>`;
}

async function renderDashboard() {
  const d = await api('/api/dashboard');
  const pName = d.partner ? firstName(d.partner) : null;
  const meName = firstName(d.me);
  const tasteBars = (rows, cls) => {
    if (!rows.length) return '<p class="muted small">No picks yet.</p>';
    const max = Math.max(...rows.map((x) => x.count));
    return rows.map((x) => `<div class="bar ${cls}"><span>${esc(x.genre)}</span><span class="track"><span class="fill" style="width:${(x.count / max) * 100}%;display:block"></span></span><span class="n">${x.count}</span></div>`).join('');
  };

  view.innerHTML = `
    ${marquee(d)}
    ${!d.partner ? `<p class="notice">${icon('user')}Waiting for your partner — they can create the second account from this same address.</p>` : ''}
    ${d.shelves.map((s) => shelf(s, d)).join('')}
    ${d.partner && (d.tastes.me.length || d.tastes.partner.length) ? `<section class="section">
      <div class="section-head"><h2>Taste check</h2><span class="muted small">Top genres in each of your picks</span></div>
      <div class="taste">
        <div><h3 class="seat-me">${esc(meName)}</h3>${tasteBars(d.tastes.me, '')}</div>
        <div><h3 class="seat-partner">${esc(pName)}</h3>${tasteBars(d.tastes.partner, 'p')}</div>
      </div>
    </section>` : ''}`;
  bindMovieClicks(view);

  const setTonight = async (movieId, msg) => {
    try {
      await api('/api/tonight', { method: 'POST', body: { movieId } });
      if (msg) toast(msg);
      renderDashboard();
    } catch (err) { fail(err); }
  };
  $('[data-tonight]')?.addEventListener('click', (e) =>
    setTonight(Number(e.currentTarget.dataset.tonight), `Tonight’s pick: ${d.feature.movie.title}`));
  $('[data-add]')?.addEventListener('click', openAddSheet);
  $('[data-clear]')?.addEventListener('click', () => setTonight(null));
  $('[data-trailer]')?.addEventListener('click', (e) => openMovie(Number(e.currentTarget.dataset.trailer)));
  $('[data-watched]')?.addEventListener('click', async (e) => {
    try {
      await api(`/api/movies/${e.currentTarget.dataset.watched}/watched`, { method: 'POST', body: { watched: true } });
      toast(`Marked ${d.tonight.movie.title} as watched`);
      renderDashboard();
    } catch (err) { fail(err); }
  });
}

function listRow(l) {
  const tag = l.kind === 'joint'
    ? `<span class="tag joint">${icon('users')}Joint</span>`
    : l.mine ? `<span class="tag">${icon('user')}Yours</span>` : `<span class="tag partner">${icon('eye')}View only</span>`;
  const stack = l.preview?.length
    ? l.preview.map((m) => poster(m, { mini: true })).join('')
    : '<span class="empty-stack"></span>';
  return `<a class="list-row" href="#/lists/${l.id}">
    <span class="stack">${stack}</span>
    <span class="spacer"><span class="name">${esc(l.name)}</span>
      <span class="sub">${tag}<span>${plural(l.itemCount, 'movie')}${l.watchedCount ? ` · ${l.watchedCount} watched` : ''}</span></span></span>
    ${icon('right')}
  </a>`;
}

function bindMovieClicks(root) {
  // Each film opens through a real <button data-movie>, so keyboards and screen readers get it for free.
  $$('[data-movie]', root).forEach((el) => el.addEventListener('click', () => openMovie(Number(el.dataset.movie))));
  // Mouse convenience: the title text under a poster opens it too.
  $$('.mcard', root).forEach((card) => {
    const open = $('.card-open', card);
    if (open) card.addEventListener('click', (e) => { if (!e.target.closest('button, a')) open.click(); });
  });
}

// ---------- lists overview ----------
async function renderLists() {
  const { lists } = await api('/api/lists');
  const sec = (title, items, hint) => items.length ? `
    <section class="section">
      <div class="section-head"><h2>${title}</h2><span class="muted small">${hint}</span></div>
      <div class="list-rows">${items.map(listRow).join('')}</div>
    </section>` : '';
  let kind = 'personal';
  view.innerHTML = `
    <h1 class="title-xl">Lists</h1>
    <form id="newList" class="new-list">
      <input name="name" placeholder="New list name" maxlength="60" required aria-label="New list name" />
      <div class="seg" role="radiogroup" aria-label="Who can edit">
        <button type="button" data-kind="personal" class="on">Just me</button>
        <button type="button" data-kind="joint">Both of us</button>
      </div>
      <button class="btn">${icon('plus')}Create list</button>
    </form>
    ${sec('Joint', lists.filter((l) => l.kind === 'joint'), 'Both of you can add and edit')}
    ${sec('Yours', lists.filter((l) => l.mine), 'Only you can edit · your partner can see them')}
    ${sec('Your partner’s', lists.filter((l) => l.kind === 'personal' && !l.mine), 'View only')}`;
  $$('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    $$('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#newList').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { list } = await api('/api/lists', { method: 'POST', body: { name: e.target.name.value, kind } });
      location.hash = `#/lists/${list.id}`;
    } catch (err) { fail(err); }
  });
}

// ---------- single list ----------
async function renderList(id) {
  let filter = 'towatch', sort = 'added';
  let data = await api(`/api/lists/${id}`);
  const { list } = data;

  const tag = list.kind === 'joint'
    ? `<span class="tag joint">${icon('users')}Joint list · you both can edit</span>`
    : list.mine ? `<span class="tag">${icon('user')}Your list</span>` : `<span class="tag partner">${icon('eye')}${esc(list.owner?.displayName || 'Partner')}’s list · view only</span>`;

  view.innerHTML = `
    <div class="crumbs">
      <a href="#/lists" class="back spacer">${icon('left')}Lists</a>
      ${list.canEdit ? `<button class="btn quiet small" id="renameBtn">${icon('pencil')}Rename</button>
        <button class="btn danger small" id="deleteBtn">${icon('trash')}Delete</button>` : ''}
    </div>
    <div class="list-head">
      <div class="spacer">
        <h1 class="title-xl" id="listName">${esc(list.name)}</h1>
        ${tag}
      </div>
    </div>
    ${list.canEdit ? `
    <div class="adder">
      ${icon('search')}
      <input id="addInput" placeholder="Add a movie — type a title" autocomplete="off" aria-label="Add a movie by title" role="combobox" aria-expanded="false" aria-controls="suggest" />
      <div class="suggest" id="suggest" role="listbox" hidden></div>
    </div>` : ''}
    <div class="chipbar" role="toolbar" aria-label="Filter and sort">
      <button type="button" class="chip-toggle on" data-f="towatch" aria-pressed="true">To watch</button>
      <button type="button" class="chip-toggle" data-f="watched" aria-pressed="false">Watched</button>
      <button type="button" class="chip-toggle" data-f="all" aria-pressed="false">All</button>
      <span class="chip-sep" aria-hidden="true"></span>
      <label class="chip-select">${icon('sort')}<select id="sortSel" aria-label="Sort">
        <option value="added">Recently added</option>
        <option value="rating">Highest rated</option>
        <option value="title">A–Z</option>
        <option value="runtime">Shortest first</option>
      </select></label>
    </div>
    <div id="grid"></div>`;

  const counts = () => {
    const w = data.items.filter((i) => i.watched).length;
    const labels = { towatch: `To watch ${data.items.length - w}`, watched: `Watched ${w}`, all: `All ${data.items.length}` };
    $$('[data-f]').forEach((b) => (b.textContent = labels[b.dataset.f]));
  };

  let firstDraw = true;
  const drawGrid = () => {
    counts();
    let items = data.items.filter((i) => (filter === 'all' ? true : filter === 'watched' ? i.watched : !i.watched));
    const cmp = {
      added: () => 0,
      rating: (a, b) => (b.movie.rating || 0) - (a.movie.rating || 0),
      title: (a, b) => a.movie.title.localeCompare(b.movie.title),
      runtime: (a, b) => (a.movie.runtime || 999) - (b.movie.runtime || 999),
    }[sort];
    items = [...items].sort(cmp);
    const badge = (i) => (i.watched ? `<span class="badge">${icon('check')}Watched</span>` : '');
    const more = (i) => list.canEdit
      ? `<button type="button" class="more" data-more="${i.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Options for ${esc(i.movie.title)}">${icon('more')}</button>`
      : '';
    const label = (i) => `${i.movie.title}${i.movie.year ? ` (${i.movie.year})` : ''}${i.watched ? ', watched' : ''}. Details and trailer`;
    $('#grid').innerHTML = items.length
      ? `<div class="movie-grid${firstDraw ? ' reveal' : ''}">${items.map((i, n) => `
          <div class="mcard" style="--i:${Math.min(n, 8)}">
            <button type="button" class="card-open" data-movie="${i.movie.id}" aria-label="${esc(label(i))}">${poster(i.movie, { score: true, watched: i.watched, extra: badge(i) })}</button>
            <div class="t-row"><div class="t">${esc(i.movie.title)} <span>${esc(i.movie.year || '')}</span></div>${more(i)}</div>
            <div class="s">${[i.movie.director, fmtRuntime(i.movie.runtime)].filter(Boolean).map(esc).join(' · ')}</div>
            ${list.kind === 'joint' && i.addedByName ? `<div class="s by ${i.addedBy === app.user.id ? 'me' : ''}">Added by ${i.addedBy === app.user.id ? 'you' : esc(i.addedByName)}</div>` : ''}
          </div>`).join('')}</div>`
      : filter === 'watched'
        ? `<div class="empty">${icon('check')}<strong>Nothing watched yet</strong>After movie night, tap ⋯ under a poster and mark it watched.</div>`
        : data.items.length
          ? `<div class="empty">${icon('check')}<strong>All caught up</strong>Everything on this list has been watched.</div>`
          : `<div class="empty">${icon('film')}<strong>This list is empty</strong>${list.canEdit ? 'Type a title above. Poster, cast, crew and trailer fill in on their own.' : ''}</div>`;
    firstDraw = false;
    bindMovieClicks($('#grid'));
    $$('[data-more]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = data.items.find((i) => i.id === Number(b.dataset.more));
      openMenu(b, [
        { label: item.watched ? 'Mark as not watched' : 'Mark as watched', icon: 'check', onClick: () => toggleWatched(item) },
        ...(item.watched ? [] : [{ label: 'Watch tonight', icon: 'play', onClick: () => watchTonight(item) }]),
        { label: 'Details & trailer', icon: 'info', onClick: () => openMovie(item.movie.id) },
        { label: 'Remove from list', icon: 'trash', danger: true, onClick: () => removeItem(item) },
      ]);
    }));
  };

  async function toggleWatched(item) {
    try {
      await api(`/api/lists/${list.id}/items/${item.id}`, { method: 'PATCH', body: { watched: !item.watched } });
      item.watched = !item.watched;
      toast(item.watched ? `Marked ${item.movie.title} as watched` : `${item.movie.title} is back on the to-watch list`);
      drawGrid();
    } catch (err) { fail(err); }
  }
  async function watchTonight(item) {
    try {
      await api('/api/tonight', { method: 'POST', body: { movieId: item.movie.id } });
      toast(`Tonight’s pick: ${item.movie.title}`);
    } catch (err) { fail(err); }
  }
  // Remove straight away with an Undo, instead of asking first.
  function removeItem(item) {
    const index = data.items.indexOf(item);
    const key = `item-${item.id}`;
    data.items = data.items.filter((i) => i !== item);
    drawGrid();
    scheduleRemoval(key, (keepalive) => {
      fetch(`/api/lists/${list.id}/items/${item.id}`, { method: 'DELETE', credentials: 'same-origin', keepalive })
        .then((r) => { if (!r.ok) throw new Error(); })
        .catch(() => toast(`Couldn’t remove ${item.movie.title}. Try again.`, true));
    });
    toast(`Removed ${item.movie.title}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          if (!cancelRemoval(key)) return;
          data.items.splice(Math.min(index, data.items.length), 0, item);
          if ($('#grid')) drawGrid();
        },
      },
    });
  }

  $$('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('[data-f]').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    drawGrid();
  }));
  $('#sortSel').addEventListener('change', (e) => { sort = e.target.value; drawGrid(); });
  drawGrid();

  if (!list.canEdit) return;

  $('#renameBtn').addEventListener('click', async () => {
    const name = await promptDialog({ title: 'Rename list', label: 'List name', value: list.name, confirmLabel: 'Rename', rule: RULES.listName });
    if (!name || name === list.name) return;
    try {
      await api(`/api/lists/${list.id}`, { method: 'PATCH', body: { name } });
      list.name = name.trim();
      $('#listName').textContent = list.name;
    } catch (err) { fail(err); }
  });
  $('#deleteBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Delete “${list.name}”?`,
      message: `This removes the list and its ${plural(data.items.length, 'movie')} for both of you. It can’t be undone.`,
      confirmLabel: 'Delete list',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/lists/${list.id}`, { method: 'DELETE' });
      location.hash = '#/lists';
    } catch (err) { fail(err); }
  });

  // --- add-by-name with live suggestions ---
  const input = $('#addInput');
  attachAdder({
    input,
    box: $('#suggest'),
    getListId: () => list.id,
    haveIds: () => new Set(data.items.map((i) => i.movie.id)),
    onAdded: async (item) => {
      toast(`Added ${item.movie.title}${item.movie.year ? ` (${item.movie.year})` : ''}`);
      data = await api(`/api/lists/${list.id}`);
      if (filter === 'watched') {
        filter = 'towatch';
        $$('[data-f]').forEach((x) => { x.classList.toggle('on', x.dataset.f === 'towatch'); x.setAttribute('aria-pressed', String(x.dataset.f === 'towatch')); });
      }
      drawGrid();
    },
  });
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

// ---------- movie detail ----------
let modalOpener = null;
function closeModal() {
  const m = $('#modal');
  if (m.open) m.close();
}
$('#modal').addEventListener('close', () => {
  $('#modalBody').innerHTML = ''; // stops the trailer
  document.body.style.overflow = '';
  if (modalOpener?.isConnected) modalOpener.focus();
  modalOpener = null;
});
$('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
// Escape closes an open menu first (and keeps its dialog open); "/" opens "Add a movie".
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && closeMenu()) { e.preventDefault(); e.stopPropagation(); return; }
  if (e.key === '/' && app.user && !app.user.mustChangePassword && !document.querySelector('dialog[open]') && !e.target.matches('input, select, textarea')) {
    e.preventDefault();
    openAddSheet();
  }
}, true);

async function openMovie(id) {
  const modal = $('#modal');
  const body = $('#modalBody');
  if (!modal.open) {
    modalOpener = document.activeElement;
    body.innerHTML = '<div style="padding:2rem;display:flex;gap:1.5rem"><div class="skel" style="width:160px;aspect-ratio:2/3"></div><div style="flex:1"><div class="skel" style="height:40px;width:60%"></div><div class="skel" style="height:16px;width:40%;margin-top:1rem"></div><div class="skel" style="height:70px;margin-top:1rem"></div></div></div>';
    modal.showModal();
    document.body.style.overflow = 'hidden';
    $('.modal-close').focus();
  }
  let data, lists;
  try {
    [data, { lists }] = await Promise.all([api(`/api/movies/${id}`), api('/api/lists')]);
  } catch (err) {
    body.innerHTML = `<div class="empty">${icon('film')}<strong>Couldn’t load this movie</strong>${esc(err.message)}</div>`;
    return;
  }
  const m = data.movie;
  const onLists = new Set(data.lists.map((l) => l.id));
  const editable = lists.filter((l) => l.canEdit);
  const watched = data.lists.some((l) => l.watched);
  const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.title} ${m.year || ''} official trailer`)}`;

  body.innerHTML = `
    <div class="detail-hero" style="${m.backdropUrl ? `background-image:url('${esc(m.backdropUrl)}')` : ''}">
      ${poster(m, { watched })}
      <div class="spacer">
        <h1>${esc(m.title)} <span>${esc(m.year || '')}</span></h1>
        ${m.tagline ? `<p class="tagline">${esc(m.tagline)}</p>` : ''}
        <div class="facts">
          ${m.rating ? `<span>${STAR} ${m.rating.toFixed(1)}</span>` : ''}
          ${m.certification ? `<span>${esc(m.certification)}</span>` : ''}
          ${m.runtime ? `<span>${fmtRuntime(m.runtime)}</span>` : ''}
          ${m.genres.length ? `<span>${m.genres.map(esc).join(', ')}</span>` : ''}
          ${watched ? `<span style="color:var(--text)">${icon('check')} Watched</span>` : ''}
        </div>
        <p class="overview">${esc(m.overview || '')}</p>
        <div class="detail-actions">
          ${watched ? '' : data.tonight
            ? `<button class="btn" id="tonightBtn" aria-pressed="true">${icon('check')}Tonight’s pick</button>`
            : `<button class="btn" id="tonightBtn" aria-pressed="false">${icon('play')}Watch tonight</button>`}
          ${editable.length ? `<button class="btn ghost" id="addToBtn" aria-haspopup="menu" aria-expanded="false">${icon('plus')}Add to list</button>` : ''}
          ${data.lists.length ? `<button class="btn ghost" id="watchAll">${watched ? 'Mark as not watched' : `${icon('check')}Mark as watched`}</button>` : ''}
          ${data.lists.length ? `<p class="onlists">On ${data.lists.map((l) => `<a href="#/lists/${l.id}">${esc(l.name)}</a>`).join(', ')}</p>` : ''}
        </div>
      </div>
    </div>
    <div class="detail-body">
      <h2>Trailer</h2>
      ${m.trailerKey
        ? `<div class="trailer"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.trailerKey)}?rel=0" title="${esc(m.title)} trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : `<div class="no-trailer"><span>No trailer on file for this movie.</span><a class="btn ghost small" href="${ytSearch}" target="_blank" rel="noopener">Find it on YouTube ${icon('external')}</a></div>`}
      <h2>Cast &amp; crew</h2>
      <dl class="credits">
        ${m.director ? `<dt>Director</dt><dd>${esc(m.director)}</dd>` : ''}
        ${m.writers.length ? `<dt>Writing</dt><dd>${m.writers.map(esc).join(', ')}</dd>` : ''}
      </dl>
      ${m.cast.length ? `<div class="cast">${m.cast.map((p) => `
        <div class="p">
          <div class="face">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" />` : esc(p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</div>
          <div>${esc(p.name)}</div>
          <div class="c">${esc(p.character || '')}</div>
        </div>`).join('')}</div>` : '<p class="muted">No cast listed.</p>'}
    </div>`;

  // Anything changed here should show on Home straight away.
  const refresh = () => { openMovie(m.id); if (onHome()) renderDashboard().catch(() => {}); };

  $('#addToBtn')?.addEventListener('click', (e) => {
    const kind = (l) => (l.kind === 'joint' ? 'Joint' : 'Yours');
    openMenu(e.currentTarget, [
      { heading: true, label: 'Add to a list' },
      ...editable.map((l) => ({
        label: `${l.name} · ${kind(l)}`,
        icon: l.kind === 'joint' ? 'users' : 'user',
        checked: onLists.has(l.id),
        disabled: onLists.has(l.id),
        onClick: async () => {
          try {
            await api(`/api/lists/${l.id}/items`, { method: 'POST', body: { tmdbId: m.id } });
            toast(`Added to ${l.name}`);
            refresh();
          } catch (err) { fail(err); }
        },
      })),
      { label: 'New list…', icon: 'plus', onClick: () => { closeModal(); location.hash = '#/lists'; } },
    ]);
  });
  $('#tonightBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/tonight', { method: 'POST', body: { movieId: data.tonight ? null : m.id } });
      toast(data.tonight ? 'Tonight’s pick cleared' : `Tonight’s pick: ${m.title}`);
      refresh();
    } catch (err) { fail(err); }
  });
  $('#watchAll')?.addEventListener('click', async () => {
    try {
      await api(`/api/movies/${m.id}/watched`, { method: 'POST', body: { watched: !watched } });
      toast(watched ? 'Back on your to-watch lists' : 'Marked as watched on every list');
      refresh();
    } catch (err) { fail(err); }
  });
}

// ---------- matching ----------
async function renderMatch() {
  const { state } = await api('/api/match');
  if (!state) return renderMatchSetup();
  return renderRound(state);
}

async function renderMatchSetup(prev) {
  stopTimers();
  const [{ genres }, { lists }] = await Promise.all([api('/api/genres'), api('/api/lists')]);
  const chosen = new Set(prev?.genres || []);
  const listSel = new Set(prev?.listIds?.length ? prev.listIds : lists.map((l) => l.id));
  view.innerHTML = `
    <div class="setup">
      <h1 class="title-xl">Match</h1>
      <p class="lede">You both swipe through the same movies from your lists. Swipe right on anything you’d watch tonight — when you both do, it’s a match.</p>
      <form id="setup">
        <div class="field"><label>In the mood for</label>
          <div class="chips">${genres.length ? genres.map((g) => `<button type="button" class="chip-toggle ${chosen.has(g) ? 'on' : ''}" data-g="${esc(g)}" aria-pressed="${chosen.has(g)}">${esc(g)}</button>`).join('') : '<span class="muted small">Add movies to your lists first.</span>'}</div>
          <p class="muted small" style="margin-top:0.5rem">Leave empty for anything.</p>
        </div>
        <div class="field"><label for="maxRuntime">Length</label>
          <select id="maxRuntime">
            <option value="">Any length</option>
            <option value="100">Under 1h 40m</option>
            <option value="120">Under 2h</option>
            <option value="150">Under 2h 30m</option>
          </select>
        </div>
        <div class="field"><label>From these lists</label>
          <div class="chips">${lists.map((l) => `<button type="button" class="chip-toggle ${listSel.has(l.id) ? 'on' : ''}" data-l="${l.id}" aria-pressed="${listSel.has(l.id)}">${esc(l.name)}</button>`).join('')}</div>
        </div>
        <button class="btn">${icon('heart')}Start round</button>
        <p class="muted small" style="margin-top:0.75rem">Starts a fresh round for both of you.</p>
      </form>
    </div>`;
  const toggle = (c, set, val) => {
    const on = !set.has(val);
    on ? set.add(val) : set.delete(val);
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  };
  $$('[data-g]').forEach((c) => c.addEventListener('click', () => toggle(c, chosen, c.dataset.g)));
  $$('[data-l]').forEach((c) => c.addEventListener('click', () => toggle(c, listSel, Number(c.dataset.l))));
  if (prev?.maxRuntime) $('#maxRuntime').value = String(prev.maxRuntime);
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!listSel.size) return toast('Pick at least one list', true);
    try {
      const { state } = await api('/api/match/rounds', {
        method: 'POST',
        body: {
          genres: [...chosen],
          maxRuntime: Number($('#maxRuntime').value) || null,
          listIds: listSel.size === lists.length ? [] : [...listSel],
        },
      });
      renderRound(state);
    } catch (err) { fail(err); }
  });
}

async function renderRound(initial) {
  let state = initial;
  let cards = [];
  const history = [];
  const knownMatches = new Set(state.matches.map((m) => m.id));
  const pName = state.partner ? firstName(state.partner) : 'your partner';

  view.innerHTML = `
    <div class="match-head">
      <h1 class="title-l spacer">Match</h1>
      <button class="btn quiet small" id="newRound">${icon('sliders')}New round</button>
      <button class="btn quiet small" id="endRound">End</button>
    </div>
    <div class="match-layout">
      <div class="match-main">
        <div class="bars" id="progress"></div>
        <div class="deck" id="deck"></div>
        <div class="swipe-controls" id="controls">
          <button class="round-btn mini" id="undoBtn" aria-label="Undo last swipe">${icon('undo')}</button>
          <span class="ctl"><button class="round-btn no" id="noBtn" aria-label="Not tonight">${icon('x')}</button><small aria-hidden="true">Not tonight</small></span>
          <span class="ctl"><button class="round-btn yes" id="yesBtn" aria-label="Yes, I’d watch this">${icon('heart')}</button><small aria-hidden="true">I’d watch it</small></span>
          <button class="round-btn mini" id="infoBtn" aria-label="Details and trailer">${icon('info')}</button>
        </div>
        <p class="keys">← no · → yes · ↑ details · Backspace undo</p>
      </div>
      <aside class="side" id="side"></aside>
    </div>`;

  const drawProgress = () => {
    const pct = (n) => (state.poolSize ? (n / state.poolSize) * 100 : 0);
    $('#progress').innerHTML = `
      <div class="meter"><span>You · ${state.mySwipes}/${state.poolSize}</span><div class="track"><div class="fill" style="width:${pct(state.mySwipes)}%"></div></div></div>
      <div class="meter partner"><span>${esc(pName)} · ${state.partnerSwipes}/${state.poolSize}</span><div class="track"><div class="fill" style="width:${pct(state.partnerSwipes)}%"></div></div></div>`;
    $('#undoBtn').disabled = !history.length;
  };

  const drawSide = () => {
    const row = (m, extra = '') => `
      <div class="mrow ${state.chosen?.id === m.id ? 'chosen' : ''}">
        <button type="button" class="row-open" data-movie="${m.id}" aria-label="${esc(m.title)}. Details and trailer">
          ${poster(m, { mini: true })}
          <span class="spacer"><span class="t">${esc(m.title)}</span><span class="s">${[m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ')}${extra}</span></span>
        </button>
        <button class="btn ${state.chosen?.id === m.id ? '' : 'ghost'} small" data-choose="${m.id}" aria-pressed="${state.chosen?.id === m.id}">${state.chosen?.id === m.id ? `${icon('check')}Tonight’s pick` : 'Watch tonight'}</button>
      </div>`;
    const bothDone = state.myDone && state.partnerDone;
    const f = state.round.filters;
    const filt = [f.genres.length && f.genres.join(', '), f.maxRuntime && `under ${fmtRuntime(f.maxRuntime)}`].filter(Boolean).join(' · ');
    let html = `<h2>Matches <span class="count">${state.matches.length}</span></h2>`;
    if (filt) html += `<p class="hint">${esc(filt)}</p>`;
    html += `<div class="group">${state.matches.length
      ? state.matches.map((m) => row(m)).join('') + (state.matches.length > 1 && !state.chosen ? `<button class="btn ghost block" id="spin" style="margin-top:0.75rem">${icon('dice')}Choose one at random</button>` : '')
      : `<p class="hint">${bothDone ? 'No movie got two yeses this round.' : `When you and ${esc(pName)} both swipe right on a movie, it lands here.`}</p>`}</div>`;
    if (state.nearMisses.length && (bothDone || !state.matches.length)) {
      html += `<div class="group"><h2>Near misses</h2>
        <p class="hint">Only one of you said yes${bothDone && !state.matches.length ? ' — a good place to compromise' : ''}.</p>
        <div style="margin-top:0.75rem">${state.nearMisses.slice(0, 6).map((m) => row(m, ` · <span class="${m.likedBy === 'me' ? '' : 'seat-partner'}">${m.likedBy === 'me' ? 'you' : esc(pName)} liked it</span>`)).join('')}</div></div>`;
    }
    $('#side').innerHTML = html;
    bindMovieClicks($('#side'));
    $$('[data-choose]', $('#side')).forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.choose))));
    $('#spin')?.addEventListener('click', () => choose(state.matches[Math.floor(Math.random() * state.matches.length)].id));
  };

  async function choose(movieId) {
    try {
      ({ state } = await api('/api/match/choose', { method: 'POST', body: { movieId: state.chosen?.id === movieId ? null : movieId } }));
      drawSide();
      if (state.chosen) toast(`Tonight’s pick: ${state.chosen.title}`);
    } catch (err) { fail(err); }
  }

  const sourceTag = (c) => ({
    partner: `<span class="tag partner">${icon('user')}${esc(pName)}’s pick</span>`,
    me: `<span class="tag">${icon('user')}Your pick</span>`,
    both: `<span class="tag joint">${icon('users')}You both picked this</span>`,
    joint: `<span class="tag joint">${icon('users')}Joint list</span>`,
  })[c.source] || '';

  const drawDeck = (promote = false) => {
    const deck = $('#deck');
    const live = !!cards.length;
    ['noBtn', 'yesBtn', 'infoBtn'].forEach((id) => ($(`#${id}`).disabled = !live));
    if (!live) {
      deck.innerHTML = `<div class="deck-done">
        ${state.poolSize === 0
          ? `${icon('film')}<h2>Nothing to swipe</h2><p>No unwatched movies fit this round. Add some to your lists or loosen the filters.</p><button class="btn ghost" id="loosen">Change filters</button>`
          : state.partnerDone
            ? `${icon('check')}<h2>Round complete</h2><p>${state.matches.length ? `You have ${plural(state.matches.length, 'match')}. Choose tonight’s pick from them.` : 'No movie got two yeses. The near misses are your best compromise.'}</p>`
            : `${icon('check')}<h2>You’re all done</h2><p>Waiting on ${esc(pName)} — ${state.partnerSwipes} of ${state.poolSize} swiped. New matches pop up here.</p>`}
      </div>`;
      $('#loosen')?.addEventListener('click', () => renderMatchSetup(state.round.filters));
      return;
    }
    const [top, next] = cards;
    const cardHtml = (c, cls) => `
      <div class="swipe-card ${cls}" data-id="${c.id}" ${cls === 'behind' ? 'aria-hidden="true"' : ''}>
        ${poster(c)}
        <span class="stamp yes">YES</span><span class="stamp no">NOPE</span>
        <div class="info">
          ${sourceTag(c)}
          <h2>${esc(c.title)} <span>${esc(c.year || '')}</span></h2>
          <div class="facts">${[c.rating && `${STAR} ${c.rating.toFixed(1)}`, fmtRuntime(c.runtime), c.genres.slice(0, 2).map(esc).join(', '), c.director && `Dir. ${esc(c.director)}`].filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</div>
          <p>${esc(c.overview || '')}</p>
        </div>
      </div>`;
    deck.innerHTML = (next ? cardHtml(next, 'behind') : '') + cardHtml(top, promote ? 'promote' : '');
    attachDrag($('.swipe-card:not(.behind)', deck), (liked) => swipe(liked));
    if (!hintSeen()) showHint(deck);
  };

  // One-time "how to swipe" hint, remembered per person on this device.
  const hintKey = `mm_swipe_hint_${app.user.id}`;
  const hintSeen = () => { try { return localStorage.getItem(hintKey) === '1'; } catch { return false; } };
  const dismissHint = () => {
    try { localStorage.setItem(hintKey, '1'); } catch { /* storage unavailable: show again next time */ }
    $('.swipe-hint')?.remove();
  };
  function showHint(deck) {
    const h = document.createElement('div');
    h.className = 'swipe-hint';
    h.setAttribute('role', 'status');
    h.innerHTML = `<p><b>Swipe right</b> if you’d watch it tonight, <b>left</b> to pass. When ${esc(pName)} likes it too, it’s a match.</p>
      <button type="button" class="btn small">Got it</button>`;
    deck.appendChild(h);
    $('button', h).addEventListener('click', dismissHint);
    $('.swipe-card:not(.behind)', deck)?.classList.add('nudge');
  }

  async function loadDeck() {
    const r = await api('/api/match/deck?limit=20');
    cards = r.cards;
    state = r.state;
  }

  let busy = false;
  async function swipe(liked, animate = false) {
    if (busy || !cards.length) return;
    if (!hintSeen()) dismissHint();
    busy = true;
    const card = cards[0];
    const el = $('.swipe-card:not(.behind)');
    if (animate && el) {
      $(`.stamp.${liked ? 'yes' : 'no'}`, el).style.opacity = 1;
      el.style.transition = 'transform .28s cubic-bezier(.4,0,.6,1), opacity .28s';
      el.style.transform = `translateX(${liked ? 520 : -520}px) rotate(${liked ? 18 : -18}deg)`;
      el.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 220));
    }
    try {
      const r = await api('/api/match/swipe', { method: 'POST', body: { movieId: card.id, liked } });
      state = r.state;
      history.push(card);
      cards.shift();
      if (cards.length < 3 && !state.myDone) await loadDeck();
      if (r.matched) { knownMatches.add(r.movie.id); celebrate(r.movie); }
      state.matches.forEach((m) => knownMatches.add(m.id));
    } catch (err) {
      fail(err);
      await loadDeck().catch(() => {});
    }
    busy = false;
    drawProgress(); drawSide(); drawDeck(true);
  }

  async function undo() {
    const last = history.pop();
    if (!last || busy) return;
    try {
      ({ state } = await api('/api/match/undo', { method: 'POST', body: { movieId: last.id } }));
      cards = [last, ...cards.filter((c) => c.id !== last.id)];
      drawProgress(); drawSide(); drawDeck(true);
    } catch (err) { fail(err); }
  }

  function celebrate(m) {
    if ($('.its-a-match')) $('.its-a-match').close();
    const el = document.createElement('dialog');
    el.className = 'its-a-match';
    el.setAttribute('aria-label', 'It’s a match');
    el.innerHTML = `${poster(m)}<span class="label eyebrow">You both said yes</span><h1>It’s a match</h1>
      <p>You and ${esc(pName)} both want to watch <b>${esc(m.title)}</b>.</p>
      <div class="row" style="justify-content:center"><button class="btn" data-pick>${icon('play')}Watch tonight</button><button class="btn ghost" data-keep>Keep swiping</button></div>`;
    document.body.appendChild(el);
    el.addEventListener('close', () => el.remove());
    el.showModal();
    const close = () => { if (el.open) el.close(); };
    app.cleanups.push(close);
    el.addEventListener('click', (e) => e.target === el && close());
    $('[data-keep]', el).addEventListener('click', close);
    $('[data-pick]', el).addEventListener('click', () => { close(); choose(m.id); });
    $('[data-pick]', el).focus();
  }

  $('#yesBtn').addEventListener('click', () => swipe(true, true));
  $('#noBtn').addEventListener('click', () => swipe(false, true));
  $('#undoBtn').addEventListener('click', undo);
  $('#infoBtn').addEventListener('click', () => cards[0] && openMovie(cards[0].id));
  $('#endRound').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'End this round?', message: `Swipes and matches from this round end for you and ${pName}. Tonight’s pick stays.`, confirmLabel: 'End round' });
    if (!ok) return;
    stopTimers();
    await api('/api/match/end', { method: 'POST' }).catch(fail);
    renderMatchSetup();
  });
  $('#newRound').addEventListener('click', () => renderMatchSetup(state.round.filters));

  const onKey = (e) => {
    if (document.querySelector('dialog[open]') || e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') swipe(true, true);
    else if (e.key === 'ArrowLeft') swipe(false, true);
    else if (e.key === 'ArrowUp') { e.preventDefault(); cards[0] && openMovie(cards[0].id); }
    else if (e.key === 'Backspace') undo();
  };
  document.addEventListener('keydown', onKey);
  app.cleanups.push(() => document.removeEventListener('keydown', onKey));

  // Poll so a match made by the partner's swipe shows up live.
  app.timers.push(setInterval(async () => {
    if (busy || document.hidden) return;
    try {
      const { state: s } = await api('/api/match');
      if (!s || s.round.id !== state.round.id) {
        toast(s ? `${pName} started a new round` : `${pName} ended the round`);
        return route();
      }
      const fresh = s.matches.filter((m) => !knownMatches.has(m.id));
      state = s;
      fresh.forEach((m) => knownMatches.add(m.id));
      if (fresh.length) celebrate(fresh[0]);
      drawProgress(); drawSide();
      if (!cards.length) drawDeck();
    } catch { /* offline — try again next tick */ }
  }, 4000));

  await loadDeck();
  drawProgress(); drawSide(); drawDeck();
}

/**
 * Drag-to-swipe for the top card (after Emil Kowalski's gestures guidance):
 * the card tracks the finger 1:1, a fast flick counts as a swipe, the card leaves
 * at the speed it was thrown, and only the first finger counts.
 */
function attachDrag(el, onSwipe) {
  if (!el) return;
  let startX = 0, startY = 0, dx = 0, dy = 0, travel = 0, pointer = null;
  let samples = []; // recent [time, x] pairs for release velocity
  const yes = $('.stamp.yes', el), no = $('.stamp.no', el);
  const FLICK = 0.35; // px per ms
  const DISTANCE = 100; // px

  el.addEventListener('pointerdown', (e) => {
    if (pointer !== null) return; // a second finger never hijacks the drag
    pointer = e.pointerId;
    // A running entrance or hint animation would override the drag, so stop it the moment the card is grabbed.
    el.getAnimations().forEach((a) => a.cancel());
    el.classList.remove('nudge', 'promote');
    startX = e.clientX; startY = e.clientY; dx = dy = travel = 0;
    samples = [[e.timeStamp, e.clientX]];
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    travel = Math.max(travel, Math.hypot(dx, dy));
    samples.push([e.timeStamp, e.clientX]);
    while (samples.length > 2 && e.timeStamp - samples[0][0] > 100) samples.shift();
    el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 20}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
    no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    el.style.cursor = '';
    const [t0, x0] = samples[0];
    const dt = Math.max(1, e.timeStamp - t0);
    const v = (e.clientX - x0) / dt; // px per ms over the last ~100ms
    const flicked = e.type !== 'pointercancel' && Math.abs(v) > FLICK && Math.abs(dx) > 20 && Math.sign(v) === Math.sign(dx);
    if (e.type !== 'pointercancel' && (Math.abs(dx) > DISTANCE || flicked)) {
      const liked = dx > 0;
      // Leave at the speed it was thrown: faster flick, shorter exit.
      const ms = Math.round(Math.max(140, Math.min(300, 520 / Math.max(Math.abs(v), 1.2))));
      el.style.transition = `transform ${ms}ms cubic-bezier(0.23, 1, 0.32, 1), opacity ${ms}ms ease-out`;
      el.style.transform = `translate(${liked ? 640 : -640}px, ${dy * 0.6}px) rotate(${liked ? 24 : -24}deg)`;
      el.style.opacity = '0';
      setTimeout(() => onSwipe(liked), Math.round(ms * 0.65));
    } else {
      // Snap back quickly; a small settle only because the finger applied force.
      el.style.transition = 'transform 0.3s cubic-bezier(0.2, 1.3, 0.4, 1)';
      el.style.transform = '';
      yes.style.opacity = no.style.opacity = 0;
      // A tap opens details; a drag that came back to where it started does not.
      if (e.type !== 'pointercancel' && travel < 6) openMovie(Number(el.dataset.id));
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

boot().catch((err) => {
  view.innerHTML = `<div class="empty">${icon('film')}<strong>Couldn’t reach MovieMatch</strong>${esc(err.message)}</div>`;
});
