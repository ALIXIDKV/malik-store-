/*
 * MALIK STORE - ATTACHMENT CHAT (foto / video) - dipakai chat user DAN chat admin.
 * Alur: pilih file -> validasi -> (foto dikompres di browser) -> preview -> kirim ke /api/upload-chat
 *       -> server upload ke Cloudinary -> URL dikembalikan -> halaman chat menyimpan URL ke tabel messages.
 * TIDAK ada API Secret / kredensial Cloudinary di file ini. Wajib dimuat SETELAH js/supabase.js.
 *
 * API: MalikAttach.create({ button, input, bar, onBusy }) -> { hasFile, busy, upload, clear, destroy }
 *      MalikAttach.body(text, att) -> HTML isi bubble (teks lama tetap di-escape), MalikAttach.fromRow(row)
 *      MalikAttach.bindLightbox(el, canOpen), MalikAttach.placeholder(type), MalikAttach.dbError(err)
 */
(function (g) {
  "use strict";
  var API = new URL("../api/upload-chat", document.currentScript.src).href;
  var MB = 1048576;
  // Samakan dengan MAX_BYTES di api/upload-chat.js (batas body Vercel Function 4,5 MB).
  var LIMITS = { upload: 4 * MB, imageRaw: 15 * MB, maxSide: 1600, timeout: 60000 };
  var TYPES = { "image/jpeg": "image", "image/png": "image", "image/webp": "image", "video/mp4": "video", "video/webm": "video", "video/quicktime": "video" };
  var EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
  var ACCEPT = Object.keys(TYPES).join(",");
  var PH = { image: "\uD83D\uDCF7 Foto", video: "\uD83C\uDFA5 Video" };   // teks pengganti agar notifikasi & daftar chat lama tetap terbaca
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function size(n) {
    if (n < MB) return Math.max(1, Math.round(n / 1024)) + " KB";
    var v = n / MB; return (v >= 10 || v === Math.floor(v) ? Math.round(v) : v.toFixed(1)) + " MB";
  }
  function mimeOf(f) {
    var t = String(f.type || "").toLowerCase(); if (TYPES[t]) return t;
    var m = String(f.name || "").toLowerCase().match(/\.([a-z0-9]+)$/); return (m && EXT[m[1]]) || t;
  }

  /* ---------- validasi ---------- */
  function validate(f) {
    if (!f || !f.size) return { ok: false, message: "File kosong atau tidak terbaca." };
    var mime = mimeOf(f), kind = TYPES[mime];
    if (!kind) return { ok: false, message: "Format tidak didukung. Gunakan JPG, PNG, WebP (foto) atau MP4, WebM, MOV (video)." };
    if (kind === "image" && f.size > LIMITS.imageRaw) return { ok: false, message: "Foto " + size(f.size) + " terlalu besar (maks " + size(LIMITS.imageRaw) + ")." };
    if (kind === "video" && f.size > LIMITS.upload) return { ok: false, message: "Video " + size(f.size) + " terlalu besar (maks " + size(LIMITS.upload) + "). Pilih video yang lebih pendek." };
    return { ok: true, kind: kind, mime: mime };
  }

  /* ---------- kompres foto di browser (hemat kuota & Cloudinary) ---------- */
  function loadImage(f) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); ok(im); };
      im.onerror = function () { URL.revokeObjectURL(u); no(new Error("decode")); };
      im.src = u;
    });
  }
  function toBlob(cv, q) { return new Promise(function (ok) { cv.toBlob(ok, "image/jpeg", q); }); }
  async function compress(f, mime) {
    var im;
    try { im = await loadImage(f); } catch (e) { throw new Error("Foto tidak bisa dibaca. Coba foto lain."); }
    var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, LIMITS.maxSide / Math.max(w, h));
    if (s === 1 && f.size <= 300 * 1024) return { blob: f, mime: mime };           // sudah kecil: kirim apa adanya
    var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
    var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
    var b = await toBlob(cv, 0.82);
    if (b && b.size > LIMITS.upload) b = await toBlob(cv, 0.6);
    cv.width = cv.height = 0;
    if (!b) throw new Error("Foto gagal diproses. Coba foto lain.");
    if (b.size >= f.size && f.size <= LIMITS.upload) return { blob: f, mime: mime };   // hasil kompres tidak lebih kecil
    if (b.size > LIMITS.upload) throw new Error("Foto masih terlalu besar setelah dikompres. Pilih foto lain.");
    return { blob: b, mime: "image/jpeg" };
  }

  async function token() {
    try { var r = await g.supabaseClient.auth.getSession(); return r.data && r.data.session ? r.data.session.access_token : ""; } catch (e) { return ""; }
  }

  /* ---------- kontrol attachment per chat ---------- */
  function create(o) {
    var bar = o.bar, input = o.input, btn = o.button, st = { blob: null, mime: "", kind: "", name: "", url: "", result: null, xhr: null, busy: false, seq: 0 }, el = {};
    input.setAttribute("accept", ACCEPT); input.hidden = true; if (btn) btn.innerHTML = ICON;
    bar.hidden = true; bar.innerHTML = "";
    var row = document.createElement("div"); row.className = "att-row"; row.hidden = true;
    var timer = null;
    el.th = document.createElement("div"); el.th.className = "att-th";
    var meta = document.createElement("div"); meta.className = "att-meta";
    el.n = document.createElement("b"); el.n.className = "att-n";
    el.s = document.createElement("small"); el.s.className = "att-s";
    el.p = document.createElement("div"); el.p.className = "att-prog"; el.p.hidden = true; el.p.appendChild(document.createElement("i"));
    meta.appendChild(el.n); meta.appendChild(el.s); meta.appendChild(el.p);
    el.x = document.createElement("button"); el.x.type = "button"; el.x.className = "att-x"; el.x.setAttribute("aria-label", "Batalkan lampiran"); el.x.textContent = "\u2715";
    el.e = document.createElement("div"); el.e.className = "att-err"; el.e.setAttribute("role", "alert"); el.e.hidden = true;
    row.appendChild(el.th); row.appendChild(meta); row.appendChild(el.x); bar.appendChild(row); bar.appendChild(el.e);

    function err(m) {
      clearTimeout(timer); el.e.textContent = m || ""; el.e.hidden = !m;
      if (m) { bar.hidden = false; if (!st.blob && !st.busy) timer = setTimeout(function () { if (!st.blob && !st.busy) { el.e.hidden = true; bar.hidden = true; } }, 6000); }   // pesan error tanpa file: hilang sendiri
      else if (!st.blob && !st.busy) bar.hidden = true;
    }
    function busy(b, label, pct) {
      st.busy = b; if (btn) btn.disabled = b; if (o.onBusy) o.onBusy(b);
      el.p.hidden = !b; el.p.classList.toggle("ind", b && pct == null);
      if (b) { el.p.firstChild.style.width = pct == null ? "" : pct + "%"; el.s.textContent = label; }
      else if (st.blob) el.s.textContent = (st.kind === "video" ? "Video" : "Foto") + " \u00B7 " + size(st.blob.size);
    }
    function reset() {
      if (st.xhr) { try { st.xhr.abort(); } catch (e) {} }
      if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} }
      st.blob = null; st.url = ""; st.result = null; st.xhr = null; st.seq++; input.value = "";
      el.th.innerHTML = ""; el.n.textContent = ""; el.s.textContent = ""; el.p.hidden = true; row.hidden = true; err(""); bar.hidden = true;
      if (st.busy) { st.busy = false; if (btn) btn.disabled = false; if (o.onBusy) o.onBusy(false); }
    }
    function preview() {
      el.th.innerHTML = "";
      var m = document.createElement(st.kind === "video" ? "video" : "img");
      if (st.kind === "video") { m.muted = true; m.setAttribute("playsinline", ""); m.preload = "metadata"; m.src = st.url + "#t=0.1"; } else { m.alt = ""; m.src = st.url; }
      el.th.appendChild(m); el.n.textContent = st.name; row.hidden = false; bar.hidden = false;
    }

    async function pick(f) {
      if (st.busy) return;
      var v = validate(f);
      if (!v.ok) { input.value = ""; err(v.message); return; }
      var seq = ++st.seq; err("");
      if (st.url) { try { URL.revokeObjectURL(st.url); } catch (e) {} }
      st.blob = null; st.result = null;
      el.n.textContent = f.name || (v.kind === "video" ? "Video" : "Foto"); el.th.innerHTML = ""; row.hidden = false; bar.hidden = false; busy(true, "Memproses...");
      var p;
      try { p = v.kind === "image" ? await compress(f, v.mime) : { blob: f, mime: v.mime }; }
      catch (e) { if (seq !== st.seq) return; st.busy = false; if (btn) btn.disabled = false; if (o.onBusy) o.onBusy(false); reset(); err(e.message || "File gagal diproses."); return; }
      if (seq !== st.seq) return;
      st.blob = p.blob; st.mime = p.mime; st.kind = v.kind; st.name = f.name || (v.kind === "video" ? "Video" : "Foto");
      st.url = URL.createObjectURL(p.blob); preview(); busy(false);
    }

    function upload() {   // Promise({url,type}) atau null jika gagal/dibatalkan (pesan error tampil di bar). Hasil sukses di-cache agar retry tidak upload ulang.
      if (st.result) return Promise.resolve(st.result);
      if (!st.blob || st.busy) return Promise.resolve(null);
      var seq = st.seq; err("");
      return token().then(function (tok) {
        if (seq !== st.seq) return null;
        if (!tok) { err("Sesi habis. Silakan login ulang."); return null; }
        return new Promise(function (resolve) {
          var x = new XMLHttpRequest(); st.xhr = x;
          function fail(m) { if (st.xhr === x) st.xhr = null; if (seq === st.seq) { busy(false); err(m); } resolve(null); }
          x.open("POST", API);
          x.setRequestHeader("Authorization", "Bearer " + tok); x.setRequestHeader("Content-Type", "application/octet-stream"); x.setRequestHeader("X-File-Type", st.mime);
          x.timeout = LIMITS.timeout;
          x.upload.onprogress = function (ev) {
            if (seq !== st.seq || !ev.lengthComputable) return;
            var pc = Math.min(99, Math.round(ev.loaded / ev.total * 100));
            busy(true, pc >= 99 ? "Menyimpan..." : "Mengunggah " + pc + "%", pc);
          };
          x.onload = function () {
            var j = null; try { j = JSON.parse(x.responseText); } catch (e) {}
            if (x.status >= 200 && x.status < 300 && j && j.ok && j.url) {
              if (st.xhr === x) st.xhr = null;
              if (seq !== st.seq) return resolve(null);
              st.result = { url: j.url, type: j.type }; busy(false); resolve(st.result);
            } else fail((j && j.message) || (x.status === 413 ? "File terlalu besar untuk server (maks 4 MB)." : "Upload gagal (kode " + x.status + "). Coba lagi."));
          };
          x.onerror = function () { fail("Koneksi bermasalah. Periksa internet lalu coba lagi."); };
          x.ontimeout = function () { fail("Upload terlalu lama. Coba lagi atau pilih file yang lebih kecil."); };
          x.onabort = function () { if (st.xhr === x) st.xhr = null; resolve(null); };
          busy(true, "Mengunggah 0%", 0); x.send(st.blob);
        });
      });
    }

    function onPick() { var f = input.files && input.files[0]; if (f) pick(f); }
    function onBtn(ev) { ev.preventDefault(); if (!st.busy) input.click(); }
    input.addEventListener("change", onPick);
    if (btn) btn.addEventListener("click", onBtn);
    el.x.addEventListener("click", reset);

    return {
      hasFile: function () { return !!st.blob; },
      busy: function () { return st.busy; },
      upload: upload,
      error: err,
      clear: reset,
      destroy: function () { reset(); input.removeEventListener("change", onPick); if (btn) btn.removeEventListener("click", onBtn); }
    };
  }

  /* ---------- tampilan di bubble chat ---------- */
  function okUrl(u, t) { return typeof u === "string" && u.length <= 600 && new RegExp("^https://res\\.cloudinary\\.com/[A-Za-z0-9_-]+/" + t + "/upload/").test(u); }
  function tf(u, t, ext) { var r = u.replace(/\/(image|video)\/upload\//, "/$1/upload/" + t + "/"); return ext ? r.replace(/\.[A-Za-z0-9]+$/, "." + ext) : r; }
  function fromRow(m) { return m && m.attachment_url ? { url: m.attachment_url, type: m.attachment_type } : null; }
  function body(text, att) {
    text = String(text == null ? "" : text);
    if (!att || (att.type !== "image" && att.type !== "video") || !okUrl(att.url, att.type)) return esc(text);   // URL di luar Cloudinary tidak pernah dirender
    var cap = text === PH.image || text === PH.video ? "" : text, media;
    if (att.type === "image") {
      media = '<img class="att-img" loading="lazy" decoding="async" alt="Foto" src="' + esc(tf(att.url, "c_fill,w_480,h_360,f_auto,q_auto")) + '" data-full="' + esc(tf(att.url, "c_limit,w_1600,f_auto,q_auto")) + '">';
    } else {
      media = '<video class="att-vid" controls playsinline preload="none" poster="' + esc(tf(att.url, "so_0,c_fill,w_480,h_360,f_jpg,q_auto", "jpg")) + '" src="' + esc(att.url) + '"></video>';
    }
    return '<div class="att-box">' + media + "</div>" + (cap ? '<div class="att-cap">' + esc(cap) + "</div>" : "");
  }

  /* ---------- lightbox foto (ringan, tanpa library) ---------- */
  function openLightbox(src) {
    var w = document.createElement("div"), im = document.createElement("img");
    w.className = "att-lb"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Pratinjau foto"); im.alt = ""; im.src = src; w.appendChild(im);
    function key(e) { if (e.key === "Escape") done(); }
    function done() { document.removeEventListener("keydown", key); w.remove(); }
    w.addEventListener("click", done); document.addEventListener("keydown", key); document.body.appendChild(w);
  }
  function bindLightbox(root, canOpen) {
    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.classList || !t.classList.contains("att-img")) return;
      if (canOpen && !canOpen()) return;
      var s = t.getAttribute("data-full"); if (s) openLightbox(s);
    });
  }

  function dbError(e) {
    var m = String((e && e.message) || e || "");
    return /attachment_/i.test(m) ? "Kolom lampiran belum ada di database. Jalankan supabase_attachment_migration.sql di Supabase > SQL Editor." : m;
  }

  g.MalikAttach = { create: create, validate: validate, body: body, fromRow: fromRow, bindLightbox: bindLightbox, placeholder: function (t) { return PH[t] || "Lampiran"; }, dbError: dbError, ICON: ICON, LIMITS: LIMITS };
})(window);
