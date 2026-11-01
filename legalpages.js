// Loaded AFTER notifications.js. Terms of Use, Privacy Policy, and the "please accept the new terms" screen.
// IMPORTANT: this is a DRAFT. A Nigerian lawyer must review it before real users sign up.

const LEGAL = {
  draft: true, // change to false only after a lawyer has reviewed everything
  company: '[NEVOCUZ]',
  address: '[NO.3 ANUOLUWAPO STR]',
  email: '[nevocuzgloballtd@gmail.com]',
  updated: 'October 2026'
};

const fillLegal = (s) => s
  .replace(/\{company\}/g, LEGAL.company)
  .replace(/\{address\}/g, LEGAL.address)
  .replace(/\{email\}/g, LEGAL.email);

const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Use',
    sections: [
      ['About Cadet Gigs', [
        `Cadet Gigs is an online marketplace run by {company} ("we", "us"). It helps customers find and book trained cadets and youth-organisation members for event work such as ushering, crowd control, protocol, traffic marshalling, drill instruction and first aid.`,
        `We connect people. We are not the employer of any cadet, and we do not supervise their work. Each booking is an agreement between the customer and the cadets who are booked.`,
        `Cadets are not police officers, soldiers or licensed private security guards, and must never present themselves as any of these. Cadet Gigs is not part of, or approved by, the Nigerian Army, the Police, the NSCDC, any government body or any youth organisation, unless we say so in writing.`
      ]],
      ['Who can use the app', [
        `You must be at least 18 years old. You must give true information, keep one account only, and keep your password private. You are responsible for everything done through your account.`,
        `A cadet must really belong to the organisation they name, and must be allowed, under that organisation's rules and under the law, to take paid event work.`
      ]],
      ['Cadet verification', [
        `To take jobs, a cadet gives us their organisation, unit, an ID photo and a guarantor. The guarantor is someone in the organisation who can vouch for the cadet. Cadets must have their guarantor's permission before giving us their name and phone number. We may call the guarantor.`,
        `Approval means we checked the details you gave us. It does not promise that a cadet will behave well or do the work well. We may reject an application or take away approval at any time.`
      ]],
      ['Posting jobs and booking', [
        `A customer posts a job with its date, time, area, type of work, number of people and pay for each person. Details must be true and complete. The exact venue address is shared only after payment.`,
        `A customer can choose cadets from those who applied, or ask a cadet directly. A booking is made when the customer taps Confirm booking. After that, the list of cadets is locked.`,
        `Customers must not ask cadets to do anything illegal or dangerous, or anything outside the job described, and must not ask them to harm, threaten or harass anyone.`
      ]],
      ['Prices, service fee and payment', [
        `The pay for each person is set in the job. The customer pays the full job price. We keep a service fee, which is a percentage of each cadet's pay. A cadet sees what they will receive after the fee before they accept a job. We can change the percentage for future bookings.`,
        `Online payment is being introduced. When it is switched on, the customer pays through our payment partner, we hold the money until the job is completed, and then each cadet's share can be withdrawn to their bank account. Until it is switched on, the app only records bookings, and we are not responsible for any money arranged outside the app.`
      ]],
      ['Cancellations, no-shows and refunds', [
        `A customer can cancel a booking before the job starts. If the customer has not paid, cancelling is free. If the customer has paid, they get a full refund when they cancel more than 48 hours before the job starts, and 50% back when they cancel later. The rest goes to the cadets who kept the day free. These numbers may change, and the numbers shown in the app when you cancel are the ones that apply. After a job starts it cannot be cancelled, but a customer can report a problem.`,
        `A cadet can pull out before the job starts and must give a reason. A pull-out less than 24 hours before the job is recorded as late. The customer is refunded that cadet's share. A booked cadet who never checks in is a no-show, and their share is refunded to the customer. Repeated pull-outs or no-shows can lead to suspension.`,
        `Refunds are paid out once online payment is switched on.`
      ]],
      ['Finishing a job and disputes', [
        `After the job ends, the customer can confirm that it is done, and all booked cadets are then paid. If the customer does nothing, the job completes by itself 24 hours after the end time, and only cadets who checked in are paid.`,
        `From the start of the job until 24 hours after it ends, the customer can report a problem. Payment is then held while the admin looks at the check-in records, the location records and what both sides say, and may call people. The admin decides either to pay the cadets who checked in, or to refund the customer. We try to be fair. This decision is final inside the app, but it does not take away anyone's legal rights.`
      ]],
      ['Safety, check-in and location', [
        `When a cadet reaches the venue, they tap the check-in button. The app records the time and the phone's location, and then records the location every few minutes while the app is open, until the cadet finishes the job. Our admins can see the last known location. This is not live tracking. It stops when the phone is locked or the app is closed, and it can be wrong.`,
        `The SOS button sends an alert to our admins with the last location. It is not an emergency service. If you are in danger, call 112 or the police first.`,
        `Customers must give cadets safe working conditions and must pay for the work done.`
      ]],
      ['Rules of behaviour', [
        `Do not give false information, pretend to be someone else, threaten, abuse or discriminate against anyone, break the law, misuse ratings, or try to hack or overload the app.`,
        `Do not use the phone numbers you receive to arrange work outside the app so that the service fee is avoided.`
      ]],
      ['Ratings', [
        `After a job is completed, customers and cadets can rate each other. Be honest. Comments are seen only by our admins. We may remove ratings that are abusive or fake.`
      ]],
      ['Suspension and closing your account', [
        `We may suspend or close an account for breaking these terms, for safety reasons, for fraud, or after serious complaints. You can delete your own account at any time in My account, unless you have an unfinished booking or money still to be paid out or refunded. Some records must be kept, and they are kept without your name.`
      ]],
      ['Our responsibility', [
        `We provide the app as it is. We try to keep it working but it may sometimes be unavailable. We are not responsible for what customers or cadets do or fail to do, or for losses that come from the work done at an event. We do not limit any responsibility that the law does not allow us to limit.`
      ]],
      ['Changes and the law', [
        `We may change these terms. When we make an important change, we will ask you to read and accept the new version before you continue. If you do not accept, you can delete your account.`,
        `These terms are governed by the laws of Nigeria. If there is a problem, please talk to us first. If it cannot be solved, the courts of Lagos State can decide it.`,
        `Questions: {email}`
      ]]
    ]
  },

  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['Who we are', [
        `This policy explains how {company} ("we", "us") uses your personal information in the Cadet Gigs app. Our address is {address}. You can contact us at {email}.`
      ]],
      ['What we collect', [
        `Your account: email address, your password (stored in scrambled form, so we cannot read it), your name, phone number and area.`,
        `If you are a cadet: your organisation, unit, skills, daily rate, short bio, a photo of your ID card, and the name, phone number and role of your guarantor.`,
        `Your activity: jobs you post or apply for, requests, bookings, the venue address, ratings and comments, notifications, and your cancellations or pull-outs.`,
        `Location: only during a booked job. When a cadet checks in, finishes, or presses SOS, we record the phone's location. While the cadet is on the job and the app is open, we also record it about every three minutes. We do not track anyone outside a booked job.`,
        `Technical information: your internet address when you log in or sign up (to stop abuse), and a login cookie that keeps you signed in.`
      ]],
      ['Why we use it', [
        `To run the marketplace: to create accounts, show jobs and cadets, make bookings and share contact details after payment.`,
        `To keep people safe: to check cadets before approving them, to call guarantors, to handle SOS alerts and to look at last known locations if something goes wrong.`,
        `To handle money: to calculate fees, refunds and payouts, and (when online payment is on) to work with our payment partner.`,
        `To prevent fraud and abuse, to settle disputes, to send you notices about your account, and to meet our legal duties.`,
        `You agree to the use of your ID photo and your location when you accept our terms. You can ask us to stop at any time, but then you cannot take jobs.`
      ]],
      ['Who can see it', [
        `Other users see only a little. Customers see a cadet's first name, organisation, unit, skills, rate and rating. Cadets see a customer's first name and the job details. Phone numbers are shared only after a booking is paid. The exact venue address is shared only after payment.`,
        `Only our admins can see your ID photo, your guarantor details, the comments on ratings, and location records.`,
        `We use these service providers to run the app: Vercel (hosting), Neon (database), Brevo (emails) and Paystack (payments, when switched on). They handle data for us and under our instructions. Some of them store data outside Nigeria. We do not sell your information.`,
        `We may share information with the police or other authorities when the law requires it or when someone is in danger.`
      ]],
      ['How long we keep it', [
        `Location records are deleted after 60 days. Notifications are deleted after 60 days. Records of failed logins are deleted after a day. Your ID photo is kept while your account is open and is deleted when you delete your account.`,
        `Records of bookings and payments are kept for as long as the law and our accounting require. When you delete your account, your name, phone, email and ID photo are removed, and these records stay without your name.`
      ]],
      ['Your rights', [
        `You can ask to see the information we hold about you, to correct it, to delete it, to limit how we use it, or to take back your consent. You can correct your details and delete your account yourself in My account. For anything else, email {email}.`,
        `If you are not happy with how we handle your information, you can complain to the Nigeria Data Protection Commission.`
      ]],
      ['Keeping it safe', [
        `We store passwords in scrambled form, use secure connections, and limit who can see sensitive information. No system is perfectly safe. If a data breach puts you at risk, we will tell you and the Nigeria Data Protection Commission as the law requires.`
      ]],
      ['Children', [
        `Cadet Gigs is only for people aged 18 and over. If we find an account of someone under 18, we will close it.`
      ]],
      ['Changes', [
        `We may update this policy. When there is an important change, we will ask you to read and accept the new version.`
      ]]
    ]
  }
};

