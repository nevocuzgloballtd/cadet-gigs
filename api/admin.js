import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    if (!user.is_admin) return fail(res, 403, 'Admins only.');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      if (req.query.image) {
        const id = String(req.query.image);
        if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
        const rows = await sql`select data from id_documents where user_id = ${id}`;
        if (!rows.length) return fail(res, 404, 'No ID photo found.');
        return res.status(200).json({ image: rows[0].data });
      }

      const applications = await sql`
        select u.id, u.full_name, u.phone, u.area,
               c.organisation, c.unit, c.skills, c.daily_rate, c.bio,
               c.guarantor_name, c.guarantor_phone, c.guarantor_role,
               c.status, c.review_note, c.submitted_at
        from cadet_profiles c join users u on u.id = c.user_id
        order by (c.status = 'pending') desc, c.submitted_at desc
        limit 100`;
      return res.status(200).json({ applications });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');

    const { userId, decision, note } = req.body || {};
    if (!UUID.test(String(userId || ''))) return fail(res, 400, 'Bad id.');
    if (!['approved', 'rejected'].includes(decision)) return fail(res, 400, 'Bad decision.');
    const n = String(note || '').trim().slice(0, 300);
    if (decision === 'rejected' && n.length < 3) return fail(res, 400, 'Write a reason before you reject.');

    const rows = await sql`
      update cadet_profiles
      set status = ${decision}, review_note = ${n || null}, reviewed_at = now()
      where user_id = ${userId} and status = 'pending'
      returning user_id`;
    if (!rows.length) return fail(res, 404, 'No pending application found.');

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
