/**
 * Referensi aset terpusat (Tahap 2C.2). Ganti file/URL di SINI saja; seluruh situs mengikuti.
 * Semua path menunjuk ke public/assets/. File lama tidak dihapus. Aset opsional (popup) hanya
 * dirujuk lewat <SafeImage> / ASSET_FALLBACK sehingga tidak ada gambar rusak bila filenya belum ada.
 */
export const ASSETS = {
  logo: "/assets/image/profile.jpg",
  popup: "/assets/image/popup.jpg", // opsional: belum dipakai UI mana pun (tidak ada popup baru)
  ogImage: "/assets/image/og-image.jpg",
  favicon: {
    ico: "/favicon.ico",
    png32: "/assets/image/favicon-32.png",
    png192: "/assets/image/favicon-192.png",
    png512: "/assets/image/favicon-512.png",
    appleTouch: "/assets/image/apple-touch-icon.png",
  },
} as const;

/** Cadangan bila aset gagal dimuat: logo -> inisial teks, popup/OG -> tidak ditampilkan. */
export const ASSET_FALLBACK = { logoInitial: "M" } as const;
