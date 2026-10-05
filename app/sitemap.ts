import type { MetadataRoute } from "next";
export default function sitemap():MetadataRoute.Sitemap{const s=process.env.NEXT_PUBLIC_SITE_URL||"https://malik-store.my.id";return ["","/tentang","/product/panel","/product/sewa_bot","/product/reseller_admin"].map((p)=>({url:s+p,lastModified:new Date(),changeFrequency:p?"weekly":"daily",priority:p?0.8:1}))}
