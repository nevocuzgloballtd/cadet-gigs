import { getUser, fail } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    if (!user) return fail(res, 401, 'Not logged in');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ user });
  } catch (err) {
    console.error(err);
    return fail(res, 500, 'Something went wrong.');
  }
}
