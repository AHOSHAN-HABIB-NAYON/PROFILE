// Shows the code from ?code= or ?invite= (letters and digits only).
const p = new URLSearchParams(location.search);
const c = (p.get('code') || p.get('invite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
if (c) document.getElementById('code').textContent = c;
