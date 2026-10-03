/* Oryzenx — passkeys (WebAuthn), 2FA QR code and recovery codes. Loaded on auth & security pages. */
(() => {
  'use strict';
  const C = (window.OZXComponents = window.OZXComponents || {});
  const app = () => window.OZXApp;
  const S = () => (window.OZX && window.OZX.strings) || {};
  const supported = () => !!(window.PublicKeyCredential && navigator.credentials);
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

  C['passkey-login'] = (btn) => {
    if (!supported()) return;
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      btn.classList.add('is-loading');
      try {
        const o = await app().api('/api/passkey/login-options', { method: 'POST' });
        if (!o.ok) throw new Error(o.message);
        const pk = o.publicKey;
        pk.challenge = unb64u(pk.challenge);
        const cred = await navigator.credentials.get({ publicKey: pk });
        const r = cred.response;
        const d = await app().api('/api/passkey/login', { method: 'POST', json: {
          rawId: b64u(cred.rawId),
          response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : null },
        } });
        if (!d.ok) throw new Error(d.message);
        app().toast(d.message, 'success');
        location.href = d.redirect;
      } catch (e) {
        if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') app().toast(e.message || S().error, 'error');
      }
      btn.classList.remove('is-loading');
    });
  };

  C['passkey-register'] = (btn) => {
    if (!supported()) return;
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      btn.classList.add('is-loading');
      try {
        const o = await app().api('/api/passkey/register-options', { method: 'POST' });
        if (!o.ok) throw new Error(o.message);
        const pk = o.publicKey;
        pk.challenge = unb64u(pk.challenge);
        pk.user.id = unb64u(pk.user.id);
        pk.excludeCredentials = (pk.excludeCredentials || []).map((c) => ({ ...c, id: unb64u(c.id) }));
        const cred = await navigator.credentials.create({ publicKey: pk });
        const d = await app().api('/api/passkey/register', { method: 'POST', json: {
          name: navigator.userAgentData?.platform || '',
          response: { clientDataJSON: b64u(cred.response.clientDataJSON), attestationObject: b64u(cred.response.attestationObject) },
        } });
        if (!d.ok) throw new Error(d.message);
        app().toast(d.message, 'success');
        app().navigate(location.href, { push: false });
      } catch (e) {
        if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') app().toast(e.message || S().error, 'error');
      }
      btn.classList.remove('is-loading');
    });
  };

  // QR code for the authenticator app (qrcodejs from cdnjs, loaded on demand).
  C.qr = (el) => {
    const render = () => { el.innerHTML = ''; new window.QRCode(el, { text: el.dataset.text, width: 160, height: 160, correctLevel: window.QRCode.CorrectLevel.M }); };
    if (window.QRCode) return render();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = render;
    s.onerror = () => { el.innerHTML = '<p class="xs muted center">QR unavailable — use the manual key.</p>'; };
    document.head.appendChild(s);
  };

  // Shows freshly generated recovery codes once, with copy/download.
  C['recovery-codes'] = (form) => {
    form.addEventListener('ozx:success', (e) => {
      const codes = e.detail.codes; if (!codes) return;
      const box = form.querySelector('.codes');
      box.hidden = false;
      box.innerHTML = `<p><i class="fa-solid fa-triangle-exclamation"></i> Save these recovery codes now — each works once and they will not be shown again.</p>${codes.map((c) => `<span>${c}</span>`).join('')}
        <p><button class="btn btn-xs btn-outline" type="button" data-action="copy" data-copy="${codes.join('\n')}"><i class="fa-regular fa-copy"></i> Copy</button>
        <a class="btn btn-xs btn-outline" download="recovery-codes.txt" href="data:text/plain;charset=utf-8,${encodeURIComponent(codes.join('\n'))}"><i class="fa-solid fa-download"></i> .txt</a>
        <a class="btn btn-xs btn-primary" href="${app().base}/profile/security">Done</a></p>`;
      form.querySelectorAll('input:not([type=hidden]), button[type=submit]').forEach((i) => { i.disabled = true; });
    });
  };
})();
