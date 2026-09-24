import { api, $, pageHead, toast, toastError, withLoading, formData, fieldsHtml } from './kit.js';

export async function mount(el) {
  const { smtp: s } = await api('/admin/smtp');
  el.innerHTML = `${pageHead('fa-solid fa-envelope', 'SMTP', 'Outgoing email for verification, password reset, security alerts, payments & withdrawals')}
  <div class="grid grid-main">
    <div class="card"><form data-smtp><div class="form-grid two">${fieldsHtml([
    { name: 'host', label: 'SMTP host', value: s?.host, placeholder: 'smtp.gmail.com' },
    { name: 'port', label: 'Port', type: 'number', value: s?.port || 587 },
    { name: 'username', label: 'Username', value: s?.username, attrs: 'autocomplete="off"' },
    { name: 'password', label: `Password ${s?.has_password ? '(saved — leave blank to keep)' : ''}`, type: 'password', attrs: 'autocomplete="new-password"', hint: 'Stored encrypted; never displayed.' },
    { name: 'encryption', label: 'Encryption', type: 'select', value: s?.encryption || 'tls', options: [['tls', 'STARTTLS (587)'], ['ssl', 'SSL/TLS (465)'], ['none', 'None']] },
    { name: 'from_name', label: 'From name', value: s?.from_name },
    { name: 'from_email', label: 'From email', type: 'email', value: s?.from_email, full: true },
    { name: 'enabled', label: 'Use these SMTP settings', type: 'switch', value: s?.enabled },
  ])}</div><button class="btn btn-primary" type="submit">Save SMTP</button></form></div>
    <div class="card"><div class="card-head"><h2>Send Test Email</h2></div><form data-test>
      <div class="field"><label>Recipient</label><input class="input" type="email" name="to" placeholder="you@example.com"></div>
      <button class="btn btn-soft btn-block" type="submit"><i class="fa-solid fa-paper-plane"></i>Send Test Email</button></form>
      <p class="small muted" style="margin-top:12px">Without SMTP, emails (verification links, resets) are written to <code>logs/mail.log</code> so you can still test the flows.</p></div>
  </div>`;
  $('[data-smtp]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => { try { toast((await api('/admin/smtp', { method: 'PUT', body: formData(e.target) })).message); e.target.password.value = ''; } catch (err) { toastError(err); } });
  });
  $('[data-test]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => { try { toast((await api('/admin/smtp/test', { method: 'POST', body: formData(e.target) })).message); } catch (err) { toastError(err); } });
  });
}
