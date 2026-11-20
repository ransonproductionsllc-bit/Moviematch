// MovieMatch frontend — a dependency-free single-page app.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');

const app = { status: null, user: null, timers: [], cleanups: [] };

// ---------- utilities ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
const fail = (err) => toast(err.message || String(err), true);

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const fmtRuntime = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : '');
const firstName = (u) => (u?.displayName || u?.username || 'Partner').split(' ')[0];
const timeAgo = (iso) => {
  const s = (Date.now() - Date.parse(iso.replace(' ', 'T') + 'Z')) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/** Poster image, or a generated gradient card when there is no artwork. */
function poster(m, { rating = false, flag = '' } = {}) {
  const hue = (m.id * 47) % 360;
  const inner = m.posterUrl
    ? `<img src="${esc(m.posterUrl)}" alt="${esc(m.title)} poster" loading="lazy" />`
    : `<div class="ph" style="background:linear-gradient(160deg,hsl(${hue} 55% 38%),hsl(${(hue + 60) % 360} 50% 16%))">${esc(m.title)}<small>${esc(m.year || '')}</small></div>`;
  const r = rating && m.rating ? `<span class="rating">★ ${m.rating.toFixed(1)}</span>` : '';
  return `<div class="poster">${inner}${r}${flag ? `<span class="flag">${flag}</span>` : ''}</div>`;
}

function stopTimers() {
  app.timers.forEach(clearInterval);
  app.timers = [];
  app.cleanups.forEach((fn) => fn());
  app.cleanups = [];
}

// ---------- routing ----------
const routes = [
  [/^#?\/?$/, renderDashboard, 'dashboard'],
  [/^#\/lists\/?$/, renderLists, 'lists'],
  [/^#\/lists\/(\d+)$/, renderList, 'lists'],
  [/^#\/match\/?$/, renderMatch, 'match'],
];

async function route() {
  stopTimers();
  closeModal();
  if (!app.user) return renderAuth();
  const hash = location.hash || '#/';
  for (const [re, fn, nav] of routes) {
    const m = hash.match(re);
    if (m) {
      $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
      view.innerHTML = '<p class="muted">Loading…</p>';
      try {
        await fn(...m.slice(1));
      } catch (err) {
        if (app.user) view.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
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
  app.status = await api('/api/status');
  app.user = app.status.user;
  const banner = $('#banner');
  if (app.status.mode === 'demo') {
    banner.hidden = false;
    banner.textContent = 'Demo mode: using a small built-in movie catalog. Add a TMDB API key to search every movie.';
  }
  if (app.user) showChrome();
  route();
}

function showChrome() {
  $('#topbar').hidden = false;
  $('#whoName').textContent = app.user.displayName;
}

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  app.user = null;
  location.hash = '#/';
  renderAuth();
});

// ---------- auth ----------
async function renderAuth() {
  stopTimers();
  $('#topbar').hidden = true;
  app.status = await api('/api/status').catch(() => app.status);
  const canRegister = app.status?.registrationOpen;
  let mode = app.status?.userCount === 0 ? 'register' : 'login';
  const draw = () => {
    view.innerHTML = `
      <div class="auth">
        <div class="hero">
          <div class="logo">🍿</div>
          <h1>MovieMatch</h1>
          <p class="muted">Your shared watchlist — and a tie-breaker for movie night.</p>
        </div>
        <div class="card">
          ${canRegister ? `<div class="tabs">
            <button data-mode="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button>
            <button data-mode="register" class="${mode === 'register' ? 'on' : ''}">Create account</button>
          </div>` : ''}
          <form id="authForm">
            ${mode === 'register' ? `<p class="small muted">${app.status.userCount === 0 ? 'You’re the first of two people. Create your account, then have your partner create theirs.' : 'One spot left — this will be the second and final account.'}</p>
            <div class="field"><label>Your name</label><input name="displayName" autocomplete="name" placeholder="e.g. Sam" required /></div>` : ''}
            <div class="field"><label>Username</label><input name="username" autocomplete="username" required /></div>
            <div class="field"><label>Password</label><input name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required minlength="6" /></div>
            <p class="error" id="authErr"></p>
            <button class="btn" style="width:100%">${mode === 'register' ? 'Create account' : 'Sign in'}</button>
          </form>
        </div>
      </div>`;
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body });
        app.user = user;
        showChrome();
        location.hash = '#/';
        route();
      } catch (err) {
        $('#authErr').textContent = err.message;
      }
    });
  };
  draw();
}

// ---------- dashboard ----------
async function renderDashboard() {
  const d = await api('/api/dashboard');
  const pName = d.partner ? firstName(d.partner) : null;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const r = d.round;

  const matchCard = r
    ? `<div class="card match-cta">
        <div class="emoji">💘</div>
        <div class="spacer">
          <h2>Match round in progress</h2>
          <p class="muted" style="margin:0">You’ve swiped ${r.mySwipes}/${r.poolSize}${d.partner ? ` · ${esc(pName)} ${r.partnerSwipes}/${r.poolSize}` : ''} · <strong>${r.matches.length} match${r.matches.length === 1 ? '' : 'es'}</strong>${r.chosen ? ` · Tonight: <strong>${esc(r.chosen.title)}</strong>` : ''}</p>
        </div>
        <a class="btn" href="#/match">${r.myDone ? 'See matches' : 'Keep swiping'}</a>
      </div>`
    : `<div class="card match-cta">
        <div class="emoji">🎬</div>
        <div class="spacer">
          <h2>Can’t decide what to watch?</h2>
          <p class="muted" style="margin:0">Start a match round — you both swipe through movies from your lists, and anything you both like is a match.</p>
        </div>
        <a class="btn" href="#/match">Start matching</a>
      </div>`;

  const groups = {
    joint: d.lists.filter((l) => l.kind === 'joint'),
    mine: d.lists.filter((l) => l.mine),
    partner: d.lists.filter((l) => l.kind === 'personal' && !l.mine),
  };

  const tasteBars = (rows, cls) => {
    if (!rows.length) return '<p class="muted small">Add some movies to see this.</p>';
    const max = Math.max(...rows.map((x) => x.count));
    return rows
      .map((x) => `<div class="bar ${cls}"><span class="g">${esc(x.genre)}</span><span class="track"><span class="fill" style="width:${(x.count / max) * 100}%;display:block"></span></span><span>${x.count}</span></div>`)
      .join('');
  };

  view.innerHTML = `
    <div class="greet">
      <div class="spacer">
        <h1>${hello}, ${esc(firstName(d.me))} 👋</h1>
        <p class="muted" style="margin:0">${d.partner ? `Sharing MovieMatch with <strong>${esc(d.partner.displayName)}</strong>.` : 'Waiting for your partner to create their account — they can sign up from this same site.'}</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="n">${d.stats.myPicks}</div><div class="l">Your picks</div></div>
      <div class="stat"><div class="n">${d.stats.partnerPicks}</div><div class="l">${d.partner ? `${esc(pName)}’s picks` : 'Partner’s picks'}</div></div>
      <div class="stat"><div class="n">${d.stats.joint}</div><div class="l">On joint lists</div></div>
      <div class="stat"><div class="n">${d.stats.overlap}</div><div class="l">You both want</div></div>
      <div class="stat"><div class="n">${d.stats.watched}</div><div class="l">Watched</div></div>
    </div>

    ${matchCard}

    <div class="section">
      <div class="section-head"><h2>🤝 You both want to watch</h2><span class="muted small">On both of your lists</span></div>
      ${d.overlap.length
        ? `<div class="strip">${d.overlap.map((m) => `<div class="mcard" data-movie="${m.id}">${poster(m, { rating: true })}<div class="t">${esc(m.title)}</div><div class="s">${esc(m.year || '')}</div></div>`).join('')}</div>`
        : `<div class="empty">No overlap yet. When you both add the same movie, it shows up here — an instant agreement.</div>`}
    </div>

    <div class="section">
      <div class="section-head"><h2>Your lists</h2><span class="spacer"></span><a class="btn ghost small" href="#/lists">Manage lists</a></div>
      <div class="lists-grid">
        ${[...groups.joint, ...groups.mine, ...groups.partner].map(listTile).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Recently added</h2></div>
      ${d.recent.length
        ? `<div class="strip">${d.recent.map((i) => `<div class="mcard" data-movie="${i.movie.id}">${poster(i.movie, { rating: true })}<div class="t">${esc(i.movie.title)}</div><div class="s">${esc(i.addedByName || '')} · ${esc(i.listName)}<br>${timeAgo(i.addedAt)}</div></div>`).join('')}</div>`
        : `<div class="empty">Nothing yet — open a list and type a movie name to add it.</div>`}
    </div>

    <div class="section">
      <div class="section-head"><h2>Taste check</h2><span class="muted small">Top genres across each of your picks</span></div>
      <div class="taste">
        <div class="card"><h3>${esc(firstName(d.me))}</h3>${tasteBars(d.tastes.me, '')}</div>
        <div class="card"><h3>${d.partner ? esc(pName) : 'Partner'}</h3>${tasteBars(d.tastes.partner, 'p')}</div>
      </div>
    </div>`;
  bindMovieClicks(view);
}

function listTile(l) {
  const chip = l.kind === 'joint' ? '<span class="chip joint">👥 Joint</span>' : l.mine ? '<span class="chip mine">Mine</span>' : '<span class="chip partner">Partner’s · view only</span>';
  return `<a class="card list-tile" href="#/lists/${l.id}">
    ${chip}
    <h3>${esc(l.name)}</h3>
    <div class="muted small">${l.itemCount} movie${l.itemCount === 1 ? '' : 's'}${l.watchedCount ? ` · ${l.watchedCount} watched` : ''}</div>
  </a>`;
}

function bindMovieClicks(root) {
  $$('[data-movie]', root).forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openMovie(Number(el.dataset.movie));
    })
  );
}

