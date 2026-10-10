# Tahap 2A — UX Improvement

Perubahan hanya UI/UX; tidak ada migrasi SQL, dependency baru, atau perubahan logika order/auth/chat.

1. **Order success** — `components/dashboard/order-success.tsx` (baru), `order-form.tsx`, animasi di `app/globals.css`.
   Konfirmasi hanya tampil setelah order tersimpan DAN pesan chat + instruksi pembayaran terkirim. Jika sinkron chat gagal, form + tombol "Kirim ulang pesan" tetap seperti Tahap 1.
2. **Profil** — `components/dashboard/profile-form.tsx`, `app/(user)/dashboard/profile/page.tsx`.
   Foto dikompres di browser (persegi, maks 256px, JPEG) agar lolos batas 60.000 karakter trigger `malik_profile_guard`.
3. **Admin chat** — `components/admin/admin-chat.tsx`, `components/admin/use-viewport-box.ts` (baru), `app/(admin)/admin/chat/page.tsx`.
   Daftar percakapan kini dibangun dari pesan (bukan irisan pesan x profil) sehingga "Belum ada percakapan" tidak muncul palsu.
