/* OryzenX shared front-end core (User App + Admin App). No framework, no build step.
 * Performance notes: transform/opacity-only animations, requestAnimationFrame-driven number tweens,
 * visibility-aware polling, one delegated listener per view, and in-flight GET de-duplication.
 */
(function () {
  "use strict";
  var bootEl = document.getElementById("boot-data");
  var BOOT = bootEl ? JSON.parse(bootEl.textContent) : { strings: {}, locale: "en", base: "" };
  var OX = (window.OX = { boot: BOOT, state: {} });
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ i18n */
  var strings = BOOT.strings || {};
  OX.locale = BOOT.locale || "en";
  OX.t = function (key, vars) {
    var s = strings[key];
    if (s === undefined || s === null || s === "") s = key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split(":" + k).join(vars[k]); });
    return s;
  };
  OX.setLocale = function (loc) {
    return OX.api.get("/api/i18n/" + loc).then(function (r) {
      strings = r.data; OX.locale = loc; document.documentElement.lang = loc;
      try { localStorage.setItem("oryx-lang", loc); } catch (e) {}
      document.cookie = "oryx_lang=" + loc + ";path=/;max-age=31536000;samesite=lax";
    });
  };
  var t = OX.t;

  /* ------------------------------------------------------------------ formatting (display only; amounts arrive as decimal strings) */
  function intlLocale() { return OX.locale === "bn" ? "bn-BD" : "en-US"; }
  var nfCache = {};
  function nf(min, max, extra) {
    var k = intlLocale() + min + "-" + max + JSON.stringify(extra || {});
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat(intlLocale(), Object.assign({ minimumFractionDigits: min, maximumFractionDigits: max }, extra || {}));
    return nfCache[k];
  }
  function toNum(v) { if (v === null || v === undefined || v === "") return null; var n = Number(v); return isFinite(n) ? n : null; }
  OX.fmt = {
    usd: function (v, opts) {
      var n = toNum(v); if (n === null) return "—";
      opts = opts || {};
      var abs = Math.abs(n), d = opts.decimals;
      if (d === undefined) d = abs > 0 && abs < 1 ? (abs < 0.01 ? 8 : 4) : 2;
      var s = "$" + nf(abs >= 1 || abs === 0 ? 2 : Math.min(d, 2), d).format(abs);
      return (n < 0 ? "−" : "") + s;
    },
    signedUsd: function (v) { var n = toNum(v); if (n === null) return "—"; return (n > 0 ? "+" : n < 0 ? "−" : "") + OX.fmt.usd(Math.abs(n)); },
    price: function (v, decimals) {
      var n = toNum(v); if (n === null) return "—";
      var d = decimals !== undefined ? decimals : (n < 0.0001 ? 10 : n < 1 ? 6 : 2);
      return "$" + nf(Math.min(2, d), Math.max(2, d)).format(n);
    },
    num: function (v, max) { var n = toNum(v); return n === null ? "—" : nf(0, max === undefined ? 8 : max).format(n); },
    qty: function (v, max) { var n = toNum(v); return n === null ? "—" : nf(0, max === undefined ? 8 : max).format(n); },
    pct: function (v, signed) {
      var n = toNum(v); if (n === null) return "—";
      return (signed && n > 0 ? "+" : n < 0 ? "−" : "") + nf(2, 2).format(Math.abs(n)) + "%";
    },
    int: function (v) { var n = toNum(v); return n === null ? "—" : nf(0, 0).format(n); },
    cls: function (v) { var n = toNum(v); return n === null || n === 0 ? "" : n > 0 ? "gain" : "loss"; },
    date: function (utc, withTime) {
      if (!utc) return "—";
      var d = OX.fmt.parse(utc);
      if (!d) return "—";
      var o = { year: "numeric", month: "short", day: "numeric", timeZone: BOOT.timezone || undefined };
      if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
      try { return new Intl.DateTimeFormat(intlLocale(), o).format(d); } catch (e) { return d.toISOString().slice(0, withTime ? 16 : 10).replace("T", " "); }
    },
    dateTime: function (utc) { return OX.fmt.date(utc, true); },
    tzLabel: function () {
      try {
        var p = new Intl.DateTimeFormat("en-US", { timeZone: BOOT.timezone, timeZoneName: "short" }).formatToParts(new Date());
        var z = p.find(function (x) { return x.type === "timeZoneName"; });
        return (BOOT.timezone || "UTC") + (z ? " (" + z.value + ")" : "");
      } catch (e) { return BOOT.timezone || "UTC"; }
    },
    ago: function (utc) {
      var d = OX.fmt.parse(utc); if (!d) return "—";
      var s = Math.round((Date.now() - d.getTime()) / 1000);
      var rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" });
      if (Math.abs(s) < 60) return rtf.format(-s, "second");
      if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), "minute");
      if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), "hour");
      return rtf.format(-Math.round(s / 86400), "day");
    },
    parse: function (utc) {
      if (!utc) return null;
      if (utc instanceof Date) return utc;
      var s = String(utc);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T12:00:00Z";
      else if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s = s.replace(" ", "T") + "Z";
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    },
    localInput: function (d) {
      d = d || new Date();
      var p = new Intl.DateTimeFormat("en-CA", { timeZone: BOOT.timezone || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
      var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
      return g("year") + "-" + g("month") + "-" + g("day") + "T" + (g("hour") === "24" ? "00" : g("hour")) + ":" + g("minute");
    }
  };

  /* ------------------------------------------------------------------ DOM helpers */
  OX.el = function (tag, attrs) {
    var parts = tag.split(/(?=[.#])/), name = parts[0] || "div";
    var node = document.createElement(name);
    parts.slice(1).forEach(function (p) { if (p[0] === ".") node.classList.add(p.slice(1)); else node.id = p.slice(1); });
    var start = 2;
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { start = 1; attrs = null; }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") String(v).split(" ").filter(Boolean).forEach(function (c) { node.classList.add(c); });
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v; // only used with trusted static markup (icons)
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      });
    }
    for (var i = start; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  };
  function append(node, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(node, x); }); return; }
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  OX.append = append;
  var h = OX.el;
  OX.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  OX.icon = function (name, cls) {
    var paths = (window.OXIcons || {})[name] || "";
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    s.innerHTML = paths; // static icon set bundled with the app
    return s;
  };
  OX.logo = function () {
    var wrap = h("span");
    wrap.innerHTML = '<svg class="logo" viewBox="0 0 148 32" height="28" role="img" aria-label="OryzenX"><rect width="32" height="32" rx="9" fill="var(--primary)"/><path d="M9.5 21.5 14 16l-4.5-5.5h3.6l2.7 3.4 2.7-3.4h3.6L17.6 16l4.5 5.5h-3.6l-2.7-3.4-2.7 3.4z" fill="#fff"/><circle cx="23.2" cy="9" r="1.9" fill="#fff" opacity=".85"/><text x="42" y="22.5" fill="currentColor" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="-0.4">Oryzen<tspan fill="var(--primary)">X</tspan></text></svg>';
    return wrap.firstChild;
  };
  OX.uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.from(b, function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
    return x.slice(0, 8) + "-" + x.slice(8, 12) + "-" + x.slice(12, 16) + "-" + x.slice(16, 20) + "-" + x.slice(20);
  };
  OX.debounce = function (fn, ms) { var tm; return function () { var a = arguments, s = this; clearTimeout(tm); tm = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  OX.coinLogo = function (a, size) {
    var sym = (a.symbol || "?");
    var node = h("span", { class: "coin-logo" + (size === "sm" ? " sm" : ""), style: { background: a.color || "var(--primary)" }, "aria-hidden": "true" });
    if (a.logo_url) node.appendChild(h("img", { src: a.logo_url, alt: "", loading: "lazy", width: 40, height: 40 }));
    else node.textContent = sym.slice(0, 1);
    return node;
  };

  /* ------------------------------------------------------------------ API client */
  var csrfToken = null;
  OX.setCsrf = function (tok) { csrfToken = tok; };
  function cookie(name) { var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)")); return m ? decodeURIComponent(m[1]) : ""; }
  var inflight = {};
  function ApiError(status, err) { this.status = status; this.code = err.code || "error"; this.message = err.message || t("err_generic"); this.fields = err.fields || {}; }
  ApiError.prototype = Object.create(Error.prototype);
  OX.ApiError = ApiError;
  OX.onUnauthorized = null;
  OX.onReauth = null;
  function request(method, path, body, opts) {
    opts = opts || {};
    var url = BOOT.base + path;
    var headers = { "Accept": "application/json" };
    var payload = body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    if (method !== "GET") headers["X-CSRF-Token"] = csrfToken || cookie("oryx_csrf");
    if (!navigator.onLine) return Promise.reject(new ApiError(0, { code: "offline", message: t("err_offline") }));
    var key = method === "GET" ? url : null;
    if (key && inflight[key]) return inflight[key];
    var p = fetch(url, { method: method, headers: headers, body: payload, credentials: "same-origin", signal: opts.signal })
      .then(function (r) {
        var ct = r.headers.get("Content-Type") || "";
        if (opts.raw) { if (!r.ok) throw new ApiError(r.status, {}); return r; }
        if (ct.indexOf("application/json") === -1) throw new ApiError(r.status, { code: "bad_response", message: r.status >= 500 ? t("err_server") : t("err_generic") });
        return r.json().then(function (j) {
          if (!j.ok) {
            var e = new ApiError(r.status, j.error || {});
            if (r.status === 401 && OX.onUnauthorized && !opts.noAuthRedirect) OX.onUnauthorized();
            if (r.status === 428 && OX.onReauth && !opts.noReauth) {
              return OX.onReauth().then(function () { return request(method, path, body, Object.assign({}, opts, { noReauth: true })); });
            }
            throw e;
          }
          return j;
        });
      }, function (err) {
        if (err && err.name === "AbortError") throw err;
        throw new ApiError(0, { code: "network", message: t("err_network") });
      });
    if (key) { inflight[key] = p; p.then(done, done); }
    function done() { delete inflight[key]; }
    return p;
  }
  OX.api = {
    get: function (p, q, o) { return request("GET", p + OX.qs(q), null, o); },
    post: function (p, b, o) { return request("POST", p, b || {}, o); },
    put: function (p, b, o) { return request("PUT", p, b || {}, o); },
    del: function (p, o) { return request("DELETE", p, null, o); },
    raw: function (p, q) { return request("GET", p + OX.qs(q), null, { raw: true }); }
  };
  OX.qs = function (q) {
    if (!q) return "";
    var parts = Object.keys(q).filter(function (k) { return q[k] !== "" && q[k] !== null && q[k] !== undefined; }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); });
    return parts.length ? "?" + parts.join("&") : "";
  };
  OX.download = function (path, q, filename) {
    return OX.api.raw(path, q).then(function (r) { return r.blob(); }).then(function (b) {
      var a = h("a", { href: URL.createObjectURL(b), download: filename });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }).catch(function (e) { OX.toast(e.message || t("err_generic"), "err"); });
  };

  /* ------------------------------------------------------------------ toasts */
  OX.toast = function (msg, kind) {
    var box = document.getElementById("toasts");
    var node = h("div", { class: "toast " + (kind || "ok"), role: kind === "err" ? "alert" : "status" }, OX.icon(kind === "err" ? "circle-alert" : "circle-check-big"), h("span", msg));
    box.appendChild(node);
    setTimeout(function () { node.classList.add("leaving"); setTimeout(function () { node.remove(); }, 260); }, kind === "err" ? 5200 : 3200);
  };

  /* ------------------------------------------------------------------ dialogs / bottom sheets */
  var supportsClosedBy = "closedBy" in HTMLDialogElement.prototype;
  OX.sheet = function (opts) {
    var titleId = "dlg-" + Math.random().toString(36).slice(2);
    var dlg = h("dialog", { class: "sheet" + (opts.wide ? " wide" : ""), "aria-labelledby": titleId, closedby: opts.persistent ? "closerequest" : "any" });
    var body = h("div.sheet-body");
    var closeBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("close"), onclick: function () { dlg.close(); } }, OX.icon("x"));
    dlg.appendChild(h("div.sheet-grip", { "aria-hidden": "true" }));
    dlg.appendChild(h("div.sheet-head", h("h2", { id: titleId, text: opts.title || "" }), closeBtn));
    dlg.appendChild(body);
    var foot = null;
    if (opts.actions && opts.actions.length) {
      foot = h("div.sheet-foot");
      opts.actions.forEach(function (a) { foot.appendChild(a); });
      dlg.appendChild(foot);
    }
    if (!supportsClosedBy && !opts.persistent) {
      dlg.addEventListener("click", function (e) {
        if (e.target !== dlg) return;
        var r = dlg.getBoundingClientRect();
        if (r.top <= e.clientY && e.clientY <= r.top + r.height && r.left <= e.clientX && e.clientX <= r.left + r.width) return;
        dlg.close();
      });
    }
    dlg.addEventListener("close", function () {
      if (opts.onClose) opts.onClose(dlg.returnValue);
      setTimeout(function () { dlg.remove(); }, 0);
    });
    if (opts.content) append(body, typeof opts.content === "function" ? opts.content(body) : opts.content);
    document.body.appendChild(dlg);
    dlg.showModal();
    return { dialog: dlg, body: body, foot: foot, close: function (v) { dlg.close(v); } };
  };
  OX.confirm = function (opts) {
    return new Promise(function (resolve) {
      var result = false;
      var reasonInput = null;
      var content = [h("p.muted", opts.message || "")];
      if (opts.reason) {
        reasonInput = h("textarea", { id: "confirm-reason", rows: 3, required: true, minlength: 5, maxlength: 500 });
        content.push(h("div.field", h("label", { for: "confirm-reason", text: opts.reasonLabel || t("reason") }), reasonInput, h("p.field-error", t("reason_required"))));
      }
      var ok = h("button", { class: "btn " + (opts.danger ? "btn-danger" : "btn-primary"), type: "button", text: opts.confirmText || t("confirm") });
      var cancel = h("button", { class: "btn btn-outline", type: "button", text: t("cancel") });
      var s = OX.sheet({ title: opts.title, content: content, actions: [cancel, ok], onClose: function () { resolve(result ? (reasonInput ? reasonInput.value.trim() : true) : false); } });
      cancel.onclick = function () { s.close(); };
      ok.onclick = function () {
        if (reasonInput && reasonInput.value.trim().length < 5) { reasonInput.classList.add("server-invalid"); reasonInput.focus(); return; }
        result = true; s.close();
      };
    });
  };

  /* ------------------------------------------------------------------ forms */
  /**
   * fields: [{name, label, type, required, options:[[v,label]], hint, value, min, max, step, placeholder, autocomplete,
   *           inputmode, span, minlength, maxlength, pattern, suffix, rows, accept, help, checkboxLabel}]
   */
  OX.form = function (fields, opts) {
    opts = opts || {};
    var form = h("form", { class: "form", novalidate: true });
    var grid = opts.grid ? h("div.grid-2") : form;
    if (opts.grid) form.appendChild(grid);
    fields.forEach(function (f) {
      if (f.type === "html") { grid.appendChild(f.node); return; }
      var id = "f-" + (opts.prefix || "") + f.name + "-" + Math.random().toString(36).slice(2, 7);
      var wrap = h("div", { class: "field" + (f.span ? " span-2" : "") });
      var input;
      if (f.type === "select") {
        input = h("select", { id: id, name: f.name, required: !!f.required });
        if (f.placeholder !== undefined) input.appendChild(h("option", { value: "", text: f.placeholder }));
        (f.options || []).forEach(function (o) { var opt = h("option", { value: o[0], text: o[1] }); if (String(f.value) === String(o[0])) opt.selected = true; input.appendChild(opt); });
      } else if (f.type === "textarea") {
        input = h("textarea", { id: id, name: f.name, rows: f.rows || 3, required: !!f.required, maxlength: f.maxlength, minlength: f.minlength, placeholder: f.placeholder });
        if (f.value) input.value = f.value;
      } else if (f.type === "checkbox") {
        input = h("input", { id: id, type: "checkbox", name: f.name });
        input.checked = !!f.value;
        wrap.appendChild(h("label.check", { for: id }, input, h("span", f.checkboxLabel || f.label)));
        if (f.hint) wrap.appendChild(h("span.hint", f.hint));
        grid.appendChild(wrap);
        return;
      } else {
        var type = f.type || "text";
        var isDecimal = type === "decimal";
        input = h("input", {
          id: id, name: f.name, type: isDecimal ? "text" : type, required: !!f.required, autocomplete: f.autocomplete || "off",
          inputmode: isDecimal ? "decimal" : f.inputmode, placeholder: f.placeholder, min: f.min, max: f.max, step: f.step,
          minlength: f.minlength, maxlength: f.maxlength, pattern: isDecimal ? "[0-9]*[.]?[0-9]*" : f.pattern, accept: f.accept, spellcheck: f.spellcheck === false ? "false" : null
        });
        if (f.value !== undefined && f.value !== null && type !== "file") input.value = f.value;
      }
      input.setAttribute("aria-errormessage", id + "-err");
      if (f.hint) input.setAttribute("aria-describedby", id + "-hint");
      wrap.appendChild(h("label", { for: id, text: f.label + (f.required || f.optional === false ? "" : f.optionalText !== false ? " " + t("optional_paren") : "") }));
      if (f.hint) wrap.appendChild(h("span.hint", { id: id + "-hint", text: f.hint }));
      if (f.suffix) wrap.appendChild(h("div.suffix-wrap", input, h("span.suffix", f.suffix)));
      else if (f.type === "password") {
        var eye = h("button", { class: "icon-btn", type: "button", "aria-label": t("show_password"), "aria-pressed": "false" }, OX.icon("eye"));
        eye.onclick = function () { var show = input.type === "password"; input.type = show ? "text" : "password"; eye.setAttribute("aria-pressed", show ? "true" : "false"); OX.clear(eye).appendChild(OX.icon(show ? "eye-off" : "eye")); };
        wrap.appendChild(h("div.input-wrap", input, eye));
      } else wrap.appendChild(input);
      wrap.appendChild(h("p", { class: "field-error", id: id + "-err", text: f.error || t("field_invalid") }));
      if (f.onInput) input.addEventListener("input", f.onInput);
      grid.appendChild(wrap);
    });
    form.addEventListener("input", function (e) {
      if (e.target.classList && e.target.classList.contains("server-invalid")) { e.target.classList.remove("server-invalid"); e.target.removeAttribute("aria-invalid"); }
    });
    form.addEventListener("blur", function (e) {
      if (e.target.matches && e.target.matches("input,select,textarea")) { try { e.target.setAttribute("aria-invalid", e.target.matches(":user-invalid") ? "true" : "false"); } catch (x) {} }
    }, true);
    if (opts.submitText) {
      var btn = h("button", { class: "btn btn-primary" + (opts.block !== false ? " btn-block" : ""), type: "submit", text: opts.submitText });
      form.appendChild(opts.extra ? h("div.stack-sm", opts.extra, btn) : btn);
      form._submit = btn;
    }
    form.values = function () {
      var o = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.type === "checkbox") o[el.name] = el.checked;
        else if (el.type === "file") o[el.name] = el.files && el.files[0] ? el.files[0] : null;
        else o[el.name] = el.value.trim();
      });
      return o;
    };
    form.setErrors = function (err) {
      var fields = (err && err.fields) || {};
      var first = null;
      Object.keys(fields).forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        if (!input) return;
        input.classList.add("server-invalid");
        input.setAttribute("aria-invalid", "true");
        var errEl = document.getElementById(input.getAttribute("aria-errormessage"));
        if (errEl && typeof fields[name] === "string") errEl.textContent = OX.serverMsg(fields[name]);
        if (!first) first = input;
      });
      if (first) first.focus();
      return !!first;
    };
    form.busy = function (b, label) {
      var s = form._submit || form.querySelector('[type="submit"]');
      if (!s) return;
      if (b) { s._label = s.textContent; s.disabled = true; OX.clear(s).appendChild(h("span.spinner.sm")); if (label) s.appendChild(document.createTextNode(" " + label)); }
      else { s.disabled = false; s.textContent = s._label || s.textContent; }
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); var inv = form.querySelector(":invalid"); if (inv) inv.focus(); return; }
      if (!opts.onSubmit) return;
      form.busy(true);
      Promise.resolve(opts.onSubmit(form.values(), form)).catch(function (err) {
        if (err instanceof ApiError) {
          var mapped = form.setErrors(err);
          OX.toast(mapped ? t("err_check_form") : OX.serverMsg(err.message), "err");
        } else if (err) { OX.toast(t("err_generic"), "err"); console.error(err); }
      }).finally(function () { form.busy(false); });
    });
    return form;
  };
  /** Server messages are English; show a localized generic message when the UI is not English. */
  OX.serverMsg = function (m) { return OX.locale === "en" || !m ? (m || t("err_generic")) : (OX.t("srv:" + m) !== "srv:" + m ? OX.t("srv:" + m) : m); };

  /* ------------------------------------------------------------------ states & skeletons */
  OX.skeleton = function (kind, n) {
    var wrap = h("div", { class: "stack-sm", "aria-busy": "true", "aria-label": t("loading") });
    for (var i = 0; i < (n || 3); i++) wrap.appendChild(h("div", { class: "skel " + (kind === "tiles" ? "skel-tile" : kind === "block" ? "skel-block" : "skel-row") }));
    if (kind === "tiles") wrap.className = "metrics";
    return wrap;
  };
  OX.stateView = function (o) {
    return h("div.state", { role: o.role || null },
      h("div.state-icon", OX.icon(o.icon || "inbox")),
      h("h3", o.title || ""),
      o.body ? h("p", o.body) : null,
      o.action || null);
  };
  OX.errorState = function (err, retry) {
    var offline = err && (err.code === "offline" || err.code === "network");
    var denied = err && (err.status === 403);
    return OX.stateView({
      role: "alert",
      icon: offline ? "wifi-off" : denied ? "ban" : "circle-alert",
      title: offline ? t("state_offline_title") : denied ? t("state_denied_title") : t("state_error_title"),
      body: offline ? t("state_offline_body") : OX.serverMsg(err && err.message),
      action: retry && !denied ? h("button", { class: "btn btn-outline btn-sm", type: "button", onclick: retry }, OX.icon("refresh-cw", "icon-sm"), t("retry")) : null
    });
  };
  /** Loads data into a container with skeleton → content / error states. */
  OX.load = function (container, loader, render, skelKind) {
    OX.clear(container).appendChild(OX.skeleton(skelKind || "rows", skelKind === "tiles" ? 4 : 4));
    var run = function () {
      return loader().then(function (data) { OX.clear(container); append(container, render(data)); return data; })
        .catch(function (err) { if (err && err.name === "AbortError") return; OX.clear(container).appendChild(OX.errorState(err, function () { OX.load(container, loader, render, skelKind); })); });
    };
    return run();
  };

  /** Paginated list with toolbar filters. opts: {fetch(page, filters) -> Promise<{data, meta}>, render(rows) -> Node, empty: {title, body, icon}} */
  OX.pagedList = function (opts) {
    var root = h("div");
    var body = h("div");
    var pager = h("div.pager");
    var page = 1, filters = opts.filters || {};
    root.appendChild(body);
    root.appendChild(pager);
    function load() {
      OX.clear(body).appendChild(OX.skeleton("rows", 5));
      pager.hidden = true;
      return opts.fetch(page, filters).then(function (res) {
        OX.clear(body);
        var rows = res.data || [];
        if (!rows.length) { body.appendChild(OX.stateView(Object.keys(filters).some(function (k) { return filters[k]; }) ? { icon: "search", title: t("state_no_results_title"), body: t("state_no_results_body") } : opts.empty)); return; }
        append(body, opts.render(rows, res));
        var m = res.meta || {};
        var pages = m.pages || Math.ceil((m.total || 0) / (m.per_page || 20)) || 1;
        if (pages > 1) {
          pager.hidden = false;
          OX.clear(pager);
          var prev = h("button", { class: "btn btn-outline btn-sm", type: "button", disabled: page <= 1, onclick: function () { page--; load(); root.scrollIntoView({ block: "start" }); } }, OX.icon("chevron-left", "icon-sm"), t("previous"));
          var next = h("button", { class: "btn btn-outline btn-sm", type: "button", disabled: page >= pages, onclick: function () { page++; load(); root.scrollIntoView({ block: "start" }); } }, t("next"), OX.icon("chevron-right", "icon-sm"));
          pager.appendChild(prev);
          pager.appendChild(h("span.num", t("page_of", { page: OX.fmt.int(page), pages: OX.fmt.int(pages) })));
          pager.appendChild(next);
        }
      }).catch(function (err) { OX.clear(body).appendChild(OX.errorState(err, load)); });
    }
    root.reload = function (f) { if (f) filters = f; page = 1; return load(); };
    root.setFilter = function (k, v) { filters[k] = v; page = 1; return load(); };
    root.filters = function () { return filters; };
    load();
    return root;
  };

  /* ------------------------------------------------------------------ theme */
  OX.theme = {
    get: function () { try { return localStorage.getItem("oryx-theme") || "light"; } catch (e) { return "light"; } },
    set: function (pref) {
      try { localStorage.setItem("oryx-theme", pref); } catch (e) {}
      OX.theme.apply(pref);
    },
    resolved: function () { return document.documentElement.getAttribute("data-theme"); },
    apply: function (pref) {
      var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme-pref", pref);
      var m = document.querySelector('meta[name="color-scheme"]'); if (m) m.content = dark ? "dark" : "light";
      var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = dark ? "#0A1120" : "#F5F7FB";
      document.dispatchEvent(new CustomEvent("ox:theme"));
    }
  };
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { if (OX.theme.get() === "system") OX.theme.apply("system"); });
  window.addEventListener("storage", function (e) { if (e.key === "oryx-theme") OX.theme.apply(e.newValue || "light"); });

  /* ------------------------------------------------------------------ router (hash-based; works on any host without rewrite rules for deep links) */
  var routes = [], cleanups = [];
  OX.onLeave = function (fn) { cleanups.push(fn); };
  OX.route = function (pattern, handler, opts) {
    var keys = [];
    var re = new RegExp("^" + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ re: re, keys: keys, handler: handler, opts: opts || {} });
  };
  OX.current = function () {
    var raw = location.hash.replace(/^#/, "") || "/";
    var qi = raw.indexOf("?");
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var query = {};
    if (qi >= 0) new URLSearchParams(raw.slice(qi + 1)).forEach(function (v, k) { query[k] = v; });
    return { path: path, query: query, raw: raw };
  };
  OX.go = function (path, replace) {
    if (replace) { history.replaceState(null, "", "#" + path); dispatch(); }
    else if (location.hash === "#" + path) dispatch();
    else location.hash = path;
  };
  OX.dispatchRoute = dispatch;
  function dispatch() {
    cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
    var cur = OX.current();
    for (var i = 0; i < routes.length; i++) {
      var m = cur.path.match(routes[i].re);
      if (m) {
        var params = {};
        routes[i].keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        routes[i].handler(params, cur.query, routes[i].opts);
        return;
      }
    }
    if (OX.notFound) OX.notFound(cur);
  }
  window.addEventListener("hashchange", dispatch);

  /** Visibility-aware polling; stops on route change and while the tab is hidden. */
  OX.poll = function (fn, ms) {
    var timer = null, stopped = false;
    function tick() { if (stopped) return; if (document.visibilityState === "visible" && navigator.onLine) fn(); timer = setTimeout(tick, ms); }
    function vis() { if (document.visibilityState === "visible" && !stopped) { clearTimeout(timer); timer = setTimeout(tick, 400); } }
    document.addEventListener("visibilitychange", vis);
    timer = setTimeout(tick, ms);
    var stop = function () { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
    OX.onLeave(stop);
    return stop;
  };

  /** Animated number change (rAF, frame-rate independent, skipped when reduced motion is requested). */
  OX.tween = function (node, from, to, format, dur) {
    if (reduceMotion || from === null || to === null || from === to || !isFinite(from) || !isFinite(to)) { node.textContent = format(to); return; }
    var start = null; dur = dur || 600;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = format(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else node.textContent = format(to);
    }
    requestAnimationFrame(step);
  };

  /* ------------------------------------------------------------------ charts (TradingView Lightweight Charts, theme-aware) */
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  OX.chart = {
    create: function (node, kind, data, opts) {
      opts = opts || {};
      if (!window.LightweightCharts) { node.appendChild(h("div.chart-overlay", t("chart_unavailable"))); return null; }
      var LC = window.LightweightCharts;
      var chart = LC.createChart(node, {
        autoSize: true,
        layout: { background: { type: "solid", color: "transparent" }, textColor: css("--text-3"), fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, attributionLogo: false },
        grid: { vertLines: { color: "transparent" }, horzLines: { color: css("--border") } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: { borderVisible: false, timeVisible: opts.timeVisible !== false, secondsVisible: false },
        crosshair: { mode: 1, vertLine: { color: css("--border-strong"), labelBackgroundColor: css("--navy") }, horzLine: { color: css("--border-strong"), labelBackgroundColor: css("--navy") } },
        handleScroll: { vertTouchDrag: false },
        localization: { locale: intlLocale(), priceFormatter: function (p) { return OX.fmt.price(p, opts.priceDecimals); } }
      });
      var series;
      if (kind === "candles") {
        series = chart.addCandlestickSeries({ upColor: css("--gain"), downColor: css("--loss"), borderVisible: false, wickUpColor: css("--gain"), wickDownColor: css("--loss"), priceLineVisible: true });
      } else {
        series = chart.addAreaSeries({ lineColor: css("--primary"), topColor: "color-mix(in srgb, " + css("--primary") + " 22%, transparent)", bottomColor: "transparent", lineWidth: 2, priceLineVisible: false });
      }
      series.setData(data);
      chart.timeScale().fitContent();
      var onTheme = function () {
        chart.applyOptions({ layout: { textColor: css("--text-3") }, grid: { horzLines: { color: css("--border") } } });
        if (kind === "candles") series.applyOptions({ upColor: css("--gain"), downColor: css("--loss"), wickUpColor: css("--gain"), wickDownColor: css("--loss") });
        else series.applyOptions({ lineColor: css("--primary") });
      };
      document.addEventListener("ox:theme", onTheme);
      OX.onLeave(function () { document.removeEventListener("ox:theme", onTheme); chart.remove(); });
      return { chart: chart, series: series };
    },
    candles: function (rows) {
      return rows.map(function (r) { return { time: r.time, open: +r.open, high: +r.high, low: +r.low, close: +r.close }; })
        .filter(function (r, i, a) { return isFinite(r.open) && (i === 0 || r.time > a[i - 1].time); });
    }
  };

  /* ------------------------------------------------------------------ misc */
  OX.copy = function (text) { return navigator.clipboard ? navigator.clipboard.writeText(text).then(function () { OX.toast(t("copied")); }) : Promise.resolve(); };
  OX.statusChip = function (status) {
    var map = { completed: "gain", paid: "gain", approved: "gain", active: "primary", open: "info", closed: "", reversed: "warn", reversal: "warn", pending: "warn", processed: "info", rejected: "loss", suspended: "loss", repaid: "gain", sent: "gain", queued: "info", failed: "loss", cancelled: "", new: "info", resolved: "gain", spam: "" };
    return h("span", { class: "chip " + (map[status] || ""), text: t("status_" + status) });
  };
  window.addEventListener("online", function () { document.dispatchEvent(new CustomEvent("ox:online")); });
})();
