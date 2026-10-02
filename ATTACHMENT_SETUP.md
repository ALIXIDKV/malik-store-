# Attachment Chat (Cloudinary) - Setup

## 1. Environment Variable Vercel
Vercel > Project > Settings > Environment Variables (Production + Preview), lalu **Redeploy**:

| Nama | Isi |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud name dari Cloudinary Dashboard |
| `CLOUDINARY_API_KEY` | API Key |
| `CLOUDINARY_API_SECRET` | API Secret (hanya dibaca di `api/upload-chat.js`, server) |

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah ada (dipakai fitur OTP/hapus user) dan dipakai juga untuk memverifikasi login.

## 2. Database
Jalankan `supabase_attachment_migration.sql` di Supabase > SQL Editor (sekali, aman diulang).
Hanya menambah 2 kolom nullable `attachment_url`, `attachment_type` + constraint agar hanya URL Cloudinary yang bisa tersimpan. Policy RLS tidak berubah.

## 3. Deploy
Upload semua file ke repo/Vercel. Tidak ada dependency baru (memakai `fetch`/`FormData` bawaan Node 22).

## Alur
Pilih file -> validasi -> foto dikompres di browser (maks sisi 1600px) -> preview -> `POST /api/upload-chat`
-> server cek login + isi file -> upload signed ke Cloudinary -> URL dikembalikan -> disimpan ke `messages` -> bubble menampilkan preview.

## Batas & aturan
- Foto: JPG/PNG/WebP, pilih hingga 15 MB (dikompres otomatis, hasil < 4 MB).
- Video: MP4/WebM/MOV, **maks 4 MB** (batas body Vercel Function 4,5 MB; video tidak bisa dikompres di browser).
- 10 upload/menit per user.
- Tampilan ringan: foto dimuat `loading="lazy"` dengan transformasi Cloudinary (480px, auto format/kualitas); video `preload="none"` dengan poster.

## File
Baru: `api/upload-chat.js`, `js/chat-attach.js`, `css/chat-attach.css`, `supabase_attachment_migration.sql`
Diubah: `account/dashboard/chat.html`, `admin/chat.html`, `admin/js/admin.js`
Tidak diubah: `auth.js`, `supabase.js`, `products.js`, `vercel.json`, `package.json`
