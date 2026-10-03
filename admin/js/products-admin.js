/*
 * MALIK STORE - ADMIN: KELOLA PRODUK
 * Dipakai oleh admin/products.html lewat Admin.mount (login + role admin dicek di admin.js; penulisan dijaga RLS database).
 * Tabel: product_catalog (per paket: label, price, active) & product_catalog_groups (per produk: name, description).
 * Dibuat oleh supabase_catalog_migration.sql. Tidak mengubah js/products.js. Nama order lama (order_name) tidak bisa diubah dari sini.
 * HAPUS = ARSIP (kolom archived, supabase_archive_migration.sql): produk / paket disembunyikan dari website, TIDAK dihapus dari database,
 * jadi order & ulasan lama tetap aman dan bisa dipulihkan kapan saja.
 */
(function (g) {
  "use strict";
  var A = g.Admin, e = A.esc;
  function sb() { return g.supabaseClient; }
  var DEF = {};   // harga bawaan dari js/products.js (hanya untuk tampilan & tombol reset)
  try { (g.MalikProducts ? g.MalikProducts.list : []).forEach(function (p) { p.variants.forEach(function (v) { DEF[p.key + "/" + v.id] = v.price; }); }); } catch (x) {}

  var GROUPS = [], VARS = [], view = null;

  function num(s) { var d = String(s == null ? "" : s).replace(/[^\d]/g, ""); return d ? parseInt(d, 10) : NaN; }
  function vkey(v) { return v.product_key + "/" + v.variant_id; }
  function dirtyAny() { return !!view && view.querySelectorAll(".pm-row.dirty, .pm-grp.dirty").length > 0; }
  function cardDirty(pk) { var c = view && view.querySelector(".pm-card[data-g='" + pk + "']"); return !!c && c.querySelectorAll(".pm-row.dirty, .pm-grp.dirty").length > 0; }

  function msg(el, text, kind) { if (!el) return; el.textContent = text || ""; el.className = "pm-msg" + (kind ? " " + kind : ""); }

  /* ---------- tampilan ---------- */
  function shown(pk) { return VARS.filter(function (v) { return v.product_key === pk && !v.archived; }); }
  function arch(pk) { return VARS.filter(function (v) { return v.product_key === pk && v.archived; }); }
  function rowHtml(v) {
    var def = DEF[vkey(v)];
    return "<div class='pm-row' data-pk='" + e(v.product_key) + "' data-vid='" + e(v.variant_id) + "'>" +
      "<label class='pm-f pm-n'><span>Nama paket</span><input data-f='label' type='text' maxlength='40' value='" + e(v.label) + "'></label>" +
      "<label class='pm-f pm-p'><span>Harga (Rp)</span><input data-f='price' type='text' inputmode='numeric' autocomplete='off' value='" + e(v.price) + "'>" +
        (def != null ? "<small class='hint'>Bawaan: " + e(A.rp(def)) + " <button type='button' class='pm-link' data-reset='" + e(def) + "'>Reset</button></small>" : "") + "</label>" +
      "<div class='pm-f pm-a'><span>Status</span><label class='sw'><input data-f='active' type='checkbox'" + (v.active ? " checked" : "") + "><i></i><b>" + (v.active ? "Aktif" : "Nonaktif") + "</b></label></div>" +
      "<div class='pm-f pm-s'><button type='button' class='btn sm' data-save disabled>Simpan</button>" +
        "<button type='button' class='btn ghost sm dz' data-varch='1' title='Sembunyikan paket ini dari website (bisa dipulihkan)'>" + A.icon("trash") + "<span>Arsipkan</span></button>" +
        "<span class='pm-msg' role='status'></span></div>" +
      "</div>";
  }
  function archRowHtml(v) {
    return "<div class='pm-arow' data-pk='" + e(v.product_key) + "' data-vid='" + e(v.variant_id) + "'><span><b>" + e(v.label) + "</b> &bull; " + e(A.rp(v.price)) + "</span>" +
      "<button type='button' class='btn ghost sm' data-varch='0'>Pulihkan</button><span class='pm-msg' role='status'></span></div>";
  }
  function groupHtml(gp) {
    var vs = shown(gp.product_key), av = arch(gp.product_key);
    var on = vs.filter(function (v) { return v.active; }).length;
    return "<section class='card pm-card' data-g='" + e(gp.product_key) + "'>" +
      "<div class='pm-grp' data-pk='" + e(gp.product_key) + "'>" +
        "<div class='pm-top'><h3>" + e(gp.name) + "</h3><span class='hint'>" + on + "/" + vs.length + " paket aktif &bull; <a href='/product/?p=" + encodeURIComponent(gp.product_key) + "' target='_blank' rel='noopener'>Lihat di website</a></span></div>" +
        "<label class='pm-f'><span>Nama produk</span><input data-f='gname' type='text' maxlength='60' value='" + e(gp.name) + "'></label>" +
        "<label class='pm-f'><span>Deskripsi</span><textarea data-f='gdesc' rows='3' maxlength='800'>" + e(gp.description) + "</textarea></label>" +
        "<div class='pm-f pm-s'><button type='button' class='btn sm' data-gsave disabled>Simpan nama &amp; deskripsi</button>" +
          "<button type='button' class='btn ghost sm dz' data-garch='1' title='Sembunyikan seluruh produk dari website (bisa dipulihkan)'>" + A.icon("trash") + "<span>Hapus produk (arsip)</span></button>" +
          "<span class='pm-msg' role='status'></span></div>" +
      "</div>" +
      "<div class='pm-vars'>" + vs.map(rowHtml).join("") + "</div>" +
      (av.length ? "<div class='pm-arch'><b>Paket diarsipkan (" + av.length + ")</b>" + av.map(archRowHtml).join("") + "</div>" : "") + "</section>";
  }
  function archGroupHtml(gp) {
    var n = VARS.filter(function (v) { return v.product_key === gp.product_key; }).length;
    return "<div class='pm-arow pm-agrp' data-g='" + e(gp.product_key) + "'><span><b>" + e(gp.name) + "</b> &bull; " + n + " paket" +
      (gp.archived_at ? " &bull; diarsipkan " + e(A.fmt(gp.archived_at)) : "") + "</span>" +
      "<button type='button' class='btn ghost sm' data-garch='0'>Pulihkan</button><span class='pm-msg' role='status'></span></div>";
  }
  function draw() {
    var live = GROUPS.filter(function (x) { return !x.archived; }), old = GROUPS.filter(function (x) { return x.archived; });
    view.querySelector("#pm-list").innerHTML = (live.map(groupHtml).join("") || "<div class='empty'>Semua produk diarsipkan. Pulihkan produk di bagian bawah agar tampil lagi di website.</div>") +
      (old.length ? "<section class='card pm-card pm-archbox'><div class='pm-top'><h3>Produk diarsipkan (" + old.length + ")</h3><span class='hint'>Tidak tampil di website &bull; order &amp; ulasan lama tetap aman</span></div>" + old.map(archGroupHtml).join("") + "</section>" : "");
  }
  function redrawCard(pk) {   // gambar ulang satu kartu produk saja (perubahan belum disimpan di kartu lain tidak hilang)
    var gp = GROUPS.filter(function (x) { return x.product_key === pk; })[0], el = view.querySelector(".pm-card[data-g='" + pk + "']");
    if (!gp || !el || gp.archived) return draw();
    var t = document.createElement("div"); t.innerHTML = groupHtml(gp); el.replaceWith(t.firstChild);
  }

  /* ---------- status "belum disimpan" ---------- */
  function rowDirty(row) {
    var v = VARS.filter(function (x) { return x.product_key === row.dataset.pk && x.variant_id === row.dataset.vid; })[0]; if (!v) return false;
    var l = row.querySelector("[data-f=label]").value.trim(), p = num(row.querySelector("[data-f=price]").value), a = row.querySelector("[data-f=active]").checked;
    return l !== v.label || p !== v.price || a !== v.active;
  }
  function grpDirty(box) {
    var gp = GROUPS.filter(function (x) { return x.product_key === box.dataset.pk; })[0]; if (!gp) return false;
    return box.querySelector("[data-f=gname]").value.trim() !== gp.name || box.querySelector("[data-f=gdesc]").value.trim() !== gp.description;
  }
  function refreshRow(row) {
    var d = rowDirty(row); row.classList.toggle("dirty", d); row.querySelector("[data-save]").disabled = !d;
    var a = row.querySelector("[data-f=active]"); row.querySelector(".sw b").textContent = a.checked ? "Aktif" : "Nonaktif";
    row.classList.toggle("off", !a.checked);
    if (d) msg(row.querySelector(".pm-msg"), "Belum disimpan", "warn");
  }
  function refreshGrp(box) { var d = grpDirty(box); box.classList.toggle("dirty", d); box.querySelector("[data-gsave]").disabled = !d; if (d) msg(box.querySelector(".pm-msg"), "Belum disimpan", "warn"); }

  /* ---------- simpan ---------- */
  function dbError(r) {
    var er = r.error; if (!er) return "";
    if (/archived/i.test(er.message || "") && (er.code === "42703" || /column|schema cache|does not exist/i.test(er.message || ""))) return "Fitur arsip belum aktif. Jalankan supabase_archive_migration.sql di Supabase > SQL Editor.";
    if (er.code === "42P01" || /does not exist|schema cache/i.test(er.message || "")) return "Tabel katalog belum ada. Jalankan supabase_catalog_migration.sql di Supabase > SQL Editor.";
    if (er.code === "42501" || /permission denied|row-level security/i.test(er.message || "")) return "Ditolak database. Pastikan login sebagai admin dan migration katalog sudah dijalankan.";
    return er.message || "Terjadi kesalahan.";
  }
  async function saveRow(row, btn) {
    var pk = row.dataset.pk, vid = row.dataset.vid, out = row.querySelector(".pm-msg");
    var v = VARS.filter(function (x) { return x.product_key === pk && x.variant_id === vid; })[0]; if (!v) return;
    var label = row.querySelector("[data-f=label]").value.trim(), price = num(row.querySelector("[data-f=price]").value), active = row.querySelector("[data-f=active]").checked;
    if (!label || label.length > 40) return msg(out, "Nama paket harus 1-40 karakter.", "err");
    if (isNaN(price) || price < 1 || price > 100000000) return msg(out, "Harga harus angka antara 1 dan 100.000.000.", "err");
    if (v.active && !active) {
      var ok = await A.confirmBox("Nonaktifkan paket ini?", "\"" + v.label + "\" tidak akan tampil dan tidak bisa dipesan customer. Order lama tidak terpengaruh.", "Nonaktifkan");
      if (!ok) return;
    }
    btn.disabled = true; msg(out, "Menyimpan...", "");
    var r = await sb().from("product_catalog").update({ label: label, price: price, active: active })
      .eq("product_key", pk).eq("variant_id", vid).select("product_key,variant_id,label,price,active");
    if (r.error || !r.data || !r.data.length) { msg(out, r.error ? dbError(r) : "Tidak ada data yang berubah. Cek migration & akses admin.", "err"); btn.disabled = false; return; }
    Object.assign(v, r.data[0]);
    row.querySelector("[data-f=label]").value = v.label; row.querySelector("[data-f=price]").value = v.price;
    refreshRow(row); msg(out, "Tersimpan \u2713", "ok");
    var box = row.closest(".pm-card"), hdr = box.querySelector(".pm-top .hint");   // hitung ulang "x/y paket aktif"
    var vs = shown(pk);
    hdr.firstChild.textContent = vs.filter(function (x) { return x.active; }).length + "/" + vs.length + " paket aktif \u2022 ";
  }
  async function saveGroup(box, btn) {
    var pk = box.dataset.pk, out = box.querySelector(".pm-msg"), gp = GROUPS.filter(function (x) { return x.product_key === pk; })[0]; if (!gp) return;
    var name = box.querySelector("[data-f=gname]").value.trim(), desc = box.querySelector("[data-f=gdesc]").value.trim();
    if (!name || name.length > 60) return msg(out, "Nama produk harus 1-60 karakter.", "err");
    if (!desc || desc.length > 800) return msg(out, "Deskripsi harus 1-800 karakter.", "err");
    btn.disabled = true; msg(out, "Menyimpan...", "");
    var r = await sb().from("product_catalog_groups").update({ name: name, description: desc }).eq("product_key", pk).select("product_key,name,description");
    if (r.error || !r.data || !r.data.length) { msg(out, r.error ? dbError(r) : "Tidak ada data yang berubah. Cek migration & akses admin.", "err"); btn.disabled = false; return; }
    Object.assign(gp, r.data[0]); box.querySelector(".pm-top h3").textContent = gp.name;
    refreshGrp(box); msg(out, "Tersimpan \u2713", "ok");
  }

  /* ---------- arsip (pengganti hapus permanen) ---------- */
  async function setArchived(table, match, flag) {
    var q = sb().from(table).update({ archived: flag });
    Object.keys(match).forEach(function (k) { q = q.eq(k, match[k]); });
    return q.select("*");
  }
  async function archiveGroup(pk, flag, btn) {
    var gp = GROUPS.filter(function (x) { return x.product_key === pk; })[0]; if (!gp) return;
    var host = btn.closest(".pm-grp, .pm-arow"), out = host && host.querySelector(".pm-msg");
    if (dirtyAny()) return msg(out, "Simpan atau batalkan perubahan yang belum disimpan dulu.", "err");   // daftar digambar ulang penuh
    if (flag) {
      var ok = await A.confirmBox("Hapus produk \"" + gp.name + "\"?",
        "Produk akan DIARSIPKAN: hilang dari website dan tidak bisa dipesan. Order dan ulasan lama tetap aman, data tidak dihapus, dan produk bisa dipulihkan kapan saja.", "Arsipkan");
      if (!ok) return;
    }
    btn.disabled = true; msg(out, flag ? "Mengarsipkan..." : "Memulihkan...", "");
    var r = await setArchived("product_catalog_groups", { product_key: pk }, flag);
    if (r.error || !r.data || !r.data.length) { msg(out, r.error ? dbError(r) : "Tidak ada data yang berubah. Cek migration & akses admin.", "err"); btn.disabled = false; return; }
    Object.assign(gp, r.data[0]);
    draw();
  }
  async function archiveVariant(pk, vid, flag, btn) {
    var v = VARS.filter(function (x) { return x.product_key === pk && x.variant_id === vid; })[0]; if (!v) return;
    var host = btn.closest(".pm-row, .pm-arow"), out = host && host.querySelector(".pm-msg");
    if (flag) {
      if (cardDirty(pk)) return msg(out, "Simpan atau batalkan perubahan produk ini dulu.", "err");
      var rest = shown(pk).filter(function (x) { return x !== v && x.active; });
      if (!rest.length) return msg(out, "Ini paket aktif terakhir. Untuk menyembunyikan semuanya, arsipkan seluruh produknya.", "err");
      var ok = await A.confirmBox("Hapus paket \"" + v.label + "\"?",
        "Paket akan DIARSIPKAN: hilang dari website dan tidak bisa dipesan. Order dan ulasan lama tetap aman, data tidak dihapus, dan paket bisa dipulihkan kapan saja.", "Arsipkan");
      if (!ok) return;
    }
    btn.disabled = true; msg(out, flag ? "Mengarsipkan..." : "Memulihkan...", "");
    var r = await setArchived("product_catalog", { product_key: pk, variant_id: vid }, flag);
    if (r.error || !r.data || !r.data.length) { msg(out, r.error ? dbError(r) : "Tidak ada data yang berubah. Cek migration & akses admin.", "err"); btn.disabled = false; return; }
    Object.assign(v, r.data[0]);
    redrawCard(pk);
  }

  /* ---------- mount ---------- */
  async function mount(v) {
    view = v;
    v.innerHTML =
      "<div class='card pm-info'><b>Kelola harga &amp; produk</b><p class='hint'>Ubah harga promo tanpa edit kode. Perubahan berlaku untuk <b>order baru</b>; order lama tidak berubah. " +
      "Customer akan melihat harga baru saat membuka / me-refresh halaman. Harga final order dihitung ulang oleh database, jadi aman dari manipulasi. " +
      "<b>Hapus = arsip</b>: produk / paket disembunyikan dari website tanpa menghapus data, jadi order &amp; ulasan lama tetap aman dan bisa dipulihkan.</p></div>" +
      "<div id='pm-list'><div class='empty'>Memuat produk...</div></div>";
    var res = await Promise.all([sb().from("product_catalog").select("*").order("sort", { ascending: true }), sb().from("product_catalog_groups").select("*")]);
    var bad = res[0].error || res[1].error;
    if (bad) { v.querySelector("#pm-list").innerHTML = "<div class='card'><h3>Gagal memuat produk</h3><p class='hint'>" + e(dbError({ error: bad })) + "</p></div>"; return; }
    VARS = res[0].data || [];
    var order = (g.MalikProducts ? g.MalikProducts.list.map(function (p) { return p.key; }) : []);
    GROUPS = (res[1].data || []).slice().sort(function (a, b) { return order.indexOf(a.product_key) - order.indexOf(b.product_key); });
    draw();

    var list = v.querySelector("#pm-list");
    list.addEventListener("input", function (ev) {
      var row = ev.target.closest(".pm-row"), box = ev.target.closest(".pm-grp");
      if (row) refreshRow(row); else if (box) refreshGrp(box);
    });
    list.addEventListener("change", function (ev) { var row = ev.target.closest(".pm-row"); if (row) refreshRow(row); });
    list.addEventListener("click", function (ev) {
      var b;
      if ((b = ev.target.closest("[data-garch]"))) return archiveGroup((b.closest("[data-pk]") || b.closest("[data-g]")).getAttribute("data-pk") || b.closest("[data-g]").getAttribute("data-g"), b.getAttribute("data-garch") === "1", b);
      if ((b = ev.target.closest("[data-varch]"))) { var rw = b.closest("[data-vid]"); return archiveVariant(rw.getAttribute("data-pk"), rw.getAttribute("data-vid"), b.getAttribute("data-varch") === "1", b); }
      if ((b = ev.target.closest("[data-save]"))) return saveRow(b.closest(".pm-row"), b);
      if ((b = ev.target.closest("[data-gsave]"))) return saveGroup(b.closest(".pm-grp"), b);
      if ((b = ev.target.closest("[data-reset]"))) { var row = b.closest(".pm-row"); row.querySelector("[data-f=price]").value = b.getAttribute("data-reset"); refreshRow(row); }
    });
    g.addEventListener("beforeunload", function (ev) { if (dirtyAny()) { ev.preventDefault(); ev.returnValue = ""; } });
  }

  g.AdminProducts = { mount: mount };
})(window);
