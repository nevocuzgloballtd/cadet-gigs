import { randomUUID } from 'node:crypto';
import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Customer: the booking for one of my jobs
      if (req.query.job) {
        const jobId = String(req.query.job);
        if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
        const found = await sql`
          select b.id, b.status, b.people_count, b.pay_per_person, b.subtotal,
                 j.title, j.event_type, j.area,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time
          from bookings b join jobs j on j.id = b.job_id
          where b.job_id = ${jobId} and b.customer_id = ${user.id}`;
        if (!found.length) return fail(res, 404, 'Booking not found.');
        const cadets = await sql`
          select split_part(u.full_name, ' ', 1) as first_name, c.organisation, c.unit
          from booking_participants p
          join users u on u.id = p.cadet_id
          join cadet_profiles c on c.user_id = p.cadet_id
          where p.booking_id = ${found[0].id} and p.status = 'booked'
          order by u.full_name`;
        return res.status(200).json({ booking: found[0], cadets });
      }

      // Cadet: my bookings
      if (req.query.mine) {
        const items = await sql`
          select p.gross, p.fee, p.payable, b.status, b.commission_percent,
                 j.title, j.event_type, j.area,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time,
                 split_part(cu.full_name, ' ', 1) as customer_name
          from booking_participants p
          join bookings b on b.id = p.booking_id
          join jobs j on j.id = b.job_id
          join users cu on cu.id = b.customer_id
          where p.cadet_id = ${user.id} and p.status = 'booked'
          order by j.event_date desc
          limit 50`;
        return res.status(200).json({ items });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};

    if (b.action === 'create') {
      const jobId = String(b.jobId || '');
      if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');

      const jobs = await sql`
        select customer_id, status, pay_per_person,
               (event_date >= (now() at time zone 'Africa/Lagos')::date) as upcoming
        from jobs where id = ${jobId}`;
      if (!jobs.length || jobs[0].customer_id !== user.id) return fail(res, 404, 'Job not found.');
      if (!['open', 'filled'].includes(jobs[0].status)) return fail(res, 409, 'This job is already booked or closed.');
      if (!jobs[0].upcoming) return fail(res, 400, 'This job date has passed.');

      const chosen = await sql`
        select count(*)::int as n from applications where job_id = ${jobId} and status = 'selected'`;
      if (chosen[0].n < 1) return fail(res, 400, 'Choose at least one cadet first.');

      const setting = await sql`select value from settings where key = 'commission_percent'`;
      const pct = Number(setting[0]?.value);
      if (!Number.isFinite(pct) || pct < 0 || pct > 50) return fail(res, 500, 'Commission setting is missing. Tell the admin.');

      const bookingId = randomUUID();
      const pay = jobs[0].pay_per_person;

      try {
        await sql.transaction([
          sql`insert into bookings (id, job_id, customer_id, pay_per_person, commission_percent)
              values (${bookingId}, ${jobId}, ${user.id}, ${pay}, ${pct})`,
          sql`insert into booking_participants (booking_id, cadet_id, gross, fee, payable)
              select ${bookingId}::uuid, a.cadet_id, ${pay}::int,
                     round(${pay}::numeric * ${pct}::numeric / 100)::int,
                     ${pay}::int - round(${pay}::numeric * ${pct}::numeric / 100)::int
              from applications a
              where a.job_id = ${jobId} and a.status = 'selected'`,
          sql`update bookings b
              set people_count = t.n, subtotal = t.g, commission_total = t.f, payable_total = t.p
              from (select count(*)::int as n,
                           coalesce(sum(gross), 0)::int as g,
                           coalesce(sum(fee), 0)::int as f,
                           coalesce(sum(payable), 0)::int as p
                    from booking_participants where booking_id = ${bookingId}) t
              where b.id = ${bookingId}`,
          sql`update jobs set status = 'booked' where id = ${jobId} and status in ('open', 'filled')`
        ]);
      } catch (err) {
        if (err && err.code === '23505') return fail(res, 409, 'This job is already booked.');
        throw err;
      }
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
