import { createHash } from 'node:crypto';
import { sql, getUser, checkPassword, hashPassword, fail } from '../lib/db.js';

const SKILLS = ['Ushering', 'Crowd control', 'Protocol', 'Traffic marshal', 'Drill instruction', 'First aid'];
const sha = (t) => createHash('sha256').update(t).digest('hex');

function clientIp(req) {
  const h = String(req.headers['x-forwarded-for'] || '');
  return h.split(',')[0].trim().slice(0, 64) || 'unknown';
}

function currentSessionHash(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([a-f0-9]{64})/);
  return m ? sha(m[1]) : null;
}

// Checks the password the person typed, with the same lockout as login
async function checkOwnPassword(req, userId, typed) {
  const rows = await sql`select email, password_hash from users where id = ${userId}`;
  const email = rows[0].email;
  const recent = await sql`
    select count(*)::int as n from login_attempts
    where kind = 'login' and email = ${email} and created_at > now() - interval '15 minutes'`;
  if (recent[0].n >= 5) return { ok: false, status: 429, message: 'Too many wrong tries. Wait 15 minutes and try again.' };
  const ok = await checkPassword(typed, rows[0].password_hash);
  if (!ok) {
    await sql`insert into login_attempts (email, ip, kind) values (${email}, ${clientIp(req)}, 'login')`;
    return { ok: false, status: 401, message: 'Your current password is not correct.' };
  }
  await sql`delete from login_attempts where kind = 'login' and email = ${email}`;
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const cadet = await sql`
        select organisation, unit, skills, daily_rate, bio, status
        from cadet_profiles where user_id = ${user.id}`;
      return res.status(200).json({
        user: { email: user.email, full_name: user.full_name, phone: user.phone, area: user.area },
        cadet: cadet[0] || null
      });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');

    // ---- Edit details ----
    if (action === 'update') {
      const fullName = String(b.fullName || '').trim();
      const phone = String(b.phone || '').trim();
      const area = String(b.area || '').trim();
      if (fullName.length < 2 || fullName.length > 80) return fail(res, 400, 'Enter your full name.');
      if (phone.length < 7 || phone.length > 20) return fail(res, 400, 'Enter a valid phone number.');
      if (area.length < 2 || area.length > 60) return fail(res, 400, 'Enter your area.');

      let cadetUpdate = null;
      if (b.cadet) {
        const cp = await sql`select status from cadet_profiles where user_id = ${user.id}`;
        if (cp.length && ['approved', 'pending'].includes(cp[0].status)) {
          const rate = Number.parseInt(b.cadet.dailyRate, 10);
          const bio = String(b.cadet.bio || '').trim().slice(0, 300);
          const skills = Array.isArray(b.cadet.skills)
            ? [...new Set(b.cadet.skills.map(String))].filter((s) => SKILLS.includes(s)) : [];
          if (!(rate >= 500 && rate <= 500000)) return fail(res, 400, 'Enter a daily rate between 500 and 500,000 naira.');
          if (!skills.length) return fail(res, 400, 'Pick at least one skill.');
          cadetUpdate = { rate, bio, skills };
        }
      }

      await sql`update users set full_name = ${fullName}, phone = ${phone}, area = ${area} where id = ${user.id}`;
      if (cadetUpdate) {
        await sql`
          update cadet_profiles
          set daily_rate = ${cadetUpdate.rate}, skills = ${JSON.stringify(cadetUpdate.skills)}::jsonb,
              bio = ${cadetUpdate.bio || null}
          where user_id = ${user.id}`;
      }
      return res.status(200).json({ ok: true });
    }

    // ---- Change password ----
    if (action === 'password') {
      const next = String(b.password || '');
      if (next.length < 8) return fail(res, 400, 'New password must be at least 8 characters.');
      if (next.length > 200) return fail(res, 400, 'That password is too long.');
      const c = await checkOwnPassword(req, user.id, String(b.current || ''));
      if (!c.ok) return fail(res, c.status, c.message);

      const newHash = await hashPassword(next);
      await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
      const keep = currentSessionHash(req);
      if (keep) await sql`delete from sessions where user_id = ${user.id} and token_hash <> ${keep}`;
      return res.status(200).json({ ok: true });
    }

    // ---- Delete account (anonymise) ----
    if (action === 'delete') {
      if (user.is_admin) return fail(res, 403, 'Admin accounts cannot be deleted here.');
      if (String(b.confirm || '') !== 'DELETE') return fail(res, 400, 'Type the word DELETE to confirm.');
      const c = await checkOwnPassword(req, user.id, String(b.password || ''));
      if (!c.ok) return fail(res, c.status, c.message);

      const id = user.id;
      const blockers = await sql`
        select
          (select count(*)::int from bookings
           where customer_id = ${id} and status in ('awaiting_payment', 'paid', 'in_progress', 'disputed')) as c_active,
          (select count(*)::int from booking_participants p join bookings b on b.id = p.booking_id
           where p.cadet_id = ${id} and p.status = 'booked'
             and b.status in ('awaiting_payment', 'paid', 'in_progress', 'disputed')) as k_active,
          (select count(*)::int from booking_participants p join bookings b on b.id = p.booking_id
           where p.cadet_id = ${id} and p.status = 'booked' and p.earned = true and b.status = 'completed') as owed,
          (select count(*)::int from bookings
           where customer_id = ${id} and paid_at is not null
             and (refund_amount > 0 or removed_refund > 0)) as refund_due`;
      const x = blockers[0];
      if (x.c_active > 0) return fail(res, 409, 'You have a booking that is not finished. Finish or cancel it first.');
      if (x.k_active > 0) return fail(res, 409, 'You are booked on a job that is not finished. Finish it or pull out first.');
      if (x.owed > 0) return fail(res, 409, 'You have earnings that have not been paid out yet. Delete your account after you are paid.');
      if (x.refund_due > 0) return fail(res, 409, 'A refund is still owed to you. Delete your account after it is paid.');

      await sql.transaction([
        sql`update jobs set status = 'cancelled' where customer_id = ${id} and status in ('open', 'filled')`,
        sql`update applications set status = 'withdrawn'
            where cadet_id = ${id} and status in ('applied', 'selected')
              and job_id in (select id from jobs where status in ('open', 'filled'))`,
        sql`update jobs j set status = 'open'
            where j.status = 'filled'
              and (select count(*) from applications a where a.job_id = j.id and a.status = 'selected') < j.people_needed`,
        sql`update job_requests set status = 'cancelled', responded_at = now()
            where (cadet_id = ${id} or customer_id = ${id}) and status = 'pending'`,
        sql`update availability set status = 'cancelled' where cadet_id = ${id}`,
        sql`delete from location_pings where cadet_id = ${id}`,
        sql`delete from id_documents where user_id = ${id}`,
        sql`update cadet_profiles
            set organisation = 'Deleted', unit = 'Deleted', skills = '[]'::jsonb, bio = null,
                guarantor_name = 'Deleted', guarantor_phone = 'Deleted', guarantor_role = 'Deleted',
                status = 'rejected', review_note = 'Account deleted'
            where user_id = ${id}`,
        sql`delete from password_resets where user_id = ${id}`,
        sql`delete from sessions where user_id = ${id}`,
        sql`update users
            set email = 'deleted-' || id::text || '@deleted.invalid', password_hash = 'deleted:deleted',
                full_name = 'Deleted user', phone = null, area = null,
                is_customer = false, is_cadet = false, deleted_at = now()
            where id = ${id}`
      ]);
      res.setHeader('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
