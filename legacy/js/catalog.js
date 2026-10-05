/*
 * MALIK STORE - KATALOG HOMEPAGE: 3 card produk (OPEN PANEL, SEWA BOT, RESELLER & ADMIN).
 * Card hanya ringkasan; order dilakukan di halaman detail (/product/?p=...). Data/harga dari js/products.js,
 * rating dari js/reviews.js (database, bukan angka palsu). Target: <div id="mk-catalog">.
 */
(function () {
  "use strict";
  var P = window.MalikProducts, root = document.getElementById("mk-catalog");
  if (!P || !root) return;
  var IDS = { panel: "open-panel", sewa_bot: "sewa-bot", reseller_admin: "reseller-admin" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function href(p) { return "product/?p=" + encodeURIComponent(p.key); }

  function card(p) {
    var min = p.variants.reduce(function (a, v) { return Math.min(a, v.price); }, Infinity), v0 = p.variants[0];
    return '<article class="mk-card a-' + p.accent + '" id="' + IDS[p.key] + '" data-key="' + p.key + '">' +
      '<a class="mk-card-link" href="' + href(p) + '" aria-label="Lihat detail ' + esc(p.name) + '"></a>' +
      '<div class="mk-ch"><span class="mk-ic"><i class="fa-solid ' + p.icon + '"></i></span><div><h3>' + esc(p.name) + '</h3>' +
      '<div class="mk-rate"><span class="mk-nr">Memuat ulasan...</span></div></div></div>' +
      '<p class="mk-desc">' + esc(p.desc) + '</p>' +
      '<ul class="mk-perks">' + v0.perks.slice(0, 3).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul>' +
      '<div class="mk-price"><div><small>Mulai dari</small><b>' + P.rp(min) + '</b><small>' + esc(P.unit(p, v0)) + '</small></div><span class="mk-tag">' + p.variants.length + ' varian</span></div>' +
      '<a class="mk-btn p" href="' + href(p) + '">Lihat Detail</a></article>';
  }

  function starsHtml(s) {
    if (!s || !s.total) return '<span class="mk-nr">Belum ada ulasan</span>';
    return '<span class="mk-stars" style="--p:' + Math.round(s.avg / 5 * 100) + '%" aria-hidden="true">★★★★★</span> <b>' + s.avg.toFixed(1) + '</b> <em>(' + s.total + ' ulasan)</em>';
  }
  var rates = null;
  function paintRates(all) {
    P.list.forEach(function (p) { var b = root.querySelector('[data-key="' + p.key + '"] .mk-rate'); if (b) b.innerHTML = starsHtml(all[p.key]); });
  }
  function render() { root.innerHTML = P.list.map(card).join(""); if (rates) paintRates(rates); }
  render();
  window.addEventListener("malik:catalog", render);   // harga/nama/deskripsi diubah admin (js/catalog-sync.js)
  if (window.MalikReviews) MalikReviews.stats().then(function (all) { rates = all; paintRates(all); });

  if (window.matchMedia && matchMedia("(hover:hover)").matches) {   // efek 3D halus (desktop)
    root.addEventListener("pointermove", function (e) {
      var el = e.target.closest(".mk-card"); if (!el) return; var r = el.getBoundingClientRect();
      el.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 6 + "deg"); el.style.setProperty("--rx", (.5 - (e.clientY - r.top) / r.height) * 5 + "deg");
    });
    root.addEventListener("pointerleave", function () { root.querySelectorAll(".mk-card").forEach(function (el) { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); }); });
  }
})();
