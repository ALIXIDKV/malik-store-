Saya tidak akan mengubah trigger harga lama. Voucher akan saya taruh di trigger baru terpisah. Saya baca dulu bagian SQL dan komponen yang akan terdampak.

Audit selesai. Sekarang saya tulis migration voucher sebagai file terpisah.

Migration selesai. Sekarang sisi aplikasi: tipe, helper, alur order (perubahan kecil), form checkout, dan halaman admin.

Sekarang komponen admin voucher, halaman, dan menu admin.

Saya sedang merapikan hasil akhir: menyimpan catatan proyek, lalu mengirim ZIP.

Sistem voucher sudah selesai ditulis dan dikemas di `malik-store_v3_voucher.zip`, tetapi belum diuji. Di lingkungan saya `npm install` gagal karena tidak ada jaringan dan tidak ada PostgreSQL, jadi build dan tes SQL belum jalan. Itu perlu Anda jalankan sendiri.

**Trigger lama tidak disentuh**
- Trigger harga (`zy_malik_apply_catalog_price`), trigger meta order (`zz_malik_order_meta`), `malik_protect_order`, auth, dan tabel `profiles` tidak diubah sama sekali.
- Voucher memakai trigger baru `zzz_malik_apply_voucher` pada `orders`. Trigger ini berjalan paling akhir, jadi `unit_price`, `qty`, dan `product_key` tetap dihitung dari harga katalog sebelum diskon.
- Order tanpa kode voucher hanya mengosongkan kolom voucher dan memberi `discount_amount = 0`. `price` tidak disentuh, sehingga hasilnya sama seperti sebelumnya.

**Migration dan keamanan**
- File migration baru adalah `supabase/migrations/20261013_vouchers.sql`. Jalankan manual di Supabase setelah `20261011`; migration ini aman dijalankan ulang.
- Isinya tabel `vouchers` dengan semua kolom yang Anda minta. Hanya admin yang bisa membaca atau mengubah tabel ini, dan tidak ada hapus (voucher dinonaktifkan saja).
- `orders` mendapat tiga kolom tambahan dengan default aman: `voucher_id`, `voucher_code`, `discount_amount`.
- Saat order disimpan, database menghitung ulang subtotal dari katalog, lalu memeriksa kode, status aktif, expired, kuota, dan minimal pembelian. Harga dari browser tidak dipercaya.
- Kuota dihitung atomik, jadi dua order bersamaan tidak bisa melewati batas. Retry dengan id order yang sama tidak menghitung dua kali.
- Role tetap hanya `user` dan `admin`; semua izin admin memakai `malik_is_admin()` yang sudah ada.

**Aplikasi**
- Admin punya halaman baru `/admin/vouchers` untuk buat, lihat, edit, dan aktif/nonaktif, plus menu "Voucher".
- Checkout dapat kolom "Kode voucher (opsional)" dengan tombol "Pakai" untuk preview. Angka final tetap ditentukan database saat order disimpan.
- Perubahan kecil lain ada di `order-flow.ts`, `order-success.tsx`, dan `order-table.tsx`.
- Aturan yang saya pilih: persen hanya 1–99, dan voucher ditolak jika total order jadi nol.

**Yang perlu Anda lakukan**
1. Jalankan migration, lalu `npm install` dan `npm run build`.
2. Jalankan test login (user, admin, user buka `/admin`) dan test voucher (valid, salah, expired, limit, tanpa voucher, dengan voucher). Skenario SQL untuk staging ada di bagian bawah file migration.

**Risiko**
- Belum ada batas pemakaian per user; satu user bisa memakai kode yang sama berulang sampai kuota global habis.
- Preview voucher belum dibatasi laju, jadi kode bisa ditebak.
- `PROJECT_UPDATE_LOG.md` tidak ada di zip yang saya terima. Saya buat ulang dan isinya hanya Tahap 2, jadi tolong gabungkan dengan log Tahap 1 Anda.

Menambah CHECK constraint `role in ('user','admin')` pada `profiles.role` belum saya kerjakan karena menyentuh tabel `profiles`. Mau saya tambahkan?