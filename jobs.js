const EVENT_TYPES = ['Wedding', 'Burial', 'Church event', 'School event', 'Corporate event', 'Party', 'Concert or show', 'Other'];

const money = (n) => '₦' + Number(n).toLocaleString();
const niceDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function skillBoxes(name) {
  return SKILLS.map((s) =>
    `<label class="pick"><input type="checkbox" name="${name}" value="${esc(s)}" /><span>${esc(s)}</span></label>`
  ).join('');
}
function picked(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
}

function header(title) {
  return `<div class="top"><h1 style="font-size:1.9rem">${esc(title)}</h1><button id="back" class="link">Back</button></div>`;
}

function filtersHtml() {
  return `
    <form id="filters" class="form">
      <label>Area
        <input id="fArea" type="text" placeholder="Example: Ikeja" />
      </label>
      <label>Skill
        <select id="fSkill">
          <option value="">Any skill</option>
          ${SKILLS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </label>
      <label>Date
        <input id="fDate" type="date" min="${todayStr()}" />
      </label>
      <button class="btn" type="submit">Search</button>
    </form>
    <div id="results" class="stack"></div>`;
}

function filterQuery() {
  const p = new URLSearchParams();
  const area = document.getElementById('fArea').value.trim();
  const skill = document.getElementById('fSkill').value;
  const date = document.getElementById('fDate').value;
  if (area) p.set('area', area);
  if (skill) p.set('skill', skill);
  if (date) p.set('date', date);
  return p.toString();
}

// ---------- Customer home panel ----------
function loadCustomerPanel(user) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="card"><h2>What do you need?</h2>
      <p>Post a job and cadets will apply, or search for cadets who are free on your date.</p></div>
    <div class="stack" style="margin-top:1rem">
      <button id="postJob" class="btn">Post a job</button>
      <button id="findCadets" class="btn alt">Find cadets</button>
      <button id="myJobs" class="btn alt">My jobs</button>
    </div>`;
  document.getElementById('postJob').onclick = () => showJobForm(user);
  document.getElementById('findCadets').onclick = () => showCadetSearch(user);
  document.getElementById('myJobs').onclick = () => showMyJobs(user);
}

// ---------- Customer: post a job ----------
function showJobForm(user) {
  app.innerHTML = `
    <main class="shell">
      ${header('Post a job')}
      <form id="jobForm" class="form">
        <label>Job title (example: 6 ushers for wedding)
          <input id="title" type="text" maxlength="80" required />
        </label>
        <label>Type of event
          <select id="eventType" required>
            <option value="">Choose one</option>
            ${EVENT_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </label>
        <label>Area of the event (example: Lekki)
          <input id="area" type="text" required />
        </label>
        <p class="fine">Do not type the full address here. You will share the exact venue after you book and pay.</p>
        <label>Date
          <input id="date" type="date" min="${todayStr()}" required />
        </label>
        <label>Start time
          <input id="startTime" type="time" required />
        </label>
        <label>End time
          <input id="endTime" type="time" required />
        </label>
        <label>How many people do you need?
          <input id="people" type="number" min="1" max="100" inputmode="numeric" required />
        </label>
        <label>Pay for each person (naira)
          <input id="pay" type="number" min="500" max="500000" inputmode="numeric" required />
        </label>

        <h2>Skills you need</h2>
        ${skillBoxes('jobSkill')}

        <label>More details (optional)
          <textarea id="description" rows="3" maxlength="500"></textarea>
        </label>

        <p id="msg" class="msg" role="alert"></p>
        <button id="post" class="btn" type="submit">Post job</button>
      </form>
    </main>`;

  document.getElementById('back').onclick = () => showHome(user);
  document.getElementById('jobForm').onsubmit = async (e) => {
    e.preventDefault();
    const skills = picked('jobSkill');
    if (!skills.length) return say('Pick at least one skill you need.');
    const btn = document.getElementById('post');
    btn.disabled = true;
    say('');
    const r = await api('jobs', {
      title: document.getElementById('title').value,
      eventType: document.getElementById('eventType').value,
      area: document.getElementById('area').value,
      date: document.getElementById('date').value,
      startTime: document.getElementById('startTime').value,
      endTime: document.getElementById('endTime').value,
      people: document.getElementById('people').value,
      pay: document.getElementById('pay').value,
      description: document.getElementById('description').value,
      skills
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    showMyJobs(user);
  };
}

// ---------- Customer: my jobs ----------
function jobCard(j, mode) {
  const own = mode === 'own';
  const pill = j.status === 'cancelled' ? 'bad' : 'good';
  return `
    <div class="card stack" data-id="${esc(j.id)}">
      <h2>${esc(j.title)}${own ? ` <span class="pill ${pill}">${esc(j.status)}</span>` : ''}</h2>
      <p>${esc(j.event_type)} in ${esc(j.area)}</p>
      <p>${esc(niceDate(j.event_date))}, ${esc(j.start_time)} to ${esc(j.end_time)}</p>
      <p>${esc(j.people_needed)} people needed, ${money(j.pay_per_person)} each</p>
      <p>Skills: ${esc((j.skills || []).join(', '))}</p>
      ${j.description ? `<p>${esc(j.description)}</p>` : ''}
      ${!own ? `<p class="fine">Posted by ${esc(j.customer_name)}. Exact address is shared after booking.</p>
                <button class="btn" disabled>Apply (coming in the next step)</button>` : ''}
      ${own && j.status === 'open' ? `<button class="btn alt" data-act="cancel">Cancel this job</button>` : ''}
    </div>`;
}

async function showMyJobs(user) {
  app.innerHTML = `<main class="shell">${header('My jobs')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');
  const r = await api('jobs?mine=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  box.innerHTML = r.data.jobs.length
    ? r.data.jobs.map((j) => jobCard(j, 'own')).join('')
    : '<p class="fine">You have not posted any job yet.</p>';
  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="cancel"]');
    if (!btn) return;
    if (!confirm('Cancel this job?')) return;
    btn.disabled = true;
    const res = await api('jobs', { action: 'cancel', id: btn.closest('.card').dataset.id });
    if (!res.ok) { btn.disabled = false; alert(res.data.error || 'Could not cancel.'); return; }
    showMyJobs(user);
  };
}

