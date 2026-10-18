// Loaded AFTER ratings.js. Direct requests: a customer asks a specific cadet, and the cadet answers.

// ---------- Find cadets: the Request button becomes real ----------
const _availCardRQ = availCard;
availCard = function (a, mode) {
  const html = _availCardRQ(a, mode);
  return html.replace(
    '<button class="btn" disabled>Request (coming in the next step)</button>',
    '<button class="btn" data-act="request">Request this cadet</button><div class="reqbox stack"></div>'
  );
};

document.addEventListener('click', async (e) => {
  // Open the request form inside the cadet's card
  const btn = e.target.closest('button[data-act="request"]');
  if (btn) {
    const card = btn.closest('.card');
    const box = card.querySelector('.reqbox');
    if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
    btn.disabled = true;
    box.innerHTML = '<p class="fine">Loading...</p>';
    const r = await api('requests?eligible=' + encodeURIComponent(card.dataset.id));
    btn.disabled = false;
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    if (!r.data.jobs.length) {
      box.innerHTML = `
        <p class="fine">You have no open job on this date that this cadet can take. Post a job for the same date first, then come back and send the request.</p>
        <button class="btn alt" data-act="postforreq">Post a job</button>`;
      return;
    }
    box.innerHTML = `
      <div class="form">
        <label>Which job is this for?
          <select class="reqjob">
            ${r.data.jobs.map((j) => `<option value="${esc(j.id)}">${esc(j.title)}, ${esc(j.start_time)} to ${esc(j.end_time)}, ${esc(j.people_needed)} people, ${money(j.pay_per_person)} each</option>`).join('')}
          </select>
        </label>
        <input class="reqmsg" type="text" maxlength="200" placeholder="Short message to the cadet (optional)" />
        <p class="msg" role="alert"></p>
        <button class="btn" data-act="sendreq">Send request</button>
      </div>`;
    return;
  }

  // Send it
  const send = e.target.closest('button[data-act="sendreq"]');
  if (send) {
    const card = send.closest('.card');
    const box = card.querySelector('.reqbox');
    const msg = box.querySelector('.msg');
    msg.textContent = '';
    send.disabled = true;
    const res = await api('requests', {
      action: 'send',
      availabilityId: card.dataset.id,
      jobId: box.querySelector('.reqjob').value,
      message: box.querySelector('.reqmsg').value
    });
    if (!res.ok) {
      send.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    box.innerHTML = '<p class="fine">Request sent. The cadet will see it and can accept or decline. If the cadet accepts, they show as chosen on your applicants list for that job.</p>';
    const open = card.querySelector('button[data-act="request"]');
    if (open) { open.disabled = true; open.textContent = 'Request sent'; }
    return;
  }

  // No job on that date: jump to the post-a-job form
  const post = e.target.closest('button[data-act="postforreq"]');
  if (post) {
    const me = await api('me');
    if (me.ok) showJobForm(me.data.user);
  }
});

// ---------- Cadet: job requests ----------
async function showCadetRequests(user) {
  app.innerHTML = `<main class="shell">${header('Job requests')}
    <p class="fine">Customers who asked for you by name. If you accept, you are chosen for that job.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('requests?mine=1');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((i) => `
          <div class="card stack" data-id="${esc(i.id)}">
            <h2>${esc(i.title)}</h2>
            <p>${esc(i.event_type)} in ${esc(i.area)}</p>
            <p>${esc(niceDate(i.event_date))}, ${esc(i.start_time)} to ${esc(i.end_time)}</p>
            <p>${esc(i.people_needed)} people needed, ${money(i.pay_per_person)} each</p>
            <p class="fine">Requested by ${esc(i.customer_name)}</p>
            ${i.message ? `<p>${esc(i.message)}</p>` : ''}
            <p class="msg"></p>
            <button class="btn" data-act="accept">Accept</button>
            <button class="btn alt" data-act="decline">Decline</button>
          </div>`).join('')
      : '<p class="fine">No requests waiting.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const decision = btn.dataset.act;
    if (decision === 'decline' && !confirm('Decline this request?')) return;
    card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const res = await api('requests', { action: 'respond', id: card.dataset.id, decision });
    if (!res.ok) {
      card.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}

// ---------- Customer: requests I sent ----------
async function showSentRequests(user) {
  app.innerHTML = `<main class="shell">${header('Requests I sent')}
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('requests?sent=1');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((i) => {
          const cls = i.status === 'accepted' ? 'good' : (i.status === 'declined' || i.status === 'cancelled') ? 'bad' : '';
          return `
            <div class="card stack" data-id="${esc(i.id)}">
              <h2>${esc(i.cadet_name)} <span class="pill ${cls}">${esc(i.status)}</span></h2>
              <p>${esc(i.title)}, ${esc(niceDate(i.event_date))}</p>
              ${i.status === 'accepted' ? '<p class="fine">Accepted. Open the job and choose or confirm from the applicants list.</p>' : ''}
              <p class="msg"></p>
              ${i.status === 'pending' ? '<button class="btn alt" data-act="cancel">Cancel request</button>' : ''}
            </div>`;
        }).join('')
      : '<p class="fine">You have not sent any request yet. Use Find cadets to ask a cadet by name.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="cancel"]');
    if (!btn) return;
    if (!confirm('Cancel this request?')) return;
    const card = btn.closest('.card');
    btn.disabled = true;
    const res = await api('requests', { action: 'cancel', id: card.dataset.id });
    if (!res.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}

// ---------- Home buttons ----------
const _loadCadetActionsRQ = loadCadetActions;
loadCadetActions = function (user) {
  _loadCadetActionsRQ(user);
  const stack = document.querySelector('#cadetActions .stack');
  if (!stack) return;
  stack.insertAdjacentHTML('beforeend', '<button id="jobRequests" class="btn alt">Job requests</button>');
  const btn = document.getElementById('jobRequests');
  btn.onclick = () => showCadetRequests(user);
  api('requests?count=1').then((r) => {
    if (btn.isConnected && r.ok && r.data.count > 0) btn.textContent = `Job requests (${r.data.count})`;
  });
};

const _loadCustomerPanelRQ = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelRQ(user);
  const stack = document.querySelector('#panel .stack');
  if (!stack) return;
  stack.insertAdjacentHTML('beforeend', '<button id="sentReqs" class="btn alt">Requests I sent</button>');
  document.getElementById('sentReqs').onclick = () => showSentRequests(user);
};
