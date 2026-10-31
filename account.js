// Loaded AFTER cancellations.js. My account: edit details, change password, delete account.

// A "My account" link appears under the greeting on the home screen
new MutationObserver(() => {
  const top = document.querySelector('#app .top');
  const out = document.getElementById('logout');
  if (!top || !out || document.getElementById('acctBtn')) return;
  top.insertAdjacentHTML('afterend',
    '<button id="acctBtn" class="link" style="align-self:flex-start;padding:0 .5rem">My account</button>');
  document.getElementById('acctBtn').onclick = async () => {
    const me = await api('me');
    if (me.ok) showAccount(me.data.user);
  };
}).observe(document.getElementById('app'), { childList: true, subtree: true });

const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

async function showAccount(user) {
  app.innerHTML = `<main class="shell">${header('My account')}<div id="acct" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = async () => {
    const me = await api('me');
    if (me.ok) showHome(me.data.user); else showAuth('login');
  };

  const r = await api('account');
  const box = document.getElementById('acct');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const u = r.data.user;
  const c = r.data.cadet && ['approved', 'pending'].includes(r.data.cadet.status) ? r.data.cadet : null;

  const cadetFields = c ? `
    <h2>Cadet details</h2>
    <label>Your daily rate in naira
      <input id="aRate" type="number" min="500" max="500000" inputmode="numeric" value="${esc(c.daily_rate)}" required />
    </label>
    <h2>Skills you offer</h2>
    ${SKILLS.map((s) => `<label class="pick"><input type="checkbox" name="accSkill" value="${esc(s)}" ${(c.skills || []).includes(s) ? 'checked' : ''} /><span>${esc(s)}</span></label>`).join('')}
    <label>About you (optional, short)
      <textarea id="aBio" rows="3" maxlength="300">${esc(c.bio || '')}</textarea>
    </label>
    <p class="fine">To change your organisation, unit, guarantor or ID photo, please contact the admin.</p>` : '';

  box.innerHTML = `
    <div class="card">
      <form id="detailsForm" class="form">
        <h2>Your details</h2>
        <p class="fine">Email: ${esc(u.email)}</p>
        <label>Full name
          <input id="aName" type="text" autocomplete="name" value="${esc(u.full_name || '')}" required />
        </label>
        <label>Phone number
          <input id="aPhone" type="tel" autocomplete="tel" value="${esc(u.phone || '')}" required />
        </label>
        <label>Area
          <input id="aArea" type="text" value="${esc(u.area || '')}" required />
        </label>
        ${cadetFields}
        <p id="msgDetails" class="msg" role="alert"></p>
        <button id="saveDetails" class="btn" type="submit">Save changes</button>
      </form>
    </div>

    <div class="card">
      <form id="passForm" class="form">
        <h2>Change password</h2>
        <label>Current password
          <input id="pCur" type="password" autocomplete="current-password" required />
        </label>
        <label>New password (at least 8 characters)
          <input id="pNew" type="password" minlength="8" autocomplete="new-password" required />
        </label>
        <label>Type the new password again
          <input id="pNew2" type="password" minlength="8" autocomplete="new-password" required />
        </label>
        <p id="msgPass" class="msg" role="alert"></p>
        <button id="savePass" class="btn alt" type="submit">Change password</button>
      </form>
    </div>

    <div class="card">
      <form id="delForm" class="form">
        <h2>Delete my account</h2>
        <p class="fine">This removes your name, phone number, email and ID photo, and cancels your open jobs and listings. Records of money (bookings and payments) must be kept, but they will show "Deleted user" instead of your name. This cannot be undone.</p>
        <p class="fine">You cannot delete while you have an unfinished booking, earnings not yet paid out, or a refund still owed.</p>
        <label>Your password
          <input id="dPass" type="password" autocomplete="current-password" required />
        </label>
        <label>Type the word DELETE to confirm
          <input id="dWord" type="text" autocomplete="off" required />
        </label>
        <p id="msgDelete" class="msg" role="alert"></p>
        <button id="delBtn" class="btn danger" type="submit">Delete my account</button>
      </form>
    </div>`;

  document.getElementById('detailsForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveDetails');
    put('msgDetails', '');
    const body = {
      action: 'update',
      fullName: document.getElementById('aName').value,
      phone: document.getElementById('aPhone').value,
      area: document.getElementById('aArea').value
    };
    if (c) {
      body.cadet = {
        dailyRate: document.getElementById('aRate').value,
        bio: document.getElementById('aBio').value,
        skills: [...document.querySelectorAll('input[name="accSkill"]:checked')].map((i) => i.value)
      };
      if (!body.cadet.skills.length) return put('msgDetails', 'Pick at least one skill.');
    }
    btn.disabled = true;
    const res = await api('account', body);
    btn.disabled = false;
    put('msgDetails', res.ok ? 'Saved.' : (res.data.error || 'Something went wrong.'));
  };

  document.getElementById('passForm').onsubmit = async (e) => {
    e.preventDefault();
    put('msgPass', '');
    const next = document.getElementById('pNew').value;
    if (next !== document.getElementById('pNew2').value) return put('msgPass', 'The two new passwords are not the same.');
    const btn = document.getElementById('savePass');
    btn.disabled = true;
    const res = await api('account', { action: 'password', current: document.getElementById('pCur').value, password: next });
    btn.disabled = false;
    if (!res.ok) return put('msgPass', res.data.error || 'Something went wrong.');
    ['pCur', 'pNew', 'pNew2'].forEach((id) => { document.getElementById(id).value = ''; });
    put('msgPass', 'Password changed. Your other devices were logged out.');
  };

  document.getElementById('delForm').onsubmit = async (e) => {
    e.preventDefault();
    put('msgDelete', '');
    if (document.getElementById('dWord').value.trim() !== 'DELETE') return put('msgDelete', 'Type the word DELETE (in capital letters) to confirm.');
    if (!confirm('Delete your account for good? This cannot be undone.')) return;
    const btn = document.getElementById('delBtn');
    btn.disabled = true;
    const res = await api('account', {
      action: 'delete',
      password: document.getElementById('dPass').value,
      confirm: document.getElementById('dWord').value.trim()
    });
    btn.disabled = false;
    if (!res.ok) return put('msgDelete', res.data.error || 'Something went wrong.');
    showAuth('login');
    say('Your account has been deleted.');
  };
}
