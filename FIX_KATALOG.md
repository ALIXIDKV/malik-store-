# Fix katalog kosong (Malik Store V2)

Root cause (kode):
1. app/(public)/page.tsx memakai `revalidate=60` + `cookies()` di dalam `try{}catch{}` kosong -> bailout dynamic Next.js tertelan, error Supabase juga tertelan, `{error}` hasil query tidak pernah dicek -> grup kosong -> fallback "Katalog membutuhkan koneksi Supabase."
2. Semua query katalog memakai `.eq("archived", false)`. Bila production belum menjalankan migration 11 (kolom `archived`), query error 42703 dan hasilnya kosong. Versi legacy menangani ini dengan retry tanpa kolom tersebut; versi Next.js tidak.

Perubahan: lib/catalog.ts (baru), app/(public)/page.tsx, app/(public)/product/[key]/page.tsx, app/(user)/dashboard/page.tsx, app/(admin)/admin/products/page.tsx, lib/supabase/admin.ts (SUPABASE_URL sebagai fallback).
Tidak ada perubahan schema/SQL/RLS. Cek Vercel Runtime Logs: prefix `[catalog]`.
