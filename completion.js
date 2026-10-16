// Loaded AFTER jobday.js. Adds the completion card to the booking screen and the admin disputes screen.

const _showBookingC = showBooking;
showBooking = async function (user, jobId) {
  await _showBookingC(user, jobId);
  const box = document.getElementById('results');
  if (!box) return;
  const r = await api('completion?job=' + encodeURIComponent(jobId));
  if (!r.ok) return;
  const c = r.data;
  let html = '';

  if (c.status === 'paid' || c.status === 'in_progress') {
    html += `<h2>Job day</h2><p>${esc(c.checked_in)} of ${esc(c.total)} cadet${c.total === 1 ? '' : 's'} checked in.</p>`;
    if (!c.started) {
      html += '<p class="fine">You can report a problem once the job starts, and confirm it once the job ends.</p>';
    }
    if (c.canConfirm) {
      html += `<p class="fine">If everything went well, confirm. Confirming means all ${esc(c.total)} cadet${c.total === 1 ? ' is' : 's are'} paid. If you do nothing, the job completes automatically on ${esc(c.auto_at)}, and only cadets who checked in are paid.</p>
        <p id="doneMsg" class="msg" role="alert"></p>
        <button id="confirmBtn" class="btn">Confirm job done</button>`;
    }
    if (c.canDispute) {
      html += `<h2 style="margin-top:.6rem">Something went wrong?</h2>
        <textarea id="reason" rows="3" maxlength="500" placeholder="Tell us what happened (at least 10 characters)"></textarea>
        <p id="disputeMsg" class="msg" role="alert"></p>
        <button id="disputeBtn" class="btn alt">Report a problem</button>`;
    }
  } else if (c.status === 'completed') {
    const by = c.completed_by === 'customer' ? 'You confirmed it.'
      : c.completed_by === 'auto' ? 'It completed automatically after 24 hours.'
      : 'The admin decided it after a review.';
    html += `<h2>Job completed</h2><p>${esc(by)} ${esc(c.checked_in)} of ${esc(c.total)} cadet${c.total === 1 ? '' : 's'} checked in.</p>
      ${c.resolution_note ? `<p class="fine">Admin note: ${esc(c.resolution_note)}</p>` : ''}
      <p class="fine">Payouts to cadets come in the payment step.</p>`;
  } else if (c.status === 'disputed') {
    html += `<h2>Problem reported</h2><p>${esc(c.dispute_reason)}</p>
      <p class="fine">The admin is reviewing it and may call you.</p>`;
  } else if (c.status === 'cancelled' && c.resolution === 'refund') {
    html += `<h2>Refund approved</h2><p class="fine">Admin note: ${esc(c.resolution_note)}</p>
      <p class="fine">The refund itself is handled in the payment step.</p>`;
  }

  if (!html) return;
  box.insertAdjacentHTML('beforeend', `<div class="card stack">${html}</div>`);

  const confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn) confirmBtn.onclick = async () => {
    if (!confirm(`Confirm that the job is done? All ${c.total} cadet${c.total === 1 ? '' : 's'} will be paid.`)) return;
    confirmBtn.disabled = true;
    const res = await api('completion', { action: 'confirm', id: jobId });
    if (!res.ok) {
      confirmBtn.disabled = false;
      document.getElementById('doneMsg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    showBooking(user, jobId);
  };

  const disputeBtn = document.getElementById('disputeBtn');
  if (disputeBtn) disputeBtn.onclick = async () => {
    const msg = document.getElementById('disputeMsg');
    msg.textContent = '';
    const reason = document.getElementById('reason').value;
    if (reason.trim().length < 10) { msg.textContent = 'Describe the problem in at least 10 characters.'; return; }
    if (!confirm('Report this problem to the admin? Payment is held while the admin reviews it.')) return;
    disputeBtn.disabled = true;
    const res = await api('completion', { action: 'dispute', id: jobId, reason });
    if (!res.ok) {
      disputeBtn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    showBooking(user, jobId);
  };
};

// ---------- Admin: disputes ----------
async function showAdminDisputes(user) {
  app.innerHTML = `<main class="shell">${header('Disputes')}
    <p class="fine">Customers who reported a problem. Check who checked in, call both sides, then decide. For now this only records your decision. Real refunds and payouts come in the payment step.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('completion?disputes=1');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((i) => `
          <div class="card stack" data-id="${esc(i.id)}">
            <h2>${esc(i.title)} <span class="pill bad">disputed</span></h2>
            <p>${esc(niceDate(i.event_date))} in ${esc(i.area)}. ${esc(i.people_count)} cadet${i.people_count === 1 ? '' : 's'}, ${money(i.subtotal)} paid.</p>
            <p>Customer: ${esc(i.customer_name)}<br>${phoneLink(i.customer_phone)}</p>
            <p>Complaint: ${esc(i.dispute_reason)}</p>
            <h2 style="margin-top:.4rem">Cadets</h2>
            ${i.people.map((p) => `
              <p>${esc(p.full_name)}: ${phoneLink(p.phone)}<br>
              <span class="fine">${p.checked_in_at ? 'Checked in ' + esc(timeOf(p.checked_in_at)) : 'Never checked in'}${p.checked_out_at ? ', finished ' + esc(timeOf(p.checked_out_at)) : ''}, ${esc(p.pings)} location updates</span></p>`).join('')}
            <textarea rows="2" maxlength="300" placeholder="Your decision note (required)"></textarea>
            <p class="msg"></p>
            <button class="btn" data-act="release">Pay cadets who checked in</button>
            <button class="btn alt" data-act="refund">Refund the customer</button>
          </div>`).join('')
      : '<p class="fine">No open disputes.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const note = card.querySelector('textarea').value.trim();
    const msg = card.querySelector('.msg');
    if (note.length < 5) { msg.textContent = 'Write a note of at least 5 characters first.'; return; }
    const act = btn.dataset.act;
    if (!confirm(act === 'release' ? 'Pay the cadets who checked in?' : 'Refund the customer?')) return;
    btn.disabled = true;
    const res = await api('completion', { action: 'resolve', id: card.dataset.id, resolution: act, note });
    if (!res.ok) {
      btn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}

// Admin button on the customer home
const _loadCustomerPanelC = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelC(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:.6rem"><button id="adminDisputes" class="btn alt">Admin: disputes</button></div>');
  document.getElementById('adminDisputes').onclick = () => showAdminDisputes(user);
};
