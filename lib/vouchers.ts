import type { SupabaseClient } from "@supabase/supabase-js";
import type { Voucher } from "@/types/database";
import { withTimeout } from "./with-timeout";

// ---------- Checkout (user): preview. Angka FINAL tetap dihitung trigger database saat order disimpan. ----------
export type VoucherQuote = { valid: boolean; message: string; subtotal: number | null; discount: number; total: number | null };

export async function previewVoucher(db: SupabaseClient, code: string, product: string): Promise<VoucherQuote> {
  const bad = (message: string): VoucherQuote => ({ valid: false, message, subtotal: null, discount: 0, total: null });
  try {
    const r = await withTimeout(db.rpc("malik_preview_voucher", { p_code: code, p_product: product }), 15_000);
    if (r.error) {
      const missing = r.error.code === "PGRST202" || r.error.code === "42883" || /could not find the function/i.test(r.error.message || "");
      return bad(missing ? "Fitur voucher belum aktif." : "Voucher tidak dapat dicek sekarang. Coba lagi.");
    }
    const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { valid: boolean; message: string; subtotal: number | null; discount: number | null; total: number | null } | null;
    if (!row) return bad("Voucher tidak dapat dicek sekarang. Coba lagi.");
    return { valid: !!row.valid, message: row.message || "", subtotal: row.subtotal, discount: row.discount ?? 0, total: row.total };
  } catch (e) {
    console.error("[voucher] preview gagal", e);
    return bad("Koneksi bermasalah. Periksa internet lalu coba lagi.");
  }
}

export const cleanVoucherCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);

// ---------- Admin: form -> payload ----------
export type VoucherForm = { code: string; type: "percent" | "fixed"; value: string; min: string; expires: string; limit: string; perUser: string; firstOrder: boolean; active: boolean };
export const emptyVoucherForm: VoucherForm = { code: "", type: "percent", value: "", min: "0", expires: "", limit: "", perUser: "1", firstOrder: false, active: true };

export const formFromVoucher = (v: Voucher): VoucherForm => ({
  code: v.code, type: v.discount_type, value: String(v.discount_value), min: String(v.min_purchase),
  expires: v.expires_at ? new Date(v.expires_at).toLocaleDateString("sv-SE") : "", // yyyy-mm-dd (zona waktu perangkat)
  limit: v.usage_limit == null ? "" : String(v.usage_limit),
  perUser: v.per_user_limit == null ? "" : String(v.per_user_limit), firstOrder: !!v.first_order_only, active: v.active,
});

export type VoucherPayload = { code: string; discount_type: "percent" | "fixed"; discount_value: number; min_purchase: number; expires_at: string | null; usage_limit: number | null; per_user_limit: number | null; first_order_only: boolean; active: boolean };

const int = (s: string) => (/^\d{1,10}$/.test(s.trim()) ? parseInt(s.trim(), 10) : NaN);

export function buildVoucherPayload(f: VoucherForm): { error: string } | { payload: VoucherPayload } {
  const code = f.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { error: "Kode 3-32 karakter: huruf, angka, _ atau -." };
  const value = int(f.value);
  if (!(value > 0)) return { error: "Nilai diskon harus lebih dari 0." };
  if (f.type === "percent" && value > 99) return { error: "Diskon persen maksimal 99." };
  if (value > 2_000_000_000) return { error: "Nilai diskon terlalu besar." };
  const min = f.min.trim() === "" ? 0 : int(f.min);
  if (!(min >= 0) || min > 2_000_000_000) return { error: "Minimal pembelian tidak valid." };
  let limit: number | null = null;
  if (f.limit.trim() !== "") { limit = int(f.limit); if (!(limit > 0)) return { error: "Batas penggunaan harus lebih dari 0, atau kosongkan." }; }
  let perUser: number | null = null;
  if (f.perUser.trim() !== "") { perUser = int(f.perUser); if (!(perUser > 0)) return { error: "Batas per user harus lebih dari 0, atau kosongkan (tanpa batas)." }; }
  let expires: string | null = null;
  if (f.expires) {
    const d = new Date(`${f.expires}T23:59:59`); // berlaku sampai akhir hari yang dipilih
    if (Number.isNaN(d.getTime())) return { error: "Tanggal expired tidak valid." };
    expires = d.toISOString();
  }
  return { payload: { code, discount_type: f.type, discount_value: value, min_purchase: min, expires_at: expires, usage_limit: limit, per_user_limit: perUser, first_order_only: f.firstOrder, active: f.active } };
}

export function voucherError(e: { code?: string; message?: string } | null | undefined): string {
  const code = String(e?.code || ""), msg = String(e?.message || "");
  if (code === "23505") return "Kode voucher sudah dipakai. Gunakan kode lain.";
  if (code === "23514") return "Nilai voucher tidak valid (persen 1-99, angka harus positif).";
  if (code === "42501") return "Hanya admin yang boleh mengelola voucher.";
  if (code === "42703" || code === "PGRST204") return "Kolom voucher baru belum ada. Jalankan migration 20261017_voucher_redemptions.sql di Supabase.";
  if (code === "42P01" || code === "PGRST205") return "Tabel voucher belum ada. Jalankan migration 20261013_vouchers.sql di Supabase.";
  if (/fetch|network|timeout|failed to load/i.test(msg)) return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  return "Voucher gagal disimpan. Coba lagi.";
}

export type VoucherStatus = "aktif" | "nonaktif" | "kedaluwarsa" | "habis";
export function voucherStatus(v: Voucher, now = Date.now()): VoucherStatus {
  if (!v.active) return "nonaktif";
  if (v.expires_at && new Date(v.expires_at).getTime() <= now) return "kedaluwarsa";
  if (v.usage_limit != null && v.used_count >= v.usage_limit) return "habis";
  return "aktif";
}
