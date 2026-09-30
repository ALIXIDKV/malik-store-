/*
 * MALIK STORE - ADMIN CORE
 * Auth admin + data layer + layout. Semua data masih localStorage / dummy (tanpa backend).
 *
 * KEY yang dipakai admin (terpisah dari sesi user "malik_session"):
 *   malik_admin_session   sesi admin
 *   malik_admin_demo(_on) data dummy + saklar
 *   malik_order_status    { orderId: "Pending|Diproses|Selesai" }
 * KEY milik sisi user yang DIBACA admin:
 *   malik_users, malik_orders, malik_presence, malik_chats
 *   malik_chats = { "email": { msgs:[{from:"user"|"admin", text, at}], adminSeen: timestamp } }
 *
 * CATATAN: login admin di sini hanya untuk tahap UI. Password ada di kode klien,
 * jadi BUKAN keamanan sungguhan. Ganti dengan auth server di tahap database.
 * Semua path relatif, jadi folder admin/ bisa dipindah ke root subdomain nanti.
 */
(function (g) {
  "use strict";

  var K = {
    session: "malik_admin_session", lock: "malik_admin_lock",
    demoOn: "malik_admin_demo_on", demo: "malik_admin_demo",
    status: "malik_order_status",
    users: "malik_users", orders: "malik_orders", presence: "malik_presence", chats: "malik_chats"
  };
  var ADMIN = { username: "Malik", email: "malik@gmail.com",
                hash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918" };
  var SESSION_MS = 8 * 3600 * 1000, ONLINE_MS = 90 * 1000;
  var STATUSES = ["Pending", "Diproses", "Selesai"];

  /* ---------- util ---------- */
  function read(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
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
  async function sha256(text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function setHTML(el, html) { if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } }

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
  function isLoggedIn() {
    var s = read(K.session, null);
    return !!(s && s.u === ADMIN.username && Date.now() - s.at < SESSION_MS);
  }
  async function login(id, pw) {
    var lock = read(K.lock, { n: 0, until: 0 });
    if (lock.until > Date.now()) return { ok: false, message: "Terlalu banyak percobaan. Coba lagi " + Math.ceil((lock.until - Date.now()) / 1000) + " detik." };
    id = String(id || "").trim().toLowerCase();
    var okId = id === ADMIN.username.toLowerCase() || id === ADMIN.email.toLowerCase();
    var okPw = (await sha256(String(pw || ""))) === ADMIN.hash;
    if (okId && okPw) {
      write(K.lock, { n: 0, until: 0 });
      write(K.session, { u: ADMIN.username, at: Date.now() });
      return { ok: true };
    }
    lock.n = (lock.n || 0) + 1;
    if (lock.n >= 5) { lock.n = 0; lock.until = Date.now() + 30000; }
    write(K.lock, lock);
    return { ok: false, message: "Username/email atau password salah." };
  }
  function logout() { try { localStorage.removeItem(K.session); } catch (e) {} location.replace("login.html"); }

  /* ---------- data demo (terpisah dari data user asli) ---------- */
  function demoOn() { try { return localStorage.getItem(K.demoOn) !== "0"; } catch (e) { return true; } }
  function setDemo(on) { try { localStorage.setItem(K.demoOn, on ? "1" : "0"); } catch (e) {} }
  function demo() {
    var d = read(K.demo, null);
    if (d) return d;
    var n = Date.now(), H = 3600e3, D = 24 * H;
    d = {
      users: [
        { email: "alya@example.com", createdAt: n - 5 * D, online: true },
        { email: "budi@example.com", createdAt: n - 3 * D, online: false },
        { email: "citra@example.com", createdAt: n - D, online: true },
        { email: "dimas@example.com", createdAt: n - 2 * H, online: false }
      ],
      orders: [
        { id: "ORD-DEMO1", email: "alya@example.com", product: "OPEN PANEL RAM 2GB x3", price: 6000, createdAt: n - 4 * D, status: "Selesai" },
        { id: "ORD-DEMO2", email: "budi@example.com", product: "OPEN PANEL RAM 4GB x1", price: 4000, createdAt: n - 2 * D, status: "Diproses" },
        { id: "ORD-DEMO3", email: "citra@example.com", product: "RESELLER PANEL PTERODACTYL x1", price: 15000, createdAt: n - 20 * H, status: "Pending" },
        { id: "ORD-DEMO4", email: "alya@example.com", product: "OPEN PANEL RAM 1GB x5", price: 5000, createdAt: n - 3 * H, status: "Selesai" }
      ],
      chats: {
        "alya@example.com": { adminSeen: n - 5 * 60e3, msgs: [
          { from: "user", text: "Bang mau order panel", at: n - 30 * 60e3 },
          { from: "admin", text: "Silahkan pilih paket", at: n - 28 * 60e3 },
          { from: "user", text: "RAM 2GB berapa harganya?", at: n - 2 * 60e3 } ] },
        "citra@example.com": { adminSeen: 0, msgs: [
          { from: "user", text: "Panel reseller masih ada?", at: n - 50 * 60e3 } ] },
        "budi@example.com": { adminSeen: n - 2 * D, msgs: [
          { from: "user", text: "Panel sudah aktif, makasih bang", at: n - 2 * D - 60e3 },
          { from: "admin", text: "Sama-sama, jangan lupa backup rutin ya", at: n - 2 * D } ] }
      }
    };
    write(K.demo, d);
    return d;
  }

  /* ---------- data layer ---------- */
  function orders() {
    var map = read(K.status, {}), list = [];
    function dec(o, isDemo) {
      var m = String(o.product || "").match(/^(.*?)\s+x(\d+)$/i), mail = String(o.email || "");
      return { id: o.id, email: mail, username: mail.split("@")[0], product: m ? m[1] : String(o.product || ""),
               qty: m ? Number(m[2]) : 1, price: Number(o.price) || 0, note: o.note || "", createdAt: o.createdAt || 0,
               status: STATUSES.indexOf(map[o.id]) > -1 ? map[o.id] : (STATUSES.indexOf(o.status) > -1 ? o.status : "Pending"), demo: isDemo };
    }
    read(K.orders, []).forEach(function (o) { list.push(dec(o, false)); });
    if (demoOn()) demo().orders.forEach(function (o) { list.push(dec(o, true)); });
    return list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function setStatus(id, st) {
    if (STATUSES.indexOf(st) < 0) return;
    var m = read(K.status, {}); m[id] = st; write(K.status, m);
  }
  function users() {
    var real = read(K.users, {}), pres = read(K.presence, {}), now = Date.now(), list = [], all = orders();
    Object.keys(real).forEach(function (e) {
      list.push({ email: e, username: e.split("@")[0], createdAt: (real[e] || {}).createdAt || 0, online: !!pres[e] && now - pres[e] < ONLINE_MS, demo: false });
    });
    if (demoOn()) demo().users.forEach(function (u) {
      list.push({ email: u.email, username: u.email.split("@")[0], createdAt: u.createdAt, online: !!u.online, demo: true });
    });
    list.forEach(function (u) {
      u.orders = all.filter(function (o) { return o.email === u.email; });
      u.total = u.orders.reduce(function (s, o) { return s + o.price; }, 0);
    });
    return list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  }
  function threads() {
    var real = read(K.chats, {}), out = [], now = Date.now(), pres = read(K.presence, {});
    function th(e, t, isDemo) {
      var m = (t && t.msgs) || [], seen = (t && t.adminSeen) || 0, on;
      if (isDemo) { on = demo().users.some(function (u) { return u.email === e && u.online; }); }
      else { on = !!pres[e] && now - pres[e] < ONLINE_MS; }
      return { email: e, demo: isDemo, msgs: m, last: m.length ? m[m.length - 1] : null, online: on,
               unread: m.filter(function (x) { return x.from === "user" && x.at > seen; }).length };
    }
    Object.keys(real).forEach(function (e) { out.push(th(e, real[e], false)); });
    if (demoOn()) { var dc = demo().chats; Object.keys(dc).forEach(function (e) { if (!real[e]) out.push(th(e, dc[e], true)); }); }
    return out.sort(function (a, b) { return ((b.last || {}).at || 0) - ((a.last || {}).at || 0); });
  }
  function touchThread(email, fn) {
    var real = read(K.chats, {});
    if (real[email]) { fn(real[email]); return write(K.chats, real); }
    var d = demo();
    if (d.chats[email]) { fn(d.chats[email]); return write(K.demo, d); }
    return false;
  }
  function sendAdmin(email, text) {
    text = String(text || "").trim().slice(0, 1000);
    if (!text) return false;
    return touchThread(email, function (t) {
      t.msgs = (t.msgs || []).concat([{ from: "admin", text: text, at: Date.now() }]).slice(-300);
      t.adminSeen = Date.now();
    });
  }
  function markSeen(email) { touchThread(email, function (t) { t.adminSeen = Date.now(); }); }
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

  function mount(page, title, render) {
    if (!isLoggedIn()) { location.replace("login.html"); return; }
    document.title = title + " - Malik Admin";
    var links = NAV.map(function (n) {
      return '<a href="' + n[0] + '.html" class="' + (n[0] === page ? "on" : "") + '">' + icon(n[2]) + "<span>" + n[1] +
             '</span><em class="bdg" data-bdg="' + n[0] + '" hidden></em></a>';
    }).join("");
    document.body.innerHTML =
      '<div class="shell"><aside class="side"><div class="brand">MALIK<span>STORE</span><small>ADMIN PANEL</small></div>' +
      "<nav>" + links + '</nav><div class="me"><b>' + esc(ADMIN.username) + "</b><small>" + esc(ADMIN.email) +
      '</small><button class="btn ghost sm" data-lo>' + icon("out") + " Keluar</button></div></aside>" +
      '<div class="main"><header class="top"><h1>' + esc(title) + '</h1><button class="btn ghost sm" data-lo style="display:none">Keluar</button></header>' +
      '<main id="view"></main></div><nav class="tabbar">' + links + '<a href="#" data-lo>' + icon("out") + "<span>Keluar</span></a></nav></div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-lo]"), function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); logout(); });
    });
    var view = document.getElementById("view");
    render(view);
    badges();
    var run = function () { badges(); ticks.forEach(function (f) { f(); }); };
    setInterval(run, 3000);
    window.addEventListener("storage", run);
    return view;
  }

  g.Admin = { mount: mount, onTick: onTick, isLoggedIn: isLoggedIn, login: login, logout: logout,
    users: users, orders: orders, threads: threads, stats: stats, setStatus: setStatus, sendAdmin: sendAdmin, markSeen: markSeen,
    demoOn: demoOn, setDemo: setDemo, STATUSES: STATUSES, esc: esc, rp: rp, fmt: fmt, ago: ago, icon: icon, pill: pill, setHTML: setHTML };
})(window);
