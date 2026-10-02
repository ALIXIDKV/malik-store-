/* POST /api/register  { email, username, password, code }  ->  verifikasi kode lalu buat akun Supabase (email langsung verified, tanpa link konfirmasi). */
"use strict";
const L = require("./_lib");

const OTP_MSG = {
  none: "Kode belum diminta atau sudah dipakai. Klik Kirim Kode.",
  expired: "Kode sudah kedaluwarsa. Kirim kode baru.",
  locked: "Terlalu banyak percobaan salah. Kirim kode baru.",
  invalid: "Kode verifikasi salah."
};

module.exports = async function (req, res) {
  const body = L.guard(req, res); if (!body) return;
  const email = L.normEmail(body.email);
  const username = String(body.username == null ? "" : body.username).trim().replace(/\s+/g, " ");
  const password = String(body.password == null ? "" : body.password);
  const code = String(body.code == null ? "" : body.code).trim();

  if (!L.isEmail(email)) return L.send(res, 400, { ok: false, message: "Email tidak valid." });
  if (username.length < 2 || username.length > 40) return L.send(res, 400, { ok: false, message: "Username 2-40 karakter." });
  if (password.length < 6 || password.length > 72) return L.send(res, 400, { ok: false, message: "Password 6-72 karakter." });
  if (!/^\d{6}$/.test(code)) return L.send(res, 400, { ok: false, message: "Kode verifikasi harus 6 digit." });

  try {
    const sb = L.supabaseAdmin();

    const reg = await sb.rpc("malik_email_registered", { p_email: email });
    if (reg.error) throw reg.error;
    if (reg.data === true) return L.send(res, 409, { ok: false, message: "Email sudah terdaftar. Silakan masuk." });

    // Cek kode atomik di database (hitung percobaan, maks 5, kedaluwarsa 10 menit, sekali pakai).
    const v = await sb.rpc("malik_verify_otp", { p_email: email, p_hash: L.hashCode(email, code), p_max_attempts: 5 });
    if (v.error) throw v.error;
    if (v.data !== "ok") return L.send(res, 400, { ok: false, message: OTP_MSG[v.data] || OTP_MSG.invalid, reason: v.data });

    const c = await sb.auth.admin.createUser({ email: email, password: password, email_confirm: true, user_metadata: { username: username } });
    if (c.error) {
      const m = String(c.error.message || ""), cd = String(c.error.code || "");
      console.error("[register] createUser:", c.error.status, cd, m);
      if (cd === "email_exists" || /already.*(registered|exists)/i.test(m)) return L.send(res, 409, { ok: false, message: "Email sudah terdaftar. Silakan masuk." });
      if (cd === "weak_password") return L.send(res, 400, { ok: false, message: "Password terlalu lemah." });
      return L.send(res, 500, { ok: false, message: "Gagal membuat akun. Kirim kode baru lalu coba lagi." });
    }
    // Pastikan nama yang diketik user tersimpan di profiles (trigger bawaan bisa saja mengisinya dari email). Gagal di sini tidak membatalkan akun.
    try {
      const uid = c.data && c.data.user && c.data.user.id;
      if (uid) {
        const up = await sb.from("profiles").upsert({ id: uid, email: email, username: username }, { onConflict: "id" });
        if (up.error) console.error("[register] profiles upsert:", up.error.message);
      }
    } catch (e) { console.error("[register] profiles:", e && (e.message || e)); }
    return L.send(res, 200, { ok: true, message: "Akun berhasil dibuat." });
  } catch (e) {
    console.error("[register]", e && (e.message || e));
    return L.send(res, 500, { ok: false, message: "Terjadi kesalahan server. Coba lagi." });
  }
};
