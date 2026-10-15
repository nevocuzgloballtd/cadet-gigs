// Loaded AFTER applications.js. It adds the booking screens and wraps a few earlier functions.

const BOOKING_STATUS = {
  awaiting_payment: 'awaiting payment',
  paid: 'paid',
  in_progress: 'in progress',
  completed: 'completed',
  disputed: 'disputed',
  cancelled: 'cancelled'
};

// Customer: a booked job shows "View booking" instead of "View applicants"
const _jobCard = jobCard;
jobCard = function (j, mode, extra) {
  const html = _jobCard(j, mode, extra);
  if (mode === 'own' && j.status === 'booked') {
    return html.replace('data-act="applicants">View applicants', 'data-act="booking">View booking');
  }
  return html;
};

// Customer: add a "Confirm booking" button on the applicants screen
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

// Cadet: add a "My bookings" button on the cadet home
const _loadCadetActions = loadCadetActions;
loadCadetActions = function (user) {
  _loadCadetActions(user);
  const stack = document.querySelector('#cadetActions .stack');
  if (!stack) return;
  stack.insertAdjacentHTML('beforeend', '<button id="myBookings" class="btn alt">My bookings</button>');
  document.getElementById('myBookings').onclick = () => showMyBookings(user);
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

  box.innerHTML = `
    <div class="card stack">
      <h2>${esc(b.title)} <span class="pill">${esc(BOOKING_STATUS[b.status] || b.status)}</span></h2>
      <p>${esc(b.event_type)} in ${esc(b.area)}</p>
      <p>${esc(niceDate(b.event_date))}, ${esc(b.start_time)} to ${esc(b.end_time)}</p>
    </div>
    <div class="card stack">
      <h2>Cadets booked</h2>
      ${r.data.cadets.map((c) => `<p>${esc(c.first_name)}, ${esc(c.organisation)}, ${esc(c.unit)}</p>`).join('')}
    </div>
    <div class="card stack">
      <h2>Total to pay: ${money(b.subtotal)}</h2>
      <p>${esc(b.people_count)} cadet${b.people_count === 1 ? '' : 's'} at ${money(b.pay_per_person)} each.</p>
      <p class="fine">Payment opens in the next step. After you pay, you will see each cadet's phone number and can share the venue address.</p>
    </div>`;
}

// ---------- Cadet: my bookings ----------
async function showMyBookings(user) {
  app.innerHTML = `<main class="shell">${header('My bookings')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  const r = await api('bookings?mine=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }

  box.innerHTML = r.data.items.length
    ? r.data.items.map((i) => `
        <div class="card stack">
          <h2>${esc(i.title)} <span class="pill">${esc(BOOKING_STATUS[i.status] || i.status)}</span></h2>
          <p>${esc(i.event_type)} in ${esc(i.area)}</p>
          <p>${esc(niceDate(i.event_date))}, ${esc(i.start_time)} to ${esc(i.end_time)}</p>
          <p>You receive ${money(i.payable)}</p>
          <p class="fine">${money(i.gross)} job pay minus ${esc(Number(i.commission_percent))}% service fee (${money(i.fee)}). Booked by ${esc(i.customer_name)}. Venue address is shared after the customer pays.</p>
        </div>`).join('')
    : '<p class="fine">You have no bookings yet.</p>';
}
