const APP_NAME = 'Cadet Gigs';
const app = document.getElementById('app');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function say(text) {
  const el = document.getElementById('msg');
  if (el) el.textContent = text;
}

// Talks to our own backend (the files in the api folder)
async function api(path, body) {
  try {
    const r = await fetch('/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'No internet connection. Try again.' } };
  }
}

// ---------- Start ----------
async function start() {
  app.innerHTML = `<main class="shell"><h1>${APP_NAME}</h1><p class="tagline">Loading...</p></main>`;
  const r = await api('me');
  if (r.status === 401) return showAuth('login');
  if (!r.ok) return showError(r.data.error);
  route(r.data.user);
}

function showError(message) {
  app.innerHTML = `<main class="shell"><h1>${APP_NAME}</h1>
    <p class="tagline">${esc(message || 'Something went wrong.')}</p>
    <button class="btn" onclick="location.reload()">Try again</button></main>`;
}

function route(user) {
  if (!user.consented_at) return showOnboarding();
  showHome(user);
}

// ---------- Screen 1: Login / Sign up ----------
function showAuth(mode) {
  const isLogin = mode === 'login';
  app.innerHTML = `
    <main class="shell">
      <h1>${APP_NAME}</h1>
      <p class="tagline">${isLogin ? 'Log in to your account.' : 'Create your account.'}</p>
      <form id="authForm" class="form">
        <label>Email
          <input id="email" type="email" autocomplete="email" required />
        </label>
        <label>Password (at least 8 characters)
          <input id="password" type="password" minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required />
        </label>
        <p id="msg" class="msg" role="alert"></p>
        <button id="go" class="btn" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
      </form>
      <button id="swap" class="link">${isLogin ? 'No account yet? Create one' : 'Already have an account? Log in'}</button>
    </main>`;

  document.getElementById('swap').onclick = () => showAuth(isLogin ? 'signup' : 'login');

  document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('go');
    btn.disabled = true;
    say('');
    const r = await api(isLogin ? 'login' : 'signup', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    start();
  };
}

// ---------- Screen 2: Profile + consent ----------
function showOnboarding() {
  app.innerHTML = `
    <main class="shell">
      <h1>Set up your profile</h1>
      <form id="profileForm" class="form">
        <label>Full name
          <input id="fullName" type="text" autocomplete="name" required />
        </label>
        <label>Phone number
          <input id="phone" type="tel" autocomplete="tel" required />
        </label>
        <label>Area (example: Ikeja, Festac, Lekki)
          <input id="area" type="text" required />
        </label>

        <label class="pick"><input id="asCustomer" type="checkbox" checked />
          <span>I want to hire cadets for events</span></label>
        <label class="pick"><input id="asCadet" type="checkbox" />
          <span>I am a cadet and I want to take jobs</span></label>

        <label class="pick"><input id="age18" type="checkbox" required />
          <span>I am 18 years or older</span></label>

        <p class="fine">
          During a job I book or accept, this app records my phone's location every few minutes.
          Only the app admins can see my last known location, and only to help if something goes wrong.
          Location records are deleted after 60 days.
        </p>
        <label class="pick"><input id="consent" type="checkbox" required />
          <span>I agree to the terms and to location tracking during booked jobs</span></label>

        <p id="msg" class="msg" role="alert"></p>
        <button id="save" class="btn" type="submit">Save and continue</button>
      </form>
    </main>`;

  document.getElementById('profileForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save');
    btn.disabled = true;
    say('');
    const r = await api('profile', {
      fullName: document.getElementById('fullName').value,
      phone: document.getElementById('phone').value,
      area: document.getElementById('area').value,
      isCustomer: document.getElementById('asCustomer').checked,
      isCadet: document.getElementById('asCadet').checked,
      age18: document.getElementById('age18').checked,
      consent: document.getElementById('consent').checked
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    start();
  };
}

// ---------- Home: the dashboard is built in dashboard.js ----------
function getMode(user) {
  let saved = null;
  try { saved = localStorage.getItem('mode'); } catch (e) {}
  if (saved === 'cadet' && user.is_cadet) return 'cadet';
  if (saved === 'customer' && user.is_customer) return 'customer';
  return user.is_customer ? 'customer' : 'cadet';
}

function showHome(user) {
  renderDashboard(user);
}

start();
