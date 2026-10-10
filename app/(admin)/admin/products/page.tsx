import { requireAdmin } from "@/lib/auth";
import { ProductAdmin } from "@/components/admin/product-admin";
import { loadCatalog } from "@/lib/catalog";

export default async function Products() {
  const { supabase } = await requireAdmin();
  // includeArchived: produk yang dinonaktifkan tetap tampil di admin supaya bisa diaktifkan lagi.
  const cat = await loadCatalog(supabase, { includeArchived: true });
  return (
    <main className="page">
      <div className="shell max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold">Kelola Produk</h1>
        <p className="mb-5 text-sm text-zinc-500">Tambah produk, ubah nama, deskripsi, varian, dan harga. Perubahan langsung tampil di katalog.</p>
        {cat.status === "query_error" || cat.status === "env_missing"
          ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-red-400">Katalog tidak dapat dimuat. Muat ulang halaman, atau periksa koneksi Supabase.</p>
          : <ProductAdmin groups={cat.groups} variants={cat.variants} />}
      </div>
    </main>
  );
}
