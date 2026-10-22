/* Landing page interactions: theme toggle, mobile nav, header state, support form. */
(function () {
  "use strict";
  var root = document.documentElement;

  // Two-state header toggle (Light default ↔ Dark). The full Light/Dark/System choice lives in the app settings.
  var toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      root.setAttribute("data-theme-pref", next);
      try { localStorage.setItem("oryx-theme", next); } catch (e) {}
      var m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.content = next;
    });
  }
  window.addEventListener("storage", function (e) {
    if (e.key === "oryx-theme") location.reload();
  });

  // Mobile navigation
  var nav = document.querySelector("[data-nav]");
  var navBtn = document.querySelector("[data-nav-toggle]");
  function setNav(open) {
    if (!nav || !navBtn) return;
    nav.classList.toggle("open", open);
    navBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (navBtn) {
    navBtn.addEventListener("click", function () { setNav(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setNav(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("open")) { setNav(false); navBtn.focus(); } });
  }

  // Header border once the page scrolls (IntersectionObserver: no scroll listener work)
  var header = document.querySelector("[data-header]");
  var sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
  document.body.prepend(sentinel);
  if (header && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { header.classList.toggle("scrolled", !entries[0].isIntersecting); }).observe(sentinel);
  }

  // Support form: native constraint validation + server validation, rate limit and spam handling
  var form = document.querySelector("[data-support-form]");
  if (!form) return;
  var status = form.querySelector("[data-form-status]");
  var submit = form.querySelector("[data-submit]");
  var submitLabel = submit.textContent;

  function csrf() {
    var m = document.cookie.match(/(?:^|; )oryx_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function clearServerErrors() {
    form.querySelectorAll(".server-invalid").forEach(function (el) {
      el.classList.remove("server-invalid");
      el.removeAttribute("aria-invalid");
      var err = document.getElementById(el.getAttribute("aria-errormessage"));
      if (err) err.textContent = err.getAttribute("data-default");
    });
  }
  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("server-invalid")) {
      e.target.classList.remove("server-invalid");
      e.target.removeAttribute("aria-invalid");
    }
  });
  // keep aria-invalid in sync with :user-invalid
  form.addEventListener("blur", function (e) {
    if (e.target.matches && e.target.matches("input,textarea")) {
      try { e.target.setAttribute("aria-invalid", e.target.matches(":user-invalid") ? "true" : "false"); } catch (err) {}
    }
  }, true);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearServerErrors();
    status.className = "form-status";
    status.textContent = "";
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v); });
    submit.disabled = true;
    submit.textContent = form.getAttribute("data-msg-sending");
    fetch(form.getAttribute("action") + "?lang=" + document.documentElement.lang, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": csrf() },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (res.body && res.body.ok) {
        status.className = "form-status ok";
        status.textContent = res.body.data.message;
        form.reset();
        return;
      }
      var err = (res.body && res.body.error) || {};
      if (res.status === 429) {
        status.textContent = form.getAttribute("data-msg-rate");
      } else {
        status.textContent = form.getAttribute("data-msg-error");
        var fields = err.fields || {};
        Object.keys(fields).forEach(function (name) {
          var input = form.querySelector('[name="' + name + '"]');
          if (!input || input.type === "hidden") return;
          input.classList.add("server-invalid");
          input.setAttribute("aria-invalid", "true");
        });
        var first = form.querySelector(".server-invalid");
        if (first) first.focus();
      }
      status.className = "form-status err";
    }).catch(function () {
      status.className = "form-status err";
      status.textContent = form.getAttribute("data-msg-error");
    }).finally(function () {
      submit.disabled = false;
      submit.textContent = submitLabel;
    });
  });
})();
