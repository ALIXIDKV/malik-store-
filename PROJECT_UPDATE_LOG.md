# PROJECT UPDATE LOG - Malik Store V3

> Catatan: file ini tidak ada di malik-store_v3.zip yang diterima, jadi dibuat ulang dan hanya berisi Tahap 2.
> Gabungkan dengan log Tahap 1 milik Anda.

## Tahap 2 - Audit Role + Sistem Voucher (12 Okt 2026)

### Perubahan role
- TIDAK ADA perubahan. Role tetap hanya `user` dan `admin`; tidak ada role baru; pengecekan `role === "admin"` dipertahankan.
- Hasil audit: `lib/auth.ts` (`requireAdmin` / `requireUser`), `app/(admin)/admin/layout.tsx`, `app/api/delete-user/route.ts`,
  fungsi SQL `malik_is_admin()`, RLS semua tabel, trigger `malik_protect_profile` (user tidak bisa menaikkan role),
  trigger `aa_malik_block_admin_order` (admin tidak bisa order). `middleware.ts` hanya me-refresh sesi.
- Catatan (belum diubah, perlu persetujuan): `profiles.role` belum punya CHECK constraint `role in ('user','admin')`.

### Perubahan database (supabase/migrations/20261013_vouchers.sql, dijalankan MANUAL, idempotent)
- Tabel baru `vouchers` (RLS: hanya admin; tanpa policy DELETE; `used_count`/`created_by` tidak bisa ditulis dari client).
- Kolom baru di `orders` (aditif): `voucher_id`, `voucher_code`, `discount_amount` (default 0). Data lama tidak berubah.
- Fungsi baru: `malik_catalog_subtotal`, `malik_voucher_calc`, `malik_preview_voucher`, `malik_apply_voucher`, `malik_voucher_normalize`.
- Trigger baru `zzz_malik_apply_voucher` (BEFORE INSERT orders, berjalan setelah trigger lama).
- TIDAK diubah: `malik_apply_catalog_price` / `zy_...`, `malik_order_meta` / `zz_...`, `malik_protect_order`, auth, tabel profiles, master_setup.sql.

### File aplikasi yang berubah
- Baru: `lib/vouchers.ts`, `components/admin/voucher-admin.tsx`, `app/(admin)/admin/vouchers/page.tsx`, migration di atas, file log ini.
- Diubah kecil: `types/database.ts` (tipe Voucher + field opsional di Order), `lib/order-flow.ts` (createOrder menerima `voucher` opsional;
  buildOrderText menambah baris voucher hanya jika ada diskon), `components/dashboard/order-form.tsx` (input kode voucher + preview),
  `components/dashboard/order-success.tsx` (baris voucher bila ada), `components/admin/order-table.tsx` (label voucher), `components/admin/nav.tsx` (menu Voucher).

### Fitur voucher
- Admin: buat, lihat, edit, aktif/nonaktif (tipe persen 1-99 atau nominal; minimal pembelian; expired; batas penggunaan).
- Customer: isi kode di checkout (opsional), tombol "Pakai" menampilkan preview; angka final dihitung database saat order disimpan.
- Server/database memvalidasi: kode, aktif, expired, kuota (atomik, baris dikunci), minimal pembelian, subtotal dari katalog (bukan harga browser).
- Order tanpa voucher: trigger baru hanya mengosongkan kolom voucher; `price` tidak disentuh.

### Hasil testing
- Belum dijalankan: lingkungan penyusun tidak punya akses jaringan (npm install gagal) maupun PostgreSQL, jadi
  `npm run build` dan tes SQL belum bisa dieksekusi. Skenario uji ada di bagian bawah migration (staging) dan daftar berikut.
- Yang HARUS dites setelah migration dijalankan: login user, login admin, user buka /admin (harus dialihkan), admin buka dashboard;
  voucher valid, salah, expired, melewati limit, checkout tanpa voucher, checkout dengan voucher; `npm run build`.

### Risiko
- Belum ada batas pemakaian per user: satu user bisa memakai kode yang sama berulang sampai kuota global habis.
- RPC preview bisa dipakai menebak kode (belum ada rate limit); pesan "tidak ditemukan" dan "expired" berbeda.
- Jika migration belum dijalankan: checkout tanpa voucher tetap normal, tetapi halaman /admin/vouchers menampilkan pesan tabel belum ada,
  dan order dengan voucher ditolak oleh database.
- Voucher yang tersimpan di order tidak ikut berubah bila voucher diedit kemudian (nilai diskon tersimpan di `discount_amount`).

## Tahap 3 - Chat Mobile + Composer (12 Okt 2026)

### Perubahan
- Bug chat customer di Android Chrome: panel chat sekarang `fixed` di bawah header dengan tinggi mengikuti `visualViewport`
  (via `useViewportBox`), hanya daftar pesan yang scroll, composer selalu di atas keyboard / bottom nav. Desktop (md+) memakai layout lama.
- `useViewportBox` dibuat generik: parameter opsional `topEdge` (fungsi pengembali elemen sticky di atas panel). Selector navigasi admin
  dipindah dari dalam hook ke `admin-chat.tsx`; perilaku chat admin tidak berubah.
- Composer baru (`components/chat/composer.tsx`): textarea auto-resize (1 sampai ~5 baris), tombol "Kirim" dengan status "Mengirim..." + spinner,
  tombol dinonaktifkan saat kosong/mengirim. Enter = baris baru (kirim lewat tombol). Tombol lampiran tidak berubah.
- Judul "Chat Admin" disembunyikan di HP (panel fixed menutupinya; bottom nav sudah berlabel Chat).

### File berubah
- Baru: `components/chat/composer.tsx`
- Diubah: `components/dashboard/chat.tsx` (hanya JSX/layout + scroll; logic realtime/sync/upload/kirim tidak diubah),
  `components/admin/use-viewport-box.ts`, `components/admin/admin-chat.tsx` (1 konstanta + 1 argumen), `app/globals.css` (aturan `.chat-panel` di HP),
  `app/(user)/dashboard/chat/page.tsx` (1 class)
- TIDAK disentuh: voucher, order, auth, role, database, API.

### Bug yang diperbaiki
- Input chat tertinggal / tertutup keyboard saat scroll di Android Chrome (chat customer).

### Dampak
- Perilaku Enter di chat customer berubah: dulu mengirim, sekarang baris baru (sesuai permintaan).
- Rollback: kembalikan 5 file yang diubah dan hapus `composer.tsx`.

### Hasil testing
- Belum dijalankan: lingkungan penyusun tanpa jaringan (npm install/build tidak bisa); hanya cek sintaks TypeScript pada file yang diubah.
- WAJIB dites di perangkat: Android Chrome (keyboard buka, scroll, kirim pendek/panjang, lampiran), checkout tanpa/dengan voucher, login admin, `npm run build`.
