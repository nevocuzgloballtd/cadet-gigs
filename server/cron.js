import { sql } from '../lib/db.js';

// Runs once a day from Vercel's scheduler. Only Vercel can call it, because it carries CRON_SECRET.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // Keep the promise on the consent screen: location records live 60 days
    await sql`delete from location_pings where created_at < now() - interval '60 days'`;
    // Expired login sessions and old login-attempt records
    await sql`delete from sessions where expires_at < now()`;
    await sql`delete from login_attempts where created_at < now() - interval '1 day'`;

    // Jobs 24 hours past their end time complete by themselves.
    // Only cadets who checked in are marked as earned.
    await sql`
      with due as (
        select b.id from bookings b
        join jobs j on j.id = b.job_id
        where b.status in ('paid', 'in_progress')
          and (now() at time zone 'Africa/Lagos') >
              (j.event_date + j.end_time
               + case when j.end_time <= j.start_time then interval '1 day' else interval '0 day' end
               + interval '24 hours')
          and exists (select 1 from booking_participants p
                      where p.booking_id = b.id and p.status = 'booked' and p.checked_in_at is not null)
      ), done as (
        update bookings set status = 'completed', completed_at = now(), completed_by = 'auto'
        where id in (select id from due)
        returning id
      )
      update booking_participants p set earned = (p.checked_in_at is not null)
      from done where p.booking_id = done.id and p.status = 'booked'`;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Cleanup failed.' });
  }
}
