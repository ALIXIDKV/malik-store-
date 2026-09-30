/*
 * MALIK STORE - NOTIFIKASI (tahap UI / localStorage)
 *
 * Cara kerja: TIDAK mengubah alur login / register / order / chat yang sudah ada.
 * Mesin ini hanya MEMBACA data localStorage, membandingkan dengan "snapshot" terakhir,
 * lalu memunculkan notifikasi untuk perubahan baru (toast + suara + notifikasi browser).
 *
 * Penerima (private per akun):
 *   user  -> hanya order milik emailnya, chat miliknya sendiri, pengumuman
 *   admin -> user baru, order baru, pesan masuk (per user)
 *
 * Suara: assets/notif/notif.mp3 (umum) dan assets/notif/chet.mp3 (chat).
 * Key localStorage: malik_notif_state, malik_notif_log, malik_notif_perm, malik_announcements
 *
 * TODO(backend): ganti check() dengan event realtime (Supabase) dan showNotification
 * dengan Push server (FCM / Web Push) - lihat sw.js.
 */
(function (g) {
  "use strict";
  if (g.Notify) return;

  var S = document.currentScript, SRC = (S && S.src) || location.href;
  var ROLE = S && S.getAttribute("data-role") === "admin" ? "admin" : "user";
  var AUD = new URL("../assets/notif/", SRC).href;   // js/ -> assets/notif/ (admin/js/ -> admin/assets/notif/)
  var SW = new URL("../sw.js", SRC).href;
  var ROOT = new URL("../", SRC).href;
  var ICON = ROLE === "admin" ? "" : new URL("assets/image/profile.jpg", ROOT).href;
  var K = { users: "malik_users", session: "malik_session", orders: "malik_orders", status: "malik_order_status",
            chats: "malik_chats", ann: "malik_announcements", state: "malik_notif_state", log: "malik_notif_log",
            perm: "malik_notif_perm", admin: "malik_admin_session" };

  function read(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function abs(rel) { return new URL(rel, ROLE === "admin" ? location.href : ROOT).href; }

  /* ---------- penerima ---------- */
  function who() {
    if (ROLE === "admin") {
      var a = read(K.admin, null);
      return a && a.u && Date.now() - a.at < 8 * 3600 * 1000 ? "admin" : null;
    }
    var s = read(K.session, null);
    return s && s.email ? "u:" + s.email : null;
  }

  /* ---------- suara ---------- */
  var auds = {}, unlocked = false, pending = null;
  function audio(t) {
    if (!auds[t]) {
      var a = new Audio(AUD + (t === "chat" ? "chet.mp3" : "notif.mp3"));
      a.preload = "auto"; a.volume = 0.9;
      a.addEventListener("error", function () { a.__bad = true; });
      auds[t] = a;
    }
    return auds[t];
  }
  function beep(t) {
    try {
      var C = g.AudioContext || g.webkitAudioContext, c = new C(), o = c.createOscillator(), n = c.createGain();
      o.frequency.value = t === "chat" ? 660 : 990; o.connect(n); n.connect(c.destination);
      n.gain.setValueAtTime(0.2, c.currentTime); n.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      o.start(); o.stop(c.currentTime + 0.3);
    } catch (e) {}
  }
  function sound(t) {
    var a = audio(t);
    if (a.__bad) { beep(t); return; }
    try { a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () { pending = t; }); }
    catch (e) { pending = t; }
  }
  function unlock() {   // browser memblokir audio sebelum ada sentuhan pertama
    if (unlocked) return; unlocked = true;
    ["general", "chat"].forEach(function (t) {
      var a = audio(t); a.muted = true;
      var p = a.play();
      if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.muted = false; }).catch(function () { a.muted = false; });
      else a.muted = false;
    });
    if (pending) { var t = pending; pending = null; setTimeout(function () { sound(t); }, 300); }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (e) { document.addEventListener(e, unlock, { once: true, passive: true }); });

  /* ---------- UI: toast + banner izin ---------- */
  function css() {
    if (document.getElementById("mn-css")) return;
    var s = document.createElement("style"); s.id = "mn-css";
    s.textContent =
      "#mn-host{position:fixed;top:12px;left:12px;right:12px;max-width:380px;margin-left:auto;z-index:2147483000;display:grid;gap:10px;pointer-events:none;font-family:Malik,Arial,sans-serif}" +
      ".mn-t{pointer-events:auto;cursor:pointer;background:rgba(8,14,26,.97);color:#fff;border:1px solid rgba(0,255,150,.4);border-left:4px solid #00ff66;border-radius:14px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 18px rgba(0,217,255,.2);animation:mn-in .25s ease}" +
      ".mn-t.chat{border-left-color:#00d9ff}.mn-t b{display:block;font-size:14px}.mn-t p{margin:4px 0 0;font-size:13px;color:#b8c4dc;white-space:pre-line;word-break:break-word}" +
      "@keyframes mn-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}" +
      "#mn-ask{position:fixed;left:12px;right:12px;bottom:14px;max-width:420px;margin:0 auto;z-index:2147483000;background:rgba(8,14,26,.98);color:#fff;border:1px solid rgba(0,217,255,.45);border-radius:16px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.6),0 0 24px rgba(0,217,255,.2);font-family:Malik,Arial,sans-serif;animation:mn-in .25s ease}" +
      "#mn-ask b{display:block;font-size:15px}#mn-ask p{margin:6px 0 12px;font-size:13px;color:#b8c4dc}" +
      "#mn-ask div{display:flex;gap:10px}#mn-ask button{flex:1;padding:12px;border:0;border-radius:11px;font:inherit;font-weight:bold;cursor:pointer;background:#1a2740;color:#fff}" +
      "#mn-ask button.ok{background:linear-gradient(90deg,#00ff66,#00d9ff);color:#031008}";
    document.head.appendChild(s);
  }
  function host() {
    css(); var h = document.getElementById("mn-host");
    if (!h) { h = document.createElement("div"); h.id = "mn-host"; document.body.appendChild(h); }
    return h;
  }
  function toast(n) {
    var h = host(), t = document.createElement("div");
    t.className = "mn-t " + (n.type === "chat" ? "chat" : "");
    var b = document.createElement("b"), p = document.createElement("p");
    b.textContent = n.title; p.textContent = n.body; t.appendChild(b); t.appendChild(p);
    t.addEventListener("click", function () { t.remove(); if (n.url) location.href = n.url; });
    h.appendChild(t);
    while (h.children.length > 4) h.firstChild.remove();
    setTimeout(function () { if (t.parentNode) t.remove(); }, 6500);
  }

  /* ---------- notifikasi sistem (browser / HP) ---------- */
  async function sys(n) {
    if (!("Notification" in g) || Notification.permission !== "granted") return;
    if (!document.hidden && document.hasFocus()) return;   // halaman sedang dilihat: cukup toast
    var opt = { body: n.body, icon: ICON || undefined, badge: ICON || undefined, tag: n.tag || n.type, renotify: true, data: { url: n.url } };
    try {
      if ("serviceWorker" in navigator) {   // wajib untuk Chrome Android
        var reg = await navigator.serviceWorker.register(SW);
        if (!reg.active) await new Promise(function (res) {
          var w = reg.installing || reg.waiting; if (!w) return res();
          w.addEventListener("statechange", function () { if (w.state === "activated") res(); });
          setTimeout(res, 3000);
        });
        await reg.showNotification(n.title, opt); return;
      }
    } catch (e) {}
    try { new Notification(n.title, opt); } catch (e) {}
  }

  /* ---------- kirim + riwayat ---------- */
  function addLog(key, n) {
    var all = read(K.log, {}), arr = all[key] || [];
    arr.unshift({ type: n.type, title: n.title, body: n.body, url: n.url, at: Date.now() });
    all[key] = arr.slice(0, 40); write(K.log, all);
  }
  function deliver(n, key, silent) {
    if (key && !silent) addLog(key, n);
    sound(n.type === "chat" ? "chat" : "general");
    toast(n); sys(n);
  }

  /* ---------- snapshot + diff ---------- */
  function lastFrom(msgs, from) {
    var r = { at: 0, t: "" };
    (msgs || []).forEach(function (m) { if (m.from === from && m.at > r.at) r = { at: m.at, t: clip(m.text, 80) }; });
    return r;
  }
  function adminSnap() {
    var u = read(K.users, {}), o = read(K.orders, []), c = read(K.chats, {}), snap = { users: {}, orders: {}, msgs: {} };
    Object.keys(u).forEach(function (e) { snap.users[e] = 1; });
    o.forEach(function (x) { snap.orders[x.id] = { e: x.email, p: x.product }; });
    Object.keys(c).forEach(function (e) { snap.msgs[e] = lastFrom((c[e] || {}).msgs, "user"); });
    return snap;
  }
  function userSnap(email) {
    var map = read(K.status, {}), snap = { orders: {}, chat: { at: 0, t: "" }, annAt: 0 };
    read(K.orders, []).forEach(function (x) { if (x.email === email) snap.orders[x.id] = { s: map[x.id] || "Pending", p: x.product }; });
    snap.chat = lastFrom(((read(K.chats, {})[email]) || {}).msgs, "admin");
    read(K.ann, []).forEach(function (a) { if (a.at > snap.annAt) snap.annAt = a.at; });
    return snap;
  }
  function splitQty(p) { var m = String(p || "").match(/^(.*?)\s+x(\d+)$/i); return m ? { n: m[1], q: Number(m[2]) } : { n: String(p || ""), q: 1 }; }

  function adminDiff(o, c) {
    var out = [];
    Object.keys(c.users).forEach(function (e) {
      if (!o.users[e]) out.push({ type: "general", tag: "usr-" + e, title: "🔔 User Baru", body: e + " baru mendaftar.", url: abs("users.html") });
    });
    Object.keys(c.orders).forEach(function (id) {
      if (o.orders[id]) return;
      var x = c.orders[id], p = splitQty(x.p);
      out.push({ type: "general", tag: "ord-" + id, title: "🔔 Order Baru",
        body: "User:\n" + x.e + "\n\nProduk:\n" + p.n + (p.q > 1 ? " (x" + p.q + ")" : ""), url: abs("orders.html") });
    });
    Object.keys(c.msgs).forEach(function (e) {
      if (c.msgs[e].at > ((o.msgs[e] || {}).at || 0))
        out.push({ type: "chat", tag: "chat-" + e, title: "🔔 Pesan Masuk", body: e + ":\n" + c.msgs[e].t, url: abs("chat.html?u=" + encodeURIComponent(e)) });
    });
    return out;
  }
  function userDiff(o, c) {
    var out = [], dash = new URL("account/dashboard/", ROOT).href;
    Object.keys(c.orders).forEach(function (id) {
      var n = c.orders[id], old = o.orders[id], p = splitQty(n.p).n;
      if (!old) out.push({ type: "general", tag: "ord-" + id, title: "🔔 Order Berhasil", body: "Pesanan kamu berhasil dibuat.\n" + p, url: dash });
      else if (old.s !== n.s) out.push({ type: "general", tag: "ord-" + id, title: "🔔 Order Update",
        body: (n.s === "Selesai" ? "Pesanan kamu sudah selesai." : n.s === "Diproses" ? "Pesanan kamu sedang diproses." : "Status pesanan kamu: " + n.s + ".") + "\n" + p, url: dash });
    });
    if (c.chat.at > (o.chat.at || 0)) out.push({ type: "chat", tag: "chat", title: "🔔 Pesan Baru", body: "Admin membalas chat kamu.\n" + c.chat.t, url: dash + "chat.html" });
    read(K.ann, []).forEach(function (a) {
      if (a.at > (o.annAt || 0)) out.push({ type: "general", tag: "ann-" + a.at, title: "📢 " + clip(a.title, 60), body: clip(a.body, 200), url: ROOT + "index.html" });
    });
    return out;
  }

  function check() {
    try {
      var w = who(); if (!w) return;
      var all = read(K.state, {}), old = all[w], cur = w === "admin" ? adminSnap() : userSnap(w.slice(2));
      all[w] = cur; write(K.state, all);          // simpan dulu supaya tab lain tidak menembak dobel
      if (!old) return;                            // pertama kali: hanya baseline, jangan banjir notifikasi lama
      var out = w === "admin" ? adminDiff(old, cur) : userDiff(old, cur);
      out.slice(0, 4).forEach(function (n) { deliver(n, w); });
      if (out.length > 4) deliver({ type: "general", tag: "more", title: "🔔 Notifikasi", body: "Ada " + (out.length - 4) + " notifikasi lainnya.", url: "" }, w);
    } catch (e) {}
  }

  /* ---------- izin notifikasi ---------- */
  function permState() { return "Notification" in g ? Notification.permission : "unsupported"; }
  function savePerm(s) {
    var P = read(K.perm, {}), k = who() || "_device", v = { s: s, at: Date.now() };
    P[k] = v; if (k !== "_device" && s === "granted") P._device = v; write(K.perm, P);
  }
  function ask() {
    if (!("Notification" in g)) return Promise.resolve("unsupported");
    var p;
    try { p = Notification.requestPermission(); } catch (e) { return Promise.resolve("denied"); }
    return Promise.resolve(p).then(function (r) {
      savePerm(r);
      if (r === "granted") {
        if ("serviceWorker" in navigator) navigator.serviceWorker.register(SW).catch(function () {});
        deliver({ type: "general", title: "🔔 Notifikasi Aktif", body: "Malik Store akan memberi kabar pesan & order kamu.", url: "" }, null, true);
      }
      return r;
    });
  }
  function showAsk() {
    if (document.getElementById("mn-ask") || permState() !== "default") return;
    css();
    var d = document.createElement("div"); d.id = "mn-ask";
    d.innerHTML = "<b>🔔 Malik Store ingin mengirimkan notifikasi</b><p>" +
      (ROLE === "admin" ? "Dapatkan kabar user baru, order baru, dan pesan masuk." : "Dapatkan kabar balasan admin dan status pesanan kamu.") +
      "</p><div><button class='no'>Nanti</button><button class='ok'>Izinkan</button></div>";
    d.querySelector(".no").onclick = function () { savePerm("later"); d.remove(); };
    d.querySelector(".ok").onclick = function () { unlock(); d.remove(); ask(); };
    document.body.appendChild(d);
  }
  function blocked() {   // jangan ganggu loading screen & popup iklan homepage
    var l = document.getElementById("malik-loader"), p = document.getElementById("ad-popup");
    var loading = l && document.body.contains(l) && !l.classList.contains("hide-loader") && getComputedStyle(l).display !== "none" && getComputedStyle(l).visibility !== "hidden" && getComputedStyle(l).opacity !== "0";
    return !!loading || !!(p && !p.hidden);
  }
  function promptWhenReady() {
    if (!("Notification" in g)) return;
    var st = permState(), P = read(K.perm, {}), me = P[who() || "_device"];
    if (st === "granted") {
      if (!me || me.s !== "granted") savePerm("granted");
      if ("serviceWorker" in navigator) navigator.serviceWorker.register(SW).catch(function () {});
      return;
    }
    if (st === "denied") { if (!me || me.s !== "denied") savePerm("denied"); return; }
    if (me && me.s === "later" && Date.now() - me.at < 864e5) return;
    var tries = 0, iv = setInterval(function () {
      tries++;
      if (permState() !== "default" || tries > 400) return clearInterval(iv);
      if (!blocked() && document.body) { clearInterval(iv); setTimeout(showAsk, 1500); }
    }, 500);
  }

  /* ---------- API publik ---------- */
  g.Notify = {
    role: ROLE, check: check, ask: ask, permission: permState, sound: sound,
    test: function (type) {
      unlock();
      deliver({ type: type === "chat" ? "chat" : "general", tag: "test", title: type === "chat" ? "🔔 Pesan Baru (tes)" : "🔔 Order Update (tes)",
        body: type === "chat" ? "Admin membalas chat kamu." : "Pesanan kamu sudah selesai.", url: "" }, null, true);
    },
    announce: function (title, body) {     // dipanggil dari panel admin
      title = clip(String(title || "").trim(), 80); body = clip(String(body || "").trim(), 300);
      if (!title || !body) return false;
      var list = read(K.ann, []); list.push({ title: title, body: body, at: Date.now() });
      return write(K.ann, list.slice(-30));
    },
    log: function (n) { return (read(K.log, {})[who() || ""] || []).slice(0, n || 10); }
  };

  function start() {
    check();
    setInterval(check, 2000);
    g.addEventListener("storage", check);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
    promptWhenReady();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window);
