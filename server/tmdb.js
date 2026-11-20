import { DEMO_MOVIES } from './demo-catalog.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

/**
 * Movie data provider. Talks to TMDB when a key is configured, otherwise
 * serves the built-in demo catalog. Every provider returns the same shape:
 *   search(q)   -> [{ id, title, year, posterUrl, overview }]
 *   details(id) -> normalized movie row (see normalize())
 */
export function createProvider({ apiKey, readToken, demo, fetchImpl = fetch } = {}) {
  if (demo || (!apiKey && !readToken)) return demoProvider();

  async function call(pathname, params = {}) {
    const url = new URL(API + pathname);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { accept: 'application/json' };
    if (readToken) headers.authorization = `Bearer ${readToken}`;
    else url.searchParams.set('api_key', apiKey);
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      const err = new Error(`TMDB request failed (${res.status})`);
      err.status = res.status === 404 ? 404 : 502;
      throw err;
    }
    return res.json();
  }

  return {
    mode: 'tmdb',
    async search(query) {
      const data = await call('/search/movie', { query, include_adult: 'false', language: 'en-US', page: '1' });
      return (data.results || []).slice(0, 10).map((r) => ({
        id: r.id,
        title: r.title,
        year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
        posterUrl: r.poster_path ? `${IMG}/w185${r.poster_path}` : null,
        overview: r.overview,
      }));
    },
    async details(id) {
      const d = await call(`/movie/${Number(id)}`, {
        append_to_response: 'credits,videos,release_dates',
        language: 'en-US',
      });
      return normalize(d);
    },
  };
}

export function normalize(d) {
  const crew = d.credits?.crew || [];
  const directors = crew.filter((p) => p.job === 'Director').map((p) => p.name);
  const writers = [...new Set(crew.filter((p) => p.department === 'Writing').map((p) => p.name))].slice(0, 4);
  const cast = (d.credits?.cast || []).slice(0, 12).map((p) => ({
    name: p.name,
    character: p.character,
    photo: p.profile_path ? `${IMG}/w185${p.profile_path}` : null,
  }));
  const usRelease = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
  const certification = usRelease?.release_dates?.map((r) => r.certification).find(Boolean) || null;
  return {
    id: d.id,
    title: d.title,
    year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    overview: d.overview || null,
    tagline: d.tagline || null,
    poster_url: d.poster_path ? `${IMG}/w500${d.poster_path}` : null,
    backdrop_url: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    runtime: d.runtime || null,
    genres: (d.genres || []).map((g) => g.name),
    director: directors.join(', ') || null,
    writers,
    cast,
    trailer_key: pickTrailer(d.videos?.results || []),
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    certification,
  };
}

/** Prefer official YouTube trailers, then any trailer, then teasers. */
export function pickTrailer(videos) {
  const yt = videos.filter((v) => v.site === 'YouTube');
  const score = (v) =>
    (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) + (v.official ? 1 : 0);
  const best = yt.filter((v) => score(v) >= 2).sort((a, b) => score(b) - score(a))[0];
  return best ? best.key : null;
}

function demoProvider() {
  const byId = new Map(DEMO_MOVIES.map((m) => [m.id, m]));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '');
  return {
    mode: 'demo',
    async search(query) {
      const q = norm(query).trim();
      const words = q.split(/\s+/).filter(Boolean);
      return DEMO_MOVIES.filter((m) => {
        const t = norm(m.title);
        return words.every((w) => t.includes(w));
      })
        .slice(0, 10)
        .map((m) => ({ id: m.id, title: m.title, year: m.year, posterUrl: null, overview: m.overview }));
    },
    async details(id) {
      const m = byId.get(Number(id));
      if (!m) {
        const err = new Error('Movie not found');
        err.status = 404;
        throw err;
      }
      return { ...m, cast: m.cast };
    },
    /** Demo-only helper: full catalog for the "browse" hint. */
    catalog: () => DEMO_MOVIES.map((m) => m.title),
  };
}
