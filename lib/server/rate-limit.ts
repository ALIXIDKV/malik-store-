import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limit berbasis Postgres (fungsi malik_rate_hit, migrasi 20261015).
 * Dipakai API route; memori in-process tidak cocok untuk serverless (tiap instance punya hitungan sendiri).
 *
 * Perilaku saat database bermasalah / migrasi belum dijalankan: FAIL-OPEN (request tetap diproses, error dicatat).
 * Alasannya: fitur existing (daftar, upload) tidak boleh mati hanya karena pembatas gagal. Setelah migrasi
 * dijalankan, pembatas aktif otomatis tanpa deploy ulang.
 */
export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/** IP klien. Di Vercel header ini diisi platform (tidak bisa dipalsukan dari luar). Lokal/dev bisa dipalsukan. */
export function clientIp(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("x-real-ip") ||
    h.get("x-vercel-forwarded-for") ||
    (h.get("x-forwarded-for") || "").split(",")[0] ||
    "";
  return ip.trim().slice(0, 64) || "unknown";
}

/** Kunci disimpan sebagai hash: IP / email mentah tidak ditaruh di tabel rate limit. */
export const rateKey = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);

export async function rateLimit(
  bucket: string,
  rawKey: string,
  windowSec: number,
  max: number,
  sb?: SupabaseClient,
): Promise<RateResult> {
  try {
    const db = sb ?? createAdminClient();
    const r = await db.rpc("malik_rate_hit", { p_bucket: bucket, p_key: rateKey(rawKey), p_window: windowSec, p_max: max });
    if (r.error) throw r.error;
    const wait = Number(r.data) || 0;
    return wait > 0 ? { ok: false, retryAfter: wait } : { ok: true };
  } catch (e) {
    console.error("[rate-limit] gagal (fail-open)", bucket, e);
    return { ok: true };
  }
}

/** Respons 429 standar, lengkap dengan header Retry-After. */
export function tooMany(retryAfter: number, message = "Terlalu banyak permintaan. Coba lagi sebentar lagi.") {
  return NextResponse.json(
    { ok: false, message: `${message} (${retryAfter} detik)`, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}