// ---------- Customer: find cadets ----------
function availCard(a, mode) {
  const own = mode === 'own';
  const pill = a.status === 'cancelled' ? 'bad' : 'good';
  return `
    <div class="card stack" data-id="${esc(a.id)}">
      <h2>${own ? esc(niceDate(a.available_date)) : esc(a.first_name)}${own ? ` <span class="pill ${pill}">${esc(a.status)}</span>` : ''}</h2>
      ${own ? '' : `<p>${esc(a.organisation)}, ${esc(a.unit)}</p>`}
      <p>${own ? '' : esc(niceDate(a.available_date)) + ', '}${esc(a.from_time)} to ${esc(a.to_time)} in ${esc(a.area)}</p>
      ${own ? '' : `<p>Skills: ${esc((a.skills || []).join(', '))}</p>
                    <p>${money(a.daily_rate)} per day</p>`}
      ${a.note ? `<p>${esc(a.note)}</p>` : ''}
      ${own ? (a.status === 'active' ? `<button class="btn alt" data-act="cancel">Cancel this listing</button>` : '')
            : `<button class="btn" disabled>Request (coming in the next step)</button>`}
    </div>`;
}

function showCadetSearch(user) {
  app.innerHTML = `<main class="shell">${header('Find cadets')}${filtersHtml()}</main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const run = async () => {
    const box = document.getElementById('results');
    box.innerHTML = '<p class="fine">Loading...</p>';
    const r = await api('availability?' + filterQuery());
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((a) => availCard(a, 'public')).join('')
      : '<p class="fine">No cadets match. Try a wider area or another date.</p>';
  };
  document.getElementById('filters').onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

// ---------- Cadet home panel ----------
function loadCadetActions(user) {
  const box = document.getElementById('cadetActions');
  if (!box) return;
  box.innerHTML = `
    <div class="card"><h2>Find work</h2>
      <p>Browse jobs near you, or tell customers when you are free.</p></div>
    <div class="stack" style="margin-top:1rem">
      <button id="findJobs" class="btn">Find jobs</button>
      <button id="postAvail" class="btn alt">Post when I am free</button>
      <button id="myAvail" class="btn alt">My availability</button>
    </div>`;
  document.getElementById('findJobs').onclick = () => showJobSearch(user);
  document.getElementById('postAvail').onclick = () => showAvailForm(user);
  document.getElementById('myAvail').onclick = () => showMyAvail(user);
}

// ---------- Cadet: find jobs ----------
function showJobSearch(user) {
  app.innerHTML = `<main class="shell">${header('Find jobs')}${filtersHtml()}</main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const run = async () => {
    const box = document.getElementById('results');
    box.innerHTML = '<p class="fine">Loading...</p>';
    const r = await api('jobs?' + filterQuery());
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.jobs.length
      ? r.data.jobs.map((j) => jobCard(j, 'public')).join('')
      : '<p class="fine">No jobs match. Try a wider area or another date.</p>';
  };
  document.getElementById('filters').onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

// ---------- Cadet: post availability ----------
function showAvailForm(user) {
  app.innerHTML = `
    <main class="shell">
      ${header('When are you free?')}
      <form id="availForm" class="form">
        <label>Area where you can work (example: Ikeja)
          <input id="area" type="text" required />
        </label>
        <label>Date
          <input id="date" type="date" min="${todayStr()}" required />
        </label>
        <label>Free from
          <input id="fromTime" type="time" required />
        </label>
        <label>Free until
          <input id="toTime" type="time" required />
        </label>
        <label>Note (optional)
          <textarea id="note" rows="2" maxlength="200"></textarea>
        </label>
        <p class="fine">Customers will see your daily rate from your cadet profile.</p>
        <p id="msg" class="msg" role="alert"></p>
        <button id="save" class="btn" type="submit">Post availability</button>
      </form>
    </main>`;
  document.getElementById('back').onclick = () => showHome(user);
  document.getElementById('availForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save');
    btn.disabled = true;
    say('');
    const r = await api('availability', {
      area: document.getElementById('area').value,
      date: document.getElementById('date').value,
      fromTime: document.getElementById('fromTime').value,
      toTime: document.getElementById('toTime').value,
      note: document.getElementById('note').value
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    showMyAvail(user);
  };
}

// ---------- Cadet: my availability ----------
async function showMyAvail(user) {
  app.innerHTML = `<main class="shell">${header('My availability')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');
  const r = await api('availability?mine=1');
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  box.innerHTML = r.data.items.length
    ? r.data.items.map((a) => availCard(a, 'own')).join('')
    : '<p class="fine">You have not posted any availability yet.</p>';
  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="cancel"]');
    if (!btn) return;
    if (!confirm('Cancel this listing?')) return;
    btn.disabled = true;
    const res = await api('availability', { action: 'cancel', id: btn.closest('.card').dataset.id });
    if (!res.ok) { btn.disabled = false; alert(res.data.error || 'Could not cancel.'); return; }
    showMyAvail(user);
  };
}
