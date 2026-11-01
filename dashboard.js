// Loaded AFTER legalpages.js. The app shell (header, bottom bar, laptop menu) and the two dashboards.

// Your brand lives here. Change it in one place.
const BRAND = { first: 'CADET', second: 'GIGS', tagline: 'Serve \u2022 Secure \u2022 Earn' };

const LOGO = `<svg viewBox="0 0 48 52" width="38" height="42" aria-hidden="true">
  <path d="M24 2 43 8v16c0 11-8 19-19 24C13 43 5 35 5 24V8z" fill="#D9A441" fill-opacity=".14" stroke="#D9A441" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="24,9.1 25.06,12.04 28.18,12.14 25.71,14.06 26.59,17.06 24,15.3 21.41,17.06 22.29,14.06 19.82,12.14 22.94,12.04" fill="#D9A441"/>
  <text x="24" y="38" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#D9A441" text-anchor="middle">C</text>
</svg>`;

const ICONS = {
  home: '<path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  gear: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="16.5" cy="13.5" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 016 6v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M17.5 14a6 6 0 014 6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const ico = (n, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const initialsOf = (name) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

let navUser = null;
let navActive = 'home';
let navHandlers = {};
let dashToken = 0;

// ---------- The shell: header, laptop menu, phone bottom bar ----------
function ensureNavEls() {
  if (document.getElementById('appnav')) return;
  const h = document.createElement('header');
  h.id = 'appnav';
  h.className = 'appnav';
  document.body.appendChild(h);
  const b = document.createElement('nav');
  b.id = 'bottomnav';
  b.className = 'bottomnav';
  b.setAttribute('aria-label', 'Main');
  document.body.appendChild(b);
}

const setNav = (on) => document.body.classList.toggle('has-nav', on);

function markNav() {
  document.querySelectorAll('.navlink, .bn').forEach((b) => b.classList.toggle('on', b.dataset.nav === navActive));
}

function buildNav(user, role) {
  const cadet = role === 'cadet';
  const links = cadet
    ? [['home', 'home', 'Dashboard'], ['jobs', 'search', 'Find jobs'], ['apps', 'doc', 'My applications'], ['avail', 'calendar', 'My availability'], ['books', 'briefcase', 'My bookings']]
    : [['home', 'home', 'Dashboard'], ['post', 'plus', 'Post a job'], ['find', 'search', 'Find cadets'], ['jobs', 'briefcase', 'My jobs'], ['sent', 'reply', 'Requests sent']];
  if (user.is_admin) links.push(['live', 'pin', 'LiveCheck']);

  const bottom = [['home', 'home', 'Home'], ['jobs', cadet ? 'search' : 'briefcase', 'Jobs'], ['alerts', 'bell', 'Alerts']];
  if (user.is_admin) bottom.push(['live', 'pin', 'LiveCheck']);
  bottom.push(['settings', 'gear', 'Settings']);

  navHandlers = {
    home: () => showHome(user),
    jobs: () => (cadet ? showJobSearch(user) : showMyJobs(user)),
    apps: () => showMyApplications(user),
    avail: () => showMyAvail(user),
    books: () => showMyBookings(user),
    post: () => showJobForm(user),
    find: () => showCadetSearch(user),
    sent: () => showSentRequests(user),
    live: () => showLiveJobs(user),
    alerts: () => showNotifications(user),
    settings: () => showAccount(user),
    logout: async () => { await api('logout', {}); showAuth('login'); }
  };

  document.getElementById('appnav').innerHTML = `
    <button class="brand" data-nav="home" aria-label="Dashboard">${LOGO}
      <span class="brand-t"><span class="brand-name">${esc(BRAND.first)} <b>${esc(BRAND.second)}</b></span>
      <span class="brand-tag">${esc(BRAND.tagline)}</span></span></button>
    <nav class="navlinks" aria-label="Main">${links.map(([k, i, t]) =>
      `<button class="navlink" data-nav="${k}">${ico(i, 18)}<span>${esc(t)}</span></button>`).join('')}</nav>
    <div class="nav-right">
      <button class="iconbtn" data-nav="alerts" aria-label="Notifications">${ico('bell', 24)}<span class="nbadge hidden"></span></button>
      <button id="avatarBtn" class="avatar" data-nav="avatar" aria-label="Account menu">${esc(initialsOf(user.full_name))}</button>
      <div id="avatarMenu" class="menu">
        <button data-nav="settings">My account</button>
        <button data-nav="logout">Log out</button>
      </div>
    </div>`;

  document.getElementById('bottomnav').innerHTML = bottom.map(([k, i, t]) =>
    `<button class="bn" data-nav="${k}">${ico(i, 24)}<span>${esc(t)}</span>${k === 'alerts' ? '<span class="nbadge hidden"></span>' : ''}</button>`).join('');
  markNav();
  refreshBadge();
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('avatarMenu');
  const el = e.target.closest('[data-nav]');
  if (!el) { if (menu) menu.classList.remove('open'); return; }
  const key = el.dataset.nav;
  if (key === 'avatar') { if (menu) menu.classList.toggle('open'); return; }
  if (menu) menu.classList.remove('open');
  const fn = navHandlers[key];
  if (!fn) return;
  if (key !== 'logout') { navActive = key; markNav(); }
  fn();
});

