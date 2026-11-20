import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createProvider, pickTrailer, normalize } from '../server/tmdb.js';
import { createApp } from '../server/app.js';

let server, base;

before(async () => {
  const app = createApp({ db: openDb(':memory:'), provider: createProvider({ demo: true }) });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Tiny cookie-keeping client, one per user. */
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

const alex = client();
const sam = client();
const intruder = client();
const ids = {};

test('only two accounts can be created', async () => {
  assert.equal((await alex('/api/dashboard')).status, 401);
  let r = await alex('/api/auth/register', { method: 'POST', body: { username: 'alex', displayName: 'Alex', password: 'secret1' } });
  assert.equal(r.status, 201);
  r = await sam('/api/auth/register', { method: 'POST', body: { username: 'sam', displayName: 'Sam', password: 'secret2' } });
  assert.equal(r.status, 201);
  r = await intruder('/api/auth/register', { method: 'POST', body: { username: 'third', password: 'secret3' } });
  assert.equal(r.status, 403);
  r = await intruder('/api/auth/login', { method: 'POST', body: { username: 'alex', password: 'wrong!' } });
  assert.equal(r.status, 401);
});

test('starter lists: one personal each plus one shared joint list', async () => {
  const { body } = await alex('/api/lists');
  assert.equal(body.lists.filter((l) => l.kind === 'joint').length, 1);
  const mine = body.lists.find((l) => l.mine);
  const theirs = body.lists.find((l) => l.kind === 'personal' && !l.mine);
  assert.ok(mine.canEdit);
  assert.equal(theirs.canEdit, false);
  ids.alexList = mine.id;
  ids.samList = theirs.id;
  ids.joint = body.lists.find((l) => l.kind === 'joint').id;
});

test('adding by name pulls title, credits and trailer', async () => {
  const r = await alex(`/api/lists/${ids.alexList}/items`, { method: 'POST', body: { title: 'inception' } });
  assert.equal(r.status, 201);
  const m = r.body.item.movie;
  assert.equal(m.title, 'Inception');
  assert.equal(m.director, 'Christopher Nolan');
  assert.ok(m.cast.some((p) => p.name === 'Leonardo DiCaprio'));
  assert.ok(m.trailerKey);
  assert.equal((await alex(`/api/lists/${ids.alexList}/items`, { method: 'POST', body: { title: 'Inception' } })).status, 409);
  assert.equal((await alex(`/api/lists/${ids.alexList}/items`, { method: 'POST', body: { title: 'zzzz no such film' } })).status, 404);
});

test("a user cannot edit the partner's personal list, but can edit joint lists", async () => {
  assert.equal((await alex(`/api/lists/${ids.samList}/items`, { method: 'POST', body: { title: 'Dune' } })).status, 403);
  assert.equal((await alex(`/api/lists/${ids.joint}/items`, { method: 'POST', body: { title: 'Arrival' } })).status, 201);
  // ...but can read it
  assert.equal((await alex(`/api/lists/${ids.samList}`)).status, 200);
});

test('search returns candidates', async () => {
  const { body } = await alex('/api/movies/search?q=dark');
  assert.ok(body.results.some((r) => r.title === 'The Dark Knight'));
});

test('dashboard cross-references both users’ lists', async () => {
  for (const t of ['Parasite', 'Knives Out', 'La La Land']) await alex(`/api/lists/${ids.alexList}/items`, { method: 'POST', body: { title: t } });
  for (const t of ['Parasite', 'Dune', 'Get Out', 'Superbad']) await sam(`/api/lists/${ids.samList}/items`, { method: 'POST', body: { title: t } });
  const { body } = await alex('/api/dashboard');
  assert.equal(body.partner.displayName, 'Sam');
  assert.deepEqual(body.overlap.map((m) => m.title), ['Parasite']);
  assert.equal(body.stats.myPicks, 5); // 4 personal + Arrival added to the joint list
  assert.equal(body.stats.partnerPicks, 4);
});

test('match round: partner picks come first, mutual likes match', async () => {
  let r = await alex('/api/match/rounds', { method: 'POST', body: {} });
  assert.equal(r.status, 201);
  assert.equal(r.body.state.poolSize, 8);

  const deckA = (await alex('/api/match/deck')).body.cards;
  assert.equal(deckA.length, 8);
  // Sam-only picks lead Alex's deck
  assert.deepEqual(new Set(deckA.slice(0, 3).map((c) => c.title)), new Set(['Dune', 'Get Out', 'Superbad']));
  assert.ok(deckA.slice(0, 3).every((c) => c.source === 'partner'));

  const id = (title) => deckA.find((c) => c.title === title).id;
  // Sam likes Dune first; it should jump to the top of Alex's remaining deck.
  r = await sam('/api/match/swipe', { method: 'POST', body: { movieId: id('Knives Out'), liked: true } });
  assert.equal(r.body.matched, false);
  const deckA2 = (await alex('/api/match/deck')).body.cards;
  assert.equal(deckA2[0].title, 'Knives Out');

  r = await alex('/api/match/swipe', { method: 'POST', body: { movieId: id('Knives Out'), liked: true } });
  assert.equal(r.body.matched, true);
  assert.equal(r.body.movie.title, 'Knives Out');

  await alex('/api/match/swipe', { method: 'POST', body: { movieId: id('Dune'), liked: true } });
  await sam('/api/match/swipe', { method: 'POST', body: { movieId: id('Dune'), liked: false } });

  const { body } = await sam('/api/match');
  assert.deepEqual(body.state.matches.map((m) => m.title), ['Knives Out']);
  assert.deepEqual(body.state.nearMisses.map((m) => [m.title, m.likedBy]), [['Dune', 'partner']]);

  // swiping a movie outside the round is rejected
  assert.equal((await alex('/api/match/swipe', { method: 'POST', body: { movieId: 1, liked: true } })).status, 400);

  // undo puts the card back in the deck
  await alex('/api/match/undo', { method: 'POST', body: { movieId: id('Dune') } });
  assert.ok((await alex('/api/match/deck')).body.cards.some((c) => c.title === 'Dune'));

  r = await sam('/api/match/choose', { method: 'POST', body: { movieId: id('Knives Out') } });
  assert.equal(r.body.state.chosen.title, 'Knives Out');
});

test('round filters and watched movies narrow the pool', async () => {
  let r = await alex('/api/match/rounds', { method: 'POST', body: { genres: ['Horror'] } });
  assert.deepEqual((await alex('/api/match/deck')).body.cards.map((c) => c.title), ['Get Out']);

  r = await alex('/api/match/rounds', { method: 'POST', body: { maxRuntime: 120 } });
  const titles = (await alex('/api/match/deck')).body.cards.map((c) => c.title);
  assert.ok(titles.includes('Get Out') && !titles.includes('Dune'));

  const dune = (await alex('/api/movies/search?q=dune')).body.results[0];
  await alex(`/api/movies/${dune.id}/watched`, { method: 'POST', body: { watched: true } });
  r = await alex('/api/match/rounds', { method: 'POST', body: {} });
  assert.equal(r.body.state.poolSize, 7);
});

test('home marquee: joint list shelf first, tonight’s pick set and cleared', async () => {
  let { body } = await sam('/api/dashboard');
  assert.equal(body.tonight?.movie.title, 'Knives Out', 'choosing a match sets tonight’s pick');
  await sam('/api/tonight', { method: 'POST', body: { movieId: null } });
  ({ body } = await sam('/api/dashboard'));
  const firstList = body.shelves.find((s) => s.key.startsWith('list-'));
  assert.ok(firstList && firstList.movies.some((m) => m.title === 'Arrival'), 'joint list shelf present');
  assert.ok(body.shelves.findIndex((s) => s.key.startsWith('list-')) < body.shelves.findIndex((s) => s.key === 'mine'));
  assert.ok(body.feature?.movie, 'a featured movie is offered');

  const pick = body.feature.movie;
  let r = await sam('/api/tonight', { method: 'POST', body: { movieId: pick.id } });
  assert.equal(r.body.tonight.movie.id, pick.id);
  ({ body } = await alex('/api/dashboard'));
  assert.equal(body.tonight.movie.id, pick.id);
  assert.equal(body.tonight.setBy.displayName, 'Sam');
  assert.equal(body.feature, null);

  await alex(`/api/movies/${pick.id}/watched`, { method: 'POST', body: { watched: true } });
  ({ body } = await alex('/api/dashboard'));
  assert.equal(body.tonight, null, 'watching it clears tonight’s pick');
  await alex(`/api/movies/${pick.id}/watched`, { method: 'POST', body: { watched: false } });
  assert.equal((await alex('/api/tonight', { method: 'POST', body: { movieId: 999999 } })).status, 404);
});

test('TMDB failures never leak the API key', async () => {
  const secret = 'not-a-real-key-123';
  const offline = createProvider({ apiKey: secret, fetchImpl: async (url) => { throw new Error(`fetch failed ${url}`); } });
  await assert.rejects(offline.search('x'), (err) => err.status === 502 && !err.message.includes(secret));
  const denied = createProvider({ apiKey: secret, fetchImpl: async () => new Response('{}', { status: 401 }) });
  await assert.rejects(denied.details(1), (err) => err.status === 502 && !err.message.includes(secret));
});

test('tmdb helpers pick the official trailer and normalize credits', () => {
  assert.equal(
    pickTrailer([
      { site: 'YouTube', type: 'Featurette', key: 'f' },
      { site: 'YouTube', type: 'Teaser', key: 't', official: true },
      { site: 'Vimeo', type: 'Trailer', key: 'v' },
      { site: 'YouTube', type: 'Trailer', key: 'x', official: false },
      { site: 'YouTube', type: 'Trailer', key: 'best', official: true },
    ]),
    'best'
  );
  const m = normalize({
    id: 1, title: 'X', release_date: '2020-05-01', runtime: 100, vote_average: 7.26, poster_path: '/p.jpg',
    genres: [{ name: 'Drama' }],
    credits: { cast: [{ name: 'A', character: 'B', profile_path: null }], crew: [{ job: 'Director', department: 'Directing', name: 'D' }, { job: 'Screenplay', department: 'Writing', name: 'W' }] },
    videos: { results: [] },
    release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'PG' }] }] },
  });
  assert.equal(m.year, 2020);
  assert.equal(m.director, 'D');
  assert.deepEqual(m.writers, ['W']);
  assert.equal(m.rating, 7.3);
  assert.equal(m.certification, 'PG');
  assert.equal(m.poster_url, 'https://image.tmdb.org/t/p/w500/p.jpg');
});

