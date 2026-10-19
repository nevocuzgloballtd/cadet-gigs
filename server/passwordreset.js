import { randomInt, createHash } from 'node:crypto';
import { sql, getUser, hashPassword, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1, so the code is easy to read out
const sha = (t) => createHash('sha256').update(t).digest('hex');

function clientIp(req) {
  const h = String(req.headers['x-forwarded-for'] || '');
  return h.split(',')[0].trim().slice(0, 64) || 'unknown';
}

function newCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');

    // ---- Anyone (not logged in): use a code to set a new password ----
    if (req.method === 'POST' && req.body?.action === 'use') {
      const b = req.body;
      const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      const password = String(b.password || '');
      const ip = clientIp(req);

      if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      if (password.length > 200) return fail(res, 400, 'That password is too long.');

      const recent = await sql`
        select count(*)::int as n from login_attempts
        where kind = 'reset' and ip = ${ip} and created_at > now() - interval '1 hour'`;
      if (recent[0].n >= 10) return fail(res, 429, 'Too many wrong codes from this connection. Try again later.');

      const bad = async () => {
        await sql`insert into login_attempts (email, ip, kind) values (${email}, ${ip}, 'reset')`;
        return fail(res, 400, 'That code is not valid or has expired. Ask the admin for a new one.');
      };

      if (code.length !== 8) return bad();
      const users = await sql`select id from users where email = ${email}`;
      if (!users.length) return bad();
      const userId = users[0].id;

      const active = await sql`
        select id from password_resets
        where user_id = ${userId} and used_at is null and expires_at > now()
        order by created_at desc limit 1`;
      if (!active.length) return bad();

      const newHash = await hashPassword(password);
      const done = await sql`
        with m as (
          update password_resets set used_at = now()
          where id = ${active[0].id} and code_hash = ${sha(code)}
            and used_at is null and expires_at > now()
          returning user_id
        )
        update users set password_hash = ${newHash}
        where id in (select user_id from m)
        returning id`;

      if (!done.length) {
        // Wrong code: after 5 wrong guesses this code is dead
        await sql`
          update password_resets
          set attempts = attempts + 1,
              used_at = case when attempts + 1 >= 5 then now() else null end
          where id = ${active[0].id} and used_at is null`;
        return bad();
      }

      await sql`delete from sessions where user_id = ${userId}`;
      await sql`delete from login_attempts where kind = 'login' and email = ${email}`;
      return res.status(200).json({ ok: true });
    }

    // ---- Everything else is for the admin only ----
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    if (!user.is_admin) return fail(res, 403, 'Admins only.');

    if (req.method === 'GET') {
      const q = String(req.query.search || '').trim().slice(0, 60).replace(/[%_\\]/g, '');
      if (q.length < 2) return res.status(200).json({ users: [] });
      const like = '%' + q + '%';
      const users = await sql`
        select u.id, u.email, u.full_name, u.phone, u.area, u.is_cadet, u.is_customer,
               c.guarantor_name, c.guarantor_phone
        from users u
        left join cadet_profiles c on c.user_id = u.id
        where u.email ilike ${like} or u.full_name ilike ${like} or u.phone ilike ${like}
        order by u.created_at desc
        limit 10`;
      return res.status(200).json({ users });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');

    if (req.body?.action === 'create') {
      const userId = String(req.body.userId || '');
      if (!UUID.test(userId)) return fail(res, 400, 'Bad id.');
      const exists = await sql`select 1 from users where id = ${userId}`;
      if (!exists.length) return fail(res, 404, 'User not found.');

      await sql`update password_resets set used_at = now() where user_id = ${userId} and used_at is null`;
      const code = newCode();
      await sql`
        insert into password_resets (user_id, code_hash, expires_at, created_by)
        values (${userId}, ${sha(code)}, now() + interval '30 minutes', ${user.id})`;
      return res.status(200).json({ code, minutes: 30 });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
