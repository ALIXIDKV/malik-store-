/*
 * MALIK STORE - ADMIN CORE (Supabase)
 * Akses admin = sesi Supabase yang SAMA dengan website user + profiles.role = 'admin'. Tidak ada sesi admin terpisah.
 *
 * Data dimuat sekali ke cache memori lalu diperbarui lewat Supabase Realtime, sehingga
 * tampilan halaman admin tetap sama. Keamanan sebenarnya ada di RLS database (supabase_setup.sql):
 * hanya akun dengan role 'admin' yang bisa membaca semua user/order/chat.
 * Non-admin yang membuka /admin/* ditolak dan dialihkan ke website user (HOME_URL).
 */
(function (g) {
  "use strict";

  var ONLINE_LABEL = "malik-online";
  var STATUSES = ["Pending", "Diproses", "Selesai"];
  var ME = null;
  var C = { profiles: [], orders: [], messages: [], online: {}, tmp: 0 };

  // Panel admin hidup di sub-path /admin pada domain utama (https://malik-store.aliz.web.id/admin), bukan domain baru.
  var ADMIN_LOGIN = "/admin/login.html";
  var HOME_URL = "/index.html";

  /* ---------- util ---------- */
  function sb() { return g.supabaseClient; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rp(n) { return "Rp" + (Number(n) || 0).toLocaleString("id-ID"); }
  function fmt(t) {
    try { return new Date(t).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "baru saja";
    if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
    if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
    return Math.floor(s / 86400) + " hari lalu";
  }
  function setHTML(el, html) { if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } }
  function ms(t) { var v = Date.parse(t); return isNaN(v) ? 0 : v; }
  function code(id) { return "ORD-" + String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase(); }

  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || "") + "</svg>"; }

  /* ---------- dialog konfirmasi (dark/neon) ---------- */
  // o: { title, text, actions: [{ label, value, kind }] } -> Promise(value yang dipilih, atau null jika ditutup)
  function dialog(o) {
    return new Promise(function (resolve) {
      var w = document.createElement("div"); w.className = "dlg";
      w.innerHTML = '<div class="dlg-b" role="dialog" aria-modal="true"><h4>' + esc(o.title) + "</h4>" + (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
        '<div class="dlg-a">' + o.actions.map(function (a, i) { return '<button type="button" class="btn ' + (a.kind || "ghost") + '" data-i="' + i + '">' + esc(a.label) + "</button>"; }).join("") + "</div></div>";
      function key(ev) { if (ev.key === "Escape") done(null); }
      function done(v) { document.removeEventListener("keydown", key); w.remove(); resolve(v); }
      w.addEventListener("click", function (ev) {
        if (ev.target === w) return done(null);
        var b = ev.target.closest("[data-i]"); if (b) done(o.actions[Number(b.getAttribute("data-i"))].value);
      });
      document.addEventListener("keydown", key); document.body.appendChild(w);
    });
  }
  function confirmBox(title, text, label) {
    return dialog({ title: title, text: text, actions: [{ label: "Batal", value: false }, { label: label || "Hapus", value: true, kind: "danger" }] })
      .then(function (v) { return v === true; });
  }
  function alertBox(title, text) { return dialog({ title: title, text: text, actions: [{ label: "OK", value: true }] }); }
  var MIGRATE_HINT = " Jalankan file supabase_final_migration.sql di Supabase > SQL Editor.";
  function dbMsg(e) { var m = String((e && e.message) || e || ""); return /permission denied|42501/i.test(m) || (e && e.code === "42501") ? m + MIGRATE_HINT : m; }


  /* ---------- auth admin (sesi Supabase yang sama dengan website user) ---------- */
  // Hasil: { state: "admin" | "user" | "guest", session }. Peran dibaca dari profiles.role (dilindungi RLS).
  // Sesi dicek ke server (getUser) supaya token kadaluarsa / akun terhapus tidak lolos.
  async function access() {
    if (!sb()) return { state: "guest", session: null };
    var r = await sb().auth.getSession(), s = r.data && r.data.session;
    if (!s) return { state: "guest", session: null };
    var v = await sb().auth.getUser();
    if (v.error && (v.error.status === 401 || v.error.status === 403 || v.error.status === 404)) {
      try { await sb().auth.signOut({ scope: "local" }); } catch (e) {}
      return { state: "guest", session: null };
    }
    var p = await sb().from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    if (!p.data || p.data.role !== "admin") return { state: "user", session: s };
    ME = p.data;
    return { state: "admin", session: s };
  }
  async function adminSession() { var a = await access(); return a.state === "admin" ? a.session : null; }
  async function isLoggedIn() { return !!(await adminSession()); }
  // Tujuan yang benar untuk halaman pembuka admin: admin -> dashboard, user biasa -> website user, guest -> login admin.
  async function route() {
    var a = await access();
    return a.state === "admin" ? "/admin/dashboard.html" : a.state === "user" ? HOME_URL : ADMIN_LOGIN;
  }
  async function login(email, pw) {
    if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
    var r = await sb().auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password: String(pw || "") });
    if (r.error) {
      console.error("[Malik][admin login] Supabase error:", { name: r.error.name, status: r.error.status, code: r.error.code, message: r.error.message });
      return { ok: false, message: (r.error.code === "invalid_credentials" || /invalid login/i.test(r.error.message)) ? "Email atau password salah." : r.error.message };
    }
    // Sesi dipakai bersama website user, jadi akun non-admin TIDAK di-logout; cukup ditolak dari /admin.
    if (!(await adminSession())) return { ok: false, notAdmin: true, message: "Akun ini bukan admin." };
    return { ok: true };
  }
  async function logout() { try { await sb().auth.signOut(); } catch (e) {} location.replace(ADMIN_LOGIN); }

  /* ---------- data (cache dari Supabase) ---------- */
  async function loadAll() {
    var res = await Promise.all([
      sb().from("profiles").select("*").order("created_at", { ascending: false }),
      sb().from("orders").select("*").order("created_at", { ascending: false }),
      sb().from("messages").select("*").order("created_at", { ascending: false }).limit(2000)
    ]);
    var err = res.map(function (x) { return x.error; }).filter(Boolean)[0];
    if (err) throw new Error(err.message);
    C.profiles = res[0].data || []; C.orders = res[1].data || []; C.messages = (res[2].data || []).slice().reverse();
  }
  function apply(list, p) {
    if (p.eventType === "DELETE") {
      var id = (p.old || {}).id, i = list.findIndex(function (x) { return x.id === id; });
      if (i > -1) list.splice(i, 1);
      return;
    }
    var n = p.new, j = list.findIndex(function (x) { return x.id === n.id; });
    if (j > -1) list[j] = n; else list.push(n);
  }
  function subscribe() {
    sb().channel("admin-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, function (p) { apply(C.profiles, p); runTicks(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, function (p) { apply(C.orders, p); runTicks(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, function (p) {
        if (p.eventType === "INSERT" && p.new.sender === "admin")   // buang pesan sementara (optimistic) yang sudah tersimpan
          C.messages = C.messages.filter(function (m) { return !(m.tmp && m.user_id === p.new.user_id && m.message === p.new.message); });
        apply(C.messages, p); runTicks();
      }).subscribe();
    var pc = sb().channel(ONLINE_LABEL);   // presence: admin hanya mendengarkan, tidak ikut tercatat online
    pc.on("presence", { event: "sync" }, function () { C.online = pc.presenceState() || {}; runTicks(); }).subscribe();
  }

  function orders() {
    var pm = {};
    C.profiles.forEach(function (p) { pm[p.id] = p; });
    return C.orders.map(function (o) {
      var p = pm[o.user_id] || {}, em = p.email || "", m = String(o.product || "").match(/^(.*?)\s+x(\d+)$/i);
      return { id: o.id, code: code(o.id), userId: o.user_id, email: em, username: String(p.username || "").trim() || em || "-",
               product: m ? m[1] : String(o.product || ""), qty: m ? Number(m[2]) : 1, price: Number(o.price) || 0, note: o.note || "",
               createdAt: ms(o.created_at), status: STATUSES.indexOf(o.status) > -1 ? o.status : "Pending" };
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function users() {
    var all = orders();
    return C.profiles.filter(function (p) { return p.role !== "admin"; }).map(function (p) {
      var em = p.email || "", os = all.filter(function (o) { return o.userId === p.id; });
      return { id: p.id, email: em, username: p.username || em.split("@")[0], createdAt: ms(p.created_at), online: !!C.online[p.id], orders: os,
               total: os.reduce(function (s, o) { return s + o.price; }, 0) };
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function threads() {
    var pm = {}, by = {};
    C.profiles.forEach(function (p) { pm[p.id] = p; });
    C.messages.forEach(function (m) { if (!m.hidden_for_admin) (by[m.user_id] = by[m.user_id] || []).push(m); });   // hidden_for_admin = "Hapus untuk saya"
    return Object.keys(by).map(function (uid) {
      var p = pm[uid] || {}, list = by[uid];
      var msgs = list.map(function (m) { return { id: m.id, from: m.sender === "admin" ? "admin" : "user", text: m.message, at: ms(m.created_at) }; })
                     .sort(function (a, b) { return a.at - b.at; });
      return { email: p.email || uid, name: String(p.username || "").trim() || p.email || uid, avatar: p.avatar_url || "", userId: uid, msgs: msgs, last: msgs.length ? msgs[msgs.length - 1] : null, online: !!C.online[uid],
               unread: list.filter(function (m) { return m.sender === "user" && !m.is_read; }).length };
    }).sort(function (a, b) { return ((b.last || {}).at || 0) - ((a.last || {}).at || 0); });
  }
  function profileByEmail(email) { return C.profiles.filter(function (p) { return p.email === email; })[0]; }

  function setStatus(id, st) {
    if (STATUSES.indexOf(st) < 0) return;
    var o = C.orders.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var old = o.status; o.status = st;
    sb().from("orders").update({ status: st }).eq("id", id).then(function (r) {
      if (r.error) { o.status = old; alert("Gagal mengubah status: " + r.error.message); }
      runTicks();
    });
  }
  function sendAdmin(email, text) {
    text = String(text || "").trim().slice(0, 1000);
    var p = profileByEmail(email);
    if (!text || !p) return false;
    var tmp = { id: "tmp-" + (++C.tmp), user_id: p.id, sender: "admin", message: text, is_read: true, created_at: new Date().toISOString(), tmp: true };
    C.messages.push(tmp);
    sb().from("messages").insert({ user_id: p.id, sender: "admin", message: text }).select().single().then(function (r) {
      C.messages = C.messages.filter(function (m) { return m !== tmp; });
      if (r.error) alert("Pesan gagal terkirim: " + r.error.message);
      else if (!C.messages.some(function (m) { return m.id === r.data.id; })) C.messages.push(r.data);
      runTicks();
    });
    return true;
  }
  // Hapus seluruh percakapan (tabel messages saja). Akun user TIDAK disentuh.
  async function deleteChat(email) {
    var p = profileByEmail(email);
    if (!p) return { ok: false, message: "User tidak ditemukan." };
    var r = await sb().from("messages").delete().eq("user_id", p.id).select("id");
    if (r.error) return { ok: false, message: dbMsg(r.error) };
    if (!(r.data || []).length && C.messages.some(function (m) { return m.user_id === p.id; })) return { ok: false, message: "Chat tidak terhapus." + MIGRATE_HINT };
    C.messages = C.messages.filter(function (m) { return m.user_id !== p.id; });
    runTicks(); return { ok: true };
  }
  // scope "me" = sembunyikan dari admin saja (hidden_for_admin), "all" = hapus pesan dari database (user juga tidak melihatnya).
  async function deleteMessages(ids, scope) {
    ids = (ids || []).filter(function (id) { return String(id).indexOf("tmp-") !== 0; });
    if (!ids.length) return { ok: false, message: "Tidak ada pesan yang dipilih." };
    var q = scope === "all" ? sb().from("messages").delete().in("id", ids).select("id")
                            : sb().from("messages").update({ hidden_for_admin: true }).in("id", ids).select("id");
    var r = await q;
    if (r.error) return { ok: false, message: dbMsg(r.error) + (/hidden_for_admin/.test(r.error.message) ? MIGRATE_HINT : "") };
    var done = (r.data || []).map(function (x) { return String(x.id); });
    if (!done.length) return { ok: false, message: "Pesan tidak terhapus." + MIGRATE_HINT };
    if (scope === "all") C.messages = C.messages.filter(function (m) { return done.indexOf(String(m.id)) < 0; });
    else C.messages.forEach(function (m) { if (done.indexOf(String(m.id)) > -1) m.hidden_for_admin = true; });
    runTicks(); return { ok: true };
  }
  async function deleteOrder(id) {
    var r = await sb().from("orders").delete().eq("id", id).select("id");
    if (r.error) return { ok: false, message: r.error.message };
    if (!(r.data || []).length) return { ok: false, message: "Order tidak terhapus." + MIGRATE_HINT };
    C.orders = C.orders.filter(function (o) { return o.id !== id; });
    runTicks(); return { ok: true };
  }
  // Hapus akun permanen lewat /api/delete-user (butuh Service Role di server; token admin diverifikasi di sana).
  async function deleteUser(id) {
    var s = await sb().auth.getSession(), tok = s.data && s.data.session && s.data.session.access_token;
    if (!tok) return { ok: false, message: "Sesi admin habis. Silakan login ulang." };
    var j = null;
    try {
      var res = await fetch("/api/delete-user", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ userId: id }) });
      try { j = await res.json(); } catch (e) {}
      if (!j) return { ok: false, message: "Server tidak merespons (" + res.status + ")." };
    } catch (e) { return { ok: false, message: "Koneksi bermasalah. Coba lagi." }; }
    if (!j.ok) return { ok: false, message: j.message || "Gagal menghapus user." };
    C.profiles = C.profiles.filter(function (p) { return p.id !== id; });
    C.orders = C.orders.filter(function (o) { return o.user_id !== id; });
    C.messages = C.messages.filter(function (m) { return m.user_id !== id; });
    runTicks(); return { ok: true };
  }
  function markSeen(email) {
    var p = profileByEmail(email), any = false; if (!p) return;
    C.messages.forEach(function (m) { if (m.user_id === p.id && m.sender === "user" && !m.is_read) { m.is_read = true; any = true; } });
    if (any) sb().from("messages").update({ is_read: true }).eq("user_id", p.id).eq("sender", "user").eq("is_read", false).then(function () {});
  }
  function stats() {
    var u = users(), o = orders();
    return {
      users: u.length, orders: o.length,
      revenue: o.filter(function (x) { return x.status === "Selesai"; }).reduce(function (s, x) { return s + x.price; }, 0),
      online: u.filter(function (x) { return x.online; }).length,
      pending: o.filter(function (x) { return x.status === "Pending"; }).length,
      unread: threads().reduce(function (s, t) { return s + t.unread; }, 0)
    };
  }

  /* ---------- layout ---------- */
  var NAV = [["dashboard", "Dashboard", "grid"], ["chat", "Chat", "msg"], ["users", "Users", "users"], ["orders", "Orders", "bag"]];
  var ticks = [];
  function onTick(fn) { ticks.push(fn); }
  function badges() {
    var s = stats();
    [["chat", s.unread], ["orders", s.pending]].forEach(function (b) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-bdg="' + b[0] + '"]'), function (el) {
        el.textContent = b[1] > 99 ? "99+" : b[1]; el.hidden = !b[1];
      });
    });
  }
  function pill(st) { return '<span class="pill p-' + String(st).toLowerCase() + '">' + esc(st) + "</span>"; }

  function runTicks() { badges(); ticks.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }

  async function mount(page, title, render) {
    var acc = await access();
    if (acc.state !== "admin") { location.replace(acc.state === "user" ? HOME_URL : ADMIN_LOGIN); return; }
    document.title = title + " - Malik Admin";
    var links = NAV.map(function (n) {
      return '<a href="' + n[0] + '.html" class="' + (n[0] === page ? "on" : "") + '">' + icon(n[2]) + "<span>" + n[1] +
             '</span><em class="bdg" data-bdg="' + n[0] + '" hidden></em></a>';
    }).join("");
    document.body.innerHTML =
      '<div class="shell"><aside class="side"><div class="brand">MALIK<span>STORE</span><small>ADMIN PANEL</small></div>' +
      "<nav>" + links + '</nav><div class="me"><b>' + esc(ME.username || "Admin") + "</b><small>" + esc(ME.email || "") +
      '</small><button class="btn ghost sm" data-lo>' + icon("out") + " Keluar</button></div></aside>" +
      '<div class="main"><header class="top"><h1>' + esc(title) + '</h1><button class="btn ghost sm" data-lo style="display:none">Keluar</button></header>' +
      '<main id="view"></main></div><nav class="tabbar">' + links + '<a href="#" data-lo>' + icon("out") + "<span>Keluar</span></a></nav></div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-lo]"), function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); logout(); });
    });
    var view = document.getElementById("view");
    view.innerHTML = "<div class='empty'>Memuat data...</div>";
    try { await loadAll(); }
    catch (e) {
      view.innerHTML = "<div class='card'><h3>Gagal memuat data</h3><p class='hint'>" + esc(e.message) +
        "</p><p class='hint'>Pastikan file supabase_setup.sql sudah dijalankan di Supabase (SQL Editor) dan akun ini sudah dijadikan admin.</p></div>";
      return;
    }
    view.innerHTML = "";
    subscribe();
    sb().auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(ADMIN_LOGIN); });
    render(view);
    badges();
    setInterval(runTicks, 3000);
    return view;
  }

  g.Admin = { mount: mount, onTick: onTick, isLoggedIn: isLoggedIn, route: route, access: access, login: login, logout: logout,
    users: users, orders: orders, threads: threads, stats: stats, setStatus: setStatus, sendAdmin: sendAdmin, markSeen: markSeen, deleteChat: deleteChat,
    deleteMessages: deleteMessages, deleteOrder: deleteOrder, deleteUser: deleteUser, dialog: dialog, confirmBox: confirmBox, alertBox: alertBox,
    STATUSES: STATUSES, esc: esc, rp: rp, fmt: fmt, ago: ago, icon: icon, pill: pill, setHTML: setHTML };
})(window);
