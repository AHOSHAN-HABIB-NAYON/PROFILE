/* OryzenX Admin App (/v2admin). Every action is authorised again on the server; hidden UI is never the only check. */
(function () {
  "use strict";
  var OX = window.OX, h = OX.el, t = OX.t, f = OX.fmt, api = OX.api, icon = OX.icon;
  var app = document.getElementById("app");
  var S = OX.state;
  function can(p) { return S.user && S.user.permissions.indexOf(p) !== -1; }

  var NAV = [
    ["a_overview", [
      ["/dashboard", "layout-dashboard", "a_dashboard", "dashboard.view"],
      ["/health", "activity", "a_health", "system.health"]]],
    ["a_people", [
      ["/users", "users", "a_users", "users.view"],
      ["/verification", "badge-check", "a_verification", "verification.view", "pending"],
      ["/roles", "key-round", "a_roles", "roles.manage"],
      ["/support", "life-buoy", "a_support", "support.view", "support"]]],
    ["a_finance", [
      ["/investments", "coins", "a_investments", "finance.view"],
      ["/assets", "chart-line", "a_assets", "finance.view"],
      ["/trading", "chart-candlestick", "a_trading_monitor", "finance.view"],
      ["/trades", "history", "a_trades", "finance.view"],
      ["/ledger", "receipt", "a_ledger", "finance.view"],
      ["/loans", "landmark", "a_loans", "finance.view"],
      ["/salary", "wallet", "a_salary", "salary.view"],
      ["/payment-methods", "banknote", "a_payment_methods", "salary.view"],
      ["/allocation", "layers", "a_allocation", "allocation.view"]]],
    ["a_communication", [
      ["/email", "mail", "a_email", "notifications.email"],
      ["/push", "smartphone", "a_push", "notifications.push"],
      ["/content", "file-text", "a_content", "content.manage"]]],
    ["a_configuration", [
      ["/settings", "settings", "a_general", "settings.view"],
      ["/branding", "palette", "a_branding", "settings.view"],
      ["/languages", "languages", "a_languages", "settings.view"],
      ["/smtp", "send", "a_smtp", "settings.view"],
      ["/market-api", "database", "a_market_api", "settings.view"],
      ["/firebase", "bell", "a_firebase", "settings.view"]]],
    ["a_security", [
      ["/audit", "shield", "a_audit", "audit.view"],
      ["/backups", "archive", "a_backups", "system.backup"]]]
  ];

  /* ------------------------------------------------------------------ layout */
  var side, scrim;
  function layout(title, opts) {
    opts = opts || {};
    var cur = OX.current().path;
    side = h("aside.a-side", { id: "a-side", "aria-label": t("a_navigation") },
      h("div.brand-row", OX.logo(), h("span.tag", t("a_admin"))),
      NAV.map(function (g) {
        var items = g[1].filter(function (i) { return can(i[3]); });
        if (!items.length) return null;
        return h("div.a-nav-group", h("h2", t(g[0])), h("ul", items.map(function (i) {
          var count = i[4] === "pending" ? S.counts.pending : i[4] === "support" ? S.counts.support : 0;
          return h("li", h("a", { href: "#" + i[0], "aria-current": cur === i[0] || cur.indexOf(i[0] + "/") === 0 ? "page" : null, onclick: closeNav }, icon(i[1]), h("span", t(i[2])), count ? h("span.count", f.int(count)) : null));
        })));
      }),
      h("div", { style: { marginTop: "auto" } }, h("div.a-nav-group", h("ul",
        h("li", h("a", { href: OX.boot.base + "/app/", target: "_blank", rel: "noopener" }, icon("external-link"), h("span", t("a_open_user_app")))),
        h("li", h("a", { href: "#/account" }, icon("user"), h("span.truncate", S.user.full_name))))))
    );
    scrim = h("div.a-scrim", { onclick: closeNav });
    var top = h("header.a-top",
      h("button", { class: "icon-btn a-menu-btn", type: "button", "aria-label": t("a_open_menu"), "aria-controls": "a-side", "aria-expanded": "false", onclick: openNav }, icon("menu")),
      opts.back ? h("a", { class: "icon-btn", href: "#" + opts.back, "aria-label": t("back") }, icon("arrow-left")) : null,
      h("h1", title),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("toggle_theme"), onclick: function () { OX.theme.set(OX.theme.resolved() === "dark" ? "light" : "dark"); } }, icon(OX.theme.resolved() === "dark" ? "sun" : "moon")),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", lang: OX.locale === "bn" ? "en" : "bn", onclick: function () { var l = OX.locale === "bn" ? "en" : "bn"; OX.setLocale(l).then(OX.dispatchRoute); } }, OX.locale === "bn" ? "EN" : "বাং"),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("sign_out"), onclick: logout }, icon("log-out")));
    var content = h("div.a-content.view-enter", { id: "main" });
    OX.clear(app).appendChild(h("div.a-shell", side, scrim, h("div.a-main", top, content)));
    document.title = title + " · OryzenX Admin";
    window.scrollTo(0, 0);
    if (opts.desc || opts.actions) content.appendChild(h("div.page-head", h("div", opts.desc ? h("p", opts.desc) : null), opts.actions ? h("div.page-actions", opts.actions) : null));
    return content;
  }
  function openNav() { side.classList.add("open"); scrim.classList.add("open"); document.querySelector(".a-menu-btn").setAttribute("aria-expanded", "true"); side.querySelector("a").focus(); }
  function closeNav() { if (!side) return; side.classList.remove("open"); scrim.classList.remove("open"); var b = document.querySelector(".a-menu-btn"); if (b) b.setAttribute("aria-expanded", "false"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && side && side.classList.contains("open")) closeNav(); });

  function card(title, body, actions) { return h("section.card", title ? h("div.card-head", h("h2", title), actions || null) : null, body); }
  function btn(label, onclick, cls, ic) { return h("button", { class: "btn " + (cls || "btn-outline") + " btn-sm", type: "button", onclick: onclick }, ic ? icon(ic, "icon-sm") : null, label); }
  function kv(rows) { return h("dl.kv", rows.filter(Boolean).map(function (r) { return h("div.kv-row", h("dt", r[0]), h("dd", r[1] === null || r[1] === undefined || r[1] === "" ? "—" : r[1])); })); }
  function metric(label, value, sub, cls, href) {
    var inner = [h("span.m-label", label), h("span", { class: "m-value num " + (cls || "") }, value), sub ? h("span.m-sub", sub) : null];
    return href ? h("a.metric", { href: href }, inner) : h("div.metric.static", inner);
  }
  function err(e) { OX.toast(OX.serverMsg(e && e.message), "err"); }

  /** Generic table: cols = [{label, render(row)->node|string, num, cls}] */
  function table(cols, rows, onRow) {
    return h("div.table-wrap", h("table.table.responsive",
      h("thead", h("tr", cols.map(function (c) { return h("th", { class: c.num ? "num" : c.cls || "", scope: "col" }, c.label); }))),
      h("tbody", rows.map(function (r) {
        var tr = h("tr", { class: onRow ? "clickable" : null, tabindex: onRow ? "0" : null }, cols.map(function (c) {
          var v = c.render(r);
          return h("td", { class: c.num ? "num" : c.cls || "", "data-label": c.label }, v === null || v === undefined || v === "" ? "—" : v);
        }));
        if (onRow) { tr.addEventListener("click", function (e) { if (!e.target.closest("button,a")) onRow(r); }); tr.addEventListener("keydown", function (e) { if (e.key === "Enter") onRow(r); }); }
        return tr;
      }))));
  }
  function pagedTable(opts) {
    return OX.pagedList({ filters: opts.filters, fetch: opts.fetch, empty: opts.empty || { icon: "inbox", title: t("a_nothing_here"), body: "" },
      render: function (rows, res) { return h("section.card.flush", table(opts.cols, rows, opts.onRow), opts.footer ? opts.footer(res) : null); } });
  }
  function selectEl(options, value, label) {
    var s = h("select", { "aria-label": label }, options.map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    if (value !== undefined) s.value = value;
    return s;
  }
  function userCell(r) { return r.user_name ? h("a", { href: "#/users/" + r.user_id }, r.user_name) : "—"; }
  function pnlCell(v) { return v === null || v === undefined ? "—" : h("span", { class: f.cls(v) }, f.signedUsd(v)); }

  /** Account picker: search by name/email, stores the id in a hidden input named user_id. */
  function userPicker(initial) {
    var hidden = h("input", { type: "hidden", name: "user_id", value: initial ? initial.id : "" });
    var id = "up-" + Math.random().toString(36).slice(2, 7);
    var input = h("input", { id: id, type: "search", autocomplete: "off", placeholder: t("a_search_user"), value: initial ? initial.full_name + " · " + initial.email : "", role: "combobox", "aria-expanded": "false", "aria-controls": id + "-list", "aria-autocomplete": "list" });
    var list = h("ul", { id: id + "-list", role: "listbox", class: "card", style: { position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, padding: "4px", marginTop: "4px", listStyle: "none", maxHeight: "240px", overflow: "auto", display: "none" } });
    var search = OX.debounce(function () {
      var q = input.value.trim();
      hidden.value = "";
      if (q.length < 2) { list.style.display = "none"; return; }
      api.get("/api/admin/users/lookup", { q: q }).then(function (r) {
        OX.clear(list);
        r.data.forEach(function (u) {
          list.appendChild(h("li", { role: "option" }, h("button", { class: "list-item", type: "button", style: { minHeight: "48px", padding: "6px 10px" }, onclick: function () { hidden.value = u.id; input.value = u.full_name + " · " + u.email; list.style.display = "none"; input.setAttribute("aria-expanded", "false"); } },
            h("div.li-main", h("span.li-title", u.full_name), h("span.li-sub", u.email + " · " + t("identity_" + u.identity_status))))));
        });
        if (!r.data.length) list.appendChild(h("li.subtle.small", { style: { padding: "8px" } }, t("state_no_results_title")));
        list.style.display = "block"; input.setAttribute("aria-expanded", "true");
      }).catch(function () {});
    }, 250);
    input.addEventListener("input", search);
    return { node: h("div.field.span-2", h("label", { for: id }, t("a_account")), h("div", { style: { position: "relative" } }, input, list), hidden), hidden: hidden };
  }

  var ASSETS = null;
  function assets() { return ASSETS ? Promise.resolve(ASSETS) : api.get("/api/admin/assets").then(function (r) { ASSETS = r.data.assets; return ASSETS; }); }
  function assetOptions(list) { return list.map(function (a) { return [a.id, a.symbol + " · " + a.name]; }); }
  function nowLocal() { return OX.fmt.localInput(new Date()); }

  /** Form inside a sheet. fields as OX.form; submit(values) returns a promise. */
  function formSheet(title, fields, submit, opts) {
    opts = opts || {};
    var s;
    var idem = OX.uuid();
    var form = OX.form(fields, { grid: opts.grid !== false, submitText: opts.submitText || t("save"), onSubmit: function (v) {
      v.idempotency_key = idem;
      return Promise.resolve(submit(v)).then(function (res) { if (res !== false) { s.close(); if (opts.done) opts.done(res); } });
    } });
    s = OX.sheet({ title: title, wide: opts.wide, content: h("div.stack", opts.intro ? h("p.muted.small", opts.intro) : null, opts.pre || null, form, opts.note ? h("p.subtle.xs", opts.note) : null) });
    return s;
  }
  function reverseAction(path, title, message, done) {
    OX.confirm({ title: title, message: message, danger: true, reason: true, reasonLabel: t("a_reason_audit"), confirmText: t("a_reverse") }).then(function (reason) {
      if (!reason) return;
      api.post(path, { reason: reason }).then(function () { OX.toast(t("a_reversed")); if (done) done(); }).catch(err);
    });
  }

  /* ------------------------------------------------------------------ dashboard */
  OX.route("/dashboard", function () {
    var c = layout(t("a_dashboard"), { desc: t("a_dashboard_desc") });
    var body = h("div.stack");
    c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/dashboard"); }, function (r) {
      var d = r.data, u = d.users;
      S.counts.pending = u.pending_verification; S.counts.support = d.support_new;
      return [
        h("div.metrics.m4",
          metric(t("a_total_users"), f.int(u.total), t("a_demo_accounts", { n: f.int(u.demo) }), "", "#/users"),
          metric(t("a_verified_users"), f.int(u.identity_verified), t("a_email_verified_n", { n: f.int(u.email_verified) }), "", "#/users"),
          metric(t("a_pending_verification"), f.int(u.pending_verification), t("a_awaiting_review"), u.pending_verification ? "loss" : "", "#/verification"),
          metric(t("a_suspended"), f.int(u.suspended), t("a_accounts"), "", "#/users")),
        h("div.metrics.m4",
          metric(t("a_investment_value"), f.usd(d.investment_value_usd), t("a_cost_basis") + " " + f.usd(d.investment_cost_basis_usd), "", "#/investments"),
          metric(t("a_trading_balances"), f.usd(d.trading_balances_usd), t("a_cash_balances") + " " + f.usd(d.cash_balances_usd), "", "#/trades"),
          metric(t("a_realized_pnl"), f.signedUsd(d.realized_pnl_usd), t("a_after_fees"), f.cls(d.realized_pnl_usd), "#/ledger"),
          metric(t("a_unrealized_pnl"), f.signedUsd(d.unrealized_pnl_usd), d.unpriced_assets ? t("a_unpriced_n", { n: d.unpriced_assets }) : t("a_market_valuation"), f.cls(d.unrealized_pnl_usd), "#/investments")),
        h("div.metrics.m4",
          metric(t("a_loan_liabilities"), f.usd(d.loan_liabilities_usd), t("a_live_valuation"), "", "#/loans"),
          metric(t("a_salary_open"), f.int(d.salary.open_count), f.usd(d.salary.open_amount_usd) + (d.salary.open_non_usd_count ? " + " + t("a_non_usd_n", { n: d.salary.open_non_usd_count }) : ""), "", "#/salary"),
          metric(t("a_salary_overdue"), f.int(d.salary.overdue_count), t("a_paid_n", { n: f.int(d.salary.paid_count) }), d.salary.overdue_count ? "loss" : "", "#/salary"),
          metric(t("a_support_new"), f.int(d.support_new), t("a_inquiries"), "", "#/support")),
        h("div.grid-cards",
          card(t("a_market_status"), h("div.stack-sm", h("div.row", h("span", { class: "status-dot " + (d.market.healthy ? "ok" : "warning") }), h("strong", d.market.provider_label)), kv([
            [t("a_last_success"), d.market.last_success_at ? f.dateTime(d.market.last_success_at) : t("a_never")],
            [t("a_stale_assets"), f.int(d.market.stale_assets)],
            [t("a_last_error"), d.market.last_error ? h("span.small.loss", d.market.last_error) : "—"]])), can("market.manage") ? btn(t("a_refresh_prices"), function () { api.post("/api/admin/market/refresh").then(function (x) { OX.toast(x.data.ok ? t("a_prices_updated", { n: x.data.updated }) : x.data.error, x.data.ok ? "ok" : "err"); OX.dispatchRoute(); }).catch(err); }, "", "refresh-cw") : null),
          card(t("a_email_status"), h("div.stack-sm", h("div.row", h("span", { class: "status-dot " + (d.email.configured ? (d.email.last_test_status === "accepted" ? "ok" : "warning") : "error") }), h("strong", d.email.configured ? t("a_smtp_configured") : t("a_smtp_not_configured"))), kv([
            [t("status_queued"), f.int(d.email.queued)], [t("a_sent_accepted"), f.int(d.email.sent)], [t("status_failed"), f.int(d.email.failed)],
            [t("a_last_test"), d.email.last_test_at ? f.dateTime(d.email.last_test_at) + " · " + t("a_test_" + d.email.last_test_status) : t("a_never")]])), h("a.card-link", { href: "#/email" }, t("a_manage"))),
          card(t("a_push_status"), kv([[t("status"), d.push.configured ? t("a_configured") : t("a_not_configured")], [t("a_registered_devices"), f.int(d.push.devices)]]), h("a.card-link", { href: "#/push" }, t("a_manage")))),
        h("div.grid-cards",
          card(t("a_recent_transactions"), d.recent_transactions.length ? table([
            { label: t("type"), render: function (x) { return t("tx_" + x.type); } },
            { label: t("a_account"), render: function (x) { return x.user_name; } },
            { label: t("amount_usd"), num: true, render: function (x) { return f.usd(x.amount_usd); } }
          ], d.recent_transactions) : h("p.muted.small", t("a_none_yet")), h("a.card-link", { href: "#/ledger" }, t("view_all"))),
          card(t("a_recent_admin_activity"), d.recent_activity.length ? h("ul.list", d.recent_activity.map(function (a) {
            return h("li", h("div.list-item", { style: { minHeight: "48px", padding: "8px 0" } }, h("div.li-main", h("span.li-title", a.action), h("span.li-sub", (a.actor_name || t("a_system")) + " · " + f.ago(a.created_at)))));
          })) : h("p.muted.small", t("a_none_yet")), can("audit.view") ? h("a.card-link", { href: "#/audit" }, t("view_all")) : null)),
        card(t("definitions"), h("div.stack-sm", Object.keys(d.definitions).map(function (k) { return h("p.small.muted", h("strong", t("a_def_" + k) + ": "), d.definitions[k]); })))
      ];
    }, "tiles");
  });

  /* ------------------------------------------------------------------ users */
  OX.route("/users", function () {
    var c = layout(t("a_users"), { desc: t("a_users_desc") });
    var q = h("input", { type: "search", placeholder: t("a_search_users"), "aria-label": t("search") });
    var st = selectEl([["", t("all_statuses")], ["active", t("status_active")], ["suspended", t("status_suspended")]], "", t("status"));
    var vf = selectEl([["", t("a_any_verification")], ["email", t("a_email_verified")], ["unverified", t("a_email_unverified")]], "", t("a_verification"));
    var idf = selectEl([["", t("a_any_identity")], ["pending", t("identity_pending")], ["approved", t("identity_approved")], ["rejected", t("identity_rejected")], ["not_submitted", t("identity_not_submitted")]], "", t("a_identity"));
    var list = pagedTable({
      fetch: function (p, fl) { return api.get("/api/admin/users", Object.assign({ page: p }, fl)); },
      onRow: function (r) { OX.go("/users/" + r.id); },
      cols: [
        { label: t("full_name"), render: function (r) { return h("div", h("strong", r.full_name), +r.is_admin ? h("span.chip.primary", { style: { marginLeft: "6px" } }, t("a_admin")) : null, +r.is_demo ? h("span.chip.warn", { style: { marginLeft: "6px" } }, t("a_demo")) : null, h("div.subtle.xs", r.email)); } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: t("a_email"), render: function (r) { return r.email_verified_at ? h("span.chip.gain", t("verified")) : h("span.chip.warn", t("a_unverified")); } },
        { label: t("a_identity"), render: function (r) { return OX.statusChip(r.identity_status === "not_submitted" ? "new" : r.identity_status); } },
        { label: t("a_last_login"), render: function (r) { return r.last_login_at ? f.ago(r.last_login_at) : t("a_never"); } },
        { label: t("a_joined"), render: function (r) { return f.date(r.created_at); } }
      ]
    });
    q.addEventListener("input", OX.debounce(function () { list.setFilter("q", q.value.trim()); }, 300));
    st.onchange = function () { list.setFilter("status", st.value); };
    vf.onchange = function () { list.setFilter("verified", vf.value); };
    idf.onchange = function () { list.setFilter("identity", idf.value); };
    c.appendChild(h("div.toolbar", h("div.search", icon("search"), q), st, vf, idf));
    c.appendChild(list);
  });

  OX.route("/users/:id", function (p) {
    var c = layout(t("a_user_details"), { back: "/users" });
    var body = h("div.stack");
    c.appendChild(body);
    function reload() { OX.dispatchRoute(); }
    OX.load(body, function () { return Promise.all([api.get("/api/admin/users/" + p.id), can("roles.manage") ? api.get("/api/admin/roles") : Promise.resolve(null)]); }, function (rs) {
      var u = rs[0].data, roles = rs[1] ? rs[1].data.roles : [];
      document.querySelector(".a-top h1").textContent = u.full_name;
      var pf = u.portfolio;
      var actions = h("div.page-actions",
        can("users.suspend") ? (u.status === "active"
          ? btn(t("a_suspend"), function () { OX.confirm({ title: t("a_suspend_title"), message: t("a_suspend_body"), danger: true, reason: true, confirmText: t("a_suspend") }).then(function (reason) { if (reason) api.post("/api/admin/users/" + u.id + "/status", { status: "suspended", reason: reason }).then(function () { OX.toast(t("a_user_suspended")); reload(); }).catch(err); }); }, "btn-outline", "ban")
          : btn(t("a_reactivate"), function () { api.post("/api/admin/users/" + u.id + "/status", { status: "active" }).then(function () { OX.toast(t("a_user_reactivated")); reload(); }).catch(err); }, "btn-outline", "user-check")) : null,
        can("users.manage") && !u.email_verified_at ? btn(t("a_resend_verification"), function () { api.post("/api/admin/users/" + u.id + "/resend-verification").then(function () { OX.toast(t("code_sent")); }).catch(err); }, "btn-outline", "mail") : null,
        can("finance.investments") ? btn(t("a_record_investment"), function () { investmentForm(u); }, "btn-outline", "plus") : null,
        can("finance.trades") ? btn(t("a_record_trade"), function () { tradeForm(u); }, "btn-outline", "plus") : null,
        can("finance.ledger") ? btn(t("a_record_movement"), function () { movementForm(u); }, "btn-outline", "plus") : null,
        can("finance.loans") ? btn(t("a_record_loan"), function () { loanForm(u); }, "btn-outline", "plus") : null
      );
      var nodes = [actions];
      if (u.status === "suspended") nodes.push(h("div.banner.err", icon("ban", "icon-sm"), h("span", t("a_suspended_reason") + ": " + (u.suspended_reason || "—"))));
      nodes.push(h("div.metrics.m4",
        metric(t("all_balance"), f.usd(pf.all_balance_usd)), metric(t("investment_balance"), f.usd(pf.investment_balance_usd)),
        metric(t("trading_balance"), f.usd(pf.trading_balance_usd)), metric(t("loan_balance"), f.usd(pf.loan_balance_usd)),
        metric(t("net_value"), f.usd(pf.net_value_usd)), metric(t("unrealized_pnl"), f.signedUsd(pf.unrealized_pnl_usd), null, f.cls(pf.unrealized_pnl_usd)),
        metric(t("realized_all_time"), f.signedUsd(pf.realized_pnl_all_time_usd), null, f.cls(pf.realized_pnl_all_time_usd)), metric(t("main_balance"), f.usd(pf.cash_balance_usd))));
      var profileForm = OX.form([
        { name: "full_name", label: t("full_name"), required: true, value: u.full_name },
        { name: "phone", label: t("phone"), value: u.phone || "", type: "tel" },
        { name: "locale", label: t("language"), type: "select", options: [["en", "English"], ["bn", "বাংলা"]], value: u.locale, required: true },
        { name: "address_line", label: t("address"), value: u.address_line || "" },
        { name: "city", label: t("city"), value: u.city || "" },
        { name: "country", label: t("country"), value: u.country || "" }
      ], { grid: true, submitText: t("save_changes"), block: false, onSubmit: function (v) { return api.put("/api/admin/users/" + u.id, v).then(function () { OX.toast(t("saved")); }); } });
      if (!can("users.manage")) profileForm.querySelectorAll("input,select,button").forEach(function (x) { x.disabled = true; });
      nodes.push(h("div.grid-cards",
        card(t("a_account_info"), kv([
          [t("email"), u.email], [t("status"), OX.statusChip(u.status)],
          [t("a_email_verified"), u.email_verified_at ? f.dateTime(u.email_verified_at) : t("no")],
          [t("a_identity"), OX.statusChip(u.identity_status === "not_submitted" ? "new" : u.identity_status)],
          [t("a_google_linked"), +u.has_google ? t("yes") : t("no")],
          [t("a_active_sessions"), f.int(u.sessions)],
          [t("a_joined"), f.dateTime(u.created_at)], [t("a_last_login"), u.last_login_at ? f.dateTime(u.last_login_at) : t("a_never")],
          [t("a_uuid"), h("span.small.num", u.uuid)]])),
        card(t("personal_details"), profileForm)));
      if (can("roles.manage")) {
        var checks = roles.map(function (r) {
          var cb = h("input", { type: "checkbox", value: r.id }); cb.checked = u.roles.some(function (x) { return +x.id === +r.id; });
          return h("label.check", cb, h("span", h("strong", r.name), h("div.subtle.xs", r.description)));
        });
        nodes.push(card(t("a_roles"), h("div.stack", h("p.subtle.small", t("a_roles_hint")), h("div.stack-sm", checks), h("div.form-actions", btn(t("a_save_roles"), function () {
          var ids = checks.map(function (l) { var i = l.querySelector("input"); return i.checked ? +i.value : null; }).filter(Boolean);
          api.post("/api/admin/users/" + u.id + "/roles", { role_ids: ids }).then(function () { OX.toast(t("saved")); reload(); }).catch(err);
        }, "btn-primary")))));
      }
      var holdings = pf.holdings.filter(function (x) { return +x.quantity > 0; });
      nodes.push(card(t("holdings"), holdings.length ? table([
        { label: t("asset"), render: function (x) { return x.symbol; } },
        { label: t("quantity"), num: true, render: function (x) { return f.qty(x.quantity); } },
        { label: t("average_price"), num: true, render: function (x) { return f.price(x.average_price); } },
        { label: t("cost_basis"), num: true, render: function (x) { return f.usd(x.cost_basis_usd); } },
        { label: t("current_price"), num: true, render: function (x) { return f.price(x.current_price); } },
        { label: t("market_value"), num: true, render: function (x) { return f.usd(x.market_value_usd); } },
        { label: t("unrealized_pnl"), num: true, render: function (x) { return pnlCell(x.unrealized_pnl_usd); } }
      ], holdings) : h("p.muted.small", t("empty_holdings_title"))));
      var pdBox = h("div");
      if (can("salary.view")) {
        nodes.push(card(t("payment_details"), pdBox));
        api.get("/api/admin/users/" + u.id + "/payment-details").then(function (r) {
          OX.clear(pdBox).appendChild(r.data.length ? h("ul.list", r.data.map(function (pd) {
            return h("li", h("div.list-item", h("div.li-main", h("span.li-title", pd.name + (+pd.is_primary ? " · " + t("primary") : "")), h("span.li-sub", Object.values(pd.details_masked || {}).join(" · "))),
              can("salary.manage") ? btn(t("a_reveal"), function () { api.post("/api/admin/users/" + u.id + "/payment-details/" + pd.payment_method_id + "/reveal").then(function (x) { OX.sheet({ title: pd.name, content: [kv(Object.keys(x.data).map(function (k) { return [k, x.data[k]]; })), h("p.subtle.xs", t("a_reveal_audited"))] }); }).catch(err); }, "btn-ghost", "eye") : null));
          })) : h("p.muted.small", t("no_payment_details")));
        }).catch(function () {});
      }
      nodes.push(card(t("login_history"), u.logins.length ? table([
        { label: t("a_time"), render: function (l) { return f.dateTime(l.created_at); } },
        { label: t("a_result"), render: function (l) { return +l.success ? (+l.suspicious ? h("span.chip.loss", t("new_device")) : h("span.chip.gain", t("login_success"))) : h("span.chip.loss", t("login_failed") + (l.reason ? " · " + l.reason : "")); } },
        { label: "IP", render: function (l) { return l.ip; } },
        { label: t("a_method"), render: function (l) { return l.method; } }
      ], u.logins) : h("p.muted.small", t("a_none_yet"))));
      if (can("allocation.view")) {
        var rec = h("div");
        nodes.push(card(t("a_reconciliation"), rec, btn(t("a_run_check"), function () { reconcile(rec, "/api/admin/users/" + u.id + "/reconciliation"); }, "btn-outline", "scale")));
      }
      return nodes;
    });
  });

  function reconcile(container, path) {
    OX.load(container, function () { return api.get(path); }, function (r) {
      var d = r.data;
      return h("div.stack-sm", h("div", { class: "banner " + (d.ok ? "ok" : "err") }, icon(d.ok ? "circle-check-big" : "circle-alert", "icon-sm"), h("span", d.ok ? t("a_recon_ok") : t("a_recon_failed"))),
        h("ul.list.health-list", d.checks.map(function (c) {
          return h("li", h("span", { class: "status-dot " + (c.ok ? "ok" : "error") }), h("span", c.label), !c.ok ? h("span.d", JSON.stringify(c.details).slice(0, 400)) : null);
        })), h("p.subtle.xs", t("a_checked_at", { time: f.dateTime(d.checked_at) })));
    });
  }

  /* ------------------------------------------------------------------ verification */
  OX.route("/verification", function () {
    var c = layout(t("a_verification"), { desc: t("a_verification_desc") });
    var st = selectEl([["pending", t("status_pending")], ["approved", t("status_approved")], ["rejected", t("status_rejected")], ["", t("all_statuses")]], "pending", t("status"));
    var list = pagedTable({
      filters: { status: "pending" },
      fetch: function (p, fl) { return api.get("/api/admin/verifications", Object.assign({ page: p }, fl)); },
      onRow: review,
      empty: { icon: "badge-check", title: t("a_no_verifications"), body: "" },
      cols: [
        { label: t("full_name"), render: function (r) { return h("div", h("strong", r.full_name), h("div.subtle.xs", r.email)); } },
        { label: t("document_type"), render: function (r) { return t("doc_" + r.document_type) + " · " + r.document_number_masked; } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: t("a_submitted"), render: function (r) { return f.dateTime(r.created_at); } },
        { label: t("a_reviewer"), render: function (r) { return r.reviewer_name ? r.reviewer_name + " · " + f.date(r.reviewed_at) : "—"; } },
        { label: "", cls: "actions", render: function (r) { return btn(r.status === "pending" ? t("a_review") : t("a_view"), function () { review(r); }); } }
      ]
    });
    st.onchange = function () { list.setFilter("status", st.value); };
    c.appendChild(h("div.toolbar", st));
    c.appendChild(list);
    function review(r) {
      var base = OX.boot.base + "/api/admin/verifications/" + r.id + "/document/";
      var img = function (side) { return h("a", { href: base + side, target: "_blank", rel: "noopener" }, h("img", { src: base + side, alt: t("document_" + side), loading: "lazy", style: { width: "100%", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface-2)", minHeight: "120px", objectFit: "contain" } })); };
      var content = [
        kv([[t("full_name"), r.full_name], [t("email"), r.email], [t("a_email_verified"), r.email_verified_at ? t("yes") : t("no")], [t("document_type"), t("doc_" + r.document_type)], [t("document_number"), r.document_number_masked], [t("a_submitted"), f.dateTime(r.created_at)], [t("status"), OX.statusChip(r.status)]]),
        h("div.grid-2", img("front"), +r.has_back ? img("back") : null),
        h("p.subtle.xs", t("a_document_access_logged"))
      ];
      if (r.status !== "pending") {
        content.push(kv([[t("a_internal_note"), r.review_note], [t("a_user_message"), r.user_message], [t("a_reviewer"), r.reviewer_name]]));
        OX.sheet({ title: t("a_verification_request"), wide: true, content: content });
        return;
      }
      if (!can("verification.review")) { OX.sheet({ title: t("a_verification_request"), wide: true, content: content }); return; }
      var note = h("textarea", { id: "rv-note", rows: 2, maxlength: 1000 });
      var msg = h("textarea", { id: "rv-msg", rows: 2, maxlength: 500 });
      content.push(h("div.field", h("label", { for: "rv-note" }, t("a_internal_note") + " " + t("optional_paren")), note));
      content.push(h("div.field", h("label", { for: "rv-msg" }, t("a_user_message")), h("span.hint", t("a_user_message_hint")), msg));
      var decide = function (decision) {
        api.post("/api/admin/verifications/" + r.id + "/review", { decision: decision, review_note: note.value, user_message: msg.value }).then(function () { OX.toast(decision === "approved" ? t("a_approved_toast") : t("a_rejected_toast")); s.close(); list.reload(); }).catch(err);
      };
      var s = OX.sheet({ title: t("a_verification_request"), wide: true, content: content, actions: [btn(t("a_reject"), function () { decide("rejected"); }, "btn-danger"), btn(t("a_approve"), function () { decide("approved"); }, "btn-primary")] });
    }
  });

  /* ------------------------------------------------------------------ investments */
  function investmentForm(user, done) {
    assets().then(function (list) {
      var picker = userPicker(user);
      formSheet(t("a_record_investment"), [
        { type: "html", node: picker.node },
        { name: "asset_id", label: t("asset"), type: "select", required: true, options: assetOptions(list), placeholder: t("select") },
        { name: "quantity", label: t("quantity"), type: "decimal", required: true, error: t("v_positive") },
        { name: "unit_price", label: t("a_acquisition_price"), type: "decimal", required: true, suffix: "USD", error: t("v_positive") },
        { name: "fee_usd", label: t("fees"), type: "decimal", value: "0", suffix: "USD" },
        { name: "acquired_at", label: t("a_acquisition_date"), type: "datetime-local", required: true, value: nowLocal(), hint: t("a_tz_hint", { tz: f.tzLabel() }) },
        { name: "funding", label: t("a_funding"), type: "select", required: true, options: [["external", t("a_funding_external")], ["cash", t("a_funding_cash")]], span: true },
        { name: "notes", label: t("notes"), type: "textarea", span: true, maxlength: 1000 }
      ], function (v) { if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; } return api.post("/api/admin/investments", v).then(function (r) { OX.toast(r.data.duplicate ? t("a_duplicate_ignored") : t("a_investment_recorded")); }); },
      { wide: true, intro: t("a_investment_intro"), done: done || function () { OX.dispatchRoute(); } });
    });
  }
  function saleForm(user, done) {
    assets().then(function (list) {
      var picker = userPicker(user);
      formSheet(t("a_record_sale"), [
        { type: "html", node: picker.node },
        { name: "asset_id", label: t("asset"), type: "select", required: true, options: assetOptions(list), placeholder: t("select") },
        { name: "quantity", label: t("quantity"), type: "decimal", required: true },
        { name: "unit_price", label: t("a_sale_price"), type: "decimal", required: true, suffix: "USD" },
        { name: "fee_usd", label: t("fees"), type: "decimal", value: "0", suffix: "USD" },
        { name: "sold_at", label: t("a_sale_date"), type: "datetime-local", required: true, value: nowLocal() },
        { name: "notes", label: t("notes"), type: "textarea", span: true }
      ], function (v) { if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; } return api.post("/api/admin/investment-sales", v).then(function (r) { OX.toast(t("a_sale_recorded", { pnl: f.signedUsd(r.data.realized_pnl_usd) })); }); },
      { wide: true, intro: t("a_sale_intro"), done: done || function () { OX.dispatchRoute(); } });
    });
  }
  OX.route("/investments", function (p, q) {
    var c = layout(t("a_investments"), { desc: t("a_investments_desc"), actions: [
      can("finance.investments") ? btn(t("a_record_investment"), function () { investmentForm(null); }, "btn-primary", "plus") : null,
      can("finance.investments") ? btn(t("a_record_sale"), function () { saleForm(null); }, "btn-outline", "banknote") : null] });
    var tab = q.tab === "sales" ? "sales" : "entries";
    c.appendChild(h("div.tabs", { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": tab === "entries" ? "true" : "false", onclick: function () { OX.go("/investments"); } }, t("a_entries")),
      h("button", { type: "button", role: "tab", "aria-selected": tab === "sales" ? "true" : "false", onclick: function () { OX.go("/investments?tab=sales"); } }, t("a_sales"))));
    assets().then(function (list) {
      var assetSel = selectEl([["", t("all_assets")]].concat(assetOptions(list)), "", t("asset"));
      var stSel = selectEl([["", t("all_statuses")], ["open", t("status_open")], ["reversed", t("status_reversed")], ["archived", t("a_archived")]], "", t("status"));
      var tbl;
      if (tab === "entries") {
        tbl = pagedTable({
          fetch: function (pg, fl) { return api.get("/api/admin/investments", Object.assign({ page: pg }, fl)); },
          cols: [
            { label: t("a_account"), render: userCell },
            { label: t("asset"), render: function (r) { return r.symbol; } },
            { label: t("quantity"), num: true, render: function (r) { return f.qty(r.quantity); } },
            { label: t("a_acquisition_price"), num: true, render: function (r) { return f.price(r.unit_price); } },
            { label: t("fees"), num: true, render: function (r) { return f.usd(r.fee_usd); } },
            { label: t("cost_basis"), num: true, render: function (r) { return f.usd(r.cost_basis_usd); } },
            { label: t("a_acquired"), render: function (r) { return f.dateTime(r.acquired_at); } },
            { label: t("a_funding"), render: function (r) { return t("a_funding_" + r.funding); } },
            { label: t("status"), render: function (r) { return OX.statusChip(r.status === "archived" ? "closed" : r.status); } },
            { label: "", cls: "actions", render: function (r) {
              if (!can("finance.investments")) return null;
              return h("div.row", { style: { justifyContent: "flex-end" } },
                btn(t("notes"), function () { formSheet(t("notes"), [{ name: "notes", label: t("notes"), type: "textarea", value: r.notes || "", span: true }], function (v) { return api.put("/api/admin/investments/" + r.id + "/notes", { notes: v.notes }).then(function () { OX.toast(t("saved")); }); }, { done: function () { tbl.reload(); } }); }, "btn-ghost"),
                r.status === "open" ? btn(t("a_archive"), function () { api.post("/api/admin/investments/" + r.id + "/archive").then(function () { OX.toast(t("saved")); tbl.reload(); }).catch(err); }, "btn-ghost") : null,
                r.status !== "reversed" ? btn(t("a_reverse"), function () { reverseAction("/api/admin/investments/" + r.id + "/reverse", t("a_reverse_entry"), t("a_reverse_entry_body"), function () { tbl.reload(); }); }, "btn-ghost") : null);
            } }
          ]
        });
      } else {
        tbl = pagedTable({
          fetch: function (pg, fl) { return api.get("/api/admin/investment-sales", Object.assign({ page: pg }, fl)); },
          cols: [
            { label: t("a_account"), render: userCell },
            { label: t("asset"), render: function (r) { return r.symbol; } },
            { label: t("quantity"), num: true, render: function (r) { return f.qty(r.quantity); } },
            { label: t("a_sale_price"), num: true, render: function (r) { return f.price(r.unit_price); } },
            { label: t("a_proceeds"), num: true, render: function (r) { return f.usd(r.proceeds_usd); } },
            { label: t("a_cost_removed"), num: true, render: function (r) { return f.usd(r.cost_basis_removed_usd); } },
            { label: t("realized_pnl"), num: true, render: function (r) { return pnlCell(r.realized_pnl_usd); } },
            { label: t("a_sold"), render: function (r) { return f.dateTime(r.sold_at); } },
            { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
            { label: "", cls: "actions", render: function (r) { return can("finance.investments") && r.status === "completed" ? btn(t("a_reverse"), function () { reverseAction("/api/admin/investment-sales/" + r.id + "/reverse", t("a_reverse_sale"), t("a_reverse_sale_body"), function () { tbl.reload(); }); }, "btn-ghost") : null; } }
          ]
        });
      }
      assetSel.onchange = function () { tbl.setFilter("asset_id", assetSel.value); };
      stSel.onchange = function () { tbl.setFilter("status", stSel.value); };
      c.appendChild(h("div.toolbar", assetSel, tab === "entries" ? stSel : null));
      c.appendChild(tbl);
      c.appendChild(h("p.subtle.xs", { style: { marginTop: "var(--s-3)" } }, t("a_avg_cost_rules")));
    });
  });

  /* ------------------------------------------------------------------ assets & market */
  OX.route("/assets", function () {
    var c = layout(t("a_assets"), { desc: t("a_assets_desc"), actions: [
      can("market.manage") ? btn(t("a_refresh_prices"), function () { api.post("/api/admin/market/refresh").then(function (x) { OX.toast(x.data.ok ? t("a_prices_updated", { n: x.data.updated }) : x.data.error, x.data.ok ? "ok" : "err"); ASSETS = null; OX.dispatchRoute(); }).catch(err); }, "btn-outline", "refresh-cw") : null,
      can("market.manage") ? btn(t("a_add_asset"), function () { assetForm(null); }, "btn-primary", "plus") : null] });
    var body = h("div.stack"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/assets"); }, function (r) {
      var st = r.data.status;
      ASSETS = r.data.assets;
      return [
        h("div", { class: "banner " + (st.healthy ? "ok" : "warn") }, icon(st.healthy ? "circle-check-big" : "triangle-alert", "icon-sm"), h("span", t("a_market_banner", { provider: st.provider_label, time: st.last_success_at ? f.dateTime(st.last_success_at) : t("a_never") }) + (st.last_error ? " — " + st.last_error : ""))),
        h("section.card.flush", table([
          { label: t("asset"), render: function (a) { return h("div.row", OX.coinLogo({ symbol: a.symbol, color: a.color, logo_url: a.logo_path ? OX.boot.base + "/" + a.logo_path : null }, "sm"), h("div", h("strong", a.symbol), h("div.subtle.xs", a.name))); } },
          { label: t("a_ids"), render: function (a) { return h("span.small", (a.coingecko_id || "—") + " / " + (a.binance_symbol || "—")); } },
          { label: t("current_price"), num: true, render: function (a) { return a.latest && a.latest.price ? f.price(a.latest.price, +a.price_decimals) : "—"; } },
          { label: t("a_price_age"), render: function (a) { return a.latest && a.latest.updated_at ? h("span", { class: "chip " + (a.latest.stale ? "warn" : "gain") }, f.ago(a.latest.updated_at)) : h("span.chip.loss", t("price_unavailable")); } },
          { label: t("a_source"), render: function (a) { return a.latest ? a.latest.source : "—"; } },
          { label: t("a_holders"), num: true, render: function (a) { return f.int(a.holders); } },
          { label: t("status"), render: function (a) { return +a.is_active ? h("span.chip.gain", t("status_active")) : h("span.chip", t("inactive")); } },
          { label: "", cls: "actions", render: function (a) { return can("market.manage") ? h("div.row", { style: { justifyContent: "flex-end" } }, btn(t("edit"), function () { assetForm(a); }, "btn-ghost"), logoUpload("/api/admin/assets/" + a.id + "/logo", function () { ASSETS = null; OX.dispatchRoute(); })) : null; } }
        ], r.data.assets)),
        h("p.subtle.xs", st.quote_note)
      ];
    });
    function assetForm(a) {
      formSheet(a ? t("a_edit_asset") : t("a_add_asset"), [
        { name: "symbol", label: t("a_symbol"), required: !a, value: a ? a.symbol : "", pattern: "[A-Z0-9]{2,15}", hint: a ? t("a_symbol_locked") : t("a_symbol_hint") },
        { name: "name", label: t("a_name"), required: true, value: a ? a.name : "" },
        { name: "coingecko_id", label: t("a_coingecko_id"), value: a ? a.coingecko_id || "" : "", hint: t("a_coingecko_hint") },
        { name: "binance_symbol", label: t("a_binance_pair"), value: a ? a.binance_symbol || "" : "", hint: t("a_binance_hint") },
        { name: "price_decimals", label: t("a_price_decimals"), type: "number", min: 0, max: 18, required: true, value: a ? a.price_decimals : 2 },
        { name: "quantity_decimals", label: t("a_quantity_decimals"), type: "number", min: 0, max: 18, required: true, value: a ? a.quantity_decimals : 8 },
        { name: "color", label: t("a_color"), type: "color", value: a ? a.color || "#1A56DB" : "#1A56DB" },
        { name: "sort_order", label: t("a_sort_order"), type: "number", value: a ? a.sort_order : 100 },
        { name: "is_active", label: t("status_active"), type: "checkbox", value: a ? +a.is_active : true, checkboxLabel: t("a_asset_active") }
      ], function (v) {
        if (a) delete v.symbol;
        return (a ? api.put("/api/admin/assets/" + a.id, v) : api.post("/api/admin/assets", v)).then(function () { OX.toast(t("saved")); ASSETS = null; });
      }, { done: function () { OX.dispatchRoute(); } });
      if (a) { var s = document.querySelector('dialog [name="symbol"]'); if (s) s.readOnly = true; }
    }
  });
  function logoUpload(path, done) {
    var input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", class: "sr-only" });
    var label = h("label", { class: "btn btn-ghost btn-sm" }, icon("image", "icon-sm"), t("a_logo"), input);
    input.onchange = function () {
      if (!input.files[0]) return;
      var fd = new FormData(); fd.append("logo", input.files[0]);
      api.post(path, fd).then(function () { OX.toast(t("a_logo_uploaded")); done(); }).catch(err);
    };
    return label;
  }

  /* ------------------------------------------------------------------ trading monitor */
  OX.route("/trading", function (p, q) {
    var c = layout(t("a_trading_monitor"), { desc: t("a_trading_desc") });
    var picker = userPicker(null);
    var out = h("div.stack");
    var go = btn(t("a_show"), function () { if (!picker.hidden.value) return OX.toast(t("a_select_account"), "err"); OX.go("/trading?user=" + picker.hidden.value); }, "btn-primary");
    c.appendChild(card(null, h("div.grid-2", picker.node, h("div.form-actions", go))));
    c.appendChild(out);
    if (q.user) {
      OX.load(out, function () { return api.get("/api/admin/trading-monitor", { user_id: q.user }); }, function (r) {
        var m = r.data, per = m.periods;
        return [
          h("div.metrics.m4", metric(t("trading_balance"), f.usd(m.trading_balance_usd)), metric(t("loss_balance"), f.usd(m.realized_losses_usd), null, Number(m.realized_losses_usd) ? "loss" : ""), metric(t("unrealized_open_trades"), f.signedUsd(m.unrealized_pnl_usd), t("open_trades_count", { n: m.open_trades }), f.cls(m.unrealized_pnl_usd)), metric(t("fees_paid"), f.usd(m.fees_total_usd), t("closed_trades_count", { n: m.closed_trades }))),
          card(t("realized_trading_pnl"), kv([["today", "todays_profit"], ["yesterday", "yesterdays_profit"], ["last_7_days", "last_7_days"], ["last_30_days", "last_30_days"], ["last_1_year", "last_1_year"], ["all_time", "all_time"]].map(function (x) { return [t(x[1]), pnlCell(per[x[0]])]; }))),
          h("p.subtle.xs", t("periods_note", { tz: m.timezone })),
          h("a", { class: "btn btn-outline btn-sm", href: "#/trades?user=" + q.user }, t("a_view_trades"))
        ];
      }, "tiles");
    }
  });

  /* ------------------------------------------------------------------ trades */
  function tradeForm(user) {
    assets().then(function (list) {
      var picker = userPicker(user);
      formSheet(t("a_record_trade"), [
        { type: "html", node: picker.node },
        { name: "asset_id", label: t("asset"), type: "select", required: true, options: assetOptions(list), placeholder: t("select") },
        { name: "direction", label: t("a_direction"), type: "select", required: true, options: [["long", t("dir_long")], ["short", t("dir_short")]] },
        { name: "trade_type", label: t("type"), type: "select", options: [["spot", t("type_spot")], ["futures", t("type_futures")], ["margin", t("type_margin")], ["other", t("type_other")]], required: true },
        { name: "quantity", label: t("quantity"), type: "decimal", required: true },
        { name: "entry_price", label: t("entry_price"), type: "decimal", required: true, suffix: "USD" },
        { name: "exit_price", label: t("exit_price"), type: "decimal", suffix: "USD", hint: t("a_exit_hint") },
        { name: "fee_usd", label: t("fees"), type: "decimal", value: "0", suffix: "USD", hint: t("a_fee_hint") },
        { name: "opened_at", label: t("opened_at"), type: "datetime-local", required: true, value: nowLocal() },
        { name: "closed_at", label: t("closed_at"), type: "datetime-local" },
        { name: "reference", label: t("reference"), maxlength: 100, hint: t("a_reference_hint") },
        { name: "notes", label: t("notes"), type: "textarea", span: true }
      ], function (v) {
        if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; }
        if (!v.exit_price) { delete v.exit_price; delete v.closed_at; }
        return api.post("/api/admin/trades", v).then(function (r) { OX.toast(r.data.duplicate ? t("a_duplicate_ignored") : t("a_trade_recorded")); });
      }, { wide: true, intro: t("a_trade_intro"), note: t("a_tz_hint", { tz: f.tzLabel() }), done: function () { OX.dispatchRoute(); } });
    });
  }
  OX.route("/trades", function (p, q) {
    var c = layout(t("a_trades"), { desc: t("a_trades_desc"), actions: [can("finance.trades") ? btn(t("a_record_trade"), function () { tradeForm(null); }, "btn-primary", "plus") : null] });
    var st = selectEl([["", t("all_statuses")], ["open", t("status_open")], ["closed", t("status_closed")], ["reversed", t("status_reversed")]], "", t("status"));
    var search = h("input", { type: "search", placeholder: t("a_search_reference"), "aria-label": t("search") });
    var from = h("input", { type: "date", "aria-label": t("from_date") }), to = h("input", { type: "date", "aria-label": t("to_date") });
    var tbl = pagedTable({
      filters: q.user ? { user_id: q.user } : {},
      fetch: function (pg, fl) { return api.get("/api/admin/trades", Object.assign({ page: pg }, fl)); },
      cols: [
        { label: t("a_account"), render: userCell },
        { label: t("asset"), render: function (r) { return r.symbol + " · " + t("dir_" + r.direction); } },
        { label: t("quantity"), num: true, render: function (r) { return f.qty(r.quantity); } },
        { label: t("entry_price"), num: true, render: function (r) { return f.price(r.entry_price); } },
        { label: t("exit_price"), num: true, render: function (r) { return r.exit_price ? f.price(r.exit_price) : "—"; } },
        { label: t("fees"), num: true, render: function (r) { return f.usd(r.fee_usd); } },
        { label: t("a_pnl"), num: true, render: function (r) { return r.status === "open" ? h("span", pnlCell(r.unrealized_pnl_usd), h("div.subtle.xs", t("unrealized"))) : pnlCell(r.realized_pnl_usd); } },
        { label: t("opened_at"), render: function (r) { return f.dateTime(r.opened_at); } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: "", cls: "actions", render: function (r) {
          if (!can("finance.trades")) return null;
          return h("div.row", { style: { justifyContent: "flex-end" } },
            r.status === "open" ? btn(t("a_close"), function () { closeTrade(r); }, "btn-ghost") : null,
            btn(t("notes"), function () { formSheet(t("notes"), [{ name: "notes", label: t("notes"), type: "textarea", value: r.notes || "", span: true }], function (v) { return api.put("/api/admin/trades/" + r.id + "/notes", { notes: v.notes }).then(function () { OX.toast(t("saved")); }); }, { done: function () { tbl.reload(); } }); }, "btn-ghost"),
            r.status !== "reversed" ? btn(t("a_reverse"), function () { reverseAction("/api/admin/trades/" + r.id + "/reverse", t("a_reverse_trade"), t("a_reverse_trade_body"), function () { tbl.reload(); }); }, "btn-ghost") : null);
        } }
      ]
    });
    function closeTrade(r) {
      formSheet(t("a_close_trade"), [
        { name: "exit_price", label: t("exit_price"), type: "decimal", required: true, suffix: "USD", value: r.current_price || "" },
        { name: "extra_fee_usd", label: t("a_closing_fee"), type: "decimal", value: "0", suffix: "USD" },
        { name: "closed_at", label: t("closed_at"), type: "datetime-local", required: true, value: nowLocal() }
      ], function (v) { return api.post("/api/admin/trades/" + r.id + "/close", v).then(function (x) { OX.toast(t("a_trade_closed", { pnl: f.signedUsd(x.data.realized_pnl_usd) })); }); }, { intro: r.symbol + " · " + f.qty(r.quantity) + " @ " + f.price(r.entry_price), done: function () { tbl.reload(); } });
    }
    st.onchange = function () { tbl.setFilter("status", st.value); };
    search.addEventListener("input", OX.debounce(function () { tbl.setFilter("q", search.value.trim()); }, 300));
    from.onchange = function () { tbl.setFilter("from", from.value); };
    to.onchange = function () { tbl.setFilter("to", to.value); };
    c.appendChild(h("div.toolbar", h("div.search", icon("search"), search), st, from, to));
    c.appendChild(tbl);
  });

  /* ------------------------------------------------------------------ ledger */
  function movementForm(user) {
    var picker = userPicker(user);
    formSheet(t("a_record_movement"), [
      { type: "html", node: picker.node },
      { name: "type", label: t("type"), type: "select", required: true, options: [["deposit", t("tx_deposit")], ["withdrawal", t("tx_withdrawal")], ["transfer", t("tx_transfer")], ["adjustment", t("tx_adjustment")]] },
      { name: "amount", label: t("amount_usd"), type: "decimal", required: true, suffix: "USD" },
      { name: "from", label: t("a_from_balance"), type: "select", options: [["cash", t("main_balance")], ["trading", t("trading_balance")]], hint: t("a_from_hint") },
      { name: "to", label: t("a_to_balance"), type: "select", options: [["cash", t("main_balance")], ["trading", t("trading_balance")]], hint: t("a_to_hint") },
      { name: "direction", label: t("a_adjustment_direction"), type: "select", options: [["credit", t("a_credit")], ["debit", t("a_debit")]], hint: t("a_adjustment_hint") },
      { name: "effective_at", label: t("a_effective_date"), type: "datetime-local", required: true, value: nowLocal() },
      { name: "reference", label: t("reference"), maxlength: 100 },
      { name: "notes", label: t("notes"), type: "textarea", span: true, hint: t("a_notes_required_adjust") }
    ], function (v) {
      if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; }
      if (v.type === "deposit") delete v.from;
      if (v.type === "withdrawal") delete v.to;
      if (v.type !== "adjustment") delete v.direction;
      return api.post("/api/admin/ledger/movements", v).then(function (r) { OX.toast(r.data.duplicate ? t("a_duplicate_ignored") : t("a_movement_recorded")); });
    }, { wide: true, intro: t("a_movement_intro"), done: function () { OX.dispatchRoute(); } });
  }
  OX.route("/ledger", function (p, q) {
    var c = layout(t("a_ledger"), { desc: t("a_ledger_desc"), actions: [
      can("finance.export") ? btn(t("export_csv"), function () { OX.download("/api/admin/ledger/export", tbl.filters(), "oryzenx-ledger.csv"); }, "btn-outline", "download") : null,
      can("finance.ledger") ? btn(t("a_record_movement"), function () { movementForm(null); }, "btn-primary", "plus") : null] });
    var types = ["", "deposit", "withdrawal", "transfer", "adjustment", "investment_buy", "investment_sale", "trade_close", "loan_disbursement", "loan_repayment", "loan_charge", "salary_payment", "profit_allocation", "reversal"];
    var type = selectEl(types.map(function (x) { return [x, x ? t("tx_" + x) : t("all_types")]; }), "", t("type"));
    var st = selectEl([["", t("all_statuses")], ["completed", t("status_completed")], ["reversed", t("status_reversed")], ["reversal", t("status_reversal")]], "", t("status"));
    var search = h("input", { type: "search", placeholder: t("a_search_ledger"), "aria-label": t("search") });
    var from = h("input", { type: "date", "aria-label": t("from_date") }), to = h("input", { type: "date", "aria-label": t("to_date") });
    var tbl = pagedTable({
      filters: q.user ? { user_id: q.user } : {},
      fetch: function (pg, fl) { return api.get("/api/admin/ledger", Object.assign({ page: pg }, fl)); },
      onRow: detail,
      cols: [
        { label: "#", render: function (r) { return h("span.num", r.id); } },
        { label: t("a_date"), render: function (r) { return f.dateTime(r.effective_at); } },
        { label: t("a_account"), render: function (r) { return r.user_id ? userCell(r) : t("a_platform"); } },
        { label: t("type"), render: function (r) { return t("tx_" + r.type); } },
        { label: t("asset"), render: function (r) { return r.asset_symbol; } },
        { label: t("amount_usd"), num: true, render: function (r) { return f.usd(r.amount_usd); } },
        { label: t("fees"), num: true, render: function (r) { return +r.fee_usd ? f.usd(r.fee_usd) : "—"; } },
        { label: t("realized_pnl"), num: true, render: function (r) { return pnlCell(r.realized_pnl_usd); } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: t("a_by"), render: function (r) { return r.created_by_name; } }
      ]
    });
    function detail(r) {
      var s = OX.sheet({ title: t("transaction_details") + " #" + r.id, wide: true, content: OX.skeleton("rows", 3) });
      api.get("/api/admin/ledger/" + r.id).then(function (x) {
        var tx = x.data;
        var movement = ["deposit", "withdrawal", "transfer", "adjustment"].indexOf(tx.type) !== -1;
        OX.clear(s.body).appendChild(h("div.stack",
          kv([[t("transaction_id"), tx.uuid], [t("type"), t("tx_" + tx.type)], [t("status"), OX.statusChip(tx.status)], [t("a_date"), f.dateTime(tx.effective_at) + " · " + f.tzLabel()],
            [t("asset"), tx.asset_symbol], [t("quantity"), tx.quantity ? f.qty(tx.quantity) : null], [t("unit_price"), tx.unit_price ? f.price(tx.unit_price) : null],
            [t("amount_usd"), f.usd(tx.amount_usd)], [t("fees"), f.usd(tx.fee_usd)], [t("realized_pnl"), tx.realized_pnl_usd !== null ? pnlCell(tx.realized_pnl_usd) : null],
            [t("reference"), tx.reference], [t("notes"), tx.notes], [t("a_idempotency_key"), tx.idempotency_key], [t("a_related"), tx.related_type ? tx.related_type + " #" + tx.related_id : null],
            [t("reverses_transaction"), tx.reversal_of_id ? "#" + tx.reversal_of_id : null], [t("reversed_by_transaction"), tx.reversed_by_id ? "#" + tx.reversed_by_id : null],
            [t("a_created_by"), tx.created_by_name], [t("a_last_editor"), tx.updated_by_name], [t("a_recorded_at"), f.dateTime(tx.created_at)]]),
          h("h3.section-title", t("a_ledger_lines")),
          table([{ label: t("a_ledger_account"), render: function (l) { return l.account; } }, { label: t("quantity"), num: true, render: function (l) { return l.quantity ? f.qty(l.quantity) : "—"; } }, { label: t("a_amount_signed"), num: true, render: function (l) { return h("span.num", (+l.amount_usd < 0 ? "−" : "+") + f.usd(Math.abs(+l.amount_usd)).replace("−", "")); } }], tx.lines),
          movement && tx.status === "completed" && can("finance.ledger") ? h("div.form-actions", btn(t("a_reverse"), function () { s.close(); reverseAction("/api/admin/ledger/" + tx.id + "/reverse", t("a_reverse_movement"), t("a_reverse_movement_body"), function () { tbl.reload(); }); }, "btn-danger")) : (tx.status === "completed" && !movement ? h("p.subtle.xs", t("a_reverse_in_module")) : null)
        ));
      }).catch(function (e) { OX.clear(s.body).appendChild(OX.errorState(e)); });
    }
    type.onchange = function () { tbl.setFilter("type", type.value); };
    st.onchange = function () { tbl.setFilter("status", st.value); };
    search.addEventListener("input", OX.debounce(function () { tbl.setFilter("q", search.value.trim()); }, 300));
    from.onchange = function () { tbl.setFilter("from", from.value); };
    to.onchange = function () { tbl.setFilter("to", to.value); };
    c.appendChild(h("div.toolbar", h("div.search", icon("search"), search), type, st, from, to));
    c.appendChild(tbl);
  });

  /* ------------------------------------------------------------------ loans */
  function loanForm(user) {
    assets().then(function (list) {
      var picker = userPicker(user);
      formSheet(t("a_record_loan"), [
        { type: "html", node: picker.node },
        { name: "denomination", label: t("loan_type"), type: "select", required: true, options: [["USD", t("usd_loan")], ["COIN", t("coin_loan")]] },
        { name: "credited_to", label: t("a_credited_to"), type: "select", required: true, options: [["external", t("a_credit_external")], ["cash", t("a_credit_cash")], ["holdings", t("a_credit_holdings")]], hint: t("a_credited_hint") },
        { name: "principal_usd", label: t("a_principal_usd"), type: "decimal", suffix: "USD", hint: t("a_usd_loans_only") },
        { name: "asset_id", label: t("asset"), type: "select", options: assetOptions(list), placeholder: t("a_coin_loans_only") },
        { name: "quantity", label: t("borrowed_quantity"), type: "decimal", hint: t("a_coin_loans_only") },
        { name: "origination_price", label: t("origination_price"), type: "decimal", suffix: "USD", hint: t("a_orig_price_hint") },
        { name: "loan_date", label: t("loan_date"), type: "datetime-local", required: true, value: nowLocal() },
        { name: "due_date", label: t("due_date"), type: "date" },
        { name: "interest_rate_pct", label: t("interest_rate"), type: "decimal", suffix: "%", hint: t("a_interest_hint") },
        { name: "reference", label: t("reference") },
        { name: "notes", label: t("notes"), type: "textarea", span: true }
      ], function (v) {
        if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; }
        if (v.denomination === "USD") { delete v.asset_id; delete v.quantity; delete v.origination_price; } else delete v.principal_usd;
        return api.post("/api/admin/loans", v).then(function (r) { OX.toast(r.data.duplicate ? t("a_duplicate_ignored") : t("a_loan_recorded")); });
      }, { wide: true, intro: t("a_loan_intro"), done: function () { OX.dispatchRoute(); } });
    });
  }
  OX.route("/loans", function () {
    var c = layout(t("a_loans"), { desc: t("a_loans_desc"), actions: [can("finance.loans") ? btn(t("a_record_loan"), function () { loanForm(null); }, "btn-primary", "plus") : null] });
    var st = selectEl([["", t("all_statuses")], ["active", t("status_active")], ["repaid", t("status_repaid")], ["reversed", t("status_reversed")]], "", t("status"));
    var tbl = pagedTable({
      fetch: function (pg, fl) { return api.get("/api/admin/loans", Object.assign({ page: pg }, fl)); },
      onRow: function (r) { OX.go("/loans/" + r.id); },
      cols: [
        { label: "#", render: function (r) { return r.id; } },
        { label: t("a_account"), render: userCell },
        { label: t("loan_type"), render: function (r) { return r.denomination === "COIN" ? r.symbol + " " + t("coin_loan") : t("usd_loan"); } },
        { label: t("original_principal"), num: true, render: function (r) { return r.denomination === "COIN" ? f.qty(r.principal_quantity) + " " + r.symbol : f.usd(r.principal_usd); } },
        { label: t("a_outstanding"), num: true, render: function (r) { return r.denomination === "COIN" ? f.qty(r.outstanding_quantity) + " " + r.symbol : f.usd(r.outstanding_usd); } },
        { label: t("current_liability"), num: true, render: function (r) { return h("span", f.usd(r.current_liability_usd), r.price_stale && r.denomination === "COIN" && r.status === "active" ? h("span.chip.warn", { style: { marginLeft: "6px" } }, t("stale")) : null); } },
        { label: t("loan_date"), render: function (r) { return f.date(r.loan_date); } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } }
      ]
    });
    st.onchange = function () { tbl.setFilter("status", st.value); };
    c.appendChild(h("div.toolbar", st));
    c.appendChild(tbl);
  });
  OX.route("/loans/:id", function (p) {
    var c = layout(t("loan_details"), { back: "/loans" });
    var body = h("div.stack"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/loans/" + p.id); }, function (r) {
      var l = r.data, coin = l.denomination === "COIN";
      var acts = can("finance.loans") && l.status === "active" ? h("div.page-actions",
        btn(t("a_record_repayment"), function () {
          formSheet(t("a_record_repayment"), coin ? [
            { name: "quantity", label: t("a_repaid_quantity"), type: "decimal", required: true, hint: t("a_outstanding") + ": " + f.qty(l.outstanding_quantity) + " " + l.symbol },
            { name: "price", label: t("a_settlement_price"), type: "decimal", suffix: "USD", hint: t("a_settlement_hint") },
            { name: "paid_from", label: t("a_paid_from"), type: "select", required: true, options: [["external", t("a_funding_external")], ["cash", t("a_funding_cash")]] },
            { name: "paid_at", label: t("a_paid_at"), type: "datetime-local", required: true, value: nowLocal() },
            { name: "notes", label: t("notes"), type: "textarea", span: true }
          ] : [
            { name: "amount_usd", label: t("amount_usd"), type: "decimal", required: true, suffix: "USD", hint: t("a_outstanding") + ": " + f.usd(l.outstanding_usd) },
            { name: "paid_from", label: t("a_paid_from"), type: "select", required: true, options: [["external", t("a_funding_external")], ["cash", t("a_funding_cash")]] },
            { name: "paid_at", label: t("a_paid_at"), type: "datetime-local", required: true, value: nowLocal() },
            { name: "notes", label: t("notes"), type: "textarea", span: true }
          ], function (v) { return api.post("/api/admin/loans/" + l.id + "/repayments", v).then(function () { OX.toast(t("a_repayment_recorded")); }); }, { done: function () { OX.dispatchRoute(); } });
        }, "btn-primary", "hand-coins"),
        btn(t("a_record_charge"), function () {
          formSheet(t("a_record_charge"), [
            { name: "charge_type", label: t("type"), type: "select", required: true, options: [["fee", t("charge_fee")], ["interest", t("charge_interest")]] },
            coin ? { name: "quantity", label: t("quantity"), type: "decimal", required: true, suffix: l.symbol } : { name: "amount_usd", label: t("amount_usd"), type: "decimal", required: true, suffix: "USD" },
            coin ? { name: "price", label: t("a_valuation_price"), type: "decimal", suffix: "USD", hint: t("a_charge_price_hint") } : null,
            { name: "charged_at", label: t("a_date"), type: "datetime-local", required: true, value: nowLocal() },
            { name: "notes", label: t("notes"), type: "textarea", span: true }
          ].filter(Boolean), function (v) { return api.post("/api/admin/loans/" + l.id + "/charges", v).then(function () { OX.toast(t("a_charge_recorded")); }); }, { intro: t("a_charge_intro"), done: function () { OX.dispatchRoute(); } });
        }, "btn-outline", "percent"),
        btn(t("a_reverse_loan"), function () { reverseAction("/api/admin/loans/" + l.id + "/reverse", t("a_reverse_loan"), t("a_reverse_loan_body"), function () { OX.dispatchRoute(); }); }, "btn-ghost", "undo-2")) : null;
      return [acts,
        h("div.metrics.m4", metric(t("current_liability"), f.usd(l.current_liability_usd), coin ? f.qty(l.outstanding_quantity) + " " + l.symbol + " × " + f.price(l.current_price) : null),
          metric(t("original_principal"), f.usd(l.principal_usd), coin ? f.qty(l.principal_quantity) + " " + l.symbol + " @ " + f.price(l.origination_price) : null),
          metric(t("a_book_value"), f.usd(l.book_value_usd), t("a_book_value_hint")), metric(t("repaid_total"), f.usd(l.repaid_usd), t("fees_interest") + " " + f.usd(l.charges_usd))),
        card(t("loan_summary"), kv([[t("a_account"), h("a", { href: "#/users/" + l.user_id }, l.user_name)], [t("status"), OX.statusChip(l.status)], [t("a_credited_to"), t("a_credit_" + l.credited_to)],
          [t("loan_date"), f.dateTime(l.loan_date)], [t("due_date"), l.due_date ? f.date(l.due_date) : null], [t("interest_rate"), l.interest_rate_pct ? f.pct(l.interest_rate_pct) : null], [t("reference"), l.reference], [t("notes"), l.notes]])),
        card(t("loan_history"), l.events.length ? table([
          { label: t("a_date"), render: function (e) { return f.dateTime(e.paid_at); } },
          { label: t("type"), render: function (e) { return e.kind === "charge" ? t("charge_" + e.charge_type) : t("repayment"); } },
          { label: t("quantity"), num: true, render: function (e) { return e.quantity ? f.qty(e.quantity) : "—"; } },
          { label: t("a_price"), num: true, render: function (e) { return e.price_used ? f.price(e.price_used) : "—"; } },
          { label: t("amount_usd"), num: true, render: function (e) { return f.usd(e.amount_usd); } },
          { label: t("realized_pnl"), num: true, render: function (e) { return +e.realized_pnl_usd ? pnlCell(e.realized_pnl_usd) : "—"; } },
          { label: t("status"), render: function (e) { return OX.statusChip(e.status); } },
          { label: "", cls: "actions", render: function (e) { return can("finance.loans") && e.status === "completed" ? btn(t("a_reverse"), function () { reverseAction("/api/admin/loan-events/" + e.id + "/reverse", t("a_reverse_event"), t("a_reverse_event_body"), function () { OX.dispatchRoute(); }); }, "btn-ghost") : null; } }
        ], l.events) : h("p.muted.small", t("no_loan_events"))),
        h("p.subtle.xs", t("a_loan_rules"))];
    }, "tiles");
  });

  /* ------------------------------------------------------------------ salary */
  OX.route("/salary", function (p, q) {
    var tab = q.tab === "schedules" ? "schedules" : "records";
    var c = layout(t("a_salary"), { desc: t("a_salary_desc"), actions: [
      can("salary.manage") ? btn(t("a_generate_period"), function () {
        formSheet(t("a_generate_period"), [{ name: "period", label: t("period"), type: "month", required: true, value: new Date().toISOString().slice(0, 7) }], function (v) { return api.post("/api/admin/salary/generate", v).then(function (r) { OX.toast(t("a_records_created", { n: r.data.created })); }); }, { intro: t("a_generate_intro"), done: function () { OX.dispatchRoute(); } });
      }, "btn-outline", "calendar") : null,
      can("salary.manage") ? btn(t("a_add_schedule"), function () { scheduleForm(null); }, "btn-primary", "plus") : null] });
    c.appendChild(h("div.tabs", { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": tab === "records" ? "true" : "false", onclick: function () { OX.go("/salary"); } }, t("monthly_history")),
      h("button", { type: "button", role: "tab", "aria-selected": tab === "schedules" ? "true" : "false", onclick: function () { OX.go("/salary?tab=schedules"); } }, t("a_schedules"))));
    var methodsP = api.get("/api/admin/payment-methods").then(function (r) { return r.data; });
    function scheduleForm(s) {
      methodsP.then(function (methods) {
        var picker = userPicker(s ? { id: s.user_id, full_name: s.user_name, email: s.user_email } : null);
        formSheet(s ? t("a_edit_schedule") : t("a_add_schedule"), [
          { type: "html", node: picker.node },
          { name: "amount", label: t("salary_amount"), type: "decimal", required: true, value: s ? s.amount : "" },
          { name: "currency", label: t("a_currency"), type: "select", required: true, options: [["USD", "USD"], ["BDT", "BDT"], ["USDT", "USDT"]], value: s ? s.currency : "USD" },
          { name: "pay_day", label: t("payment_day"), type: "number", min: 1, max: 28, required: true, value: s ? s.pay_day : 1, hint: t("a_pay_day_hint") },
          { name: "payment_method_id", label: t("payment_method"), type: "select", options: methods.filter(function (m) { return +m.is_enabled; }).map(function (m) { return [m.id, m.name]; }), placeholder: t("not_set"), value: s ? s.payment_method_id : "" },
          { name: "start_date", label: t("a_start_date"), type: "date", required: true, value: s ? s.start_date : new Date().toISOString().slice(0, 10) },
          { name: "end_date", label: t("a_end_date"), type: "date", value: s ? s.end_date || "" : "" },
          { name: "is_active", label: t("status_active"), type: "checkbox", value: s ? +s.is_active : true, checkboxLabel: t("a_schedule_active") },
          { name: "notes", label: t("notes"), type: "textarea", span: true, value: s ? s.notes || "" : "" }
        ], function (v) { if (!v.user_id) { OX.toast(t("a_select_account"), "err"); return false; } return api.post("/api/admin/salary/schedules", v).then(function () { OX.toast(t("saved")); }); }, { wide: true, done: function () { OX.dispatchRoute(); } });
      });
    }
    if (tab === "schedules") {
      var body = h("div"); c.appendChild(body);
      OX.load(body, function () { return api.get("/api/admin/salary/schedules"); }, function (r) {
        return r.data.length ? h("section.card.flush", table([
          { label: t("a_account"), render: userCell },
          { label: t("salary_amount"), num: true, render: function (s) { return f.num(s.amount, 2) + " " + s.currency; } },
          { label: t("payment_day"), num: true, render: function (s) { return f.int(s.pay_day); } },
          { label: t("payment_method"), render: function (s) { return s.payment_method_name; } },
          { label: t("a_start_date"), render: function (s) { return f.date(s.start_date); } },
          { label: t("status"), render: function (s) { return +s.is_active ? h("span.chip.gain", t("status_active")) : h("span.chip", t("inactive")); } },
          { label: "", cls: "actions", render: function (s) { return can("salary.manage") ? btn(t("edit"), function () { scheduleForm(s); }, "btn-ghost") : null; } }
        ], r.data)) : OX.stateView({ icon: "calendar", title: t("a_no_schedules"), body: "" });
      });
      return;
    }
    var st = selectEl([["", t("all_statuses")], ["pending", t("status_pending")], ["processed", t("status_processed")], ["paid", t("status_paid")], ["rejected", t("status_rejected")]], "", t("status"));
    var per = h("input", { type: "month", "aria-label": t("period") });
    var tbl = pagedTable({
      fetch: function (pg, fl) { return api.get("/api/admin/salary/records", Object.assign({ page: pg }, fl)); },
      cols: [
        { label: t("a_account"), render: userCell },
        { label: t("period"), render: function (r) { return r.period; } },
        { label: t("expected_amount"), num: true, render: function (r) { return f.num(r.expected_amount, 2) + " " + r.currency; } },
        { label: t("actual_amount"), num: true, render: function (r) { return r.actual_amount ? f.num(r.actual_amount, 2) + " " + r.currency : "—"; } },
        { label: t("due_date"), render: function (r) { return f.date(r.due_date); } },
        { label: t("payment_date"), render: function (r) { return r.payment_date ? f.date(r.payment_date) : "—"; } },
        { label: t("payment_method"), render: function (r) { return r.payment_method_name; } },
        { label: t("reference"), render: function (r) { return r.reference; } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: "", cls: "actions", render: function (r) { return can("salary.manage") ? btn(t("a_update"), function () { updateRecord(r); }, "btn-ghost") : null; } }
      ]
    });
    function updateRecord(r) {
      methodsP.then(function (methods) {
        formSheet(t("a_update_salary", { period: r.period }), [
          { name: "status", label: t("status"), type: "select", required: true, value: r.status, options: [["pending", t("status_pending")], ["processed", t("status_processed")], ["paid", t("status_paid")], ["rejected", t("status_rejected")]] },
          { name: "actual_amount", label: t("actual_amount"), type: "decimal", value: r.actual_amount || r.expected_amount, suffix: r.currency },
          r.currency !== "USD" ? { name: "usd_rate", label: t("a_usd_rate", { cur: r.currency }), type: "decimal", value: r.usd_rate || "", hint: t("a_usd_rate_hint") } : null,
          { name: "payment_date", label: t("payment_date"), type: "date", value: r.payment_date || new Date().toISOString().slice(0, 10) },
          { name: "payment_method_id", label: t("payment_method"), type: "select", value: r.payment_method_id || "", placeholder: t("not_set"), options: methods.map(function (m) { return [m.id, m.name]; }) },
          { name: "reference", label: t("reference"), value: r.reference || "" },
          { name: "notes", label: t("notes"), type: "textarea", span: true, value: r.notes || "" }
        ].filter(Boolean), function (v) { return api.put("/api/admin/salary/records/" + r.id, v).then(function () { OX.toast(t("saved")); }); }, { wide: true, intro: t("a_salary_paid_intro"), done: function () { tbl.reload(); } });
      });
    }
    st.onchange = function () { tbl.setFilter("status", st.value); };
    per.onchange = function () { tbl.setFilter("period", per.value); };
    c.appendChild(h("div.toolbar", st, per, can("finance.export") ? btn(t("export_csv"), function () { OX.download("/api/admin/salary/records/export", tbl.filters(), "oryzenx-salary.csv"); }, "btn-outline", "download") : null));
    c.appendChild(tbl);
  });

  OX.route("/payment-methods", function () {
    var c = layout(t("a_payment_methods"), { desc: t("a_payment_methods_desc") });
    var body = h("div"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/payment-methods"); }, function (r) {
      return h("div.grid-cards", r.data.map(function (m) {
        var toggle = h("input", { type: "checkbox", role: "switch", "aria-label": t("a_enabled") + " " + m.name, disabled: !can("payment_methods.manage") });
        toggle.checked = !!+m.is_enabled;
        toggle.onchange = function () { api.put("/api/admin/payment-methods/" + m.id, { is_enabled: toggle.checked }).then(function () { OX.toast(t("saved")); }).catch(function (e) { toggle.checked = !toggle.checked; err(e); }); };
        return card(null, h("div.stack",
          h("div.row", m.logo_url ? h("span.coin-logo", { style: { background: "#fff", border: "1px solid var(--border)" } }, h("img", { src: m.logo_url, alt: "" })) : h("span.tx-icon", icon("wallet")), h("div.grow", h("strong", m.name), h("div.subtle.xs", m.code + " · " + t("a_pm_type_" + m.type))), h("label.switch", toggle, h("span.track"))),
          h("p.subtle.small", m.instructions || ""),
          h("p.xs.muted", t("a_fields") + ": " + m.fields.map(function (x) { return x.label + (x.required ? "*" : ""); }).join(", ")),
          can("payment_methods.manage") ? h("div.row", btn(t("edit"), function () {
            formSheet(t("edit") + " · " + m.name, [
              { name: "name", label: t("a_name"), required: true, value: m.name },
              { name: "sort_order", label: t("a_sort_order"), type: "number", value: m.sort_order },
              { name: "instructions", label: t("a_instructions"), type: "textarea", span: true, value: m.instructions || "" }
            ], function (v) { return api.put("/api/admin/payment-methods/" + m.id, v).then(function () { OX.toast(t("saved")); }); }, { done: function () { OX.dispatchRoute(); } });
          }, "btn-ghost"), logoUpload("/api/admin/payment-methods/" + m.id + "/logo", function () { OX.dispatchRoute(); })) : null,
          h("p.subtle.xs", t("a_logo_rules"))));
      }));
    });
  });

  /* ------------------------------------------------------------------ allocation */
  OX.route("/allocation", function () {
    var c = layout(t("a_allocation"), { desc: t("a_allocation_desc") });
    var rulesBox = h("div"), prevBox = h("div"), histBox = h("div"), recBox = h("div");
    c.appendChild(h("div.stack", card(t("a_allocation_rules"), rulesBox), card(t("a_allocate_period"), prevBox), card(t("a_allocation_history"), histBox), card(t("a_reconciliation"), recBox, btn(t("a_run_check"), function () { reconcile(recBox, "/api/admin/reconciliation"); }, "btn-outline", "scale"))));
    OX.load(rulesBox, function () { return api.get("/api/admin/allocation/rules"); }, function (r) {
      var rows = r.data.rules.map(function (rule) {
        var pct = h("input", { class: "input", type: "text", inputmode: "decimal", value: (+rule.percent).toString(), "aria-label": rule.label + " %", style: { width: "110px" }, disabled: !can("allocation.configure") });
        var label = h("input", { class: "input", type: "text", value: rule.label, "aria-label": t("a_name"), disabled: !can("allocation.configure") });
        var active = h("input", { type: "checkbox", "aria-label": t("status_active"), disabled: !can("allocation.configure") }); active.checked = !!+rule.is_active;
        return { rule: rule, pct: pct, label: label, active: active, node: h("div.row.wrap", { style: { padding: "8px 0", borderTop: "1px solid var(--border)" } }, h("span.chip", { style: { minWidth: "110px" } }, t("a_cat_" + rule.category)), h("div.grow", label), h("div.row", pct, "%"), h("label.check", active, t("status_active"))) };
      });
      var total = h("strong.num");
      var update = function () { var s = rows.reduce(function (a, x) { return a + (x.active.checked ? (+x.pct.value || 0) : 0); }, 0); total.textContent = f.pct(s); total.className = "num " + (s > 100 ? "loss" : ""); };
      rows.forEach(function (x) { x.pct.oninput = update; x.active.onchange = update; });
      update();
      var bal = r.data.balances;
      return h("div.stack-sm", rows.map(function (x) { return x.node; }), h("div.row-between", h("span.muted.small", t("a_total_active")), total),
        can("allocation.configure") ? h("div.form-actions", btn(t("a_save_rules"), function () {
          api.put("/api/admin/allocation/rules", { rules: rows.map(function (x) { return { category: x.rule.category, label: x.label.value, percent: x.pct.value.trim() || "0", is_active: x.active.checked }; }) }).then(function () { OX.toast(t("saved")); }).catch(err);
        }, "btn-primary")) : null,
        h("p.subtle.xs", t("a_allocation_rules_note")),
        kv([["retained", "salary", "reinvestment", "fees"].map(function () { return null; })[0], [t("a_cat_retained"), f.usd(-bal.alloc_retained)], [t("a_cat_salary"), f.usd(-bal.alloc_salary)], [t("a_cat_reinvestment"), f.usd(-bal.alloc_reinvestment)], [t("a_cat_fees"), f.usd(-bal.alloc_fees)]]));
    });
    // preview & run
    var start = h("input", { class: "input", type: "date", "aria-label": t("a_start_date") }), end = h("input", { class: "input", type: "date", "aria-label": t("a_end_date") });
    var d = new Date(); var firstPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); var lastPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    start.value = firstPrev.toISOString().slice(0, 10); end.value = lastPrev.toISOString().slice(0, 10);
    var picker = userPicker(null);
    var result = h("div");
    prevBox.appendChild(h("div.stack", h("p.subtle.small", t("a_allocate_intro")), h("div.grid-2", h("div.field", h("label", t("a_start_date")), start), h("div.field", h("label", t("a_end_date")), end), picker.node), h("p.subtle.xs", t("a_scope_hint")),
      h("div.form-actions", btn(t("a_preview"), preview, "btn-outline", "eye")), result));
    function preview() {
      OX.load(result, function () { return api.get("/api/admin/allocation/preview", { period_start: start.value, period_end: end.value, user_id: picker.hidden.value }); }, function (r) {
        var p = r.data;
        return h("div.stack-sm",
          p.already_allocated ? h("div.banner.warn", icon("triangle-alert", "icon-sm"), h("span", t("a_already_allocated", { from: p.conflict.period_start, to: p.conflict.period_end }))) : null,
          kv([[t("a_realized_in_period"), pnlCell(p.realized_profit_usd)], [t("a_eligible"), f.usd(p.eligible_usd)]].concat(p.lines.map(function (l) { return [l.label + " (" + f.pct(l.percent) + ")", f.usd(l.amount_usd)]; })).concat([[t("a_unallocated"), f.usd(p.unallocated_usd)]])),
          h("p.subtle.xs", p.explanation),
          can("allocation.run") && !p.already_allocated && +p.allocated_usd > 0 ? h("div.form-actions", btn(t("a_record_allocation"), function () {
            OX.confirm({ title: t("a_record_allocation"), message: t("a_record_allocation_body", { amount: f.usd(p.allocated_usd) }), confirmText: t("a_record_allocation") }).then(function (ok) {
              if (ok) api.post("/api/admin/allocation/run", { period_start: start.value, period_end: end.value, user_id: picker.hidden.value }).then(function () { OX.toast(t("a_allocation_recorded")); loadHist(); preview(); }).catch(err);
            });
          }, "btn-primary")) : null);
      });
    }
    function loadHist() {
      OX.clear(histBox).appendChild(pagedTable({
        fetch: function (pg) { return api.get("/api/admin/allocation/history", { page: pg }); },
        empty: { icon: "layers", title: t("a_no_allocations"), body: "" },
        cols: [
          { label: t("period"), render: function (a) { return a.period_start + " → " + a.period_end; } },
          { label: t("a_scope"), render: function (a) { return a.user_name || t("a_platform"); } },
          { label: t("a_realized_in_period"), num: true, render: function (a) { return pnlCell(a.realized_profit_usd); } },
          { label: t("a_allocated"), num: true, render: function (a) { return f.usd(a.allocated_usd); } },
          { label: t("a_lines"), render: function (a) { return a.lines.map(function (l) { return t("a_cat_" + l.category) + " " + f.usd(l.amount_usd); }).join(" · "); } },
          { label: t("status"), render: function (a) { return OX.statusChip(a.status); } },
          { label: "", cls: "actions", render: function (a) { return can("allocation.run") && a.status === "completed" ? btn(t("a_reverse"), function () { reverseAction("/api/admin/allocation/" + a.id + "/reverse", t("a_reverse_allocation"), t("a_reverse_allocation_body"), loadHist); }, "btn-ghost") : null; } }
        ]
      }));
    }
    loadHist();
  });

  /* ------------------------------------------------------------------ email & push */
  OX.route("/email", function () {
    var c = layout(t("a_email"), { desc: t("a_email_desc"), actions: [
      btn(t("a_process_queue"), function () { api.post("/api/admin/email-queue/process").then(function (r) { var s = r.data; OX.toast(t("a_queue_result", { sent: s.sent, retry: s.retried, failed: s.failed, waiting: s.skipped })); tbl.reload(); }).catch(err); }, "btn-outline", "refresh-cw"),
      btn(t("a_send_test"), function () {
        formSheet(t("a_send_test"), [{ name: "to", label: t("a_recipient"), type: "email", required: true, value: S.user.email, span: true }], function (v) {
          return api.post("/api/admin/email/test", { to: v.to }).then(function (r) { OX.sheet({ title: t("a_test_result"), content: h("div", { class: "banner " + (r.data.ok ? "ok" : "err") }, h("span", r.data.message)) }); });
        }, { grid: false, submitText: t("a_send_test") });
      }, "btn-primary", "send")] });
    var stBox = h("div"); c.appendChild(stBox);
    var st = selectEl([["", t("all_statuses")], ["queued", t("status_queued")], ["sent", t("status_sent")], ["failed", t("status_failed")], ["cancelled", t("status_cancelled")]], "", t("status"));
    var tbl = pagedTable({
      fetch: function (pg, fl) { return api.get("/api/admin/email-queue", Object.assign({ page: pg }, fl)).then(function (r) {
        var s = r.meta.stats;
        OX.clear(stBox).appendChild(h("div.stack", r.meta.configured ? null : h("div.banner.warn", icon("triangle-alert", "icon-sm"), h("span", t("a_smtp_missing_banner") + " ", h("a", { href: "#/smtp" }, t("a_configure_smtp")))),
          h("div.metrics.m4", metric(t("status_queued"), f.int(s.queued)), metric(t("a_sent_accepted"), f.int(s.sent), s.last_sent_at ? f.ago(s.last_sent_at) : null), metric(t("status_failed"), f.int(s.failed), null, s.failed ? "loss" : ""), metric(t("status_cancelled"), f.int(s.cancelled))),
          h("p.subtle.xs", t("a_email_status_note")), h("div", { style: { height: "8px" } })));
        return r;
      }); },
      cols: [
        { label: t("a_recipient"), render: function (m) { return m.to_email; } },
        { label: t("subject"), render: function (m) { return h("span.small", m.subject); } },
        { label: t("a_template"), render: function (m) { return m.template; } },
        { label: t("status"), render: function (m) { return OX.statusChip(m.status); } },
        { label: t("a_attempts"), num: true, render: function (m) { return m.attempts + "/" + m.max_attempts; } },
        { label: t("a_last_error"), render: function (m) { return m.last_error ? h("span.xs.loss", m.last_error) : "—"; } },
        { label: t("a_date"), render: function (m) { return f.dateTime(m.sent_at || m.created_at); } },
        { label: "", cls: "actions", render: function (m) {
          return h("div.row", { style: { justifyContent: "flex-end" } },
            btn(t("a_log"), function () { api.get("/api/admin/email-queue/" + m.id + "/logs").then(function (r) { OX.sheet({ title: t("a_delivery_log"), content: table([{ label: t("a_time"), render: function (l) { return f.dateTime(l.created_at); } }, { label: t("status"), render: function (l) { return l.status; } }, { label: t("a_detail"), render: function (l) { return h("span.xs", l.detail); } }], r.data) }); }); }, "btn-ghost"),
            m.status === "failed" ? btn(t("retry"), function () { api.post("/api/admin/email-queue/" + m.id + "/retry").then(function () { OX.toast(t("a_requeued")); tbl.reload(); }); }, "btn-ghost") : null,
            m.status === "queued" ? btn(t("cancel"), function () { api.post("/api/admin/email-queue/" + m.id + "/cancel").then(function () { tbl.reload(); }); }, "btn-ghost") : null);
        } }
      ]
    });
    st.onchange = function () { tbl.setFilter("status", st.value); };
    c.appendChild(h("div.toolbar", st));
    c.appendChild(tbl);
  });

  OX.route("/push", function () {
    var c = layout(t("a_push"), { desc: t("a_push_desc"), actions: [btn(t("a_send_test_push"), function () {
      api.post("/api/admin/push/test", {}).then(function (r) { OX.toast(r.data.message, r.data.sent ? "ok" : "err"); tbl.reload(); }).catch(err);
    }, "btn-primary", "send")] });
    var head = h("div"); c.appendChild(head);
    var tbl = pagedTable({
      fetch: function (pg) { return api.get("/api/admin/push-logs", { page: pg }).then(function (r) {
        OX.clear(head).appendChild(h("div.stack", { style: { marginBottom: "var(--s-4)" } }, h("div", { class: "banner " + (r.meta.configured ? "ok" : "warn") }, icon(r.meta.configured ? "circle-check-big" : "triangle-alert", "icon-sm"), h("span", r.meta.configured ? t("a_fcm_active") : t("a_fcm_inactive") + " ", r.meta.configured ? null : h("a", { href: "#/firebase" }, t("a_configure_firebase")))),
          h("div.metrics", metric(t("a_registered_devices"), f.int(r.meta.devices)), metric(t("a_log_entries"), f.int(r.meta.total)))));
        return r;
      }); },
      empty: { icon: "smartphone", title: t("a_no_push_logs"), body: "" },
      cols: [
        { label: t("a_time"), render: function (l) { return f.dateTime(l.created_at); } },
        { label: t("a_account"), render: function (l) { return l.email; } },
        { label: t("a_title"), render: function (l) { return l.title; } },
        { label: t("status"), render: function (l) { return h("span", { class: "chip " + (l.status === "sent" ? "gain" : l.status === "skipped" ? "warn" : "loss") }, l.status); } },
        { label: t("a_detail"), render: function (l) { return h("span.xs", l.detail || ""); } }
      ]
    });
    c.appendChild(tbl);
  });

  /* ------------------------------------------------------------------ support */
  OX.route("/support", function () {
    var c = layout(t("a_support"), { desc: t("a_support_desc") });
    var st = selectEl([["", t("all_statuses")], ["new", t("status_new")], ["open", t("status_open")], ["resolved", t("status_resolved")], ["spam", t("status_spam")]], "", t("status"));
    var q = h("input", { type: "search", placeholder: t("search"), "aria-label": t("search") });
    var tbl = pagedTable({
      fetch: function (pg, fl) { return api.get("/api/admin/support", Object.assign({ page: pg }, fl)); },
      onRow: open,
      empty: { icon: "inbox", title: t("a_no_inquiries"), body: "" },
      cols: [
        { label: "#", render: function (r) { return r.id; } },
        { label: t("a_from"), render: function (r) { return h("div", h("strong", r.name), h("div.subtle.xs", r.email)); } },
        { label: t("subject"), render: function (r) { return r.subject; } },
        { label: t("a_source"), render: function (r) { return r.source + " · " + r.locale; } },
        { label: t("status"), render: function (r) { return OX.statusChip(r.status); } },
        { label: t("a_date"), render: function (r) { return f.dateTime(r.created_at); } }
      ]
    });
    function open(r) {
      var stSel = selectEl([["new", t("status_new")], ["open", t("status_open")], ["resolved", t("status_resolved")], ["spam", t("status_spam")]], r.status, t("status"));
      var note = h("textarea", { class: "input", rows: 3, "aria-label": t("a_internal_note") }); note.value = r.admin_note || "";
      var s = OX.sheet({ title: "#" + r.id + " · " + r.subject, wide: true, content: [
        kv([[t("a_from"), r.name + " <" + r.email + ">"], [t("a_date"), f.dateTime(r.created_at)], [t("a_source"), r.source]]),
        h("p", { style: { whiteSpace: "pre-wrap" } }, r.message),
        h("a", { class: "btn btn-outline btn-sm", href: "mailto:" + r.email + "?subject=" + encodeURIComponent("Re: " + r.subject) }, icon("mail", "icon-sm"), t("a_reply_email")),
        can("support.manage") ? h("div.field", h("label", t("status")), stSel) : null,
        can("support.manage") ? h("div.field", h("label", t("a_internal_note")), note) : null
      ], actions: can("support.manage") ? [btn(t("save"), function () { api.put("/api/admin/support/" + r.id, { status: stSel.value, admin_note: note.value }).then(function () { OX.toast(t("saved")); s.close(); tbl.reload(); }).catch(err); }, "btn-primary")] : [] });
    }
    st.onchange = function () { tbl.setFilter("status", st.value); };
    q.addEventListener("input", OX.debounce(function () { tbl.setFilter("q", q.value.trim()); }, 300));
    c.appendChild(h("div.toolbar", h("div.search", icon("search"), q), st));
    c.appendChild(tbl);
  });

  /* ------------------------------------------------------------------ content & translations */
  OX.route("/content", function (p, q) {
    var tab = q.tab === "translations" ? "translations" : "landing";
    var c = layout(t("a_content"), { desc: t("a_content_desc") });
    c.appendChild(h("div.tabs", { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": tab === "landing" ? "true" : "false", onclick: function () { OX.go("/content"); } }, t("a_landing_page")),
      h("button", { type: "button", role: "tab", "aria-selected": tab === "translations" ? "true" : "false", onclick: function () { OX.go("/content?tab=translations"); } }, t("a_app_translations"))));
    var body = h("div"); c.appendChild(body);
    var search = h("input", { type: "search", placeholder: t("a_search_keys"), "aria-label": t("search") });
    function editor(rows, save) {
      var filter = search.value.trim().toLowerCase();
      return h("section.card.flush", table([
        { label: t("a_key"), render: function (r) { return h("code", r.key); } },
        { label: "English", render: function (r) { return field(r, "en", r.default_en); } },
        { label: "বাংলা", render: function (r) { return field(r, "bn", r.default_bn); } }
      ], rows.filter(function (r) { return !filter || (r.key + r.default_en + r.default_bn + (r.en || "") + (r.bn || "")).toLowerCase().indexOf(filter) !== -1; }).slice(0, 200)));
      function field(r, loc, def) {
        var ta = h("textarea", { class: "input", rows: 2, lang: loc, "aria-label": r.key + " " + loc, style: { minWidth: "220px", minHeight: "64px" } });
        ta.value = r[loc] !== null && r[loc] !== undefined ? r[loc] : "";
        ta.placeholder = def;
        ta.addEventListener("change", function () { save([{ locale: loc, key: r.key, value: ta.value }]).then(function () { OX.toast(t("saved")); r[loc] = ta.value; }).catch(err); });
        return h("div.stack-sm", ta, r[loc] ? h("span.xs.subtle", t("a_overridden")) : h("span.xs.subtle", t("a_default_text")));
      }
    }
    var data = null;
    var path = tab === "landing" ? "/api/admin/content/landing" : "/api/admin/content/translations";
    var save = function (items) { return api.put(path, { items: items }); };
    c.insertBefore(h("div.toolbar", h("div.search", icon("search"), search), h("span.subtle.xs", t("a_content_hint"))), body);
    OX.load(body, function () { return api.get(path); }, function (r) { data = r.data; return editor(data, save); });
    search.addEventListener("input", OX.debounce(function () { if (data) { OX.clear(body).appendChild(editor(data, save)); } }, 250));
  });

  /* ------------------------------------------------------------------ settings pages */
  function settingsPage(title, desc, keys, scope, fieldsFn, extra) {
    var c = layout(title, { desc: desc });
    var body = h("div.stack"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/settings"); }, function (r) {
      var vals = r.data.values;
      var editable = can(scope === "integrations" ? "settings.integrations" : "settings.manage");
      var form = OX.form(fieldsFn(vals, r.data), { grid: true, submitText: t("save_changes"), block: false, onSubmit: function (v) {
        var out = {};
        keys.forEach(function (k) { if (v[k] !== undefined) out[k] = typeof v[k] === "boolean" ? (v[k] ? "1" : "0") : v[k]; });
        return api.put("/api/admin/settings/" + scope, { values: out }).then(function () { OX.toast(t("saved")); OX.dispatchRoute(); });
      } });
      if (!editable) { form.querySelectorAll("input,select,textarea,button").forEach(function (x) { x.disabled = true; }); }
      return [!editable ? h("div.banner.info", icon("lock", "icon-sm"), h("span", t("a_read_only"))) : null, card(null, form), extra ? extra(vals) : null];
    });
  }
  function secretField(name, label, vals, hint) {
    var cfg = vals[name] && vals[name].configured;
    return { name: name, label: label, type: name === "fcm_service_account" ? "textarea" : "password", rows: 6, value: "", span: true, autocomplete: "new-password",
      hint: (cfg ? t("a_secret_set") : t("a_secret_not_set")) + (hint ? " " + hint : "") };
  }
  var yes = function (v) { return v === "1"; };
  OX.route("/settings", function () {
    var keys = ["site_name", "support_email", "support_phone", "support_hours", "business_timezone", "registration_open", "require_identity_verification", "play_store_url", "apk_download_url", "android_package", "android_sha256", "reminder_enabled", "reminder_interval_days", "reminder_subject_en", "reminder_subject_bn", "reminder_body_en", "reminder_body_bn"];
    settingsPage(t("a_general"), t("a_general_desc"), keys, "general", function (v, all) { return [
      { name: "site_name", label: t("a_site_name"), required: true, value: v.site_name },
      { name: "business_timezone", label: t("a_business_timezone"), type: "select", required: true, value: v.business_timezone, options: all.timezones.map(function (z) { return [z, z]; }), hint: t("a_timezone_hint") },
      { name: "support_email", label: t("a_support_email"), type: "email", value: v.support_email, hint: t("a_support_email_hint") },
      { name: "support_phone", label: t("a_support_phone"), value: v.support_phone },
      { name: "support_hours", label: t("a_support_hours"), value: v.support_hours, span: true },
      { name: "registration_open", label: t("a_registration"), type: "checkbox", value: yes(v.registration_open), checkboxLabel: t("a_registration_open") },
      { name: "require_identity_verification", label: t("a_identity"), type: "checkbox", value: yes(v.require_identity_verification), checkboxLabel: t("a_require_identity") },
      { name: "play_store_url", label: t("a_play_store_url"), type: "url", value: v.play_store_url },
      { name: "apk_download_url", label: t("a_apk_url"), type: "url", value: v.apk_download_url },
      { name: "android_package", label: t("a_android_package"), value: v.android_package },
      { name: "android_sha256", label: t("a_android_sha256"), value: v.android_sha256 || "", hint: t("a_android_sha256_hint") },
      { type: "html", node: h("h3.section-title.span-2", t("a_reminders")) },
      { name: "reminder_enabled", label: t("a_reminders"), type: "checkbox", value: yes(v.reminder_enabled), checkboxLabel: t("a_reminder_enabled") },
      { name: "reminder_interval_days", label: t("a_reminder_interval"), type: "number", min: 1, max: 90, value: v.reminder_interval_days },
      { name: "reminder_subject_en", label: t("a_reminder_subject") + " (EN)", value: v.reminder_subject_en },
      { name: "reminder_subject_bn", label: t("a_reminder_subject") + " (বাংলা)", value: v.reminder_subject_bn },
      { name: "reminder_body_en", label: t("a_reminder_body") + " (EN)", type: "textarea", value: v.reminder_body_en },
      { name: "reminder_body_bn", label: t("a_reminder_body") + " (বাংলা)", type: "textarea", value: v.reminder_body_bn }
    ]; });
  });
  OX.route("/branding", function () {
    settingsPage(t("a_branding"), t("a_branding_desc"), ["site_name", "brand_primary"], "general", function (v) { return [
      { name: "site_name", label: t("a_site_name"), required: true, value: v.site_name },
      { name: "brand_primary", label: t("a_brand_color"), type: "color", value: v.brand_primary || "#1A56DB", hint: t("a_brand_hint") }
    ]; }, function () { return card(t("a_preview"), h("div.row", OX.logo(), h("button", { class: "btn btn-primary btn-sm", type: "button" }, t("a_sample_button")))); });
  });
  OX.route("/languages", function () {
    settingsPage(t("a_languages"), t("a_languages_desc"), ["default_locale"], "general", function (v) { return [
      { name: "default_locale", label: t("a_default_language"), type: "select", required: true, value: v.default_locale || "en", options: [["en", "English"], ["bn", "বাংলা"]], hint: t("a_default_language_hint") },
      { type: "html", node: h("div.span-2", h("p.small.muted", t("a_languages_note") + " "), h("a", { href: "#/content?tab=translations" }, t("a_app_translations")), " · ", h("a", { href: "#/content" }, t("a_landing_page"))) }
    ]; });
  });
  OX.route("/smtp", function () {
    var keys = ["smtp_enabled", "smtp_host", "smtp_port", "smtp_encryption", "smtp_username", "smtp_password", "smtp_from_email", "smtp_from_name", "smtp_reply_to", "smtp_timeout"];
    settingsPage(t("a_smtp"), t("a_smtp_desc"), keys, "integrations", function (v) { return [
      { name: "smtp_enabled", label: t("status"), type: "checkbox", value: yes(v.smtp_enabled), checkboxLabel: t("a_smtp_enabled"), span: true },
      { name: "smtp_host", label: t("a_smtp_host"), value: v.smtp_host, placeholder: "smtp.example.com" },
      { name: "smtp_port", label: t("a_smtp_port"), type: "number", value: v.smtp_port || "587" },
      { name: "smtp_encryption", label: t("a_encryption"), type: "select", value: v.smtp_encryption || "tls", options: [["tls", "TLS / STARTTLS"], ["ssl", "SSL"], ["none", t("a_none")]] },
      { name: "smtp_timeout", label: t("a_timeout_seconds"), type: "number", min: 5, max: 120, value: v.smtp_timeout || "15" },
      { name: "smtp_username", label: t("a_smtp_username"), value: v.smtp_username, autocomplete: "off" },
      secretField("smtp_password", t("a_smtp_password"), v, t("a_secret_keep_hint")),
      { name: "smtp_from_email", label: t("a_sender_email"), type: "email", value: v.smtp_from_email },
      { name: "smtp_from_name", label: t("a_sender_name"), value: v.smtp_from_name },
      { name: "smtp_reply_to", label: t("a_reply_to"), type: "email", value: v.smtp_reply_to }
    ]; }, function () { return h("div.row", h("a", { class: "btn btn-outline btn-sm", href: "#/email" }, icon("send", "icon-sm"), t("a_send_test")), h("span.subtle.xs", t("a_smtp_secret_note"))); });
  });
  OX.route("/market-api", function () {
    var keys = ["market_provider", "market_api_key", "market_api_plan", "market_poll_seconds", "market_stale_seconds"];
    api.get("/api/admin/assets").then(function (r) {
      var providers = r.data.providers;
      settingsPage(t("a_market_api"), t("a_market_api_desc"), keys, "integrations", function (v) { return [
        { name: "market_provider", label: t("a_provider"), type: "select", required: true, value: v.market_provider, options: providers.map(function (p) { return [p.id, p.label]; }), span: true, hint: providers.map(function (p) { return p.label + ": " + p.note; }).join(" ") },
        secretField("market_api_key", t("a_api_key"), v, t("a_api_key_hint")),
        { name: "market_api_plan", label: t("a_api_plan"), type: "select", value: v.market_api_plan || "demo", options: [["demo", "Demo"], ["pro", "Pro"]] },
        { name: "market_poll_seconds", label: t("a_poll_seconds"), type: "number", min: 30, max: 3600, value: v.market_poll_seconds, hint: t("a_poll_hint") },
        { name: "market_stale_seconds", label: t("a_stale_seconds"), type: "number", min: 60, max: 86400, value: v.market_stale_seconds, hint: t("a_stale_hint") }
      ]; });
    }).catch(function (e) { layout(t("a_market_api")).appendChild(OX.errorState(e)); });
  });
  OX.route("/firebase", function () {
    var keys = ["fcm_enabled", "fcm_project_id", "fcm_service_account", "google_client_ids"];
    settingsPage(t("a_firebase"), t("a_firebase_desc"), keys, "integrations", function (v) { return [
      { name: "fcm_enabled", label: t("status"), type: "checkbox", value: yes(v.fcm_enabled), checkboxLabel: t("a_fcm_enabled"), span: true },
      { name: "fcm_project_id", label: t("a_fcm_project"), value: v.fcm_project_id, span: true },
      secretField("fcm_service_account", t("a_fcm_service_account"), v, t("a_fcm_sa_hint")),
      { type: "html", node: h("h3.section-title.span-2", t("a_google_signin")) },
      { name: "google_client_ids", label: t("a_google_client_ids"), value: v.google_client_ids, span: true, hint: t("a_google_hint") }
    ]; }, function () { return h("p.subtle.xs", t("a_firebase_note")); });
  });

  /* ------------------------------------------------------------------ roles */
  OX.route("/roles", function () {
    var c = layout(t("a_roles"), { desc: t("a_roles_desc"), actions: [btn(t("a_new_role"), function () { roleForm(null); }, "btn-primary", "plus")] });
    var body = h("div"); c.appendChild(body);
    var perms = [];
    OX.load(body, function () { return api.get("/api/admin/roles"); }, function (r) {
      perms = r.data.permissions;
      return h("div.grid-cards", r.data.roles.map(function (role) {
        return card(role.name, h("div.stack-sm", h("p.subtle.small", role.description || ""), h("p.xs", t("a_members_n", { n: role.members }) + " · " + t("a_permissions_n", { n: role.permissions.length })),
          h("div.row.wrap", { style: { gap: "4px" } }, role.permissions.slice(0, 12).map(function (p) { return h("span.chip", p); }), role.permissions.length > 12 ? h("span.chip", "+" + (role.permissions.length - 12)) : null),
          role.slug !== "super_admin" ? h("div.row", btn(t("edit"), function () { roleForm(role); }, "btn-ghost"), !+role.is_system ? btn(t("remove"), function () { OX.confirm({ title: t("a_delete_role"), message: role.name, danger: true, confirmText: t("remove") }).then(function (ok) { if (ok) api.del("/api/admin/roles/" + role.id).then(function () { OX.toast(t("removed")); OX.dispatchRoute(); }).catch(err); }); }, "btn-ghost") : null) : h("p.subtle.xs", t("a_super_admin_note"))), h("span.chip" + (+role.is_system ? ".primary" : ""), +role.is_system ? t("a_built_in") : t("a_custom")));
      }));
    });
    function roleForm(role) {
      var groups = {};
      perms.forEach(function (p) { (groups[p.group_name] = groups[p.group_name] || []).push(p); });
      var checks = h("div.stack", Object.keys(groups).map(function (g) {
        return h("fieldset", { style: { border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px" } }, h("legend.small", { style: { fontWeight: 600, padding: "0 4px" } }, g), groups[g].map(function (p) {
          var cb = h("input", { type: "checkbox", name: "perm", value: p.slug }); cb.checked = role ? role.permissions.indexOf(p.slug) !== -1 : false;
          return h("label.check", { style: { padding: "4px 0" } }, cb, h("span", h("code", p.slug), " — ", p.description));
        }));
      }));
      formSheet(role ? t("a_edit_role") : t("a_new_role"), [
        { name: "name", label: t("a_name"), required: true, value: role ? role.name : "" },
        role ? null : { name: "slug", label: t("a_role_id"), required: true, pattern: "[a-z0-9][a-z0-9_.-]{0,99}", hint: t("a_role_id_hint") },
        { name: "description", label: t("a_description"), span: true, value: role ? role.description || "" : "" },
        { type: "html", node: h("div.span-2", checks) }
      ].filter(Boolean), function (v) {
        var sel = Array.prototype.map.call(checks.querySelectorAll('input[name="perm"]:checked'), function (x) { return x.value; });
        var payload = { name: v.name, slug: v.slug, description: v.description, permissions: sel };
        return (role ? api.put("/api/admin/roles/" + role.id, payload) : api.post("/api/admin/roles", payload)).then(function () { OX.toast(t("saved")); });
      }, { wide: true, done: function () { OX.dispatchRoute(); } });
    }
  });

  /* ------------------------------------------------------------------ audit & security */
  OX.route("/audit", function (p, q) {
    var tab = q.tab === "logins" ? "logins" : "audit";
    var c = layout(t("a_audit"), { desc: t("a_audit_desc") });
    c.appendChild(h("div.tabs", { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": tab === "audit" ? "true" : "false", onclick: function () { OX.go("/audit"); } }, t("a_admin_actions")),
      h("button", { type: "button", role: "tab", "aria-selected": tab === "logins" ? "true" : "false", onclick: function () { OX.go("/audit?tab=logins"); } }, t("a_sign_in_events"))));
    if (tab === "logins") {
      var failed = h("input", { type: "checkbox" });
      var tl = pagedTable({
        fetch: function (pg, fl) { return api.get("/api/admin/security/logins", Object.assign({ page: pg }, fl)); },
        cols: [
          { label: t("a_time"), render: function (l) { return f.dateTime(l.created_at); } },
          { label: t("a_account"), render: function (l) { return l.full_name || l.email; } },
          { label: t("a_result"), render: function (l) { return +l.success ? (+l.suspicious ? h("span.chip.loss", t("new_device")) : h("span.chip.gain", t("login_success"))) : h("span.chip.loss", t("login_failed") + (l.reason ? " · " + l.reason : "")); } },
          { label: "IP", render: function (l) { return l.ip; } },
          { label: t("a_method"), render: function (l) { return l.method; } },
          { label: t("a_device"), render: function (l) { return h("span.xs", (l.user_agent || "").slice(0, 80)); } }
        ]
      });
      failed.onchange = function () { tl.setFilter("failed_only", failed.checked ? "1" : ""); };
      c.appendChild(h("div.toolbar", h("label.check", failed, t("a_failed_suspicious_only"))));
      c.appendChild(tl);
      return;
    }
    var action = h("input", { type: "search", placeholder: t("a_action_prefix"), "aria-label": t("a_action") });
    var from = h("input", { type: "date", "aria-label": t("from_date") }), to = h("input", { type: "date", "aria-label": t("to_date") });
    var tbl = pagedTable({
      fetch: function (pg, fl) { return api.get("/api/admin/audit", Object.assign({ page: pg }, fl)); },
      onRow: function (r) { OX.sheet({ title: r.action, wide: true, content: [kv([[t("a_time"), f.dateTime(r.created_at)], [t("a_actor"), r.actor_name ? r.actor_name + " <" + r.actor_email + ">" : t("a_system")], [t("a_entity"), (r.entity_type || "") + " " + (r.entity_id || "")], ["IP", r.ip]]), h("pre.formula", JSON.stringify(r.details, null, 2) || "—")] }); },
      cols: [
        { label: t("a_time"), render: function (r) { return f.dateTime(r.created_at); } },
        { label: t("a_actor"), render: function (r) { return r.actor_name || t("a_system"); } },
        { label: t("a_action"), render: function (r) { return h("code", r.action); } },
        { label: t("a_entity"), render: function (r) { return (r.entity_type || "") + (r.entity_id ? " #" + r.entity_id : ""); } },
        { label: "IP", render: function (r) { return r.ip; } }
      ]
    });
    action.addEventListener("input", OX.debounce(function () { tbl.setFilter("action", action.value.trim()); }, 300));
    from.onchange = function () { tbl.setFilter("from", from.value); };
    to.onchange = function () { tbl.setFilter("to", to.value); };
    c.appendChild(h("div.toolbar", h("div.search", icon("search"), action), from, to));
    c.appendChild(tbl);
  });

  /* ------------------------------------------------------------------ health & backups */
  OX.route("/health", function () {
    var c = layout(t("a_health"), { desc: t("a_health_desc") });
    var body = h("div.stack"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/system/health"); }, function (r) {
      var d = r.data;
      var tasks = ["market_refresh", "email_queue", "portfolio_snapshots", "portfolio_threshold", "reminders", "salary_records", "cleanup"];
      return [
        h("div", { class: "banner " + (d.status === "ok" ? "ok" : d.status === "warning" ? "warn" : "err") }, icon(d.status === "ok" ? "circle-check-big" : "triangle-alert", "icon-sm"), h("span", t("a_health_" + d.status) + " · v" + d.version + " · " + d.time_utc + " UTC")),
        h("div.grid-cards",
          card(t("a_checks"), h("ul.list.health-list", d.checks.map(function (x) { return h("li", h("span", { class: "status-dot " + x.status }), h("span", x.label), h("span.d", x.detail)); }))),
          h("div.stack",
            card(t("a_record_counts"), kv(Object.keys(d.counts).map(function (k) { return [k, f.int(d.counts[k])]; }))),
            card(t("a_scheduled_tasks"), h("div.stack-sm",
              h("div.row.wrap", tasks.map(function (tk) { return btn(tk, function () { api.post("/api/admin/system/tasks", { task: tk }).then(function (x) { OX.toast(tk + ": " + x.data.status + (x.data.message ? " — " + x.data.message : ""), x.data.status === "failed" ? "err" : "ok"); OX.dispatchRoute(); }).catch(err); }, "btn-ghost", "refresh-cw"); })),
              table([{ label: t("a_task"), render: function (x) { return x.task; } }, { label: t("status"), render: function (x) { return h("span", { class: "chip " + (x.status === "success" ? "gain" : x.status === "failed" ? "loss" : "") }, x.status); } }, { label: t("a_time"), render: function (x) { return f.dateTime(x.started_at); } }, { label: t("a_detail"), render: function (x) { return h("span.xs", x.message || ""); } }], d.tasks.slice(0, 15)),
              h("p.subtle.xs", t("a_cron_hint")))))
        )
      ];
    });
  });
  OX.route("/backups", function () {
    var c = layout(t("a_backups"), { desc: t("a_backups_desc"), actions: [btn(t("a_create_backup"), function () { api.post("/api/admin/system/backups").then(function (r) { OX.toast(t("a_backup_created", { file: r.data.file })); OX.dispatchRoute(); }).catch(err); }, "btn-primary", "database")] });
    var body = h("div.stack"); c.appendChild(body);
    OX.load(body, function () { return api.get("/api/admin/system/backups"); }, function (r) {
      return [r.data.length ? h("section.card.flush", table([
        { label: t("a_file"), render: function (b) { return h("code", b.file); } },
        { label: t("a_size"), num: true, render: function (b) { return f.num(b.bytes / 1048576, 2) + " MB"; } },
        { label: t("a_created"), render: function (b) { return b.created_at + " UTC"; } },
        { label: "", cls: "actions", render: function (b) { return h("div.row", { style: { justifyContent: "flex-end" } },
          btn(t("a_download"), function () { OX.download("/api/admin/system/backups/" + encodeURIComponent(b.file), null, b.file); }, "btn-ghost", "download"),
          btn(t("remove"), function () { OX.confirm({ title: t("a_delete_backup"), message: b.file, danger: true, confirmText: t("remove") }).then(function (ok) { if (ok) api.del("/api/admin/system/backups/" + encodeURIComponent(b.file)).then(function () { OX.dispatchRoute(); }).catch(err); }); }, "btn-ghost", "trash-2")); } }
      ], r.data)) : OX.stateView({ icon: "archive", title: t("a_no_backups"), body: t("a_no_backups_body") }),
      card(t("a_restore"), h("div.stack-sm", h("p.small.muted", t("a_restore_body")), h("p.formula", "php bin/restore.php storage/backups/<file>.sql.gz --confirm")))];
    });
  });

  /* ------------------------------------------------------------------ own account */
  OX.route("/account", function () {
    var c = layout(t("a_my_account"));
    c.appendChild(card(null, kv([[t("full_name"), S.user.full_name], [t("email"), S.user.email], [t("a_permissions"), h("div.row.wrap", { style: { gap: "4px", justifyContent: "flex-end" } }, S.user.permissions.map(function (p) { return h("span.chip", p); }))]])));
    c.appendChild(h("p.small", { style: { marginTop: "var(--s-4)" } }, t("a_account_hint") + " ", h("a", { href: OX.boot.base + "/app/#/security", target: "_blank", rel: "noopener" }, t("security_settings"))));
  });

  OX.notFound = function () { var c = layout(t("not_found_title")); c.appendChild(OX.stateView({ icon: "search", title: t("not_found_title"), body: t("not_found_body"), action: h("a", { class: "btn btn-primary btn-sm", href: "#/dashboard" }, t("a_dashboard")) })); };

  /* ------------------------------------------------------------------ auth & boot */
  function loginScreen(message) {
    var form = OX.form([
      { name: "email", label: t("email"), type: "email", required: true, autocomplete: "username" },
      { name: "password", label: t("password"), type: "password", required: true, autocomplete: "current-password" }
    ], { submitText: t("sign_in"), onSubmit: function (v) {
      return api.post("/api/auth/login", v, { noAuthRedirect: true }).then(function (r) { if (r.data.csrf_token) OX.setCsrf(r.data.csrf_token); S.user = r.data.user; start(); })
        .catch(function (e) { if (e.status === 401 || e.status === 423 || e.status === 429 || e.status === 403) { OX.toast(OX.serverMsg(e.message), "err"); return; } throw e; });
    } });
    OX.clear(app).appendChild(h("main.auth", { id: "main" }, h("div.auth-card", h("div.auth-brand", OX.logo()), h("div.stack-sm", h("h1", t("a_admin_sign_in")), h("p.lead", t("a_admin_sign_in_lead"))), message ? h("div.banner.err", h("span", message)) : null, form, h("p.subtle.xs", { style: { textAlign: "center" } }, t("a_restricted_note")))));
    document.title = t("a_admin_sign_in") + " · OryzenX";
  }
  function logout() { api.post("/api/auth/logout").catch(function () {}).then(function () { S.user = null; OX.setCsrf(null); loginScreen(); }); }
  OX.onUnauthorized = function () { S.user = null; loginScreen(t("a_session_expired")); };
  /** Sensitive actions: confirm the password again (server enforces a 10-minute window). */
  OX.onReauth = function () {
    return new Promise(function (resolve, reject) {
      var done = false;
      var s;
      var form = OX.form([{ name: "password", label: t("password"), type: "password", required: true, autocomplete: "current-password" }], { submitText: t("confirm"), onSubmit: function (v) {
        return api.post("/api/auth/reauth", { password: v.password }, { noReauth: true }).then(function () { done = true; s.close(); resolve(); });
      } });
      s = OX.sheet({ title: t("a_confirm_password"), content: [h("p.muted.small", t("a_confirm_password_body")), form], onClose: function () { if (!done) reject(new OX.ApiError(428, { message: t("a_action_cancelled") })); } });
    });
  };

  S.counts = { pending: 0, support: 0 };
  var dispatch = OX.dispatchRoute;
  window.removeEventListener("hashchange", dispatch);
  function start() {
    api.get("/api/me", null, { noAuthRedirect: true }).then(function (r) {
      S.user = r.data.user;
      if (r.data.csrf_token) OX.setCsrf(r.data.csrf_token);
      if (!S.user.is_admin || !S.user.permissions.length) {
        OX.clear(app).appendChild(h("main.center-page", h("div.center-card", h("div.center-logo", OX.logo()), h("div.status-icon.err", "!"), h("h1", t("state_denied_title")), h("p.muted", t("a_not_admin")), h("button", { class: "btn btn-outline btn-block", type: "button", onclick: logout }, t("sign_out")))));
        return;
      }
      return api.get("/api/app/config").then(function (c) { OX.boot.timezone = c.data.timezone; }).catch(function () {}).then(function () {
        window.removeEventListener("hashchange", dispatch);
        window.addEventListener("hashchange", dispatch);
        if (!location.hash || location.hash === "#/" || location.hash === "#") OX.go("/dashboard", true); else dispatch();
        if (can("dashboard.view")) api.get("/api/admin/dashboard").then(function (d) { S.counts.pending = d.data.users.pending_verification; S.counts.support = d.data.support_new; }).catch(function () {});
      });
    }).catch(function () { loginScreen(); });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
