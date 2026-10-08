/*!
 * orders.js — order details: courier submission (review & edit before sending)
 * and courier history / fraud check rendering.
 */
(function (App) {
  'use strict';

  App.action('courier-send', function (btn) {
    var page = btn.closest('[data-order-id]');
    var tpl = App.$('template[data-courier-form]', page);
    if (!tpl) return;
    var id = page.getAttribute('data-order-id');
    App.modal({
      title: 'কুরিয়ারে পাঠান — review details', icon: 'fa-solid fa-truck-fast', size: 'lg',
      html: tpl.innerHTML, confirmText: 'Send to courier', cancelText: 'Cancel',
      onConfirm: function (modal) {
        var form = App.$('[data-courier-send-form]', modal.el);
        if (!form.reportValidity()) return false;
        var body = {};
        new FormData(form).forEach(function (v, k) { body[k] = v; });
        return App.post(App.url('/api/admin/courier/send/' + id), body).then(function (res) {
          var d = res.data;
          App.toast(res.message + (d.tracking_code ? ' Tracking: ' + d.tracking_code : ''), 'success', { duration: 6000 });
          App.router.refresh();
        }, function (err) {
          App.toast(err.message, 'error', { duration: 7000 });
          return true; // keep modal open so the admin can correct and retry
        });
      }
    });
  });

  function renderFraud(box, res) {
    var out = App.$('[data-fraud-result]', box);
    var d = res.data || {};
    if (!res.success) {
      out.innerHTML = '<p class="small text-danger">' + App.escape(res.message) + '</p>';
      return;
    }
    var c = d.courier || {}, s = c.summary || {};
    var ratio = s.ratio != null ? Number(s.ratio) : null;
    var tone = ratio == null ? 'muted' : ratio >= 80 ? 'success' : ratio >= 50 ? 'warning' : 'danger';
    var html = '<div class="fraud-summary fraud-' + tone + '"><strong>' + (ratio != null ? ratio + '%' : 'n/a') + '</strong><span>courier success ratio · ' +
      Number(s.total || 0) + ' parcels · ' + Number(s.success || 0) + ' delivered · ' + Number(s.cancelled || 0) + ' cancelled</span></div>';
    if ((c.couriers || []).length) {
      html += '<table class="a-table compact"><thead><tr><th>Courier</th><th>Total</th><th>Success</th><th>Cancelled</th></tr></thead><tbody>' +
        c.couriers.map(function (r) { return '<tr><td>' + App.escape(r.name) + '</td><td>' + Number(r.total) + '</td><td>' + Number(r.success) + '</td><td>' + Number(r.cancelled) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }
    (c.reports || []).slice(0, 5).forEach(function (r) { html += '<p class="small fraud-report"><i class="fa-solid fa-flag" aria-hidden="true"></i> ' + App.escape(r) + '</p>'; });
    if (c.cached_at) html += '<p class="muted small">Cached result · <button type="button" class="link" data-action="fraud-check" data-refresh="1">refresh</button></p>';
    out.innerHTML = html;
  }

  function check(box, refresh) {
    var out = App.$('[data-fraud-result]', box);
    out.innerHTML = '<p class="muted small"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Checking…</p>';
    App.request(box.getAttribute('data-url'), { method: 'POST', body: { refresh: refresh ? 1 : 0 } })
      .then(function (res) { renderFraud(box, res); }, function (err) { renderFraud(box, { success: false, message: err.message }); });
  }

  App.action('fraud-check', function (btn) { check(btn.closest('[data-fraud]'), btn.hasAttribute('data-refresh')); });

  App.page('order', {
    mount: function (root) {
      var box = App.$('[data-fraud][data-auto]', root);
      if (box) check(box, false);
      return null;
    }
  });
})(window.App);
