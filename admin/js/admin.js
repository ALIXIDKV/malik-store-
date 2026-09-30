/*
 * MALIK STORE - ADMIN CORE (Supabase)
 * Login admin (Supabase Auth + profiles.role = 'admin'), data dari Supabase, layout panel.
 *
 * Data dimuat sekali ke cache memori lalu diperbarui lewat Supabase Realtime, sehingga
 * tampilan halaman admin tetap sama. Keamanan sebenarnya ada di RLS database (supabase_setup.sql):
 * hanya akun dengan role 'admin' yang bisa membaca semua user/order/chat.
 * Sesi admin memakai storage key terpisah ("malik-admin-auth") dari sesi user.
 */
(function (g) {
  "use strict";

  var ONLINE_LABEL = "malik-online";
  var STATUSES = ["Pending", "Diproses", "Selesai"];
  var ME = null;
  var C = { profiles: [], orders: [], messages: [], online: {}, tmp: 0 };

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
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || "") + "</svg>"; }


  /* ---------- auth admin ---------- */
  async function adminSession() {
    if (!sb()) return null;
    var r = await sb().auth.getSession(), s = r.data && r.data.session;
    if (!s) return null;
    var p = await sb().from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    if (!p.data || p.data.role !== "admin") return null;
    ME = p.data;
    return s;
  }
  async function isLoggedIn() { return !!(await adminSession()); }
  async function login(email, pw) {
    if (!sb()) return { ok: false, message: "Koneksi database belum siap." };
    var r = await sb().auth.signInWithPassword({ email: String(email || "").trim().toLowerCase(), password: String(pw || "") });
    if (r.error) return { ok: false, message: /invalid login/i.test(r.error.message) ? "Email atau password salah." : r.error.message };
    if (!(await adminSession())) { await sb().auth.signOut(); return { ok: false, message: "Akun ini bukan admin." }; }
    return { ok: true };
  }
  async function logout() { try { await sb().auth.signOut(); } catch (e) {} location.replace("login.html"); }

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
      return { id: o.id, code: code(o.id), userId: o.user_id, email: em, username: p.username || em.split("@")[0] || "-",
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
    C.messages.forEach(function (m) { (by[m.user_id] = by[m.user_id] || []).push(m); });
    return Object.keys(by).map(function (uid) {
      var p = pm[uid] || {}, list = by[uid];
      var msgs = list.map(function (m) { return { from: m.sender === "admin" ? "admin" : "user", text: m.message, at: ms(m.created_at) }; })
                     .sort(function (a, b) { return a.at - b.at; });
      return { email: p.email || uid, userId: uid, msgs: msgs, last: msgs.length ? msgs[msgs.length - 1] : null, online: !!C.online[uid],
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
    var sess = await adminSession();
    if (!sess) { location.replace("login.html"); return; }
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
    sb().auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace("login.html"); });
    render(view);
    badges();
    setInterval(runTicks, 3000);
    return view;
  }

  g.Admin = { mount: mount, onTick: onTick, isLoggedIn: isLoggedIn, login: login, logout: logout,
    users: users, orders: orders, threads: threads, stats: stats, setStatus: setStatus, sendAdmin: sendAdmin, markSeen: markSeen,
    STATUSES: STATUSES, esc: esc, rp: rp, fmt: fmt, ago: ago, icon: icon, pill: pill, setHTML: setHTML };
})(window);
