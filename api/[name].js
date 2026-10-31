import account from '../server/account.js';
import adminbookings from '../server/adminbookings.js';
import adminjobday from '../server/adminjobday.js';
import adminusers from '../server/adminusers.js';
import cancellations from '../server/cancellations.js';
import completion from '../server/completion.js';
import cron from '../server/cron.js';
import jobday from '../server/jobday.js';
import logout from '../server/logout.js';
import notifications from '../server/notifications.js';
import passwordreset from '../server/passwordreset.js';
import ratings from '../server/ratings.js';
import requests from '../server/requests.js';

// Every endpoint kept in the server folder is listed here.
const handlers = { account, adminbookings, adminjobday, adminusers, cancellations, completion, cron, jobday, logout, notifications, passwordreset, ratings, requests };

export default async function handler(req, res) {
  const name = String(req.query.name || '');
  const fn = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : null;
  if (!fn) return res.status(404).json({ error: 'Not found' });
  return fn(req, res);
}
