/* pages/order-success.js — move focus to the confirmation heading once the delivery-van
   animation has finished (screen readers announce the result; keyboard users land on it). */
(function (App) {
  'use strict';
  App.page('order-success', {
    mount: function (root) {
      var title = App.$('#success-title', root);
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var t = setTimeout(function () {
        if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
      }, reduce ? 0 : 2100);
      return function () { clearTimeout(t); };
    }
  });
})(window.App);
