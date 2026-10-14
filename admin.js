async function showAdmin(user) {
  app.innerHTML = `
    <main class="shell">
      <div class="top">
        <h1 style="font-size:1.9rem">Cadet applications</h1>
        <button id="back" class="link">Back</button>
      </div>
      <div id="list"><p class="fine">Loading...</p></div>
    </main>`;
  document.getElementById('back').onclick = () => showHome(user);
  loadAdminList();
}

async function loadAdminList() {
  const list = document.getElementById('list');
  const r = await api('admin');
  if (!r.ok) {
    list.innerHTML = `<p class="msg">${esc(r.data.error || 'Could not load.')}</p>`;
    return;
  }
  const items = r.data.applications;
  if (!items.length) {
    list.innerHTML = '<p class="fine">No applications yet.</p>';
    return;
  }
  list.innerHTML = items.map(adminCard).join('');
  list.onclick = onAdminClick;
}

function adminCard(a) {
  const pill = a.status === 'approved' ? 'good' : a.status === 'rejected' ? 'bad' : '';
  const actions = a.status === 'pending'
    ? `<textarea rows="2" placeholder="Note to the cadet (needed if you reject)"></textarea>
       <p class="msg"></p>
       <div class="row">
         <button class="btn" data-act="approved">Approve</button>
         <button class="btn alt" data-act="rejected">Reject</button>
       </div>`
    : (a.review_note ? `<p class="fine">Note: ${esc(a.review_note)}</p>` : '');

  return `
    <div class="card stack" data-id="${esc(a.id)}" style="margin-bottom:1rem">
      <h2>${esc(a.full_name)} <span class="pill ${pill}">${esc(a.status)}</span></h2>
      <p>${esc(a.phone)}, ${esc(a.area)}</p>
      <p>${esc(a.organisation)}, ${esc(a.unit)}</p>
      <p>Skills: ${esc((a.skills || []).join(', '))}</p>
      <p>Rate: ₦${Number(a.daily_rate).toLocaleString()} per day</p>
      ${a.bio ? `<p>${esc(a.bio)}</p>` : ''}
      <p>Guarantor: ${esc(a.guarantor_name)} (${esc(a.guarantor_role)}), ${esc(a.guarantor_phone)}</p>
      <div class="idbox"></div>
      <button class="btn alt" data-act="id">View ID photo</button>
      ${actions}
    </div>`;
}

async function onAdminClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.card');
  const id = card.dataset.id;
  const act = btn.dataset.act;

  if (act === 'id') {
    btn.disabled = true;
    const r = await api('admin?image=' + encodeURIComponent(id));
    btn.disabled = false;
    const box = card.querySelector('.idbox');
    if (!r.ok) { box.textContent = r.data.error || 'No ID photo found.'; return; }
    box.innerHTML = `<img alt="ID photo" src="${r.data.image}">`;
    return;
  }

  const note = card.querySelector('textarea').value.trim();
  const msg = card.querySelector('.msg');
  if (act === 'rejected' && note.length < 3) {
    msg.textContent = 'Write a short reason before you reject.';
    return;
  }
  if (!confirm(act === 'approved' ? 'Approve this cadet?' : 'Reject this application?')) return;

  btn.disabled = true;
  const r = await api('admin', { userId: id, decision: act, note });
  if (!r.ok) {
    btn.disabled = false;
    msg.textContent = r.data.error || 'Something went wrong.';
    return;
  }
  loadAdminList();
}
