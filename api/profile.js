import { sql, getUser, fail } from '../lib/db.js';

const CONSENT_VERSION = 'v1-draft';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST');
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    const b = req.body || {};

    // Turn on the other mode later
    if (b.addMode === 'customer') {
      await sql`update users set is_customer = true where id = ${user.id}`;
      return res.status(200).json({ ok: true });
    }
    if (b.addMode === 'cadet') {
      await sql`update users set is_cadet = true where id = ${user.id}`;
      return res.status(200).json({ ok: true });
    }

    // Profile setup
    const fullName = String(b.fullName || '').trim();
    const phone = String(b.phone || '').trim();
    const area = String(b.area || '').trim();
    const isCustomer = b.isCustomer === true;
    const isCadet = b.isCadet === true;

    if (fullName.length < 2 || fullName.length > 80) return fail(res, 400, 'Enter your full name.');
    if (phone.length < 7 || phone.length > 20) return fail(res, 400, 'Enter a valid phone number.');
    if (area.length < 2 || area.length > 60) return fail(res, 400, 'Enter your area.');
    if (!isCustomer && !isCadet) return fail(res, 400, 'Pick at least one: hire cadets or take jobs.');
    if (b.age18 !== true) return fail(res, 400, 'You must be 18 or older.');
    if (b.consent !== true) return fail(res, 400, 'You must accept the terms to continue.');

    await sql`
      update users set
        full_name = ${fullName}, phone = ${phone}, area = ${area},
        is_customer = ${isCustomer}, is_cadet = ${isCadet},
        consented_at = coalesce(consented_at, now()),
        consent_version = ${CONSENT_VERSION}
      where id = ${user.id}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
