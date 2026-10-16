import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Jobs 24 hours past their end time complete by themselves.
// Only cadets who checked in are marked as earned.
async function autoComplete() {
  await sql`
    with due as (
      select b.id from bookings b
      join jobs j on j.id = b.job_id
      where b.status in ('paid', 'in_progress')
        and (now() at time zone 'Africa/Lagos') >
            (j.event_date + j.end_time
             + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end
             + interval '24 hours')
        and exists (select 1 from booking_participants p
                    where p.booking_id = b.id and p.status = 'booked' and p.checked_in_at is not null)
    ), done as (
      update bookings set status = 'completed', completed_at = now(), completed_by = 'auto'
      where id in (select id from due)
      returning id
    )
    update booking_participants p set earned = (p.checked_in_at is not null)
    from done where p.booking_id = done.id and p.status = 'booked'`;
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Admin: open disputes
      if (req.query.disputes) {
        if (!user.is_admin) return fail(res, 403, 'Admins only.');
        await autoComplete();
        const items = await sql`
          select b.id, b.dispute_reason, b.subtotal, b.people_count,
                 j.title, j.area, to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 cu.full_name as customer_name, cu.phone as customer_phone
          from bookings b
          join jobs j on j.id = b.job_id
          join users cu on cu.id = b.customer_id
          where b.status = 'disputed'
          order by b.disputed_at
          limit 50`;
        await Promise.all(items.map(async (i) => {
          i.people = await sql`
            select u.full_name, u.phone, p.checked_in_at, p.checked_out_at,
                   (select count(*)::int from location_pings lp
                    where lp.booking_id = p.booking_id and lp.cadet_id = p.cadet_id) as pings
            from booking_participants p
            join users u on u.id = p.cadet_id
            where p.booking_id = ${i.id} and p.status = 'booked'
            order by u.full_name`;
        }));
        return res.status(200).json({ items });
      }

      // Customer: completion details for one booking
      const jobId = String(req.query.job || '');
      if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
      await autoComplete();
      const rows = await sql`
        select b.id, b.status, b.completed_by, b.dispute_reason, b.resolution, b.resolution_note,
               (select count(*)::int from booking_participants p
                where p.booking_id = b.id and p.status = 'booked') as total,
               (select count(*)::int from booking_participants p
                where p.booking_id = b.id and p.status = 'booked' and p.checked_in_at is not null) as checked_in,
               ((now() at time zone 'Africa/Lagos') >= (j.event_date + j.start_time)) as started,
               ((now() at time zone 'Africa/Lagos') >=
                 (j.event_date + j.end_time
                  + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end)) as ended,
               ((now() at time zone 'Africa/Lagos') <=
                 (j.event_date + j.end_time
                  + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end
                  + interval '24 hours')) as in_window,
               to_char(j.event_date + j.end_time
                  + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end
                  + interval '24 hours', 'YYYY-MM-DD HH24:MI') as auto_at
        from bookings b join jobs j on j.id = b.job_id
        where b.job_id = ${jobId} and b.customer_id = ${user.id}`;
      if (!rows.length) return fail(res, 404, 'Booking not found.');
      const r = rows[0];
      const open = ['paid', 'in_progress'].includes(r.status);
      return res.status(200).json({
        status: r.status, completed_by: r.completed_by, dispute_reason: r.dispute_reason,
        resolution: r.resolution, resolution_note: r.resolution_note,
        total: r.total, checked_in: r.checked_in, started: r.started, ended: r.ended,
        auto_at: r.auto_at,
        canConfirm: open && r.ended,
        canDispute: open && r.started && r.in_window
      });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');
    const id = String(b.id || '');
    if (!UUID.test(id)) return fail(res, 400, 'Bad id.');

    // Customer confirms the job is done: all booked cadets count as earned
    if (action === 'confirm') {
      const rows = await sql`
        with done as (
          update bookings b set status = 'completed', completed_at = now(), completed_by = 'customer'
          from jobs j
          where b.id = ${id} and b.job_id = j.id and b.customer_id = ${user.id}
            and b.status in ('paid', 'in_progress')
            and (now() at time zone 'Africa/Lagos') >=
                (j.event_date + j.end_time
                 + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end)
          returning b.id
        )
        update booking_participants p set earned = true
        from done where p.booking_id = done.id and p.status = 'booked'
        returning p.id`;
      if (!rows.length) return fail(res, 409, 'This job cannot be confirmed yet.');
      return res.status(200).json({ ok: true });
    }

    // Customer reports a problem
    if (action === 'dispute') {
      const reason = String(b.reason || '').trim();
      if (reason.length < 10 || reason.length > 500) {
        return fail(res, 400, 'Describe the problem in 10 to 500 characters.');
      }
      const rows = await sql`
        update bookings b set status = 'disputed', disputed_at = now(), dispute_reason = ${reason}
        from jobs j
        where b.id = ${id} and b.job_id = j.id and b.customer_id = ${user.id}
          and b.status in ('paid', 'in_progress')
          and (now() at time zone 'Africa/Lagos') >= (j.event_date + j.start_time)
          and (now() at time zone 'Africa/Lagos') <=
              (j.event_date + j.end_time
               + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end
               + interval '24 hours')
        returning b.id`;
      if (!rows.length) return fail(res, 409, 'You cannot report a problem on this booking now.');
      return res.status(200).json({ ok: true });
    }

    // Admin decides a dispute
    if (action === 'resolve') {
      if (!user.is_admin) return fail(res, 403, 'Admins only.');
      const resolution = String(b.resolution || '');
      const note = String(b.note || '').trim();
      if (!['release', 'refund'].includes(resolution)) return fail(res, 400, 'Bad decision.');
      if (note.length < 5 || note.length > 300) return fail(res, 400, 'Write a note of 5 to 300 characters.');

      const rows = resolution === 'release'
        ? await sql`
            with done as (
              update bookings set status = 'completed', completed_at = now(), completed_by = 'admin',
                     resolution = 'release', resolution_note = ${note}, resolved_at = now()
              where id = ${id} and status = 'disputed'
              returning id
            )
            update booking_participants p set earned = (p.checked_in_at is not null)
            from done where p.booking_id = done.id and p.status = 'booked'
            returning p.id`
        : await sql`
            with done as (
              update bookings set status = 'cancelled',
                     resolution = 'refund', resolution_note = ${note}, resolved_at = now()
              where id = ${id} and status = 'disputed'
              returning id
            )
            update booking_participants p set earned = false
            from done where p.booking_id = done.id and p.status = 'booked'
            returning p.id`;
      if (!rows.length) return fail(res, 404, 'Dispute not found or already decided.');
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
