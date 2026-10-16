import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coords(b) {
  if (b.lat == null || b.lng == null || b.lat === '' || b.lng === '') return null;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const acc = Number(b.accuracy);
  return { lat, lng, acc: Number.isFinite(acc) && acc >= 0 && acc < 100000 ? Math.round(acc) : null };
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    // Today's jobs for this cadet
    if (req.method === 'GET') {
      const items = await sql`
        select p.booking_id, p.checked_in_at, p.checked_out_at, b.status, b.venue_address,
               j.title, j.event_type, j.area,
               to_char(j.start_time, 'HH24:MI') as start_time,
               to_char(j.end_time, 'HH24:MI') as end_time,
               cu.full_name as customer_name, cu.phone as customer_phone,
               (select max(lp.created_at) from location_pings lp
                where lp.booking_id = p.booking_id and lp.cadet_id = p.cadet_id) as last_ping
        from booking_participants p
        join bookings b on b.id = p.booking_id
        join jobs j on j.id = b.job_id
        join users cu on cu.id = b.customer_id
        where p.cadet_id = ${user.id} and p.status = 'booked'
          and b.status in ('paid', 'in_progress', 'completed')
          and j.event_date = (now() at time zone 'Africa/Lagos')::date
        order by j.start_time`;
      return res.status(200).json({ items });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');
    const id = String(b.bookingId || '');
    if (!UUID.test(id)) return fail(res, 400, 'Bad id.');

    // ---- Check in ----
    if (action === 'checkin') {
      const found = await sql`
        select p.checked_in_at, b.status,
               (j.event_date = (now() at time zone 'Africa/Lagos')::date) as today
        from booking_participants p
        join bookings b on b.id = p.booking_id
        join jobs j on j.id = b.job_id
        where p.booking_id = ${id} and p.cadet_id = ${user.id} and p.status = 'booked'`;
      if (!found.length) return fail(res, 404, 'Booking not found.');
      const f = found[0];
      if (!['paid', 'in_progress'].includes(f.status)) return fail(res, 409, 'Check-in opens after the customer pays.');
      if (!f.today) return fail(res, 400, 'You can check in only on the day of the job.');
      if (f.checked_in_at) return fail(res, 409, 'You already checked in.');
      const c = coords(b);
      if (!c) return fail(res, 400, 'We could not get your location. Turn on location and try again.');

      await sql.transaction([
        sql`update booking_participants
            set checked_in_at = now(), checkin_lat = ${c.lat}, checkin_lng = ${c.lng}
            where booking_id = ${id} and cadet_id = ${user.id} and checked_in_at is null`,
        sql`insert into location_pings (booking_id, cadet_id, lat, lng, accuracy)
            values (${id}, ${user.id}, ${c.lat}, ${c.lng}, ${c.acc})`,
        sql`update bookings set status = 'in_progress' where id = ${id} and status = 'paid'`
      ]);
      return res.status(200).json({ ok: true });
    }

    // ---- Location ping ----
    if (action === 'ping') {
      const c = coords(b);
      if (!c) return fail(res, 400, 'No location.');
      const p = await sql`
        select checked_in_at, checked_out_at from booking_participants
        where booking_id = ${id} and cadet_id = ${user.id} and status = 'booked'`;
      if (!p.length) return fail(res, 404, 'Booking not found.');
      if (!p[0].checked_in_at || p[0].checked_out_at) return fail(res, 409, 'You are not on this job.');
      await sql`
        insert into location_pings (booking_id, cadet_id, lat, lng, accuracy)
        select ${id}::uuid, ${user.id}::uuid, ${c.lat}::float8, ${c.lng}::float8, ${c.acc}::int
        where not exists (
          select 1 from location_pings
          where booking_id = ${id} and cadet_id = ${user.id}
            and created_at > now() - interval '20 seconds')`;
      return res.status(200).json({ ok: true });
    }

    // ---- Check out ----
    if (action === 'checkout') {
      const rows = await sql`
        update booking_participants set checked_out_at = now()
        where booking_id = ${id} and cadet_id = ${user.id} and status = 'booked'
          and checked_in_at is not null and checked_out_at is null
        returning booking_id`;
      if (!rows.length) return fail(res, 409, 'You are not on this job.');
      const c = coords(b);
      if (c) {
        await sql`insert into location_pings (booking_id, cadet_id, lat, lng, accuracy)
                  values (${id}, ${user.id}, ${c.lat}, ${c.lng}, ${c.acc})`;
      }
      return res.status(200).json({ ok: true });
    }

    // ---- SOS ----
    if (action === 'sos') {
      const found = await sql`
        select b.status from booking_participants p
        join bookings b on b.id = p.booking_id
        where p.booking_id = ${id} and p.cadet_id = ${user.id} and p.status = 'booked'`;
      if (!found.length) return fail(res, 404, 'Booking not found.');
      if (!['paid', 'in_progress'].includes(found[0].status)) return fail(res, 409, 'SOS works during a paid job.');
      const c = coords(b);
      const open = await sql`
        select 1 from sos_alerts where booking_id = ${id} and cadet_id = ${user.id} and resolved_at is null`;
      if (!open.length) {
        await sql`insert into sos_alerts (booking_id, cadet_id, lat, lng)
                  values (${id}, ${user.id}, ${c ? c.lat : null}, ${c ? c.lng : null})`;
      }
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
