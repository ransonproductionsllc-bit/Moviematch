import crypto from 'node:crypto';

export const MIN_PASSWORD = 6;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const WORDS = ['popcorn', 'matinee', 'marquee', 'reel', 'encore', 'premiere', 'cameo', 'sequel', 'trailer', 'credits', 'velvet', 'balcony'];

/** Easy-to-read one-time password, e.g. "marquee-encore-4821". The holder must change it at next sign-in. */
export function temporaryPassword() {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 10000)}`;
}

/**
 * Reset a user's password to a temporary one: they must choose a new password
 * at next sign-in, and every existing session for them is signed out.
 */
export function resetToTemporary(db, userId) {
  const temp = temporaryPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(temp), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return temp;
}
