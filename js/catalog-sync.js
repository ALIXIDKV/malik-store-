/*
 * MALIK STORE - SINKRON KATALOG (harga / nama / deskripsi / aktif dari database)
 *
 * js/products.js TIDAK diubah. File ini hanya menimpa data di MEMORI (window.MalikProducts) dengan isi tabel
 * product_catalog & product_catalog_groups (dikelola admin di /admin/products.html).
 * Yang boleh berubah: nama produk, deskripsi, nama paket (label), harga, dan status aktif.
 * Yang TIDAK pernah berubah: v.name (nama produk lama yang dikirim ke tabel orders) -> riwayat, ulasan, dan
 * perhitungan harga di database tetap utuh.
 *
 * Cara kerja (supaya tidak ada "kedip" harga):
 *   1. Saat dimuat, langsung memakai cache terakhir (localStorage) -> halaman tampil dengan harga terbaru yang diketahui.
 *   2. Di latar belakang mengambil data terbaru dari Supabase. Jika ada yang berbeda: cache diperbarui, event
 *      "malik:catalog" dikirim, dan jika script ini dipasang dengan atribut data-reload (halaman product & order)
 *      halaman dimuat ulang SEKALI agar harga yang tampil = harga yang ditagih.
 *   3. Jika database/tabel belum siap atau gagal -> diam-diam tetap memakai data bawaan products.js.
 * Harga final order tetap ditegakkan DATABASE (trigger), bukan dipercaya dari browser.
 *
 * Pasang SETELAH js/supabase.js dan js/products.js, SEBELUM script yang merender produk.
 */
(function (g) {
  "use strict";
  var P = g.MalikProducts;
  if (!P || !P.list || g.MalikCatalog) return;

  var KEY = "malik_catalog_v1", RL = "malik_catalog_rl";
  var S = document.currentScript, RELOAD = !!(S && S.hasAttribute("data-reload"));

  // Salinan data bawaan (products.js) -> apply() selalu mulai dari sini, jadi aman dipanggil berulang.
  var BASE = P.list.map(function (p) { return { name: p.name, desc: p.desc, variants: p.variants.slice() }; });

  function okStr(s, max) { return typeof s === "string" && s.trim().length > 0 && s.length <= max; }
  function okPrice(n) { return typeof n === "number" && isFinite(n) && n >= 1 && n <= 100000000 && Math.floor(n) === n; }

  function apply(d) {
    var gs = {}, vs = {};
    ((d && d.groups) || []).forEach(function (x) { gs[x.product_key] = x; });
    ((d && d.variants) || []).forEach(function (x) { vs[x.product_key + "/" + x.variant_id] = x; });
    P.list.forEach(function (p, i) {
      var b = BASE[i], gx = gs[p.key], off = {};
      p.name = gx && okStr(gx.name, 60) ? gx.name.trim() : b.name;
      p.desc = gx && okStr(gx.description, 800) ? gx.description.trim() : b.desc;
      var all = b.variants.map(function (v) {
        var c = {}, k, x = vs[p.key + "/" + v.id];
        for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) c[k] = v[k];
        if (x) {
          if (okStr(x.label, 40)) c.label = x.label.trim();
          if (okPrice(x.price)) c.price = x.price;
          if (x.active === false) off[v.id] = true;
        }
        return c;
      });
      var on = all.filter(function (v) { return !off[v.id]; });
      p.variants = on.length ? on : all;   // produk tidak pernah kosong (admin & database juga menjaga ini)
    });
  }

  function sig() {
    return JSON.stringify(P.list.map(function (p) {
      return [p.name, p.desc, p.variants.map(function (v) { return [v.id, v.label, v.price]; })];
    }));
  }

  function readCache() { try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function writeCache(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  function fetchRemote() {
    var sb = g.supabaseClient;
    if (!sb) return Promise.resolve(null);
    return Promise.all([
      sb.from("product_catalog").select("product_key,variant_id,label,price,active"),
      sb.from("product_catalog_groups").select("product_key,name,description")
    ]).then(function (r) {
      if (r[0].error || r[1].error || !r[0].data || !r[0].data.length) return null;
      return { variants: r[0].data, groups: r[1].data || [] };
    }, function () { return null; });
  }

  // 1) cache dulu (sinkron)
  var cached = readCache();
  if (cached) apply(cached);

  // 2) database di latar belakang
  function refresh() {
    return fetchRemote().then(function (d) {
      if (!d) return false;
      var before = sig(); apply(d); writeCache(d);
      if (before === sig()) { try { sessionStorage.removeItem(RL); } catch (e) {} return false; }   // stabil -> reset penjaga reload
      try { g.dispatchEvent(new CustomEvent("malik:catalog")); } catch (e) {}
      if (RELOAD) {
        var n = 0; try { n = Number(sessionStorage.getItem(RL)) || 0; sessionStorage.setItem(RL, String(n + 1)); } catch (e) {}
        if (n < 2) location.reload();   // batas 2x: mencegah loop jika terjadi hal tak terduga
      }
      return true;
    });
  }
  refresh();

  g.MalikCatalog = { refresh: refresh, sig: sig };
})(window);
