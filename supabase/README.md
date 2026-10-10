# Supabase — Malik Store

## Isi folder

| Path | Fungsi |
|---|---|
| `master_setup.sql` | Schema FINAL untuk instalasi **baru**: tabel, fungsi, trigger, view, RLS, grant, policy, seed katalog |
| `migrations/` | Migrasi BARU (setelah master). Dijalankan MANUAL, tidak pernah otomatis |
| `migrations-archive/` | 11 migration lama (`01`–`11`, urut sesuai waktu pembuatan). Hanya riwayat/referensi |

## Aturan

1. **`master_setup.sql` hanya untuk Supabase project BARU / kosong.**
   Di awal file ada guard: kalau tabel `profiles` / `orders` / `messages` sudah ada, script langsung batal dan tidak mengubah apa pun.
2. **Production sekarang TIDAK perlu menjalankan `master_setup.sql`.** Production sudah memakai schema yang sama hasil migration lama.
3. **`migrations-archive/` jangan dijalankan ulang** (tidak ada urutan/idempotensi yang dijamin untuk database baru, dan beberapa isinya sudah digantikan migration yang lebih baru).
4. **Setiap perubahan database berikutnya = file migration baru**, bukan edit `master_setup.sql` saja:
   - Buat `supabase/migrations/YYYYMMDD_nama_perubahan.sql` (aman dijalankan ulang: `if not exists`, `create or replace`, `drop ... if exists`).
   - Jalankan di production (Supabase > SQL Editor).
   - Terapkan perubahan yang sama ke `master_setup.sql` agar instalasi baru tetap sama dengan production.

## Instalasi project baru

1. Supabase > SQL Editor > jalankan seluruh `master_setup.sql` sekali.
2. Daftar akun lewat website, lalu jadikan admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'EMAIL_ADMIN_ANDA';
   ```
3. Isi environment variable di Vercel (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CLOUDINARY_*` — lihat `ATTACHMENT_SETUP.md`) lalu redeploy.

## Yang perlu dicocokkan dengan production

Tabel dasar `profiles`, `orders`, `messages`, `announcements` dulu dibuat lewat dashboard, **tidak ada di migration manapun**. Bagian ini di `master_setup.sql` ditandai `[DISIMPULKAN]` (dirumuskan dari pemakaian di kode): definisi kolom, trigger pembuat profil otomatis (`malik_handle_new_user`), policy dasar `select`/`insert`/`update`, dan publication Realtime.

Sebelum master dipakai untuk project penting, bandingkan dengan production (hanya membaca):

```
supabase db dump --schema public --linked -f production_schema.sql
```

Index tambahan atau kolom lain yang pernah dibuat manual di dashboard tidak terbawa jika tidak ada di migration.

## Sengaja tidak dibawa ke master

- `malik_ops.policy_backup` — artefak sekali-jalan dari `08_security_cleanup.sql`.
- `malik_catalog_sync_legacy` dan tabel lama `public.products` — digantikan `product_catalog`.
- Harga seed katalog adalah harga awal; harga yang sudah diubah admin di production tidak ikut.

## Migrasi tertunda (belum dijalankan)

| File | Isi | Wajib? |
|---|---|---|
| `migrations/20261010_order_message_idempotency.sql` | Fungsi `malik_send_order_message` (baru) + `malik_send_payment_message` diberi advisory lock per order, agar pesan order/pembayaran tidak bisa dobel walau request sebelumnya ternyata berhasil, klik ganda, atau dua tab | Disarankan. Aplikasi tetap jalan tanpanya (jalur cadangan di client, tidak atomik) dan otomatis memakai fungsi baru setelah migrasi dijalankan |

Tidak mengubah tabel, kolom, policy RLS, maupun data. Aman dijalankan ulang. Jalankan di staging dulu bila ada.
