// Loaded AFTER jobs.js. Functions with the same name here replace the ones in jobs.js.

function jobCard(j, mode, extra) {
  const own = mode === 'own';
  const pill = j.status === 'cancelled' ? 'bad' : j.status === 'open' ? 'good' : '';
  let action = '';

  if (own) {
    if (j.status !== 'cancelled') {
      const c = extra || { applied: 0, selected: 0 };
      action = `<p class="fine">${esc(c.selected)} of ${esc(j.people_needed)} chosen, ${esc(c.applied)} waiting</p>
        <button class="btn" data-act="applicants">View applicants</button>`;
      if (j.status === 'open' || j.status === 'filled') action += `<button class="btn alt" data-act="cancel">Cancel this job</button>`;
    }
  } else if (extra === 'applied') {
    action = `<p class="fine">You applied. Waiting for the customer to choose.</p>`;
  } else if (extra === 'selected') {
    action = `<p class="fine">You are chosen for this job.</p>`;
  } else {
    action = `<textarea rows="2" maxlength="200" placeholder="Short message to the customer (optional)"></textarea>
      <p class="msg"></p>
      <button class="btn" data-act="apply">Apply for this job</button>`;
  }

  return `
    <div class="card stack" data-id="${esc(j.id)}">
      <h2>${esc(j.title)}${own ? ` <span class="pill ${pill}">${esc(j.status)}</span>` : ''}</h2>
      <p>${esc(j.event_type)} in ${esc(j.area)}</p>
      <p>${esc(niceDate(j.event_date))}, ${esc(j.start_time)} to ${esc(j.end_time)}</p>
      <p>${esc(j.people_needed)} people needed, ${money(j.pay_per_person)} each</p>
      <p>Skills: ${esc((j.skills || []).join(', '))}</p>
      ${j.description ? `<p>${esc(j.description)}</p>` : ''}
      ${!own ? `<p class="fine">Posted by ${esc(j.customer_name)}. Exact address is shared after booking.</p>` : ''}
      ${action}
    </div>`;
}

