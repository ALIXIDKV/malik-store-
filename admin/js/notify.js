/*
 * MALIK STORE - NOTIFIKASI (Supabase Realtime)
 *
 * Mendengarkan perubahan tabel lewat Supabase Realtime (dibatasi RLS, jadi private per akun):
 *   user  -> order miliknya (dibuat / status berubah), balasan admin di chat miliknya, pengumuman
 *   admin -> user baru (profiles), order baru (orders), pesan masuk dari user (messages)
 * Suara: assets/notif/notif.mp3 (umum) dan assets/notif/chet.mp3 (chat).
 * localStorage hanya untuk UI state di perangkat ini: izin notifikasi & riwayat notifikasi.
 * User online: Supabase Realtime Presence (channel "malik-online").
 *
 * TODO(push): notifikasi saat browser ditutup butuh Web Push server (FCM) - lihat sw.js.
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
  var K = { log: "malik_notif_log", perm: "malik_notif_perm", annSeen: "malik_ann_seen" };
  var CUR = "_device";   // penerima saat ini: id user / "admin" / "_device"

  function read(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function abs(rel) { return new URL(rel, ROLE === "admin" ? location.href : ROOT).href; }

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
      "#mn-ask{position:fixed;left:12px;right:12px;bottom:calc(var(--mk-nav-h,0px) + 14px);max-width:420px;margin:0 auto;z-index:2147483000;background:rgba(8,14,26,.98);color:#fff;border:1px solid rgba(0,217,255,.45);border-radius:16px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.6),0 0 24px rgba(0,217,255,.2);font-family:Malik,Arial,sans-serif;animation:mn-in .25s ease}" +
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

  /* ---------- Supabase Realtime ---------- */
  function sb() { return g.supabaseClient; }
  function splitQty(p) { var m = String(p || "").match(/^(.*?)\s+x(\d+)$/i); return m ? { n: m[1], q: Number(m[2]) } : { n: String(p || ""), q: 1 }; }
  var mails = {};
  async function emailOf(uid) {
    if (mails[uid]) return mails[uid];
    try { var r = await sb().from("profiles").select("email").eq("id", uid).maybeSingle(); if (r.data && r.data.email) return (mails[uid] = r.data.email); } catch (e) {}
    return "user";
  }
  function dashUrl() { return new URL("account/dashboard/", ROOT).href; }
  function fire(n) { deliver(n, CUR); }

  var chans = [], uid = null;
  function dropChannels() { chans.forEach(function (c) { try { sb().removeChannel(c); } catch (e) {} }); chans = []; }

  function listenUser(id) {
    var f = "user_id=eq." + id;
    chans.push(sb().channel("mn-user-" + id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: f }, function (p) {
        fire({ type: "general", tag: "ord-" + p.new.id, title: "🔔 Order Berhasil", body: "Pesanan kamu berhasil dibuat.\n" + splitQty(p.new.product).n, url: dashUrl() });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: f }, function (p) {
        var n = p.new, o = p.old || {};
        if (o.status !== undefined && o.status === n.status) return;
        fire({ type: "general", tag: "ord-" + n.id, title: "🔔 Order Update",
          body: (n.status === "Selesai" ? "Pesanan kamu sudah selesai." : n.status === "Diproses" ? "Pesanan kamu sedang diproses." : "Status pesanan kamu: " + n.status + ".") + "\n" + splitQty(n.product).n, url: dashUrl() });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: f }, function (p) {
        if (p.new.sender !== "admin") return;
        fire({ type: "chat", tag: "chat", title: "🔔 Pesan Baru", body: "Admin membalas chat kamu.\n" + clip(p.new.message, 80), url: dashUrl() + "chat.html" });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, function (p) {
        fire({ type: "general", tag: "ann-" + p.new.id, title: "📢 " + clip(p.new.title, 60), body: clip(p.new.body, 200), url: ROOT + "index.html" });
      })
      .subscribe());
    // Presence: tandai user ini online untuk panel admin (hanya id, tanpa email)
    var pc = sb().channel("malik-online", { config: { presence: { key: id } } });
    pc.subscribe(function (st) { if (st === "SUBSCRIBED") { try { pc.track({ at: Date.now() }); } catch (e) {} } });
    chans.push(pc);
    missedAnnouncements();
  }
  async function missedAnnouncements() {   // pengumuman yang terbit saat user tidak membuka website
    try {
      var seen = localStorage.getItem(K.annSeen);
      var q = sb().from("announcements").select("*").order("created_at", { ascending: false }).limit(3);
      if (seen) q = q.gt("created_at", seen);
      var r = await q;
      localStorage.setItem(K.annSeen, new Date().toISOString());
      if (!seen || !r.data) return;
      r.data.reverse().forEach(function (a) { fire({ type: "general", tag: "ann-" + a.id, title: "📢 " + clip(a.title, 60), body: clip(a.body, 200), url: ROOT + "index.html" }); });
    } catch (e) {}
  }

  function listenAdmin() {
    chans.push(sb().channel("mn-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, function (p) {
        if (p.new.role === "admin") return;
        fire({ type: "general", tag: "usr-" + p.new.id, title: "🔔 User Baru", body: (p.new.email || "User") + " baru mendaftar.", url: new URL("users.html", location.href).href });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, async function (p) {
        var x = splitQty(p.new.product), e = await emailOf(p.new.user_id);
        fire({ type: "general", tag: "ord-" + p.new.id, title: "🔔 Order Baru", body: "User:\n" + e + "\n\nProduk:\n" + x.n + (x.q > 1 ? " (x" + x.q + ")" : ""), url: new URL("orders.html", location.href).href });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "sender=eq.user" }, async function (p) {
        var e = await emailOf(p.new.user_id);
        fire({ type: "chat", tag: "chat-" + p.new.user_id, title: "🔔 Pesan Masuk", body: e + ":\n" + clip(p.new.message, 80), url: new URL("chat.html?u=" + encodeURIComponent(e), location.href).href });
      })
      .subscribe());
  }

  var refreshing = false;
  async function refresh() {   // dipanggil saat halaman dibuka & setiap status login berubah
    if (refreshing || !sb()) return; refreshing = true;
    try {
      var r = await sb().auth.getSession(), u = r.data && r.data.session ? r.data.session.user : null;
      var want = null;
      if (u) {
        if (ROLE === "admin") {
          var pr = await sb().from("profiles").select("role").eq("id", u.id).maybeSingle();
          if (pr.data && pr.data.role === "admin") want = "admin";
        } else want = u.id;
      }
      if (want !== uid) {
        dropChannels(); uid = want;
        CUR = want || "_device";
        if (want) { if (ROLE === "admin") listenAdmin(); else listenUser(want); }
      }
    } catch (e) {}
    refreshing = false;
  }

  /* ---------- izin notifikasi ---------- */
  function permState() { return "Notification" in g ? Notification.permission : "unsupported"; }
  function savePerm(s) {
    var P = read(K.perm, {}), k = CUR, v = { s: s, at: Date.now() };
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
    var st = permState(), P = read(K.perm, {}), me = P[CUR];
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
    role: ROLE, ask: ask, permission: permState, sound: sound,
    check: function () { refresh(); },   // kompatibilitas: cek ulang status login
    test: function (type) {
      unlock();
      deliver({ type: type === "chat" ? "chat" : "general", tag: "test", title: type === "chat" ? "🔔 Pesan Baru (tes)" : "🔔 Order Update (tes)",
        body: type === "chat" ? "Admin membalas chat kamu." : "Pesanan kamu sudah selesai.", url: "" }, null, true);
    },
    announce: async function (title, body) {     // dipanggil dari panel admin -> tabel announcements
      title = clip(String(title || "").trim(), 80); body = clip(String(body || "").trim(), 300);
      if (!title || !body || !sb()) return false;
      var r = await sb().from("announcements").insert({ title: title, body: body });
      return !r.error;
    },
    log: function (n) { return (read(K.log, {})[CUR] || []).slice(0, n || 10); }
  };

  function start() {
    if (sb()) {
      refresh();
      sb().auth.onAuthStateChange(function () { setTimeout(refresh, 0); });   // jangan await Supabase di dalam callback ini
    }
    promptWhenReady();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window);
