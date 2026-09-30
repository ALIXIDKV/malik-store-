/*
 * MALIK STORE - Tombol show/hide password (icon mata)
 * Otomatis dipasang ke semua <input type="password"> di halaman.
 * Default tersembunyi; klik icon -> terlihat; klik lagi -> tersembunyi.
 * Style netral (transparan, warna mengikuti teks) sehingga cocok untuk halaman user maupun admin.
 */
(function () {
  "use strict";
  var EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function injectCss() {
    if (document.getElementById("pw-eye-css")) return;
    var s = document.createElement("style");
    s.id = "pw-eye-css";
    s.textContent =
      ".pw-wrap{position:relative;display:block;width:100%}" +
      ".pw-wrap>input{padding-right:48px!important}" +
      ".pw-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;margin:0!important;padding:0!important;" +
      "display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:transparent!important;" +
      "color:rgba(255,255,255,.6);cursor:pointer;line-height:0;-webkit-tap-highlight-color:transparent}" +
      ".pw-eye:hover{color:#fff}.pw-eye.on{color:#00ff66}" +
      ".pw-eye:focus-visible{outline:2px solid #00ff66;outline-offset:1px}";
    document.head.appendChild(s);
  }

  function attach(input) {
    if (input.__pwEye) return;
    input.__pwEye = true;
    var wrap = document.createElement("span");
    wrap.className = "pw-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement("button");
    btn.type = "button";               // jangan pernah submit form
    btn.className = "pw-eye";
    btn.innerHTML = EYE;
    btn.setAttribute("aria-label", "Tampilkan password");
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Tampilkan password";
    // Cegah input kehilangan fokus (keyboard HP tetap terbuka) saat icon ditekan.
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      var a = input.selectionStart, b = input.selectionEnd, had = document.activeElement === input;
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.classList.toggle("on", show);
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      var t = show ? "Sembunyikan password" : "Tampilkan password";
      btn.setAttribute("aria-label", t); btn.title = t;
      if (had) { input.focus(); try { input.setSelectionRange(a, b); } catch (e) {} }
    });
    wrap.appendChild(btn);
  }

  function init() {
    injectCss();
    Array.prototype.forEach.call(document.querySelectorAll('input[type="password"]'), attach);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
