import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TEMPORARY: lets the admin mark a booking as paid while real payment is not built yet.
export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    if (!user.is_admin) return fail(res, 403, 'Admins only.');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const items = await sql`
        select b.id, b.status, b.people_count, b.subtotal, b.commission_total, b.payable_total,
               j.title, to_char(j.event_date, 'YYYY-MM-DD') as event_date,
               u.full_name as customer_name
        from bookings b
        join jobs j on j.id = b.job_id
        join users u on u.id = b.customer_id
        where b.status in ('awaiting_payment', 'paid')
        order by b.created_at desc
        limit 50`;
      return res.status(200).json({ items });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const { action, id } = req.body || {};
    if (!UUID.test(String(id || ''))) return fail(res, 400, 'Bad id.');

    if (action === 'markPaid') {
      const rows = await sql`
        update bookings set status = 'paid', paid_at = now()
        where id = ${id} and status = 'awaiting_payment'
        returning id`;
      if (!rows.length) return fail(res, 409, 'This booking is not waiting for payment.');
      return res.status(200).json({ ok: true });
    }

    if (action === 'markUnpaid') {
      const rows = await sql`
        update bookings set status = 'awaiting_payment', paid_at = null, venue_address = null
        where id = ${id} and status = 'paid'
        returning id`;
      if (!rows.length) return fail(res, 409, 'This booking cannot be reset.');
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
