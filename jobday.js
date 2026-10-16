// Loaded AFTER bookings.js. Job day: check-in, location pings, check-out, SOS, and the admin live view.

const PING_EVERY_MS = 3 * 60 * 1000;
const activeJobs = new Set();
let pingTimer = null;
let wakeLock = null;
let liveTimer = null;

const timeOf = (iso) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';
const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const agoText = (iso) => { const m = minutesSince(iso); return m < 1 ? 'just now' : m + ' min ago'; };
const mapLink = (lat, lng) => `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;

// ---------- Location ----------
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// ---------- Tracking while on a job ----------
async function sendPings() {
  if (!activeJobs.size) return stopTracking();
  const pos = await getPosition();
  if (!pos) return;
  for (const id of [...activeJobs]) {
    const r = await api('jobday', { action: 'ping', bookingId: id, ...pos });
    if (r.status === 409 || r.status === 404) activeJobs.delete(id);
  }
  if (!activeJobs.size) stopTracking();
}

function startTracking(id) {
  activeJobs.add(id);
  if (!pingTimer) pingTimer = setInterval(sendPings, PING_EVERY_MS);
  keepScreenOn();
}

function stopTracking() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  releaseScreen();
}

async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {}
}

function releaseScreen() {
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeJobs.size) {
    keepScreenOn();
    sendPings();
  }
});

// If the cadet reopens the app in the middle of a job, tracking continues
async function resumeTracking() {
  const r = await api('jobday?today=1');
  if (!r.ok) return;
  r.data.items.forEach((i) => {
    if (i.checked_in_at && !i.checked_out_at) startTracking(i.booking_id);
  });
}

// ---------- Cadet: job day screen ----------
async function showJobDay(user) {
  app.innerHTML = `<main class="shell">${header('Job day')}
    <p class="fine">Jobs you are booked for today. After you check in, your location is shared with the admin every few minutes until you finish the job. Keep the app open.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('jobday?today=1');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    if (!r.data.items.length) {
      box.innerHTML = '<p class="fine">You have no paid job today. A job shows here on its date, after the customer pays.</p>';
      return;
    }
    box.innerHTML = r.data.items.map((i) => {
      const done = !!i.checked_out_at;
      const on = !!i.checked_in_at && !done;
      let state, body;
      if (done) {
        state = 'finished';
        body = `<p class="fine">You finished at ${esc(timeOf(i.checked_out_at))}. Well done.</p>`;
      } else if (on) {
        state = 'on the job';
        body = `<p class="fine">Checked in at ${esc(timeOf(i.checked_in_at))}. Last location update: ${i.last_ping ? esc(agoText(i.last_ping)) : 'sending soon'}. Keep this app open.</p>
                <button class="btn" data-act="checkout">Finish job</button>`;
      } else {
        state = 'not started';
        body = `<p class="fine">When you reach the venue, tap the button. This shares your location with the admin until you finish.</p>
                <button class="btn" data-act="checkin">I have arrived, start job</button>`;
      }
      return `
        <div class="card stack" data-id="${esc(i.booking_id)}">
          <h2>${esc(i.title)} <span class="pill ${done ? 'good' : ''}">${esc(state)}</span></h2>
          <p>${esc(i.event_type)} in ${esc(i.area)}, ${esc(i.start_time)} to ${esc(i.end_time)}</p>
          <p>Venue: ${i.venue_address ? esc(i.venue_address) : 'The customer has not added the venue yet. Call them.'}</p>
          <p>Customer: ${esc(i.customer_name)}<br>${phoneLink(i.customer_phone)}</p>
          ${body}
          <p class="msg"></p>
          ${done ? '' : '<button class="btn danger" data-act="sos">SOS: I need help</button>'}
        </div>`;
    }).join('');
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const msg = card.querySelector('.msg');
    msg.textContent = '';

    if (act === 'sos' && !confirm('Send an SOS alert with your location to the admin?')) return;
    if (act === 'checkout' && !confirm('Finish this job?')) return;

    btn.disabled = true;
    msg.textContent = 'Getting your location...';
    const pos = await getPosition();
    if (!pos && act === 'checkin') {
      btn.disabled = false;
      msg.textContent = 'We could not get your location. Allow location for this app in your phone settings, then try again.';
      return;
    }
    msg.textContent = '';
    const r = await api('jobday', { action: act, bookingId: id, ...(pos || {}) });
    btn.disabled = false;
    if (!r.ok) { msg.textContent = r.data.error || 'Something went wrong.'; return; }

    if (act === 'checkin') startTracking(id);
    if (act === 'checkout') { activeJobs.delete(id); if (!activeJobs.size) stopTracking(); }
    if (act === 'sos') {
      msg.textContent = 'SOS sent. The admin can see your last location. If you are in danger, also call the emergency number 112.';
      return;
    }
    load();
  };

  load();
}

