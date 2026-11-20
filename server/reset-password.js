// Reset a forgotten password from the server:
//   npm run reset-password -- <username>
// Prints a one-time temporary password. The person signs in with it and must
// choose a new password straight away. Their other sessions are signed out.
import fs from 'node:fs';
import { openDb } from './db.js';
import { resetToTemporary } from './passwords.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || './data/moviematch.db');
const user = db.prepare('SELECT id, username, display_name FROM users WHERE username = ?').get(username);
if (!user) {
  const names = db.prepare('SELECT username FROM users ORDER BY id').all().map((u) => u.username);
  console.error(`No account called "${username}". Accounts: ${names.join(', ') || 'none yet'}`);
  process.exit(1);
}

const temp = resetToTemporary(db, user.id);
console.log(`Temporary password for ${user.display_name} (${user.username}): ${temp}`);
console.log('They sign in with it and will be asked to choose a new password.');
