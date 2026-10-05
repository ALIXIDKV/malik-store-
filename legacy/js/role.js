/* MALIK STORE - role UI + status loading (hanya petunjuk tampilan; keamanan sebenarnya di RLS database). Muat di <head>. */
(function () {
  try {
    var d = document.documentElement, ss = sessionStorage, ls = localStorage, s = document.createElement("style");
    s.textContent = "html.mk-admin .mk-hide-admin{display:none!important}html.mk-admin .mk-admin-note{display:block!important}html.mk-noload #malik-loader{display:none!important}";
    document.head.appendChild(s);
    // Role: sessionStorage; tab baru -> pakai petunjuk role terakhir milik user yang sama (mencegah tombol order sempat tampil untuk admin).
    var role = ss.getItem("malik_role");
    if (!role) {
      var uid = null, i, k;
      for (i = 0; i < ls.length; i++) { k = ls.key(i); if (/^sb-.*-auth-token$/.test(k)) { try { uid = JSON.parse(ls.getItem(k)).user.id; } catch (e) {} } }
      var h = null; try { h = JSON.parse(ls.getItem("malik_role_hint")); } catch (e) {}
      if (uid && h && h.uid === uid) role = h.role;
    }
    if (role === "admin") d.classList.add("mk-admin");
    // Loading screen: hanya untuk pembukaan pertama di sesi ini. Halaman selain beranda (order, chat, dashboard) menandai sesi sudah terbuka.
    var base = new URL("../", document.currentScript.src).pathname, p = location.pathname;
    if (p !== base && p !== base + "index.html") ss.setItem("malik_loaded", "1");
    if (ss.getItem("malik_loaded")) d.classList.add("mk-noload");
  } catch (e) {}
})();
