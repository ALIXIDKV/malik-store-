# Revisi 2C.1 + Tahap 2C.2

## Revisi 2C.1 — posisi animasi tema
`components/theme/theme-toggle.tsx` + `app/globals.css` (blok `.mt-*`): stage 44x28px dipasang `absolute right-full` di container tombol (`relative`), tengah vertikal; pintu ±11px di kiri tombol. Karakter keluar -> jalan 11px -> menekan -> kembali -> pintu hilang (1,9 dtk). Tidak lagi di bawah header. Tema berubah langsung saat klik; reduced-motion melewati animasi. `header.tsx`: jarak link desktop -> tombol tema diperlebar (`mr-12`) agar stage tidak menimpa link "Tentang".

## 2C.2
1. Bubble nav: `components/navigation/mobile-bottom-nav.tsx`. Menu tetap dari `itemsFor(role)` (tidak ada angka hardcode); lebar bubble = 1/jumlah menu. Spring 300ms (CSS), tekan ikon scale-down, bubble pindah lebih awal saat tab diketuk. `--nav-h` kini 5,5rem (+1,5rem ruang bubble) sehingga composer chat tidak tertutup; keyboard terbuka tetap menyembunyikan nav.
2. Tombol: `components/ui/button.tsx` (transisi 200ms warna/bayangan/skala; tanpa efek saat disabled/aria-busy; tanpa angkat/gerak besar). Link ikon header ikut `active:scale-95`.
3. Loading fullscreen: tidak ditemukan di ZIP ini (tidak ada overlay/splash; `loading.mp4` tidak dirujuk kode). `loading.tsx` per-segment adalah skeleton inline di bawah header, dipertahankan.
4. Aset: `lib/assets.ts` (logo, popup, favicon, OG), `components/ui/safe-image.tsx` (tanpa gambar rusak), dipakai di `app/layout.tsx`, `app/manifest.ts`, `components/store/header.tsx`. Tidak ada popup baru; tidak ada file aset dihapus.

Tidak disentuh: order, auth, Supabase, SQL/RLS, chat (logika), hero video, dependency.