test('forgotten password: partner reset, forced change, then normal sign-in', async () => {
  // errors point at the field they belong to
  const badName = await intruder('/api/auth/register', { method: 'POST', body: { username: 'x', password: 'secret3' } });
  assert.equal(badName.status, 400);
  assert.equal(badName.body.field, 'username');
  const short = await alex('/api/auth/password', { method: 'POST', body: { currentPassword: 'secret1', newPassword: '123' } });
  assert.equal(short.body.field, 'newPassword');
  const wrong = await alex('/api/auth/password', { method: 'POST', body: { currentPassword: 'nope!!', newPassword: 'another1' } });
  assert.equal(wrong.body.field, 'currentPassword');

  // Sam resets Alex's password; Alex's old session is signed out
  const r = await sam('/api/partner/reset-password', { method: 'POST' });
  assert.equal(r.status, 200);
  const temp = r.body.temporaryPassword;
  assert.match(temp, /^[a-z]+-[a-z]+-\d{4}$/);
  assert.equal((await alex('/api/dashboard')).status, 401);

  // Signing in with the temporary password only allows choosing a new one
  const login = await alex('/api/auth/login', { method: 'POST', body: { username: 'alex', password: temp } });
  assert.equal(login.body.user.mustChangePassword, true);
  assert.equal((await alex('/api/dashboard')).status, 403);
  const changed = await alex('/api/auth/password', { method: 'POST', body: { newPassword: 'brand-new1' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.mustChangePassword, undefined);
  assert.equal((await alex('/api/dashboard')).status, 200);

  // The new password works; the temporary one no longer does
  assert.equal((await intruder('/api/auth/login', { method: 'POST', body: { username: 'alex', password: temp } })).status, 401);
  assert.equal((await intruder('/api/auth/login', { method: 'POST', body: { username: 'alex', password: 'brand-new1' } })).status, 200);
});
