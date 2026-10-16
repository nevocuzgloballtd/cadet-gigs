import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    if (!user.is_admin) return fail(res, 403, 'Admins only.');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Keep the promise on the consent screen: delete location records older than 60 days
      await sql`delete from location_pings where created_at < now() - interval '60 days'`;

      const [sos, onJob, late] = await Promise.all([
        sql`
          select s.id, s.lat, s.lng, s.created_at,
                 u.full_name, u.phone, cp.guarantor_name, cp.guarantor_phone, cp.guarantor_role,
                 j.title, j.area, b.venue_address
          from sos_alerts s
          join users u on u.id = s.cadet_id
          join cadet_profiles cp on cp.user_id = s.cadet_id
          join bookings b on b.id = s.booking_id
          join jobs j on j.id = b.job_id
          where s.resolved_at is null
          order by s.created_at desc
          limit 50`,
        sql`
          select p.booking_id, p.cadet_id, p.checked_in_at,
                 u.full_name, u.phone, cp.guarantor_name, cp.guarantor_phone, cp.guarantor_role,
                 j.title, j.area, b.venue_address,
                 lp.lat, lp.lng, lp.created_at as ping_at
          from booking_participants p
          join bookings b on b.id = p.booking_id
          join jobs j on j.id = b.job_id
          join users u on u.id = p.cadet_id
          join cadet_profiles cp on cp.user_id = p.cadet_id
          left join lateral (
            select lat, lng, created_at from location_pings
            where booking_id = p.booking_id and cadet_id = p.cadet_id
            order by created_at desc limit 1
          ) lp on true
          where p.status = 'booked' and p.checked_in_at is not null and p.checked_out_at is null
          order by p.checked_in_at
          limit 100`,
        sql`
          select p.booking_id, p.cadet_id,
                 u.full_name, u.phone, cp.guarantor_name, cp.guarantor_phone, cp.guarantor_role,
                 j.title, j.area, to_char(j.start_time, 'HH24:MI') as start_time
          from booking_participants p
          join bookings b on b.id = p.booking_id
          join jobs j on j.id = b.job_id
          join users u on u.id = p.cadet_id
          join cadet_profiles cp on cp.user_id = p.cadet_id
          where p.status = 'booked' and p.checked_in_at is null
            and b.status in ('paid', 'in_progress')
            and j.event_date = (now() at time zone 'Africa/Lagos')::date
            and (now() at time zone 'Africa/Lagos') > (j.event_date + j.start_time + interval '30 minutes')
            and (j.end_time <= j.start_time or (now() at time zone 'Africa/Lagos') < (j.event_date + j.end_time))
          order by j.start_time
          limit 100`
      ]);
      return res.status(200).json({ sos, onJob, late });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const { action, id } = req.body || {};
    if (action === 'resolve') {
      if (!UUID.test(String(id || ''))) return fail(res, 400, 'Bad id.');
      const rows = await sql`
        update sos_alerts set resolved_at = now()
        where id = ${id} and resolved_at is null returning id`;
      if (!rows.length) return fail(res, 404, 'Alert not found or already resolved.');
      return res.status(200).json({ ok: true });
    }
    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
