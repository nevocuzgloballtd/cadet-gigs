import { sql, getUser, fail } from '../lib/db.js';

const SKILLS = ['Ushering', 'Crowd control', 'Protocol', 'Traffic marshal', 'Drill instruction', 'First aid'];
const ORGS = ["Man O' War", 'Scouts', "Boys' Brigade", 'Red Cross cadets', 'Other'];

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const rows = await sql`
        select organisation, unit, skills, daily_rate, bio, status, review_note
        from cadet_profiles where user_id = ${user.id}`;
      return res.status(200).json({ profile: rows[0] || null });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Use GET or POST');
    if (!user.is_cadet) return fail(res, 403, 'Turn on cadet mode first.');

    const b = req.body || {};
    const organisation = String(b.organisation || '').trim();
    const unit = String(b.unit || '').trim();
    const bio = String(b.bio || '').trim().slice(0, 300);
    const guarantorName = String(b.guarantorName || '').trim();
    const guarantorPhone = String(b.guarantorPhone || '').trim();
    const guarantorRole = String(b.guarantorRole || '').trim();
    const dailyRate = Number.parseInt(b.dailyRate, 10);
    const skills = Array.isArray(b.skills)
      ? [...new Set(b.skills.map(String))].filter((s) => SKILLS.includes(s))
      : [];
    const image = String(b.idImage || '');

    if (!ORGS.includes(organisation)) return fail(res, 400, 'Pick your organisation.');
    if (unit.length < 2 || unit.length > 80) return fail(res, 400, 'Enter your unit or troop name.');
    if (!skills.length) return fail(res, 400, 'Pick at least one skill.');
    if (!(dailyRate >= 500 && dailyRate <= 500000)) return fail(res, 400, 'Enter a daily rate between 500 and 500,000 naira.');
    if (guarantorName.length < 2 || guarantorName.length > 80) return fail(res, 400, 'Enter your guarantor name.');
    if (guarantorPhone.length < 7 || guarantorPhone.length > 20) return fail(res, 400, 'Enter your guarantor phone number.');
    if (guarantorRole.length < 2 || guarantorRole.length > 60) return fail(res, 400, 'Enter your guarantor role, for example Unit Commander.');
    if (image.length > 900000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) {
      return fail(res, 400, 'The ID photo is not valid. Try another photo.');
    }

    const existing = await sql`select status from cadet_profiles where user_id = ${user.id}`;
    if (existing[0]?.status === 'approved') return fail(res, 409, 'Your profile is already approved.');

    await sql`
      insert into cadet_profiles
        (user_id, organisation, unit, skills, daily_rate, bio,
         guarantor_name, guarantor_phone, guarantor_role,
         status, review_note, reviewed_at, submitted_at)
      values
        (${user.id}, ${organisation}, ${unit}, ${JSON.stringify(skills)}::jsonb, ${dailyRate}, ${bio},
         ${guarantorName}, ${guarantorPhone}, ${guarantorRole},
         'pending', null, null, now())
      on conflict (user_id) do update set
        organisation = excluded.organisation,
        unit = excluded.unit,
        skills = excluded.skills,
        daily_rate = excluded.daily_rate,
        bio = excluded.bio,
        guarantor_name = excluded.guarantor_name,
        guarantor_phone = excluded.guarantor_phone,
        guarantor_role = excluded.guarantor_role,
        status = 'pending', review_note = null, reviewed_at = null, submitted_at = now()`;

    await sql`
      insert into id_documents (user_id, data) values (${user.id}, ${image})
      on conflict (user_id) do update set data = excluded.data, uploaded_at = now()`;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
