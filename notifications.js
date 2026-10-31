// Loaded AFTER adminhub.js. The Notifications link, the inbox screen, and the admin SOS banner.

const CHECK_EVERY_MS = 2 * 60 * 1000;
let loggedIn = false;
let lastUnread = 0;
let lastCheck = 0;

const notifAgo = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' hours ago';
  return Math.round(m / 1440) + ' days ago';
};

const bellLabel = () => (lastUnread > 0 ? `Notifications (${lastUnread})` : 'Notifications');

function setSosBanner(n) {
  let b = document.getElementById('sosBanner');
  if (!n) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'sosBanner';
    b.className = 'sosbanner';
    b.onclick = async () => {
      const me = await api('me');
      if (me.ok) showLiveJobs(me.data.user);
    };
    document.body.appendChild(b);
  }
  b.textContent = `SOS: ${n} open alert${n === 1 ? '' : 's'}. Tap to open.`;
}

async function checkNotifications(force) {
  if (!loggedIn || document.visibilityState !== 'visible') return;
  if (!force && Date.now() - lastCheck < 15000) return;
  lastCheck = Date.now();
  const r = await api('notifications?count=1');
  if (r.status === 401) { loggedIn = false; setSosBanner(0); return; }
  if (!r.ok) return;
  lastUnread = r.data.unread;
  const bell = document.getElementById('bellBtn');
  if (bell) bell.textContent = bellLabel();
  setSosBanner(r.data.openSos);
}

setInterval(() => checkNotifications(false), CHECK_EVERY_MS);
document.addEventListener('visibilitychange', () => checkNotifications(false));

// The Notifications link sits under the greeting on the home screen
new MutationObserver(() => {
  const acct = document.getElementById('acctBtn');
  const top = document.querySelector('#app .top');
  if (document.getElementById('bellBtn') || !document.getElementById('logout')) return;
  const anchor = acct || top;
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend',
    `<button id="bellBtn" class="link" style="align-self:flex-start;padding:0 .5rem">${esc(bellLabel())}</button>`);
  document.getElementById('bellBtn').onclick = async () => {
    const me = await api('me');
    if (me.ok) showNotifications(me.data.user);
  };
  loggedIn = true;
  checkNotifications(false);
}).observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------- The inbox ----------
async function showNotifications(user) {
  app.innerHTML = `<main class="shell">${header('Notifications')}
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = async () => {
    const me = await api('me');
    if (me.ok) showHome(me.data.user); else showAuth('login');
  };
  const box = document.getElementById('results');
  const r = await api('notifications?list=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }

  box.innerHTML = r.data.items.length
    ? r.data.items.map((n) => `
        <div class="card stack">
          <h2>${esc(n.title)} ${n.read_at ? '' : '<span class="pill">new</span>'}</h2>
          ${n.body ? `<p>${esc(n.body)}</p>` : ''}
          <p class="fine">${esc(notifAgo(n.created_at))}</p>
        </div>`).join('')
    : '<p class="fine">Nothing yet. When something happens on your jobs, bookings or account, it will show here.</p>';

  // Everything on screen counts as read once you have seen it
  if (r.data.items.some((n) => !n.read_at)) {
    await api('notifications', { action: 'readall' });
    lastUnread = 0;
  }
}
