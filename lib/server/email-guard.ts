import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PATCH 2B - perlindungan signup.
 *  - canonicalEmail(): bentuk "kanonik" email untuk kunci rate limit & cek duplikat (cermin SQL malik_canonical_email).
 *  - isDisposableEmail(): daftar KONSERVATIF domain email sekali-pakai yang sudah sangat dikenal.
 *  - emailTaken(): cek email sudah terdaftar (kanonik). Jatuh ke fungsi lama jika migrasi 20261016 belum dijalankan.
 * Tidak menyentuh alur OTP.
 */

// Gmail: titik & +tag diabaikan Google. googlemail.com = gmail.com.
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
// Penyedia ini mendukung +tag (alias). Titik TIDAK dibuang di sini.
const PLUS_ONLY = new Set([
  "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "pm.me",
]);

export function canonicalEmail(raw: string): string {
  const e = String(raw ?? "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1 || at !== e.lastIndexOf("@")) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (GMAIL.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
  } else if (PLUS_ONLY.has(domain)) {
    local = local.split("+")[0];
  }
  return local ? `${local}@${domain}` : e;
}

// Sengaja pendek: hanya layanan email sekali-pakai yang sangat umum. Salah-blokir user normal lebih buruk daripada lolos.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com",
  "tempmail.net", "throwawaymail.com", "yopmail.com", "yopmail.fr", "trashmail.com", "trashmail.net",
  "getnada.com", "nada.email", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mailnesia.com",
  "mintemail.com", "emailondeck.com", "tempail.com", "burnermail.io", "discard.email", "spamgap.com",
]);

/** Matikan pemblokiran dengan env BLOCK_DISPOSABLE_EMAIL=0 (tanpa deploy ulang kode). */
export function isDisposableEmail(email: string): boolean {
  if (process.env.BLOCK_DISPOSABLE_EMAIL === "0") return false;
  const d = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (!d) return false;
  for (const x of DISPOSABLE) if (d === x || d.endsWith("." + x)) return true;
  return false;
}

export const DISPOSABLE_MESSAGE = "Gunakan email pribadi (bukan email sekali-pakai).";

/** true = email (atau alias kanoniknya) sudah terdaftar. */
export async function emailTaken(sb: SupabaseClient, email: string): Promise<boolean> {
  const c = await sb.rpc("malik_canonical_registered", { p_email: email });
  if (!c.error) return c.data === true;
  // Migrasi belum dijalankan (fungsi belum ada): perilaku lama, urutan deploy bebas.
  if (c.error.code === "42883" || c.error.code === "PGRST202") {
    const old = await sb.rpc("malik_email_registered", { p_email: email });
    if (old.error) throw old.error;
    return old.data === true;
  }
  throw c.error;
}
