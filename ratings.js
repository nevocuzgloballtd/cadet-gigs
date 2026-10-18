// Loaded AFTER completion.js. Ratings: stars after a completed job, and stars shown on cards.

const STAR_CHOICES = [
  ['5', '5 stars, excellent'],
  ['4', '4 stars, good'],
  ['3', '3 stars, okay'],
  ['2', '2 stars, poor'],
  ['1', '1 star, bad']
];
const starsText = (avg, count) => (count ? `★ ${Number(avg).toFixed(1)} (${count})` : 'New');

function rateForm(attrs, label) {
  return `
    <div class="form rate-row" ${attrs}>
      <p style="margin:0">${esc(label)}</p>
      <select class="stars">
        <option value="">Choose stars</option>
        ${STAR_CHOICES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
      </select>
      <input class="comment" type="text" maxlength="300" placeholder="Short comment (optional, only the admin sees it)" />
      <p class="msg" role="alert"></p>
      <button class="btn" data-act="rate">Submit rating</button>
    </div>`;
}

function wireRating(container, onDone) {
  if (!container) return;
  container.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="rate"]');
    if (!btn) return;
    const row = btn.closest('.rate-row');
    const msg = row.querySelector('.msg');
    const stars = row.querySelector('.stars').value;
    if (!stars) { msg.textContent = 'Choose how many stars first.'; return; }
    btn.disabled = true;
    msg.textContent = '';
    const res = await api('ratings', {
      action: 'rate',
      bookingId: row.dataset.b,
      participantId: row.dataset.p || undefined,
      stars,
      comment: row.querySelector('.comment').value
    });
    if (!res.ok) {
      btn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    onDone();
  };
}

// ---------- Customer: rate the cadets on the booking screen ----------
const _showBookingR = showBooking;
showBooking = async function (user, jobId) {
  await _showBookingR(user, jobId);
  const box = document.getElementById('results');
  if (!box) return;
  const r = await api('ratings?booking=' + encodeURIComponent(jobId));
  if (!r.ok || !r.data.items.length) return;
  const rows = r.data.items.map((i) => i.stars
    ? `<p>${esc(i.first_name)}: you gave ${esc(i.stars)} star${i.stars === 1 ? '' : 's'}. Thank you.</p>`
    : rateForm(`data-b="${esc(i.booking_id)}" data-p="${esc(i.participant_id)}"`, 'Rate ' + i.first_name)
  ).join('');
  box.insertAdjacentHTML('beforeend', `<div id="rateCard" class="card stack"><h2>Rate the cadets</h2>${rows}</div>`);
  wireRating(document.getElementById('rateCard'), () => showBooking(user, jobId));
};

// ---------- Cadet: rate customers on the bookings screen ----------
const _showMyBookingsR = showMyBookings;
showMyBookings = async function (user) {
  await _showMyBookingsR(user);
  const box = document.getElementById('results');
  if (!box) return;
  const r = await api('ratings?mine=1');
  if (!r.ok || !r.data.items.length) return;
  const cards = r.data.items.map((i) => `
    <div class="card stack">
      <h2>Rate ${esc(i.customer_name)}</h2>
      <p class="fine">${esc(i.title)}, ${esc(niceDate(i.event_date))}</p>
      ${rateForm(`data-b="${esc(i.booking_id)}"`, 'How was this customer?')}
    </div>`).join('');
  box.insertAdjacentHTML('beforeend',
    `<div id="rateBox" class="stack"><h2 style="margin:.6rem 0 0">Rate your customers</h2>${cards}</div>`);
  wireRating(document.getElementById('rateBox'), () => showMyBookings(user));
};

// ---------- Stars on cards (applicants, find cadets, find jobs) ----------
const RATING_KINDS = { 'Applicants': 'app', 'Find cadets': 'avail', 'Find jobs': 'job' };

async function decorateRatings() {
  const title = document.querySelector('#app .top h1');
  const kind = title ? RATING_KINDS[title.textContent.trim()] : null;
  if (!kind) return;
  const cards = [...document.querySelectorAll('#results .card[data-id]:not([data-rated])')];
  if (!cards.length) return;
  cards.forEach((c) => c.setAttribute('data-rated', '1'));
  const ids = cards.map((c) => c.dataset.id);
  const r = await api(`ratings?kind=${kind}&ids=${encodeURIComponent(ids.join(','))}`);
  if (!r.ok) return;
  cards.forEach((c) => {
    if (!c.isConnected) return;
    const s = r.data.summary[c.dataset.id] || { avg: null, count: 0 };
    const h2 = c.querySelector('h2');
    if (h2) h2.insertAdjacentHTML('beforeend', `<span class="pill ${s.count ? 'good' : ''}">${esc(starsText(s.avg, s.count))}</span>`);
  });
}
new MutationObserver(() => { decorateRatings(); }).observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------- My own rating on the home screen ----------
const _loadCadetPanelR = loadCadetPanel;
loadCadetPanel = async function (user) {
  await _loadCadetPanelR(user);
  const r = await api('ratings?me=1');
  const h2 = document.querySelector('#panel .card h2');
  if (r.ok && r.data.cadet.count && h2) {
    h2.insertAdjacentHTML('beforeend', `<span class="pill good">${esc(starsText(r.data.cadet.avg, r.data.cadet.count))}</span>`);
  }
};

const _loadCustomerPanelR = loadCustomerPanel;
loadCustomerPanel = function (user) {
  _loadCustomerPanelR(user);
  const panel = document.getElementById('panel');
  if (!panel) return;
  api('ratings?me=1').then((r) => {
    const card = panel.querySelector('.card');
    if (panel.isConnected && r.ok && r.data.customer.count && card) {
      card.insertAdjacentHTML('beforeend',
        `<p class="fine">Your rating as a customer: ${esc(starsText(r.data.customer.avg, r.data.customer.count))}</p>`);
    }
  });
  if (user.is_admin) {
    panel.insertAdjacentHTML('beforeend',
      '<div class="stack" style="margin-top:.6rem"><button id="adminRatings" class="btn alt">Admin: ratings</button></div>');
    document.getElementById('adminRatings').onclick = () => showAdminRatings(user);
  }
};

// ---------- Admin: ratings and comments ----------
async function showAdminRatings(user) {
  app.innerHTML = `<main class="shell">${header('Ratings')}
    <p class="fine">Latest ratings and comments. Only you can see the comments.</p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');
  const r = await api('ratings?admin=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  box.innerHTML = r.data.items.length
    ? r.data.items.map((i) => `
        <div class="card stack">
          <h2>${esc(i.stars)} star${i.stars === 1 ? '' : 's'} <span class="pill ${i.stars <= 2 ? 'bad' : 'good'}">${esc(i.ratee_role)}</span></h2>
          <p>${esc(i.rater_name)} rated ${esc(i.ratee_name)}</p>
          <p class="fine">${esc(i.title)}, ${esc(new Date(i.created_at).toLocaleDateString('en-NG'))}</p>
          ${i.comment ? `<p>${esc(i.comment)}</p>` : ''}
        </div>`).join('')
    : '<p class="fine">No ratings yet.</p>';
}