// ---------- lists overview ----------
async function renderLists() {
  const { lists } = await api('/api/lists');
  const sec = (title, items, hint) => `
    <div class="section">
      <div class="section-head"><h2>${title}</h2><span class="muted small">${hint}</span></div>
      ${items.length ? `<div class="lists-grid">${items.map(listTile).join('')}</div>` : '<div class="empty">None yet.</div>'}
    </div>`;
  view.innerHTML = `
    <h1>Lists</h1>
    <form id="newList" class="card row" style="margin-top:1rem">
      <div style="flex:2;min-width:200px"><label>New list name</label><input name="name" placeholder="e.g. Halloween marathon" maxlength="60" required /></div>
      <div style="flex:1;min-width:160px"><label>Type</label>
        <select name="kind"><option value="personal">Personal (just me)</option><option value="joint">Joint (both of us)</option></select>
      </div>
      <button class="btn" style="align-self:flex-end">Create list</button>
    </form>
    ${sec('👥 Joint lists', lists.filter((l) => l.kind === 'joint'), 'Both of you can add and edit')}
    ${sec('My lists', lists.filter((l) => l.mine), 'Only you can edit — your partner can see them')}
    ${sec('Partner’s lists', lists.filter((l) => l.kind === 'personal' && !l.mine), 'View only')}`;
  $('#newList').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { list } = await api('/api/lists', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      location.hash = `#/lists/${list.id}`;
    } catch (err) { fail(err); }
  });
}

