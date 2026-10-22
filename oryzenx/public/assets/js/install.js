(function () {
  "use strict";
  var form = document.getElementById("install-form");
  function csrf() { var m = document.cookie.match(/(?:^|; )oryx_csrf=([^;]+)/); return m ? decodeURIComponent(m[1]) : ""; }
  function data() { var o = {}; new FormData(form).forEach(function (v, k) { o[k] = String(v); }); return o; }
  function post(url, body) {
    return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: { message: "Unexpected server response (HTTP " + r.status + ")." } }; }); });
  }
  function msg(err) {
    var m = (err && err.message) || "Request failed.";
    if (err && err.fields) m += " " + Object.keys(err.fields).map(function (k) { return k + ": " + err.fields[k]; }).join(" ");
    return m;
  }
  var base = location.pathname.replace(/\/install\/?$/, "");
  document.getElementById("test-db").addEventListener("click", function () {
    var out = document.getElementById("db-result");
    out.textContent = "Testing…";
    post(base + "/install/test-db", data()).then(function (j) {
      out.textContent = j.ok ? "Connected — " + j.data.version + (j.data.existing_tables ? " (" + j.data.existing_tables + " existing tables)" : " (empty database)") : msg(j.error);
      out.className = j.ok ? "gain" : "loss";
    });
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var btn = document.getElementById("install-btn"), out = document.getElementById("install-result");
    btn.disabled = true; btn.textContent = "Installing…";
    post(base + "/install/run", data()).then(function (j) {
      if (j.ok) {
        out.innerHTML = "";
        var box = document.createElement("div"); box.className = "banner ok";
        var h = document.createElement("strong"); h.textContent = "Installation complete."; box.appendChild(h);
        var ul = document.createElement("ul"); j.data.next_steps.forEach(function (s) { var li = document.createElement("li"); li.textContent = s; ul.appendChild(li); }); box.appendChild(ul);
        var a = document.createElement("a"); a.className = "btn btn-primary"; a.href = j.data.admin_url; a.textContent = "Open the admin panel"; box.appendChild(a);
        out.appendChild(box); btn.remove();
      } else {
        out.innerHTML = ""; var b = document.createElement("div"); b.className = "banner err"; b.textContent = msg(j.error); out.appendChild(b);
        btn.disabled = false; btn.textContent = "Install OryzenX";
      }
    });
  });
})();