function legalHtml(kind) {
  const d = LEGAL_DOCS[kind];
  const draft = LEGAL.draft
    ? '<div class="card"><p><strong>Draft.</strong> This document has not yet been reviewed by a lawyer. The wording may change.</p></div>'
    : '';
  return draft + `<p class="fine">Last updated: ${esc(LEGAL.updated)}</p>` +
    d.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(fillLegal(p))}</p>`).join('')}`).join('');
}

// The document opens on top of the current screen, so nothing typed underneath is lost
function closeLegal() {
  const o = document.getElementById('legalOverlay');
  if (o) o.remove();
}

function openLegal(kind) {
  closeLegal();
  const d = LEGAL_DOCS[kind];
  const o = document.createElement('div');
  o.id = 'legalOverlay';
  o.className = 'legaloverlay';
  o.innerHTML = `<div class="legalwrap">
    <div class="top"><h1 style="font-size:1.6rem">${esc(d.title)}</h1><button id="legalClose" class="link">Close</button></div>
    <div class="legaltext">${legalHtml(kind)}</div></div>`;
  document.body.appendChild(o);
  document.getElementById('legalClose').onclick = closeLegal;
  o.scrollTop = 0;
}

const legalLinks = (id) => `<p id="${id}" class="fine">
  <button type="button" class="link" data-legal="terms" style="padding:0 .8rem 0 0">Read the Terms of Use</button>
  <button type="button" class="link" data-legal="privacy" style="padding:0">Read the Privacy Policy</button></p>`;

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-legal]');
  if (!b) return;
  e.preventDefault();
  openLegal(b.dataset.legal);
});

