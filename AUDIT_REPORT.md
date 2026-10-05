# Audit fungsional Malik Store V2 (5 Okt 2026)

Build: `npm install` GAGAL di sandbox audit (registry npm 403), sehingga `npm run build`, `lint`, dan typecheck penuh BELUM dijalankan.
Hanya pemeriksaan sintaks TypeScript (tsc 6.0.3, tanpa tipe library) yang bersih. Jalankan `npm install && npm run build && npm run lint` sebelum deploy.

## Perbaikan
- middleware.ts: `getUser()` dibungkus try/catch (Supabase tidak terjangkau tidak lagi membuat semua halaman 500).
- lib/auth.ts: error baca profil dicatat (sebelumnya ditelan).
- API register/send-code/delete-user: body JSON rusak -> 400 (sebelumnya 500); register: status 500 untuk kegagalan createUser non-duplikat, error upsert profil dicatat.
- API upload-chat: 401 tanpa sesi, 415 tipe tidak didukung, 413 terlalu besar (cek Content-Length sebelum membaca body).
- /account: user yang sudah login diarahkan ke /admin atau ?next (aman, tanpa loop); pesan error login diterjemahkan, tidak membocorkan pesan mentah.
- /dashboard: parameter ?order=&variant= dari halaman produk sekarang dibaca (sebelumnya diabaikan); tombol Riwayat ditambahkan (di mobile riwayat/ulasan tidak punya jalan masuk); error katalog ditampilkan.
- Halaman produk & home: link Order/Hubungi admin untuk visitor mengarah ke /account?next=... agar tujuan tidak hilang.
- OrderForm: jeda 2,5 dtk setelah sukses (anti order dobel), router.refresh, info "buka chat", pesan jika varian kosong.
- Chat user: scroll ke pesan terbaru, pesan sendiri langsung tampil tanpa menunggu Realtime, batas 4 MB di sisi client, empty state. Query memuat 300 pesan TERBARU (sebelumnya 300 terlama).
- Chat admin: 2000 pesan TERBARU (sebelumnya terlama), tandai terbaca saat thread dibuka (counter "Pesan belum dibaca" sebelumnya tidak pernah turun), pesan terkirim langsung tampil, state lokal setelah hapus chat.
- Admin order/produk: verifikasi baris benar-benar berubah (RLS bisa menolak tanpa error), validasi label/harga sesuai guard DB.
- Profil: validasi nama 2-40; avatar dibatasi ~40 KB dan JPG/PNG/WebP (guard DB menolak data URL > 60000 karakter, batas lama 700 KB pasti gagal).
- sitemap.ts: produk diambil dari katalog (sebelumnya hardcode); manifest: ikon PNG 192/512 ditambahkan.
- .env.example: SUPABASE_URL (opsional) ditambahkan.

## Tidak diubah (disengaja)
Supabase URL/key/env, schema, RLS, migration, data, folder legacy/, desain UI.

## Catatan untuk keputusan Anda (bukan bug yang diubah)
- Policy `malik_msg_update_own` / `malik_msg_delete_own` di master_setup.sql memungkinkan user mengubah/menghapus pesan miliknya sendiri (termasuk isi pesan). Perlu dicek di production apakah memang diinginkan; kalau tidak, perlu migration SQL baru (tidak dijalankan).
- master_setup.sql membatasi reviews.product_key ke 3 nilai tetap; produk baru di katalog tidak bisa diulas sebelum constraint itu diubah.
