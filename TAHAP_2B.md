# Tahap 2B — Product Management

## Ringkasan
- **Kelola Produk (admin)**: 1 produk = 1 card ringkas (nama, status, jumlah varian, harga mulai). Tap card untuk membuka editor: nama, deskripsi, daftar varian (nama, harga, saklar aktif), tombol *Tambah varian*, *Simpan perubahan*, *Nonaktifkan/Aktifkan produk*. Tombol utama **Tambah Produk** membuka modal (bottom sheet di HP).
- **Sumber data**: Supabase (`product_catalog_groups`, `product_catalog`). Penulisan lewat client Supabase + RLS admin, tanpa service role.
- **Produk baru** disimpan lewat satu RPC atomik (`malik_admin_create_product`): produk + semua varian tersimpan bersamaan atau tidak sama sekali, jadi tidak ada produk setengah jadi (lihat Revisi di bawah).
- **Nonaktifkan produk** memakai kolom `archived` yang sudah ada (order/chat/ulasan lama tetap aman, order baru ditolak database).
- **order_name** (nama produk di tabel orders) dibuat database: `NAMA PRODUK - NAMA VARIAN` huruf besar, terkunci setelah dibuat. SC OURIN DELUXE: `SC OURIN DELUXE - NO UPDATE`, `... - 3X UPDATE`, `... - FULL UPDATE`, `... - RESELLER`.

## Wajib dijalankan manual (urut, idempotent)
1. `supabase/migrations/20261010_product_management.sql`
2. `supabase/migrations/20261011_order_price_validation.sql`
3. `supabase/migrations/20261012_create_product_atomic.sql`

## File
Baru: `lib/catalog-admin.ts`, `supabase/migrations/20261010_product_management.sql`, `TAHAP_2B.md`.
Diubah: `components/admin/product-admin.tsx` (ditulis ulang), `app/(admin)/admin/products/page.tsx`, `lib/catalog.ts`, `app/(public)/page.tsx`, `app/sitemap.ts`, `supabase/README.md`.

## Revisi 2B (3 perbaikan)
1. **Migrasi reviews**: tidak lagi menghapus semua CHECK yang menyebut `product_key`. Hanya whitelist lama (persis `panel`, `sewa_bot`, `reseller_admin`, satu kolom) diganti cek bentuk kode `^[a-z0-9][a-z0-9_]{1,39}$`. Ada cek skema di awal; constraint tak dikenal yang tampak whitelist menghentikan migrasi dengan error jelas.
2. **Harga order**: `malik_apply_catalog_price()` menolak produk tak dikenal / nonaktif / diarsipkan, mengisi ulang `price` dari katalog (x qty 1-99), menormalkan nama produk. Retry dengan id order yang sama tetap ditolak primary key (23505) sehingga klien memakai order yang sudah ada.
3. **Add Product**: `createProduct()` memanggil RPC atomik (timeout 20 dtk). Gagal = tidak ada yang tersimpan. Retry (tombol Simpan produk) memakai varian id deterministik; bila ternyata sudah tersimpan identik, RPC mengembalikannya tanpa duplikat. Sisa produk setengah jadi dari versi lama (nonaktif) dipulihkan lewat kartu produk: Tambah varian, lalu Aktifkan produk.
File revisi: `supabase/migrations/20261010_product_management.sql`, `20261011_order_price_validation.sql` (baru), `20261012_create_product_atomic.sql` (baru), `lib/catalog-admin.ts`, `components/admin/product-admin.tsx`, `supabase/README.md`, `TAHAP_2B.md`.
