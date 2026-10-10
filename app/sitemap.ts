import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600;
// Cadangan bila katalog tidak terbaca (env hilang / Supabase tidak terjangkau).
const FALLBACK = ["panel", "sewa_bot", "reseller_admin", "sc_ourin_deluxe"];

// Produk diambil dari Supabase (sumber kebenaran), jadi produk baru dari admin otomatis masuk sitemap.
async function productKeys(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return FALLBACK;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await sb.from("product_catalog_groups").select("product_key").eq("archived", false);
    if (r.error || !r.data?.length) return FALLBACK; // termasuk bila kolom `archived` belum ada
    return r.data.map((x: { product_key: string }) => x.product_key);
  } catch { return FALLBACK; }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = process.env.NEXT_PUBLIC_SITE_URL || "https://malik-store.my.id";
  const paths = ["", "/tentang", ...(await productKeys()).map((k) => `/product/${encodeURIComponent(k)}`)];
  return paths.map((p) => ({ url: s + p, lastModified: new Date(), changeFrequency: p ? "weekly" : "daily", priority: p ? 0.8 : 1 }));
}
