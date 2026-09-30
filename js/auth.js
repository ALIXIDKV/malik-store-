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

  // ---- DEBUG: aktif jika URL memakai ?debug=1 (tidak mengubah tampilan untuk user biasa) ----
  var DEBUG = /[?&]debug=1(&|$)/.test(location.search);
  function rawErr(e) {
    if (!e) return null;
    return { name: e.name || null, status: e.status == null ? null : e.status, code: e.code || null, message: e.message || String(e) };
  }
  // Selalu tulis error Supabase ASLI ke console browser (password tidak pernah dicatat).
  function logErr(where, e) {
    var r = rawErr(e);
    if (r) { console.error("[Malik][" + where + "] Supabase error:", r); }
    return r;
  }

  function friendly(err) {
    var msg = String((err && err.message) || err || ""), code = String((err && err.code) || "");
    if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Email atau password salah.";
    if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "Email belum dikonfirmasi. Cek inbox email kamu.";
    if (code === "user_already_exists" || /already registered/i.test(msg)) return "Email sudah terdaftar. Silakan login.";
    if (code === "weak_password" || /password should be at least/i.test(msg)) return "Password minimal 6 karakter.";
    if (/over_.*rate_limit/.test(code) || /rate limit|too many/i.test(msg)) return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
    if (/invalid api key|no api key/i.test(msg)) return "Konfigurasi Supabase salah (URL/API key tidak valid). Cek js/supabase.js.";
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
    // Sesi dari getSession() (localStorage) dicek ulang ke server lewat getUser(), supaya sesi kadaluarsa /
    // akun yang sudah dihapus tidak lolos. Jika hanya masalah jaringan, sesi lokal tetap dipakai.
    requireLogin: async function () {
      var u = await getUser();
      if (u) {
        var v = await sb().auth.getUser();
        if (v.error && (v.error.status === 401 || v.error.status === 403 || v.error.status === 404)) {
          logErr("requireLogin", v.error);
          try { await sb().auth.signOut({ scope: "local" }); } catch (e) {}
          u = null;
        }
      }
      if (!u) { location.replace(PAGES.account); return null; }
      return u;
    },

    debug: DEBUG,
    lastError: null,

    // Ringkasan kondisi auth untuk debugging (tanpa token/password).
    diagnose: async function () {
      var cfg = global.MALIK_SB_CONFIG || {}, out = { page: location.origin + location.pathname, projectUrl: cfg.url || null };
      if (!cfg.url) { out.error = "supabase.js tidak termuat / MALIK_SB_CONFIG kosong"; return out; }
      try {
        var res = await fetch(cfg.url + "/auth/v1/settings", { headers: { apikey: cfg.key } });
        out.settingsHttp = res.status;
        var j = null; try { j = await res.json(); } catch (e) {}
        if (res.ok && j) { out.emailLoginEnabled = !!(j.external && j.external.email); out.autoConfirmEmail = !!j.mailer_autoconfirm; out.signupDisabled = !!j.disable_signup; }
        else out.settingsBody = j;
      } catch (e) { out.fetchError = String((e && e.message) || e); }
      try {
        var s = await session();
        out.hasSession = !!s; out.sessionEmail = (s && s.user && s.user.email) || null;
        out.sessionExpiresAt = s ? new Date(s.expires_at * 1000).toISOString() : null;
      } catch (e) { out.sessionError = String((e && e.message) || e); }
      try { out.storageKeys = Object.keys(localStorage).filter(function (k) { return /^sb-|malik/i.test(k); }); } catch (e) { out.storageKeys = "localStorage diblokir"; }
      out.lastError = MalikAuth.lastError;
      return out;
    },

    // Profil dibuat otomatis oleh trigger database (lihat supabase_setup.sql), jadi role tidak bisa dipalsukan dari browser.
    register: async function (email, password, username) {
      if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
      email = String(email || "").trim().toLowerCase();
      var meta = username ? { username: String(username).trim().slice(0, 40) } : {};
      // emailRedirectTo: link konfirmasi email kembali ke domain situs ini (bukan Site URL bawaan Supabase / localhost).
      // Domain ini juga harus ada di Supabase > Authentication > URL Configuration > Redirect URLs.
      var r = await sb().auth.signUp({ email: email, password: password, options: { data: meta, emailRedirectTo: PAGES.account } });
      if (r.error) { MalikAuth.lastError = logErr("register", r.error); return { ok: false, message: friendly(r.error), raw: MalikAuth.lastError }; }
      if (r.data.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0)
        return { ok: false, message: "Email sudah terdaftar. Silakan login." };
      return { ok: true, needsConfirm: !r.data.session, message: "Register berhasil" };
    },

    login: async function (email, password) {
      if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
      var r = await sb().auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password: String(password == null ? "" : password) });
      if (r.error) { MalikAuth.lastError = logErr("login", r.error); return { ok: false, message: friendly(r.error), raw: MalikAuth.lastError }; }
      // Pastikan sesi benar-benar tersimpan di browser sebelum pindah halaman.
      var s = await session();
      if (!s) {
        MalikAuth.lastError = { name: "SessionNotPersisted", status: null, code: "session_missing", message: "signIn sukses tapi getSession() kosong" };
        console.error("[Malik][login]", MalikAuth.lastError);
        return { ok: false, message: "Login berhasil tapi sesi tidak tersimpan. Pastikan cookie/penyimpanan browser tidak diblokir.", raw: MalikAuth.lastError };
      }
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
      if (r.error) { logErr("saveOrder", r.error); return { ok: false, message: friendly(r.error) }; }
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
