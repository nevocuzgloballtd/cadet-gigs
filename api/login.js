import { sql, checkPassword, startSession, fail } from '../lib/db.js';

function clientIp(req) {
  const h = String(req.headers['x-forwarded-for'] || '');
  return h.split(',')[0].trim().slice(0, 64) || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  try {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    const password = String(req.body?.password || '');
    const ip = clientIp(req);

    // Too many wrong tries? Stop for 15 minutes.
    const recent = await sql`
      select
        (count(*) filter (where email = ${email}))::int as by_email,
        (count(*) filter (where ip = ${ip}))::int as by_ip
      from login_attempts
      where kind = 'login' and created_at > now() - interval '15 minutes'`;
    if (recent[0].by_email >= 5 || recent[0].by_ip >= 20) {
      return fail(res, 429, 'Too many wrong tries. Wait 15 minutes and try again.');
    }

    const rows = await sql`select id, password_hash from users where email = ${email}`;
    const ok = rows.length && (await checkPassword(password, rows[0].password_hash));
    if (!ok) {
      await sql`insert into login_attempts (email, ip, kind) values (${email}, ${ip}, 'login')`;
      return fail(res, 401, 'Wrong email or password.');
    }

    await sql`delete from login_attempts where kind = 'login' and email = ${email}`;
    await startSession(res, rows[0].id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
