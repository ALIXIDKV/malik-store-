/*
 * MALIK STORE - AUTH (Supabase Authentication + tabel profiles/orders)
 * Semua fungsi async. Pastikan supabase CDN + js/supabase.js dimuat lebih dulu.
 * Sessionstorage hanya dipakai untuk UI state (paket yang sedang dipilih sebelum login).
 */
(function (global) {
  "use strict";
  var BASE = new URL("../", document.currentScript.src).href;
  var PAGES = { home: BASE + "index.html", account: BASE + "account/index.html", order: BASE + "order/index.html", chat: BASE + "account/dashboard/chat.html" };
  var API = new URL("../api/", document.currentScript.src).href;
  var NEXT_RE = /^\/account\/dashboard\/[a-z]+\.html(#[a-z]+)?$/;
  var ID_RE = /^[a-z0-9_]{1,24}$/;
  var profileCache = null;

  function sb() { return global.supabaseClient; }
  async function session() {
    if (!sb()) return null;
    var r = await sb().auth.getSession();
    return (r.data && r.data.session) || null;
  }
  async function getUser() { var s = await session(); return s ? s.user : null; }
  // Sesi lokal (localStorage) dicek ulang ke server supaya sesi kadaluarsa / akun terhapus tidak lolos.
  // Jika hanya masalah jaringan, sesi lokal tetap dipakai (user tidak dipaksa login ulang).
  async function verifiedUser() {
    var u = await getUser();
    if (u) {
      var v = await sb().auth.getUser();
      if (v.error && (v.error.status === 401 || v.error.status === 403 || v.error.status === 404)) {
        logErr("verifiedUser", v.error);
        try { await sb().auth.signOut({ scope: "local" }); } catch (e) {}
        u = null;
      }
    }
    return u;
  }

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

    // Admin = profiles.role 'admin' (sesi Supabase yang sama dipakai website user dan /admin).
    isAdmin: async function () { var p = await MalikAuth.profile(); return !!(p && p.role === "admin"); },

    // Halaman yang wajib login: kembalikan user, atau arahkan ke halaman login.
    // Sesi dari getSession() (localStorage) dicek ulang ke server lewat getUser(), supaya sesi kadaluarsa /
    // akun yang sudah dihapus tidak lolos. Jika hanya masalah jaringan, sesi lokal tetap dipakai.
    requireLogin: async function () {
      var u = await verifiedUser();
      if (!u) {
        // Buka /order/?p=..&v=..&q=.. tanpa login: ingat paket yang dipilih, lanjut setelah login.
        // (Link lama ?product=..&price=.. tetap dikenali; harga TIDAK dipercaya dari link, selalu dari js/products.js.)
        try {
          var q = new URLSearchParams(location.search), pk = q.get("p"), pv = q.get("v"), pr = q.get("product");
          if (pk && pv && ID_RE.test(pk) && ID_RE.test(pv)) MalikAuth.setPending({ p: pk, v: pv, q: Math.min(99, Math.max(1, parseInt(q.get("q"), 10) || 1)) });
          else if (pr) MalikAuth.setPending({ product: pr.slice(0, 80) });
        } catch (e) {}
        // Buka halaman dashboard (riwayat/profil/chat) tanpa login: setelah login kembali ke halaman itu.
        if (NEXT_RE.test(location.pathname + location.hash)) MalikAuth.setNext(location.pathname + location.hash);
        location.replace(PAGES.account); return null;
      }
      return u;
    },

    // Untuk halaman login/register: true jika sudah ada sesi Supabase yang valid (tanpa redirect).
    hasSession: async function () { return !!(await verifiedUser()); },

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

    // Registrasi via kode verifikasi email. Akun dibuat SERVER-SIDE (/api/register, email langsung verified),
    // lalu user login memakai sesi Supabase biasa. Gmail App Password & Service Role tidak ada di frontend.
    api: async function (name, payload) {
      try {
        var res = await fetch(API + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        var j = null; try { j = await res.json(); } catch (e) {}
        if (!j) return { ok: false, message: "Server tidak merespons (" + res.status + "). Coba lagi." };
        return j;
      } catch (e) { return { ok: false, message: "Koneksi bermasalah. Periksa internet kamu." }; }
    },
    sendCode: function (email) { return MalikAuth.api("send-code", { email: String(email || "").trim().toLowerCase() }); },
    register: async function (email, password, username, code) {
      email = String(email || "").trim().toLowerCase();
      var r = await MalikAuth.api("register", { email: email, password: password, username: String(username || "").trim(), code: String(code || "").trim() });
      if (!r.ok) return r;
      var l = await MalikAuth.login(email, password);
      return { ok: true, loggedIn: !!l.ok, message: l.ok ? "Register berhasil" : "Akun berhasil dibuat. Silakan masuk." };
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

    logout: async function () {
      profileCache = null;
      if (!sb()) return;
      try { await sb().auth.signOut(); } catch (e) { logErr("logout", e); }
      try { await sb().auth.signOut({ scope: "local" }); } catch (e) {}   // pastikan sesi di browser terhapus
    },

    // Simpan order ke tabel orders. Input baru: { key, vid, qty, note } -> nama, harga satuan & total dihitung dari js/products.js.
    // Input lama { product, price, note } tetap didukung. Harga final tetap divalidasi database dari tabel products,
    // dan kolom product_key / variant / qty / unit_price diisi otomatis oleh trigger database (supabase_reviews_migration.sql).
    saveOrder: async function (o) {
      var u = await getUser();
      if (!u) return { ok: false, message: "Sesi habis. Silakan login lagi." };
      var P = global.MalikProducts, name, total;
      if (o.key) {
        var v = P && P.variant(o.key, o.vid);
        if (!v) return { ok: false, message: "Produk tidak valid." };
        var q = P.clampQty(o.qty);
        name = P.orderName(o.key, o.vid, q); total = v.price * q;
      } else { name = String(o.product || "").slice(0, 120); total = Math.round(Number(o.price) || 0); }
      var r = await sb().from("orders").insert({
        user_id: u.id, product: name, price: total, note: String(o.note || "").slice(0, 500)
      }).select().single();
      if (r.error) { logErr("saveOrder", r.error); return { ok: false, message: friendly(r.error) }; }
      // Order tercatat -> otomatis kirim pesan order ke chat admin (tabel messages yang sama). Gagal kirim chat tidak membatalkan order.
      try { await MalikAuth.orderToChat(r.data, o); } catch (e) { logErr("orderToChat", e); }
      return { ok: true, order: r.data };
    },
    // Kirim ringkasan order ke chat admin (tabel messages -> realtime ke admin). Dicek dulu per Order ID, jadi tidak dobel
    // saat refresh / klik ganda / dipanggil ulang. Format: Pesanan Baru, Customer, Produk, Harga, Status.
    orderToChat: async function (order, o) {
      var u = await getUser(); if (!u || !order || !order.id) return false;
      var code = MalikAuth.orderCode(order.id);
      var d = await sb().from("messages").select("id").eq("user_id", u.id).like("message", "%Order ID: " + code + "%").limit(1);
      if (d.error) { logErr("orderToChat", d.error); return false; }
      if (d.data && d.data.length) return false;
      var p = null; try { p = await MalikAuth.profile(); } catch (e) {}
      var who = (p && p.username) || String(u.email || "").split("@")[0] || "User";
      var raw = String(order.product || (o && o.product) || ""), m = raw.match(/^(.*?)\s+x(\d+)$/i), qty = m ? Number(m[2]) : 1;
      var total = Number(order.price) || 0, st = order.status || "Pending";
      var lines = ["\uD83D\uDED2 Pesanan Baru", "", "Customer:", who, "", "Produk:", m ? m[1] : raw, "",
                   (qty > 1 ? "Jumlah: " + qty + "\n" : "") + "Harga:", "Rp" + (qty > 1 ? Math.round(total / qty) : total).toLocaleString("id-ID") + (qty > 1 ? " x " + qty + " = Rp" + total.toLocaleString("id-ID") : ""), "",
                   "Status:", st === "Pending" ? "Menunggu proses" : st, "", "Order ID: " + code];
      var note = String(order.note || (o && o.note) || "").trim();
      if (note) lines.push("Catatan: " + note.slice(0, 200));
      var ins = await sb().from("messages").insert({ user_id: u.id, sender: "user", message: lines.join("\n") });
      if (ins.error) { logErr("orderToChat", ins.error); return false; }
      return true;
    },
    orderCode: function (id) { return "ORD-" + String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase(); },

    orderUrl: function (o) {
      if (o && o.p && o.v && ID_RE.test(o.p) && ID_RE.test(o.v)) return PAGES.order + "?p=" + o.p + "&v=" + o.v + "&q=" + Math.min(99, Math.max(1, parseInt(o.q, 10) || 1));
      return PAGES.order + (o && o.product ? "?product=" + encodeURIComponent(o.product) : "");
    },
    setPending: function (o) { try { sessionStorage.removeItem("malik_next"); sessionStorage.setItem("malik_pending_order", JSON.stringify(o)); } catch (e) {} },
    // Tujuan setelah login (hanya path /account/dashboard/*.html yang diterima).
    setNext: function (p) { try { sessionStorage.removeItem("malik_pending_order"); sessionStorage.setItem("malik_next", p); } catch (e) {} },
    takeNext: function () {
      try { var x = sessionStorage.getItem("malik_next"); sessionStorage.removeItem("malik_next"); return x && NEXT_RE.test(x) ? x : null; }
      catch (e) { return null; }
    },
    takePending: function () {
      try { var x = sessionStorage.getItem("malik_pending_order"); sessionStorage.removeItem("malik_pending_order"); return x ? JSON.parse(x) : null; }
      catch (e) { return null; }
    }
  };
  global.MalikAuth = MalikAuth;

  // Floating button CHAT ADMIN: sudah login -> langsung chat; belum -> login dulu lalu otomatis ke chat.
  global.startChat = async function () {
    if (await MalikAuth.isLoggedIn()) location.href = PAGES.chat;
    else { MalikAuth.setNext("/account/dashboard/chat.html"); location.href = PAGES.account; }
    return false;
  };

  // startOrder("panel", "2gb", 3)  -> order produk/varian/jumlah dari js/products.js.
  // startOrder("OPEN PANEL RAM 2GB", 2000) (pemanggilan lama) -> dipetakan ke produk baru; harga diabaikan.
  // startOrder() tanpa argumen -> ke katalog produk di homepage.
  global.startOrder = async function (a, b, c) {
    var P = global.MalikProducts, o = null;
    if (a && P && P.valid(a, b)) o = { p: a, v: b, q: P.clampQty(c) };
    else if (a && P) { var m = P.fromName(a); if (m) o = { p: m.key, v: m.vid, q: 1 }; }
    if (!o) {
      var el = document.getElementById("harga-panel");
      if (el) { if (global.scrollToSection) global.scrollToSection("harga-panel"); else el.scrollIntoView({ behavior: "smooth", block: "start" }); return false; }
      location.href = PAGES.home + "#harga-panel"; return false;
    }
    if (await MalikAuth.isLoggedIn()) location.href = MalikAuth.orderUrl(o);
    else { MalikAuth.setPending(o); location.href = PAGES.account; }
    return false;
  };
})(window);
