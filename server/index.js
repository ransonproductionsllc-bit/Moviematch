import fs from 'node:fs';
import { openDb } from './db.js';
import { createProvider } from './tmdb.js';
import { createApp } from './app.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const db = openDb(env.DB_PATH || './data/moviematch.db');
const provider = createProvider({
  apiKey: env.TMDB_API_KEY,
  readToken: env.TMDB_READ_TOKEN,
  demo: env.DEMO_MODE === '1',
});
const app = createApp({ db, provider, secureCookies: env.SECURE_COOKIES === '1' });

const port = Number(env.PORT) || 3000;
app.listen(port, () => {
  console.log(`MovieMatch running at http://localhost:${port}`);
  if (provider.mode === 'demo') {
    console.log('No TMDB key found — using the built-in demo catalog. Add TMDB_API_KEY to .env for real movie data.');
  }
});