// ---------- single list ----------
async function renderList(id) {
  let filter = 'towatch', sort = 'added';
  let data = await api(`/api/lists/${id}`);
  const { list } = data;

  const kindChip = list.kind === 'joint' ? '<span class="chip joint">👥 Joint list</span>' : list.mine ? '<span class="chip mine">My list</span>' : `<span class="chip partner">${esc(list.owner?.displayName || 'Partner')}’s list · view only</span>`;

  view.innerHTML = `
    <div class="list-head">
      <div class="spacer">
        <a href="#/lists" class="muted small">← All lists</a>
        <h1 style="margin-top:0.4rem" id="listName">${esc(list.name)}</h1>
        ${kindChip}
      </div>
      ${list.canEdit ? `<div class="row"><button class="btn ghost small" id="renameBtn">Rename</button><button class="btn danger small" id="deleteBtn">Delete list</button></div>` : ''}
    </div>
    ${list.canEdit ? `
    <div class="adder">
      <input id="addInput" placeholder="Type a movie name and press Enter…" autocomplete="off" />
      <div class="suggest" id="suggest" hidden></div>
    </div>` : ''}
    <div class="row" style="margin-bottom:1rem">
      <div class="tabs" style="margin:0">
        <button data-f="towatch" class="on">To watch</button>
        <button data-f="watched">Watched</button>
        <button data-f="all">All</button>
      </div>
      <span class="spacer"></span>
      <select id="sortSel" style="width:auto">
        <option value="added">Recently added</option>
        <option value="rating">Highest rated</option>
        <option value="title">Title</option>
        <option value="runtime">Shortest first</option>
      </select>
    </div>
    <div id="grid"></div>`;

  const drawGrid = () => {
    let items = data.items.filter((i) => (filter === 'all' ? true : filter === 'watched' ? i.watched : !i.watched));
    const cmp = {
      added: () => 0,
      rating: (a, b) => (b.movie.rating || 0) - (a.movie.rating || 0),
      title: (a, b) => a.movie.title.localeCompare(b.movie.title),
      runtime: (a, b) => (a.movie.runtime || 999) - (b.movie.runtime || 999),
    }[sort];
    items = [...items].sort(cmp);
    $('#grid').innerHTML = items.length
      ? `<div class="movie-grid">${items.map((i) => `
          <div class="mcard ${i.watched ? 'watched' : ''}" data-movie="${i.movie.id}">
            ${poster(i.movie, { rating: true, flag: i.watched ? '<span class="chip badge-watched">✓ Watched</span>' : '' })}
            <div class="t">${esc(i.movie.title)} <span class="muted" style="font-weight:500">${esc(i.movie.year || '')}</span></div>
            <div class="s">${[i.movie.director && `Dir. ${esc(i.movie.director)}`, fmtRuntime(i.movie.runtime)].filter(Boolean).join(' · ')}</div>
            ${list.kind === 'joint' && i.addedByName ? `<div class="s">Added by ${esc(i.addedByName)}</div>` : ''}
            ${list.canEdit ? `<div class="actions">
              <button class="btn secondary small" data-watch="${i.id}">${i.watched ? 'Unwatch' : '✓ Watched'}</button>
              <button class="btn ghost small" data-remove="${i.id}" title="Remove from list">✕</button>
            </div>` : ''}
          </div>`).join('')}</div>`
      : `<div class="empty">${filter === 'watched' ? 'Nothing watched yet.' : list.canEdit ? 'This list is empty. Type a movie name above to add one — title, cast, crew and trailer are pulled in automatically.' : 'This list is empty.'}</div>`;
    bindMovieClicks($('#grid'));
    $$('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
      const item = data.items.find((i) => i.id === Number(b.dataset.watch));
      try {
        await api(`/api/lists/${list.id}/items/${item.id}`, { method: 'PATCH', body: { watched: !item.watched } });
        item.watched = !item.watched;
        drawGrid();
      } catch (err) { fail(err); }
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const item = data.items.find((i) => i.id === Number(b.dataset.remove));
      if (!confirm(`Remove “${item.movie.title}” from ${list.name}?`)) return;
      try {
        await api(`/api/lists/${list.id}/items/${item.id}`, { method: 'DELETE' });
        data.items = data.items.filter((i) => i !== item);
        drawGrid();
      } catch (err) { fail(err); }
    }));
  };

  $$('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    drawGrid();
  }));
  $('#sortSel').addEventListener('change', (e) => { sort = e.target.value; drawGrid(); });
  drawGrid();

  if (!list.canEdit) return;

  $('#renameBtn').addEventListener('click', async () => {
    const name = prompt('Rename list', list.name);
    if (!name?.trim()) return;
    try {
      await api(`/api/lists/${list.id}`, { method: 'PATCH', body: { name } });
      list.name = name.trim();
      $('#listName').textContent = list.name;
    } catch (err) { fail(err); }
  });
  $('#deleteBtn').addEventListener('click', async () => {
    if (!confirm(`Delete “${list.name}” and its ${data.items.length} movies? This can’t be undone.`)) return;
    try {
      await api(`/api/lists/${list.id}`, { method: 'DELETE' });
      location.hash = '#/lists';
    } catch (err) { fail(err); }
  });

  // --- add-by-name with live suggestions ---
  const input = $('#addInput');
  const box = $('#suggest');
  let results = [], hi = 0, seq = 0;

  const drawSuggest = () => {
    if (!results.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = results.map((r, i) => `
      <button type="button" data-i="${i}" class="${i === hi ? 'hi' : ''}">
        <span class="thumb">${poster(r)}</span>
        <span><strong>${esc(r.title)}</strong> <span class="muted">${esc(r.year || '')}</span><span class="ov">${esc(r.overview || '')}</span></span>
      </button>`).join('');
    $$('button', box).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); add(results[Number(b.dataset.i)]); }));
  };

  const search = debounce(async () => {
    const qv = input.value.trim();
    const mine = ++seq;
    if (qv.length < 2) { results = []; return drawSuggest(); }
    try {
      const { results: r } = await api(`/api/movies/search?q=${encodeURIComponent(qv)}`);
      if (mine !== seq) return;
      results = r; hi = 0; drawSuggest();
      if (!r.length) { box.hidden = false; box.innerHTML = `<div class="muted small" style="padding:0.8rem">No movies found for “${esc(qv)}”.</div>`; }
    } catch (err) { fail(err); }
  }, 250);

  async function add(pick) {
    const title = input.value.trim();
    if (!pick && !title) return;
    input.disabled = true;
    try {
      const { item } = await api(`/api/lists/${list.id}/items`, { method: 'POST', body: pick ? { tmdbId: pick.id } : { title } });
      toast(`Added ${item.movie.title}${item.movie.year ? ` (${item.movie.year})` : ''}`);
      input.value = ''; results = []; drawSuggest();
      data = await api(`/api/lists/${list.id}`);
      if (filter === 'watched') { filter = 'towatch'; $$('[data-f]').forEach((x) => x.classList.toggle('on', x.dataset.f === 'towatch')); }
      drawGrid();
    } catch (err) { fail(err); }
    input.disabled = false;
    input.focus();
  }

  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 150));
  input.addEventListener('focus', () => results.length && drawSuggest());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { hi = (hi + 1) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && results.length) { hi = (hi - 1 + results.length) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'Escape') { box.hidden = true; }
    else if (e.key === 'Enter') { e.preventDefault(); add(results[hi] || null); }
  });
  input.focus();
}

