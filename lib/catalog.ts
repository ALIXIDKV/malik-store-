import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { CatalogGroup, CatalogVariant } from "@/types/database";

/**
 * Status katalog dibedakan agar UI tidak lagi menganggap semuanya "koneksi Supabase":
 * - ok           : data berhasil dibaca dan ada produk
 * - empty        : query berhasil tetapi tidak ada produk (bukan error koneksi)
 * - env_missing  : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak tersedia
 * - query_error  : Supabase menolak query (RLS/grant, tabel/kolom, jaringan, dll). Detail dicatat di log server.
 */
export type CatalogStatus = "ok" | "empty" | "env_missing" | "query_error";
export type CatalogResult = { status: CatalogStatus; groups: CatalogGroup[]; variants: CatalogVariant[] };
export type CatalogOptions = { productKey?: string; onlyActive?: boolean };

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null;

export function hasPublicSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

// Production lama mungkin belum menjalankan migration arsip (kolom `archived` tidak ada).
// Versi legacy (catalog-sync.js) menangani ini dengan mengulang query tanpa kolom tersebut.
function isMissingArchivedColumn(e: DbError) {
  if (!e) return false;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return /archived/i.test(msg) && (e.code === "42703" || e.code === "PGRST204" || /column|schema cache|does not exist/i.test(msg));
}

function logCatalogError(scope: string, e: NonNullable<DbError>) {
  // Hanya dicatat server-side (Vercel Runtime Logs). Tidak pernah dikirim ke UI/browser.
  console.error(`[catalog] ${scope} gagal`, { code: e.code, message: e.message, details: e.details, hint: e.hint });
}

async function fetchRows(sb: SupabaseClient, withArchivedFilter: boolean, o: CatalogOptions) {
  let g = sb.from("product_catalog_groups").select("*");
  let v = sb.from("product_catalog").select("*");
  if (o.productKey) { g = g.eq("product_key", o.productKey); v = v.eq("product_key", o.productKey); }
  if (withArchivedFilter) { g = g.eq("archived", false); v = v.eq("archived", false); }
  if (o.onlyActive) v = v.eq("active", true);
  const [gr, vr] = await Promise.all([g, v.order("sort")]);
  return { gr, vr };
}

/** Membaca katalog memakai Supabase client yang sudah ada (server, mengikuti RLS user/anon). */
export async function loadCatalog(sb: SupabaseClient, o: CatalogOptions = {}): Promise<CatalogResult> {
  try {
    let { gr, vr } = await fetchRows(sb, true, o);
    if (isMissingArchivedColumn(gr.error) || isMissingArchivedColumn(vr.error)) {
      console.warn("[catalog] kolom `archived` belum ada di database; membaca tanpa filter arsip (jalankan migration arsip jika ingin fitur arsip).");
      ({ gr, vr } = await fetchRows(sb, false, o));
    }
    if (gr.error || vr.error) {
      if (gr.error) logCatalogError("product_catalog_groups", gr.error);
      if (vr.error) logCatalogError("product_catalog", vr.error);
      return { status: "query_error", groups: [], variants: [] };
    }
    const norm = <T extends { archived?: boolean; archived_at?: string | null }>(r: T) => ({ ...r, archived: r.archived === true, archived_at: r.archived_at ?? null });
    const groups = ((gr.data ?? []) as CatalogGroup[]).map(norm).filter((x) => !x.archived);
    const variants = ((vr.data ?? []) as CatalogVariant[]).map(norm).filter((x) => !x.archived);
    return { status: groups.length ? "ok" : "empty", groups, variants };
  } catch (err) {
    // Hanya kegagalan jaringan/runtime tak terduga. Error khusus Next.js (dynamic bailout/redirect/notFound) harus dilempar ulang.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[catalog] exception tak terduga", err);
    return { status: "query_error", groups: [], variants: [] };
  }
}

/** Untuk halaman publik: membuat server client sendiri dan membedakan env hilang dari error query. */
export async function loadPublicCatalog(o: CatalogOptions = {}): Promise<CatalogResult> {
  if (!hasPublicSupabaseEnv()) {
    console.error("[catalog] env publik Supabase hilang: NEXT_PUBLIC_SUPABASE_URL dan/atau NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak terbaca saat runtime/build.");
    return { status: "env_missing", groups: [], variants: [] };
  }
  const sb = await createClient(); // tidak dibungkus try/catch: dynamic bailout Next.js tidak boleh tertelan
  return loadCatalog(sb, o);
}
