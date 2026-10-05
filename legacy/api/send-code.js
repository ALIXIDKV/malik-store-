/* POST /api/send-code  { email }  ->  kirim kode verifikasi 6 digit ke email via Gmail SMTP. Kode TIDAK pernah ada di response. */
"use strict";
const L = require("./_lib");

module.exports = async function (req, res) {
  const body = L.guard(req, res); if (!body) return;
  const email = L.normEmail(body.email);
  if (!L.isEmail(email)) return L.send(res, 400, { ok: false, message: "Email tidak valid." });

  try {
    const sb = L.supabaseAdmin();

    const reg = await sb.rpc("malik_email_registered", { p_email: email });
    if (reg.error) throw reg.error;
    if (reg.data === true) return L.send(res, 409, { ok: false, message: "Email sudah terdaftar. Silakan masuk." });

    const code = L.generateCode();
    const iss = await sb.rpc("malik_issue_otp", {
      p_email: email, p_hash: L.hashCode(email, code),
      p_ttl: L.OTP_TTL_SECONDS, p_cooldown: L.COOLDOWN_SECONDS, p_max_per_hour: L.MAX_SENDS_PER_HOUR
    });
    if (iss.error) throw iss.error;
    const wait = Number(iss.data) || 0;
    if (wait > 0) return L.send(res, 429, { ok: false, message: "Tunggu " + wait + " detik sebelum meminta kode lagi.", retryAfter: wait });

    try {
      await L.mailer().sendMail({
        from: '"Malik Store" <' + process.env.GMAIL_USER + ">",
        to: email,
        subject: "Kode Verifikasi Malik Store",
        text: "Kode verifikasi Malik Store: " + code + "\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.",
        html:
          '<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #e3e8ef;border-radius:12px">' +
          '<h2 style="margin:0 0 16px">MALIK<span style="color:#00b34a">STORE</span></h2>' +
          '<p style="margin:0 0 12px;color:#333">Kode verifikasi pendaftaran kamu:</p>' +
          '<div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#111;margin:8px 0 16px">' + code + "</div>" +
          '<p style="margin:0;color:#666;font-size:13px">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika kamu tidak mendaftar.</p></div>'
      });
    } catch (mailErr) {
      console.error("[send-code] Gagal kirim email:", mailErr && (mailErr.code || mailErr.message));
      // Lepas cooldown supaya user bisa mencoba lagi tanpa menunggu.
      await sb.from("email_otps").update({ last_sent_at: new Date(0).toISOString() }).eq("email", email);
      return L.send(res, 502, { ok: false, message: "Gagal mengirim email. Coba lagi sebentar lagi." });
    }

    return L.send(res, 200, { ok: true, message: "Kode verifikasi dikirim ke email kamu. Berlaku 10 menit.", cooldown: L.COOLDOWN_SECONDS, expiresIn: L.OTP_TTL_SECONDS });
  } catch (e) {
    console.error("[send-code]", e && (e.message || e));
    return L.send(res, 500, { ok: false, message: "Terjadi kesalahan server. Coba lagi." });
  }
};
