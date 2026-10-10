import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogGroup, CatalogVariant } from "@/types/database";
import { withAbortTimeout } from "@/lib/with-timeout";

// Batas ini SAMA dengan trigger database (migrasi 20261010_product_management.sql); database tetap penentu akhir.
export const LIMITS = { name: 60, description: 800, label: 40, priceMin: 1, priceMax: 100_000_000 } as const;

/** "SC Ourin Deluxe" -> "sc_ourin_deluxe". Hanya a-z, 0-9, underscore; maksimal 40 karakter. */
export function slugKey(input: string): string {
  return input
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/g, "");
}
export const isValidKey = (k: string) => /^[a-z0-9][a-z0-9_]{1,39}$/.test(k);

/** Kode varian unik di dalam satu produk: "3x update" -> "3x_update", bentrok -> "3x_update_2". */
export function uniqueVariantId(label: string, taken: string[]): string {
  const base = slugKey(label) || "varian";
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base.slice(0, 36)}_${i}`;
    if (!taken.includes(c)) return c;
  }
  return `${base.slice(0, 30)}_${Date.now().toString(36)}`;
}

/** Harga dari teks input; hanya bilangan bulat Rp1 - Rp100.000.000. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/[.\s]/g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= LIMITS.priceMin && n <= LIMITS.priceMax ? n : null;
}

export function validateName(v: string): string | null {
  const s = v.trim();
  return s.length < 1 || s.length > LIMITS.name ? `Nama produk harus 1-${LIMITS.name} karakter.` : null;
}
export function validateDescription(v: string): string | null {
  const s = v.trim();
  return s.length < 1 || s.length > LIMITS.description ? `Deskripsi harus 1-${LIMITS.description} karakter.` : null;
}
export function validateLabel(v: string): string | null {
  const s = v.trim();
  if (s.length < 1 || s.length > LIMITS.label) return `Nama varian harus 1-${LIMITS.label} karakter.`;
  // Akhiran " x3" dibaca sistem order sebagai jumlah, jadi tidak boleh dipakai sebagai nama varian.
  if (/\sx\d+$/i.test(s)) return 'Nama varian tidak boleh berakhir dengan " x" diikuti angka (dipakai sistem untuk jumlah order).';
  return null;
}
export function validatePrice(text: string): string | null {
  return parsePrice(text) === null ? "Harga harus angka bulat antara Rp1 dan Rp100.000.000." : null;
}

type DbErr = { code?: string; message?: string } | null | undefined;

/** Pesan ramah untuk admin. Detail teknis hanya ke console. */
export function adminError(e: DbErr): string {
  const msg = String(e?.message || ""), code = String(e?.code || "");
  if (code === "22023") return msg; // pesan dari trigger database (sudah berbahasa Indonesia)
  if (code === "23505") {
    if (/order_name/i.test(msg)) return "Kombinasi nama produk dan varian ini sudah dipakai. Ubah nama varian.";
    if (/groups_pkey/i.test(msg)) return "Kode produk sudah dipakai. Ganti kode produk.";
    return "Kode varian sudah dipakai di produk ini. Ubah nama varian.";
  }
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Tidak punya izin, atau migrasi database Tahap 2B belum dijalankan.";
  if (code === "42703" || code === "PGRST204") return "Struktur database belum sesuai. Jalankan migrasi Tahap 2B.";
  if (/fetch|network|timeout|failed to load/i.test(msg)) return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  return "Gagal menyimpan. Coba lagi.";
}

export type Edit = { label?: string; price?: string; active?: boolean };
export type GroupEdit = { name?: string; description?: string };

/** Varian dianggap tampil bila aktif dan tidak diarsipkan (arsip lama dari fitur sebelumnya). */
export const variantLive = (v: Pick<CatalogVariant, "active" | "archived">) => v.active && !v.archived;

// Baris dari database lama bisa belum punya kolom archived/archived_at; samakan bentuknya dengan tipe aplikasi.
function norm<T>(r: unknown): T {
  const x = r as { archived?: boolean; archived_at?: string | null };
  return { ...x, archived: x.archived === true, archived_at: x.archived_at ?? null } as T;
}

function logErr(scope: string, e: DbErr) { console.error(`[admin/products] ${scope}`, { code: e?.code, message: e?.message }); }

export async function insertVariant(
  db: SupabaseClient, productKey: string, v: { label: string; price: number; taken: string[] },
): Promise<{ row: CatalogVariant } | { error: string }> {
  const variant_id = uniqueVariantId(v.label, v.taken);
  // order_name & sort TIDAK dikirim: dibuat trigger database (stabil, tidak bisa dipalsukan dari browser).
  const r = await db.from("product_catalog").insert({ product_key: productKey, variant_id, label: v.label.trim(), price: v.price, active: true }).select().single();
  if (r.error) { logErr("insert varian gagal", r.error); return { error: adminError(r.error) }; }
  return { row: norm<CatalogVariant>(r.data) };
}

export type CreateResult = { group: CatalogGroup; variants: CatalogVariant[]; existing: boolean };

const rpcMissing = (e: NonNullable<DbErr>) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(String(e.message || ""));
const CREATE_TIMEOUT_MS = 20_000;

/**
 * Produk + SEMUA varian disimpan dalam SATU transaksi database (RPC malik_admin_create_product):
 * semuanya tersimpan atau tidak ada yang tersimpan, jadi tidak ada produk setengah jadi di katalog.
 * Retry aman: varian id dibuat deterministik dari nama varian, dan RPC mengembalikan produk yang sudah ada bila isinya identik
 * (mis. request sebelumnya sebenarnya sukses tetapi respons hilang), tanpa membuat duplikat.
 * Sengaja TIDAK ada jalur cadangan multi-request: bila RPC belum dimigrasi, tampilkan pesan jelas.
 */
export async function createProduct(
  db: SupabaseClient, input: { key: string; name: string; description: string; variants: { label: string; price: number }[] },
): Promise<CreateResult | { fatal: string }> {
  const taken: string[] = [];
  const payload = input.variants.map((v) => { const variant_id = uniqueVariantId(v.label, taken); taken.push(variant_id); return { variant_id, label: v.label.trim(), price: v.price }; });
  try {
    const r = await withAbortTimeout(
      (signal) => db.rpc("malik_admin_create_product", { p_key: input.key, p_name: input.name.trim(), p_description: input.description.trim(), p_variants: payload }).abortSignal(signal),
      CREATE_TIMEOUT_MS,
    );
    if (r.error) {
      logErr("buat produk gagal (tidak ada yang tersimpan)", r.error);
      if (rpcMissing(r.error)) return { fatal: "Fitur tambah produk belum aktif di database. Jalankan migrasi 20261012_create_product_atomic.sql di Supabase SQL Editor." };
      return { fatal: adminError(r.error) };
    }
    const d = r.data as { existing?: boolean; group?: unknown; variants?: unknown[] } | null;
    if (!d || !d.group || !Array.isArray(d.variants)) return { fatal: "Respons database tidak dikenali. Muat ulang halaman untuk memeriksa apakah produk sudah tersimpan." };
    return { group: norm<CatalogGroup>(d.group), variants: d.variants.map((x) => norm<CatalogVariant>(x)), existing: d.existing === true };
  } catch (e) {
    console.error("[admin/products] buat produk: koneksi terputus / timeout", e);
    return { fatal: "Koneksi terputus atau terlalu lama. Produk mungkin sudah tersimpan. Tekan Simpan produk lagi: aman, tidak akan membuat duplikat." };
  }
}

/** Aktif/nonaktif seluruh produk (kolom archived). Order lama, riwayat, dan ulasan tidak disentuh. */
export async function setProductArchived(db: SupabaseClient, key: string, archived: boolean): Promise<{ group: CatalogGroup } | { error: string }> {
  const r = await db.from("product_catalog_groups").update({ archived }).eq("product_key", key).select();
  if (r.error) { logErr("ubah status produk gagal", r.error); return { error: adminError(r.error) }; }
  if (!r.data?.length) return { error: "Tidak punya izin mengubah produk ini." }; // RLS menolak diam-diam = 0 baris
  return { group: norm<CatalogGroup>(r.data[0]) };
}

export async function saveGroup(db: SupabaseClient, key: string, v: { name: string; description: string }): Promise<{ group: CatalogGroup } | { error: string }> {
  const r = await db.from("product_catalog_groups").update({ name: v.name.trim(), description: v.description.trim() }).eq("product_key", key).select();
  if (r.error) { logErr("simpan produk gagal", r.error); return { error: adminError(r.error) }; }
  if (!r.data?.length) return { error: "Tidak punya izin mengubah produk ini." };
  return { group: norm<CatalogGroup>(r.data[0]) };
}

export async function saveVariant(
  db: SupabaseClient, cur: CatalogVariant, v: { label: string; price: number; active: boolean },
): Promise<{ row: CatalogVariant } | { error: string }> {
  // Mengaktifkan varian yang sebelumnya diarsipkan (fitur lama) juga membuka arsipnya.
  const patch: { label: string; price: number; active: boolean; archived?: boolean } = { label: v.label.trim(), price: v.price, active: v.active };
  if (v.active && cur.archived) patch.archived = false;
  const r = await db.from("product_catalog").update(patch).eq("product_key", cur.product_key).eq("variant_id", cur.variant_id).select();
  if (r.error) { logErr("simpan varian gagal", r.error); return { error: adminError(r.error) }; }
  if (!r.data?.length) return { error: "Tidak punya izin mengubah varian ini." };
  return { row: norm<CatalogVariant>(r.data[0]) };
}
