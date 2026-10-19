// Loaded AFTER requests.js. Password reset: the login screen link, the reset form, and the admin tool.

// ---------- Login screen: add a "Forgot your password?" link ----------
new MutationObserver(() => {
  const go = document.getElementById('go');
  const swap = document.getElementById('swap');
  if (!go || !swap || document.getElementById('forgot')) return;
  if (go.textContent.trim() !== 'Log in') return;
  swap.insertAdjacentHTML('afterend', '<button id="forgot" class="link">Forgot your password?</button>');
  document.getElementById('forgot').onclick = showForgot;
}).observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------- Anyone: set a new password with the admin's code ----------
function showForgot() {
  app.innerHTML = `<main class="shell">${header('Reset password')}
    <p class="fine">Contact the admin by phone or WhatsApp, using the number you registered with. The admin will confirm it is you and give you a code that works once, for 30 minutes.</p>
    <form id="resetForm" class="form">
      <label>Email
        <input id="rEmail" type="email" autocomplete="email" required />
      </label>
      <label>Code from the admin
        <input id="rCode" type="text" autocapitalize="characters" autocomplete="off" maxlength="12" required />
      </label>
      <label>New password (at least 8 characters)
        <input id="rPass" type="password" minlength="8" autocomplete="new-password" required />
      </label>
      <label>Type the new password again
        <input id="rPass2" type="password" minlength="8" autocomplete="new-password" required />
      </label>
      <p id="msg" class="msg" role="alert"></p>
      <button id="rGo" class="btn" type="submit">Set new password</button>
    </form></main>`;
  document.getElementById('back').onclick = () => showAuth('login');

  document.getElementById('resetForm').onsubmit = async (e) => {
    e.preventDefault();
    const pass = document.getElementById('rPass').value;
    if (pass !== document.getElementById('rPass2').value) return say('The two passwords are not the same.');
    const btn = document.getElementById('rGo');
    btn.disabled = true;
    say('');
    const r = await api('passwordreset', {
      action: 'use',
      email: document.getElementById('rEmail').value,
      code: document.getElementById('rCode').value,
      password: pass
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    showAuth('login');
    say('Password changed. Log in with your new password.');
  };
}

// ---------- Admin: create a reset code ----------
function showAdminReset(user) {
  app.innerHTML = `<main class="shell">${header('Password resets')}
    <p class="fine">Before you create a code, call the person on the phone number registered on their account (cadets also have a guarantor number) and confirm it is really them. Never send a code to a different number. Each code works once and expires in 30 minutes.</p>
    <form id="findForm" class="form">
      <label>Search by name, email or phone
        <input id="q" type="text" minlength="2" required />
      </label>
      <button class="btn" type="submit">Search</button>
    </form>
    <div id="results" class="stack"></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  document.getElementById('findForm').onsubmit = async (e) => {
    e.preventDefault();
    box.innerHTML = '<p class="fine">Searching...</p>';
    const r = await api('passwordreset?search=' + encodeURIComponent(document.getElementById('q').value));
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not search.')}</p>`; return; }
    box.innerHTML = r.data.users.length
      ? r.data.users.map((u) => `
          <div class="card stack" data-id="${esc(u.id)}">
            <h2>${esc(u.full_name || 'No name yet')}</h2>
            <p>${esc(u.email)}</p>
            <p>Phone: ${u.phone ? phoneLink(u.phone) : 'not set'}</p>
            ${u.guarantor_phone ? `<p class="fine">Guarantor: ${esc(u.guarantor_name)}, ${phoneLink(u.guarantor_phone)}</p>` : ''}
            <p class="msg"></p>
            <div class="codearea"></div>
            <button class="btn" data-act="create">Create reset code</button>
          </div>`).join('')
      : '<p class="fine">Nobody found.</p>';
  };

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="create"]');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!confirm('Have you confirmed by phone that this is really the account owner?')) return;
    btn.disabled = true;
    const r = await api('passwordreset', { action: 'create', userId: card.dataset.id });
    if (!r.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = r.data.error || 'Something went wrong.';
      return;
    }
    card.querySelector('.codearea').innerHTML = `
      <div class="codebox">${esc(r.data.code)}</div>
      <p class="fine">Valid for ${esc(r.data.minutes)} minutes, one use. Tell the person this code by phone. It will not show again.</p>`;
    btn.remove();
  };
}

const _loadCustomerPanelPR = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelPR(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:.6rem"><button id="adminReset" class="btn alt">Admin: password resets</button></div>');
  document.getElementById('adminReset').onclick = () => showAdminReset(user);
};
