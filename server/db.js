import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    -- Cached movie details pulled from TMDB (or the demo catalog)
    CREATE TABLE IF NOT EXISTS movies (
      id           INTEGER PRIMARY KEY,   -- TMDB id
      title        TEXT NOT NULL,
      year         INTEGER,
      overview     TEXT,
      tagline      TEXT,
      poster_url   TEXT,
      backdrop_url TEXT,
      runtime      INTEGER,
      genres       TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
      director     TEXT,
      writers      TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
      cast_json    TEXT NOT NULL DEFAULT '[]',  -- JSON array of {name, character, photo}
      trailer_key  TEXT,                        -- YouTube video key
      rating       REAL,
      certification TEXT,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- kind = 'personal' (owner_id set) or 'joint' (owner_id NULL, shared by both users)
    CREATE TABLE IF NOT EXISTS lists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('personal','joint')),
      owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id   INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      movie_id  INTEGER NOT NULL REFERENCES movies(id),
      added_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      added_at  TEXT NOT NULL DEFAULT (datetime('now')),
      watched   INTEGER NOT NULL DEFAULT 0,
      note      TEXT,
      UNIQUE (list_id, movie_id)
    );

    -- A match round: both users swipe the same deck; a "match" is a movie both liked.
    CREATE TABLE IF NOT EXISTS match_rounds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      active      INTEGER NOT NULL DEFAULT 1,
      filters     TEXT NOT NULL DEFAULT '{}',   -- JSON {genres:[], maxRuntime:n, listIds:[]}
      chosen_movie_id INTEGER REFERENCES movies(id)
    );

    CREATE TABLE IF NOT EXISTS swipes (
      round_id   INTEGER NOT NULL REFERENCES match_rounds(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id   INTEGER NOT NULL REFERENCES movies(id),
      liked      INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (round_id, user_id, movie_id)
    );

    -- Small shared key/value state (e.g. tonight's pick)
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_movie ON list_items(movie_id);
    CREATE INDEX IF NOT EXISTS idx_swipes_movie ON swipes(round_id, movie_id);
  `);
  // Migrations for databases created by earlier versions
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('must_change_password')) {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