// The shell disappears on login, signup, profile setup, password reset and terms screens
new MutationObserver(() => {
  const plain = ['authForm', 'profileForm', 'acceptForm', 'mailForm', 'resetForm'].some((id) => document.getElementById(id));
  if (plain && navUser) { navUser = null; setNav(false); }
}).observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------- Notification badge and the admin SOS banner ----------
async function refreshBadge() {
  if (!navUser || document.visibilityState !== 'visible') return;
  const r = await api('notifications?count=1');
  if (!r.ok) return;
  const n = r.data.unread;
  document.querySelectorAll('.nbadge').forEach((b) => {
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('hidden', !n);
  });
  if (typeof setSosBanner === 'function') setSosBanner(r.data.openSos);
}
setInterval(refreshBadge, 90000);
document.addEventListener('visibilitychange', refreshBadge);

// After you read your alerts, the count goes back to zero
const _showNotificationsDB = showNotifications;
showNotifications = async function (user) {
  await _showNotificationsDB(user);
  refreshBadge();
};

// ---------- Dashboard pieces ----------
const statCard = (icon, value, label) =>
  `<div class="stat"><span class="stat-ico">${ico(icon, 26)}</span><strong class="stat-v">${esc(value)}</strong><span class="stat-l">${esc(label)}</span></div>`;

function ringSvg(pct) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="#2B3832" stroke-width="6"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="#7FC48F" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" font-size="15" font-weight="700" fill="#ECEFEA">${pct}%</text></svg>`;
}

function tileHtml(key, icon, label, n) {
  return `<button class="tile" data-go="${key}"><span class="tile-ico">${ico(icon, 24)}</span>
    <span class="tile-t">${esc(label)}</span>${n > 0 ? `<span class="tile-n">${esc(n)}</span>` : ''}
    <span class="tile-go">${ico('chevron', 18)}</span></button>`;
}

function upcomingHtml(next, cadet) {
  const head = `<div class="sec-head"><span class="sec-t">${ico('calendar', 20)} Your upcoming booking</span>
    <button class="link-gold" data-go="all">View all</button></div>`;
  if (!next) {
    return `<section class="upcoming">${head}<p class="fine">No upcoming booking yet. ${cadet
      ? 'When a customer books you, it shows here.'
      : 'Once you book cadets for a job, it shows here.'}</p></section>`;
  }
  return `<section class="upcoming">${head}
    <button class="booking" data-go="upcoming">
      <span class="event-ico">${ico('calendar', 28)}</span>
      <span class="bk-main">
        <strong>${esc(next.title)}</strong>
        <span class="bk-line">${ico('pin', 15)} ${esc(next.area)}</span>
        <span class="bk-line">${ico('clock', 15)} ${esc(niceDate(next.event_date))} \u2022 ${esc(next.start_time)}</span>
        <span class="pill good">${esc(BOOKING_STATUS[next.status] || next.status)}</span>
      </span>
      <span class="bk-people"><strong>${esc(next.people_count)}</strong><span>Personnel</span></span>
    </button></section>`;
}

