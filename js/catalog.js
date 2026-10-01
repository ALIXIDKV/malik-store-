/*
 * MALIK STORE - KATALOG HOMEPAGE: 3 card produk (OPEN PANEL, SEWA BOT, RESELLER & ADMIN).
 * Data/harga dari js/products.js (sama dengan halaman order). Rating & ulasan dari js/reviews.js (database).
 * Muat setelah products.js, auth.js, reviews.js. Target: <div id="mk-catalog">.
 */
(function () {
  "use strict";
  var P = window.MalikProducts, root = document.getElementById("mk-catalog");
  if (!P || !root) return;
  var IDS = { panel: "open-panel", sewa_bot: "sewa-bot", reseller_admin: "reseller-admin" };
  var st = {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function card(p) {
    return '<article class="mk-card a-' + p.accent + '" id="' + IDS[p.key] + '" data-key="' + p.key + '">' +
      '<div class="mk-ch"><span class="mk-ic"><i class="fa-solid ' + p.icon + '"></i></span><div><h3>' + esc(p.name) + '</h3>' +
      '<button type="button" class="mk-rate" data-a="reviews">Memuat ulasan...</button></div></div>' +
      '<p class="mk-desc">' + esc(p.desc) + '</p>' +
      '<div class="mk-lbl">' + esc(p.variantLabel) + '</div>' +
      '<div class="mk-chips" role="radiogroup" aria-label="' + esc(p.variantLabel) + '">' + p.variants.map(function (v) {
        return '<button type="button" role="radio" aria-checked="false" data-v="' + v.id + '">' + esc(v.label) + '</button>';
      }).join("") + '</div>' +
      '<div class="mk-price"><div><b data-f="price"></b><small data-f="unit"></small></div><span class="mk-tag" data-f="tag"></span></div>' +
      '<ul class="mk-perks" data-f="perks"></ul>' +
      '<div class="mk-qty"><span>' + esc(p.qtyLabel) + '</span><div class="mk-step"><button type="button" data-a="minus" aria-label="Kurangi">−</button>' +
      '<input type="number" inputmode="numeric" min="1" max="' + P.MAX_QTY + '" value="1" data-f="qty" aria-label="Jumlah"><button type="button" data-a="plus" aria-label="Tambah">+</button></div></div>' +
      '<div class="mk-total"><div><span>Total</span><em data-f="calc"></em></div><b data-f="total"></b></div>' +
      '<div class="mk-act"><button type="button" class="mk-btn p" data-a="order">Order</button><button type="button" class="mk-btn g" data-a="reviews">Lihat Ulasan</button></div>' +
      '</article>';
  }

  function paint(key) {
    var el = root.querySelector('[data-key="' + key + '"]'), p = P.product(key), s = st[key], v = P.variant(key, s.vid);
    Array.prototype.forEach.call(el.querySelectorAll(".mk-chips button"), function (b) { b.setAttribute("aria-checked", String(b.dataset.v === s.vid)); });
    function f(n) { return el.querySelector('[data-f="' + n + '"]'); }
    f("price").textContent = P.rp(v.price);
    f("unit").textContent = P.unit(p, v);
    f("tag").textContent = v.tag;
    f("perks").innerHTML = v.perks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    f("qty").value = s.qty;
    f("total").textContent = P.rp(v.price * s.qty);
    f("calc").textContent = s.qty > 1 ? s.qty + " × " + P.rp(v.price) : "";
  }

  function loadStats() {
    if (!window.MalikReviews) return;
    MalikReviews.stats().then(function (all) {
      P.list.forEach(function (p) {
        var b = root.querySelector('[data-key="' + p.key + '"] .mk-rate'); if (b) b.textContent = MalikReviews.line(all[p.key]);
      });
    });
  }

  root.innerHTML = P.list.map(card).join("");
  P.list.forEach(function (p) { st[p.key] = { vid: p.variants[0].id, qty: 1 }; paint(p.key); });

  root.addEventListener("click", function (e) {
    var el = e.target.closest(".mk-card"); if (!el) return;
    var key = el.dataset.key, s = st[key], chip = e.target.closest(".mk-chips button");
    if (chip) { s.vid = chip.dataset.v; paint(key); return; }
    var b = e.target.closest("[data-a]"); if (!b) return;
    var a = b.dataset.a;
    if (a === "minus") { s.qty = P.clampQty(s.qty - 1); paint(key); }
    else if (a === "plus") { s.qty = P.clampQty(s.qty + 1); paint(key); }
    else if (a === "order") startOrder(key, s.vid, s.qty);
    else if (a === "reviews" && window.MalikReviews) MalikReviews.open(key, { onClose: loadStats });
  });
  root.addEventListener("change", function (e) {
    var i = e.target.closest('input[data-f="qty"]'); if (!i) return;
    var key = i.closest(".mk-card").dataset.key; st[key].qty = P.clampQty(i.value); paint(key);
  });

  loadStats();
})();
