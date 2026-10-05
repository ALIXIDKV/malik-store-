"use client";
import Image from "next/image";
import { useState } from "react";

/**
 * Lampiran chat (URL Cloudinary dari /api/upload-chat).
 * Gambar diminta dalam versi ringan lewat transformasi URL Cloudinary (f_auto,q_auto, lebar maks 800px),
 * dilayani langsung oleh Cloudinary (unoptimized: tidak lewat optimizer Next, jadi tanpa remotePatterns).
 * Jika transformasi ditolak (mis. "strict transformations" aktif di akun Cloudinary), otomatis kembali ke URL asli.
 */
const CLD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/;
function lightUrl(url: string) {
  const m = CLD.exec(url);
  return m ? `${m[1]}f_auto,q_auto,w_800,c_limit/${m[2]}` : url;
}

export function ChatAttachment({ url, type }: { url: string | null; type: "image" | "video" | null }) {
  const [fallback, setFallback] = useState(false);
  if (!url) return null;
  if (type === "image") {
    return (
      <Image
        src={fallback ? url : lightUrl(url)}
        alt="Lampiran gambar"
        width={640}
        height={640}
        unoptimized
        loading="lazy"
        onError={() => setFallback(true)}
        className="mt-2 h-auto max-h-64 w-auto max-w-full rounded-lg"
      />
    );
  }
  if (type === "video") {
    return <video controls playsInline preload="metadata" src={url} className="mt-2 max-h-64 max-w-full rounded-lg" />;
  }
  return null;
}
