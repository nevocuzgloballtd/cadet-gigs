import { sql, hashPassword, startSession, fail } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
    if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');

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
