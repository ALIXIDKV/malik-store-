/*
 * MALIK STORE - PESAN PEMBAYARAN OTOMATIS (instruksi manual, BUKAN payment gateway)
 * Dipakai: order/index.html (kirim), account/dashboard/chat.html & admin/chat.html (tampilan kartu).
 * Pesan disimpan sebagai TEKS BIASA di tabel messages (sender = 'admin'), jadi tetap terbaca di notifikasi,
 * daftar chat, dan chat lama. Halaman chat hanya mempercantik tampilannya. Wajib dimuat SETELAH js/supabase.js.
 *
 * API: MalikPayment.send(order)            -> Promise<boolean>  (true = pesan baru terkirim; gagal TIDAK membatalkan order)
 *      MalikPayment.is(text, fromAdmin)    -> boolean  (kartu hanya untuk pesan sender 'admin', user tidak bisa memalsukan)
 *      MalikPayment.html(text, fromAdmin)  -> HTML kartu, atau null jika bukan pesan pembayaran
 */
(function (g) {
  "use strict";
  var HEAD = "\uD83D\uDED2 Pesanan Baru Berhasil Dibuat";
  var QRIS = "/assets/payment/qris.jpg";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function grab(t, label) { var m = t.match(new RegExp("(?:^|\\n)" + label + ":\\s*\\n([^\\n]+)")); return m ? m[1].trim() : ""; }
  function is(text, fromAdmin) { return fromAdmin === true && String(text || "").indexOf(HEAD) === 0; }

  function html(text, fromAdmin) {
    if (!is(text, fromAdmin)) return null;
    var t = String(text), dana = grab(t, "DANA"), gopay = grab(t, "GoPay");
    if (!dana || !gopay) return null;   // format tidak dikenali -> tampil sebagai teks biasa
    var oid = (t.match(/Order ID:\s*(\S+)/) || [])[1] || "";
    function wallet(name, num, cls) {
      return '<div class="pay-w"><div class="pay-wi ' + cls + '">' + esc(name.charAt(0)) + '</div><div class="pay-wt"><small>' + esc(name) + '</small><b>' + esc(num) + '</b></div>' +
        '<button type="button" class="pay-cp" data-copy="' + esc(num) + '" aria-label="Salin nomor ' + esc(name) + '">Salin</button></div>';
    }
    return '<div class="pay">' +
      '<div class="pay-h"><span class="pay-ic">\uD83D\uDED2</span><div><b>Pesanan Baru Berhasil Dibuat</b>' + (oid ? '<small>' + esc(oid) + '</small>' : '') + '</div></div>' +
      '<div class="pay-b">' +
        '<p>Terima kasih sudah order di <b>Malik Store</b>.</p>' +
        '<p class="pay-l">Silakan lakukan pembayaran:</p>' +
        '<div class="pay-s"><span class="pay-t">QRIS</span><div class="pay-qb"><img class="att-img pay-qr" src="' + QRIS + '" data-full="' + QRIS + '" alt="QRIS Malik Store" loading="lazy"></div><small class="pay-hint">Ketuk gambar untuk memperbesar</small></div>' +
        '<div class="pay-s"><span class="pay-t">E-Wallet</span>' + wallet("DANA", dana, "d") + wallet("GoPay", gopay, "g") + '</div>' +
        '<div class="pay-n">Setelah transfer kirim bukti pembayaran melalui chat.</div>' +
      '</div></div>';
  }

  function send(order) {
    if (!order || !order.id || !g.supabaseClient) return Promise.resolve(false);
    return g.supabaseClient.rpc("malik_send_payment_message", { p_order_id: order.id }).then(function (r) {
      if (r.error) { console.error("[Malik][payment] gagal kirim pesan pembayaran (sudah menjalankan supabase_payment_message_migration.sql?):", r.error.message || r.error); return false; }
      return r.data === true;
    }, function (e) { console.error("[Malik][payment]", e); return false; });
  }

  /* ---------- tampilan kartu (CSS disuntik sekali; tidak menyentuh CSS lama) ---------- */
  if (!document.getElementById("mk-pay-css")) {
    var st = document.createElement("style"); st.id = "mk-pay-css";
    st.textContent =
      ".m.pm,.m.pm.admin,.m.pm.user{padding:0;overflow:hidden;white-space:normal;width:min(86%,310px);max-width:310px;background:#0f1a2b;color:#e8f0fb;border:1px solid rgba(52,211,153,.4);border-radius:16px;box-shadow:0 0 22px rgba(52,211,153,.12)}" +
      ".m.pm>small{padding:0 14px 9px;margin:0;color:#9aa7bd;opacity:1}" +
      ".pay-h{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(90deg,rgba(52,211,153,.22),rgba(56,189,248,.18));border-bottom:1px solid rgba(255,255,255,.08)}" +
      ".pay-h b{display:block;font-size:14px;line-height:1.3;color:#fff}.pay-h small{display:block;padding:0;margin:2px 0 0;font-size:11px;text-align:left;color:#7ee7c0;letter-spacing:.5px;opacity:1}" +
      ".pay-ic{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:17px}" +
      ".pay-b{padding:12px 14px 6px;font-size:13px;line-height:1.5}.pay-b p{margin:0 0 6px}.pay-l{color:#9aa7bd}" +
      ".pay-s{margin-top:12px}.pay-t{display:block;margin-bottom:7px;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#38bdf8}" +
      ".pay-qb{background:#fff;border-radius:12px;padding:8px;text-align:center}" +
      ".pay .pay-qr{display:block;width:100%;height:auto;max-width:230px;margin:0 auto;object-fit:contain;cursor:zoom-in}" +
      ".pay-qb.err{background:rgba(255,255,255,.06);color:#9aa7bd;font-size:12px;padding:14px}" +
      ".pay .pay-hint{display:block;margin-top:5px;padding:0;text-align:center;font-size:10.5px;color:#9aa7bd}" +
      ".pay-w{display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04)}" +
      ".pay-wi{flex:none;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff}.pay-wi.d{background:#118eea}.pay-wi.g{background:#00aed6}" +
      ".pay-wt{flex:1;min-width:0}.pay-wt small{display:block;padding:0;margin:0 0 1px;font-size:11px;text-align:left;color:#9aa7bd;opacity:1}.pay-wt b{display:block;font-size:15px;letter-spacing:.5px;color:#fff;word-break:break-all}" +
      ".pay-cp{flex:none;min-height:34px;padding:0 12px;border:1px solid rgba(52,211,153,.5);border-radius:9px;background:rgba(52,211,153,.12);color:#34d399;font:inherit;font-size:12px;font-weight:bold;cursor:pointer}" +
      ".pay-cp:active{background:#34d399;color:#000}" +
      ".pay-n{margin:4px 0 8px;padding:10px 12px;border-radius:10px;background:rgba(56,189,248,.1);border:1px dashed rgba(56,189,248,.45);color:#cfe9ff;font-size:12.5px}";
    document.head.appendChild(st);
  }

  // Salin nomor (satu listener untuk semua kartu; tetap jalan walau chat digambar ulang)
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest(".pay-cp") : null; if (!b) return;
    ev.stopPropagation();
    var v = b.getAttribute("data-copy") || "";
    function ok() { b.textContent = "Tersalin \u2713"; setTimeout(function () { if (b.isConnected) b.textContent = "Salin"; }, 1600); }
    function legacy() { try { var a = document.createElement("textarea"); a.value = v; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); ok(); } catch (e) {} }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, legacy); else legacy();
  }, true);

  // Gambar QRIS belum diunggah / gagal dimuat -> pesan jelas, e-wallet tetap bisa dipakai
  document.addEventListener("error", function (ev) {
    var im = ev.target; if (!im || !im.classList || !im.classList.contains("pay-qr")) return;
    var box = im.parentNode; if (!box) return;
    box.className = "pay-qb err"; box.textContent = "Gambar QRIS belum tersedia. Silakan bayar lewat DANA atau GoPay di bawah.";
    var h = box.parentNode && box.parentNode.querySelector(".pay-hint"); if (h) h.remove();
  }, true);

  g.MalikPayment = { send: send, is: is, html: html, QRIS: QRIS };
})(window);
