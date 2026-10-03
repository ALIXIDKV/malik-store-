/*
 * MALIK STORE - SINKRON KATALOG (harga / nama / deskripsi / aktif dari database)
 *
 * js/products.js TIDAK diubah. File ini hanya menimpa data di MEMORI (window.MalikProducts) dengan isi tabel
 * product_catalog & product_catalog_groups (dikelola admin di /admin/products.html).
 * Yang boleh berubah: nama produk, deskripsi, nama paket (label), harga, status aktif, dan ARSIP.
 * Produk / paket yang diarsipkan admin (kolom archived) DIKELUARKAN dari MalikProducts.list -> tidak tampil di homepage,
 * halaman produk, maupun halaman order, dan tidak bisa dipesan. Datanya TIDAK dihapus: order & ulasan lama utuh.
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
  // ref = objek produk aslinya, supaya produk yang diarsipkan bisa dikembalikan ke P.list (urutan asli dijaga lewat index).
  var BASE = P.list.map(function (p) { return { ref: p, name: p.name, desc: p.desc, variants: p.variants.slice() }; });

  function okStr(s, max) { return typeof s === "string" && s.trim().length > 0 && s.length <= max; }
  function okPrice(n) { return typeof n === "number" && isFinite(n) && n >= 1 && n <= 100000000 && Math.floor(n) === n; }

  function apply(d) {
    var gs = {}, vs = {}, show = [];
    ((d && d.groups) || []).forEach(function (x) { gs[x.product_key] = x; });
    ((d && d.variants) || []).forEach(function (x) { vs[x.product_key + "/" + x.variant_id] = x; });
    BASE.forEach(function (b) {
      var p = b.ref, gx = gs[p.key], off = {}, gone = {};
      p.name = gx && okStr(gx.name, 60) ? gx.name.trim() : b.name;
      p.desc = gx && okStr(gx.description, 800) ? gx.description.trim() : b.desc;
      var all = b.variants.map(function (v) {
        var c = {}, k, x = vs[p.key + "/" + v.id];
        for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) c[k] = v[k];
        if (x) {
          if (okStr(x.label, 40)) c.label = x.label.trim();
          if (okPrice(x.price)) c.price = x.price;
          if (x.active === false) off[v.id] = true;
          if (x.archived === true) gone[v.id] = true;   // paket diarsipkan: tidak tampil & tidak bisa dipesan
        }
        return c;
      });
      var kept = all.filter(function (v) { return !gone[v.id]; });
      var on = kept.filter(function (v) { return !off[v.id]; });
      p.variants = on.length ? on : kept;   // produk tidak pernah kosong karena paket nonaktif (admin & database juga menjaga ini)
      // produk diarsipkan (atau semua paketnya diarsipkan) -> tidak masuk daftar website sama sekali
      if ((gx && gx.archived === true) || !p.variants.length) return;
      show.push(p);
    });
    // ubah array P.list di tempat (referensi yang sama dipakai products.js, catalog.js, dst), urutan bawaan tetap
    P.list.length = 0;
    show.forEach(function (p) { P.list.push(p); });
  }

  function sig() {
    return JSON.stringify(P.list.map(function (p) {
      return [p.name, p.desc, p.variants.map(function (v) { return [v.id, v.label, v.price]; })];
    }));
  }

  function readCache() { try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function writeCache(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  function query(cols1, cols2) {
    var sb = g.supabaseClient;
    return Promise.all([sb.from("product_catalog").select(cols1), sb.from("product_catalog_groups").select(cols2)]);
  }
  function fetchRemote() {
    var sb = g.supabaseClient;
    if (!sb) return Promise.resolve(null);
    var V = "product_key,variant_id,label,price,active", G = "product_key,name,description";
    // Utamakan kolom archived. Jika migration arsip BELUM dijalankan (kolom tidak ada) -> ulangi tanpa kolom itu,
    // jadi harga/nama/aktif dari admin tetap tersinkron seperti sebelumnya.
    return query(V + ",archived", G + ",archived").then(function (r) {
      if (r[0].error || r[1].error) return query(V, G);
      return r;
    }).then(function (r) {
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
