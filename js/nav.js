/*
 * MALIK STORE - BOTTOM NAV USER (komponen tunggal)
 * Pasang di halaman USER saja (BUKAN di /admin): <script src="…/js/nav.js"></script> setelah js/auth.js.
 * Menu: Beranda (/index.html) • Riwayat & Profil (/account/dashboard/index.html#hist / #prof).
 * Guest menekan Riwayat/Profil -> login dulu, lalu otomatis kembali ke tujuan.
 * Menyediakan variabel CSS --mk-nav-h (tinggi nav) agar halaman bisa memberi ruang di bawah konten.
 */
(function (g) {
  "use strict";
  if (g.MalikNav) return;
  var S = document.currentScript, BASE = new URL("../", S ? S.src : location.href).href;
  var DASH = "account/dashboard/index.html";
  var ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    hist: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    prof: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'
  };
  var ITEMS = [
    { id: "home", label: "Beranda", href: BASE + "index.html", icon: ICON.home },
    { id: "hist", label: "Riwayat", href: BASE + DASH + "#hist", icon: ICON.hist, auth: true },
    { id: "prof", label: "Profil", href: BASE + DASH + "#prof", icon: ICON.prof, auth: true }
  ];

  function activeId() {
    var p = location.pathname;
    if (/\/account\/dashboard\/(index\.html)?$/.test(p)) return location.hash === "#prof" ? "prof" : "hist";
    if (/\/account\/dashboard\//.test(p)) return "prof";           // chat admin = bagian Profil
    return "home";                                                   // / , /index.html , /order/
  }

  var css = document.createElement("style");
  css.textContent =
    ":root{--mk-nav-h:calc(62px + env(safe-area-inset-bottom,0px))}" +
    ".mk-nav{position:fixed;left:0;right:0;bottom:0;z-index:8000;display:flex;justify-content:center;padding:0 8px env(safe-area-inset-bottom,0px);background:rgba(10,18,32,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.09);font-family:Malik,Arial,sans-serif}" +
    ".mk-nav-in{width:100%;max-width:520px;display:flex}" +
    ".mk-nav a{flex:1;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:62px;color:#8b9ab4;text-decoration:none;font-size:11px;-webkit-tap-highlight-color:transparent}" +
    ".mk-nav svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".mk-nav a.on{color:#7ba7ea}.mk-nav a.on svg{filter:drop-shadow(0 0 6px rgba(123,167,234,.7))}" +
    ".mk-nav a.on:before{content:\"\";position:absolute;top:-1px;left:30%;right:30%;height:2px;border-radius:2px;background:linear-gradient(90deg,#7ba7ea,#8ecae6)}";
  document.head.appendChild(css);

  var nav = document.createElement("nav");
  nav.className = "mk-nav"; nav.setAttribute("aria-label", "Menu utama");
  nav.innerHTML = '<div class="mk-nav-in">' + ITEMS.map(function (i) {
    return '<a href="' + i.href + '" data-id="' + i.id + '"' + (i.auth ? ' data-auth="1"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + i.icon + "</svg>" + i.label + "</a>";
  }).join("") + "</div>";

  function mark() {
    var on = activeId();
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      var is = a.dataset.id === on; a.classList.toggle("on", is);
      if (is) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // Riwayat/Profil butuh login: guest -> halaman login, setelah login kembali ke tujuan.
  nav.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-auth]"); if (!a || !g.MalikAuth) return;
    e.preventDefault();
    var u = new URL(a.href);
    MalikAuth.isLoggedIn().then(function (ok) {
      if (ok) { location.href = a.href; return; }
      MalikAuth.setNext(u.pathname + u.hash); location.href = MalikAuth.pages.account;
    });
  });
  g.addEventListener("hashchange", mark);

  function mount() { document.body.appendChild(nav); document.body.classList.add("mk-has-nav"); mark(); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  g.MalikNav = { el: nav, refresh: mark };
})(window);
