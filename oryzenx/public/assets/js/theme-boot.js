/* Loaded synchronously in <head> to apply the saved appearance before first paint (no flash).
   Default is Light. Stored values: "light" | "dark" | "system". */
(function () {
  var pref = "light";
  try { pref = localStorage.getItem("oryx-theme") || "light"; } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-pref", pref);
  var m = document.querySelector('meta[name="color-scheme"]');
  if (m) m.content = dark ? "dark" : "light";
})();
