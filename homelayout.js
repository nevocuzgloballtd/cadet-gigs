// Loaded AFTER legalpages.js. Puts "My account" and "Notifications" on one line on the home screen.

new MutationObserver(() => {
  const acct = document.getElementById('acctBtn');
  const bell = document.getElementById('bellBtn');
  if (!acct || !bell || document.getElementById('linkrow')) return;
  const row = document.createElement('div');
  row.id = 'linkrow';
  row.className = 'linkrow';
  acct.parentNode.insertBefore(row, acct);
  row.appendChild(acct);
  row.appendChild(bell);
}).observe(document.getElementById('app'), { childList: true, subtree: true });
