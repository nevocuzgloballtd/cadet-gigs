// Loaded AFTER passwordreset.js. Cancelling a booking, pulling out of a job, and the admin overview.

const whenText = (iso) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

// ---------- Customer: cancellation card on the booking screen ----------
const _showBookingCN = showBooking;
showBooking = async function (user, jobId) {
  await _showBookingCN(user, jobId);
  const box = document.getElementById('results');
  if (!box) return;
  const r = await api('cancellations?job=' + encodeURIComponent(jobId));
  if (!r.ok) return;
  const c = r.data;
  let html = '';

  if (c.canCancel) {
    const policy = !c.paid
      ? 'You have not paid yet, so cancelling costs nothing.'
      : c.fullRefund
        ? `If you cancel now, you get a full refund of ${money(c.refundNow)}.`
        : `The job starts in less than ${c.freeHours} hours, so if you cancel now you get ${c.latePercent}% back (${money(c.refundNow)}). The rest compensates the cadets who kept the day free.`;
    html += `<h2>Need to cancel?</h2>
      <p>${esc(policy)}</p>
      <p class="fine">You get a full refund if you cancel more than ${esc(c.freeHours)} hours before the job. Once the job starts you cannot cancel, but you can report a problem.</p>
      <textarea id="cancelReason" rows="2" maxlength="300" placeholder="Why are you cancelling? (required)"></textarea>
      <p id="cancelMsg" class="msg" role="alert"></p>
      <button id="cancelBtn" class="btn danger">Cancel this booking</button>`;
  }

  if (c.status === 'cancelled') {
    const who = c.cancelledBy === 'customer' ? 'You cancelled this booking.'
      : c.cancelledBy === 'system' ? 'The booking was cancelled because every cadet pulled out.'
      : 'The admin cancelled this booking after reviewing a problem.';
    const total = (c.removedRefund || 0) + (c.refundAmount || 0);
    html += `<h2>Booking cancelled</h2><p>${esc(who)}</p>
      ${c.cancelReason ? `<p class="fine">Reason: ${esc(c.cancelReason)}</p>` : ''}
      <p>Refund due to you: ${money(total)}</p>
      <p class="fine">Refunds are paid out once online payment is switched on.</p>`;
  } else if (c.removed > 0) {
    html += `<h2>Cadet update</h2>
      <p>${esc(c.removed)} cadet${c.removed === 1 ? '' : 's'} pulled out of this job.</p>
      <p class="fine">${c.paid
        ? `${money(c.removedRefund)} of your payment will be refunded to you. You can post a new job for the missing spot.`
        : 'Your total is lower now. You can post a new job for the missing spot.'}</p>`;
  }

  if (c.noShows > 0) {
    html += `<h2>No-shows</h2>
      <p>${esc(c.noShows)} booked cadet${c.noShows === 1 ? '' : 's'} did not check in. Their share will be refunded to you.</p>`;
  }

  if (!html) return;
  box.insertAdjacentHTML('beforeend', `<div class="card stack">${html}</div>`);

  const btn = document.getElementById('cancelBtn');
  if (btn) btn.onclick = async () => {
    const msg = document.getElementById('cancelMsg');
    msg.textContent = '';
    const reason = document.getElementById('cancelReason').value;
    if (reason.trim().length < 5) { msg.textContent = 'Write a short reason first (at least 5 characters).'; return; }
    if (!confirm('Cancel this booking? This cannot be undone.')) return;
    btn.disabled = true;
    const res = await api('cancellations', { action: 'cancel', id: c.id, reason });
    if (!res.ok) {
      btn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    showBooking(user, jobId);
  };
};

// ---------- Cadet: pull out of a booked job ----------
const _showMyBookingsCN = showMyBookings;
showMyBookings = async function (user) {
  await _showMyBookingsCN(user);
  const box = document.getElementById('results');
  if (!box) return;
  const r = await api('cancellations?mine=1');
  if (!r.ok || !r.data.items.length) return;
  const cards = r.data.items.map((i) => `
    <div class="card stack" data-id="${esc(i.booking_id)}">
      <h2>${esc(i.title)}</h2>
      <p class="fine">${esc(niceDate(i.event_date))}, starts ${esc(i.start_time)}</p>
      <p class="fine">${i.hours_to_start < 24
        ? 'This is less than 24 hours before the job. A late pull-out is recorded and the admin will see it.'
        : 'Pulling out early is fine, but the admin sees how often it happens.'}</p>
      <textarea rows="2" maxlength="300" placeholder="Reason (required)"></textarea>
      <p class="msg" role="alert"></p>
      <button class="btn alt" data-act="pullout">Pull out of this job</button>
    </div>`).join('');
  box.insertAdjacentHTML('beforeend',
    `<div id="pullBox" class="stack"><h2 style="margin:.6rem 0 0">Cannot make it?</h2>${cards}</div>`);

  document.getElementById('pullBox').onclick = async (e) => {
    const btn = e.target.closest('button[data-act="pullout"]');
    if (!btn) return;
    const card = btn.closest('.card');
    const msg = card.querySelector('.msg');
    const reason = card.querySelector('textarea').value;
    msg.textContent = '';
    if (reason.trim().length < 5) { msg.textContent = 'Write a short reason first (at least 5 characters).'; return; }
    if (!confirm('Pull out of this job? The customer will be told.')) return;
    btn.disabled = true;
    const res = await api('cancellations', { action: 'pullout', id: card.dataset.id, reason });
    if (!res.ok) {
      btn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    showMyBookings(user);
  };
};

// ---------- Admin: cancellations, pull-outs and no-shows ----------
async function showAdminCancellations(user) {
  app.innerHTML = `<main class="shell">${header('Cancellations')}
    <p class="fine">Use this to spot people who keep pulling out or not showing up. The counts are for the last 90 days.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');
  const r = await api('cancellations?admin=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const { cancellations, pullouts, noshows } = r.data;

  const cancelHtml = cancellations.map((c) => `
    <div class="card stack">
      <h2>${esc(c.title)} <span class="pill bad">${esc(c.cancelled_by === 'customer' ? 'customer cancelled' : 'all cadets out')}</span></h2>
      <p>${esc(niceDate(c.event_date))}. Customer: ${esc(c.customer_name)}<br>${phoneLink(c.customer_phone)}</p>
      <p>${c.paid_at ? 'Was paid' : 'Not paid'}. Refund due: ${money((c.refund_amount || 0) + (c.removed_refund || 0))} of ${money(c.subtotal)}</p>
      ${c.cancel_reason ? `<p class="fine">Reason: ${esc(c.cancel_reason)}</p>` : ''}
    </div>`).join('');

  const pullHtml = pullouts.map((p) => `
    <div class="card stack">
      <h2>${esc(p.full_name)} <span class="pill ${p.late_removal ? 'bad' : ''}">${p.late_removal ? 'late pull-out' : 'pull-out'}</span></h2>
      <p>${phoneLink(p.phone)}</p>
      <p>${esc(p.title)}, ${esc(niceDate(p.event_date))}. Pulled out ${esc(whenText(p.removed_at))}.</p>
      <p class="fine">${esc(p.recent_count)} pull-out${p.recent_count === 1 ? '' : 's'} in the last 90 days</p>
      <p class="fine">Reason: ${esc(p.removed_reason)}</p>
    </div>`).join('');

  const noHtml = noshows.map((n) => `
    <div class="card stack">
      <h2>${esc(n.full_name)} <span class="pill bad">no-show</span></h2>
      <p>${phoneLink(n.phone)}</p>
      <p>${esc(n.title)}, ${esc(niceDate(n.event_date))}</p>
      <p class="fine">${esc(n.recent_count)} no-show${n.recent_count === 1 ? '' : 's'} in the last 90 days</p>
    </div>`).join('');

  box.innerHTML = `
    <h2 style="margin:0">Cancelled bookings (${cancellations.length})</h2>
    ${cancelHtml || '<p class="fine">None yet.</p>'}
    <h2 style="margin:.6rem 0 0">Cadet pull-outs (${pullouts.length})</h2>
    ${pullHtml || '<p class="fine">None yet.</p>'}
    <h2 style="margin:.6rem 0 0">No-shows (${noshows.length})</h2>
    ${noHtml || '<p class="fine">None yet.</p>'}`;
}

const _loadCustomerPanelCN = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelCN(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:.6rem"><button id="adminCancels" class="btn alt">Admin: cancellations</button></div>');
  document.getElementById('adminCancels').onclick = () => showAdminCancellations(user);
};
