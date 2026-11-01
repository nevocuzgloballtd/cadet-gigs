import { sql, getUser, fail } from '../lib/db.js';
import { TERMS_VERSION } from '../lib/legal.js';

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const rows = await sql`select consent_version, consented_at from users where id = ${user.id}`;
      const accepted = rows[0].consent_version;
      return res.status(200).json({
        current: TERMS_VERSION,
        accepted,
        needs: Boolean(rows[0].consented_at) && accepted !== TERMS_VERSION
      });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    if (req.body?.action === 'accept') {
      if (String(req.body.version || '') !== TERMS_VERSION) {
        return fail(res, 409, 'The terms changed again. Reload the app and try once more.');
      }
      await sql`
        update users set consent_version = ${TERMS_VERSION}, terms_accepted_at = now(),
               consented_at = coalesce(consented_at, now())
        where id = ${user.id}`;
      return res.status(200).json({ ok: true });
    }
    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
