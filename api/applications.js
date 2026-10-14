import { sql, getUser, fail } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isApprovedCadet(userId) {
  const rows = await sql`select 1 from cadet_profiles where user_id = ${userId} and status = 'approved'`;
  return rows.length > 0;
}

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
      // Which jobs I already applied to (used to mark the search results)
      if (req.query.applied) {
        const items = await sql`
          select job_id, status from applications
          where cadet_id = ${user.id} and status <> 'withdrawn'`;
        return res.status(200).json({ items });
      }

      // My applications (cadet)
      if (req.query.mine) {
        const items = await sql`
          select a.id, a.status, a.message,
                 j.id as job_id, j.title, j.event_type, j.area, j.status as job_status,
                 to_char(j.event_date, 'YYYY-MM-DD') as event_date,
                 to_char(j.start_time, 'HH24:MI') as start_time,
                 to_char(j.end_time, 'HH24:MI') as end_time,
                 j.people_needed, j.pay_per_person,
                 split_part(u.full_name, ' ', 1) as customer_name
          from applications a
          join jobs j on j.id = a.job_id
          join users u on u.id = j.customer_id
          where a.cadet_id = ${user.id} and a.status <> 'withdrawn'
          order by j.event_date desc, a.created_at desc
          limit 50`;
        return res.status(200).json({ items });
      }

      // Applicant counts for my jobs (customer)
      if (req.query.counts) {
        const items = await sql`
          select a.job_id,
                 (count(*) filter (where a.status = 'applied'))::int as applied,
                 (count(*) filter (where a.status = 'selected'))::int as selected
          from applications a join jobs j on j.id = a.job_id
          where j.customer_id = ${user.id} and a.status <> 'withdrawn'
          group by a.job_id`;
        return res.status(200).json({ items });
      }

      // Applicants for one of my jobs (customer)
      if (req.query.job) {
        const jobId = String(req.query.job);
        if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
        const jobs = await sql`
          select people_needed, status from jobs
          where id = ${jobId} and customer_id = ${user.id}`;
        if (!jobs.length) return fail(res, 404, 'Job not found.');
        const applicants = await sql`
          select a.id, a.status, a.message,
                 split_part(u.full_name, ' ', 1) as first_name,
                 c.organisation, c.unit, c.skills, c.daily_rate
          from applications a
          join users u on u.id = a.cadet_id
          join cadet_profiles c on c.user_id = a.cadet_id
          where a.job_id = ${jobId} and a.status <> 'withdrawn'
          order by (a.status = 'selected') desc, a.created_at`;
        return res.status(200).json({ job: jobs[0], applicants });
      }

      return fail(res, 400, 'Nothing to show.');
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    const b = req.body || {};
    const action = String(b.action || '');

    // Cadet applies to a job
    if (action === 'apply') {
      const jobId = String(b.jobId || '');
      if (!UUID.test(jobId)) return fail(res, 400, 'Bad id.');
      if (!(await isApprovedCadet(user.id))) return fail(res, 403, 'Only approved cadets can apply.');
      const message = String(b.message || '').trim().slice(0, 200);

      const jobs = await sql`
        select customer_id, status,
               (event_date >= (now() at time zone 'Africa/Lagos')::date) as upcoming
        from jobs where id = ${jobId}`;
      if (!jobs.length) return fail(res, 404, 'Job not found.');
      if (jobs[0].customer_id === user.id) return fail(res, 400, 'You cannot apply to your own job.');
      if (jobs[0].status !== 'open') return fail(res, 409, 'This job is no longer open.');
      if (!jobs[0].upcoming) return fail(res, 400, 'This job date has passed.');

      const rows = await sql`
        insert into applications (job_id, cadet_id, message)
        values (${jobId}, ${user.id}, ${message || null})
        on conflict (job_id, cadet_id) do update
          set status = 'applied', message = excluded.message, created_at = now()
          where applications.status = 'withdrawn'
        returning id`;
      if (!rows.length) return fail(res, 409, 'You already applied to this job.');
      return res.status(200).json({ ok: true });
    }

    // Cadet withdraws
    if (action === 'withdraw') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      const rows = await sql`
        update applications set status = 'withdrawn'
        where id = ${id} and cadet_id = ${user.id} and status in ('applied', 'selected')
        returning job_id`;
      if (!rows.length) return fail(res, 404, 'Application not found.');
      await refreshJobStatus(rows[0].job_id);
      return res.status(200).json({ ok: true });
    }

    // Customer chooses or removes an applicant
    if (action === 'select' || action === 'unselect') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(res, 400, 'Bad id.');
      const found = await sql`
        select a.job_id, a.status, j.customer_id, j.status as job_status, j.people_needed
        from applications a join jobs j on j.id = a.job_id
        where a.id = ${id}`;
      const app = found[0];
      if (!app || app.customer_id !== user.id) return fail(res, 404, 'Application not found.');
      if (!['open', 'filled'].includes(app.job_status)) return fail(res, 409, 'This job is closed.');

      if (action === 'select') {
        if (app.status !== 'applied') return fail(res, 409, 'This applicant cannot be chosen now.');
        if (app.job_status !== 'open') return fail(res, 409, 'All places are already filled.');
        const rows = await sql`
          update applications set status = 'selected'
          where id = ${id} and status = 'applied'
            and (select count(*) from applications where job_id = ${app.job_id} and status = 'selected') < ${app.people_needed}
          returning id`;
        if (!rows.length) return fail(res, 409, 'All places are already filled.');
      } else {
        const rows = await sql`
          update applications set status = 'applied'
          where id = ${id} and status = 'selected'
          returning id`;
        if (!rows.length) return fail(res, 409, 'This applicant is not chosen.');
      }
      await refreshJobStatus(app.job_id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'Unknown action.');
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
