// Change the app name here and it updates on the screen.
const APP_NAME = 'Cadet Gigs';
const TAGLINE = 'Trained cadets for your event. Verified and rated.';

const app = document.getElementById('app');
const installed = window.matchMedia('(display-mode: standalone)').matches;

app.innerHTML = `
  <main class="shell">
    <h1>${APP_NAME}</h1>
    <p class="tagline">${TAGLINE}</p>

    <section class="checks" aria-label="Foundation checks">
      <div class="check">
        <span>Running as installed app</span>
        <strong class="${installed ? 'ok' : 'wait'}">${installed ? 'Yes' : 'Not yet'}</strong>
      </div>
      <div class="check">
        <span>Internet connection</span>
        <strong id="net"></strong>
      </div>
    </section>

    <button id="installBtn" class="btn hidden">Install app on this phone</button>
    <p id="installHint" class="hint ${installed ? 'hidden' : ''}">
      To install: open the browser menu and tap "Install app" or "Add to Home screen".
    </p>
  </main>
`;

// Online / offline status
const net = document.getElementById('net');
function showNet() {
  net.textContent = navigator.onLine ? 'Online' : 'Offline';
  net.className = navigator.onLine ? 'ok' : 'wait';
}
window.addEventListener('online', showNet);
window.addEventListener('offline', showNet);
showNet();

// Install button
let installEvent = null;
const installBtn = document.getElementById('installBtn');
const installHint = document.getElementById('installHint');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installBtn.classList.remove('hidden');
  installHint.classList.add('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  installBtn.classList.add('hidden');
});

// Service worker (makes the app installable and work offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker failed:', err);
    });
  });
}