// ---------- Admin: live jobs and SOS ----------
async function showLiveJobs(user) {
  if (liveTimer) clearInterval(liveTimer);
  app.innerHTML = `<main class="shell">${header('Live jobs')}
    <p class="fine">Refreshes every 30 seconds. Location is the last point the cadet's phone sent while the app was open. Nothing alerts you automatically yet, so keep this screen open on job days.</p>
    <div id="liveBox" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => { clearInterval(liveTimer); showHome(user); };
  const box = document.getElementById('liveBox');

  const who = (x) => `
    <p>${esc(x.full_name)}: ${phoneLink(x.phone)}</p>
    <p class="fine">Guarantor: ${esc(x.guarantor_name)}${x.guarantor_role ? ' (' + esc(x.guarantor_role) + ')' : ''}: ${phoneLink(x.guarantor_phone)}</p>`;

  async function load() {
    const r = await api('adminjobday');
    if (!document.getElementById('liveBox')) { clearInterval(liveTimer); return; }
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    const { sos, onJob, late } = r.data;

    const sosHtml = sos.map((s) => `
      <div class="card stack" data-sos="${esc(s.id)}">
        <h2>SOS <span class="pill bad">${esc(agoText(s.created_at))}</span></h2>
        ${who(s)}
        <p>${esc(s.title)} in ${esc(s.area)}</p>
        <p class="fine">Venue: ${s.venue_address ? esc(s.venue_address) : 'not added'}</p>
        <p>${s.lat != null ? `<a class="link" style="padding:0" target="_blank" rel="noopener" href="${esc(mapLink(s.lat, s.lng))}">Open last location in Google Maps</a>` : 'Location was not available. Call the cadet and the guarantor.'}</p>
        <p class="msg"></p>
        <button class="btn alt" data-act="resolve">Mark as resolved</button>
      </div>`).join('');

    const onHtml = onJob.map((x) => {
      const stale = !x.ping_at || minutesSince(x.ping_at) > 15;
      return `
        <div class="card stack">
          <h2>${esc(x.full_name)} <span class="pill ${stale ? 'bad' : 'good'}">${x.ping_at ? esc(agoText(x.ping_at)) : 'no location'}</span></h2>
          ${who(x)}
          <p>${esc(x.title)} in ${esc(x.area)}, checked in ${esc(timeOf(x.checked_in_at))}</p>
          <p>${x.lat != null ? `<a class="link" style="padding:0" target="_blank" rel="noopener" href="${esc(mapLink(x.lat, x.lng))}">Open last location in Google Maps</a>` : ''}</p>
          ${stale ? '<p class="fine">No update for over 15 minutes. The phone may be locked or the app closed. Call the cadet.</p>' : ''}
        </div>`;
    }).join('');

    const lateHtml = late.map((x) => `
      <div class="card stack">
        <h2>${esc(x.full_name)} <span class="pill bad">not checked in</span></h2>
        ${who(x)}
        <p>${esc(x.title)} in ${esc(x.area)}, started ${esc(x.start_time)}</p>
      </div>`).join('');

    box.innerHTML = `
      <h2 style="margin:0">SOS alerts (${sos.length})</h2>
      ${sosHtml || '<p class="fine">No open SOS alerts.</p>'}
      <h2 style="margin:.6rem 0 0">On the job now (${onJob.length})</h2>
      ${onHtml || '<p class="fine">Nobody is checked in right now.</p>'}
      <h2 style="margin:.6rem 0 0">Late, not checked in (${late.length})</h2>
      ${lateHtml || '<p class="fine">Nobody is late.</p>'}`;
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="resolve"]');
    if (!btn) return;
    const card = btn.closest('.card');
    btn.disabled = true;
    const res = await api('adminjobday', { action: 'resolve', id: card.dataset.sos });
    if (!res.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };

  liveTimer = setInterval(load, 30000);
  load();
}

// ---------- Buttons on the home screens ----------
const _loadCadetActionsJD = loadCadetActions;
loadCadetActions = function (user) {
  _loadCadetActionsJD(user);
  const stack = document.querySelector('#cadetActions .stack');
  if (stack) {
    stack.insertAdjacentHTML('beforeend', '<button id="jobDay" class="btn alt">Job day</button>');
    document.getElementById('jobDay').onclick = () => showJobDay(user);
  }
  resumeTracking();
};

const _loadCustomerPanelJD = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelJD(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:.6rem"><button id="adminLive" class="btn alt">Admin: live jobs and SOS</button></div>');
  document.getElementById('adminLive').onclick = () => showLiveJobs(user);
};
