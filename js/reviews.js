/*
 * MALIK STORE - ULASAN PRODUK (Supabase: tabel public.reviews + view public.review_stats)
 * Muat setelah supabase.js, auth.js, products.js.
 *   MalikReviews.stats()        -> { panel:{avg,total}, sewa_bot:{...}, reseller_admin:{...} } (dihitung database)
 *   MalikReviews.line(stat)     -> "⭐ 4.8 • 27 ulasan" / "Belum ada ulasan"
 *   MalikReviews.open(key, {orderId})  -> buka jendela ulasan produk
 * Keamanan sebenarnya di RLS + trigger database (supabase_reviews_migration.sql), bukan di file ini.
 */
(function (g) {
  "use strict";
  var P = g.MalikProducts, PAGE = 15;
  function sb() { return g.supabaseClient; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function stars(n) { n = Math.round(Number(n) || 0); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
  function when(t) { try { return new Date(t).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function code(id) { return "ORD-" + String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase(); }
  function missing(e) { return e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|schema cache|Could not find/i.test(e.message || "")); }

  /* ---------- statistik (dari database, bukan angka palsu) ---------- */
  async function stats() {
    var out = {}; P.list.forEach(function (p) { out[p.key] = { avg: 0, total: 0 }; });
    if (!sb()) return out;
    try {
      var r = await sb().from("review_stats").select("product_key,avg_rating,total");
      if (!r.error) (r.data || []).forEach(function (x) { if (out[x.product_key]) out[x.product_key] = { avg: Number(x.avg_rating) || 0, total: Number(x.total) || 0 }; });
    } catch (e) {}
    return out;
  }
  function line(s) { return s && s.total ? "⭐ " + s.avg.toFixed(1) + " • " + s.total + " ulasan" : "Belum ada ulasan"; }

  /* ---------- tampilan ---------- */
  function css() {
    if (document.getElementById("mkr-css")) return;
    var s = document.createElement("style"); s.id = "mkr-css";
    s.textContent =
      ".mkr{position:fixed;inset:0;z-index:9100;display:flex;align-items:flex-end;justify-content:center;background:rgba(2,6,14,.78);backdrop-filter:blur(6px);font-family:Malik,Arial,sans-serif;color:#fff}" +
      ".mkr *{box-sizing:border-box}" +
      ".mkr-box{width:100%;max-width:560px;max-height:90dvh;display:flex;flex-direction:column;background:#0b1424;border:1px solid rgba(0,255,200,.28);border-radius:20px 20px 0 0;box-shadow:0 -10px 40px rgba(0,217,255,.12)}" +
      "@media(min-width:640px){.mkr{align-items:center}.mkr-box{border-radius:20px;max-height:84dvh}}" +
      ".mkr-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 18px 10px;border-bottom:1px solid #1c2a44}" +
      ".mkr-top b{display:block;font-size:16px}.mkr-top small{display:block;margin-top:4px;color:#00d9ff;font-size:13px}" +
      ".mkr-x{flex:none;width:36px;height:36px;border:1px solid #1c2a44;border-radius:10px;background:#111c32;color:#fff;font-size:18px;cursor:pointer}" +
      ".mkr-body{overflow-y:auto;padding:14px 18px calc(18px + env(safe-area-inset-bottom,0px));-webkit-overflow-scrolling:touch}" +
      ".mkr-form,.mkr-note{padding:14px;margin-bottom:14px;border-radius:14px;background:#0d1627;border:1px solid #1c2a44;font-size:13px;color:#9aa7bd;line-height:1.5}" +
      ".mkr-form{color:#fff}.mkr-form h4{margin:0 0 10px;font-size:13px;letter-spacing:1px;color:#00d9ff;text-transform:uppercase}" +
      ".mkr-form select,.mkr-form textarea{width:100%;padding:11px 12px;margin-bottom:10px;border-radius:10px;border:1px solid #1c2a44;background:#050a14;color:#fff;font:inherit;font-size:14px;outline:none}" +
      ".mkr-form textarea{resize:vertical;min-height:74px}.mkr-form textarea:focus,.mkr-form select:focus{border-color:#00ff66}" +
      ".mkr-in{display:flex;gap:4px;margin-bottom:10px}.mkr-in button{flex:none;width:42px;height:42px;border:0;background:none;font-size:30px;line-height:1;color:#33415a;cursor:pointer;padding:0}.mkr-in button.on{color:#ffc933;text-shadow:0 0 10px rgba(255,201,51,.5)}" +
      ".mkr-btn{display:inline-block;padding:11px 18px;border:0;border-radius:11px;font:inherit;font-weight:bold;font-size:13px;cursor:pointer;background:linear-gradient(90deg,#00ff66,#00d9ff);color:#031008}" +
      ".mkr-btn.g{background:#16233a;color:#fff;border:1px solid #1c2a44}.mkr-btn:disabled{opacity:.6;cursor:wait}" +
      ".mkr-err{min-height:16px;margin:0 0 8px;font-size:12px;color:#ff6b6b}" +
      ".mkr-item{padding:14px 0;border-bottom:1px solid #1c2a44}.mkr-item:last-child{border-bottom:0}" +
      ".mkr-h{display:flex;justify-content:space-between;gap:10px;align-items:center}.mkr-h b{font-size:14px;word-break:break-word}" +
      ".mkr-st{flex:none;color:#ffc933;letter-spacing:1px;font-size:14px}" +
      ".mkr-m{margin-top:3px;font-size:11px;color:#8b9ab4}" +
      ".mkr-v{display:inline-block;margin-top:6px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:bold;color:#00ff66;border:1px solid rgba(0,255,102,.4);background:rgba(0,255,102,.08)}" +
      ".mkr-item p{margin:8px 0 0;font-size:14px;line-height:1.5;color:#dbe4f3;white-space:pre-wrap;word-break:break-word}" +
      ".mkr-act{margin-top:8px;display:flex;gap:14px}.mkr-act button{padding:0;border:0;background:none;font:inherit;font-size:12px;color:#00d9ff;cursor:pointer}.mkr-act button.d{color:#ff6b6b}" +
      ".mkr-empty{text-align:center;color:#8b9ab4;padding:26px 0;font-size:13px}.mkr-more{display:block;margin:12px auto 0}" +
      "html.mkr-lock{overflow:hidden}";
    document.head.appendChild(s);
  }

  /* ---------- jendela ulasan ---------- */
  async function open(key, opts) {
    var prod = P.product(key); if (!prod || !sb()) return;
    opts = opts || {}; css();
    var root = document.createElement("div"); root.className = "mkr"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
    root.innerHTML = '<div class="mkr-box"><div class="mkr-top"><div><b>Ulasan ' + esc(prod.name) + '</b><small id="mkr-sum">Memuat...</small></div><button type="button" class="mkr-x" aria-label="Tutup">✕</button></div><div class="mkr-body" id="mkr-body"><div class="mkr-empty">Memuat ulasan...</div></div></div>';
    document.body.appendChild(root); document.documentElement.classList.add("mkr-lock");
    function close() { document.removeEventListener("keydown", onKey); document.documentElement.classList.remove("mkr-lock"); root.remove(); if (typeof opts.onClose === "function") { try { opts.onClose(); } catch (e) {} } }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    root.addEventListener("click", function (e) { if (e.target === root || e.target.closest(".mkr-x")) close(); });
    var body = root.querySelector("#mkr-body"), sum = root.querySelector("#mkr-sum");

    var st = { me: null, list: [], total: 0, orders: [], mine: {}, editing: null, rating: 0, loaded: 0 };

    async function loadList(reset) {
      if (reset) { st.list = []; st.loaded = 0; }
      var r = await sb().from("reviews").select("*").eq("product_key", key).order("created_at", { ascending: false }).range(st.loaded, st.loaded + PAGE - 1);
      if (r.error) throw r.error;
      st.list = st.list.concat(r.data || []); st.loaded = st.list.length; st.more = (r.data || []).length === PAGE;
    }
    async function loadMine() {
      st.orders = []; st.mine = {};
      if (!st.me) return;
      var o = await sb().from("orders").select("id,product,variant,status,created_at,product_key").eq("user_id", st.me.id).order("created_at", { ascending: false });
      if (o.error) o = await sb().from("orders").select("id,product,status,created_at").eq("user_id", st.me.id).order("created_at", { ascending: false });
      st.orders = (o.data || []).filter(function (x) { var k = x.product_key || ((P.fromName(x.product) || {}).key); return k === key; });
      var m = await sb().from("reviews").select("*").eq("user_id", st.me.id).eq("product_key", key);
      (m.data || []).forEach(function (x) { st.mine[x.order_id] = x; });
    }
    async function refresh() {
      var s = (await stats())[key]; sum.textContent = line(s); st.total = s.total;
      await loadList(true); await loadMine(); draw();
    }

    function formHtml() {
      var e = st.editing, done = st.orders.filter(function (o) { return o.status === "Selesai"; });
      if (!st.me) return '<div class="mkr-note">Masuk dulu untuk memberi ulasan. Ulasan hanya untuk pembeli produk ini.<br><br><button type="button" class="mkr-btn" data-a="login">Masuk</button></div>';
      var el = e ? [e] : done.filter(function (o) { return !st.mine[o.id]; });
      if (!el.length) {
        if (!st.orders.length) return '<div class="mkr-note">Ulasan hanya bisa ditulis oleh pembeli produk ini.</div>';
        if (!done.length) return '<div class="mkr-note">Order kamu belum berstatus <b>Selesai</b>. Ulasan bisa ditulis setelah order selesai.</div>';
        return '<div class="mkr-note">Semua pembelian selesai kamu sudah diulas. Terima kasih! 🙌</div>';
      }
      var pick = e ? '<div class="mkr-m" style="margin-bottom:10px">' + esc(code(e.order_id)) + (e.variant ? " • " + esc(e.variant) : "") + '</div>' :
        '<select id="mkr-ord" aria-label="Pilih order">' + el.map(function (o) {
          return '<option value="' + esc(o.id) + '"' + (opts.orderId === o.id ? " selected" : "") + ">" + esc(code(o.id)) + " • " + esc(o.variant || o.product) + " • " + esc(when(o.created_at)) + "</option>";
        }).join("") + "</select>";
      return '<div class="mkr-form"><h4>' + (e ? "Edit ulasan" : "Tulis ulasan") + '</h4>' + pick +
        '<div class="mkr-in" id="mkr-in">' + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-r="' + i + '" aria-label="' + i + ' bintang" class="' + (i <= st.rating ? "on" : "") + '">★</button>'; }).join("") + "</div>" +
        '<textarea id="mkr-txt" maxlength="500" placeholder="Ceritakan pengalaman kamu (opsional)">' + esc(e ? e.comment || "" : "") + "</textarea>" +
        '<p class="mkr-err" id="mkr-err"></p><button type="button" class="mkr-btn" data-a="save">' + (e ? "Simpan" : "Kirim Ulasan") + "</button>" +
        (e ? ' <button type="button" class="mkr-btn g" data-a="cancel">Batal</button>' : "") + "</div>";
    }
    function listHtml() {
      if (!st.list.length) return '<div class="mkr-empty">Belum ada ulasan untuk produk ini.</div>';
      return st.list.map(function (r) {
        var own = st.me && r.user_id === st.me.id;
        return '<div class="mkr-item"><div class="mkr-h"><b>' + esc(r.username || "User") + '</b><span class="mkr-st">' + stars(r.rating) + '</span></div>' +
          '<div class="mkr-m">' + esc(when(r.created_at)) + (r.variant ? " • Varian " + esc(r.variant) : "") + '</div><span class="mkr-v">✔ Pembelian Terverifikasi</span>' +
          (r.comment ? "<p>" + esc(r.comment) + "</p>" : "") +
          (own ? '<div class="mkr-act"><button type="button" data-a="edit" data-id="' + esc(r.id) + '">Edit</button><button type="button" class="d" data-a="del" data-id="' + esc(r.id) + '">Hapus</button></div>' : "") + "</div>";
      }).join("") + (st.more ? '<button type="button" class="mkr-btn g mkr-more" data-a="more">Muat lagi</button>' : "");
    }
    function draw() { body.innerHTML = formHtml() + listHtml(); }
    function err(t) { var el = body.querySelector("#mkr-err"); if (el) el.textContent = t || ""; }

    body.addEventListener("click", async function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.r) { st.rating = Number(b.dataset.r); Array.prototype.forEach.call(body.querySelectorAll("#mkr-in button"), function (x) { x.classList.toggle("on", Number(x.dataset.r) <= st.rating); }); return; }
      var a = b.dataset.a;
      if (a === "login") { if (g.MalikAuth) { MalikAuth.setNext("/account/dashboard/index.html#hist"); location.href = MalikAuth.pages.account; } return; }
      if (a === "cancel") { st.editing = null; st.rating = 0; draw(); return; }
      if (a === "more") { b.disabled = true; try { await loadList(false); } catch (e) {} draw(); return; }
      if (a === "edit") { var r = st.list.filter(function (x) { return x.id === b.dataset.id; })[0]; if (r) { st.editing = r; st.rating = r.rating; draw(); body.scrollTop = 0; } return; }
      if (a === "del") {
        if (!confirm("Hapus ulasan ini?")) return;
        var d = await sb().from("reviews").delete().eq("id", b.dataset.id).select("id");
        if (d.error || !(d.data || []).length) { alert("Ulasan gagal dihapus."); return; }
        st.editing = null; st.rating = 0; await refresh(); return;
      }
      if (a === "save") {
        if (!st.rating) { err("Pilih jumlah bintang dulu."); return; }
        var txt = body.querySelector("#mkr-txt").value.trim().slice(0, 500);
        b.disabled = true; err("");
        var q;
        if (st.editing) q = await sb().from("reviews").update({ rating: st.rating, comment: txt || null }).eq("id", st.editing.id).select("id");
        else q = await sb().from("reviews").insert({ order_id: body.querySelector("#mkr-ord").value, rating: st.rating, comment: txt || null }).select("id");
        if (q.error || !(q.data || []).length) {
          b.disabled = false;
          err(missing(q.error) ? "Fitur ulasan belum aktif (SQL migration belum dijalankan)." : (q.error && q.error.message) || "Ulasan gagal disimpan.");
          return;
        }
        st.editing = null; st.rating = 0; await refresh(); body.scrollTop = 0;
      }
    });

    try {
      st.me = g.MalikAuth ? await MalikAuth.currentUser() : null;
      await refresh();
    } catch (e) {
      sum.textContent = "";
      body.innerHTML = '<div class="mkr-empty">' + (missing(e) ? "Fitur ulasan belum aktif." : "Ulasan gagal dimuat. Coba lagi.") + "</div>";
    }
  }

  g.MalikReviews = { stats: stats, line: line, open: open, stars: stars };
})(window);
