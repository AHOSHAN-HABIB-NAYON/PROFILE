/* OryzenX User App — mobile-first SPA on the shared core (core.js). */
(function () {
  "use strict";
  var OX = window.OX, h = OX.el, t = OX.t, f = OX.fmt, api = OX.api, icon = OX.icon;
  var app = document.getElementById("app");
  var S = OX.state;
  S.config = {};
  var PUBLIC = ["/welcome", "/login", "/register", "/forgot-password", "/reset-password"];

  /* ------------------------------------------------------------------ shell */
  var NAV = [
    ["/home", "house", "nav_home"],
    ["/portfolio", "chart-pie", "nav_portfolio"],
    ["/trading", "chart-candlestick", "nav_trading"],
    ["/activity", "history", "nav_activity"],
    ["/more", "menu", "nav_more"]
  ];
  function shell(title, opts) {
    opts = opts || {};
    var nav = opts.nav !== false;
    var cur = OX.current().path;
    var top = h("header.u-top", h("div.u-top-inner",
      opts.back ? h("button", { class: "icon-btn back", type: "button", "aria-label": t("back"), onclick: function () { if (history.length > 1 && !opts.backTo) history.back(); else OX.go(opts.backTo || "/home"); } }, icon("arrow-left")) : null,
      h("h1", title),
      opts.actions || null,
      nav && !opts.back ? h("a", { class: "icon-btn", href: "#/notifications", "aria-label": t("notifications") }, icon("bell"), S.unread ? h("span.sr-only", t("unread_count", { n: S.unread })) : null) : null
    ));
    var main = h("main", { class: "u-main view-enter" + (nav ? "" : " no-nav"), id: "main" });
    var navEl = null;
    if (nav) {
      navEl = h("nav.bottom-nav", { "aria-label": t("main_navigation") }, h("ul", NAV.map(function (n) {
        var active = cur === n[0] || cur.indexOf(n[0] + "/") === 0 || (n[0] === "/activity" && /^\/(trades|transactions)/.test(cur)) || (n[0] === "/more" && /^\/(profile|security|settings|help|legal|verification|salary|loans|notifications)/.test(cur));
        return h("li", h("a", { href: "#" + n[0], "aria-current": active ? "page" : null }, icon(n[1]), h("span", t(n[2])), n[0] === "/more" && S.unread ? h("span.badge-dot", { "aria-hidden": "true" }) : null));
      })));
    }
    OX.clear(app).appendChild(h("div", { class: "u-shell" + (nav ? " has-nav" : "") }, top, main, navEl));
    document.title = title + " · OryzenX";
    window.scrollTo(0, 0);
    if (S.config.demo_mode && S.user && S.user.is_demo) main.appendChild(h("div.banner.demo", { role: "note" }, icon("info", "icon-sm"), t("demo_banner")));
    return main;
  }
  function card(title, body, link) {
    return h("section.card", title ? h("div.card-head", h("h2", title), link || null) : null, body);
  }
  function kv(rows) {
    return h("dl.kv", rows.filter(Boolean).map(function (r) {
      return h("div.kv-row", h("dt", r[0]), h("dd", { class: r[2] || "" }, r[1]));
    }));
  }
  function money(v, cls) { return h("span", { class: "num " + (cls === true ? f.cls(v) : cls || "") }, cls === true ? f.signedUsd(v) : f.usd(v)); }
  function priceAge(p) {
    if (!p || !p.updated_at) return h("span.price-live.stale", h("span.dot"), t("price_unavailable"));
    return h("span", { class: "price-live" + (p.stale ? " stale" : "") }, h("span.dot"), p.stale ? t("price_stale_since", { time: f.ago(p.updated_at) }) : t("price_updated", { time: f.ago(p.updated_at) }), p.simulated ? h("span.chip.warn", t("simulated")) : null);
  }
  function infoSheet(title, paragraphs) {
    OX.sheet({ title: title, content: paragraphs.map(function (p) { return typeof p === "string" ? h("p.muted", p) : p; }) });
  }
  function txIcon(type, pnl) {
    var map = { deposit: ["arrow-down-right", "gain"], withdrawal: ["arrow-up-right", "loss"], transfer: ["refresh-cw", "primary"], adjustment: ["sliders-horizontal", ""], investment_buy: ["coins", "primary"], investment_sale: ["banknote", ""], trade_close: ["chart-candlestick", ""], loan_disbursement: ["landmark", "primary"], loan_repayment: ["hand-coins", ""], loan_charge: ["percent", "loss"], salary_payment: ["wallet", "gain"], profit_allocation: ["layers", ""], reversal: ["undo-2", "warn"] };
    var m = map[type] || ["receipt", ""];
    var cls = m[1];
    if ((type === "investment_sale" || type === "trade_close") && pnl !== null && pnl !== undefined) cls = f.cls(pnl);
    return h("span", { class: "tx-icon " + cls }, icon(m[0]));
  }
  function txRow(tx) {
    var sub = [f.dateTime(tx.effective_at)];
    if (tx.asset_symbol) sub.unshift(tx.asset_symbol);
    return h("li", h("button", { class: "list-item", type: "button", onclick: function () { txDetail(tx.id); } },
      txIcon(tx.type, tx.realized_pnl_usd),
      h("div.li-main", h("span.li-title", t("tx_" + tx.type)), h("span.li-sub", sub.join(" · "))),
      h("div.li-end",
        h("span", { class: "li-title num" }, tx.type === "trade_close" || tx.type === "investment_sale" ? h("span", { class: f.cls(tx.realized_pnl_usd) }, f.signedUsd(tx.realized_pnl_usd)) : f.usd(tx.amount_usd)),
        tx.status !== "completed" ? OX.statusChip(tx.status) : (tx.quantity ? h("span.li-sub.num", f.qty(tx.quantity) + " " + (tx.asset_symbol || "")) : null))
    ));
  }
  function txDetail(id) {
    var s = OX.sheet({ title: t("transaction_details"), content: OX.skeleton("rows", 3) });
    api.get("/api/transactions/" + id).then(function (r) {
      var tx = r.data;
      OX.clear(s.body).appendChild(h("div.stack",
        h("div.row", txIcon(tx.type, tx.realized_pnl_usd), h("div.grow", h("strong", t("tx_" + tx.type)), h("div.subtle.small", f.dateTime(tx.effective_at) + " · " + f.tzLabel())), OX.statusChip(tx.status)),
        kv([
          [t("transaction_id"), h("span.num.small", tx.uuid)],
          tx.asset_symbol ? [t("asset"), tx.asset_symbol + " · " + tx.asset_name] : null,
          tx.quantity ? [t("quantity"), f.qty(tx.quantity)] : null,
          tx.unit_price ? [t("unit_price"), f.price(tx.unit_price)] : null,
          [t("amount_usd"), f.usd(tx.amount_usd)],
          Number(tx.fee_usd) ? [t("fees"), f.usd(tx.fee_usd)] : null,
          tx.realized_pnl_usd !== null ? [t("realized_pnl"), h("span", { class: f.cls(tx.realized_pnl_usd) }, f.signedUsd(tx.realized_pnl_usd))] : null,
          tx.reference ? [t("reference"), tx.reference] : null,
          tx.notes ? [t("notes"), tx.notes] : null,
          tx.reversal_of_id ? [t("reverses_transaction"), "#" + tx.reversal_of_id] : null,
          tx.reversed_by_id ? [t("reversed_by_transaction"), "#" + tx.reversed_by_id] : null
        ])
      ));
    }).catch(function (e) { OX.clear(s.body).appendChild(OX.errorState(e)); });
  }

  /* ------------------------------------------------------------------ auth screens */
  function authLayout(title, lead, content, alt) {
    var top = h("div.auth-top", langButton(), themeButton());
    OX.clear(app).appendChild(h("main.auth", { id: "main" }, top, h("div.auth-card.view-enter", h("div.auth-brand", OX.logo()), h("div.stack-sm", h("h1", title), lead ? h("p.lead", lead) : null), content, alt || null)));
    document.title = title + " · OryzenX";
  }
  function langButton() {
    var other = OX.locale === "bn" ? "en" : "bn";
    return h("button", { class: "btn btn-ghost btn-sm", type: "button", lang: other, onclick: function () { OX.setLocale(other).then(OX.dispatchRoute); } }, icon("languages", "icon-sm"), other === "bn" ? "বাংলা" : "English");
  }
  function themeButton() {
    return h("button", { class: "icon-btn", type: "button", "aria-label": t("toggle_theme"), onclick: function () { OX.theme.set(OX.theme.resolved() === "dark" ? "light" : "dark"); } }, icon(OX.theme.resolved() === "dark" ? "sun" : "moon"));
  }
  function afterLogin(data) {
    S.user = data.user;
    if (data.csrf_token) OX.setCsrf(data.csrf_token);
    if (data.user.locale && data.user.locale !== OX.locale) return OX.setLocale(data.user.locale).then(routeHome);
    routeHome();
  }
  function routeHome() {
    var next = sessionStorage.getItem("oryx-next");
    sessionStorage.removeItem("oryx-next");
    if (!S.user.verification.email_verified) return OX.go("/verify-email", true);
    OX.go(next && PUBLIC.indexOf(next) === -1 ? next : "/home", true);
  }

  OX.route("/welcome", function () {
    authLayout(t("welcome_title"), t("welcome_lead"), h("div.stack",
      h("ul.welcome-points", [["chart-line", "welcome_point_1"], ["shield-check", "welcome_point_2"], ["bell", "welcome_point_3"]].map(function (p) { return h("li", icon(p[0]), h("span", t(p[1]))); })),
      S.config.registration_open !== false ? h("a", { class: "btn btn-primary btn-block", href: "#/register" }, t("create_account")) : null,
      h("a", { class: "btn btn-outline btn-block", href: "#/login" }, t("sign_in")),
      h("p.subtle.xs", { style: { textAlign: "center" } }, t("monitoring_disclaimer"))
    ));
  });

  OX.route("/login", function () {
    var form = OX.form([
      { name: "email", label: t("email"), type: "email", required: true, autocomplete: "email", inputmode: "email", error: t("v_email") },
      { name: "password", label: t("password"), type: "password", required: true, autocomplete: "current-password", error: t("v_required") }
    ], {
      submitText: t("sign_in"),
      onSubmit: function (v) {
        return api.post("/api/auth/login", { email: v.email, password: v.password }, { noAuthRedirect: true }).then(function (r) { afterLogin(r.data); })
          .catch(function (e) { if (e.status === 401 || e.status === 423 || e.status === 403 || e.status === 429) { OX.toast(OX.serverMsg(e.message), "err"); return; } throw e; });
      }
    });
    authLayout(t("sign_in_title"), t("sign_in_lead"), h("div.stack",
      googleBlock(),
      form,
      h("p.auth-alt", h("a", { href: "#/forgot-password" }, t("forgot_password")))
    ), S.config.registration_open !== false ? h("p.auth-alt", t("no_account") + " ", h("a", { href: "#/register" }, t("create_account"))) : null);
  });

  function googleBlock() {
    if (!S.config.google_enabled || !S.config.google_client_id) return null;
    var box = h("div.google-btn-wrap");
    var wait = function (n) {
      if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.initialize({ client_id: S.config.google_client_id, callback: function (resp) {
          api.post("/api/auth/google", { id_token: resp.credential }, { noAuthRedirect: true }).then(function (r) { afterLogin(r.data); }).catch(function (e) { OX.toast(OX.serverMsg(e.message), "err"); });
        }, ux_mode: "popup" });
        google.accounts.id.renderButton(box, { theme: OX.theme.resolved() === "dark" ? "filled_black" : "outline", size: "large", width: 320, text: "continue_with", locale: OX.locale });
      } else if (n < 40) setTimeout(function () { wait(n + 1); }, 150);
    };
    wait(0);
    return h("div.stack-sm", box, h("div.divider", t("or")));
  }

  OX.route("/register", function () {
    var terms = h("span", t("accept_terms_1") + " ", h("a", { href: OX.boot.base + "/terms", target: "_blank", rel: "noopener" }, t("terms")), " " + t("and") + " ", h("a", { href: OX.boot.base + "/privacy", target: "_blank", rel: "noopener" }, t("privacy_policy")), t("accept_terms_2"));
    var form = OX.form([
      { name: "full_name", label: t("full_name"), required: true, autocomplete: "name", minlength: 2, maxlength: 120, error: t("v_name") },
      { name: "email", label: t("email"), type: "email", required: true, autocomplete: "email", inputmode: "email", error: t("v_email") },
      { name: "phone", label: t("phone"), type: "tel", autocomplete: "tel", inputmode: "tel", pattern: "\\+?[0-9 ()-]{6,20}", error: t("v_phone") },
      { name: "password", label: t("password"), type: "password", required: true, autocomplete: "new-password", minlength: 10, pattern: "(?=.*[A-Za-z])(?=.*\\d).{10,200}", hint: t("password_rules"), error: t("password_rules") },
      { name: "password_confirmation", label: t("confirm_password"), type: "password", required: true, autocomplete: "new-password", error: t("v_password_match") },
      { name: "address", label: t("address"), autocomplete: "street-address", maxlength: 255 },
      { name: "city", label: t("city"), autocomplete: "address-level2", maxlength: 100 },
      { name: "country", label: t("country"), autocomplete: "country-name", maxlength: 100, value: "Bangladesh" },
      { type: "html", node: h("label.check", h("input", { type: "checkbox", name: "accept_terms", required: true }), terms) }
    ], {
      submitText: t("create_account"),
      onSubmit: function (v, form) {
        if (v.password !== v.password_confirmation) { form.setErrors({ fields: { password_confirmation: t("v_password_match") } }); return Promise.resolve(); }
        v.locale = OX.locale;
        return api.post("/api/auth/register", v, { noAuthRedirect: true }).then(function (r) { S.user = r.data.user; if (r.data.csrf_token) OX.setCsrf(r.data.csrf_token); OX.toast(t("account_created")); OX.go("/verify-email", true); });
      }
    });
    authLayout(t("register_title"), t("register_lead"), h("div.stack", googleBlock(), form), h("p.auth-alt", t("have_account") + " ", h("a", { href: "#/login" }, t("sign_in"))));
  });

  OX.route("/verify-email", function () {
    if (!S.user) return OX.go("/login", true);
    if (S.user.verification.email_verified) return OX.go("/home", true);
    var form = OX.form([{ name: "code", label: t("verification_code"), required: true, inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", maxlength: 6, error: t("v_code") }], {
      submitText: t("verify_email"),
      onSubmit: function (v) { return api.post("/api/auth/verify-email", { code: v.code }).then(function (r) { S.user = r.data.user; OX.toast(t("email_verified_toast")); OX.go("/home", true); }); }
    });
    form.querySelector("input").classList.add("code-input");
    var resend = h("button", { class: "btn btn-ghost btn-block", type: "button" }, t("resend_code"));
    resend.onclick = function () {
      resend.disabled = true;
      api.post("/api/auth/resend-verification").then(function () { OX.toast(t("code_sent")); }).catch(function (e) { OX.toast(OX.serverMsg(e.message), "err"); }).finally(function () { setTimeout(function () { resend.disabled = false; }, 30000); });
    };
    authLayout(t("verify_title"), t("verify_lead", { email: S.user.email }), h("div.stack", form, resend,
      h("div.banner.info", icon("info", "icon-sm"), h("span", t("verify_hint")))),
      h("p.auth-alt", h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: logout }, t("sign_out"))));
  });

  OX.route("/forgot-password", function () {
    var done = h("div");
    var form = OX.form([{ name: "email", label: t("email"), type: "email", required: true, autocomplete: "email", error: t("v_email") }], {
      submitText: t("send_reset_link"),
      onSubmit: function (v) { return api.post("/api/auth/forgot-password", v, { noAuthRedirect: true }).then(function () { OX.clear(done).appendChild(h("div.banner.ok", { role: "status" }, icon("mail", "icon-sm"), h("span", t("reset_sent")))); form.reset(); }); }
    });
    authLayout(t("forgot_title"), t("forgot_lead"), h("div.stack", done, form), h("p.auth-alt", h("a", { href: "#/login" }, t("back_to_sign_in"))));
  });

  OX.route("/reset-password", function (p, q) {
    var token = q.token || "";
    var form = OX.form([
      { name: "password", label: t("new_password"), type: "password", required: true, autocomplete: "new-password", minlength: 10, pattern: "(?=.*[A-Za-z])(?=.*\\d).{10,200}", hint: t("password_rules"), error: t("password_rules") },
      { name: "password_confirmation", label: t("confirm_password"), type: "password", required: true, autocomplete: "new-password", error: t("v_password_match") }
    ], {
      submitText: t("set_new_password"),
      onSubmit: function (v, form) {
        if (v.password !== v.password_confirmation) { form.setErrors({ fields: { password_confirmation: t("v_password_match") } }); return Promise.resolve(); }
        return api.post("/api/auth/reset-password", { token: token, password: v.password, password_confirmation: v.password_confirmation }, { noAuthRedirect: true })
          .then(function () { OX.toast(t("password_reset_done")); OX.go("/login", true); });
      }
    });
    authLayout(t("reset_title"), t("reset_lead"), token ? form : h("div.banner.err", t("reset_link_invalid")), h("p.auth-alt", h("a", { href: "#/login" }, t("back_to_sign_in"))));
  });

  function logout() {
    api.post("/api/auth/logout").catch(function () {}).then(function () { S.user = null; OX.setCsrf(null); OX.go("/welcome", true); });
  }

  /* ------------------------------------------------------------------ home dashboard */
  OX.route("/home", function () {
    var main = shell(t("home_title"));
    var banners = h("div.stack-sm");
    var body = h("div.stack");
    main.appendChild(banners);
    main.appendChild(body);
    verificationBanner(banners);
    var prev = null;
    function render(d) {
      OX.clear(body);
      var heroAmount = h("div.amount.num", f.usd(d.all_balance_usd));
      if (prev) OX.tween(heroAmount, +prev.all_balance_usd, +d.all_balance_usd, function (x) { return f.usd(x); });
      var hero = h("section.balance-hero.card", { "aria-label": t("all_balance") },
        h("div.label", t("all_balance"), h("button", { class: "icon-btn", style: { width: "28px", height: "28px", color: "inherit" }, type: "button", "aria-label": t("what_is_this"), onclick: function () { infoSheet(t("all_balance"), [t("def_all_balance"), t("def_net_value")]); } }, icon("info", "icon-sm"))),
        heroAmount,
        h("div.sub",
          h("span", t("net_value") + ": ", h("strong.num", f.usd(d.net_value_usd))),
          h("span", { class: "num " + f.cls(d.unrealized_pnl_usd) }, t("unrealized") + " " + f.signedUsd(d.unrealized_pnl_usd) + (d.unrealized_return_pct !== null ? " (" + f.pct(d.unrealized_return_pct, true) + ")" : ""))),
        h("div.hero-foot", h("span", d.last_market_update ? t("market_updated", { time: f.ago(d.last_market_update) }) : t("no_market_data")), h("span", "USD"))
      );
      body.appendChild(hero);
      if (d.prices_simulated) body.appendChild(h("div.banner.warn", { role: "note" }, icon("triangle-alert", "icon-sm"), h("span", t("simulated_prices_banner"))));
      if (d.stale_assets && d.stale_assets.length) body.appendChild(h("div.banner.warn", { role: "note" }, icon("clock", "icon-sm"), h("span", t("stale_prices_banner", { assets: d.stale_assets.join(", ") }))));
      if (d.unpriced_assets && d.unpriced_assets.length) body.appendChild(h("div.banner.warn", icon("circle-alert", "icon-sm"), h("span", t("unpriced_banner", { assets: d.unpriced_assets.join(", ") }))));

      var tiles = [
        ["/portfolio", "wallet", "investment_balance", f.usd(d.investment_balance_usd), t("at_market_value"), ""],
        ["/trading", "chart-candlestick", "trading_balance", f.usd(d.trading_balance_usd), t("cash_for_trading"), ""],
        ["/pnl", "trending-up", "todays_profit", f.signedUsd(d.todays_profit_usd), t("realized_today"), f.cls(d.todays_profit_usd)],
        ["/loans", "landmark", "loan_balance", f.usd(d.loan_balance_usd), t("current_liability"), ""],
        ["/pnl", "trending-down", "loss_balance", f.usd(d.loss_balance_usd), t("realized_losses_all_time"), Number(d.loss_balance_usd) ? "loss" : ""],
        ["/activity", "banknote", "main_balance", f.usd(d.cash_balance_usd), t("cash_balance"), ""]
      ];
      if (d.admin_total_users !== undefined) tiles.push(["", "users", "total_users", f.int(d.admin_total_users), t("admin_only"), ""]);
      body.appendChild(h("div.metrics.m3", tiles.map(function (x) {
        var inner = [h("span.m-label", icon(x[1]), t(x[2])), h("span", { class: "m-value num " + x[5] }, x[3]), h("span.m-sub", x[4])];
        return x[0] ? h("a", { class: "metric", href: "#" + x[0] }, inner) : h("div.metric.static", inner);
      })));

      if (d.allocation && d.allocation.length) {
        var palette = ["#1A56DB", "#0B8A5F", "#9945FF", "#F59E0B", "#E11D48", "#0891B2", "#64748B"];
        var bar = h("div.alloc-bar", { role: "img", "aria-label": t("portfolio_allocation") });
        var legend = h("ul.legend");
        d.allocation.forEach(function (a, i) {
          var c = a.color || palette[i % palette.length];
          bar.appendChild(h("span", { style: { width: Math.max(1, +a.pct) + "%", background: c }, title: a.label + " " + f.pct(a.pct) }));
          legend.appendChild(h("li", h("span.sw", { style: { background: c } }), h("span.truncate", a.label === "Cash" ? t("cash") : a.label === "Trading" ? t("trading") : a.label), h("span.subtle.num", { style: { marginLeft: "auto" } }, f.pct(a.pct))));
        });
        body.appendChild(card(t("portfolio_allocation"), h("div", bar, legend), h("a.card-link", { href: "#/portfolio" }, t("view_all"), icon("chevron-right", "icon-sm"))));
      }

      if (d.holdings && d.holdings.length) {
        body.appendChild(card(t("asset_price_movement"), h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, d.holdings.filter(function (x) { return +x.quantity > 0; }).slice(0, 6).map(holdingRow)), h("a.card-link", { href: "#/markets" }, t("markets"), icon("chevron-right", "icon-sm"))));
      }

      var recent = d.recent_transactions || [];
      body.appendChild(card(t("recent_activity"), recent.length ? h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, recent.map(txRow)) : OX.stateView({ icon: "receipt", title: t("empty_tx_title"), body: t("empty_tx_body") }), h("a.card-link", { href: "#/activity" }, t("view_all"), icon("chevron-right", "icon-sm"))));
      body.appendChild(h("p.subtle.xs", { style: { textAlign: "center" } }, t("figures_note", { tz: f.tzLabel() })));
      prev = d;
    }
    function load(first) {
      return api.get("/api/dashboard").then(function (r) { render(r.data); refreshUnread(); }).catch(function (e) { if (first) { OX.clear(body).appendChild(OX.errorState(e, function () { load(true); })); } });
    }
    body.appendChild(h("div.stack", h("div.skel.skel-block"), OX.skeleton("tiles")));
    load(true);
    OX.poll(function () { load(false); }, 60000);
  });

  function holdingRow(x) {
    return h("li", h("a", { class: "list-item", href: "#/asset/" + x.asset_id },
      OX.coinLogo(x),
      h("div.li-main", h("span.li-title", x.symbol + " · " + x.name), h("span.li-sub.num", f.qty(x.quantity) + " " + x.symbol + " · " + f.price(x.current_price, x.price_decimals))),
      h("div.li-end", h("span.li-title.num", f.usd(x.market_value_usd)), h("span", { class: "li-sub num " + f.cls(x.unrealized_pnl_usd) }, f.signedUsd(x.unrealized_pnl_usd) + (x.return_pct !== null ? " · " + f.pct(x.return_pct, true) : ""))),
      icon("chevron-right", "chev")));
  }

  function verificationBanner(container) {
    var v = S.user && S.user.verification;
    if (!v) return;
    if (v.identity_required && v.identity_status !== "approved") {
      var msg = { not_submitted: "verify_banner_not_submitted", pending: "verify_banner_pending", rejected: "verify_banner_rejected" }[v.identity_status];
      container.appendChild(h("div", { class: "banner " + (v.identity_status === "rejected" ? "err" : "info"), role: "note" }, icon("shield", "icon-sm"), h("span", t(msg) + " ", v.identity_status !== "pending" ? h("a", { href: "#/verification" }, t("complete_verification")) : null)));
    }
  }

  /* ------------------------------------------------------------------ portfolio */
  OX.route("/portfolio", function () {
    var main = shell(t("portfolio_title"));
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return api.get("/api/portfolio"); }, function (r) {
      var s = r.data.summary, perf = r.data.performance;
      var nodes = [];
      nodes.push(h("div.metrics",
        h("div.metric.static", h("span.m-label", t("investment_balance")), h("span.m-value.num", f.usd(s.investment_balance_usd)), h("span.m-sub", t("at_market_value"))),
        h("div.metric.static", h("span.m-label", t("cost_basis")), h("span.m-value.num", f.usd(s.investment_cost_basis_usd)), h("span.m-sub", t("incl_fees"))),
        h("div.metric.static", h("span.m-label", t("unrealized_pnl")), h("span", { class: "m-value num " + f.cls(s.unrealized_pnl_usd) }, f.signedUsd(s.unrealized_pnl_usd)), h("span.m-sub", s.unrealized_return_pct !== null ? f.pct(s.unrealized_return_pct, true) : "—")),
        h("div.metric.static", h("span.m-label", t("net_value")), h("span.m-value.num", f.usd(s.net_value_usd)), h("span.m-sub", t("after_liabilities")))
      ));
      if (s.stale_assets.length) nodes.push(h("div.banner.warn", icon("clock", "icon-sm"), h("span", t("stale_prices_banner", { assets: s.stale_assets.join(", ") }))));
      var chartBox = h("div.chart-box.sm");
      nodes.push(card(t("performance"), perf.length >= 2 ? chartBox : OX.stateView({ icon: "chart-line", title: t("perf_empty_title"), body: t("perf_empty_body") })));
      if (perf.length >= 2) requestAnimationFrame(function () {
        OX.chart.create(chartBox, "area", perf.map(function (p) { return { time: p.date, value: +p.net_value_usd }; }), { timeVisible: false });
      });
      var holdings = s.holdings.filter(function (x) { return +x.quantity > 0; });
      nodes.push(card(t("holdings"), holdings.length ? h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, holdings.map(holdingRow)) : OX.stateView({ icon: "coins", title: t("empty_holdings_title"), body: t("empty_holdings_body") })));
      var closed = s.holdings.filter(function (x) { return +x.quantity === 0; });
      if (closed.length) nodes.push(card(t("closed_positions"), kv(closed.map(function (x) { return [x.symbol, h("span", { class: f.cls(x.realized_pnl_usd) }, f.signedUsd(x.realized_pnl_usd) + " " + t("realized")), ""]; }))));
      nodes.push(card(t("calculation_method"), h("div.stack-sm", h("p.formula", t("formula_portfolio")), h("p.subtle.xs", t("avg_cost_note")))));
      return nodes;
    }, "tiles");
  });

  /* ------------------------------------------------------------------ markets */
  OX.route("/markets", function () {
    var main = shell(t("markets_title"), { back: true });
    var body = h("div");
    main.appendChild(body);
    var meta = h("p.subtle.xs", { style: { marginTop: "var(--s-3)" } });
    function render(r) {
      var list = h("ul.list", r.data.map(function (a) {
        return h("li", h("a", { class: "list-item", href: "#/asset/" + a.asset_id },
          OX.coinLogo(a),
          h("div.li-main", h("span.li-title", a.symbol), h("span.li-sub", a.name)),
          h("div.li-end", h("span.li-title.num", f.price(a.price, a.price_decimals)), a.change_24h_pct !== null ? h("span", { class: "li-sub num " + f.cls(a.change_24h_pct) }, f.pct(a.change_24h_pct, true) + " " + t("24h")) : h("span.li-sub", "—")),
          a.stale ? h("span.chip.warn", t("stale")) : null));
      }));
      OX.clear(meta).appendChild(document.createTextNode(t("prices_source", { provider: r.meta.provider }) + " " + (r.meta.quote_note || "")));
      return [h("section.card.flush", list), meta];
    }
    OX.load(body, function () { return api.get("/api/assets"); }, render);
    OX.poll(function () { api.get("/api/assets").then(function (r) { OX.clear(body); OX.append(body, render(r)); }).catch(function () {}); }, 30000);
  });

  /* ------------------------------------------------------------------ asset detail + live candlestick */
  OX.route("/asset/:id", function (p) {
    var main = shell(t("asset_title"), { back: true, backTo: "/portfolio" });
    var body = h("div.stack");
    main.appendChild(body);
    var range = "1D", chartObj = null, chartBox = h("div.chart-box"), chartNote = h("p.subtle.xs");
    var priceEl = h("div.num", { style: { fontSize: "var(--fs-3xl)", fontWeight: 700, letterSpacing: "-0.02em" } });
    var changeEl = h("span"), ageEl = h("span");
    var lastPrice = null, asset = null;

    function loadChart() {
      OX.clear(chartBox).appendChild(h("div.skel", { style: { position: "absolute", inset: 0 } }));
      api.get("/api/assets/" + p.id + "/ohlc", { range: range }).then(function (r) {
        OX.clear(chartBox);
        var d = r.data;
        var rows = OX.chart.candles(d.candles || []);
        if (!rows.length) { chartBox.appendChild(h("div.chart-overlay", d.error || t("chart_no_data"))); return; }
        chartObj = OX.chart.create(chartBox, "candles", rows, { priceDecimals: asset ? asset.price_decimals : undefined });
        OX.clear(chartNote).appendChild(document.createTextNode((d.simulated ? t("simulated_chart") + " " : "") + (d.stale ? (d.error || t("chart_stale")) + " " : "") + t("chart_source", { source: d.source })));
      }).catch(function (e) { OX.clear(chartBox).appendChild(h("div.chart-overlay", OX.serverMsg(e.message))); });
    }
    var seg = h("div.segmented", { role: "tablist", "aria-label": t("chart_range") }, ["1D", "7D", "1M", "3M", "1Y"].map(function (r) {
      return h("button", { type: "button", role: "tab", "aria-selected": r === range ? "true" : "false", onclick: function (e) {
        range = r; seg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b === e.currentTarget ? "true" : "false"); }); loadChart();
      } }, t("range_" + r));
    }));

    OX.load(body, function () { return api.get("/api/assets/" + p.id); }, function (r) {
      var d = r.data; asset = d.asset;
      document.querySelector(".u-top h1").textContent = asset.symbol + " · " + asset.name;
      lastPrice = asset.price;
      priceEl.textContent = f.price(asset.price, asset.price_decimals);
      changeEl.className = "chip " + f.cls(asset.change_24h_pct);
      changeEl.textContent = asset.change_24h_pct !== null ? f.pct(asset.change_24h_pct, true) + " " + t("24h") : "—";
      OX.clear(ageEl).appendChild(priceAge(asset));
      var nodes = [
        h("section.card", h("div.row", OX.coinLogo(asset), h("div.grow", h("div.subtle.small", t("current_price")), priceEl), changeEl), h("div", { style: { marginTop: "var(--s-2)" } }, ageEl),
          h("div", { style: { margin: "var(--s-4) 0 var(--s-2)" } }, seg), chartBox, chartNote)
      ];
      var hd = d.holding;
      if (hd && +hd.quantity > 0) {
        nodes.push(card(t("your_holding"), h("div.stack",
          kv([
            [t("holding_quantity"), f.qty(hd.quantity) + " " + asset.symbol],
            +hd.borrowed_quantity ? [t("of_which_borrowed"), f.qty(hd.borrowed_quantity) + " " + asset.symbol] : null,
            [t("average_price"), f.price(hd.average_price, asset.price_decimals)],
            [t("cost_basis"), f.usd(hd.cost_basis_usd)],
            [t("current_price"), f.price(hd.current_price, asset.price_decimals)],
            [t("market_value"), f.usd(hd.market_value_usd)],
            [t("unrealized_pnl"), h("span", { class: f.cls(hd.unrealized_pnl_usd) }, f.signedUsd(hd.unrealized_pnl_usd))],
            [t("return_pct"), h("span", { class: f.cls(hd.return_pct) }, f.pct(hd.return_pct, true))],
            +hd.realized_pnl_usd ? [t("realized_pnl"), h("span", { class: f.cls(hd.realized_pnl_usd) }, f.signedUsd(hd.realized_pnl_usd))] : null,
            [t("last_updated"), f.dateTime(hd.price_updated_at)]
          ]),
          +hd.borrowed_quantity ? h("div.banner.info", icon("info", "icon-sm"), h("span", t("borrowed_note"))) : null,
          h("p.formula", t("formula_holding", { qty: f.qty(hd.quantity), price: f.price(hd.current_price, asset.price_decimals), mv: f.usd(hd.market_value_usd), cost: f.usd(hd.cost_basis_usd), pnl: f.signedUsd(hd.unrealized_pnl_usd), pct: f.pct(hd.return_pct, true) }))
        )));
      } else {
        nodes.push(card(t("your_holding"), h("p.muted.small", t("no_holding_asset"))));
      }
      if (d.lots.length) nodes.push(card(t("acquisitions"), h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, d.lots.map(function (l) {
        return h("li", h("div.list-item", h("span.tx-icon.primary", icon("coins")), h("div.li-main", h("span.li-title.num", f.qty(l.quantity) + " " + asset.symbol + " @ " + f.price(l.unit_price, asset.price_decimals)), h("span.li-sub", f.date(l.acquired_at) + (l.funding === "loan" ? " · " + t("borrowed") : "") + (+l.fee_usd ? " · " + t("fee") + " " + f.usd(l.fee_usd) : ""))), h("div.li-end", h("span.li-title.num", f.usd(l.cost_basis_usd)), h("span.li-sub", t("cost_basis")))));
      }))));
      if (d.transactions.length) nodes.push(card(t("related_transactions"), h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, d.transactions.map(function (tx) { tx.asset_symbol = asset.symbol; return txRow(tx); }))));
      requestAnimationFrame(loadChart);
      return nodes;
    });

    // live price: refresh every 30s, update header and the last candle
    OX.poll(function () {
      api.get("/api/assets").then(function (r) {
        var a = r.data.find(function (x) { return String(x.asset_id) === String(p.id); });
        if (!a || !asset) return;
        if (a.price !== lastPrice && a.price !== null) {
          var up = +a.price > +lastPrice;
          OX.tween(priceEl, +lastPrice, +a.price, function (x) { return f.price(x, asset.price_decimals); }, 450);
          priceEl.classList.remove("flash-up", "flash-down"); void priceEl.offsetWidth; priceEl.classList.add(up ? "flash-up" : "flash-down");
          if (chartObj && range === "1D") {
            try {
              var data = chartObj.series.data(); var last = data[data.length - 1];
              if (last) chartObj.series.update({ time: last.time, open: last.open, high: Math.max(last.high, +a.price), low: Math.min(last.low, +a.price), close: +a.price });
            } catch (e) {}
          }
          lastPrice = a.price;
        }
        OX.clear(ageEl).appendChild(priceAge(a));
      }).catch(function () {});
    }, 30000);
  });

  /* ------------------------------------------------------------------ trading monitor */
  OX.route("/trading", function () {
    var main = shell(t("trading_title"));
    var body = h("div.stack");
    main.appendChild(body);
    function render(r, tradesRes, dash) {
      var m = r.data, d = dash.data;
      var per = m.periods;
      var nodes = [
        h("div.metrics.m3",
          h("a.metric", { href: "#/activity" }, h("span.m-label", icon("banknote"), t("main_balance")), h("span.m-value.num", f.usd(d.cash_balance_usd)), h("span.m-sub", t("cash_balance"))),
          h("div.metric.static", h("span.m-label", icon("chart-candlestick"), t("trading_balance")), h("span.m-value.num", f.usd(m.trading_balance_usd)), h("span.m-sub", t("cash_for_trading"))),
          h("a.metric", { href: "#/pnl" }, h("span.m-label", icon("trending-down"), t("loss_balance")), h("span", { class: "m-value num " + (Number(m.realized_losses_usd) ? "loss" : "") }, f.usd(m.realized_losses_usd)), h("span.m-sub", t("realized_trade_losses")))
        ),
        card(t("realized_trading_pnl"), h("div.stack-sm",
          kv([["today", "todays_profit"], ["yesterday", "yesterdays_profit"], ["last_7_days", "last_7_days"], ["last_30_days", "last_30_days"], ["last_1_year", "last_1_year"], ["all_time", "all_time"]].map(function (x) {
            return [t(x[1]), h("span", { class: f.cls(per[x[0]]) }, f.signedUsd(per[x[0]]))];
          })),
          h("p.subtle.xs", t("periods_note", { tz: m.timezone }))
        )),
        h("div.metrics",
          h("div.metric.static", h("span.m-label", t("unrealized_open_trades")), h("span", { class: "m-value num " + f.cls(m.unrealized_pnl_usd) }, f.signedUsd(m.unrealized_pnl_usd)), h("span.m-sub", t("open_trades_count", { n: f.int(m.open_trades) }))),
          h("div.metric.static", h("span.m-label", t("fees_paid")), h("span.m-value.num", f.usd(m.fees_total_usd)), h("span.m-sub", t("closed_trades_count", { n: f.int(m.closed_trades) })))
        )
      ];
      var trades = tradesRes.data;
      nodes.push(card(t("trade_records"), trades.length ? h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, trades.map(tradeRow)) : OX.stateView({ icon: "chart-candlestick", title: t("empty_trades_title"), body: t("empty_trades_body") }), h("a.card-link", { href: "#/trades" }, t("trade_history"), icon("chevron-right", "icon-sm"))));
      nodes.push(card(t("how_calculated"), h("div.stack-sm", h("p.small.muted", m.definitions ? t("def_trading_periods") : ""), h("p.small.muted", t("def_trading_unrealized")), h("p.formula", t("formula_trade")))));
      nodes.push(h("div.banner.info", icon("info", "icon-sm"), h("span", t("no_execution_note"))));
      return nodes;
    }
    var loadAll = function () { return Promise.all([api.get("/api/trading/monitor"), api.get("/api/trades", { per_page: 8 }), api.get("/api/dashboard")]); };
    OX.load(body, loadAll, function (rs) { return render(rs[0], rs[1], rs[2]); }, "tiles");
    OX.poll(function () { loadAll().then(function (rs) { OX.clear(body); OX.append(body, render(rs[0], rs[1], rs[2])); }).catch(function () {}); }, 60000);
  });

  function tradeRow(tr) {
    var open = tr.status === "open";
    var pnl = open ? tr.unrealized_pnl_usd : tr.realized_pnl_usd;
    return h("li", h("button", { class: "list-item", type: "button", onclick: function () { tradeDetail(tr); } },
      h("span", { class: "tx-icon " + (tr.direction === "short" ? "loss" : "gain") }, icon(tr.direction === "short" ? "trending-down" : "trending-up")),
      h("div.li-main", h("span.li-title", tr.symbol + " · " + t("dir_" + tr.direction)), h("span.li-sub.num", f.qty(tr.quantity) + " @ " + f.price(tr.entry_price, tr.price_decimals) + (tr.exit_price ? " → " + f.price(tr.exit_price, tr.price_decimals) : "") + " · " + f.date(tr.closed_at || tr.opened_at))),
      h("div.li-end", h("span", { class: "li-title num " + f.cls(pnl) }, pnl === null ? "—" : f.signedUsd(pnl)), h("span.li-sub", open ? t("unrealized") : tr.status === "reversed" ? t("status_reversed") : t("realized")))));
  }
  function tradeDetail(tr) {
    OX.sheet({ title: t("trade_details"), content: h("div.stack",
      h("div.row", OX.statusChip(tr.status), h("span.chip", t("type_" + tr.trade_type)), h("span.chip", t("dir_" + tr.direction))),
      kv([
        [t("asset"), tr.symbol + " · " + tr.asset_name],
        [t("quantity"), f.qty(tr.quantity)],
        [t("entry_price"), f.price(tr.entry_price, tr.price_decimals)],
        [t("exit_price"), tr.exit_price ? f.price(tr.exit_price, tr.price_decimals) : "—"],
        tr.status === "open" ? [t("current_price"), f.price(tr.current_price, tr.price_decimals)] : null,
        [t("fees"), f.usd(tr.fee_usd)],
        tr.gross_pnl_usd !== null ? [t("gross_pnl"), h("span", { class: f.cls(tr.gross_pnl_usd) }, f.signedUsd(tr.gross_pnl_usd))] : null,
        tr.realized_pnl_usd !== null ? [t("realized_pnl"), h("span", { class: f.cls(tr.realized_pnl_usd) }, f.signedUsd(tr.realized_pnl_usd))] : null,
        tr.status === "open" ? [t("unrealized_pnl"), h("span", { class: f.cls(tr.unrealized_pnl_usd) }, f.signedUsd(tr.unrealized_pnl_usd))] : null,
        [t("opened_at"), f.dateTime(tr.opened_at)],
        tr.closed_at ? [t("closed_at"), f.dateTime(tr.closed_at)] : null,
        tr.reference ? [t("reference"), tr.reference] : null,
        tr.notes ? [t("notes"), tr.notes] : null
      ]),
      h("p.subtle.xs", t("times_in_tz", { tz: f.tzLabel() })))
    });
  }

  OX.route("/trades", function () {
    var main = shell(t("trade_history"), { back: true, backTo: "/trading" });
    var status = h("select", { "aria-label": t("status") }, [["", t("all_statuses")], ["open", t("status_open")], ["closed", t("status_closed")], ["reversed", t("status_reversed")]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    var from = h("input", { type: "date", "aria-label": t("from_date") }), to = h("input", { type: "date", "aria-label": t("to_date") });
    var list = OX.pagedList({
      fetch: function (page, fl) { return api.get("/api/trades", Object.assign({ page: page, per_page: 20 }, fl)); },
      render: function (rows) { return h("section.card.flush", h("ul.list", rows.map(tradeRow))); },
      empty: { icon: "chart-candlestick", title: t("empty_trades_title"), body: t("empty_trades_body") }
    });
    status.onchange = function () { list.setFilter("status", status.value); };
    from.onchange = function () { list.setFilter("from", from.value); };
    to.onchange = function () { list.setFilter("to", to.value); };
    main.appendChild(h("div.toolbar", status, from, to));
    main.appendChild(list);
  });

  /* ------------------------------------------------------------------ P/L details */
  OX.route("/pnl", function () {
    var main = shell(t("pnl_title"), { back: true, backTo: "/home" });
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return Promise.all([api.get("/api/dashboard"), api.get("/api/trading/monitor")]); }, function (rs) {
      var d = rs[0].data, m = rs[1].data;
      return [
        h("div.metrics",
          h("div.metric.static", h("span.m-label", t("todays_profit")), h("span", { class: "m-value num " + f.cls(d.todays_profit_usd) }, f.signedUsd(d.todays_profit_usd)), h("span.m-sub", t("realized_today"))),
          h("div.metric.static", h("span.m-label", t("realized_all_time")), h("span", { class: "m-value num " + f.cls(d.realized_pnl_all_time_usd) }, f.signedUsd(d.realized_pnl_all_time_usd)), h("span.m-sub", t("after_fees"))),
          h("div.metric.static", h("span.m-label", t("unrealized_pnl")), h("span", { class: "m-value num " + f.cls(d.unrealized_pnl_usd) }, f.signedUsd(d.unrealized_pnl_usd)), h("span.m-sub", t("not_realized_yet"))),
          h("div.metric.static", h("span.m-label", t("loss_balance")), h("span", { class: "m-value num " + (Number(d.loss_balance_usd) ? "loss" : "") }, f.usd(d.loss_balance_usd)), h("span.m-sub", t("realized_losses_all_time")))
        ),
        card(t("unrealized_by_asset"), d.holdings.filter(function (x) { return +x.quantity > 0; }).length ? kv(d.holdings.filter(function (x) { return +x.quantity > 0; }).map(function (x) {
          return [x.symbol, h("span", { class: f.cls(x.unrealized_pnl_usd) }, f.signedUsd(x.unrealized_pnl_usd) + " (" + f.pct(x.return_pct, true) + ")")];
        })) : h("p.muted.small", t("empty_holdings_body"))),
        card(t("realized_trading_pnl"), kv([["today", "todays_profit"], ["last_7_days", "last_7_days"], ["last_30_days", "last_30_days"], ["all_time", "all_time"]].map(function (x) { return [t(x[1]), h("span", { class: f.cls(m.periods[x[0]]) }, f.signedUsd(m.periods[x[0]]))]; }))),
        card(t("definitions"), h("div.stack-sm", [t("def_realized"), t("def_unrealized"), t("def_todays_profit"), t("def_loss_balance"), t("def_salary_separate")].map(function (x) { return h("p.small.muted", x); }), h("p.formula", t("formula_example_sol"))))
      ];
    }, "tiles");
  });

  /* ------------------------------------------------------------------ activity / transactions */
  OX.route("/activity", function (p, q) {
    var main = shell(t("activity_title"));
    var tabs = h("div.segmented", { role: "tablist" },
      h("button", { type: "button", role: "tab", "aria-selected": "true" }, t("transactions")),
      h("button", { type: "button", role: "tab", "aria-selected": "false", onclick: function () { OX.go("/trades"); } }, t("trades")));
    var search = h("input", { type: "search", placeholder: t("search_placeholder"), "aria-label": t("search") });
    var types = ["", "deposit", "withdrawal", "transfer", "investment_buy", "investment_sale", "trade_close", "loan_disbursement", "loan_repayment", "loan_charge", "salary_payment", "adjustment", "reversal"];
    var type = h("select", { "aria-label": t("type") }, types.map(function (x) { return h("option", { value: x, text: x ? t("tx_" + x) : t("all_types") }); }));
    var assetSel = h("select", { "aria-label": t("asset") }, h("option", { value: "", text: t("all_assets") }));
    var from = h("input", { type: "date", "aria-label": t("from_date") }), to = h("input", { type: "date", "aria-label": t("to_date") });
    api.get("/api/assets").then(function (r) { r.data.forEach(function (a) { assetSel.appendChild(h("option", { value: a.symbol, text: a.symbol })); }); }).catch(function () {});
    var list = OX.pagedList({
      filters: { type: q.type || "" },
      fetch: function (page, fl) { return api.get("/api/transactions", Object.assign({ page: page, per_page: 20 }, fl)); },
      render: function (rows) { return h("section.card.flush", h("ul.list", rows.map(txRow))); },
      empty: { icon: "receipt", title: t("empty_tx_title"), body: t("empty_tx_body") }
    });
    if (q.type) type.value = q.type;
    search.addEventListener("input", OX.debounce(function () { list.setFilter("q", search.value.trim()); }, 350));
    type.onchange = function () { list.setFilter("type", type.value); };
    assetSel.onchange = function () { list.setFilter("asset", assetSel.value); };
    from.onchange = function () { list.setFilter("from", from.value); };
    to.onchange = function () { list.setFilter("to", to.value); };
    var exportBtn = h("button", { class: "btn btn-outline btn-sm", type: "button", onclick: function () { OX.download("/api/transactions/export", list.filters(), "oryzenx-transactions.csv"); } }, icon("download", "icon-sm"), t("export_csv"));
    main.appendChild(h("div.row-between.wrap", { style: { marginBottom: "var(--s-4)" } }, tabs, exportBtn));
    main.appendChild(h("div.toolbar", h("div.search", icon("search"), search), type, assetSel, from, to));
    main.appendChild(list);
  });

  /* ------------------------------------------------------------------ loans */
  OX.route("/loans", function () {
    var main = shell(t("loans_title"), { back: true, backTo: "/more" });
    main.appendChild(h("div.banner.info", { style: { marginBottom: "var(--s-4)" } }, icon("info", "icon-sm"), h("span", t("loans_note"))));
    main.appendChild(OX.pagedList({
      fetch: function (page) { return api.get("/api/loans", { page: page }); },
      render: function (rows) {
        return h("section.card.flush", h("ul.list", rows.map(function (l) {
          var coin = l.denomination === "COIN";
          return h("li", h("a", { class: "list-item", href: "#/loans/" + l.id },
            h("span.tx-icon.primary", icon("landmark")),
            h("div.li-main", h("span.li-title", (coin ? l.symbol + " " + t("coin_loan") : t("usd_loan")) + " #" + l.id), h("span.li-sub", f.date(l.loan_date) + " · " + (coin ? f.qty(l.outstanding_quantity) + " " + l.symbol + " " + t("outstanding_lc") : f.usd(l.outstanding_usd) + " " + t("outstanding_lc")))),
            h("div.li-end", h("span.li-title.num", f.usd(l.current_liability_usd)), l.status !== "active" ? OX.statusChip(l.status) : (l.price_stale && coin ? h("span.chip.warn", t("stale")) : h("span.li-sub", t("current_value")))),
            icon("chevron-right", "chev")));
        })));
      },
      empty: { icon: "landmark", title: t("empty_loans_title"), body: t("empty_loans_body") }
    }));
  });

  OX.route("/loans/:id", function (p) {
    var main = shell(t("loan_details"), { back: true, backTo: "/loans" });
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return api.get("/api/loans/" + p.id); }, function (r) {
      var l = r.data, coin = l.denomination === "COIN";
      return [
        h("section.card", h("div.stack-sm",
          h("div.row-between", h("span.muted.small", t("current_liability")), OX.statusChip(l.status)),
          h("div.num", { style: { fontSize: "var(--fs-3xl)", fontWeight: 700 } }, f.usd(l.current_liability_usd)),
          coin ? priceAge({ updated_at: l.price_updated_at, stale: l.price_stale }) : null)),
        card(t("loan_summary"), kv([
          [t("loan_type"), coin ? t("coin_loan") + " (" + l.symbol + ")" : t("usd_loan")],
          [t("loan_date"), f.date(l.loan_date)],
          coin ? [t("borrowed_quantity"), f.qty(l.principal_quantity) + " " + l.symbol] : null,
          coin ? [t("origination_price"), f.price(l.origination_price)] : null,
          [t("original_principal"), f.usd(l.principal_usd)],
          coin ? [t("outstanding_quantity"), f.qty(l.outstanding_quantity) + " " + l.symbol] : [t("outstanding_amount"), f.usd(l.outstanding_usd)],
          coin ? [t("current_price"), f.price(l.current_price)] : null,
          [t("current_liability"), f.usd(l.current_liability_usd)],
          [t("repaid_total"), f.usd(l.repaid_usd)],
          +l.charges_usd ? [t("fees_interest"), f.usd(l.charges_usd)] : null,
          l.interest_rate_pct ? [t("interest_rate"), f.pct(l.interest_rate_pct)] : null,
          l.due_date ? [t("due_date"), f.date(l.due_date)] : null,
          [t("last_updated"), f.dateTime(l.updated_at)]
        ])),
        coin ? h("p.formula", t("formula_coin_loan", { qty: f.qty(l.outstanding_quantity), sym: l.symbol, price: f.price(l.current_price), value: f.usd(l.current_liability_usd) })) : null,
        card(t("loan_history"), l.events.length ? h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, l.events.map(function (e) {
          var charge = e.kind === "charge";
          return h("li", h("div.list-item", h("span", { class: "tx-icon " + (charge ? "loss" : "gain") }, icon(charge ? "percent" : "hand-coins")),
            h("div.li-main", h("span.li-title", charge ? t("charge_" + e.charge_type) : t("repayment")), h("span.li-sub", f.dateTime(e.paid_at) + (e.quantity ? " · " + f.qty(e.quantity) + " " + l.symbol : ""))),
            h("div.li-end", h("span.li-title.num", f.usd(e.amount_usd)), e.status !== "completed" ? OX.statusChip(e.status) : (+e.realized_pnl_usd && !charge ? h("span", { class: "li-sub " + f.cls(e.realized_pnl_usd) }, f.signedUsd(e.realized_pnl_usd)) : null))));
        })) : h("p.muted.small", t("no_loan_events"))),
        h("div.banner.info", icon("info", "icon-sm"), h("span", t("loan_equity_note")))
      ];
    });
  });

  /* ------------------------------------------------------------------ salary & payment details */
  OX.route("/salary", function () {
    var main = shell(t("salary_title"), { back: true, backTo: "/more" });
    var body = h("div.stack");
    main.appendChild(body);
    var methods = [];
    function reload() {
      OX.load(body, function () { return Promise.all([api.get("/api/salary"), api.get("/api/payment-methods")]); }, function (rs) {
        var d = rs[0].data; methods = rs[1].data;
        var nodes = [];
        var sc = d.schedule;
        nodes.push(card(t("salary_schedule"), sc ? kv([
          [t("salary_amount"), f.num(sc.amount, 2) + " " + sc.currency],
          [t("payment_day"), t("day_of_month", { day: f.int(sc.pay_day) })],
          [t("period"), t("monthly")],
          [t("payment_method"), sc.payment_method_name || t("not_set")],
          [t("status"), sc.is_active ? t("status_active") : t("inactive")]
        ]) : OX.stateView({ icon: "calendar", title: t("no_schedule_title"), body: t("no_schedule_body") })));
        nodes.push(card(t("payment_details"), paymentDetails(d.payment_details), h("button", { class: "btn btn-outline btn-sm", type: "button", onclick: function () { paymentForm(); } }, icon("plus", "icon-sm"), t("add"))));
        var recs = d.records;
        nodes.push(card(t("monthly_history"), recs.length ? h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, recs.map(function (r) {
          return h("li", h("button", { class: "list-item", type: "button", onclick: function () { salaryDetail(r); } },
            h("span", { class: "tx-icon " + (r.status === "paid" ? "gain" : r.status === "rejected" ? "loss" : "") }, icon("wallet")),
            h("div.li-main", h("span.li-title", r.period), h("span.li-sub", t("expected") + " " + f.num(r.expected_amount, 2) + " " + r.currency + (r.payment_date ? " · " + f.date(r.payment_date) : ""))),
            h("div.li-end", h("span.li-title.num", r.actual_amount ? f.num(r.actual_amount, 2) + " " + r.currency : "—"), OX.statusChip(r.status))));
        })) : OX.stateView({ icon: "calendar", title: t("no_salary_records_title"), body: t("no_salary_records_body") })));
        nodes.push(h("div.banner.info", icon("info", "icon-sm"), h("span", t("salary_separate_note"))));
        // First visit: ask for payment details when a schedule exists and none are saved yet
        if (sc && !d.payment_details.length && !sessionStorage.getItem("oryx-pd-asked")) {
          sessionStorage.setItem("oryx-pd-asked", "1");
          setTimeout(function () { paymentForm(true); }, 300);
        }
        return nodes;
      });
    }
    function salaryDetail(r) {
      OX.sheet({ title: t("salary_for", { period: r.period }), content: kv([
        [t("period"), r.period], [t("expected_amount"), f.num(r.expected_amount, 2) + " " + r.currency],
        [t("actual_amount"), r.actual_amount ? f.num(r.actual_amount, 2) + " " + r.currency : "—"],
        [t("due_date"), f.date(r.due_date)], [t("payment_date"), r.payment_date ? f.date(r.payment_date) : "—"],
        [t("payment_method"), r.payment_method_name || "—"], [t("reference"), r.reference || "—"], [t("status"), OX.statusChip(r.status)]
      ]) });
    }
    function paymentDetails(list) {
      if (!list.length) return h("p.muted.small", t("no_payment_details"));
      return h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, list.map(function (pd) {
        var summary = Object.keys(pd.details_masked || {}).map(function (k) { return pd.details_masked[k]; }).join(" · ");
        return h("li", h("div.list-item",
          pd.logo_url ? h("span.coin-logo", { style: { background: "#fff", border: "1px solid var(--border)" } }, h("img", { src: pd.logo_url, alt: "" })) : h("span.tx-icon", icon("wallet")),
          h("div.li-main", h("span.li-title", pd.name + (+pd.is_primary ? "" : "")), h("span.li-sub", summary)),
          +pd.is_primary ? h("span.chip.primary", t("primary")) : h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: function () { api.post("/api/payment-details/" + pd.payment_method_id + "/primary").then(function () { OX.toast(t("saved")); reload(); }).catch(function (e) { OX.toast(OX.serverMsg(e.message), "err"); }); } }, t("make_primary")),
          h("button", { class: "icon-btn", type: "button", "aria-label": t("edit") + " " + pd.name, onclick: function () { paymentForm(false, pd.payment_method_id); } }, icon("pencil", "icon-sm")),
          h("button", { class: "icon-btn", type: "button", "aria-label": t("remove") + " " + pd.name, onclick: function () {
            OX.confirm({ title: t("remove_payment_title"), message: t("remove_payment_body", { name: pd.name }), danger: true, confirmText: t("remove") }).then(function (ok) {
              if (ok) api.del("/api/payment-details/" + pd.payment_method_id).then(function () { OX.toast(t("removed")); reload(); }).catch(function (e) { OX.toast(OX.serverMsg(e.message), "err"); });
            });
          } }, icon("trash-2", "icon-sm"))));
      }));
    }
    function paymentForm(firstTime, methodId) {
      var v = S.user.verification;
      if (v.identity_required && v.identity_status !== "approved") {
        OX.sheet({ title: t("payment_details"), content: [h("div.banner.warn", icon("shield", "icon-sm"), h("span", t("identity_required_payment"))), h("a", { class: "btn btn-primary btn-block", href: "#/verification" }, t("complete_verification"))] });
        return;
      }
      if (!methods.length) { OX.toast(t("no_methods_enabled"), "err"); return; }
      var holder = h("div");
      var sel = h("select", { id: "pm-select", "aria-label": t("payment_method") }, methods.map(function (m) { return h("option", { value: m.id, text: m.name }); }));
      if (methodId) sel.value = methodId;
      var s = OX.sheet({ title: firstTime ? t("add_payment_first") : t("payment_details"), content: [
        firstTime ? h("p.muted.small", t("add_payment_first_body")) : null,
        h("div.field", h("label", { for: "pm-select" }, t("payment_method")), sel),
        holder
      ] });
      function build() {
        var m = methods.find(function (x) { return String(x.id) === sel.value; });
        var fields = m.fields.map(function (fd) {
          return { name: fd.key, label: fd.label, type: fd.type === "select" ? "select" : "text", required: !!fd.required, options: (fd.options || []).map(function (o) { return [o, o]; }), placeholder: fd.type === "select" ? t("select") : undefined, pattern: fd.pattern ? fd.pattern.replace(/^\^|\$$/g, "") : undefined, error: t("field_invalid") };
        });
        var form = OX.form(fields, { submitText: t("save"), onSubmit: function (vals) {
          return api.post("/api/payment-details", { payment_method_id: +m.id, details: vals }).then(function () { OX.toast(t("payment_saved")); s.close(); reload(); });
        } });
        OX.clear(holder).appendChild(h("div.stack", m.instructions ? h("p.subtle.small", m.instructions) : null, form, h("p.subtle.xs", t("payment_security_note"))));
      }
      sel.onchange = build;
      build();
    }
    reload();
  });

  /* ------------------------------------------------------------------ notifications */
  function refreshUnread() {
    api.get("/api/notifications", { per_page: 1 }).then(function (r) {
      var was = S.unread; S.unread = r.meta.unread;
      if (was !== S.unread) { var dot = document.querySelector('.bottom-nav a[href="#/more"]'); if (dot) { var d = dot.querySelector(".badge-dot"); if (S.unread && !d) dot.appendChild(h("span.badge-dot", { "aria-hidden": "true" })); if (!S.unread && d) d.remove(); } }
    }).catch(function () {});
  }
  OX.route("/notifications", function () {
    var main = shell(t("notifications"), { back: true, actions: h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: function () { api.post("/api/notifications/read").then(function () { S.unread = 0; list.reload(); }); } }, t("mark_all_read")) });
    var list = OX.pagedList({
      fetch: function (page) { return api.get("/api/notifications", { page: page }); },
      render: function (rows) {
        return h("section.card.flush", h("ul.list", rows.map(function (n) {
          var ic = { realized_profit: ["trending-up", "gain"], realized_loss: ["trending-down", "loss"], trade_recorded: ["chart-candlestick", "primary"], salary_status: ["wallet", ""], loan_status: ["landmark", ""], verification_decision: ["badge-check", "primary"], security: ["shield", "loss"], portfolio_threshold: ["activity", ""], reminder: ["bell", ""] }[n.type] || ["bell", ""];
          var item = h("button", { class: "list-item", type: "button", style: { alignItems: "flex-start" }, onclick: function () {
            if (!n.read_at) api.post("/api/notifications/read", { id: n.id }).then(function () { n.read_at = "now"; item.style.opacity = "0.72"; refreshUnread(); });
            OX.sheet({ title: n.title, content: [h("p", n.body), h("p.subtle.xs", f.dateTime(n.created_at))] });
          } },
            h("span", { class: "tx-icon " + ic[1] }, icon(ic[0])),
            h("div.li-main", h("span.li-title", { style: { whiteSpace: "normal" } }, n.title), h("span.li-sub", { style: { whiteSpace: "normal" } }, n.body), h("span.li-sub", f.ago(n.created_at))),
            !n.read_at ? h("span.status-dot.error", { "aria-label": t("unread") }) : null);
          if (n.read_at) item.style.opacity = "0.72";
          return h("li", item);
        })));
      },
      empty: { icon: "bell", title: t("empty_notifications_title"), body: t("empty_notifications_body") }
    });
    main.appendChild(list);
  });

  /* ------------------------------------------------------------------ more / settings */
  OX.route("/more", function () {
    var main = shell(t("more_title"));
    var u = S.user;
    var initials = (u.full_name || "?").split(/\s+/).map(function (x) { return x[0]; }).slice(0, 2).join("").toUpperCase();
    var avatar = h("span.avatar.lg", u.avatar_url ? h("img", { src: OX.boot.base + "/api/me/avatar?v=" + Date.now(), alt: "" }) : initials);
    main.appendChild(h("a", { class: "card profile-card", href: "#/profile", style: { color: "inherit", textDecoration: "none" } }, avatar,
      h("div.grow", h("strong", u.full_name), h("div.subtle.small.truncate", u.email), h("div", { style: { marginTop: "6px" } }, verificationChip())), icon("chevron-right", "chev")));
    function group(title, items) {
      return [h("h2.section-title", title), h("nav.menu-group", h("ul.list", items.map(function (it) {
        return h("li", it[2] ? h("button", { class: "list-item", type: "button", onclick: it[2] }, icon(it[0]), h("span.grow", it[1]), icon("chevron-right", "chev")) :
          h("a", { class: "list-item", href: "#" + it[3] }, icon(it[0]), h("span.grow", it[1]), it[4] || null, icon("chevron-right", "chev")));
      })))];
    }
    main.appendChild(h("div", group(t("account"), [
      ["badge-check", t("verification_status"), null, "/verification"],
      ["wallet", t("salary_payments"), null, "/salary"],
      ["landmark", t("loans_title"), null, "/loans"],
      ["chart-line", t("markets"), null, "/markets"],
      ["bell", t("notifications"), null, "/notifications", S.unread ? h("span.chip.loss", f.int(S.unread)) : null]
    ])));
    main.appendChild(h("div", group(t("settings"), [
      ["shield", t("security_settings"), null, "/security"],
      ["sliders-horizontal", t("notification_settings"), null, "/settings/notifications"],
      ["languages", t("language"), null, "/settings/language", h("span.subtle.small", OX.locale === "bn" ? "বাংলা" : "English")],
      ["palette", t("appearance"), null, "/settings/appearance", h("span.subtle.small", t("theme_" + OX.theme.get()))]
    ])));
    main.appendChild(h("div", group(t("support_legal"), [
      ["life-buoy", t("help_support"), null, "/help"],
      ["file-text", t("legal_documents"), null, "/legal"]
    ])));
    main.appendChild(h("div", { style: { marginTop: "var(--s-6)" } }, h("button", { class: "btn btn-outline btn-block", type: "button", onclick: function () {
      OX.confirm({ title: t("sign_out"), message: t("sign_out_confirm"), confirmText: t("sign_out") }).then(function (ok) { if (ok) logout(); });
    } }, icon("log-out", "icon-sm"), t("sign_out"))));
    main.appendChild(h("p.subtle.xs", { style: { textAlign: "center", marginTop: "var(--s-4)" } }, "OryzenX · " + t("monitoring_disclaimer")));
  });
  function verificationChip() {
    var v = S.user.verification;
    if (v.fully_verified) return h("span.chip.gain", icon("badge-check"), t("verified"));
    if (v.identity_status === "pending") return h("span.chip.warn", icon("hourglass"), t("under_review"));
    return h("span.chip.warn", icon("shield"), t("verification_incomplete"));
  }

  OX.route("/profile", function () {
    var main = shell(t("profile_title"), { back: true, backTo: "/more" });
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return api.get("/api/me/profile"); }, function (r) {
      var u = r.data.user, p = r.data.profile || {};
      var fileIn = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr-only", id: "avatar-in" });
      var initials = (u.full_name || "?").split(/\s+/).map(function (x) { return x[0]; }).slice(0, 2).join("").toUpperCase();
      var av = h("span.avatar.lg", u.avatar_url ? h("img", { src: OX.boot.base + "/api/me/avatar?v=" + Date.now(), alt: t("profile_photo") }) : initials);
      fileIn.onchange = function () {
        if (!fileIn.files[0]) return;
        var fd = new FormData(); fd.append("avatar", fileIn.files[0]);
        api.post("/api/me/avatar", fd).then(function (res) { OX.toast(t("photo_updated_size", { kb: f.int(Math.round(res.data.bytes / 1024)) })); S.user.avatar_url = res.data.avatar_url; OX.dispatchRoute(); }).catch(function (e) { OX.toast(OX.serverMsg(e.message), "err"); });
      };
      var form = OX.form([
        { name: "full_name", label: t("full_name"), required: true, value: u.full_name, autocomplete: "name", minlength: 2, maxlength: 120, error: t("v_name") },
        { name: "email_ro", label: t("email"), value: u.email, type: "email", optionalText: false },
        { name: "phone", label: t("phone"), type: "tel", value: u.phone || "", autocomplete: "tel", pattern: "\\+?[0-9 ()-]{6,20}", error: t("v_phone") },
        { name: "address_line", label: t("address"), value: p.address_line || "", autocomplete: "street-address" },
        { name: "city", label: t("city"), value: p.city || "" },
        { name: "country", label: t("country"), value: p.country || "" },
        { name: "postal_code", label: t("postal_code"), value: p.postal_code || "" }
      ], { submitText: t("save_changes"), onSubmit: function (v) {
        delete v.email_ro;
        return api.put("/api/me/profile", v).then(function (res) { S.user = res.data.user; OX.toast(t("saved")); });
      } });
      var emailInput = form.querySelector('[name="email_ro"]'); emailInput.readOnly = true; emailInput.setAttribute("aria-readonly", "true");
      return [
        h("section.card.profile-card", av, h("div.grow", h("strong", u.full_name), h("div.subtle.small", t("member_since", { date: f.date(u.created_at) }))),
          h("label", { class: "btn btn-outline btn-sm", for: "avatar-in" }, icon("upload", "icon-sm"), t("change_photo")), fileIn),
        card(t("personal_details"), form)
      ];
    });
  });

  OX.route("/verification", function () {
    var main = shell(t("verification_status"), { back: true, backTo: "/more" });
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return api.get("/api/verification"); }, function (r) {
      var v = r.data;
      var step = function (done, title, desc, state) {
        return h("li", h("div.list-item", h("span", { class: "tx-icon " + (done ? "gain" : state === "rejected" ? "loss" : "") }, icon(done ? "circle-check-big" : state === "pending" ? "hourglass" : state === "rejected" ? "circle-x" : "circle-alert")),
          h("div.li-main", h("span.li-title", title), h("span.li-sub", { style: { whiteSpace: "normal" } }, desc))));
      };
      var nodes = [card(t("verification_steps"), h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } },
        step(v.email_verified, t("step_email"), v.email_verified ? t("email_verified_on", { date: f.date(v.email_verified_at) }) : t("step_email_todo")),
        v.identity_required ? step(v.identity_status === "approved", t("step_identity"), t("identity_" + v.identity_status), v.identity_status) : null))];
      if (v.latest_submission && v.latest_submission.status === "rejected" && v.latest_submission.user_message) {
        nodes.push(h("div.banner.err", icon("circle-x", "icon-sm"), h("span", t("rejected_reason") + ": " + v.latest_submission.user_message)));
      }
      if (v.identity_required && (v.identity_status === "not_submitted" || v.identity_status === "rejected")) {
        var form = OX.form([
          { name: "document_type", label: t("document_type"), type: "select", required: true, placeholder: t("select"), options: [["national_id", t("doc_national_id")], ["passport", t("doc_passport")], ["driving_license", t("doc_driving_license")]] },
          { name: "document_number", label: t("document_number"), required: true, pattern: "[A-Za-z0-9 -]{5,40}", error: t("v_document_number") },
          { name: "front", label: t("document_front"), type: "file", required: true, accept: "image/jpeg,image/png,image/webp", hint: t("document_hint") },
          { name: "back", label: t("document_back"), type: "file", accept: "image/jpeg,image/png,image/webp" }
        ], { submitText: t("submit_for_review"), onSubmit: function (vals) {
          var fd = new FormData();
          fd.append("document_type", vals.document_type); fd.append("document_number", vals.document_number);
          if (vals.front) fd.append("front", vals.front);
          if (vals.back) fd.append("back", vals.back);
          return api.post("/api/verification", fd).then(function () { OX.toast(t("submitted_for_review")); S.user.verification.identity_status = "pending"; OX.dispatchRoute(); });
        } });
        nodes.push(card(t("submit_identity"), h("div.stack", h("p.muted.small", t("identity_intro")), form, h("p.subtle.xs", t("identity_privacy")))));
      }
      return nodes;
    });
  });

  OX.route("/security", function () {
    var main = shell(t("security_settings"), { back: true, backTo: "/more" });
    var pw = OX.form(S.user.has_password ? [
      { name: "current_password", label: t("current_password"), type: "password", required: true, autocomplete: "current-password" },
      { name: "password", label: t("new_password"), type: "password", required: true, autocomplete: "new-password", minlength: 10, pattern: "(?=.*[A-Za-z])(?=.*\\d).{10,200}", hint: t("password_rules"), error: t("password_rules") },
      { name: "password_confirmation", label: t("confirm_password"), type: "password", required: true, autocomplete: "new-password", error: t("v_password_match") }
    ] : [
      { name: "password", label: t("new_password"), type: "password", required: true, autocomplete: "new-password", minlength: 10, pattern: "(?=.*[A-Za-z])(?=.*\\d).{10,200}", hint: t("password_rules"), error: t("password_rules") },
      { name: "password_confirmation", label: t("confirm_password"), type: "password", required: true, autocomplete: "new-password", error: t("v_password_match") }
    ], { submitText: t("update_password"), onSubmit: function (v, form) {
      if (v.password !== v.password_confirmation) { form.setErrors({ fields: { password_confirmation: t("v_password_match") } }); return Promise.resolve(); }
      return api.post("/api/me/password", v).then(function () { OX.toast(t("password_updated")); form.reset(); sessions.reload && loadSessions(); });
    } });
    main.appendChild(card(S.user.has_password ? t("change_password") : t("set_password"), pw));
    var sessions = h("div");
    main.appendChild(h("div", { style: { height: "var(--s-4)" } }));
    main.appendChild(card(t("active_sessions"), sessions, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: function () {
      OX.confirm({ title: t("sign_out_others"), message: t("sign_out_others_body"), confirmText: t("sign_out_others") }).then(function (ok) { if (ok) api.post("/api/me/sessions/revoke-others").then(function (r) { OX.toast(t("sessions_revoked", { n: f.int(r.data.revoked) })); loadSessions(); }); });
    } }, t("sign_out_others"))));
    var history = h("div");
    main.appendChild(h("div", { style: { height: "var(--s-4)" } }));
    main.appendChild(card(t("login_history"), history));
    function device(ua) { if (!ua) return t("unknown_device"); var m = ua.match(/(Android|iPhone|iPad|Windows|Mac OS X|Linux)/); var b = ua.match(/(Edg|Chrome|Firefox|Safari|OryzenX)/); return (b ? b[1].replace("Edg", "Edge") : t("browser")) + " · " + (m ? m[1].replace("Mac OS X", "macOS") : t("unknown_os")); }
    function loadSessions() {
      OX.load(sessions, function () { return api.get("/api/me/sessions"); }, function (r) {
        OX.clear(history).appendChild(h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, r.data.logins.map(function (l) {
          return h("li", h("div.list-item", h("span", { class: "tx-icon " + (+l.success ? (+l.suspicious ? "loss" : "") : "loss") }, icon(+l.success ? (+l.suspicious ? "triangle-alert" : "log-out") : "circle-x")),
            h("div.li-main", h("span.li-title", +l.success ? t("login_success") + (l.method === "google" ? " · Google" : "") : t("login_failed")), h("span.li-sub", f.dateTime(l.created_at) + " · " + (l.ip || "") + " · " + device(l.user_agent))),
            +l.suspicious ? h("span.chip.loss", t("new_device")) : null));
        })));
        return h("ul.list", { style: { margin: "0 calc(-1 * var(--s-5))" } }, r.data.sessions.map(function (s) {
          return h("li", h("div.list-item", h("span.tx-icon", icon(s.kind === "api" ? "smartphone" : "monitor")),
            h("div.li-main", h("span.li-title", (s.device_name || device(s.user_agent))), h("span.li-sub", t("last_active", { time: f.ago(s.last_seen_at) }) + " · " + (s.ip || ""))),
            s.current ? h("span.chip.primary", t("this_device")) : h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: function () { api.del("/api/me/sessions/" + s.id).then(function () { OX.toast(t("session_revoked")); loadSessions(); }); } }, t("sign_out"))));
        }));
      });
    }
    loadSessions();
  });

  OX.route("/settings/language", function () {
    var main = shell(t("language"), { back: true, backTo: "/more" });
    var group = h("div.radio-cards", { role: "radiogroup", "aria-label": t("language") }, [["en", "English", "English"], ["bn", "বাংলা", "Bangla"]].map(function (l) {
      var input = h("input", { type: "radio", name: "lang", value: l[0] });
      input.checked = OX.locale === l[0];
      input.onchange = function () {
        api.put("/api/me/preferences", { locale: l[0] }).catch(function () {}).then(function () { return OX.setLocale(l[0]); }).then(function () { OX.toast(t("language_changed")); OX.dispatchRoute(); });
      };
      return h("label.radio-card", { lang: l[0] }, input, h("span.grow", h("strong", l[1]), h("div.subtle.small", l[2])));
    }));
    main.appendChild(card(null, h("div.stack", h("p.muted.small", t("language_note")), group)));
  });

  OX.route("/settings/appearance", function () {
    var main = shell(t("appearance"), { back: true, backTo: "/more" });
    var sysDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    var group = h("div.radio-cards", { role: "radiogroup", "aria-label": t("appearance") }, [["light", "sun"], ["dark", "moon"], ["system", "monitor"]].map(function (o) {
      var input = h("input", { type: "radio", name: "theme", value: o[0] });
      input.checked = OX.theme.get() === o[0];
      input.onchange = function () { OX.theme.set(o[0]); api.put("/api/me/preferences", { theme: o[0] }).catch(function () {}); };
      return h("label.radio-card", input, icon(o[1]), h("span.grow", h("strong", t("theme_" + o[0])), o[0] === "system" ? h("div.subtle.small", t("system_currently", { mode: t(sysDark ? "theme_dark" : "theme_light") })) : o[0] === "light" ? h("div.subtle.small", t("default")) : null));
    }));
    main.appendChild(card(null, h("div.stack", h("p.muted.small", t("appearance_note")), group)));
  });

  OX.route("/settings/notifications", function () {
    var main = shell(t("notification_settings"), { back: true, backTo: "/more" });
    var body = h("div.stack");
    main.appendChild(body);
    OX.load(body, function () { return api.get("/api/me/notification-preferences"); }, function (r) {
      var p = r.data;
      function sw(key, label, desc, disabled) {
        var input = h("input", { type: "checkbox", role: "switch", "aria-label": label, disabled: !!disabled });
        input.checked = !!+p[key] || !!disabled;
        input.onchange = function () { var o = {}; o[key] = input.checked; api.put("/api/me/notification-preferences", o).then(function () { OX.toast(t("saved")); }).catch(function (e) { input.checked = !input.checked; OX.toast(OX.serverMsg(e.message), "err"); }); };
        return h("div.switch-row", h("div.grow", h("div", { style: { fontWeight: 600 } }, label), desc ? h("div.subtle.small", desc) : null), h("label.switch", input, h("span.track")));
      }
      var thr = h("select", { "aria-label": t("threshold") }, [3, 5, 10, 20].map(function (n) { return h("option", { value: n, text: f.pct(n) }); }));
      thr.value = String(Math.round(+p.threshold_pct));
      thr.onchange = function () { api.put("/api/me/notification-preferences", { threshold_pct: thr.value }).then(function () { OX.toast(t("saved")); }); };
      return [
        card(t("email_notifications"), h("div",
          sw("email_pnl", t("pref_email_pnl"), t("pref_email_pnl_desc")),
          sw("email_trades", t("pref_email_trades")),
          sw("email_salary", t("pref_email_salary")),
          sw("email_loans", t("pref_email_loans")),
          sw("email_portfolio_threshold", t("pref_email_threshold"), t("pref_email_threshold_desc")),
          h("div.switch-row", h("span.grow.small.muted", t("threshold")), thr),
          sw("email_reminders", t("pref_email_reminders"), t("pref_email_reminders_desc")),
          sw("security_always", t("pref_security"), t("pref_security_desc"), true))),
        card(t("app_notifications"), h("div",
          sw("push_enabled", t("pref_push_enabled"), t("pref_push_desc")),
          sw("push_trades", t("pref_push_trades")),
          sw("push_salary", t("pref_push_salary")),
          sw("push_security", t("pref_push_security"))))
      ];
    });
  });

  OX.route("/help", function () {
    var main = shell(t("help_support"), { back: true, backTo: "/more" });
    var faq = [1, 2, 3, 4, 5].map(function (i) { return h("details.card", { style: { padding: "var(--s-4)" } }, h("summary", { style: { fontWeight: 600, cursor: "pointer" } }, t("faq_q" + i)), h("p.muted.small", { style: { marginTop: "var(--s-2)" } }, t("faq_a" + i))); });
    var form = OX.form([
      { name: "subject", label: t("subject"), required: true, minlength: 3, maxlength: 150, error: t("v_subject") },
      { name: "message", label: t("message"), type: "textarea", rows: 5, required: true, minlength: 10, maxlength: 5000, hint: t("message_hint"), error: t("v_message") }
    ], { submitText: t("send_message"), onSubmit: function (v, form) {
      return api.post("/api/support/app", v).then(function (r) { OX.toast(t("support_sent", { ticket: r.data.ticket })); form.reset(); });
    } });
    main.appendChild(h("div.stack",
      h("h2.section-title", t("faq")), h("div.stack-sm", faq),
      card(t("contact_support"), h("div.stack", S.config.support_email ? h("p.small", t("email_us") + " ", h("a", { href: "mailto:" + S.config.support_email }, S.config.support_email)) : null, form))));
  });

  OX.route("/legal", function () {
    var main = shell(t("legal_documents"), { back: true, backTo: "/more" });
    main.appendChild(h("nav.menu-group", h("ul.list", [["privacy", "privacy_policy", "lock"], ["terms", "terms", "file-text"], ["risk", "risk_disclosure", "triangle-alert"]].map(function (d) {
      return h("li", h("a", { class: "list-item", href: OX.boot.base + "/" + d[0] + "?lang=" + OX.locale, target: "_blank", rel: "noopener" }, icon(d[2]), h("span.grow", t(d[1])), icon("external-link", "chev")));
    }))));
    main.appendChild(h("div.banner.warn", { style: { marginTop: "var(--s-4)" } }, icon("triangle-alert", "icon-sm"), h("span", t("risk_short"))));
  });

  OX.notFound = function () {
    var main = shell(t("not_found_title"), { back: true });
    main.appendChild(OX.stateView({ icon: "search", title: t("not_found_title"), body: t("not_found_body"), action: h("a", { class: "btn btn-primary btn-sm", href: "#/home" }, t("go_home")) }));
  };

  /* ------------------------------------------------------------------ boot */
  OX.onUnauthorized = function () {
    S.user = null;
    var cur = OX.current().path;
    if (PUBLIC.indexOf(cur) === -1) { sessionStorage.setItem("oryx-next", cur); OX.go("/login", true); }
  };
  OX.onReauth = function () { return Promise.reject(new OX.ApiError(428, { message: t("reauth_required") })); };

  var guard = OX.dispatchRoute;
  function start() {
    var cur = OX.current().path;
    Promise.all([
      api.get("/api/app/config").then(function (r) { S.config = r.data; OX.boot.timezone = r.data.timezone; }).catch(function () {}),
      api.get("/api/me", null, { noAuthRedirect: true }).then(function (r) { S.user = r.data.user; if (r.data.csrf_token) OX.setCsrf(r.data.csrf_token); }).catch(function () { S.user = null; })
    ]).then(function () {
      window.removeEventListener("hashchange", guard);
      window.addEventListener("hashchange", routeGuard);
      routeGuard();
    });
    function routeGuard() {
      var path = OX.current().path;
      if (!S.user) {
        if (PUBLIC.indexOf(path) === -1) { if (path !== "/" && path !== "/home") sessionStorage.setItem("oryx-next", path); return OX.go("/welcome", true); }
      } else {
        if (!S.user.verification.email_verified && path !== "/verify-email") return OX.go("/verify-email", true);
        if (PUBLIC.indexOf(path) !== -1 && path !== "/reset-password") return OX.go("/home", true);
        if (path === "/" || path === "") return OX.go("/home", true);
      }
      guard();
    }
    void cur;
  }
  // replace the core's direct dispatch with the guarded one
  window.removeEventListener("hashchange", guard);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
