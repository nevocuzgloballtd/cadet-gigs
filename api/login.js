import { sql, checkPassword, startSession, fail } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const rows = await sql`select id, password_hash from users where email = ${email}`;
    const ok = rows.length && (await checkPassword(password, rows[0].password_hash));
    if (!ok) return fail(res, 401, 'Wrong email or password.');

    await startSession(res, rows[0].id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
