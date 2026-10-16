import adminbookings from '../server/adminbookings.js';
import adminjobday from '../server/adminjobday.js';
import completion from '../server/completion.js';
import jobday from '../server/jobday.js';
import logout from '../server/logout.js';

// Every endpoint kept in the server folder is listed here.
const handlers = { adminbookings, adminjobday, completion, jobday, logout };

export default async function handler(req, res) {
  const name = String(req.query.name || '');
  const fn = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : null;
  if (!fn) return res.status(404).json({ error: 'Not found' });
  return fn(req, res);
}
