/*
 * MALIK STORE - AUTH (Supabase Authentication + tabel profiles/orders)
 * Semua fungsi async. Pastikan supabase CDN + js/supabase.js dimuat lebih dulu.
 * Sessionstorage hanya dipakai untuk UI state (paket yang sedang dipilih sebelum login).
 */
(function (global) {
  "use strict";
  var BASE = new URL("../", document.currentScript.src).href;
  var PAGES = { home: BASE + "index.html", account: BASE + "account/index.html", order: BASE + "order/index.html" };
  var profileCache = null;

  function sb() { return global.supabaseClient; }
  async function session() {
    if (!sb()) return null;
    var r = await sb().auth.getSession();
    return (r.data && r.data.session) || null;
  }
  async function getUser() { var s = await session(); return s ? s.user : null; }

  function friendly(msg) {
    msg = String(msg || "");
    if (/invalid login credentials/i.test(msg)) return "Email atau password salah.";
    if (/email not confirmed/i.test(msg)) return "Email belum dikonfirmasi. Cek inbox email kamu.";
    if (/already registered/i.test(msg)) return "Email sudah terdaftar. Silakan login.";
    if (/password should be at least/i.test(msg)) return "Password minimal 6 karakter.";
    if (/rate limit|too many/i.test(msg)) return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
    if (/fetch|network/i.test(msg)) return "Koneksi bermasalah. Periksa internet kamu.";
    return msg || "Terjadi kesalahan.";
  }

  var MalikAuth = {
    pages: PAGES,

    isLoggedIn: async function () { return !!(await getUser()); },
    currentUser: getUser,

    // Data profil (tabel profiles): username, email, role, created_at
    profile: async function (force) {
      var u = await getUser(); if (!u) return null;
      if (profileCache && profileCache.id === u.id && !force) return profileCache;
      var r = await sb().from("profiles").select("*").eq("id", u.id).maybeSingle();
      var p = r.data || { id: u.id, email: u.email, username: String(u.email || "").split("@")[0], role: "user", created_at: u.created_at };
      profileCache = p; return p;
    },

    // Halaman yang wajib login: kembalikan user, atau arahkan ke halaman login.
    requireLogin: async function () {
      var u = await getUser();
      if (!u) { location.replace(PAGES.account); return null; }
      return u;
    },

    // Profil dibuat otomatis oleh trigger database (lihat supabase_setup.sql), jadi role tidak bisa dipalsukan dari browser.
    register: async function (email, password, username) {
      if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
      email = String(email || "").trim().toLowerCase();
      var meta = username ? { username: String(username).trim().slice(0, 40) } : {};
      var r = await sb().auth.signUp({ email: email, password: password, options: { data: meta } });
      if (r.error) return { ok: false, message: friendly(r.error.message) };
      if (r.data.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0)
        return { ok: false, message: "Email sudah terdaftar. Silakan login." };
      return { ok: true, needsConfirm: !r.data.session, message: "Register berhasil" };
    },

    login: async function (email, password) {
      if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
      var r = await sb().auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password: password });
      if (r.error) return { ok: false, message: friendly(r.error.message) };
      profileCache = null;
      return { ok: true };
    },

    logout: async function () { profileCache = null; if (sb()) await sb().auth.signOut(); },

    // Simpan order ke tabel orders (harga final dihitung ulang oleh database dari tabel products).
    saveOrder: async function (o) {
      var u = await getUser();
      if (!u) return { ok: false, message: "Sesi habis. Silakan login lagi." };
      var r = await sb().from("orders").insert({
        user_id: u.id, product: String(o.product || "").slice(0, 120), price: Math.round(Number(o.price) || 0), note: String(o.note || "").slice(0, 500)
      }).select().single();
      if (r.error) return { ok: false, message: friendly(r.error.message) };
      return { ok: true, order: r.data };
    },
    orderCode: function (id) { return "ORD-" + String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase(); },

    orderUrl: function (o) { return PAGES.order + (o && o.product ? "?product=" + encodeURIComponent(o.product) + "&price=" + encodeURIComponent(o.price) : ""); },
    setPending: function (o) { try { sessionStorage.setItem("malik_pending_order", JSON.stringify(o)); } catch (e) {} },
    takePending: function () {
      try { var x = sessionStorage.getItem("malik_pending_order"); sessionStorage.removeItem("malik_pending_order"); return x ? JSON.parse(x) : null; }
      catch (e) { return null; }
    }
  };
  global.MalikAuth = MalikAuth;

  global.startOrder = async function (product, price) {
    var o = { product: product || "", price: Number(price) || 0 };
    if (await MalikAuth.isLoggedIn()) location.href = MalikAuth.orderUrl(o);
    else { MalikAuth.setPending(o); location.href = PAGES.account; }
    return false;
  };
})(window);
