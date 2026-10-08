/* pages/listing.js — filters auto-apply (the router turns the GET form into an instant navigation) */
(function (App) {
  'use strict';
  App.delegate('change', '[data-autosubmit]', function (el) {
    var form = el.form || el.closest('form');
    if (!form) return;
    var page = form.querySelector('input[name="page"]');
    if (page) page.remove();
    if (form.requestSubmit) form.requestSubmit(); else form.submit();
  });
  App.page('listing', { mount: function () { return null; } });
})(window.App);
