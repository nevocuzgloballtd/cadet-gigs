// Each endpoint loads only when it is used, so one broken file cannot break the others.
const loaders = {
  account: () => import('../server/account.js'),
  adminbookings: () => import('../server/adminbookings.js'),
  adminjobday: () => import('../server/adminjobday.js'),
  adminusers: () => import('../server/adminusers.js'),
  cancellations: () => import('../server/cancellations.js'),
  completion: () => import('../server/completion.js'),
  cron: () => import('../server/cron.js'),
  dashboard: () => import('../server/dashboard.js'),
  jobday: () => import('../server/jobday.js'),
  logout: () => import('../server/logout.js'),
  notifications: () => import('../server/notifications.js'),
  passwordreset: () => import('../server/passwordreset.js'),
  ratings: () => import('../server/ratings.js'),
  requests: () => import('../server/requests.js'),
  terms: () => import('../server/terms.js')
};

export default async function handler(req, res) {
  const name = String(req.query.name || '');
  const load = Object.prototype.hasOwnProperty.call(loaders, name) ? loaders[name] : null;
  if (!load) return res.status(404).json({ error: 'Not found' });

  let mod;
  try {
    mod = await load();
  } catch (err) {
    console.error('Could not load endpoint', name, err);
    // Temporary: shows what is wrong. We remove the detail before real users come.
    return res.status(500).json({
      error: `The "${name}" part of the server could not start: ${String(err && err.message || err).slice(0, 180)}`
    });
  }
  return mod.default(req, res);
}
