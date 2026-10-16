// Loaded AFTER applications.js. Booking screens, plus wrappers around a few earlier functions.

const BOOKING_STATUS = {
  awaiting_payment: 'awaiting payment',
  paid: 'paid',
  in_progress: 'in progress',
  completed: 'completed',
  disputed: 'disputed',
  cancelled: 'cancelled'
};

const telHref = (p) => 'tel:' + String(p || '').replace(/[^0-9+]/g, '');
const phoneLink = (p) => `<a class="link" style="padding:0" href="${esc(telHref(p))}">${esc(p)}</a>`;

// Customer: a booked job shows "View booking" instead of "View applicants"
const _jobCard = jobCard;
jobCard = function (j, mode, extra) {
  const html = _jobCard(j, mode, extra);
  if (mode === 'own' && j.status === 'booked') {
    return html.replace('data-act="applicants">View applicants', 'data-act="booking">View booking');
  }
  return html;
};

// Customer: "Confirm booking" button on the applicants screen
const _showApplicants = showApplicants;
showApplicants = function (user, jobId) {
  _showApplicants(user, jobId);
  const summary = document.getElementById('summary');
  if (!summary) return;
  summary.insertAdjacentHTML('afterend', `
    <div class="stack">
      <p id="bookMsg" class="msg"></p>
      <button id="bookBtn" class="btn">Confirm booking with chosen cadets</button>
    </div>`);
  document.getElementById('bookBtn').onclick = async () => {
    const ok = confirm('Confirm booking with the cadets you chose? You will not be able to change the list after this. If you chose fewer people than you needed, you can only book those.');
    if (!ok) return;
    const btn = document.getElementById('bookBtn');
    btn.disabled = true;
    document.getElementById('bookMsg').textContent = '';
    const r = await api('bookings', { action: 'create', jobId });
    if (!r.ok) {
      btn.disabled = false;
      document.getElementById('bookMsg').textContent = r.data.error || 'Something went wrong.';
      return;
    }
    showBooking(user, jobId);
  };
};

// Cadet: "My bookings" button on the cadet home
const _loadCadetActions = loadCadetActions;
loadCadetActions = function (user) {
  _loadCadetActions(user);
  const stack = document.querySelector('#cadetActions .stack');
  if (!stack) return;
  stack.insertAdjacentHTML('beforeend', '<button id="myBookings" class="btn alt">My bookings</button>');
  document.getElementById('myBookings').onclick = () => showMyBookings(user);
};

// Admin: extra button on the customer home
const _loadCustomerPanel = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanel(user);
  if (!user.is_admin) return;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.insertAdjacentHTML('beforeend',
    '<div class="stack" style="margin-top:1rem"><button id="adminPay" class="btn alt">Admin: test payments</button></div>');
  document.getElementById('adminPay').onclick = () => showAdminPayments(user);
};

// "View booking" button on a booked job card
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act="booking"]');
  if (!btn) return;
  const card = btn.closest('.card');
  if (!card) return;
  const me = await api('me');
  if (me.ok) showBooking(me.data.user, card.dataset.id);
});