// ---------- movie detail modal ----------
function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  $('#modalBody').innerHTML = ''; // stops the trailer
  document.body.style.overflow = '';
}
$$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

async function openMovie(id) {
  const modal = $('#modal');
  const body = $('#modalBody');
  body.innerHTML = '<div style="padding:3rem;text-align:center" class="muted">Loading…</div>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  let data, lists;
  try {
    [data, { lists }] = await Promise.all([api(`/api/movies/${id}`), api('/api/lists')]);
  } catch (err) {
    body.innerHTML = `<div class="empty" style="margin:2rem">${esc(err.message)}</div>`;
    return;
  }
  const m = data.movie;
  const onLists = new Set(data.lists.map((l) => l.id));
  const writable = lists.filter((l) => l.canEdit && !onLists.has(l.id));
  const watched = data.lists.some((l) => l.watched);
  const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.title} ${m.year || ''} official trailer`)}`;

  body.innerHTML = `
    <div class="detail-hero" style="${m.backdropUrl ? `background-image:url('${esc(m.backdropUrl)}')` : ''}">
      ${poster(m)}
      <div>
        <h1>${esc(m.title)} <span class="muted" style="font-weight:500">${esc(m.year || '')}</span></h1>
        ${m.tagline ? `<p class="muted"><em>${esc(m.tagline)}</em></p>` : ''}
        <div class="detail-meta">
          ${m.rating ? `<span class="chip">★ ${m.rating.toFixed(1)}</span>` : ''}
          ${m.certification ? `<span class="chip">${esc(m.certification)}</span>` : ''}
          ${m.runtime ? `<span class="chip">${fmtRuntime(m.runtime)}</span>` : ''}
          ${m.genres.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}
          ${watched ? '<span class="chip badge-watched">✓ Watched</span>' : ''}
        </div>
        <p>${esc(m.overview || '')}</p>
        <div class="row" style="margin-top:0.5rem">
          ${writable.length ? `<select id="addTo" style="width:auto"><option value="">Add to list…</option>${writable.map((l) => `<option value="${l.id}">${esc(l.name)}${l.kind === 'joint' ? ' (joint)' : ''}</option>`).join('')}</select>` : ''}
          ${data.lists.length ? `<button class="btn secondary small" id="watchAll">${watched ? 'Mark unwatched' : '✓ Mark watched'}</button>` : ''}
        </div>
        ${data.lists.length ? `<p class="small muted" style="margin-top:0.75rem">On: ${data.lists.map((l) => `<a href="#/lists/${l.id}">${esc(l.name)}</a>`).join(', ')}</p>` : ''}
      </div>
    </div>
    <div class="detail-body">
      <h2>Trailer</h2>
      ${m.trailerKey
        ? `<div class="trailer"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.trailerKey)}?rel=0" title="${esc(m.title)} trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : `<div class="empty" style="margin-bottom:1rem">No trailer on file. <a href="${ytSearch}" target="_blank" rel="noopener">Search YouTube ↗</a></div>`}
      <h2>Credits</h2>
      <dl class="credits">
        ${m.director ? `<dt>Director</dt><dd>${esc(m.director)}</dd>` : ''}
        ${m.writers.length ? `<dt>Writers</dt><dd>${m.writers.map(esc).join(', ')}</dd>` : ''}
      </dl>
      ${m.cast.length ? `<div class="cast">${m.cast.map((p) => `
        <div class="p">
          <div class="face">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" />` : esc(p.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</div>
          <div><strong>${esc(p.name)}</strong></div>
          <div class="c">${esc(p.character || '')}</div>
        </div>`).join('')}</div>` : '<p class="muted">No cast information.</p>'}
    </div>`;

  $('#addTo')?.addEventListener('change', async (e) => {
    const listId = e.target.value;
    if (!listId) return;
    try {
      await api(`/api/lists/${listId}/items`, { method: 'POST', body: { tmdbId: m.id } });
      toast(`Added to ${e.target.selectedOptions[0].textContent}`);
      openMovie(m.id);
    } catch (err) { fail(err); }
  });
  $('#watchAll')?.addEventListener('click', async () => {
    try {
      await api(`/api/movies/${m.id}/watched`, { method: 'POST', body: { watched: !watched } });
      toast(watched ? 'Marked unwatched' : 'Marked watched on every list');
      openMovie(m.id);
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
  const [{ genres }, { lists }] = await Promise.all([api('/api/genres'), api('/api/lists')]);
  const chosen = new Set(prev?.genres || []);
  const listSel = new Set(prev?.listIds?.length ? prev.listIds : lists.map((l) => l.id));
  view.innerHTML = `
    <h1>Match</h1>
    <p class="muted">Both of you swipe through the movies on your lists. Swipe right on anything you’d watch tonight — when you both swipe right, it’s a match. Movies from the other person’s list come first, so you weigh in on each other’s ideas.</p>
    <form id="setup" class="card filters" style="margin-top:1rem">
      <div class="field"><label>In the mood for… (optional — leave empty for anything)</label>
        <div class="chips">${genres.length ? genres.map((g) => `<span class="chip toggle ${chosen.has(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</span>`).join('') : '<span class="muted small">Add movies to your lists first.</span>'}</div>
      </div>
      <div class="field" style="max-width:260px"><label>Max length</label>
        <select name="maxRuntime">
          <option value="">Any length</option>
          <option value="100">Under 1h 40m</option>
          <option value="120">Under 2h</option>
          <option value="150">Under 2h 30m</option>
        </select>
      </div>
      <div class="field"><label>Pull movies from</label>
        <div class="chips">${lists.map((l) => `<span class="chip toggle ${listSel.has(l.id) ? 'on' : ''}" data-l="${l.id}">${esc(l.name)}</span>`).join('')}</div>
      </div>
      <button class="btn">Start match round</button>
      <p class="small muted" style="margin:0.6rem 0 0">Starting a round replaces any round in progress for both of you.</p>
    </form>`;
  $$('[data-g]').forEach((c) => c.addEventListener('click', () => {
    c.classList.toggle('on');
    c.classList.contains('on') ? chosen.add(c.dataset.g) : chosen.delete(c.dataset.g);
  }));
  $$('[data-l]').forEach((c) => c.addEventListener('click', () => {
    const id = Number(c.dataset.l);
    c.classList.toggle('on');
    c.classList.contains('on') ? listSel.add(id) : listSel.delete(id);
  }));
  if (prev?.maxRuntime) $('[name=maxRuntime]').value = String(prev.maxRuntime);
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!listSel.size) return toast('Pick at least one list', true);
    try {
      const { state } = await api('/api/match/rounds', {
        method: 'POST',
        body: {
          genres: [...chosen],
          maxRuntime: Number($('[name=maxRuntime]').value) || null,
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
    <div class="row" style="margin-bottom:1rem">
      <h1 class="spacer" style="margin:0">Match</h1>
      <button class="btn ghost small" id="newRound">New round</button>
      <button class="btn ghost small" id="endRound">End round</button>
    </div>
    <div class="match-layout">
      <div>
        <div class="progress" id="progress"></div>
        <div class="deck" id="deck"></div>
        <div class="swipe-controls" id="controls">
          <button class="round-btn mini" id="undoBtn" title="Undo (Backspace)">↺</button>
          <button class="round-btn no" id="noBtn" title="Nope (←)">✕</button>
          <button class="round-btn mini" id="infoBtn" title="Details (↑)">ⓘ</button>
          <button class="round-btn yes" id="yesBtn" title="Yes! (→)">♥</button>
        </div>
      </div>
      <aside class="card match-list" id="side"></aside>
    </div>`;

  const drawProgress = () => {
    const pct = (n) => (state.poolSize ? Math.round((n / state.poolSize) * 100) : 0);
    const f = state.round.filters;
    const filt = [f.genres.length && f.genres.join(', '), f.maxRuntime && `under ${fmtRuntime(f.maxRuntime)}`].filter(Boolean).join(' · ');
    $('#progress').innerHTML = `
      <div class="meter"><span class="small">You · ${state.mySwipes}/${state.poolSize}</span><div class="track"><div class="fill" style="width:${pct(state.mySwipes)}%"></div></div></div>
      <div class="meter"><span class="small">${esc(pName)} · ${state.partnerSwipes}/${state.poolSize}</span><div class="track"><div class="fill" style="width:${pct(state.partnerSwipes)}%;background:var(--joint)"></div></div></div>
      ${filt ? `<div class="small muted" style="flex-basis:100%;text-align:center">${esc(filt)}</div>` : ''}`;
  };

  const drawSide = () => {
    const row = (m, extra = '') => `
      <div class="mrow ${state.chosen?.id === m.id ? 'chosen' : ''}" data-movie="${m.id}">
        ${poster(m)}
        <div class="spacer"><strong>${esc(m.title)}</strong><div class="small muted">${[m.year, fmtRuntime(m.runtime), m.rating && `★ ${m.rating.toFixed(1)}`].filter(Boolean).join(' · ')}${extra}</div></div>
        <button class="btn ${state.chosen?.id === m.id ? 'secondary' : 'ghost'} small" data-choose="${m.id}">${state.chosen?.id === m.id ? '✓ Tonight' : 'Pick'}</button>
      </div>`;
    const bothDone = state.myDone && state.partnerDone;
    let html = `<h2>💘 Matches (${state.matches.length})</h2>`;
    if (state.chosen) html += `<p class="small" style="color:var(--good)">Tonight’s pick: <strong>${esc(state.chosen.title)}</strong> 🍿</p>`;
    html += state.matches.length
      ? state.matches.map((m) => row(m)).join('') + (state.matches.length > 1 ? `<button class="btn small" id="spin" style="width:100%;margin-top:0.6rem">🎲 Pick one for us</button>` : '')
      : `<p class="muted small">${bothDone ? 'No matches this round.' : `No matches yet — keep swiping. Matches appear here the moment you and ${esc(pName)} both like a movie.`}</p>`;
    if (state.nearMisses.length && (bothDone || !state.matches.length)) {
      html += `<h2 style="margin-top:1.2rem">🤏 Near misses</h2>
        <p class="muted small">Only one of you said yes. ${bothDone && !state.matches.length ? 'Good compromise candidates:' : ''}</p>
        ${state.nearMisses.slice(0, 6).map((m) => row(m, ` · liked by ${m.likedBy === 'me' ? 'you' : esc(pName)}`)).join('')}`;
    }
    if (bothDone && !state.matches.length && !state.nearMisses.length) {
      html += `<p class="muted small">Tough crowd! Try a new round with different filters, or add more movies.</p>`;
    }
    $('#side').innerHTML = html;
    bindMovieClicks($('#side'));
    $$('[data-choose]', $('#side')).forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.choose))));
    $('#spin')?.addEventListener('click', () => {
      const pick = state.matches[Math.floor(Math.random() * state.matches.length)];
      choose(pick.id);
    });
  };

  async function choose(movieId) {
    try {
      ({ state } = await api('/api/match/choose', { method: 'POST', body: { movieId: state.chosen?.id === movieId ? null : movieId } }));
      drawSide();
      if (state.chosen) toast(`Tonight’s pick: ${state.chosen.title} 🍿`);
    } catch (err) { fail(err); }
  }

  const sourceLabel = (c) => ({
    partner: `<span class="chip partner">From ${esc(pName)}’s picks</span>`,
    me: '<span class="chip mine">Your pick</span>',
    both: '<span class="chip joint">You both picked this</span>',
    joint: '<span class="chip joint">Joint list</span>',
  })[c.source] || '';

  const drawDeck = () => {
    const deck = $('#deck');
    const controls = $('#controls');
    if (!cards.length) {
      controls.style.visibility = history.length ? 'visible' : 'hidden';
      $$('.round-btn:not(#undoBtn)', controls).forEach((b) => (b.style.display = 'none'));
      deck.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:0.5rem">
        ${state.poolSize === 0
          ? '<div style="font-size:2rem">🫙</div><strong>No movies fit this round.</strong><span>Add movies to your lists or loosen the filters.</span>'
          : `<div style="font-size:2rem">✅</div><strong>You’ve swiped everything!</strong><span>${state.partnerDone ? (state.matches.length ? 'Check your matches →' : 'No mutual likes — see the near misses →') : `Waiting on ${esc(pName)} (${state.partnerSwipes}/${state.poolSize}). New matches will pop up here.`}</span>`}
      </div>`;
      return;
    }
    controls.style.visibility = 'visible';
    $$('.round-btn', controls).forEach((b) => (b.style.display = ''));
    const [top, next] = cards;
    const cardHtml = (c, cls) => `
      <div class="swipe-card ${cls}" data-id="${c.id}">
        ${poster(c)}
        <span class="stamp yes">YES</span><span class="stamp no">NOPE</span>
        <div class="info">
          ${sourceLabel(c)}
          <h2 style="margin-top:0.4rem">${esc(c.title)} <span style="font-weight:500;opacity:.75">${esc(c.year || '')}</span></h2>
          <div class="small" style="color:#ccc">${[c.rating && `★ ${c.rating.toFixed(1)}`, fmtRuntime(c.runtime), c.genres.slice(0, 3).join(', ')].filter(Boolean).map(esc).join(' · ')}</div>
          ${c.director ? `<div class="small" style="color:#ccc">Dir. ${esc(c.director)}${c.cast[0] ? ` · ${esc(c.cast.slice(0, 2).map((p) => p.name).join(', '))}` : ''}</div>` : ''}
          <p>${esc(c.overview || '')}</p>
        </div>
      </div>`;
    deck.innerHTML = (next ? cardHtml(next, 'behind') : '') + cardHtml(top, '');
    attachDrag($('.swipe-card:not(.behind)', deck), (liked) => swipe(liked));
  };

  async function loadDeck() {
    const r = await api('/api/match/deck?limit=20');
    cards = r.cards;
    state = r.state;
  }

  let busy = false;
  async function swipe(liked, animate = false) {
    if (busy || !cards.length) return;
    busy = true;
    const card = cards[0];
    const el = $('.swipe-card:not(.behind)');
    if (animate && el) {
      el.style.transition = 'transform .3s ease, opacity .3s';
      el.style.transform = `translateX(${liked ? 600 : -600}px) rotate(${liked ? 25 : -25}deg)`;
      el.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 250));
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
    drawProgress(); drawSide(); drawDeck();
  }

  async function undo() {
    const last = history.pop();
    if (!last || busy) return;
    try {
      ({ state } = await api('/api/match/undo', { method: 'POST', body: { movieId: last.id } }));
      cards = [last, ...cards.filter((c) => c.id !== last.id)];
      drawProgress(); drawSide(); drawDeck();
    } catch (err) { fail(err); }
  }

  function celebrate(m) {
    const el = document.createElement('div');
    el.className = 'its-a-match';
    el.innerHTML = `<h1>It’s a match!</h1>${poster(m)}<p>You and ${esc(pName)} both want to watch <strong>${esc(m.title)}</strong>.</p>
      <div class="row"><button class="btn" data-pick>Watch this tonight</button><button class="btn ghost" data-keep>Keep swiping</button></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => e.target === el && close());
    $('[data-keep]', el).addEventListener('click', close);
    $('[data-pick]', el).addEventListener('click', () => { close(); choose(m.id); });
  }

  $('#yesBtn').addEventListener('click', () => swipe(true, true));
  $('#noBtn').addEventListener('click', () => swipe(false, true));
  $('#undoBtn').addEventListener('click', undo);
  $('#infoBtn').addEventListener('click', () => cards[0] && openMovie(cards[0].id));
  $('#endRound').addEventListener('click', async () => {
    if (!confirm('End this round for both of you?')) return;
    stopTimers();
    await api('/api/match/end', { method: 'POST' }).catch(fail);
    renderMatchSetup();
  });
  $('#newRound').addEventListener('click', () => { stopTimers(); renderMatchSetup(state.round.filters); });

  const onKey = (e) => {
    if (!$('#modal').hidden || !$('#deck') || e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') swipe(true, true);
    else if (e.key === 'ArrowLeft') swipe(false, true);
    else if (e.key === 'ArrowUp') cards[0] && openMovie(cards[0].id);
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

/** Pointer-based drag-to-swipe for the top card. */
function attachDrag(el, onSwipe) {
  if (!el) return;
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
  const yes = $('.stamp.yes', el), no = $('.stamp.no', el);
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY; dx = dy = 0;
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    el.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
    no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = '';
    if (Math.abs(dx) > 110) {
      const liked = dx > 0;
      el.style.transition = 'transform .25s ease, opacity .25s';
      el.style.transform = `translate(${liked ? 700 : -700}px, ${dy}px) rotate(${liked ? 30 : -30}deg)`;
      el.style.opacity = '0';
      setTimeout(() => onSwipe(liked), 180);
    } else {
      el.style.transition = 'transform .25s ease';
      el.style.transform = '';
      yes.style.opacity = no.style.opacity = 0;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) openMovie(Number(el.dataset.id));
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

boot().catch((err) => {
  view.innerHTML = `<div class="empty">Couldn’t reach the server: ${esc(err.message)}</div>`;
});
