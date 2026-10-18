import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // My own rating, as cadet and as customer
      if (req.query.me) {
        const rows = await sql`
          select ratee_role, round(avg(stars)::numeric, 1)::float as avg, count(*)::int as count
          from ratings where ratee_id = ${user.id} group by ratee_role`;
        const out = { cadet: { avg: null, count: 0 }, customer: { avg: null, count: 0 } };
        rows.forEach((r) => { out[r.ratee_role] = { avg: r.avg, count: r.count }; });
        return res.status(200).json(out);
      }

      // Star summaries for cards on the screen
      if (req.query.kind) {
        const kind = String(req.query.kind);
        const ids = String(req.query.ids || '').split(',').filter((x) => UUID.test(x)).slice(0, 50);
        const summary = {};
        if (!ids.length) return res.status(200).json({ summary });
        const csv = ids.join(',');
        let rows;

        if (kind === 'app') {
          rows = await sql`
            select a.id, round(avg(r.stars)::numeric, 1)::float as avg, count(r.id)::int as count
            from applications a
            join jobs j on j.id = a.job_id
            left join ratings r on r.ratee_id = a.cadet_id and r.ratee_role = 'cadet'
            where a.id = any(string_to_array(${csv}, ',')::uuid[]) and j.customer_id = ${user.id}
            group by a.id`;
        } else if (kind === 'avail') {
          if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');
          rows = await sql`
            select a.id, round(avg(r.stars)::numeric, 1)::float as avg, count(r.id)::int as count
            from availability a
            left join ratings r on r.ratee_id = a.cadet_id and r.ratee_role = 'cadet'
            where a.id = any(string_to_array(${csv}, ',')::uuid[])
            group by a.id`;
        } else if (kind === 'job') {
          rows = await sql`
            select j.id, round(avg(r.stars)::numeric, 1)::float as avg, count(r.id)::int as count
            from jobs j
            left join ratings r on r.ratee_id = j.customer_id and r.ratee_role = 'customer'
            where j.id = any(string_to_array(${csv}, ',')::uuid[]) and j.status = 'open'
            group by j.id`;
        } else {
          return fail(res, 400, 'Bad kind.');
        }
        rows.forEach((r) => { summary[r.id] = { avg: r.avg, count: r.count }; });
        return res.status(200).json({ summary });
      }

      // Customer: cadets I can rate on one completed booking
      if (req.query.booking) {
        const jobId = String(req.query.booking);
        if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
        const items = await sql`
          select p.id as participant_id, b.id as booking_id,
                 split_part(u.full_name, ' ', 1) as first_name, r.stars
          from bookings b
          join booking_participants p on p.booking_id = b.id and p.status = 'booked' and p.earned = true
          join users u on u.id = p.cadet_id
          left join ratings r on r.booking_id = b.id and r.rater_id = ${user.id} and r.ratee_id = p.cadet_id
          where b.job_id = ${jobId} and b.customer_id = ${user.id} and b.status = 'completed'
          order by u.full_name`;
        return res.status(200).json({ items });
      }

      // Cadet: customers I can still rate
      if (req.query.mine) {
        const items = await sql`
          select b.id as booking_id, j.title,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 split_part(cu.full_name, ' ', 1) as customer_name
          from booking_participants p
          join bookings b on b.id = p.booking_id and b.status = 'completed'
          join jobs j on j.id = b.job_id
          join users cu on cu.id = b.customer_id
          where p.cadet_id = ${user.id} and p.status = 'booked' and p.earned = true
            and not exists (select 1 from ratings r
                            where r.booking_id = b.id and r.rater_id = ${user.id} and r.ratee_id = b.customer_id)
          order by j.event_date desc
          limit 20`;
        return res.status(200).json({ items });
      }

      // Admin: latest ratings with comments
      if (req.query.admin) {
        if (!user.is_admin) return fail(res, 403, 'Admins only.');
        const items = await sql`
          select r.stars, r.comment, r.ratee_role, r.created_at, j.title,
                 ra.full_name as rater_name, re.full_name as ratee_name
          from ratings r
          join bookings b on b.id = r.booking_id
          join jobs j on j.id = b.job_id
          join users ra on ra.id = r.rater_id
          join users re on re.id = r.ratee_id
          order by r.created_at desc
          limit 50`;
        return res.status(200).json({ items });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    if (b.action !== 'rate') return fail(res, 400, 'Unknown action.');

    const bookingId = String(b.bookingId || '');
    if (!UUID.test(bookingId)) return fail(res, 400, 'Bad id.');
    const stars = Number.parseInt(b.stars, 10);
    if (!(stars >= 1 && stars <= 5)) return fail(res, 400, 'Choose 1 to 5 stars.');
    const comment = String(b.comment || '').trim().slice(0, 300);

    const found = await sql`select customer_id, status from bookings where id = ${bookingId}`;
    if (!found.length || found[0].status !== 'completed') {
      return fail(res, 409, 'You can rate after the job is completed.');
    }

    let rateeId;
    let role;
    if (found[0].customer_id === user.id) {
      const pid = String(b.participantId || '');
      if (!UUID.test(pid)) return fail(res, 400, 'Bad id.');
      const p = await sql`
        select cadet_id from booking_participants
        where id = ${pid} and booking_id = ${bookingId} and status = 'booked' and earned = true`;
      if (!p.length) return fail(res, 404, 'Cadet not found on this booking.');
      rateeId = p[0].cadet_id;
      role = 'cadet';
    } else {
      const p = await sql`
        select 1 from booking_participants
        where booking_id = ${bookingId} and cadet_id = ${user.id} and status = 'booked' and earned = true`;
      if (!p.length) return fail(res, 403, 'Only cadets who were paid for this job can rate it.');
      rateeId = found[0].customer_id;
      role = 'customer';
    }

    const rows = await sql`
      insert into ratings (booking_id, rater_id, ratee_id, ratee_role, stars, comment)
      values (${bookingId}, ${user.id}, ${rateeId}, ${role}, ${stars}, ${comment || null})
      on conflict (booking_id, rater_id, ratee_id) do nothing
      returning id`;
    if (!rows.length) return fail(res, 409, 'You already rated this.');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