// ---------- Customer: booking details ----------
async function showBooking(user, jobId) {
  app.innerHTML = `<main class="shell">${header('Booking')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showMyJobs(user);
  const box = document.getElementById('results');

  const r = await api('bookings?job=' + encodeURIComponent(jobId));
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const b = r.data.booking;
  const unlocked = r.data.unlocked;

  const cadetsHtml = r.data.cadets.map((c) => `
    <p>${esc(c.first_name)}, ${esc(c.organisation)}, ${esc(c.unit)}${c.phone ? '<br>' + phoneLink(c.phone) : ''}</p>`).join('');

  let payHtml;
  if (!unlocked) {
    payHtml = `
      <div class="card stack">
        <h2>Total to pay: ${money(b.subtotal)}</h2>
        <p>${esc(b.people_count)} cadet${b.people_count === 1 ? '' : 's'} at ${money(b.pay_per_person)} each.</p>
        <p class="fine">Online payment is not switched on yet. For testing, the admin marks bookings as paid. After payment you will see each cadet's phone number and can add the venue address.</p>
      </div>`;
  } else {
    let venueHtml;
    if (b.venue_address) {
      venueHtml = `<h2>Venue</h2><p>${esc(b.venue_address)}</p>`;
    } else if (b.status === 'paid') {
      venueHtml = `
        <h2>Add the venue address</h2>
        <p class="fine">The cadets will see this address. Give enough detail for them to find the place.</p>
        <textarea id="venue" rows="3" maxlength="200" placeholder="Full address, landmark, and a contact person"></textarea>
        <p id="vmsg" class="msg" role="alert"></p>
        <button id="saveVenue" class="btn">Save venue address</button>`;
    } else {
      venueHtml = '<p class="fine">No venue address was added.</p>';
    }
    payHtml = `
      <div class="card stack">
        <h2>Paid: ${money(b.subtotal)}</h2>
        <p>${esc(b.people_count)} cadet${b.people_count === 1 ? '' : 's'} at ${money(b.pay_per_person)} each.</p>
      </div>
      <div class="card stack">${venueHtml}</div>`;
  }

  box.innerHTML = `
    <div class="card stack">
      <h2>${esc(b.title)} <span class="pill ${unlocked ? 'good' : ''}">${esc(BOOKING_STATUS[b.status] || b.status)}</span></h2>
      <p>${esc(b.event_type)} in ${esc(b.area)}</p>
      <p>${esc(niceDate(b.event_date))}, ${esc(b.start_time)} to ${esc(b.end_time)}</p>
    </div>
    <div class="card stack">
      <h2>Cadets booked</h2>
      ${cadetsHtml}
    </div>
    ${payHtml}`;

  const save = document.getElementById('saveVenue');
  if (save) save.onclick = async () => {
    const msg = document.getElementById('vmsg');
    msg.textContent = '';
    save.disabled = true;
    const res = await api('bookings', {
      action: 'venue',
      jobId,
      address: document.getElementById('venue').value
    });
    if (!res.ok) {
      save.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    showBooking(user, jobId);
  };
}

// ---------- Cadet: my bookings ----------
async function showMyBookings(user) {
  app.innerHTML = `<main class="shell">${header('My bookings')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  const r = await api('bookings?mine=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }

  box.innerHTML = r.data.items.length
    ? r.data.items.map((i) => {
        const details = i.unlocked
          ? `<p>Venue: ${i.venue_address ? esc(i.venue_address) : 'The customer has not added the venue yet.'}</p>
             <p>Customer: ${esc(i.customer_full_name)}<br>${phoneLink(i.customer_phone)}</p>`
          : '<p class="fine">Venue address and customer phone number are shared after the customer pays.</p>';
        return `
          <div class="card stack">
            <h2>${esc(i.title)} <span class="pill ${i.unlocked ? 'good' : ''}">${esc(BOOKING_STATUS[i.status] || i.status)}</span></h2>
            <p>${esc(i.event_type)} in ${esc(i.area)}</p>
            <p>${esc(niceDate(i.event_date))}, ${esc(i.start_time)} to ${esc(i.end_time)}</p>
            <p>You receive ${money(i.payable)}</p>
            <p class="fine">${money(i.gross)} job pay minus ${esc(Number(i.commission_percent))}% service fee (${money(i.fee)}). Booked by ${esc(i.customer_name)}.</p>
            ${details}
          </div>`;
      }).join('')
    : '<p class="fine">You have no bookings yet.</p>';
}

// ---------- Admin: test payments (TEMPORARY, removed when Paystack goes live) ----------
async function showAdminPayments(user) {
  app.innerHTML = `<main class="shell">${header('Test payments')}
    <p class="fine">Temporary admin tool. It marks a booking as paid without real money. Real payment replaces this later.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('adminbookings');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((i) => `
          <div class="card stack" data-id="${esc(i.id)}">
            <h2>${esc(i.title)} <span class="pill ${i.status === 'paid' ? 'good' : ''}">${esc(BOOKING_STATUS[i.status] || i.status)}</span></h2>
            <p>Customer: ${esc(i.customer_name)}</p>
            <p>${esc(niceDate(i.event_date))}, ${esc(i.people_count)} cadet${i.people_count === 1 ? '' : 's'}</p>
            <p>Total ${money(i.subtotal)}, your commission ${money(i.commission_total)}, cadets get ${money(i.payable_total)}</p>
            <p class="msg"></p>
            ${i.status === 'awaiting_payment'
              ? '<button class="btn" data-act="markPaid">Mark as paid (test)</button>'
              : '<button class="btn alt" data-act="markUnpaid">Reset to unpaid (test)</button>'}
          </div>`).join('')
      : '<p class="fine">No bookings waiting.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    btn.disabled = true;
    const res = await api('adminbookings', { action: btn.dataset.act, id: card.dataset.id });
    if (!res.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}
