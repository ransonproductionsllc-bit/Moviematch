import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx } from './db.js';

const MAX_USERS = 2;
const SESSION_DAYS = 30;
const CACHE_DAYS = 30;
const COOKIE = 'mm_session';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

// ---------- password hashing ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Small deterministic hash so each round shuffles the deck the same way for both users. */
function mix(a, b) {
  let h = (a * 2654435761) ^ (b * 1597334677);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createApp({ db, provider, secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // ---------- prepared statements ----------
  const q = {
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username, display_name FROM users WHERE id = ?'),
    partnerOf: db.prepare('SELECT id, username, display_name FROM users WHERE id != ? ORDER BY id LIMIT 1'),
    insertUser: db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(
      'SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    movie: db.prepare('SELECT * FROM movies WHERE id = ?'),
    upsertMovie: db.prepare(`
      INSERT INTO movies (id, title, year, overview, tagline, poster_url, backdrop_url, runtime, genres, director, writers, cast_json, trailer_key, rating, certification, fetched_at)
      VALUES ($id, $title, $year, $overview, $tagline, $poster_url, $backdrop_url, $runtime, $genres, $director, $writers, $cast_json, $trailer_key, $rating, $certification, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, year=excluded.year, overview=excluded.overview, tagline=excluded.tagline,
        poster_url=excluded.poster_url, backdrop_url=excluded.backdrop_url, runtime=excluded.runtime, genres=excluded.genres,
        director=excluded.director, writers=excluded.writers, cast_json=excluded.cast_json, trailer_key=excluded.trailer_key,
        rating=excluded.rating, certification=excluded.certification, fetched_at=excluded.fetched_at`),
    list: db.prepare('SELECT * FROM lists WHERE id = ?'),
    listsVisible: db.prepare(`
      SELECT l.*, (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) AS item_count,
             (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.watched = 1) AS watched_count
      FROM lists l ORDER BY CASE l.kind WHEN 'joint' THEN 0 ELSE 1 END, l.created_at`),
    insertList: db.prepare('INSERT INTO lists (name, kind, owner_id, created_by) VALUES (?, ?, ?, ?)'),
    renameList: db.prepare('UPDATE lists SET name = ? WHERE id = ?'),
    deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
    listItems: db.prepare(`
      SELECT i.*, u.display_name AS added_by_name FROM list_items i
      LEFT JOIN users u ON u.id = i.added_by WHERE i.list_id = ? ORDER BY i.watched, i.added_at DESC, i.id DESC`),
    item: db.prepare('SELECT * FROM list_items WHERE id = ? AND list_id = ?'),
    insertItem: db.prepare('INSERT INTO list_items (list_id, movie_id, added_by, note) VALUES (?, ?, ?, ?)'),
    itemByMovie: db.prepare('SELECT * FROM list_items WHERE list_id = ? AND movie_id = ?'),
    updateItem: db.prepare('UPDATE list_items SET watched = ?, note = ? WHERE id = ?'),
    deleteItem: db.prepare('DELETE FROM list_items WHERE id = ?'),
    markWatchedEverywhere: db.prepare('UPDATE list_items SET watched = ? WHERE movie_id = ?'),
    movieMemberships: db.prepare(`
      SELECT l.id, l.name, l.kind, l.owner_id, i.id AS item_id, i.watched FROM list_items i JOIN lists l ON l.id = i.list_id WHERE i.movie_id = ?`),
    recent: db.prepare(`
      SELECT i.*, l.name AS list_name, l.kind AS list_kind, u.display_name AS added_by_name FROM list_items i
      JOIN lists l ON l.id = i.list_id LEFT JOIN users u ON u.id = i.added_by
      ORDER BY i.added_at DESC, i.id DESC LIMIT 8`),
    // A user's "picks": movies on their personal lists, or that they added to a joint list.
    picks: db.prepare(`
      SELECT DISTINCT i.movie_id FROM list_items i JOIN lists l ON l.id = i.list_id
      WHERE (l.kind = 'personal' AND l.owner_id = $u) OR (l.kind = 'joint' AND i.added_by = $u)`),
    watchedMovies: db.prepare('SELECT DISTINCT movie_id FROM list_items WHERE watched = 1'),
    jointCount: db.prepare(`SELECT COUNT(DISTINCT i.movie_id) AS n FROM list_items i JOIN lists l ON l.id = i.list_id WHERE l.kind = 'joint'`),
    activeRound: db.prepare('SELECT * FROM match_rounds WHERE active = 1 ORDER BY id DESC LIMIT 1'),
    round: db.prepare('SELECT * FROM match_rounds WHERE id = ?'),
    endRounds: db.prepare('UPDATE match_rounds SET active = 0 WHERE active = 1'),
    insertRound: db.prepare('INSERT INTO match_rounds (started_by, filters) VALUES (?, ?)'),
    chooseRound: db.prepare('UPDATE match_rounds SET chosen_movie_id = ? WHERE id = ?'),
    roundSwipes: db.prepare('SELECT * FROM swipes WHERE round_id = ?'),
    upsertSwipe: db.prepare(`
      INSERT INTO swipes (round_id, user_id, movie_id, liked) VALUES (?, ?, ?, ?)
      ON CONFLICT(round_id, user_id, movie_id) DO UPDATE SET liked = excluded.liked, created_at = datetime('now')`),
    deleteSwipe: db.prepare('DELETE FROM swipes WHERE round_id = ? AND user_id = ? AND movie_id = ?'),
    poolItems: db.prepare(`SELECT i.movie_id, i.list_id, i.watched FROM list_items i`),
    listPreview: db.prepare(`
      SELECT m.id, m.title, m.year, m.poster_url FROM list_items i JOIN movies m ON m.id = i.movie_id
      WHERE i.list_id = ? ORDER BY i.watched, i.added_at DESC, i.id DESC LIMIT 3`),
  };

  // ---------- helpers ----------
  const userDto = (u) => u && { id: u.id, username: u.username, displayName: u.display_name };

  function movieDto(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      year: row.year,
      overview: row.overview,
      tagline: row.tagline,
      posterUrl: row.poster_url,
      backdropUrl: row.backdrop_url,
      runtime: row.runtime,
      genres: JSON.parse(row.genres || '[]'),
      director: row.director,
      writers: JSON.parse(row.writers || '[]'),
      cast: JSON.parse(row.cast_json || '[]'),
      trailerKey: row.trailer_key,
      rating: row.rating,
      certification: row.certification,
    };
  }

  /** Get movie details from cache, fetching from the provider when missing or stale. */
  async function loadMovie(id, { refresh = false } = {}) {
    id = Number(id);
    if (!Number.isInteger(id) || id <= 0) throw bad('Invalid movie id');
    const cached = q.movie.get(id);
    const stale = cached && Date.now() - Date.parse(cached.fetched_at + 'Z') > CACHE_DAYS * 864e5;
    if (cached && !stale && !refresh) return cached;
    try {
      const m = await provider.details(id);
      q.upsertMovie.run({
        $id: m.id,
        $title: m.title,
        $year: m.year ?? null,
        $overview: m.overview ?? null,
        $tagline: m.tagline ?? null,
        $poster_url: m.poster_url ?? null,
        $backdrop_url: m.backdrop_url ?? null,
        $runtime: m.runtime ?? null,
        $genres: JSON.stringify(m.genres || []),
        $director: m.director ?? null,
        $writers: JSON.stringify(m.writers || []),
        $cast_json: JSON.stringify(m.cast || []),
        $trailer_key: m.trailer_key ?? null,
        $rating: m.rating ?? null,
        $certification: m.certification ?? null,
      });
      return q.movie.get(m.id);
    } catch (err) {
      if (cached) return cached; // serve stale data if the provider is down
      throw err;
    }
  }

  function canWrite(list, user) {
    return list.kind === 'joint' || list.owner_id === user.id;
  }

  function listDto(l, user) {
    return {
      id: l.id,
      name: l.name,
      kind: l.kind,
      ownerId: l.owner_id,
      mine: l.kind === 'personal' && l.owner_id === user.id,
      canEdit: canWrite(l, user),
      itemCount: l.item_count ?? undefined,
      watchedCount: l.watched_count ?? undefined,
      createdAt: l.created_at,
      preview: q.listPreview.all(l.id).map((m) => ({ id: m.id, title: m.title, year: m.year, posterUrl: m.poster_url })),
    };
  }

  function getList(id, user, { write = false } = {}) {
    const l = q.list.get(Number(id));
    if (!l) throw new HttpError(404, 'List not found');
    if (write && !canWrite(l, user)) throw new HttpError(403, 'Only the owner can change a personal list');
    return l;
  }

  const picksOf = (userId) => new Set(q.picks.all({ $u: userId }).map((r) => r.movie_id));

  function ensureStarterLists(userId, displayName) {
    q.insertList.run(`${displayName}'s Watchlist`, 'personal', userId, userId);
    if (q.userCount.get().n === 1) q.insertList.run('Our Movie Night List', 'joint', null, userId);
  }

  // ---------- matching engine ----------
  function roundFilters(round) {
    const f = JSON.parse(round.filters || '{}');
    return {
      genres: Array.isArray(f.genres) ? f.genres : [],
      maxRuntime: Number(f.maxRuntime) || null,
      listIds: Array.isArray(f.listIds) ? f.listIds.map(Number) : [],
    };
  }

  /** Every unwatched movie on the chosen lists that passes the round's filters. */
  function roundPool(round) {
    const f = roundFilters(round);
    const watched = new Set(q.watchedMovies.all().map((r) => r.movie_id));
    const ids = new Set();
    for (const it of q.poolItems.all()) {
      if (f.listIds.length && !f.listIds.includes(it.list_id)) continue;
      if (!watched.has(it.movie_id)) ids.add(it.movie_id);
    }
    const movies = [];
    for (const id of ids) {
      const m = movieDto(q.movie.get(id));
      if (!m) continue;
      if (f.genres.length && !m.genres.some((g) => f.genres.includes(g))) continue;
      if (f.maxRuntime && m.runtime && m.runtime > f.maxRuntime) continue;
      movies.push(m);
    }
    return movies;
  }

  function roundState(round, user) {
    const partner = q.partnerOf.get(user.id);
    const pool = roundPool(round);
    const poolIds = new Set(pool.map((m) => m.id));
    const swipes = q.roundSwipes.all(round.id).filter((s) => poolIds.has(s.movie_id));
    const mine = new Map(), theirs = new Map();
    for (const s of swipes) (s.user_id === user.id ? mine : theirs).set(s.movie_id, !!s.liked);
    const byId = new Map(pool.map((m) => [m.id, m]));
    const matches = [], nearMisses = [];
    for (const m of pool) {
      const a = mine.get(m.id), b = theirs.get(m.id);
      if (a && b) matches.push(m);
      else if ((a && b === false) || (b && a === false)) nearMisses.push({ ...m, likedBy: a ? 'me' : 'partner' });
    }
    const chosen = round.chosen_movie_id ? movieDto(q.movie.get(round.chosen_movie_id)) : null;
    return {
      round: {
        id: round.id,
        active: !!round.active,
        startedAt: round.started_at,
        startedBy: round.started_by,
        filters: roundFilters(round),
      },
      partner: userDto(partner),
      poolSize: pool.length,
      mySwipes: mine.size,
      partnerSwipes: theirs.size,
      myDone: mine.size >= pool.length,
      partnerDone: !!partner && theirs.size >= pool.length,
      matches: matches.sort((x, y) => (y.rating || 0) - (x.rating || 0)),
      nearMisses: nearMisses.sort((x, y) => (y.rating || 0) - (x.rating || 0)),
      chosen,
      _byId: byId,
      _mine: mine,
      _theirs: theirs,
    };
  }

  const publicState = ({ _byId, _mine, _theirs, ...rest }) => rest;

  /**
   * Cross-reference both users' lists to order the deck:
   *  1. movies the partner already liked this round (fastest path to a match)
   *  2. movies on the partner's lists but not mine (weigh in on their ideas)
   *  3. movies both of us picked
   *  4. my own picks
   * Ties are shuffled with a per-round seed.
   */
  function deckFor(round, user) {
    const state = roundState(round, user);
    const partner = state.partner;
    const myPicks = picksOf(user.id);
    const theirPicks = partner ? picksOf(partner.id) : new Set();
    const cards = [];
    for (const m of state._byId.values()) {
      if (state._mine.has(m.id)) continue;
      const mineP = myPicks.has(m.id), theirsP = theirPicks.has(m.id);
      const source = mineP && theirsP ? 'both' : theirsP ? 'partner' : mineP ? 'me' : 'joint';
      const group = state._theirs.get(m.id) === true ? 0 : { partner: 1, joint: 2, both: 3, me: 4 }[source];
      cards.push({ movie: m, source, group, tie: mix(m.id, round.id) });
    }
    cards.sort((a, b) => a.group - b.group || a.tie - b.tie);
    return { state, cards: cards.map(({ movie, source }) => ({ ...movie, source })) };
  }

  // ---------- middleware ----------
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function setSessionCookie(res, token, maxAgeSec) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (secureCookies) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    q.insertSession.run(token, userId, Date.now() + SESSION_DAYS * 864e5);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
  }

  app.use((req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.user = token ? q.sessionUser.get(token, Date.now()) || null : null;
    req.sessionToken = token;
    next();
  });

  const auth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in')));

  // ---------- auth routes ----------
  app.get('/api/status', (req, res) => {
    const n = q.userCount.get().n;
    res.json({
      userCount: n,
      maxUsers: MAX_USERS,
      registrationOpen: n < MAX_USERS,
      mode: provider.mode,
      user: userDto(req.user),
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const username = String(req.body?.username || '').trim();
    const displayName = String(req.body?.displayName || '').trim() || username;
    const password = String(req.body?.password || '');
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) throw bad('Username must be 2–32 letters, numbers, dots, dashes or underscores');
    if (displayName.length > 40) throw bad('Display name is too long');
    if (password.length < 6) throw bad('Password must be at least 6 characters');
    const user = tx(db, () => {
      if (q.userCount.get().n >= MAX_USERS) throw new HttpError(403, 'MovieMatch is for two people and both accounts already exist');
      if (q.userByName.get(username)) throw new HttpError(409, 'That username is taken');
      const { lastInsertRowid } = q.insertUser.run(username, displayName, hashPassword(password));
      const id = Number(lastInsertRowid);
      ensureStarterLists(id, displayName);
      return q.userById.get(id);
    });
    startSession(res, user.id);
    res.status(201).json({ user: userDto(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const u = q.userByName.get(String(req.body?.username || '').trim());
    if (!u || !verifyPassword(String(req.body?.password || ''), u.password_hash)) {
      throw new HttpError(401, 'Wrong username or password');
    }
    q.purgeSessions.run(Date.now());
    startSession(res, u.id);
    res.json({ user: userDto(u) });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionToken) q.deleteSession.run(req.sessionToken);
    setSessionCookie(res, '', 0);
    res.json({ ok: true });
  });

  // ---------- movies ----------
  app.get('/api/movies/search', auth, wrap(async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    res.json({ results: await provider.search(query) });
  }));

  app.get('/api/movies/:id', auth, wrap(async (req, res) => {
    const row = await loadMovie(req.params.id, { refresh: req.query.refresh === '1' });
    const lists = q.movieMemberships.all(row.id).map((l) => ({
      id: l.id, name: l.name, kind: l.kind, ownerId: l.owner_id, itemId: l.item_id, watched: !!l.watched,
    }));
    res.json({ movie: movieDto(row), lists });
  }));

  /** Genres present across everything on any list (for match-round filters). */
  app.get('/api/genres', auth, (_req, res) => {
    const set = new Set();
    for (const { movie_id } of q.poolItems.all()) {
      for (const g of movieDto(q.movie.get(movie_id))?.genres || []) set.add(g);
    }
    res.json({ genres: [...set].sort() });
  });

  app.post('/api/movies/:id/watched', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!q.movie.get(id)) throw new HttpError(404, 'Movie not found');
    q.markWatchedEverywhere.run(req.body?.watched === false ? 0 : 1, id);
    res.json({ ok: true });
  });

  // ---------- lists ----------
  app.get('/api/lists', auth, (req, res) => {
    res.json({ lists: q.listsVisible.all().map((l) => listDto(l, req.user)) });
  });

  app.post('/api/lists', auth, (req, res) => {
    const name = String(req.body?.name || '').trim();
    const kind = req.body?.kind === 'joint' ? 'joint' : 'personal';
    if (!name || name.length > 60) throw bad('List name must be 1–60 characters');
    const { lastInsertRowid } = q.insertList.run(name, kind, kind === 'personal' ? req.user.id : null, req.user.id);
    res.status(201).json({ list: listDto(q.list.get(Number(lastInsertRowid)), req.user) });
  });

  app.get('/api/lists/:id', auth, (req, res) => {
    const l = getList(req.params.id, req.user);
    const items = q.listItems.all(l.id).map((i) => ({
      id: i.id,
      addedBy: i.added_by,
      addedByName: i.added_by_name,
      addedAt: i.added_at,
      watched: !!i.watched,
      note: i.note,
      movie: movieDto(q.movie.get(i.movie_id)),
    }));
    const owner = l.owner_id ? userDto(q.userById.get(l.owner_id)) : null;
    res.json({ list: { ...listDto(l, req.user), owner }, items });
  });

  app.patch('/api/lists/:id', auth, (req, res) => {
    const l = getList(req.params.id, req.user, { write: true });
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 60) throw bad('List name must be 1–60 characters');
    q.renameList.run(name, l.id);
    res.json({ list: listDto(q.list.get(l.id), req.user) });
  });

  app.delete('/api/lists/:id', auth, (req, res) => {
    const l = getList(req.params.id, req.user, { write: true });
    q.deleteList.run(l.id);
    res.json({ ok: true });
  });

  /**
   * Add a movie. Accepts {tmdbId} (picked from search results) or just
   * {title} — in which case the best search hit is used.
   */
  app.post('/api/lists/:id/items', auth, wrap(async (req, res) => {
    const l = getList(req.params.id, req.user, { write: true });
    let id = Number(req.body?.tmdbId);
    if (!id) {
      const title = String(req.body?.title || '').trim();
      if (!title) throw bad('Provide a movie title or tmdbId');
      const hits = await provider.search(title);
      if (!hits.length) throw new HttpError(404, `No movie found for “${title}”`);
      id = hits[0].id;
    }
    const movie = await loadMovie(id);
    if (q.itemByMovie.get(l.id, movie.id)) throw new HttpError(409, `${movie.title} is already on this list`);
    const note = req.body?.note ? String(req.body.note).slice(0, 280) : null;
    const { lastInsertRowid } = q.insertItem.run(l.id, movie.id, req.user.id, note);
    res.status(201).json({ item: { id: Number(lastInsertRowid), watched: false, note, movie: movieDto(movie) } });
  }));

  app.patch('/api/lists/:id/items/:itemId', auth, (req, res) => {
    const l = getList(req.params.id, req.user, { write: true });
    const item = q.item.get(Number(req.params.itemId), l.id);
    if (!item) throw new HttpError(404, 'Item not found');
    const watched = req.body?.watched === undefined ? item.watched : req.body.watched ? 1 : 0;
    const note = req.body?.note === undefined ? item.note : String(req.body.note || '').slice(0, 280) || null;
    q.updateItem.run(watched, note, item.id);
    res.json({ ok: true });
  });

  app.delete('/api/lists/:id/items/:itemId', auth, (req, res) => {
    const l = getList(req.params.id, req.user, { write: true });
    const item = q.item.get(Number(req.params.itemId), l.id);
    if (!item) throw new HttpError(404, 'Item not found');
    q.deleteItem.run(item.id);
    res.json({ ok: true });
  });

  // ---------- dashboard ----------
  app.get('/api/dashboard', auth, (req, res) => {
    const me = req.user;
    const partner = q.partnerOf.get(me.id);
    const myPicks = picksOf(me.id);
    const theirPicks = partner ? picksOf(partner.id) : new Set();
    const watched = new Set(q.watchedMovies.all().map((r) => r.movie_id));
    const overlap = [...myPicks]
      .filter((id) => theirPicks.has(id) && !watched.has(id))
      .map((id) => movieDto(q.movie.get(id)))
      .filter(Boolean);
    // Genres across both users' picks, for taste comparison
    const genreCounts = (ids) => {
      const counts = {};
      for (const id of ids) for (const g of movieDto(q.movie.get(id))?.genres || []) counts[g] = (counts[g] || 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count }));
    };
    const active = q.activeRound.get();
    const round = active ? publicState(roundState(active, me)) : null;
    const lists = q.listsVisible.all().map((l) => listDto(l, me));
    res.json({
      me: userDto(me),
      partner: userDto(partner),
      mode: provider.mode,
      stats: {
        myPicks: myPicks.size,
        partnerPicks: theirPicks.size,
        joint: q.jointCount.get().n,
        watched: watched.size,
        overlap: overlap.length,
      },
      lists,
      recent: q.recent.all().map((i) => ({
        id: i.id,
        listId: i.list_id,
        listName: i.list_name,
        listKind: i.list_kind,
        addedBy: i.added_by,
        addedByName: i.added_by_name,
        addedAt: i.added_at,
        movie: movieDto(q.movie.get(i.movie_id)),
      })),
      overlap,
      tastes: { me: genreCounts(myPicks), partner: genreCounts(theirPicks) },
      round,
    });
  });

  // ---------- matching ----------
  app.get('/api/match', auth, (req, res) => {
    const active = q.activeRound.get();
    res.json({ state: active ? publicState(roundState(active, req.user)) : null });
  });

  app.post('/api/match/rounds', auth, (req, res) => {
    const genres = Array.isArray(req.body?.genres) ? req.body.genres.map(String).slice(0, 20) : [];
    const maxRuntime = Number(req.body?.maxRuntime) || null;
    const listIds = Array.isArray(req.body?.listIds) ? req.body.listIds.map(Number).filter(Boolean) : [];
    const round = tx(db, () => {
      q.endRounds.run();
      const { lastInsertRowid } = q.insertRound.run(req.user.id, JSON.stringify({ genres, maxRuntime, listIds }));
      return q.round.get(Number(lastInsertRowid));
    });
    res.status(201).json({ state: publicState(roundState(round, req.user)) });
  });

  function activeRoundOr404() {
    const r = q.activeRound.get();
    if (!r) throw new HttpError(404, 'No active match round — start one first');
    return r;
  }

  app.get('/api/match/deck', auth, (req, res) => {
    const { state, cards } = deckFor(activeRoundOr404(), req.user);
    res.json({ state: publicState(state), cards: cards.slice(0, Number(req.query.limit) || 20) });
  });

  app.post('/api/match/swipe', auth, (req, res) => {
    const round = activeRoundOr404();
    const movieId = Number(req.body?.movieId);
    const pool = new Set(roundPool(round).map((m) => m.id));
    if (!pool.has(movieId)) throw bad('That movie is not in this round');
    const liked = !!req.body?.liked;
    q.upsertSwipe.run(round.id, req.user.id, movieId, liked ? 1 : 0);
    const state = roundState(round, req.user);
    const matched = liked && state._theirs.get(movieId) === true;
    res.json({ matched, movie: matched ? state._byId.get(movieId) : null, state: publicState(state) });
  });

  app.post('/api/match/undo', auth, (req, res) => {
    const round = activeRoundOr404();
    q.deleteSwipe.run(round.id, req.user.id, Number(req.body?.movieId));
    res.json({ state: publicState(roundState(round, req.user)) });
  });

  app.post('/api/match/choose', auth, (req, res) => {
    const round = activeRoundOr404();
    const movieId = req.body?.movieId == null ? null : Number(req.body.movieId);
    if (movieId && !q.movie.get(movieId)) throw new HttpError(404, 'Movie not found');
    q.chooseRound.run(movieId, round.id);
    res.json({ state: publicState(roundState(q.round.get(round.id), req.user)) });
  });

  app.post('/api/match/end', auth, (req, res) => {
    q.endRounds.run();
    res.json({ ok: true });
  });

  // ---------- static frontend ----------
  app.use(express.static(PUBLIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // ---------- errors ----------
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !err.status ? 'Something went wrong' : err.message });
  });

  return app;
}
