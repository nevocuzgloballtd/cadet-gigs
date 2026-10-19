import { sql, hashPassword, startSession, fail } from '../lib/db.js';

function clientIp(req) {
  const h = String(req.headers['x-forwarded-for'] || '');
  return h.split(',')[0].trim().slice(0, 64) || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const ip = clientIp(req);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
    if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
    if (password.length > 200) return fail(res, 400, 'That password is too long.');

    const recent = await sql`
      select count(*)::int as n from login_attempts
      where kind = 'signup' and ip = ${ip} and created_at > now() - interval '1 hour'`;
    if (recent[0].n >= 10) return fail(res, 429, 'Too many signups from this connection. Try again later.');
    await sql`insert into login_attempts (email, ip, kind) values (${email}, ${ip}, 'signup')`;

    const hash = await hashPassword(password);
    const rows = await sql`
      insert into users (email, password_hash) values (${email}, ${hash})
      on conflict (email) do nothing
      returning id`;
    if (!rows.length) return fail(res, 409, 'This email already has an account. Log in instead.');

    await startSession(res, rows[0].id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
