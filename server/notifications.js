import { sql, getUser, fail } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Small and quick: used every couple of minutes
      if (req.query.count) {
        const rows = await sql`
          select (select count(*)::int from notifications
                  where user_id = ${user.id} and read_at is null) as unread,
                 (select count(*)::int from sos_alerts where resolved_at is null) as sos`;
        return res.status(200).json({ unread: rows[0].unread, openSos: user.is_admin ? rows[0].sos : 0 });
      }

      if (req.query.list) {
        await sql`delete from notifications where user_id = ${user.id} and created_at < now() - interval '60 days'`;
        const items = await sql`
          select id, kind, title, body, read_at, created_at
          from notifications where user_id = ${user.id}
          order by created_at desc limit 40`;
        return res.status(200).json({ items });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    if (req.body?.action === 'readall') {
      await sql`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`;
      return res.status(200).json({ ok: true });
    }
    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
