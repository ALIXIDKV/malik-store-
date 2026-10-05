import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { loadCatalog } from "@/lib/catalog";

// Daftar produk diambil dari katalog (bukan hardcode) agar sitemap tidak memuat URL produk yang 404.
export const revalidate = 3600;

async function productKeys(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const cat = await loadCatalog(sb, { onlyActive: true });
    return cat.groups.map((g) => g.product_key);
  } catch (err) {
    console.error("[sitemap] gagal memuat katalog", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = process.env.NEXT_PUBLIC_SITE_URL || "https://malik-store.my.id";
  const paths = ["", "/tentang", ...(await productKeys()).map((k) => `/product/${encodeURIComponent(k)}`)];
  return paths.map((p) => ({ url: s + p, lastModified: new Date(), changeFrequency: p ? "weekly" : "daily", priority: p ? 0.8 : 1 }));
}
