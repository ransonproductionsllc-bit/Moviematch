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
};
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
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
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
  stopTimers();
  closeModal();
  if (!app.user) return renderAuth();
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
        <form id="authForm">
          ${mode === 'register' ? '<div class="field"><label for="f-name">Your name</label><input id="f-name" name="displayName" autocomplete="given-name" placeholder="Sam" required /></div>' : ''}
          <div class="field"><label for="f-user">Username</label><input id="f-user" name="username" autocomplete="username" autocapitalize="off" required /></div>
          <div class="field"><label for="f-pass">Password</label><input id="f-pass" name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required minlength="6" /></div>
          <p class="error" id="authErr" role="alert"></p>
          <button class="btn block">${mode === 'register' ? 'Create my account' : 'Sign in'}</button>
        </form>
      </div>`;
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button.btn', e.target);
      btn.disabled = true;
      try {
        const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        app.user = user;
        showChrome();
        route();
      } catch (err) {
        $('#authErr').textContent = err.message;
        btn.disabled = false;
      }
    });
  };
  draw();
}

// ---------- dashboard ----------
function tonightPanel(d) {
  const r = d.round;
  const pName = d.partner ? firstName(d.partner) : 'your partner';
  if (!d.partner) {
    return `<section class="tonight">
      <div><h2>Waiting for your second seat</h2><p>Your partner can create their account from this same address. Until then, start filling your lists.</p></div>
      <a class="btn ghost" href="#/lists">${icon('plus')}Add movies</a>
    </section>`;
  }
  if (!r) {
    return `<section class="tonight">
      <div><h2>Can’t agree on a movie?</h2><p>Swipe through both your lists together. Anything you both like becomes a match.</p></div>
      <a class="btn" href="#/match">${icon('heart')}Start matching</a>
    </section>`;
  }
  const left = r.poolSize - r.mySwipes;
  const meter = (label, n, cls) => `<div class="meter ${cls}"><span>${label} · ${n}/${r.poolSize}</span><div class="track"><div class="fill" style="width:${r.poolSize ? (n / r.poolSize) * 100 : 0}%"></div></div></div>`;
  const head = r.chosen
    ? `<div class="chosen">${poster(r.chosen, { mini: true })}<div><span class="label">Tonight’s pick</span><h2>${esc(r.chosen.title)}</h2><p>${[r.chosen.year, fmtRuntime(r.chosen.runtime)].filter(Boolean).join(' · ')}</p></div></div>`
    : `<div><h2>${r.matches.length ? `${plural(r.matches.length, 'match')} so far` : 'Match round in progress'}</h2>
        <p>${r.matches.length ? 'Pick one for tonight, or keep swiping for more.' : r.myDone ? `You’re done — waiting on ${esc(pName)}.` : `${plural(left, 'movie')} left for you to swipe.`}</p>
        <div class="bars">${meter('You', r.mySwipes, '')}${meter(esc(pName), r.partnerSwipes, 'partner')}</div></div>`;
  const cta = r.myDone || r.chosen
    ? `<a class="btn ${r.chosen ? 'ghost' : ''}" href="#/match">${r.chosen ? 'Open round' : 'See matches'}</a>`
    : `<a class="btn" href="#/match">${icon('heart')}Keep swiping</a>`;
  const picks = r.matches.length && !r.chosen
    ? `<div class="picks">${r.matches.map((m) => `<div data-movie="${m.id}" title="${esc(m.title)}">${poster(m, { mini: true })}</div>`).join('')}</div>`
    : '';
  return `<section class="tonight">${head}${cta}${picks}</section>`;
}

function movieCard(m, { sub = '', by = '' } = {}) {
  return `<div class="mcard" data-movie="${m.id}">${poster(m, { score: true })}
    <div class="t">${esc(m.title)}</div>
    ${sub ? `<div class="s">${sub}</div>` : ''}${by}</div>`;
}

async function renderDashboard() {
  const d = await api('/api/dashboard');
  const pName = d.partner ? firstName(d.partner) : null;
  const meName = firstName(d.me);
  const groups = [
    ...d.lists.filter((l) => l.kind === 'joint'),
    ...d.lists.filter((l) => l.mine),
    ...d.lists.filter((l) => l.kind === 'personal' && !l.mine),
  ];
  const tasteBars = (rows, cls) => {
    if (!rows.length) return '<p class="muted small">No picks yet.</p>';
    const max = Math.max(...rows.map((x) => x.count));
    return rows.map((x) => `<div class="bar ${cls}"><span>${esc(x.genre)}</span><span class="track"><span class="fill" style="width:${(x.count / max) * 100}%;display:block"></span></span><span class="n">${x.count}</span></div>`).join('');
  };

  view.innerHTML = `
    <div class="home-head">
      <h1 class="title-xl spacer">Tonight</h1>
      <p class="meta"><span class="seat-me"><b>${esc(meName)}</b> ${d.stats.myPicks} picks</span>${d.partner ? ` · <span class="seat-partner"><b>${esc(pName)}</b> ${d.stats.partnerPicks} picks</span>` : ''} · ${d.stats.watched} watched</p>
    </div>

    ${tonightPanel(d)}

    <section class="section">
      <div class="section-head"><h2>On both your lists</h2><span class="muted small">${d.overlap.length ? 'Already agreed — no swiping needed' : ''}</span></div>
      ${d.overlap.length
        ? `<div class="strip">${d.overlap.map((m) => movieCard(m, { sub: [m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ') })).join('')}</div>`
        : `<div class="empty">${icon('users')}<strong>Nothing in common yet</strong>When you both add the same movie, it shows up here.</div>`}
    </section>

    <section class="section">
      <div class="section-head"><h2>Recently added</h2></div>
      ${d.recent.length
        ? `<div class="strip">${d.recent.map((i) => movieCard(i.movie, {
            sub: `${esc(i.listName)}`,
            by: `<div class="s by ${i.addedBy === d.me.id ? 'me' : ''}">${i.addedBy === d.me.id ? 'You' : esc(i.addedByName || '')} · ${timeAgo(i.addedAt)}</div>`,
          })).join('')}</div>`
        : `<div class="empty">${icon('film')}<strong>No movies yet</strong><a href="#/lists">Open a list</a> and type a title to add one.</div>`}
    </section>

    <section class="section">
      <div class="section-head"><h2>Lists</h2><span class="spacer"></span><a class="btn quiet small" href="#/lists">All lists ${icon('right')}</a></div>
      <div class="list-rows">${groups.map(listRow).join('')}</div>
    </section>

    ${d.partner ? `<section class="section">
      <div class="section-head"><h2>Taste check</h2><span class="muted small">Top genres in each of your picks</span></div>
      <div class="taste">
        <div><h3 class="seat-me">${esc(meName)}</h3>${tasteBars(d.tastes.me, '')}</div>
        <div><h3 class="seat-partner">${esc(pName)}</h3>${tasteBars(d.tastes.partner, 'p')}</div>
      </div>
    </section>` : ''}`;
  bindMovieClicks(view);
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
  $$('[data-movie]', root).forEach((el) => {
    el.tabIndex = 0;
    const open = (e) => {
      if (e.target.closest('button')) return;
      openMovie(Number(el.dataset.movie));
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
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
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="Filter">
        <button data-f="towatch" class="on">To watch</button>
        <button data-f="watched">Watched</button>
        <button data-f="all">All</button>
      </div>
      <span class="spacer"></span>
      <select id="sortSel" aria-label="Sort">
        <option value="added">Recently added</option>
        <option value="rating">Highest rated</option>
        <option value="title">A–Z</option>
        <option value="runtime">Shortest first</option>
      </select>
    </div>
    <div id="grid"></div>`;

  const counts = () => {
    const w = data.items.filter((i) => i.watched).length;
    const labels = { towatch: `To watch ${data.items.length - w}`, watched: `Watched ${w}`, all: `All ${data.items.length}` };
    $$('[data-f]').forEach((b) => (b.textContent = labels[b.dataset.f]));
  };

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
    const tools = (i) => list.canEdit ? `<div class="tools">
        <button class="icon-btn ${i.watched ? 'on' : ''}" data-watch="${i.id}" aria-pressed="${i.watched}" aria-label="${i.watched ? 'Watched — mark as not watched' : 'Mark as watched'}" title="${i.watched ? 'Watched' : 'Mark as watched'}">${icon('check')}</button>
        <button class="icon-btn" data-remove="${i.id}" aria-label="Remove ${esc(i.movie.title)}" title="Remove from list">${icon('x')}</button>
      </div>` : '';
    $('#grid').innerHTML = items.length
      ? `<div class="movie-grid">${items.map((i) => `
          <div class="mcard" data-movie="${i.movie.id}">
            ${poster(i.movie, { score: true, watched: i.watched, extra: tools(i) })}
            <div class="t">${esc(i.movie.title)} <span>${esc(i.movie.year || '')}</span></div>
            <div class="s">${[i.movie.director, fmtRuntime(i.movie.runtime)].filter(Boolean).map(esc).join(' · ')}</div>
            ${list.kind === 'joint' && i.addedByName ? `<div class="s by ${i.addedBy === app.user.id ? 'me' : ''}">Added by ${i.addedBy === app.user.id ? 'you' : esc(i.addedByName)}</div>` : ''}
          </div>`).join('')}</div>`
      : filter === 'watched'
        ? `<div class="empty">${icon('check')}<strong>Nothing watched yet</strong>Tap the check on a poster after movie night.</div>`
        : data.items.length
          ? `<div class="empty">${icon('check')}<strong>All caught up</strong>Everything on this list has been watched.</div>`
          : `<div class="empty">${icon('film')}<strong>This list is empty</strong>${list.canEdit ? 'Type a title above. Poster, cast, crew and trailer fill in on their own.' : ''}</div>`;
    bindMovieClicks($('#grid'));
    $$('[data-watch]').forEach((b) => b.addEventListener('click', async () => {
      const item = data.items.find((i) => i.id === Number(b.dataset.watch));
      try {
        await api(`/api/lists/${list.id}/items/${item.id}`, { method: 'PATCH', body: { watched: !item.watched } });
        item.watched = !item.watched;
        toast(item.watched ? `Marked ${item.movie.title} as watched` : `${item.movie.title} is back on the to-watch list`);
        drawGrid();
      } catch (err) { fail(err); }
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      const item = data.items.find((i) => i.id === Number(b.dataset.remove));
      if (!confirm(`Remove “${item.movie.title}” from ${list.name}?`)) return;
      try {
        await api(`/api/lists/${list.id}/items/${item.id}`, { method: 'DELETE' });
        data.items = data.items.filter((i) => i !== item);
        toast(`Removed ${item.movie.title}`);
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
    if (!confirm(`Delete “${list.name}” and its ${plural(data.items.length, 'movie')}? This can’t be undone.`)) return;
    try {
      await api(`/api/lists/${list.id}`, { method: 'DELETE' });
      location.hash = '#/lists';
    } catch (err) { fail(err); }
  });

  // --- add-by-name with live suggestions ---
  const input = $('#addInput');
  const box = $('#suggest');
  let results = [], hi = 0, seq = 0;
  const onList = () => new Set(data.items.map((i) => i.movie.id));

  const show = (html) => {
    box.hidden = !html;
    input.setAttribute('aria-expanded', String(!!html));
    if (html) box.innerHTML = html;
  };
  const drawSuggest = () => {
    if (!results.length) return show('');
    const have = onList();
    show(results.map((r, i) => `
      <button type="button" role="option" data-i="${i}" class="${i === hi ? 'hi' : ''}" aria-selected="${i === hi}">
        <span class="thumb">${poster(r, { mini: true })}</span>
        <span class="spacer"><strong>${esc(r.title)}</strong> <span class="muted">${esc(r.year || '')}</span><span class="ov">${have.has(r.id) ? 'Already on this list' : esc(r.overview || '')}</span></span>
        ${have.has(r.id) ? icon('check') : icon('plus')}
      </button>`).join(''));
    $$('button', box).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); add(results[Number(b.dataset.i)]); }));
  };

  const search = debounce(async () => {
    const qv = input.value.trim();
    const mine = ++seq;
    if (qv.length < 2) { results = []; return drawSuggest(); }
    show('<div class="hint">Searching…</div>');
    try {
      const { results: r } = await api(`/api/movies/search?q=${encodeURIComponent(qv)}`);
      if (mine !== seq) return;
      results = r; hi = 0;
      if (r.length) drawSuggest();
      else show(`<div class="hint">No movies match “${esc(qv)}”. Check the spelling, or try fewer words.</div>`);
    } catch (err) { fail(err); }
  }, 220);

  async function add(pick) {
    const title = input.value.trim();
    if (!pick && !title) return;
    input.disabled = true;
    show('<div class="hint">Adding and pulling in cast, crew and trailer…</div>');
    try {
      const { item } = await api(`/api/lists/${list.id}/items`, { method: 'POST', body: pick ? { tmdbId: pick.id } : { title } });
      toast(`Added ${item.movie.title}${item.movie.year ? ` (${item.movie.year})` : ''}`);
      input.value = ''; results = []; show('');
      data = await api(`/api/lists/${list.id}`);
      if (filter === 'watched') { filter = 'towatch'; $$('[data-f]').forEach((x) => x.classList.toggle('on', x.dataset.f === 'towatch')); }
      drawGrid();
    } catch (err) { fail(err); drawSuggest(); }
    input.disabled = false;
    input.focus();
  }

  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(() => show(''), 150));
  input.addEventListener('focus', () => results.length && drawSuggest());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { hi = (hi + 1) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && results.length) { hi = (hi - 1 + results.length) % results.length; drawSuggest(); e.preventDefault(); }
    else if (e.key === 'Escape') show('');
    else if (e.key === 'Enter') { e.preventDefault(); add(results[hi] || null); }
  });
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