// ---------- The dashboard ----------
async function renderDashboard(user) {
  const role = getMode(user);
  const cadet = role === 'cadet';
  const token = ++dashToken;

  navUser = user;
  navActive = 'home';
  ensureNavEls();
  buildNav(user, role);
  setNav(true);
  if (typeof termsChecked !== 'undefined' && !termsChecked) { termsChecked = true; checkTerms(); }

  const first = (user.full_name || '').split(' ')[0] || 'there';
  const both = user.is_cadet && user.is_customer;

  app.innerHTML = `
    <main class="dash dash--lite" id="dash">
      <section class="greet">
        <h1 class="greet-h">Hello, ${esc(first)} <span aria-hidden="true">\uD83D\uDC4B</span></h1>
        <p class="greet-p">${cadet ? 'Your next opportunity starts here.' : 'Ready to book your next event?'}</p>
        <div class="greet-row">
          <span id="verBadge" class="verbadge hidden"></span>
          ${both ? `<button id="switchMode" class="chipbtn">Switch to ${cadet ? 'Customer' : 'Cadet'}</button>` : ''}
        </div>
      </section>
      <p class="fine" id="dashLoad">Loading...</p>
    </main>`;

  const sw = document.getElementById('switchMode');
  if (sw) sw.onclick = () => {
    try { localStorage.setItem('mode', cadet ? 'customer' : 'cadet'); } catch (e) {}
    showHome(user);
  };

  const r = await api('dashboard?role=' + role);
  if (token !== dashToken) return; // the person already moved to another screen
  const dash = document.getElementById('dash');
  if (!dash) return;
  const load = document.getElementById('dashLoad');
  if (load) load.remove();
  if (!r.ok) {
    dash.insertAdjacentHTML('beforeend',
      `<p class="msg">${esc(r.data.error || 'Could not load.')}</p><button class="btn" onclick="location.reload()">Try again</button>`);
    return;
  }

  const d = r.data;
  const s = d.stats;
  const badge = document.getElementById('verBadge');
  const missingRole = !user.is_customer ? 'customer' : !user.is_cadet ? 'cadet' : '';
  const addLink = missingRole
    ? `<button class="link" data-go="addmode" data-mode="${missingRole}">Also turn on ${missingRole} mode</button>` : '';

  const go = {
    banner: () => (cadet ? showJobSearch(user) : showJobForm(user)),
    all: () => (cadet ? showMyBookings(user) : showMyJobs(user)),
    upcoming: () => (cadet ? showMyBookings(user) : showBooking(user, d.next.job_id)),
    profile: () => showAccount(user),
    apps: () => showMyApplications(user),
    avail: () => showMyAvail(user),
    books: () => showMyBookings(user),
    jobday: () => showJobDay(user),
    requests: () => showCadetRequests(user),
    free: () => showAvailForm(user),
    find: () => showCadetSearch(user),
    myjobs: () => showMyJobs(user),
    sent: () => showSentRequests(user),
    admin: () => showAdminHub(user),
    addmode: async (t) => {
      const res = await api('profile', { addMode: t.dataset.mode });
      if (res.ok) start();
    }
  };
  dash.onclick = (e) => {
    const t = e.target.closest('[data-go]');
    if (!t || !go[t.dataset.go]) return;
    go[t.dataset.go](t);
  };

  // ----- A cadet who is not approved yet: show the verification steps -----
  if (cadet && (!d.profile || d.profile.status !== 'approved')) {
    const st = d.profile ? d.profile.status : 'none';
    badge.textContent = st === 'pending' ? 'Under review' : st === 'rejected' ? 'Needs changes' : 'Not verified yet';
    badge.className = 'verbadge warn';
    dash.insertAdjacentHTML('beforeend', `<section class="banner-area"><div id="panel"></div></section>
      ${addLink ? `<div class="tiles">${addLink}</div>` : ''}`);
    loadCadetPanel(user);
    return;
  }

  // ----- Cadet dashboard -----
  if (cadet) {
    const p = d.profile;
    dash.className = 'dash dash--cadet';
    badge.innerHTML = `${ico('check', 16)} Verified cadet`;
    badge.className = 'verbadge';

    const pct = d.completion.percent;
    const hint = d.completion.missing.length
      ? `Add ${d.completion.missing.slice(0, 2).join(' and ')} to get more jobs.` : '';
    const tiles = [
      tileHtml('apps', 'doc', 'My applications'),
      tileHtml('avail', 'calendar', 'My availability'),
      tileHtml('books', 'briefcase', 'My bookings'),
      tileHtml('jobday', 'check', 'Job day'),
      tileHtml('requests', 'reply', 'Job requests', s.pending_requests),
      tileHtml('free', 'plus', 'Post when I am free')
    ];
    if (user.is_admin) tiles.push(tileHtml('admin', 'shield', 'Admin tools'));

    dash.insertAdjacentHTML('beforeend', `
      <section class="stats">
        ${statCard('briefcase', s.active_bookings, 'Active bookings')}
        ${statCard('wallet', money(s.earned_month), 'Earned this month')}
        ${statCard('calendar', s.upcoming_count, 'Upcoming jobs')}
        ${statCard('star', s.rating_count ? Number(s.rating_avg).toFixed(1) : 'New', 'Rating')}
      </section>
      <button class="banner" data-go="banner">
        <span class="banner-ico">${ico('search', 34)}</span>
        <span class="banner-t"><strong>Find work</strong><span>Browse jobs near you or tell customers when you are free.</span></span>
        <span class="banner-go">${ico('chevron', 22)}</span>
      </button>
      ${upcomingHtml(d.next, true)}
      <section class="tiles"><div class="tilegrid">${tiles.join('')}</div>${addLink}</section>
      ${pct < 100 ? `<section class="completion">${ringSvg(pct)}
        <div class="comp-t"><strong>Complete your profile</strong><span>${esc(hint)}</span></div>
        <button class="btn alt small" data-go="profile">Complete profile</button></section>` : ''}
      <aside class="side">
        <div class="avatar xl">${esc(initialsOf(user.full_name))}</div>
        <strong class="side-name">${esc(user.full_name)}</strong>
        <span class="verbadge">${ico('check', 16)} Verified cadet</span>
        <div class="side-row"><span>Organisation</span><strong>${esc(p.organisation)}, ${esc(p.unit)}</strong></div>
        <div class="side-row"><span>Profile completion</span>
          <div class="bar"><span style="width:${pct}%"></span></div><strong>${pct}%</strong></div>
        <div class="side-row"><span>Skills</span>
          <div class="chips">${(p.skills || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>
        <div class="side-row"><span>Rate</span><strong class="gold">${money(p.daily_rate)} / day</strong></div>
        <button class="btn alt" data-go="profile">Edit profile</button>
      </aside>`);
    if (typeof resumeTracking === 'function') resumeTracking();
    return;
  }

  // ----- Customer dashboard -----
  dash.className = 'dash dash--customer';
  badge.textContent = s.rating_count ? `Customer \u2022 \u2605 ${Number(s.rating_avg).toFixed(1)}` : 'Customer';
  badge.className = 'verbadge';
  const tiles = [
    tileHtml('find', 'search', 'Find cadets'),
    tileHtml('myjobs', 'briefcase', 'My jobs'),
    tileHtml('sent', 'reply', 'Requests I sent')
  ];
  if (user.is_admin) tiles.push(tileHtml('admin', 'shield', 'Admin tools'));

  dash.insertAdjacentHTML('beforeend', `
    <section class="stats">
      ${statCard('briefcase', s.open_jobs, 'Open jobs')}
      ${statCard('users', s.applicants_waiting, 'Applicants waiting')}
      ${statCard('calendar', s.upcoming_count, 'Upcoming bookings')}
      ${statCard('wallet', money(s.booked_month), 'Booked this month')}
    </section>
    <button class="banner" data-go="banner">
      <span class="banner-ico">${ico('plus', 34)}</span>
      <span class="banner-t"><strong>Post a job</strong><span>Tell cadets what you need, or ask a cadet directly.</span></span>
      <span class="banner-go">${ico('chevron', 22)}</span>
    </button>
    ${upcomingHtml(d.next, false)}
    <section class="tiles"><div class="tilegrid">${tiles.join('')}</div>${addLink}</section>`);
}