// ---------- Cadet: find jobs (with Apply) ----------
function showJobSearch(user) {
  app.innerHTML = `<main class="shell">${header('Find jobs')}${filtersHtml()}</main>`;
  document.getElementById('back').onclick = () => showHome(user);

  const run = async () => {
    const box = document.getElementById('results');
    box.innerHTML = '<p class="fine">Loading...</p>';
    const [r, mine] = await Promise.all([api('jobs?' + filterQuery()), api('applications?applied=1')]);
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    const map = {};
    if (mine.ok) mine.data.items.forEach((x) => { map[x.job_id] = x.status; });
    box.innerHTML = r.data.jobs.length
      ? r.data.jobs.map((j) => jobCard(j, 'public', map[j.id])).join('')
      : '<p class="fine">No jobs match. Try a wider area or another date.</p>';
  };

  document.getElementById('results').onclick = async (e) => {
    const btn = e.target.closest('button[data-act="apply"]');
    if (!btn) return;
    const card = btn.closest('.card');
    const msg = card.querySelector('.msg');
    btn.disabled = true;
    msg.textContent = '';
    const res = await api('applications', {
      action: 'apply',
      jobId: card.dataset.id,
      message: card.querySelector('textarea').value
    });
    if (!res.ok) {
      btn.disabled = false;
      msg.textContent = res.data.error || 'Something went wrong.';
      return;
    }
    run();
  };

  document.getElementById('filters').onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

// ---------- Customer: my jobs (with applicant counts) ----------
async function showMyJobs(user) {
  app.innerHTML = `<main class="shell">${header('My jobs')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  const [r, c] = await Promise.all([api('jobs?mine=1'), api('applications?counts=1')]);
  if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
  const counts = {};
  if (c.ok) c.data.items.forEach((x) => { counts[x.job_id] = x; });

  box.innerHTML = r.data.jobs.length
    ? r.data.jobs.map((j) => jobCard(j, 'own', counts[j.id])).join('')
    : '<p class="fine">You have not posted any job yet.</p>';

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    if (btn.dataset.act === 'applicants') return showApplicants(user, id);
    if (btn.dataset.act === 'cancel') {
      if (!confirm('Cancel this job?')) return;
      btn.disabled = true;
      const res = await api('jobs', { action: 'cancel', id });
      if (!res.ok) { btn.disabled = false; alert(res.data.error || 'Could not cancel.'); return; }
      showMyJobs(user);
    }
  };
}

// ---------- Customer: applicants for one job ----------
async function showApplicants(user, jobId) {
  app.innerHTML = `<main class="shell">${header('Applicants')}
    <p id="summary" class="fine"></p>
    <div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showMyJobs(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('applications?job=' + encodeURIComponent(jobId));
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    const { job, applicants } = r.data;
    const chosen = applicants.filter((a) => a.status === 'selected').length;
    const full = chosen >= job.people_needed;
    document.getElementById('summary').textContent =
      `${chosen} of ${job.people_needed} chosen.` + (job.status === 'filled' ? ' This job is full.' : '') +
      ' Phone numbers are shared after payment (coming soon).';

    box.innerHTML = applicants.length
      ? applicants.map((a) => `
          <div class="card stack" data-id="${esc(a.id)}">
            <h2>${esc(a.first_name)} <span class="pill ${a.status === 'selected' ? 'good' : ''}">${a.status === 'selected' ? 'chosen' : 'applied'}</span></h2>
            <p>${esc(a.organisation)}, ${esc(a.unit)}</p>
            <p>Skills: ${esc((a.skills || []).join(', '))}</p>
            <p>Rate: ${money(a.daily_rate)} per day</p>
            ${a.message ? `<p>${esc(a.message)}</p>` : ''}
            <p class="msg"></p>
            ${a.status === 'selected'
              ? `<button class="btn alt" data-act="unselect">Remove from job</button>`
              : `<button class="btn" data-act="select" ${full ? 'disabled' : ''}>Choose this cadet</button>`}
          </div>`).join('')
      : '<p class="fine">No one has applied yet.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    btn.disabled = true;
    const res = await api('applications', { action: btn.dataset.act, id: card.dataset.id });
    if (!res.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}

// ---------- Cadet: my applications ----------
async function showMyApplications(user) {
  app.innerHTML = `<main class="shell">${header('My applications')}<div id="results" class="stack"><p class="fine">Loading...</p></div></main>`;
  document.getElementById('back').onclick = () => showHome(user);
  const box = document.getElementById('results');

  async function load() {
    const r = await api('applications?mine=1');
    if (!r.ok) { box.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`; return; }
    box.innerHTML = r.data.items.length
      ? r.data.items.map((a) => {
          const cancelled = a.job_status === 'cancelled';
          const label = cancelled ? 'job cancelled' : a.status === 'selected' ? 'chosen' : 'waiting';
          const cls = cancelled ? 'bad' : a.status === 'selected' ? 'good' : '';
          return `
            <div class="card stack" data-id="${esc(a.id)}">
              <h2>${esc(a.title)} <span class="pill ${cls}">${esc(label)}</span></h2>
              <p>${esc(a.event_type)} in ${esc(a.area)}</p>
              <p>${esc(niceDate(a.event_date))}, ${esc(a.start_time)} to ${esc(a.end_time)}</p>
              <p>${money(a.pay_per_person)} for you. Posted by ${esc(a.customer_name)}.</p>
              ${a.status === 'selected' && !cancelled
                ? '<p class="fine">You are chosen. Payment and venue details come in the next steps.</p>' : ''}
              <p class="msg"></p>
              ${cancelled ? '' : '<button class="btn alt" data-act="withdraw">Withdraw</button>'}
            </div>`;
        }).join('')
      : '<p class="fine">You have not applied to any job yet.</p>';
  }

  box.onclick = async (e) => {
    const btn = e.target.closest('button[data-act="withdraw"]');
    if (!btn) return;
    if (!confirm('Withdraw from this job?')) return;
    const card = btn.closest('.card');
    btn.disabled = true;
    const res = await api('applications', { action: 'withdraw', id: card.dataset.id });
    if (!res.ok) {
      btn.disabled = false;
      card.querySelector('.msg').textContent = res.data.error || 'Something went wrong.';
      return;
    }
    load();
  };
  load();
}

// ---------- Cadet home buttons (adds My applications) ----------
function loadCadetActions(user) {
  const box = document.getElementById('cadetActions');
  if (!box) return;
  box.innerHTML = `
    <div class="card"><h2>Find work</h2>
      <p>Browse jobs near you, or tell customers when you are free.</p></div>
    <div class="stack" style="margin-top:1rem">
      <button id="findJobs" class="btn">Find jobs</button>
      <button id="myApps" class="btn alt">My applications</button>
      <button id="postAvail" class="btn alt">Post when I am free</button>
      <button id="myAvail" class="btn alt">My availability</button>
    </div>`;
  document.getElementById('findJobs').onclick = () => showJobSearch(user);
  document.getElementById('myApps').onclick = () => showMyApplications(user);
  document.getElementById('postAvail').onclick = () => showAvailForm(user);
  document.getElementById('myAvail').onclick = () => showMyAvail(user);
}