// ---------- movie detail ----------
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
  if (modal.hidden) body.innerHTML = '<div style="padding:2rem;display:flex;gap:1.5rem"><div class="skel" style="width:160px;aspect-ratio:2/3"></div><div style="flex:1"><div class="skel" style="height:40px;width:60%"></div><div class="skel" style="height:16px;width:40%;margin-top:1rem"></div><div class="skel" style="height:70px;margin-top:1rem"></div></div></div>';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  let data, lists;
  try {
    [data, { lists }] = await Promise.all([api(`/api/movies/${id}`), api('/api/lists')]);
  } catch (err) {
    body.innerHTML = `<div class="empty">${icon('film')}<strong>Couldn’t load this movie</strong>${esc(err.message)}</div>`;
    return;
  }
  const m = data.movie;
  const onLists = new Set(data.lists.map((l) => l.id));
  const writable = lists.filter((l) => l.canEdit && !onLists.has(l.id));
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
          ${writable.length ? `<select id="addTo" aria-label="Add to a list"><option value="">Add to a list…</option>${writable.map((l) => `<option value="${l.id}">${esc(l.name)}${l.kind === 'joint' ? ' (joint)' : ''}</option>`).join('')}</select>` : ''}
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
      toast(watched ? 'Back on your to-watch lists' : 'Marked as watched on every list');
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
          <button class="round-btn no" id="noBtn" aria-label="Not tonight">${icon('x')}</button>
          <button class="round-btn yes" id="yesBtn" aria-label="Yes, I’d watch this">${icon('heart')}</button>
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
      <div class="mrow ${state.chosen?.id === m.id ? 'chosen' : ''}" data-movie="${m.id}">
        ${poster(m, { mini: true })}
        <div class="spacer"><div class="t">${esc(m.title)}</div><div class="s">${[m.year, fmtRuntime(m.runtime)].filter(Boolean).join(' · ')}${extra}</div></div>
        <button class="btn ${state.chosen?.id === m.id ? '' : 'ghost'} small" data-choose="${m.id}" aria-pressed="${state.chosen?.id === m.id}">${state.chosen?.id === m.id ? `${icon('check')}Tonight` : 'Pick'}</button>
      </div>`;
    const bothDone = state.myDone && state.partnerDone;
    const f = state.round.filters;
    const filt = [f.genres.length && f.genres.join(', '), f.maxRuntime && `under ${fmtRuntime(f.maxRuntime)}`].filter(Boolean).join(' · ');
    let html = `<h2>Matches <span class="count">${state.matches.length}</span></h2>`;
    if (filt) html += `<p class="hint">${esc(filt)}</p>`;
    html += `<div class="group">${state.matches.length
      ? state.matches.map((m) => row(m)).join('') + (state.matches.length > 1 && !state.chosen ? `<button class="btn ghost block" id="spin" style="margin-top:0.75rem">${icon('dice')}Pick one for us</button>` : '')
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
      if (state.chosen) toast(`Tonight: ${state.chosen.title}`);
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
            ? `${icon('check')}<h2>Round complete</h2><p>${state.matches.length ? `You have ${plural(state.matches.length, 'match')}. Pick one for tonight.` : 'No movie got two yeses. The near misses are your best compromise.'}</p>`
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
    $('.its-a-match')?.remove();
    const el = document.createElement('div');
    el.className = 'its-a-match';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'It’s a match');
    el.innerHTML = `${poster(m)}<span class="label eyebrow">You both said yes</span><h1>It’s a match</h1>
      <p>You and ${esc(pName)} both want to watch <b>${esc(m.title)}</b>.</p>
      <div class="row" style="justify-content:center"><button class="btn" data-pick>${icon('play')}Watch it tonight</button><button class="btn ghost" data-keep>Keep swiping</button></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
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
    if (!confirm(`End this round for you and ${pName}?`)) return;
    stopTimers();
    await api('/api/match/end', { method: 'POST' }).catch(fail);
    renderMatchSetup();
  });
  $('#newRound').addEventListener('click', () => renderMatchSetup(state.round.filters));

  const onKey = (e) => {
    if (!$('#modal').hidden || $('.its-a-match') || e.target.matches('input, select, textarea')) return;
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
    el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 20}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
    no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = '';
    if (Math.abs(dx) > 100) {
      const liked = dx > 0;
      el.style.transition = 'transform .26s cubic-bezier(.3,.6,.4,1), opacity .26s';
      el.style.transform = `translate(${liked ? 640 : -640}px, ${dy * 0.6}px) rotate(${liked ? 24 : -24}deg)`;
      el.style.opacity = '0';
      setTimeout(() => onSwipe(liked), 170);
    } else {
      el.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = '';
      yes.style.opacity = no.style.opacity = 0;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) openMovie(Number(el.dataset.id));
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

boot().catch((err) => {
  view.innerHTML = `<div class="empty">${icon('film')}<strong>Couldn’t reach MovieMatch</strong>${esc(err.message)}</div>`;
});
