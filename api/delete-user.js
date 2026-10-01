/* POST /api/delete-user  { userId }  + header Authorization: Bearer <access_token admin>
 * Hapus akun user PERMANEN (Supabase Auth + data order & chat milik user itu). Hanya admin; admin lain / diri sendiri tidak bisa dihapus. */
"use strict";
const L = require("./_lib");

module.exports = async function (req, res) {
  const body = L.guard(req, res); if (!body) return;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const userId = String(body.userId == null ? "" : body.userId).trim();
  if (!token) return L.send(res, 401, { ok: false, message: "Sesi admin tidak ditemukan. Login ulang." });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return L.send(res, 400, { ok: false, message: "ID user tidak valid." });

  try {
    const sb = L.supabaseAdmin();

    // 1) pemanggil harus admin (token diverifikasi ke Supabase Auth, role dibaca dari tabel profiles)
    const who = await sb.auth.getUser(token);
    if (who.error || !who.data || !who.data.user) return L.send(res, 401, { ok: false, message: "Sesi admin tidak valid. Login ulang." });
    const me = who.data.user;
    const mp = await sb.from("profiles").select("role").eq("id", me.id).maybeSingle();
    if (!mp.data || mp.data.role !== "admin") return L.send(res, 403, { ok: false, message: "Hanya admin yang boleh menghapus user." });
    if (me.id === userId) return L.send(res, 400, { ok: false, message: "Akun admin sendiri tidak bisa dihapus." });

    const tp = await sb.from("profiles").select("id,email,role").eq("id", userId).maybeSingle();
    if (tp.data && tp.data.role === "admin") return L.send(res, 403, { ok: false, message: "Akun admin tidak boleh dihapus." });
    const email = tp.data && tp.data.email ? L.normEmail(tp.data.email) : "";

    // 2) bersihkan data milik user, lalu hapus akun Auth
    await sb.from("messages").delete().eq("user_id", userId);
    await sb.from("orders").delete().eq("user_id", userId);
    let d = await sb.auth.admin.deleteUser(userId);
    if (d.error && !(d.error.status === 404 || d.error.code === "user_not_found")) {
      // kemungkinan FK dari profiles tanpa cascade: hapus profil dulu lalu coba lagi
      await sb.from("profiles").delete().eq("id", userId);
      d = await sb.auth.admin.deleteUser(userId);
    }
    if (d.error && !(d.error.status === 404 || d.error.code === "user_not_found")) {
      console.error("[delete-user] deleteUser:", d.error.status, d.error.code, d.error.message);
      return L.send(res, 500, { ok: false, message: "Gagal menghapus akun: " + (d.error.message || "kesalahan server") });
    }
    await sb.from("profiles").delete().eq("id", userId);                         // sisa profil (jika tidak ikut cascade)
    if (email) await sb.from("email_otps").delete().eq("email", email);          // supaya email bisa dipakai daftar ulang saat testing
    return L.send(res, 200, { ok: true, message: "User dihapus." });
  } catch (e) {
    console.error("[delete-user]", e && (e.message || e));
    return L.send(res, 500, { ok: false, message: "Terjadi kesalahan server. Coba lagi." });
  }
};
