import { sql, getUser, fail } from '../lib/db.js';

const SKILLS = ['Ushering', 'Crowd control', 'Protocol', 'Traffic marshal', 'Drill instruction', 'First aid'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

async function isApprovedCadet(userId) {
  const rows = await sql`select 1 from cadet_profiles where user_id = ${userId} and status = 'approved'`;
  return rows.length > 0;
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // The cadet's own listings
      if (req.query.mine) {
        if (!(await isApprovedCadet(user.id))) return fail(res, 403, 'Only approved cadets can do this.');
        const items = await sql`
          select a.id, a.area, a.note, a.status,
                 to_char(a.available_date, 'YYYY-MM-DD') as available_date,
                 to_char(a.from_time, 'HH24:MI') as from_time,
                 to_char(a.to_time, 'HH24:MI') as to_time
          from availability a
          where a.cadet_id = ${user.id}
          order by a.available_date desc, a.created_at desc
          limit 50`;
        return res.status(200).json({ items });
      }

      // Customers search for available cadets
      if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');
      const area = String(req.query.area || '').trim().slice(0, 60);
      const skill = SKILLS.includes(req.query.skill) ? req.query.skill : '';
      const date = validDate(String(req.query.date || '')) ? String(req.query.date) : '';

      const items = await sql`
        select a.id, a.area, a.note,
               to_char(a.available_date, 'YYYY-MM-DD') as available_date,
               to_char(a.from_time, 'HH24:MI') as from_time,
               to_char(a.to_time, 'HH24:MI') as to_time,
               split_part(u.full_name, ' ', 1) as first_name,
               c.organisation, c.unit, c.skills, c.daily_rate
        from availability a
        join users u on u.id = a.cadet_id
        join cadet_profiles c on c.user_id = a.cadet_id
        where a.status = 'active' and c.status = 'approved'
          and a.available_date >= (now() at time zone 'Africa/Lagos')::date
          and (${area}::text = '' or a.area ilike '%' || ${area}::text || '%')
          and (${skill}::text = '' or c.skills @> to_jsonb(array[${skill}::text]))
          and (${date}::text = '' or a.available_date = nullif(${date}::text, '')::date)
        order by a.available_date, a.created_at
        limit 50`;
      return res.status(200).json({ items });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    if (!(await isApprovedCadet(user.id))) return fail(res, 403, 'Only approved cadets can do this.');
    const b = req.body || {};

    if (b.action === 'cancel') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      const rows = await sql`
        update availability set status = 'cancelled'
        where id = ${id} and cadet_id = ${user.id} and status = 'active'
        returning id`;
      if (!rows.length) return fail(res, 404, 'Listing not found or already cancelled.');
      return res.status(200).json({ ok: true });
    }

    const area = String(b.area || '').trim();
    const date = String(b.date || '');
    const fromTime = String(b.fromTime || '');
    const toTime = String(b.toTime || '');
    const note = String(b.note || '').trim().slice(0, 200);

    if (area.length < 2 || area.length > 60) return fail(res, 400, 'Enter the area where you can work.');
    if (!validDate(date)) return fail(res, 400, 'Pick a valid date.');
    if (!TIME_RE.test(fromTime) || !TIME_RE.test(toTime)) return fail(res, 400, 'Pick the times you are free.');
    if (fromTime === toTime) return fail(res, 400, 'The two times cannot be the same.');

    const future = await sql`
      select (${date}::date >= (now() at time zone 'Africa/Lagos')::date) as ok`;
    if (!future[0].ok) return fail(res, 400, 'Pick today or a future date.');

    const count = await sql`
      select count(*)::int as n from availability where cadet_id = ${user.id} and status = 'active'`;
    if (count[0].n >= 20) return fail(res, 429, 'You have too many active listings. Cancel one first.');

    await sql`
      insert into availability (cadet_id, area, available_date, from_time, to_time, note)
      values (${user.id}, ${area}, ${date}::date, ${fromTime}::time, ${toTime}::time, ${note || null})`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
