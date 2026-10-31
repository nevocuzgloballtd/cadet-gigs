// Loaded AFTER account.js. One "Admin tools" hub, plus Users, Settings and the Activity log.

const OLD_ADMIN_BUTTONS = ['adminPay', 'adminLive', 'adminDisputes', 'adminRatings', 'adminReset', 'adminCancels'];

// On the Customer tab, the admin gets ONE button instead of many
const _loadCustomerPanelAH = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelAH(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  OLD_ADMIN_BUTTONS.forEach((id) => {
    const b = document.getElementById(id);
    if (!b) return;
    const wrap = b.parentElement;
    b.remove();
    if (wrap && wrap !== panel && !wrap.children.length) wrap.remove();
  });
  const old = document.getElementById('adminBtn');
  if (old) old.remove();
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:1rem"><button id="adminHub" class="btn">Admin tools</button></div>');
  document.getElementById('adminHub').onclick = () => showAdminHub(user);
};

// ---------- The hub ----------
async function showAdminHub(user) {
  app.innerHTML = `<main class="shell">${header('Admin tools')}<div id="hub" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('hub');

  const r = await api('adminusers?overview=1');
  const o = r.ok ? r.data : {};
  const n = (v) => (v > 0 ? ` (${v})` : '');

  const groups = [
    ['Needs attention', [
      ['sos', 'SOS and live jobs' + n(o.open_sos)],
      ['disputes', 'Disputes' + n(o.disputes)],
      ['cadets', 'Cadet applications' + n(o.pending_cadets)],
      ['cancels', 'Cancellations and no-shows']
    ]],
    ['People', [
      ['users', 'Users and suspensions' + n(o.suspended)],
      ['reset', 'Password resets'],
      ['ratings', 'Ratings and comments']
    ]],
    ['Money and rules', [
      ['payments', 'Test payments'],
      ['settings', 'Commission and cancellation settings'],
      ['log', 'Activity log']
    ]]
  ];

  const overview = r.ok ? `
    <div class="card stack">
      <h2>Overview</h2>
      <p>${esc(o.users)} people, ${esc(o.cadets)} approved cadets (${esc(o.pending_cadets)} waiting)</p>
      <p>${esc(o.open_jobs)} open jobs. Bookings: ${esc(o.awaiting_payment)} waiting for payment, ${esc(o.active_bookings)} paid or in progress, ${esc(o.completed)} completed.</p>
      <p class="fine">${esc(o.suspended)} suspended. Money totals will come with online payment.</p>
    </div>` : '<p class="msg">Could not load the numbers.</p>';

  box.innerHTML = overview + groups.map(([title, items]) => `
    <h2 style="margin:.6rem 0 0">${esc(title)}</h2>
    ${items.map(([key, label]) => `<button class="btn alt" data-go="${esc(key)}">${esc(label)}</button>`).join('')}`).join('');

  box.onclick = (e) => {
    const btn = e.target.closest('button[data-go]');
    if (!btn) return;
    const go = {
      sos: showLiveJobs, disputes: showAdminDisputes, cadets: showAdmin, cancels: showAdminCancellations,
      users: showAdminUsers, reset: showAdminReset, ratings: showAdminRatings,
      payments: showAdminPayments, settings: showAdminSettings, log: showAdminLog
    };
    const fn = go[btn.dataset.go];
    if (fn) fn(user);
  };
}

// ---------- Users and suspensions ----------
async function showAdminUsers(user) {
  app.innerHTML = `<main class="shell">${header('Users')}
    <form id="uForm" class="form">
      <label>Search by name, email or phone (leave empty to see the newest people)
        <input id="uq" type="text" />
      </label>
      <label>Show
        <select id="uf">
          <option value="all">Everyone</option>
          <option value="cadets">Cadets</option>
          <option value="customers">Customers</option>
          <option value="suspended">Suspended only</option>
        </select>
      </label>
      <button class="btn" type="submit">Search</button>
    </form>
    <div id="results" class="stack"></div></main>`;
  document.getElementById('back').onclick = () => showAdminHub(user);
  const box = document.getElementById('results');

  async function load() {
    box.innerHTML = '<p class="fine">Loading...</p>';
    const q = document.getElementById('uq').value;
    const f = document.getElementById('uf').value;
    const r = await api(`adminusers?users=1&search=${encodeURIComponent(q)}&filter=${encodeURIComponent(f)}`);
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((u) => {
          const roles = [u.is_admin ? 'Admin' : '', u.is_customer ? 'Customer' : '',
            u.is_cadet ? 'Cadet' + (u.cadet_status ? ' (' + u.cadet_status + ')' : '') : ''].filter(Boolean).join(', ') || 'No role yet';
          const suspended = !!u.suspended_at;
          return `
            <div class="card stack" data-id="${esc(u.id)}">
              <h2>${esc(u.full_name || 'No name yet')} ${suspended ? '<span class="pill bad">suspended</span>' : ''}</h2>
              <p>${esc(u.email)}</p>
              <p>${u.phone ? phoneLink(u.phone) : 'No phone yet'}${u.area ? ', ' + esc(u.area) : ''}</p>
              <p class="fine">${esc(roles)}. Joined ${esc(new Date(u.created_at).toLocaleDateString('en-NG'))}. Active bookings: ${esc(u.active_bookings)}</p>
              ${suspended ? `<p>Suspended: ${esc(u.suspended_reason)}</p>` : ''}
              <p class="msg" role="alert"></p>
              ${u.is_admin ? '' : suspended
                ? '<button class="btn" data-act="unsuspend">Unsuspend</button>'
                : `<textarea rows="2" maxlength="300" placeholder="Reason for suspending (required)"></textarea>
                   <button class="btn danger" data-act="suspend">Suspend this person</button>`}
            </div>`;
        }).join('')
      : '<p class="fine">Nobody found.</p>';
  }

  document.getElementById('uForm').onsubmit = (e) => { e.preventDefault(); load(); };

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const msg = card.querySelector('.msg');
    msg.textContent = '';
    const act = btn.dataset.act;
    let body = { action: act, userId: card.dataset.id };

    if (act === 'suspend') {
      const reason = card.querySelector('textarea').value.trim();
      if (reason.length < 5) { msg.textContent = 'Write a reason first (at least 5 characters).'; return; }
      if (!confirm('Suspend this person? They will be logged out and cannot log in. Their open jobs and listings will be cancelled.')) return;
      body.reason = reason;
    } else if (!confirm('Unsuspend this person? They can log in again, but their old jobs and listings stay cancelled.')) {
      return;
    }

    btn.disabled = true;
    const res = await api('adminusers', body);
    if (!res.ok) { btn.disabled = false; msg.textContent = res.data.error || 'Something went wrong.'; return; }
    if (act === 'suspend' && res.data.activeBookings > 0) {
      alert(`Done. Note: this person still has ${res.data.activeBookings} booking(s) in progress. Suspending does not cancel those. Please call the people involved and handle them yourself.`);
    }
    load();
  };

  load();
}

// ---------- Commission and cancellation settings ----------
async function showAdminSettings(user) {
  app.innerHTML = `<main class="shell">${header('Settings')}
    <p class="fine">Changes apply to new bookings and new cancellations. Bookings already made keep the commission they were made with.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showAdminHub(user);
  const box = document.getElementById('results');

  const r = await api('adminusers?settings=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const s = r.data.settings;

  const rows = [
    ['commission_percent', 'Commission (percent)',
      'The share of each cadet\'s pay that the platform keeps. Allowed: 0 to 50.', '0.5'],
    ['cancel_free_hours', 'Free cancellation (hours before the job)',
      'A customer who cancels earlier than this gets a full refund. Allowed: 0 to 720.', '1'],
    ['cancel_late_refund_percent', 'Refund for late cancellation (percent)',
      'A customer who cancels later than that gets this share back. Allowed: 0 to 100.', '1']
  ];

  box.innerHTML = rows.map(([key, label, help, step]) => `
    <div class="card">
      <form class="form" data-key="${esc(key)}">
        <label>${esc(label)}
          <input type="number" min="0" step="${esc(step)}" inputmode="decimal" value="${esc(s[key] ?? '')}" required />
        </label>
        <p class="fine">${esc(help)}</p>
        <p class="msg" role="alert"></p>
        <button class="btn" type="submit">Save</button>
      </form>
    </div>`).join('');

  box.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector('.msg');
    const btn = form.querySelector('button');
    msg.textContent = '';
    btn.disabled = true;
    const res = await api('adminusers', { action: 'setting', key: form.dataset.key, value: form.querySelector('input').value });
    btn.disabled = false;
    msg.textContent = res.ok ? 'Saved.' : (res.data.error || 'Something went wrong.');
  };
}

// ---------- Activity log ----------
async function showAdminLog(user) {
  app.innerHTML = `<main class="shell">${header('Activity log')}
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showAdminHub(user);
  const box = document.getElementById('results');
  const r = await api('adminusers?log=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const label = { suspend: 'Suspended', unsuspend: 'Unsuspended', setting: 'Setting changed' };
  box.innerHTML = r.data.items.length
    ? r.data.items.map((i) => `
        <div class="card stack">
          <h2>${esc(label[i.action] || i.action)}${i.target_name ? ': ' + esc(i.target_name) : ''}</h2>
          ${i.details ? `<p>${esc(i.details)}</p>` : ''}
          <p class="fine">By ${esc(i.admin_name || 'an admin')}, ${esc(new Date(i.created_at).toLocaleString('en-NG'))}</p>
        </div>`).join('')
    : '<p class="fine">Nothing has been recorded yet.</p>';
}
