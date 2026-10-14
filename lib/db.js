import { neon } from '@neondatabase/serverless';
import { randomBytes, createHash, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
export const sql = neon(process.env.DATABASE_URL);

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const sha = (t) => createHash('sha256').update(t).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === key.length && timingSafeEqual(known, key);
}

export async function startSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await sql`insert into sessions (token_hash, user_id, expires_at)
            values (${sha(token)}, ${userId}, now() + interval '30 days')`;
  res.setHeader(
    'Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`
  );
}

function readToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export async function getUser(req) {
  const token = readToken(req);
  if (!token) return null;
  const rows = await sql`
    select u.id, u.email, u.full_name, u.phone, u.area,
           u.is_customer, u.is_cadet, u.is_admin, u.consented_at
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha(token)} and s.expires_at > now()`;
  return rows[0] || null;
}

export async function endSession(req, res) {
  const token = readToken(req);
  if (token) await sql`delete from sessions where token_hash = ${sha(token)}`;
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}

export function fail(res, status, message) {
  return res.status(status).json({ error: message });
}
