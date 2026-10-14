const SKILLS = ['Ushering', 'Crowd control', 'Protocol', 'Traffic marshal', 'Drill instruction', 'First aid'];
const ORGS = ["Man O' War", 'Scouts', "Boys' Brigade", 'Red Cross cadets', 'Other'];

// Shrinks a photo on the phone so it uploads fast and uses little data
function compressImage(file, maxSide = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// Shows the cadet's verification status on the home screen
async function loadCadetPanel(user) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const r = await api('cadet');
  if (!r.ok) {
    panel.innerHTML = `<div class="card"><p>${esc(r.data.error || 'Could not load your cadet profile.')}</p></div>`;
    return;
  }
  const p = r.data.profile;

  if (!p) {
    panel.innerHTML = `
      <div class="card"><h2>Get verified</h2>
        <p>Fill in your cadet profile and upload your ID. After the admin approves you, you can take jobs.</p></div>
      <button id="startForm" class="btn" style="margin-top:1rem;width:100%">Start cadet profile</button>`;
    document.getElementById('startForm').onclick = () => showCadetForm(user);
    return;
  }

  if (p.status === 'approved') {
    panel.innerHTML = `
      <div class="card"><h2>Verified cadet <span class="pill good">approved</span></h2>
        <p>${esc(p.organisation)}, ${esc(p.unit)}</p>
        <p>Skills: ${esc((p.skills || []).join(', '))}</p>
        <p>Rate: ₦${Number(p.daily_rate).toLocaleString()} per day</p></div>
      <div class="card" style="margin-top:1rem"><h2>Jobs near you</h2>
        <p>Jobs will show here once customers start posting them.</p></div>`;
    return;
  }

  const rejected = p.status === 'rejected';
  panel.innerHTML = `
    <div class="card">
      <h2>${rejected ? 'Needs changes' : 'Under review'} <span class="pill ${rejected ? 'bad' : ''}">${esc(p.status)}</span></h2>
      <p>${rejected
        ? esc(p.review_note || 'Please check your details and send again.')
        : 'We received your profile. You will be able to take jobs once the admin approves it.'}</p>
    </div>
    <button id="editForm" class="btn alt" style="margin-top:1rem;width:100%">${rejected ? 'Fix and send again' : 'Edit my application'}</button>`;
  document.getElementById('editForm').onclick = () => showCadetForm(user);
}

// The cadet application form
function showCadetForm(user) {
  app.innerHTML = `
    <main class="shell">
      <div class="top">
        <h1 style="font-size:1.9rem">Cadet profile</h1>
        <button id="cancel" class="link">Cancel</button>
      </div>
      <form id="cadetForm" class="form">
        <label>Your organisation
          <select id="organisation" required>
            <option value="">Choose one</option>
            ${ORGS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
          </select>
        </label>
        <label>Unit or troop name
          <input id="unit" type="text" required />
        </label>

        <h2>Skills you can offer</h2>
        ${SKILLS.map((s) => `<label class="pick"><input type="checkbox" name="skill" value="${esc(s)}" /><span>${esc(s)}</span></label>`).join('')}

        <label>Your daily rate in naira
          <input id="rate" type="number" min="500" max="500000" inputmode="numeric" required />
        </label>
        <label>About you (optional, short)
          <textarea id="bio" rows="3" maxlength="300"></textarea>
        </label>

        <h2>Guarantor</h2>
        <p class="fine">Someone in your organisation who can vouch for you, like your unit commander. We may call them.</p>
        <label>Guarantor name
          <input id="gName" type="text" required />
        </label>
        <label>Guarantor phone number
          <input id="gPhone" type="tel" required />
        </label>
        <label>Guarantor role (example: Unit Commander)
          <input id="gRole" type="text" required />
        </label>

        <h2>ID photo</h2>
        <p class="fine">Take a clear photo of your organisation ID card. Only the admin can see it.</p>
        <label>ID card photo
          <input id="idFile" type="file" accept="image/*" required />
        </label>

        <p id="msg" class="msg" role="alert"></p>
        <button id="send" class="btn" type="submit">Send for approval</button>
      </form>
    </main>`;

  document.getElementById('cancel').onclick = () => showHome(user);

  document.getElementById('cadetForm').onsubmit = async (e) => {
    e.preventDefault();
    const skills = [...document.querySelectorAll('input[name="skill"]:checked')].map((i) => i.value);
    if (!skills.length) return say('Pick at least one skill.');
    const file = document.getElementById('idFile').files[0];
    if (!file) return say('Add a photo of your ID.');

    const btn = document.getElementById('send');
    btn.disabled = true;
    say('Sending...');

    let idImage;
    try {
      idImage = await compressImage(file);
    } catch (err) {
      btn.disabled = false;
      return say('Could not read that photo. Try another one.');
    }

    const r = await api('cadet', {
      organisation: document.getElementById('organisation').value,
      unit: document.getElementById('unit').value,
      skills,
      dailyRate: document.getElementById('rate').value,
      bio: document.getElementById('bio').value,
      guarantorName: document.getElementById('gName').value,
      guarantorPhone: document.getElementById('gPhone').value,
      guarantorRole: document.getElementById('gRole').value,
      idImage
    });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    start();
  };
}
