import { sql, getUser, fail } from '../lib/db.js';

const SKILLS = ['Ushering', 'Crowd control', 'Protocol', 'Traffic marshal', 'Drill instruction', 'First aid'];
const EVENT_TYPES = ['Wedding', 'Burial', 'Church event', 'School event', 'Corporate event', 'Party', 'Concert or show', 'Other'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // The customer's own jobs
      if (req.query.mine) {
        if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');
        const jobs = await sql`
          select j.id, j.title, j.event_type, j.area,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time,
                 j.people_needed, j.pay_per_person, j.skills, j.description, j.status
          from jobs j
          where j.customer_id = ${user.id}
          order by j.event_date desc, j.created_at desc
          limit 50`;
        return res.status(200).json({ jobs });
      }

      // Open jobs, only for approved cadets
      const approved = await sql`
        select 1 from cadet_profiles where user_id = ${user.id} and status = 'approved'`;
      if (!approved.length) return fail(res, 403, 'Only approved cadets can see jobs.');

      const area = String(req.query.area || '').trim().slice(0, 60);
      const skill = SKILLS.includes(req.query.skill) ? req.query.skill : '';
      const date = validDate(String(req.query.date || '')) ? String(req.query.date) : '';

      const jobs = await sql`
        select j.id, j.title, j.event_type, j.area,
               to_char(j.event_date, 'YYYY-MM-DD') as event_date,
               to_char(j.start_time, 'HH24:MI') as start_time,
               to_char(j.end_time, 'HH24:MI') as end_time,
               j.people_needed, j.pay_per_person, j.skills, j.description,
               split_part(u.full_name, ' ', 1) as customer_name
        from jobs j join users u on u.id = j.customer_id
        where j.status = 'open'
          and j.event_date >= (now() at time zone 'Africa/Lagos')::date
          and (${area}::text = '' or j.area ilike '%' || ${area}::text || '%')
          and (${skill}::text = '' or j.skills @> to_jsonb(array[${skill}::text]))
          and (${date}::text = '' or j.event_date = nullif(${date}::text, '')::date)
        order by j.event_date, j.start_time
        limit 50`;
      return res.status(200).json({ jobs });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};

    // Cancel my own job
    if (b.action === 'cancel') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      const rows = await sql`
        update jobs set status = 'cancelled'
        where id = ${id} and customer_id = ${user.id} and status = 'open'
        returning id`;
      if (!rows.length) return fail(res, 404, 'Job not found or already closed.');
      return res.status(200).json({ ok: true });
    }

    // Post a new job
    if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');

    const title = String(b.title || '').trim();
    const eventType = String(b.eventType || '');
    const area = String(b.area || '').trim();
    const date = String(b.date || '');
    const startTime = String(b.startTime || '');
    const endTime = String(b.endTime || '');
    const people = Number.parseInt(b.people, 10);
    const pay = Number.parseInt(b.pay, 10);
    const description = String(b.description || '').trim().slice(0, 500);
    const skills = Array.isArray(b.skills)
      ? [...new Set(b.skills.map(String))].filter((s) => SKILLS.includes(s))
      : [];

    if (title.length < 3 || title.length > 80) return fail(res, 400, 'Enter a job title (3 to 80 letters).');
    if (!EVENT_TYPES.includes(eventType)) return fail(res, 400, 'Pick the type of event.');
    if (area.length < 2 || area.length > 60) return fail(res, 400, 'Enter the area of the event.');
    if (!validDate(date)) return fail(res, 400, 'Pick a valid date.');
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return fail(res, 400, 'Pick the start and end time.');
    if (startTime === endTime) return fail(res, 400, 'Start and end time cannot be the same.');
    if (!(people >= 1 && people <= 100)) return fail(res, 400, 'People needed must be between 1 and 100.');
    if (!(pay >= 500 && pay <= 500000)) return fail(res, 400, 'Pay per person must be between 500 and 500,000 naira.');
    if (!skills.length) return fail(res, 400, 'Pick at least one skill you need.');

    const future = await sql`
      select (${date}::date >= (now() at time zone 'Africa/Lagos')::date) as ok`;
    if (!future[0].ok) return fail(res, 400, 'Pick today or a future date.');

    const count = await sql`
      select count(*)::int as n from jobs where customer_id = ${user.id} and status = 'open'`;
    if (count[0].n >= 20) return fail(res, 429, 'You have too many open jobs. Cancel one first.');

    await sql`
      insert into jobs
        (customer_id, title, event_type, area, event_date, start_time, end_time,
         people_needed, pay_per_person, skills, description)
      values
        (${user.id}, ${title}, ${eventType}, ${area}, ${date}::date, ${startTime}::time, ${endTime}::time,
         ${people}, ${pay}, ${JSON.stringify(skills)}::jsonb, ${description || null})`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
