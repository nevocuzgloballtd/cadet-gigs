import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marks the job "filled" when all places are taken, and "open" again when a place frees up
async function refreshJobStatus(jobId) {
  await sql`
    update jobs set status = case
      when (select count(*) from applications where job_id = ${jobId} and status = 'selected') >= people_needed
      then 'filled' else 'open' end
    where id = ${jobId} and status in ('open', 'filled')`;
}

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      // Customer: which of my jobs fit this cadet's availability
      if (req.query.eligible) {
        const availId = String(req.query.eligible);
        if (!UUID.test(availId)) return fail(res, 400, 'Bad id.');
        if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');
        const jobs = await sql`
          select j.id, j.title, j.people_needed, j.pay_per_person,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time
          from jobs j
          join availability a on a.id = ${availId}
          where j.customer_id = ${user.id} and j.status = 'open'
            and j.event_date = a.available_date
            and a.status = 'active' and a.cadet_id <> ${user.id}
            and not exists (select 1 from applications ap
                            where ap.job_id = j.id and ap.cadet_id = a.cadet_id and ap.status <> 'withdrawn')
            and not exists (select 1 from job_requests r
                            where r.job_id = j.id and r.cadet_id = a.cadet_id and r.status = 'pending')
          order by j.start_time`;
        return res.status(200).json({ jobs });
      }

      // Cadet: how many requests are waiting
      if (req.query.count) {
        const rows = await sql`
          select count(*)::int as n
          from job_requests r join jobs j on j.id = r.job_id
          where r.cadet_id = ${user.id} and r.status = 'pending' and j.status = 'open'
            and j.event_date >= (now() at time zone 'Africa/Lagos')::date`;
        return res.status(200).json({ count: rows[0].n });
      }

      // Cadet: requests waiting for me
      if (req.query.mine) {
        const items = await sql`
          select r.id, r.message, j.title, j.event_type, j.area,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time,
                 j.people_needed, j.pay_per_person,
                 split_part(cu.full_name, ' ', 1) as customer_name
          from job_requests r
          join jobs j on j.id = r.job_id
          join users cu on cu.id = r.customer_id
          where r.cadet_id = ${user.id} and r.status = 'pending' and j.status = 'open'
            and j.event_date >= (now() at time zone 'Africa/Lagos')::date
          order by j.event_date, r.created_at
          limit 50`;
        return res.status(200).json({ items });
      }

      // Customer: requests I sent
      if (req.query.sent) {
        const items = await sql`
          select r.id, r.status, r.message, j.title, j.status as job_status,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 split_part(u.full_name, ' ', 1) as cadet_name
          from job_requests r
          join jobs j on j.id = r.job_id
          join users u on u.id = r.cadet_id
          where r.customer_id = ${user.id}
          order by r.created_at desc
          limit 50`;
        return res.status(200).json({ items });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');

    // Customer sends a request
    if (action === 'send') {
      const availId = String(b.availabilityId || '');
      const jobId = String(b.jobId || '');
      if (!UUID.test(availId) || !UUID.test(jobId)) return fail(res, 400, 'Bad id.');
      if (!user.is_customer) return fail(res, 403, 'Turn on customer mode first.');
      const message = String(b.message || '').trim().slice(0, 200);

      const rows = await sql`
        select a.cadet_id
        from availability a
        join cadet_profiles c on c.user_id = a.cadet_id and c.status = 'approved'
        join jobs j on j.id = ${jobId}
        where a.id = ${availId} and a.status = 'active'
          and j.customer_id = ${user.id} and j.status = 'open'
          and j.event_date = a.available_date
          and j.event_date >= (now() at time zone 'Africa/Lagos')::date
          and a.cadet_id <> ${user.id}`;
      if (!rows.length) return fail(res, 409, "This request is not possible any more. Check the job and the cadet's listing.");
      const cadetId = rows[0].cadet_id;

      const applied = await sql`
        select 1 from applications
        where job_id = ${jobId} and cadet_id = ${cadetId} and status <> 'withdrawn'`;
      if (applied.length) return fail(res, 409, 'This cadet already applied to this job or was chosen for it.');

      const pending = await sql`
        select count(*)::int as n from job_requests where customer_id = ${user.id} and status = 'pending'`;
      if (pending[0].n >= 30) return fail(res, 429, 'You have too many waiting requests. Wait for answers first.');

      const ins = await sql`
        insert into job_requests (job_id, customer_id, cadet_id, availability_id, message)
        values (${jobId}, ${user.id}, ${cadetId}, ${availId}, ${message || null})
        on conflict (job_id, cadet_id) do update
          set status = 'pending', message = excluded.message, availability_id = excluded.availability_id,
              created_at = now(), responded_at = null
          where job_requests.status in ('declined', 'cancelled')
        returning id`;
      if (!ins.length) return fail(res, 409, 'You already sent this cadet a request for this job.');
      return res.status(200).json({ ok: true });
    }

    // Customer cancels a waiting request
    if (action === 'cancel') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      const rows = await sql`
        update job_requests set status = 'cancelled', responded_at = now()
        where id = ${id} and customer_id = ${user.id} and status = 'pending'
        returning id`;
      if (!rows.length) return fail(res, 404, 'Request not found or already answered.');
      return res.status(200).json({ ok: true });
    }

    // Cadet accepts or declines
    if (action === 'respond') {
      const id = String(b.id || '');
      const decision = String(b.decision || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      if (!['accept', 'decline'].includes(decision)) return fail(res, 400, 'Bad decision.');

      const found = await sql`
        select job_id from job_requests
        where id = ${id} and cadet_id = ${user.id} and status = 'pending'`;
      if (!found.length) return fail(res, 404, 'Request not found or already answered.');
      const jobId = found[0].job_id;

      if (decision === 'decline') {
        await sql`update job_requests set status = 'declined', responded_at = now() where id = ${id}`;
        return res.status(200).json({ ok: true });
      }

      const approved = await sql`select 1 from cadet_profiles where user_id = ${user.id} and status = 'approved'`;
      if (!approved.length) return fail(res, 403, 'Only approved cadets can accept.');

      const ins = await sql`
        insert into applications (job_id, cadet_id, message, status)
        select ${jobId}::uuid, ${user.id}::uuid, 'Requested by the customer', 'selected'
        where (select count(*) from applications where job_id = ${jobId} and status = 'selected')
              < coalesce((select people_needed from jobs
                          where id = ${jobId} and status = 'open'
                            and event_date >= (now() at time zone 'Africa/Lagos')::date), 0)
        on conflict (job_id, cadet_id) do update
          set status = 'selected', message = 'Requested by the customer'
          where applications.status in ('applied', 'withdrawn')
        returning id`;
      if (!ins.length) return fail(res, 409, 'This job is full, closed, or you are already on it.');

      await sql`update job_requests set status = 'accepted', responded_at = now() where id = ${id}`;
      await refreshJobStatus(jobId);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
