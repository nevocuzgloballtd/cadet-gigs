import { sql, getUser, fail } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return fail(res, 405, 'Use GET');

    // ---------- Customer dashboard ----------
    if (req.query.role === 'customer') {
      const s = await sql`
        select
          (select count(*)::int from jobs
           where customer_id = ${user.id} and status = 'open'
             and event_date >= (now() at time zone 'Africa/Lagos')::date) as open_jobs,
          (select count(*)::int from applications a join jobs j on j.id = a.job_id
           where j.customer_id = ${user.id} and j.status in ('open', 'filled') and a.status = 'applied') as applicants_waiting,
          (select count(*)::int from bookings b join jobs j on j.id = b.job_id
           where b.customer_id = ${user.id} and b.status in ('awaiting_payment', 'paid', 'in_progress')
             and j.event_date >= (now() at time zone 'Africa/Lagos')::date) as upcoming_count,
          (select coalesce(sum(subtotal), 0)::int from bookings
           where customer_id = ${user.id} and status in ('awaiting_payment', 'paid', 'in_progress', 'completed')
             and (created_at at time zone 'Africa/Lagos') >= date_trunc('month', now() at time zone 'Africa/Lagos')) as booked_month,
          (select round(avg(stars)::numeric, 1)::float from ratings
           where ratee_id = ${user.id} and ratee_role = 'customer') as rating_avg,
          (select count(*)::int from ratings
           where ratee_id = ${user.id} and ratee_role = 'customer') as rating_count`;
      const next = await sql`
        select b.job_id, b.status, b.people_count, j.title, j.area, j.event_type,
               to_char(j.event_date, 'YYYY-MM-DD') as event_date,
               to_char(j.start_time, 'HH24:MI') as start_time
        from bookings b join jobs j on j.id = b.job_id
        where b.customer_id = ${user.id} and b.status in ('awaiting_payment', 'paid', 'in_progress')
          and j.event_date >= (now() at time zone 'Africa/Lagos')::date
        order by j.event_date, j.start_time limit 1`;
      return res.status(200).json({ stats: s[0], next: next[0] || null });
    }

    // ---------- Cadet dashboard ----------
    const profile = await sql`
      select organisation, unit, skills, daily_rate, bio, status
      from cadet_profiles where user_id = ${user.id}`;
    const p = profile[0] || null;

    const s = await sql`
      select
        (select count(*)::int from booking_participants p join bookings b on b.id = p.booking_id
         where p.cadet_id = ${user.id} and p.status = 'booked'
           and b.status in ('awaiting_payment', 'paid', 'in_progress')) as active_bookings,
        (select count(*)::int from booking_participants p
         join bookings b on b.id = p.booking_id join jobs j on j.id = b.job_id
         where p.cadet_id = ${user.id} and p.status = 'booked'
           and b.status in ('awaiting_payment', 'paid', 'in_progress')
           and j.event_date >= (now() at time zone 'Africa/Lagos')::date) as upcoming_count,
        (select coalesce(sum(p.payable), 0)::int from booking_participants p join bookings b on b.id = p.booking_id
         where p.cadet_id = ${user.id} and p.status = 'booked' and p.earned = true and b.status = 'completed'
           and (b.completed_at at time zone 'Africa/Lagos') >= date_trunc('month', now() at time zone 'Africa/Lagos')) as earned_month,
        (select count(*)::int from job_requests r join jobs j on j.id = r.job_id
         where r.cadet_id = ${user.id} and r.status = 'pending' and j.status = 'open'
           and j.event_date >= (now() at time zone 'Africa/Lagos')::date) as pending_requests,
        (select count(*)::int from availability
         where cadet_id = ${user.id} and status = 'active'
           and available_date >= (now() at time zone 'Africa/Lagos')::date) as availability_count,
        (select round(avg(stars)::numeric, 1)::float from ratings
         where ratee_id = ${user.id} and ratee_role = 'cadet') as rating_avg,
        (select count(*)::int from ratings
         where ratee_id = ${user.id} and ratee_role = 'cadet') as rating_count`;
    const st = s[0];

    const next = await sql`
      select b.status, b.people_count, j.title, j.area, j.event_type,
             to_char(j.event_date, 'YYYY-MM-DD') as event_date,
             to_char(j.start_time, 'HH24:MI') as start_time
      from booking_participants p
      join bookings b on b.id = p.booking_id join jobs j on j.id = b.job_id
      where p.cadet_id = ${user.id} and p.status = 'booked'
        and b.status in ('awaiting_payment', 'paid', 'in_progress')
        and j.event_date >= (now() at time zone 'Africa/Lagos')::date
      order by j.event_date, j.start_time limit 1`;

    // How complete the profile is: 6 checks
    const missing = [];
    if (!user.full_name || !user.phone || !user.area) missing.push('your name, phone and area');
    if (!p || !p.bio) missing.push('a short bio');
    if (!p || !Array.isArray(p.skills) || !p.skills.length) missing.push('your skills');
    if (!p || !p.daily_rate) missing.push('your daily rate');
    if (!p || p.status !== 'approved') missing.push('verification');
    if (st.availability_count < 1) missing.push('when you are free');
    const percent = Math.round(((6 - missing.length) / 6) * 100);

    return res.status(200).json({
      profile: p,
      stats: st,
      next: next[0] || null,
      completion: { percent, missing }
    });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
