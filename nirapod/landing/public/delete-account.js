// Web account deletion: request a confirmation email, or confirm with ?token= from that email.
const q = new URLSearchParams(location.search);
const token = (q.get('token') || '').replace(/[^A-Za-z0-9_-]/g, '');
const $ = (id) => document.getElementById(id);
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
if (token) {
  $('ask').hidden = true;
  $('confirm').hidden = false;
  $('go').addEventListener('click', async () => {
    $('go').disabled = true;
    const r = await post('/api/v1/account-deletion/confirm', { token }).catch(() => null);
    if (r && r.ok) { $('done').hidden = false; $('go').hidden = true; } else { $('bad').hidden = false; $('go').disabled = false; }
  });
} else {
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('f').querySelector('button');
    btn.disabled = true;
    await post('/api/v1/account-deletion-requests', { email: $('email').value.trim() }).catch(() => null);
    $('sent').hidden = false;
    btn.disabled = false;
  });
}
