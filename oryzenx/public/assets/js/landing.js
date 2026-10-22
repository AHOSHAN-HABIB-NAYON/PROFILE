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

  // Live market prices (public endpoint, market data only). Refreshes while the page is visible.
  (function () {
    var box = document.querySelector("[data-markets]");
    if (!box) return;
    var list = box.querySelector("[data-markets-list]");
    var meta = box.querySelector("[data-markets-meta]");
    var d = box.dataset;
    var loc = d.locale === "bn" ? "bn-BD" : "en-US";
    var last = {};
    var timer = null;
    var poll = 60000;
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function fmtPrice(v, dec) {
      var n = Number(v);
      var max = n >= 1 ? 2 : Math.min(Math.max(dec || 8, 4), 10);
      return "$" + n.toLocaleString(loc, { minimumFractionDigits: n >= 1 ? 2 : 4, maximumFractionDigits: max });
    }
    function fmtPct(v) {
      var n = Number(v);
      return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
    }
    function ago(ts) {
      if (!ts) return "";
      var mins = Math.floor((Date.now() - Date.parse(ts.replace(" ", "T") + "Z")) / 60000);
      if (mins < 1) return d.msgJustNow;
      return d.msgMinAgo.replace(":n", mins.toLocaleString(loc));
    }
    function render(rows, m) {
      list.textContent = "";
      var simulated = false, newest = null;
      rows.forEach(function (a) {
        var li = el("li", "market-row");
        var asset = el("span", "market-asset");
        var badge;
        if (a.logo_url) { badge = el("img", "coin"); badge.src = a.logo_url; badge.alt = ""; badge.width = 32; badge.height = 32; }
        else { badge = el("span", "coin", (a.symbol || "?").charAt(0)); badge.style.background = a.color || "#64748b"; badge.setAttribute("aria-hidden", "true"); }
        var name = el("span", "market-name");
        name.appendChild(el("strong", null, a.symbol));
        name.appendChild(el("small", null, a.name));
        asset.appendChild(badge); asset.appendChild(name);
        var price = el("span", "market-price", a.price != null ? fmtPrice(a.price, a.price_decimals) : d.msgNoPrice);
        if (a.price != null && a.stale) price.appendChild(el("span", "market-flag", d.msgStale));
        var chg = a.change_24h_pct;
        var change = el("span", "market-change " + (chg == null ? "flat" : Number(chg) > 0 ? "up" : Number(chg) < 0 ? "down" : "flat"), chg == null ? "—" : fmtPct(chg));
        li.appendChild(asset); li.appendChild(price); li.appendChild(change);
        var prev = last[a.symbol];
        if (prev != null && a.price != null && prev !== a.price) li.classList.add(Number(a.price) > Number(prev) ? "flash-up" : "flash-down");
        if (a.price != null) last[a.symbol] = a.price;
        if (a.simulated) simulated = true;
        if (a.updated_at && (!newest || a.updated_at > newest)) newest = a.updated_at;
        list.appendChild(li);
      });
      list.setAttribute("aria-busy", "false");
      var parts = [];
      if (newest) parts.push(d.msgUpdated.replace(":time", ago(newest)));
      if (m && m.provider) parts.push(d.msgSource.replace(":provider", m.provider));
      meta.className = "markets-meta" + (simulated ? " warn" : "");
      meta.textContent = (simulated ? d.msgSimulated + " " : "") + parts.join(" · ");
      if (!rows.length || !newest) { meta.className = "markets-meta warn"; meta.textContent = d.msgUnavailable; }
    }
    function load() {
      fetch(d.endpoint, { headers: { Accept: "application/json" }, credentials: "omit" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error("bad");
          if (j.meta && j.meta.poll_seconds) poll = Math.max(30, j.meta.poll_seconds) * 1000;
          render(j.data || [], j.meta);
        })
        .catch(function () {
          if (!Object.keys(last).length) { list.setAttribute("aria-busy", "false"); meta.className = "markets-meta warn"; meta.textContent = d.msgUnavailable; }
        })
        .finally(schedule);
    }
    function schedule() { clearTimeout(timer); if (document.visibilityState === "visible") timer = setTimeout(load, poll); }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(); else clearTimeout(timer); });
    load();
  })();

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
