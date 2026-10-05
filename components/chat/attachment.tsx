import Image from "next/image";

/**
 * Lampiran chat (URL Cloudinary dari /api/upload-chat).
 * Dimensi asli tidak diketahui, jadi gambar dirender `unoptimized` (dilayani langsung oleh Cloudinary,
 * tidak lewat optimizer Next) dengan ukuran natural yang dibatasi lewat CSS. Dengan begitu tidak perlu
 * remotePatterns/next.config dan perilaku tampilannya sama dengan <img> sebelumnya.
 */
export function ChatAttachment({ url, type }: { url: string | null; type: "image" | "video" | null }) {
  if (!url) return null;
  if (type === "image") {
    return (
      <Image
        src={url}
        alt="Lampiran gambar"
        width={640}
        height={640}
        unoptimized
        className="mt-2 h-auto max-h-64 w-auto max-w-full rounded-lg"
      />
    );
  }
  if (type === "video") {
    return <video controls playsInline preload="metadata" src={url} className="mt-2 max-h-64 max-w-full rounded-lg" />;
  }
  return null;
}
