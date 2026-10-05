/* POST /api/delete-user  { userId }  + header Authorization: Bearer <access_token admin>
 * Hapus akun user PERMANEN. Hanya admin; admin lain / diri sendiri tidak bisa dihapus.
 *
 * Urutan (tiap tahap dicek error-nya, berhenti di tahap yang gagal dan memberi tahu tahap mana):
 *   1. messages  -> chat milik user
 *   2. reviews   -> ulasan milik user
 *   3. orders    -> HANYA jika tahap 4/5 gagal (mis. FK dari orders menghalangi), lalu tahap 4-5 diulang sekali.
 *                   Jika tidak menghalangi, order dibiarkan (riwayat tidak dihapus tanpa perlu).
 *   4. profiles  -> profil user
 *   5. auth      -> akun login (Supabase Auth, auth.users)
 *   6. email_otps -> kode verifikasi email (opsional; gagal hanya jadi peringatan)
 * Respons: { ok, message, stage?, ordersDeleted?, warnings? }. Semua tahap aman dijalankan ulang (idempotent).
 */
"use strict";
const L = require("./_lib");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function missingTable(e) { return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|could not find the table/i.test(e.message || "")); }
function notFound(e) { return !!e && (e.status === 404 || e.code === "user_not_found"); }
// Error yang menandakan data lain (mis. orders) menghalangi penghapusan -> baru boleh menghapus order. Error jaringan/izin tidak termasuk.
function looksBlocked(e) { return !!e && (e.code === "23503" || /foreign key|violates|constraint|database error/i.test(e.message || "")); }
function errText(e) { return (e && (e.message || e.details || e.code)) || "kesalahan tidak diketahui"; }

// Hapus semua baris tabel milik user. Mengembalikan error (atau null).
async function wipe(sb, table, col, userId) {
  const r = await sb.from(table).delete().eq(col, userId);
  return r.error || null;
}

module.exports = async function (req, res) {
  const body = L.guard(req, res); if (!body) return;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const userId = String(body.userId == null ? "" : body.userId).trim();
  if (!token) return L.send(res, 401, { ok: false, message: "Sesi admin tidak ditemukan. Login ulang." });
  if (!UUID.test(userId)) return L.send(res, 400, { ok: false, message: "ID user tidak valid." });

  // Gagal di satu tahap: log lengkap di server, pesan jelas (nama tahap + alasan) ke admin.
  function fail(stage, label, e, extra) {
    console.error("[delete-user] GAGAL tahap=" + stage, "user=" + userId, "status=" + (e && e.status), "code=" + (e && e.code), "msg=" + errText(e));
    return L.send(res, 500, Object.assign({ ok: false, stage: stage, message: "Gagal di tahap " + label + ": " + errText(e) + "." + (extra && extra.hint ? " " + extra.hint : "") }, extra || {}));
  }

  try {
    const sb = L.supabaseAdmin();

    /* ---- 0) pemanggil harus admin; target bukan admin & bukan diri sendiri ---- */
    const who = await sb.auth.getUser(token);
    if (who.error || !who.data || !who.data.user) return L.send(res, 401, { ok: false, message: "Sesi admin tidak valid. Login ulang." });
    const me = who.data.user;

    const mp = await sb.from("profiles").select("role").eq("id", me.id).maybeSingle();
    if (mp.error) return fail("cek-admin", "pengecekan akses admin", mp.error);
    if (!mp.data || mp.data.role !== "admin") return L.send(res, 403, { ok: false, message: "Hanya admin yang boleh menghapus user." });
    if (me.id === userId) return L.send(res, 400, { ok: false, message: "Akun admin sendiri tidak bisa dihapus." });

    const tp = await sb.from("profiles").select("id,email,role").eq("id", userId).maybeSingle();
    if (tp.error) return fail("cek-user", "pengecekan data user", tp.error);   // jangan lanjut kalau role target tidak bisa dipastikan
    if (tp.data && tp.data.role === "admin") return L.send(res, 403, { ok: false, message: "Akun admin tidak boleh dihapus." });
    const email = tp.data && tp.data.email ? L.normEmail(tp.data.email) : "";

    const warnings = [];
    let ordersDeleted = false;

    /* ---- 1) messages ---- */
    let e = await wipe(sb, "messages", "user_id", userId);
    if (e) return fail("messages", "hapus chat (messages)", e);

    /* ---- 2) reviews ---- */
    e = await wipe(sb, "reviews", "user_id", userId);
    if (e) {
      if (missingTable(e)) warnings.push("Tabel reviews tidak ditemukan, tahap ulasan dilewati.");
      else return fail("reviews", "hapus ulasan (reviews)", e);
    }

    /* ---- 4) profiles + 5) auth ---- */
    async function removeAccount() {
      const pr = await sb.from("profiles").delete().eq("id", userId);
      if (pr.error) return { stage: "profiles", label: "hapus profil (profiles)", error: pr.error };
      const d = await sb.auth.admin.deleteUser(userId);
      if (d.error && !notFound(d.error)) return { stage: "auth", label: "hapus akun login (auth)", error: d.error };
      return null;
    }

    let blocked = await removeAccount();
    if (blocked && !looksBlocked(blocked.error)) return fail(blocked.stage, blocked.label, blocked.error);   // bukan karena data lain: jangan sentuh order
    if (blocked) {
      // ---- 5) order menghalangi (umumnya FK orders.user_id): hapus order user ini, lalu ulangi sekali ----
      console.warn("[delete-user] tahap " + blocked.stage + " gagal (" + errText(blocked.error) + "), mencoba hapus orders lalu ulangi.");
      e = await wipe(sb, "orders", "user_id", userId);
      if (e) return fail("orders", "hapus order (orders; sebelumnya " + blocked.label + " gagal: " + errText(blocked.error) + ")", e);
      ordersDeleted = true;
      blocked = await removeAccount();
      if (blocked) {
        const hint = blocked.stage === "auth"
          ? "Profil & data user sudah terhapus, tetapi akun login belum. Hapus manual di Supabase > Authentication > Users (ID: " + userId + ")."
          : "Order milik user sudah terhapus; ulangi hapus user setelah masalahnya diperbaiki.";
        return fail(blocked.stage, blocked.label, blocked.error, { ordersDeleted: true, hint: hint });
      }
    }

    /* ---- 6) email_otps (opsional, supaya email bisa dipakai daftar ulang saat testing) ---- */
    if (email) {
      const oe = await wipe(sb, "email_otps", "email", email);
      if (oe && !missingTable(oe)) { console.error("[delete-user] email_otps:", errText(oe)); warnings.push("Kode verifikasi email belum terhapus: " + errText(oe)); }
    }

    return L.send(res, 200, {
      ok: true, ordersDeleted: ordersDeleted, warnings: warnings,
      message: ordersDeleted ? "User dihapus. Order milik user ikut dihapus karena menghalangi penghapusan akun." : "User dihapus. Riwayat order dipertahankan."
    });
  } catch (err) {
    console.error("[delete-user] error tak terduga:", err && (err.stack || err.message || err));
    return L.send(res, 500, { ok: false, stage: "server", message: "Terjadi kesalahan server: " + errText(err) + ". Coba lagi." });
  }
};
