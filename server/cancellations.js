import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPolicy() {
  const rows = await sql`
    select key, value from settings
    where key in ('cancel_free_hours', 'cancel_late_refund_percent')`;
  const m = {};
  rows.forEach((r) => { m[r.key] = Number(r.value); });
  const freeHours = Number.isFinite(m.cancel_free_hours) && m.cancel_free_hours >= 0 ? m.cancel_free_hours : 48;
  const latePercent = Number.isFinite(m.cancel_late_refund_percent)
    ? Math.min(100, Math.max(0, m.cancel_late_refund_percent)) : 50;
  return { freeHours, latePercent };
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Customer: cancellation state and refund preview for one booking
      if (req.query.job) {
        const jobId = String(req.query.job);
        if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
        const pol = await getPolicy();
        const rows = await sql`
          select b.id, b.status, b.subtotal, b.removed_refund, b.refund_amount, b.cancelled_by, b.cancel_reason,
                 extract(epoch from ((j.event_date + j.start_time) - (now() at time zone 'Africa/Lagos'))) / 3600 as hours_to_start,
                 (select count(*)::int from booking_participants p
                  where p.booking_id = b.id and p.status = 'removed') as removed,
                 (select count(*)::int from booking_participants p
                  where p.booking_id = b.id and p.status = 'booked' and p.earned = false
                    and b.status = 'completed') as no_shows
          from bookings b join jobs j on j.id = b.job_id
          where b.job_id = ${jobId} and b.customer_id = ${user.id}`;
        if (!rows.length) return fail(res, 404, 'Booking not found.');
        const r = rows[0];
        const hours = Number(r.hours_to_start);
        const canCancel = ['awaiting_payment', 'paid'].includes(r.status) && hours > 0;
        const remaining = Math.max(0, r.subtotal - r.removed_refund);
        const fullRefund = hours >= pol.freeHours;
        const refundNow = r.status === 'paid'
          ? Math.round(remaining * (fullRefund ? 100 : pol.latePercent) / 100) : 0;
        return res.status(200).json({
          id: r.id, status: r.status, canCancel, paid: r.status === 'paid',
          freeHours: pol.freeHours, latePercent: pol.latePercent, fullRefund, refundNow,
          removed: r.removed, removedRefund: r.removed_refund, noShows: r.no_shows,
          refundAmount: r.refund_amount, cancelledBy: r.cancelled_by, cancelReason: r.cancel_reason
        });
      }

      // Cadet: bookings I can still pull out of
      if (req.query.mine) {
        const rows = await sql`
          select b.id as booking_id, j.title,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 extract(epoch from ((j.event_date + j.start_time) - (now() at time zone 'Africa/Lagos'))) / 3600 as hours_to_start
          from booking_participants p
          join bookings b on b.id = p.booking_id
          join jobs j on j.id = b.job_id
          where p.cadet_id = ${user.id} and p.status = 'booked'
            and b.status in ('awaiting_payment', 'paid')
            and (now() at time zone 'Africa/Lagos') < (j.event_date + j.start_time)
          order by j.event_date, j.start_time`;
        const items = rows.map((i) => ({ ...i, hours_to_start: Number(i.hours_to_start) }));
        return res.status(200).json({ items });
      }

      // Admin: cancellations, pull-outs and no-shows
      if (req.query.admin) {
        if (!user.is_admin) return fail(res, 403, 'Admins only.');
        const [cancellations, pullouts, noshows] = await Promise.all([
          sql`
            select b.cancelled_at, b.cancelled_by, b.cancel_reason, b.refund_amount, b.removed_refund,
                   b.subtotal, b.paid_at, j.title, to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                   cu.full_name as customer_name, cu.phone as customer_phone
            from bookings b
            join jobs j on j.id = b.job_id
            join users cu on cu.id = b.customer_id
            where b.status = 'cancelled' and b.cancelled_by is not null
            order by b.cancelled_at desc
            limit 30`,
          sql`
            select p.removed_at, p.removed_reason, p.late_removal, u.full_name, u.phone,
                   j.title, to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                   (select count(*)::int from booking_participants p2
                    where p2.cadet_id = p.cadet_id and p2.status = 'removed'
                      and p2.removed_at > now() - interval '90 days') as recent_count
            from booking_participants p
            join users u on u.id = p.cadet_id
            join bookings b on b.id = p.booking_id
            join jobs j on j.id = b.job_id
            where p.status = 'removed'
            order by p.removed_at desc
            limit 30`,
          sql`
            select u.full_name, u.phone, j.title, to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                   (select count(*)::int from booking_participants p2
                    join bookings b2 on b2.id = p2.booking_id
                    where p2.cadet_id = p.cadet_id and p2.status = 'booked' and p2.earned = false
                      and p2.checked_in_at is null and b2.status = 'completed'
                      and b2.completed_at > now() - interval '90 days') as recent_count
            from booking_participants p
            join bookings b on b.id = p.booking_id
            join jobs j on j.id = b.job_id
            join users u on u.id = p.cadet_id
            where p.status = 'booked' and p.earned = false and p.checked_in_at is null
              and b.status = 'completed'
            order by b.completed_at desc
            limit 30`
        ]);
        return res.status(200).json({ cancellations, pullouts, noshows });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');
    const id = String(b.id || '');
    if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
    const reason = String(b.reason || '').trim();
    if (reason.length < 5 || reason.length > 300) return fail(res, 400, 'Write a reason of 5 to 300 characters.');

    // Customer cancels a booking before the job starts
    if (action === 'cancel') {
      const pol = await getPolicy();
      const rows = await sql`
        with c as (
          update bookings b set
            status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', cancel_reason = ${reason},
            refund_amount = case when b.status = 'paid' then
              round((b.subtotal - b.removed_refund)::numeric *
                (case when extract(epoch from ((j.event_date + j.start_time) - (now() at time zone 'Africa/Lagos'))) / 3600 >= ${pol.freeHours}::numeric
                      then 100::numeric else ${pol.latePercent}::numeric end) / 100)::int
              else 0 end
          from jobs j
          where b.id = ${id} and b.job_id = j.id and b.customer_id = ${user.id}
            and b.status in ('awaiting_payment', 'paid')
            and (now() at time zone 'Africa/Lagos') < (j.event_date + j.start_time)
          returning b.job_id as job_id, b.refund_amount as refund_amount
        ), j2 as (
          update jobs set status = 'cancelled' where id in (select job_id from c) returning id
        )
        select refund_amount from c`;
      if (!rows.length) return fail(res, 409, 'This booking cannot be cancelled now.');
      return res.status(200).json({ ok: true, refund: rows[0].refund_amount });
    }

    // Cadet pulls out of a booked job before it starts
    if (action === 'pullout') {
      const found = await sql`
        select p.id as pid, p.gross,
               extract(epoch from ((j.event_date + j.start_time) - (now() at time zone 'Africa/Lagos'))) / 3600 as hours
        from booking_participants p
        join bookings b on b.id = p.booking_id
        join jobs j on j.id = b.job_id
        where p.booking_id = ${id} and p.cadet_id = ${user.id} and p.status = 'booked'
          and b.status in ('awaiting_payment', 'paid')
          and (now() at time zone 'Africa/Lagos') < (j.event_date + j.start_time)`;
      if (!found.length) return fail(res, 409, 'You cannot pull out of this job now.');
      const f = found[0];
      const late = Number(f.hours) < 24;

      await sql.transaction([
        sql`update booking_participants
            set status = 'removed', removed_at = now(), removed_reason = ${reason}, late_removal = ${late}
            where id = ${f.pid} and status = 'booked'`,
        // Before payment: the total gets lower for the customer
        sql`update bookings b
            set people_count = t.n, subtotal = t.g, commission_total = t.f, payable_total = t.p
            from (select count(*)::int as n, coalesce(sum(gross), 0)::int as g,
                         coalesce(sum(fee), 0)::int as f, coalesce(sum(payable), 0)::int as p
                  from booking_participants where booking_id = ${id} and status = 'booked') t
            where b.id = ${id} and b.status = 'awaiting_payment'
              and exists (select 1 from booking_participants where id = ${f.pid} and removed_at = now())`,
        // After payment: that cadet's share becomes refundable to the customer
        sql`update bookings set removed_refund = removed_refund + ${f.gross}::int
            where id = ${id} and status = 'paid'
              and exists (select 1 from booking_participants where id = ${f.pid} and removed_at = now())`,
        sql`update applications set status = 'withdrawn'
            where cadet_id = ${user.id} and status = 'selected'
              and job_id = (select job_id from bookings where id = ${id})`,
        // If nobody is left, cancel the booking and the job
        sql`update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
                   cancel_reason = 'All cadets pulled out',
                   refund_amount = case when status = 'paid' then subtotal - removed_refund else 0 end
            where id = ${id} and status in ('awaiting_payment', 'paid')
              and not exists (select 1 from booking_participants where booking_id = ${id} and status = 'booked')`,
        sql`update jobs set status = 'cancelled'
            where id = (select job_id from bookings where id = ${id}) and status = 'booked'
              and not exists (select 1 from booking_participants where booking_id = ${id} and status = 'booked')`
      ]);
      return res.status(200).json({ ok: true, late });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