// ---------- "Our terms changed" screen ----------
function showTermsAccept(version) {
  app.innerHTML = `<main class="shell">
    <h1>Our terms changed</h1>
    <p class="tagline">Please read the updated Terms of Use and Privacy Policy. They explain how bookings, refunds, safety and your information work, including location sharing during booked jobs.</p>
    ${legalLinks('legalAccept')}
    <form id="acceptForm" class="form">
      <label class="pick"><input id="acceptBox" type="checkbox" required />
        <span>I have read and agree to the Terms of Use and the Privacy Policy, including location sharing during booked jobs</span></label>
      <p id="msg" class="msg" role="alert"></p>
      <button id="acceptBtn" class="btn" type="submit">I agree and continue</button>
    </form>
    <button id="acceptOut" class="link">Log out instead</button></main>`;

  document.getElementById('acceptForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('acceptBtn');
    btn.disabled = true;
    say('');
    const r = await api('terms', { action: 'accept', version });
    btn.disabled = false;
    if (!r.ok) return say(r.data.error || 'Something went wrong.');
    start();
  };
  document.getElementById('acceptOut').onclick = async () => { await api('logout', {}); showAuth('login'); };
}

let termsChecked = false;
async function checkTerms() {
  const r = await api('terms?status=1');
  if (r.ok && r.data.needs) showTermsAccept(r.data.current);
}

// Adds the links where people need them, and checks the terms version when the home screen appears
new MutationObserver(() => {
  const consent = document.getElementById('consent');
  if (consent && !document.getElementById('legalOnboard')) {
    const label = consent.closest('label');
    if (label) label.insertAdjacentHTML('afterend', legalLinks('legalOnboard'));
  }

  const swap = document.getElementById('swap');
  if (swap && document.getElementById('authForm') && !document.getElementById('legalAuth')) {
    swap.insertAdjacentHTML('afterend', legalLinks('legalAuth'));
  }

  const acct = document.getElementById('acct');
  if (acct && acct.querySelector('.card') && !document.getElementById('legalAcct')) {
    acct.insertAdjacentHTML('beforeend',
      `<div id="legalAcct" class="card stack"><h2>Terms and privacy</h2>${legalLinks('legalAcctLinks')}</div>`);
  }

  if (document.getElementById('authForm')) termsChecked = false;
  if (!termsChecked && document.getElementById('logout')) {
    termsChecked = true;
    checkTerms();
  }
}).observe(document.getElementById('app'), { childList: true, subtree: true });
